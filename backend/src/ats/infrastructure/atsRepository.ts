import { all, run, withTransaction } from '../../db/client.js';
import type { AtsStage, MoveCardInput, ParsedResume, MatchResult } from '../domain/types.js';

type Row = Record<string, unknown>;

function appError(message: string, status: number, code: string): Error {
  return Object.assign(new Error(message), { status, code });
}

export async function assertVacancyPermission(userId: number, vacancyId: number, write = false): Promise<Row> {
  const rows = await all(
    `SELECT rv.permissao, v.id, v.titulo FROM recrutadores_vagas rv
     JOIN vagas v ON v.id=rv.vaga_id WHERE rv.usuario_id=? AND rv.vaga_id=?`,
    [userId, vacancyId]
  ) as Row[];
  const permission = rows[0];
  if (!permission) throw appError('Voce nao possui acesso a esta vaga.', 403, 'ATS_FORBIDDEN');
  if (write && !['GESTOR', 'EDITOR'].includes(String(permission.permissao))) {
    throw appError('Sua permissao nesta vaga e somente leitura.', 403, 'ATS_READ_ONLY');
  }
  return permission;
}

export async function listVacancies(userId: number): Promise<Row[]> {
  return all(
    `SELECT v.id, v.titulo, v.descricao, v.status, v.modalidade, v.localizacao, v.requisitos,
      d.nome AS departamento, rv.permissao,
      COUNT(c.id)::int AS total_candidatos,
      COUNT(c.id) FILTER (WHERE k.etapa='CONTRATADO')::int AS contratados
     FROM recrutadores_vagas rv JOIN vagas v ON v.id=rv.vaga_id
     JOIN departamentos d ON d.id=v.departamento_id
     LEFT JOIN candidaturas c ON c.vaga_id=v.id
     LEFT JOIN candidaturas_status_kanban k ON k.candidatura_id=c.id
     WHERE rv.usuario_id=? GROUP BY v.id,d.nome,rv.permissao ORDER BY v.atualizado_em DESC,v.id DESC`,
    [userId]
  ) as Promise<Row[]>;
}

export async function listVacancyRecruiters(vacancyId:number):Promise<Row[]> {
  return all(
    `SELECT u.id,u.nome,u.email,rv.permissao,rv.criado_em FROM recrutadores_vagas rv
     JOIN usuarios u ON u.id=rv.usuario_id WHERE rv.vaga_id=? ORDER BY u.nome`,[vacancyId]
  ) as Promise<Row[]>;
}

export async function setVacancyRecruiter(vacancyId:number,targetUserId:number,permission:string):Promise<Row> {
  const rows=await all(
    `INSERT INTO recrutadores_vagas (vaga_id,usuario_id,permissao) VALUES (?,?,?)
     ON CONFLICT (vaga_id,usuario_id) DO UPDATE SET permissao=EXCLUDED.permissao RETURNING *`,
    [vacancyId,targetUserId,permission]
  ) as Row[];
  return rows[0] as Row;
}

export async function getVacancy(vacancyId: number): Promise<Row | null> {
  const rows = await all(`SELECT v.*, d.nome AS departamento FROM vagas v JOIN departamentos d ON d.id=v.departamento_id WHERE v.id=?`, [vacancyId]) as Row[];
  return rows[0] ?? null;
}

export async function getBoard(vacancyId: number): Promise<Row[]> {
  return all(
    `SELECT c.id AS candidatura_id, c.vaga_id, c.match_score, c.match_detalhes, c.origem,
      c.responsavel_id, c.aplicada_em, p.id AS candidato_id, p.nome, p.email, p.telefone,
      p.headline, p.localizacao, p.skills, p.experiencias, p.idiomas, p.educacao,
      k.etapa, k.posicao, k.versao, k.bloqueado_por, k.bloqueado_ate,
      u.nome AS bloqueado_por_nome,
      (SELECT COUNT(*)::int FROM mensagens_chat m WHERE m.candidatura_id=c.id) AS mensagens,
      (SELECT MIN(a.inicio_em) FROM agenda_entrevistas a WHERE a.candidatura_id=c.id AND a.status IN ('AGENDADA','CONFIRMADA','PENDENTE_SINCRONIZACAO') AND a.inicio_em>=now()) AS proxima_entrevista
     FROM candidaturas c JOIN candidatos_perfil p ON p.id=c.candidato_perfil_id
     JOIN candidaturas_status_kanban k ON k.candidatura_id=c.id
     LEFT JOIN usuarios u ON u.id=k.bloqueado_por AND k.bloqueado_ate>now()
     WHERE c.vaga_id=? ORDER BY k.etapa,k.posicao,c.id`, [vacancyId]
  ) as Promise<Row[]>;
}

