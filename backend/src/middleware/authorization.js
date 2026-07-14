import { all } from '../db/client.js';

function denied(message = 'Voce nao possui permissao para executar esta operacao.') {
  return Object.assign(new Error(message), { status: 403, code: 'FORBIDDEN' });
}

function authenticatedUserId(req) {
  const value = Number(req.user?.sub);
  if (!Number.isInteger(value) || value <= 0) {
    throw Object.assign(new Error('Identidade autenticada invalida.'), {
      status: 401,
      code: 'INVALID_IDENTITY',
    });
  }
  return value;
}

export async function loadPrincipal(req) {
  if (req.principal) return req.principal;
  const userId = authenticatedUserId(req);
  const rows = await all(
    `SELECT u.id,u.nome,u.email,u.perfil,u.ativo,u.session_version,
            uc.colaborador_id,
            COALESCE(array_agg(pp.permissao) FILTER (WHERE pp.permissao IS NOT NULL),'{}') AS permissoes
       FROM usuarios u
       LEFT JOIN usuarios_colaboradores uc ON uc.usuario_id=u.id
       LEFT JOIN perfis_permissoes pp ON pp.perfil=u.perfil
      WHERE u.id=?
      GROUP BY u.id,uc.colaborador_id`,
    [userId],
  );
  const row = rows[0];
  if (!row || !row.ativo) {
    throw Object.assign(new Error('Sessao revogada ou usuario inativo.'), {
      status: 401,
      code: 'SESSION_REVOKED',
    });
  }
  if (Number(req.user?.sv ?? 1) !== Number(row.session_version)) {
    throw Object.assign(new Error('Sessao revogada. Autentique-se novamente.'), {
      status: 401,
      code: 'SESSION_REVOKED',
    });
  }
  req.principal = {
    userId,
    name: String(row.nome),
    email: String(row.email),
    role: String(row.perfil),
    collaboratorId: row.colaborador_id == null ? null : Number(row.colaborador_id),
    permissions: new Set(row.permissoes ?? []),
  };
  return req.principal;
}

export function authorize(...requiredPermissions) {
  return async (req, res, next) => {
    try {
      const principal = await loadPrincipal(req);
      if (!requiredPermissions.some((permission) => principal.permissions.has(permission))) {
        throw denied();
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function authorizeAll(...requiredPermissions) {
  return async (req, res, next) => {
    try {
      const principal = await loadPrincipal(req);
      if (!requiredPermissions.every((permission) => principal.permissions.has(permission))) {
        throw denied();
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function bindOwnCollaborator(permission = 'time.self', field = 'colaboradorId') {
  return async (req, res, next) => {
    try {
      const principal = await loadPrincipal(req);
      if (!principal.permissions.has(permission) || principal.collaboratorId == null) {
        throw denied('Usuario sem vinculo de colaborador ativo para esta operacao.');
      }
      req.body = { ...(req.body ?? {}), [field]: principal.collaboratorId };
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function scopeOwnCollaborator(permission, location = 'query', field = 'colaboradorId') {
  return async (req, res, next) => {
    try {
      const principal = await loadPrincipal(req);
      if (principal.permissions.has(permission)) return next();
      if (principal.collaboratorId == null) throw denied();
      req[location] = { ...(req[location] ?? {}), [field]: String(principal.collaboratorId) };
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function authorizeSelfOr(permission, location = 'params', field = 'colaboradorId') {
  return async (req, res, next) => {
    try {
      const principal = await loadPrincipal(req);
      const requestedId = Number(req[location]?.[field]);
      const own = Number.isInteger(requestedId) && requestedId === principal.collaboratorId;
      if (!own && !principal.permissions.has(permission)) throw denied();
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function authorizeOwnPayslipOr(permission) {
  return async (req, res, next) => {
    try {
      const principal = await loadPrincipal(req);
      if (principal.permissions.has(permission)) return next();
      if (principal.collaboratorId == null) throw denied();
      const rows = await all(
        'SELECT 1 FROM contracheques WHERE id=? AND colaborador_id=? LIMIT 1',
        [req.params.id, principal.collaboratorId],
      );
      if (!rows[0]) throw denied();
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function authorizeOwnPointOr(permission) {
  return async (req, res, next) => {
    try {
      const principal = await loadPrincipal(req);
      if (principal.permissions.has(permission)) return next();
      if (principal.collaboratorId == null) throw denied();
      const rows = await all(
        'SELECT 1 FROM pontos_registrados WHERE nsr=? AND colaborador_id=? LIMIT 1',
        [req.params.nsr, principal.collaboratorId],
      );
      if (!rows[0]) throw denied();
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireRole(...roles) {
  return async (req, res, next) => {
    try {
      const principal = await loadPrincipal(req);
      if (!roles.includes(principal.role)) throw denied();
      next();
    } catch (error) {
      next(error);
    }
  };
}
