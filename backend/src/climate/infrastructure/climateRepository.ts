import { all, withTransaction } from '../../db/client.js';
import { remainingKudos } from '../domain/climateEngine.js';
import type { CreatePublicationInput, EncryptedFeedback, SentimentResult } from '../domain/types.js';

type Row = Record<string, unknown>;
const fail = (message: string, status: number, code: string): Error => Object.assign(new Error(message), { status, code });
const weekStartSql = `date_trunc('week',current_date)::date`;

export async function actorByUser(userId: number): Promise<Row> {
  const rows = await all(`SELECT c.id,COALESCE(c.nome_social,c.nome_completo) AS nome,c.email,c.departamento_id,d.nome AS departamento
    FROM usuarios_colaboradores uc JOIN colaboradores c ON c.id=uc.colaborador_id
    LEFT JOIN departamentos d ON d.id=c.departamento_id WHERE uc.usuario_id=? AND c.status='ATIVO'`, [userId]) as Row[];
  if (!rows[0]) throw fail('Usuario autenticado nao possui colaborador ativo vinculado.', 403, 'COLLABORATOR_LINK_REQUIRED');
  return rows[0];
}

export async function activeSurvey(): Promise<Row | null> {
  const rows = await all(`SELECT * FROM pesquisas_clima WHERE ativa AND current_date BETWEEN inicio AND fim ORDER BY inicio DESC LIMIT 1`) as Row[];
  return rows[0] ?? null;
}