export interface CreateApplicationInput {
  vacancyId: number;
  userId: number;
  profile: ParsedResume;
  match: MatchResult;
  text: string;
  storageKey: string;
  sha256: string;
  mime: string;
  filename: string;
  portalTokenHash: string;
}

export async function createApplication(input: CreateApplicationInput): Promise<{ application: Row; profile: Row; previousStorageKey: string | null }> {
  return withTransaction(async (tx) => {
    const existingProfiles = await tx.all(
      `SELECT curriculo_storage_key FROM candidatos_perfil WHERE lower(email)=lower(?) FOR UPDATE`,
      [input.profile.email]
    ) as Row[];
    const previousStorageKey = String(existingProfiles[0]?.curriculo_storage_key ?? '') || null;
    const profileRows = await tx.all(
      `INSERT INTO candidatos_perfil
       (nome,email,telefone,localizacao,headline,skills,experiencias,idiomas,educacao,dados_extraidos,busca_texto,
        curriculo_storage_key,curriculo_sha256,curriculo_mime,curriculo_nome,atualizado_em)
       VALUES (?,?,?,?,?,?,?::jsonb,?::jsonb,?::jsonb,?::jsonb,?,?,?,?,?,now())
       ON CONFLICT (lower(email)) DO UPDATE SET
        nome=EXCLUDED.nome, telefone=COALESCE(EXCLUDED.telefone,candidatos_perfil.telefone),
        headline=COALESCE(EXCLUDED.headline,candidatos_perfil.headline), skills=EXCLUDED.skills,
        experiencias=EXCLUDED.experiencias, idiomas=EXCLUDED.idiomas, educacao=EXCLUDED.educacao,
        dados_extraidos=EXCLUDED.dados_extraidos, busca_texto=EXCLUDED.busca_texto,
        curriculo_storage_key=EXCLUDED.curriculo_storage_key, curriculo_sha256=EXCLUDED.curriculo_sha256,
        curriculo_mime=EXCLUDED.curriculo_mime, curriculo_nome=EXCLUDED.curriculo_nome, atualizado_em=now()
       RETURNING *`,
      [input.profile.name, input.profile.email, input.profile.phone, input.profile.location, input.profile.headline,
       JSON.stringify(input.profile.skills), JSON.stringify(input.profile.experiences), JSON.stringify(input.profile.languages),
       JSON.stringify(input.profile.education), JSON.stringify({ ...input.profile, textoCaracteres: input.text.length }),
       `${input.profile.name} ${input.profile.email} ${input.profile.headline ?? ''} ${input.profile.skills.join(' ')}`,
       input.storageKey, input.sha256, input.mime, input.filename]
    );
    const profile = profileRows[0] as Row;
    const applications = await tx.all(
      `INSERT INTO candidaturas (vaga_id,candidato_perfil_id,origem,match_score,match_detalhes,responsavel_id)
       VALUES (?,?,'UPLOAD_RH',?,?::jsonb,?)
       ON CONFLICT (vaga_id,candidato_perfil_id) DO UPDATE SET
        match_score=EXCLUDED.match_score,match_detalhes=EXCLUDED.match_detalhes,
        responsavel_id=COALESCE(candidaturas.responsavel_id,EXCLUDED.responsavel_id),atualizada_em=now()
       RETURNING *`,
      [input.vacancyId, profile.id, input.match.score, JSON.stringify(input.match), input.userId]
    );
    const application = applications[0] as Row;
    await tx.run(
      `INSERT INTO candidaturas_status_kanban (candidatura_id,vaga_id,etapa,posicao,movido_por)
       VALUES (?,?,'APLICACAO',COALESCE((SELECT MAX(posicao)+1000 FROM candidaturas_status_kanban WHERE vaga_id=? AND etapa='APLICACAO'),1000),?)
       ON CONFLICT (candidatura_id) DO NOTHING`,
      [application.id, input.vacancyId, input.vacancyId, input.userId]
    );
    await tx.run(
      `UPDATE tokens_portal_candidato SET revogado_em=now()
       WHERE candidatura_id=? AND revogado_em IS NULL`,
      [application.id]
    );
    await tx.run(
      `INSERT INTO tokens_portal_candidato (candidatura_id,token_hash,expira_em)
       VALUES (?,?,now()+interval '30 days') ON CONFLICT (token_hash) DO NOTHING`,
      [application.id, input.portalTokenHash]
    );
    await tx.run(
      `INSERT INTO ats_eventos (agregado_tipo,agregado_id,tipo,usuario_id,payload)
       VALUES ('CANDIDATURA',?,'CURRICULO_PROCESSADO',?,?::jsonb)`,
      [application.id, input.userId, JSON.stringify({ matchScore: input.match.score, parser: input.profile.parser })]
    );
    return { application, profile, previousStorageKey };
  });
}

