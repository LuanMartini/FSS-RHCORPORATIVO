import bcrypt from 'bcryptjs';
import { getEnv } from '../config/env.js';
import * as authModel from '../models/auth.js';
import { signToken } from '../middleware/auth.js';
import { requiredString, validEmail, validate } from '../utils/validation.js';
import { loadPrincipal } from '../middleware/authorization.js';

export async function login(req, res, next) {
  try {
    const { email, senha } = req.body ?? {};
    const errors = validate([
      validEmail(email),
      requiredString(senha, 'Senha', 120),
    ]);
    if (errors) return res.status(400).json({ erro: errors[0], detalhes: errors });

    const u = await authModel.findUserByEmail(String(email).trim().toLowerCase());
    if (!u || !u.ativo || !(await bcrypt.compare(String(senha), u.senha_hash))) {
      return res.status(401).json({ erro: 'Credenciais invalidas' });
    }

    const permissions = await authModel.userPermissions(u.id);
    const token = signToken({ sub: u.id, email: u.email, sv: Number(u.session_version ?? 1) });
    res.json({
      token,
      expiresInSeconds: getEnv().jwtAccessTtlSeconds,
      usuario: { nome: u.nome, email: u.email, perfil: u.perfil, permissoes: permissions },
    });
  } catch (e) { next(e); }
}

export async function registrar(req, res, next) {
  try {
    if (getEnv().isProduction) return res.status(404).json({ erro: 'Rota nao encontrada' });

    const { nome, email, senha } = req.body ?? {};
    const errors = validate([
      requiredString(nome, 'Nome', 120),
      validEmail(email),
      requiredString(senha, 'Senha', 120),
      String(senha ?? '').length < 12 ? 'Senha deve ter no minimo 12 caracteres.' : '',
    ]);
    if (errors) return res.status(400).json({ erro: errors[0], detalhes: errors });

    const em = String(email).trim().toLowerCase();
    const senhaHash = await bcrypt.hash(String(senha), 12);
    await authModel.bootstrapAdministrator({ nome: String(nome).trim(), email: em, senhaHash });
    res.status(201).json({ ok: true });
  } catch (e) { next(e); }
}

export async function me(req, res, next) {
  try {
    const principal = await loadPrincipal(req);
    res.json({
      id: principal.userId,
      nome: principal.name,
      email: principal.email,
      perfil: principal.role,
      colaboradorId: principal.collaboratorId,
      permissoes: [...principal.permissions].sort(),
    });
  } catch (error) {
    next(error);
  }
}