export async function dashboard(actorId: number, participationProof: string | null, limit: number, cursor: number | null): Promise<Row> {
  await all(`INSERT INTO kudos_saldos_semanais (colaborador_id,semana_inicio) VALUES (?,${weekStartSql}) ON CONFLICT DO NOTHING`, [actorId]);
  const actorRows = await all(`SELECT c.id,COALESCE(c.nome_social,c.nome_completo) AS nome,c.departamento_id,d.nome AS departamento
    FROM colaboradores c LEFT JOIN departamentos d ON d.id=c.departamento_id WHERE c.id=?`, [actorId]) as Row[];
  const survey = await activeSurvey();
  const cursorFilter = cursor === null ? '' : 'AND p.id<?';
  const feedParams: unknown[] = [actorId];
  if (cursor !== null) feedParams.push(cursor);
  feedParams.push(limit);
  const feed = await all(`SELECT p.id,p.tipo,p.conteudo,p.categoria_kudos,p.sentimento,p.criado_em,p.versao,
      p.autor_colaborador_id,COALESCE(a.nome_social,a.nome_completo) AS autor_nome,a.departamento_id,
      p.destinatario_kudos_id,COALESCE(k.nome_social,k.nome_completo) AS destinatario_nome,
      (SELECT COUNT(*)::int FROM comunicacao_curtidas l WHERE l.publicacao_id=p.id) AS curtidas,
      (SELECT COUNT(*)::int FROM comunicacao_comentarios c WHERE c.publicacao_id=p.id AND c.removido_em IS NULL) AS comentarios_total,
      EXISTS(SELECT 1 FROM comunicacao_curtidas l WHERE l.publicacao_id=p.id AND l.colaborador_id=?) AS curtiu
    FROM comunicacao_publicacoes p JOIN colaboradores a ON a.id=p.autor_colaborador_id
    LEFT JOIN colaboradores k ON k.id=p.destinatario_kudos_id
    WHERE p.removido_em IS NULL ${cursorFilter} ORDER BY p.id DESC LIMIT ?`, feedParams) as Row[];
  const postIds = feed.map((item) => Number(item.id));
  const comments = postIds.length ? await all(`SELECT c.id,c.publicacao_id,c.conteudo,c.criado_em,c.sentimento,c.autor_colaborador_id,
      COALESCE(a.nome_social,a.nome_completo) AS autor_nome FROM (
        SELECT c0.*,row_number() OVER (PARTITION BY c0.publicacao_id ORDER BY c0.criado_em DESC) AS ordem
        FROM comunicacao_comentarios c0 WHERE c0.publicacao_id=ANY(?::bigint[]) AND c0.removido_em IS NULL
      ) c JOIN colaboradores a ON a.id=c.autor_colaborador_id WHERE c.ordem<=3 ORDER BY c.publicacao_id,c.criado_em`, [postIds]) as Row[] : [];
  const mentions = postIds.length ? await all(`SELECT m.publicacao_id,m.colaborador_mencionado_id,COALESCE(c.nome_social,c.nome_completo) AS nome
    FROM comunicacao_mencoes m JOIN colaboradores c ON c.id=m.colaborador_mencionado_id
    WHERE m.publicacao_id=ANY(?::bigint[]) ORDER BY m.id`, [postIds]) as Row[] : [];
  const balanceRows = await all(`SELECT quantidade_total,quantidade_utilizada,(quantidade_total-quantidade_utilizada)::int AS disponiveis,semana_inicio
    FROM kudos_saldos_semanais WHERE colaborador_id=? AND semana_inicio=${weekStartSql}`, [actorId]) as Row[];
  let surveyData: Row | null = null;
  let climateMetrics: Row | null = null;
  let heatmap: Row[] = [];
  if (survey) {
    const [participationRows, countRows, metricRows, heatmapRows] = await Promise.all([
      participationProof ? all(`SELECT EXISTS(SELECT 1 FROM pesquisas_participacoes_anonimas WHERE pesquisa_id=? AND comprovante_identidade=?) AS respondeu`, [survey.id, participationProof]) as Promise<Row[]> : Promise.resolve([]),
      all(`SELECT (SELECT COUNT(*) FROM pesquisas_respostas_anonimas WHERE pesquisa_id=?)::int AS participacoes,
        (SELECT COUNT(*) FROM colaboradores WHERE status='ATIVO')::int AS elegiveis`, [survey.id]) as Promise<Row[]>,
      all(`SELECT COUNT(*)::int AS respostas,ROUND(AVG(nota),2) AS media,
        ROUND(100.0*(COUNT(*) FILTER (WHERE nota>=9)-COUNT(*) FILTER (WHERE nota<=6))/NULLIF(COUNT(*),0),2) AS enps,
        COUNT(*) FILTER (WHERE sentimento='POSITIVO')::int AS positivos,
        COUNT(*) FILTER (WHERE sentimento='NEUTRO')::int AS neutros,
        COUNT(*) FILTER (WHERE sentimento='NEGATIVO')::int AS negativos
        FROM pesquisas_respostas_anonimas WHERE pesquisa_id=?
        HAVING COUNT(*)>=(SELECT minimo_grupo FROM pesquisas_clima WHERE id=?)`, [survey.id, survey.id]) as Promise<Row[]>,
      all(`SELECT * FROM vw_enps_agregado_departamento WHERE pesquisa_id=? ORDER BY departamento`, [survey.id]) as Promise<Row[]>,
    ]);
    const counts = countRows[0] ?? {};
    surveyData = { ...survey, ja_respondeu: Boolean(participationRows[0]?.respondeu), ...counts,
      taxa_participacao: Number(counts.elegiveis) ? Number(((Number(counts.participacoes) / Number(counts.elegiveis)) * 100).toFixed(1)) : 0 };
    climateMetrics = metricRows[0] ?? null;
    heatmap = heatmapRows;
  }
  const [kudosRanking, communicationMood] = await Promise.all([
    all(`SELECT h.destinatario_id,COALESCE(c.nome_social,c.nome_completo) AS nome,COUNT(*)::int AS kudos
      FROM kudos_historico h JOIN colaboradores c ON c.id=h.destinatario_id WHERE h.semana_inicio=${weekStartSql}
      GROUP BY h.destinatario_id,c.nome_social,c.nome_completo ORDER BY kudos DESC,nome LIMIT 5`) as Promise<Row[]>,
    all(`WITH sinais AS (
        SELECT p.sentimento,c.departamento_id FROM comunicacao_publicacoes p JOIN colaboradores c ON c.id=p.autor_colaborador_id
          WHERE p.removido_em IS NULL AND p.criado_em>=now()-interval '30 days' AND p.sentimento IS NOT NULL
        UNION ALL
        SELECT co.sentimento,c.departamento_id FROM comunicacao_comentarios co JOIN colaboradores c ON c.id=co.autor_colaborador_id
          WHERE co.removido_em IS NULL AND co.criado_em>=now()-interval '30 days' AND co.sentimento IS NOT NULL)
      SELECT d.id AS departamento_id,d.nome AS departamento,COUNT(*)::int AS sinais,
        COUNT(*) FILTER (WHERE s.sentimento='POSITIVO')::int AS positivos,
        COUNT(*) FILTER (WHERE s.sentimento='NEUTRO')::int AS neutros,
        COUNT(*) FILTER (WHERE s.sentimento='NEGATIVO')::int AS negativos
      FROM sinais s JOIN departamentos d ON d.id=s.departamento_id GROUP BY d.id,d.nome HAVING COUNT(*)>=3 ORDER BY d.nome`) as Promise<Row[]>,
  ]);
  return { actor: actorRows[0], balance: balanceRows[0], feed, comments, mentions, survey: surveyData, climateMetrics, heatmap, kudosRanking, communicationMood, nextCursor: feed.length === limit ? feed.at(-1)?.id : null };
}