export async function acquireCardLock(vacancyId: number, applicationId: number, expectedVersion: number, userId: number): Promise<Row> {
  const rows = await all(
    `UPDATE candidaturas_status_kanban SET bloqueado_por=?,bloqueado_ate=now()+interval '15 seconds',atualizado_em=now()
     WHERE candidatura_id=? AND vaga_id=? AND versao=?
       AND (bloqueado_por IS NULL OR bloqueado_ate<=now() OR bloqueado_por=?)
     RETURNING *`, [userId, applicationId, vacancyId, expectedVersion, userId]
  ) as Row[];
  if (!rows[0]) throw appError('O card foi atualizado ou esta sendo movido por outro recrutador.', 409, 'ATS_CARD_CONFLICT');
  return rows[0];
}

export async function releaseCardLock(applicationId: number, userId: number): Promise<void> {
  await run(`UPDATE candidaturas_status_kanban SET bloqueado_por=NULL,bloqueado_ate=NULL WHERE candidatura_id=? AND bloqueado_por=?`, [applicationId, userId]);
}

export async function releaseUserLocks(userId: number): Promise<void> {
  await run(`UPDATE candidaturas_status_kanban SET bloqueado_por=NULL,bloqueado_ate=NULL WHERE bloqueado_por=?`, [userId]);
}

export async function moveCard(input: MoveCardInput): Promise<Row> {
  return withTransaction(async (tx) => {
    const currentRows = await tx.all(
      `SELECT * FROM candidaturas_status_kanban WHERE candidatura_id=? AND vaga_id=? FOR UPDATE`,
      [input.candidaturaId, input.vagaId]
    );
    const current = currentRows[0] as Row | undefined;
    if (!current) throw appError('Candidatura nao encontrada.', 404, 'ATS_CARD_NOT_FOUND');
    if (Number(current.versao) !== input.expectedVersion) throw appError('Este card foi alterado por outro recrutador. O quadro sera recarregado.', 409, 'ATS_VERSION_CONFLICT');
    if (current.bloqueado_por != null && Number(current.bloqueado_por) !== input.userId && new Date(String(current.bloqueado_ate)).getTime() > Date.now()) {
      throw appError('Outro recrutador esta movendo este candidato.', 409, 'ATS_CARD_LOCKED');
    }
    if (current.etapa === 'CONTRATADO' && input.targetStage !== 'CONTRATADO') {
      const admissions = await tx.all(
        'SELECT status FROM admissoes_origens WHERE candidatura_id=? FOR UPDATE',
        [input.candidaturaId]
      );
      if (admissions[0] && admissions[0].status !== 'PENDENTE_DADOS') {
        throw appError('A candidatura ja iniciou a admissao e nao pode retornar no Kanban.', 409, 'ADMISSION_ALREADY_STARTED');
      }
      if (admissions[0]) {
        await tx.run(
          `UPDATE admissoes_origens SET status='CANCELADO',atualizado_em=now() WHERE candidatura_id=?`,
          [input.candidaturaId]
        );
      }
    }
    const position = input.targetPosition > 0 ? input.targetPosition : Number((await tx.all(
      `SELECT COALESCE(MAX(posicao),0)+1000 AS posicao FROM candidaturas_status_kanban WHERE vaga_id=? AND etapa=?`,
      [input.vagaId, input.targetStage]
    ))[0]?.posicao ?? 1000);
    const updated = await tx.all(
      `UPDATE candidaturas_status_kanban SET etapa=?,posicao=?,versao=versao+1,
       bloqueado_por=NULL,bloqueado_ate=NULL,movido_por=?,movido_em=now(),atualizado_em=now()
       WHERE candidatura_id=? RETURNING *`,
      [input.targetStage, position, input.userId, input.candidaturaId]
    );
    const card = updated[0] as Row;
    await tx.run(
      `INSERT INTO historico_kanban
       (candidatura_id,vaga_id,etapa_origem,etapa_destino,versao_origem,versao_destino,usuario_id,metadados)
       VALUES (?,?,?,?,?,?,?,?::jsonb)`,
      [input.candidaturaId, input.vagaId, current.etapa, input.targetStage, current.versao, card.versao,
       input.userId, JSON.stringify({ correlationId: input.correlationId ?? null })]
    );
    await tx.run(
      `INSERT INTO ats_eventos (agregado_tipo,agregado_id,tipo,usuario_id,payload,correlation_id)
       VALUES ('CANDIDATURA',?,'KANBAN_CARD_MOVED',?,?::jsonb,?)`,
      [input.candidaturaId, input.userId, JSON.stringify({ from: current.etapa, to: input.targetStage, version: card.versao }), input.correlationId ?? null]
    );
    if (input.targetStage === 'CONTRATADO' && current.etapa !== 'CONTRATADO') {
      await tx.run(
        `INSERT INTO admissoes_origens (candidatura_id,status,aprovado_por)
         VALUES (?,'PENDENTE_DADOS',?)
         ON CONFLICT (candidatura_id) DO UPDATE SET
           status=CASE WHEN admissoes_origens.colaborador_id IS NULL THEN 'PENDENTE_DADOS' ELSE admissoes_origens.status END,
           aprovado_por=EXCLUDED.aprovado_por,aprovado_em=now(),atualizado_em=now()`,
        [input.candidaturaId, input.userId]
      );
      await tx.run(
        `INSERT INTO outbox_eventos (agregado_tipo,agregado_id,tipo,correlation_id,payload)
         VALUES ('CANDIDATURA',?,'candidate.approved.v1',COALESCE(?::uuid,gen_random_uuid()),?::jsonb)`,
        [String(input.candidaturaId), input.correlationId ?? null,
          JSON.stringify({ applicationId: input.candidaturaId, vacancyId: input.vagaId, approvedBy: input.userId })]
      );
      await tx.run(
        `INSERT INTO audit_outbox
          (ator_usuario_id,ator_referencia,acao,recurso_tipo,recurso_id,correlation_id,metadados)
         VALUES (?,COALESCE((SELECT email FROM usuarios WHERE id=?),?),'CANDIDATE_APPROVED',
                 'CANDIDATURA',?,COALESCE(?::uuid,gen_random_uuid()),?::jsonb)`,
        [input.userId, input.userId, `usuario:${input.userId}`, String(input.candidaturaId), input.correlationId ?? null,
          JSON.stringify({ vacancyId: input.vagaId })]
      );
    }
    return card;
  });
}