export async function searchPeople(actorId: number, term: string): Promise<Row[]> {
  return all(`SELECT id,COALESCE(nome_social,nome_completo) AS nome,email,departamento_id
    FROM colaboradores WHERE status='ATIVO' AND id<>? AND lower(COALESCE(nome_social,nome_completo)) LIKE lower(?)
    ORDER BY COALESCE(nome_social,nome_completo) LIMIT 8`, [actorId, `${term}%`]) as Promise<Row[]>;
}

export async function createPublication(input: CreatePublicationInput): Promise<Row> {
  return withTransaction(async (tx) => {
    const duplicates = await tx.all(`SELECT * FROM comunicacao_publicacoes WHERE autor_colaborador_id=? AND idempotencia=?::uuid`, [input.actorId, input.idempotencyKey]) as Row[];
    if (duplicates[0]) return duplicates[0];
    if (input.type === 'KUDOS') {
      const recipients = await tx.all(`SELECT id FROM colaboradores WHERE id=? AND status='ATIVO' FOR SHARE`, [input.recipientId]) as Row[];
      if (!recipients[0]) throw fail('Destinatario de Kudos nao encontrado.', 404, 'KUDOS_RECIPIENT_NOT_FOUND');
      await tx.run(`INSERT INTO kudos_saldos_semanais (colaborador_id,semana_inicio) VALUES (?,${weekStartSql}) ON CONFLICT DO NOTHING`, [input.actorId]);
      const balances = await tx.all(`SELECT * FROM kudos_saldos_semanais WHERE colaborador_id=? AND semana_inicio=${weekStartSql} FOR UPDATE`, [input.actorId]) as Row[];
      const balance = balances[0] as Row;
      remainingKudos(Number(balance.quantidade_total), Number(balance.quantidade_utilizada));
    }
    const created = await tx.all(`INSERT INTO comunicacao_publicacoes
      (autor_colaborador_id,tipo,conteudo,destinatario_kudos_id,categoria_kudos,sentimento,sentimento_confianca,modelo_sentimento,idempotencia)
      VALUES (?,?,?,?,?,?,?,?,?::uuid) RETURNING *`, [input.actorId, input.type, input.content, input.recipientId, input.kudosCategory,
      input.sentiment.label, input.sentiment.confidence, input.sentiment.model, input.idempotencyKey]) as Row[];
    const publication = created[0] as Row;
    if (input.type === 'KUDOS') {
      await tx.run(`UPDATE kudos_saldos_semanais SET quantidade_utilizada=quantidade_utilizada+1,versao=versao+1,atualizado_em=now()
        WHERE colaborador_id=? AND semana_inicio=${weekStartSql}`, [input.actorId]);
      await tx.run(`INSERT INTO kudos_historico (remetente_id,destinatario_id,publicacao_id,categoria,semana_inicio,idempotencia)
        VALUES (?,?,?,?,${weekStartSql},?::uuid)`, [input.actorId, input.recipientId, publication.id, input.kudosCategory, input.idempotencyKey]);
    }
    const mentionIds = [...new Set([...input.mentionedIds, ...(input.recipientId ? [input.recipientId] : [])])];
    if (mentionIds.length) {
      await tx.run(`INSERT INTO comunicacao_mencoes (publicacao_id,colaborador_mencionado_id)
        SELECT ?,id FROM colaboradores WHERE id=ANY(?::bigint[]) AND status='ATIVO' ON CONFLICT DO NOTHING`, [publication.id, mentionIds]);
    }
    return publication;
  }, { isolationLevel: 'SERIALIZABLE' });
}