export async function listMessages(applicationId: number, limit = 100): Promise<Row[]> {
  return all(
    `SELECT m.*,u.nome AS recrutador_nome,p.nome AS candidato_nome
     FROM mensagens_chat m LEFT JOIN usuarios u ON u.id=m.remetente_usuario_id
     LEFT JOIN candidatos_perfil p ON p.id=m.remetente_candidato_id
     WHERE m.candidatura_id=? ORDER BY m.criada_em DESC,m.id DESC LIMIT ?`,
    [applicationId, Math.min(200, Math.max(1, limit))]
  ).then((rows) => (rows as Row[]).reverse());
}

export async function createRecruiterMessage(applicationId: number, userId: number, message: string, idempotency: string): Promise<Row> {
  const rows = await all(
    `INSERT INTO mensagens_chat (candidatura_id,remetente_tipo,remetente_usuario_id,mensagem,idempotencia)
     VALUES (?,'RECRUTADOR',?,?,?::uuid)
     ON CONFLICT (candidatura_id,idempotencia) DO UPDATE SET mensagem=mensagens_chat.mensagem
     RETURNING *`, [applicationId, userId, message, idempotency]
  ) as Row[];
  return rows[0] as Row;
}

export async function applicationVacancy(applicationId: number): Promise<number | null> {
  const rows = await all(`SELECT vaga_id FROM candidaturas WHERE id=?`, [applicationId]) as Row[];
  return rows[0] ? Number(rows[0].vaga_id) : null;
}

export async function createInterview(input: {
  applicationId: number; vacancyId: number; userId: number; title: string; type: string;
  start: string; end: string; timezone: string; provider: string; meetingUrl: string | null;
  status: string; participants: unknown[]; notes: string | null;
}): Promise<Row> {
  const rows = await all(
    `INSERT INTO agenda_entrevistas
     (candidatura_id,vaga_id,titulo,tipo,inicio_em,fim_em,timezone,participantes,provedor,link_reuniao,status,criado_por,observacoes)
     VALUES (?,?,?,?,?,?,?,?::jsonb,?,?,?,?,?) RETURNING *`,
    [input.applicationId,input.vacancyId,input.title,input.type,input.start,input.end,input.timezone,
     JSON.stringify(input.participants),input.provider,input.meetingUrl,input.status,input.userId,input.notes]
  ) as Row[];
  return rows[0] as Row;
}

export async function listInterviews(vacancyId: number): Promise<Row[]> {
  return all(
    `SELECT a.*,p.nome AS candidato_nome,p.email AS candidato_email
     FROM agenda_entrevistas a JOIN candidaturas c ON c.id=a.candidatura_id
     JOIN candidatos_perfil p ON p.id=c.candidato_perfil_id
     WHERE a.vaga_id=? ORDER BY a.inicio_em`, [vacancyId]
  ) as Promise<Row[]>;
}

export async function getPortalApplication(tokenHash: string): Promise<Row | null> {
  const rows = await all(
    `UPDATE tokens_portal_candidato t SET ultimo_acesso_em=now()
     FROM candidaturas c JOIN candidatos_perfil p ON p.id=c.candidato_perfil_id
     JOIN vagas v ON v.id=c.vaga_id
     WHERE t.candidatura_id=c.id AND t.token_hash=? AND t.revogado_em IS NULL AND t.expira_em>now()
     RETURNING c.id AS candidatura_id,c.vaga_id,p.id AS candidato_id,p.nome,p.email,v.titulo`, [tokenHash]
  ) as Row[];
  return rows[0] ?? null;
}

export async function createCandidateMessage(applicationId: number, candidateId: number, message: string, idempotency: string): Promise<Row> {
  const rows = await all(
    `INSERT INTO mensagens_chat (candidatura_id,remetente_tipo,remetente_candidato_id,mensagem,idempotencia)
     VALUES (?,'CANDIDATO',?,?,?::uuid)
     ON CONFLICT (candidatura_id,idempotencia) DO UPDATE SET mensagem=mensagens_chat.mensagem RETURNING *`,
    [applicationId,candidateId,message,idempotency]
  ) as Row[];
  return rows[0] as Row;
}