export async function toggleLike(actorId: number, publicationId: number): Promise<Row> {
  return withTransaction(async (tx) => {
    const posts = await tx.all(`SELECT id FROM comunicacao_publicacoes WHERE id=? AND removido_em IS NULL`, [publicationId]) as Row[];
    if (!posts[0]) throw fail('Publicacao nao encontrada.', 404, 'PUBLICATION_NOT_FOUND');
    const removed = await tx.run(`DELETE FROM comunicacao_curtidas WHERE publicacao_id=? AND colaborador_id=?`, [publicationId, actorId]);
    let liked = false;
    if (!removed.rowCount) {
      await tx.run(`INSERT INTO comunicacao_curtidas (publicacao_id,colaborador_id) VALUES (?,?)`, [publicationId, actorId]);
      liked = true;
    }
    const counts = await tx.all(`SELECT COUNT(*)::int AS total FROM comunicacao_curtidas WHERE publicacao_id=?`, [publicationId]) as Row[];
    return { liked, total: counts[0]?.total ?? 0 };
  });
}

export async function addComment(actorId: number, publicationId: number, content: string, mentionedIds: number[], sentiment: SentimentResult): Promise<Row> {
  return withTransaction(async (tx) => {
    const posts = await tx.all(`SELECT id FROM comunicacao_publicacoes WHERE id=? AND removido_em IS NULL`, [publicationId]) as Row[];
    if (!posts[0]) throw fail('Publicacao nao encontrada.', 404, 'PUBLICATION_NOT_FOUND');
    const rows = await tx.all(`INSERT INTO comunicacao_comentarios
      (publicacao_id,autor_colaborador_id,conteudo,sentimento,sentimento_confianca,modelo_sentimento)
      VALUES (?,?,?,?,?,?) RETURNING *`, [publicationId, actorId, content, sentiment.label, sentiment.confidence, sentiment.model]) as Row[];
    const comment = rows[0] as Row;
    if (mentionedIds.length) await tx.run(`INSERT INTO comunicacao_mencoes (comentario_id,colaborador_mencionado_id)
      SELECT ?,id FROM colaboradores WHERE id=ANY(?::bigint[]) AND status='ATIVO' ON CONFLICT DO NOTHING`, [comment.id, mentionedIds]);
    return comment;
  });
}

export async function registerParticipation(pollId: number, proof: string): Promise<Row> {
  return withTransaction(async (tx) => {
    const polls = await tx.all(`SELECT * FROM pesquisas_clima WHERE id=? AND ativa AND current_date BETWEEN inicio AND fim FOR SHARE`, [pollId]) as Row[];
    if (!polls[0]) throw fail('Pesquisa encerrada ou inexistente.', 404, 'SURVEY_NOT_ACTIVE');
    const inserted = await tx.run(`INSERT INTO pesquisas_participacoes_anonimas (pesquisa_id,comprovante_identidade) VALUES (?,?) ON CONFLICT DO NOTHING`, [pollId, proof]);
    if (!inserted.rowCount) throw fail('Uma credencial ja foi emitida para esta pesquisa.', 409, 'SURVEY_ALREADY_ANSWERED');
    return polls[0] as Row;
  });
}

export async function storeAnonymousVote(input: {
  pollId: number; departmentId: number; credentialFingerprint: string; responseId: string; orderId: string;
  score: number; feedback: EncryptedFeedback | null; sentiment: SentimentResult;
}): Promise<void> {
  await withTransaction(async (tx) => {
    const polls = await tx.all(`SELECT id FROM pesquisas_clima WHERE id=? AND ativa AND current_date BETWEEN inicio AND fim FOR SHARE`, [input.pollId]) as Row[];
    if (!polls[0]) throw fail('Pesquisa encerrada ou inexistente.', 409, 'SURVEY_NOT_ACTIVE');
    const consumed = await tx.run(`INSERT INTO enps_credenciais_consumidas (pesquisa_id,impressao_credencial) VALUES (?,?) ON CONFLICT DO NOTHING`, [input.pollId, input.credentialFingerprint]);
    if (!consumed.rowCount) throw fail('Credencial de voto ja utilizada.', 409, 'BALLOT_ALREADY_USED');
    await tx.run(`INSERT INTO pesquisas_respostas_anonimas
      (id,pesquisa_id,departamento_id,nota,feedback_cifrado,feedback_iv,feedback_tag,sentimento,sentimento_confianca,modelo_sentimento,criado_ordem)
      VALUES (?::uuid,?,?,?,?,?,?,?,?,?,?::uuid)`, [input.responseId, input.pollId, input.departmentId, input.score,
      input.feedback?.ciphertext ?? null, input.feedback?.iv ?? null, input.feedback?.tag ?? null,
      input.sentiment.label, input.sentiment.confidence, input.sentiment.model, input.orderId]);
  }, { isolationLevel: 'SERIALIZABLE' });
}
