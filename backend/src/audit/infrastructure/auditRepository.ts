import { all, withTransaction } from '../../db/client.js';

export type Row = Record<string, unknown>;

export async function userRole(userId: number): Promise<string | null> {
  const rows = await all('SELECT perfil FROM usuarios WHERE id=? LIMIT 1', [userId]) as Row[];
  return rows[0] ? String(rows[0].perfil) : null;
}

export async function recentLedger(limit: number): Promise<Row[]> {
  return all(`SELECT id,evento_id,timestamp_evento,ator_referencia,acao,recurso_tipo,recurso_id,ip,
    correlation_id,hash_anterior,hash_atual,chave_versao
    FROM logs_auditoria_imutaveis ORDER BY id DESC LIMIT ?`, [limit]) as Promise<Row[]>;
}

export async function allLedger(): Promise<Row[]> {
  return all('SELECT * FROM logs_auditoria_imutaveis ORDER BY id') as Promise<Row[]>;
}

export async function insertLedgerSerialized<T>(work: (tx: {
  all(sql: string, params?: unknown[]): Promise<Row[]>;
  run(sql: string, params?: unknown[]): Promise<{ rows?: Row[]; rowCount?: number }>;
}) => Promise<T>): Promise<T> {
  return withTransaction(async (tx) => {
    await tx.all('SELECT pg_advisory_xact_lock(?)', [6712026]);
    return work(tx as Parameters<typeof work>[0]);
  }, { isolationLevel: 'SERIALIZABLE' });
}

export async function enqueueAuditOutbox(input: {
  actorUserId: number | null; actorReference: string; action: string; resourceType: string;
  resourceId: string | null; ip: string | null; userAgent: string | null; metadata: unknown;
}): Promise<void> {
  await all(
    `INSERT INTO audit_outbox
      (ator_usuario_id,ator_referencia,acao,recurso_tipo,recurso_id,ip,user_agent,metadados)
     VALUES (?,?,?,?,?,?::inet,?,?::jsonb) RETURNING id`,
    [input.actorUserId,input.actorReference,input.action,input.resourceType,input.resourceId,input.ip,
      input.userAgent,JSON.stringify(input.metadata ?? {})]
  );
}

export async function claimAuditOutbox(limit = 25): Promise<Row[]> {
  return withTransaction(async (tx) => tx.all(
    `UPDATE audit_outbox SET tentativas=tentativas+1
      WHERE id IN (
        SELECT id FROM audit_outbox WHERE processado_em IS NULL AND tentativas<10
        ORDER BY criado_em,id FOR UPDATE SKIP LOCKED LIMIT ?
      ) RETURNING *`,
    [limit]
  ) as Promise<Row[]>);
}

export async function completeAuditOutbox(id: string): Promise<void> {
  await all('UPDATE audit_outbox SET processado_em=now(),ultimo_erro=NULL WHERE id=? RETURNING id', [id]);
}

export async function failAuditOutbox(id: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await all('UPDATE audit_outbox SET ultimo_erro=? WHERE id=? RETURNING id', [message.slice(0, 2000), id]);
}

export async function turnoverMonthly(startDate: string): Promise<Row[]> {
  return all(`WITH meses AS (
      SELECT generate_series(?::date,date_trunc('month',current_date)::date,interval '1 month')::date AS mes
    )
    SELECT to_char(m.mes,'YYYY-MM') AS mes,
      (SELECT count(*)::int FROM historico_contratos h
       WHERE h.data_admissao>=m.mes AND h.data_admissao<(m.mes+interval '1 month')) AS admissoes,
      (SELECT count(*)::int FROM historico_contratos h
       WHERE h.data_desligamento>=m.mes AND h.data_desligamento<(m.mes+interval '1 month')) AS desligamentos,
      (SELECT count(*)::int FROM historico_contratos h
       WHERE h.desligamento_voluntario IS TRUE AND h.data_desligamento>=m.mes
         AND h.data_desligamento<(m.mes+interval '1 month')) AS voluntarios,
      (SELECT count(*)::int FROM historico_contratos h
       WHERE h.data_admissao<m.mes AND (h.data_desligamento IS NULL OR h.data_desligamento>=m.mes)) AS headcount_inicio,
      (SELECT count(*)::int FROM historico_contratos h
       WHERE h.data_admissao<(m.mes+interval '1 month')
         AND (h.data_desligamento IS NULL OR h.data_desligamento>=(m.mes+interval '1 month'))) AS headcount_fim
    FROM meses m ORDER BY m.mes`, [startDate]) as Promise<Row[]>;
}

export async function turnoverDepartments(): Promise<Row[]> {
  return all(`SELECT d.nome AS departamento,
      count(*) FILTER (WHERE h.desligamento_voluntario IS TRUE
        AND h.data_desligamento>=current_date-interval '90 days')::int AS recentes_voluntarios,
      count(*) FILTER (WHERE h.desligamento_voluntario IS TRUE
        AND h.data_desligamento>=current_date-interval '180 days'
        AND h.data_desligamento<current_date-interval '90 days')::int AS anteriores_voluntarios,
      round(avg((h.data_desligamento-h.data_admissao)/365.25)
        FILTER (WHERE h.desligamento_voluntario IS TRUE
          AND h.data_desligamento>=current_date-interval '90 days')::numeric,2) AS permanencia_media_anos,
      count(*) FILTER (WHERE h.data_desligamento>=current_date-interval '365 days')::int AS desligamentos_12m
    FROM departamentos d LEFT JOIN historico_contratos h ON h.departamento_id=d.id
    GROUP BY d.id,d.nome ORDER BY desligamentos_12m DESC,d.nome`) as Promise<Row[]>;
}

export async function turnoverTenure(): Promise<Row[]> {
  return all(`SELECT faixa, count(*)::int AS total FROM (
      SELECT CASE
        WHEN data_desligamento-data_admissao<180 THEN '0–6 meses'
        WHEN data_desligamento-data_admissao<365 THEN '6–12 meses'
        WHEN data_desligamento-data_admissao<1095 THEN '1–3 anos'
        WHEN data_desligamento-data_admissao<1825 THEN '3–5 anos'
        ELSE '5+ anos' END AS faixa,
        CASE
          WHEN data_desligamento-data_admissao<180 THEN 1
          WHEN data_desligamento-data_admissao<365 THEN 2
          WHEN data_desligamento-data_admissao<1095 THEN 3
          WHEN data_desligamento-data_admissao<1825 THEN 4 ELSE 5 END AS ordem
      FROM historico_contratos WHERE data_desligamento>=current_date-interval '12 months'
    ) x GROUP BY faixa,ordem ORDER BY ordem`) as Promise<Row[]>;
}

export async function equitySource(): Promise<Row[]> {
  return all(`SELECT h.colaborador_id,d.nome AS departamento,c.nome AS cargo,h.salario_centavos,
      round((current_date-h.data_admissao)/365.25,2) AS permanencia_anos,
      demo.genero,demo.raca_cor,demo.pessoa_com_deficiencia
    FROM historico_contratos h
    JOIN departamentos d ON d.id=h.departamento_id
    JOIN cargos c ON c.id=h.cargo_id
    LEFT JOIN historico_demografico demo ON demo.colaborador_id=h.colaborador_id AND demo.valido_ate IS NULL
    WHERE h.data_admissao<=current_date AND (h.data_desligamento IS NULL OR h.data_desligamento>current_date)
      AND h.versao=(SELECT max(h2.versao) FROM historico_contratos h2 WHERE h2.colaborador_id=h.colaborador_id)
    ORDER BY d.nome,c.nome,h.colaborador_id`) as Promise<Row[]>;
}

export async function analyticsSummary(): Promise<Row> {
  const rows = await all(`SELECT
      (SELECT count(*)::int FROM historico_contratos
       WHERE data_admissao<=current_date AND (data_desligamento IS NULL OR data_desligamento>current_date)) AS headcount,
      (SELECT count(*)::int FROM historico_contratos WHERE data_desligamento>=date_trunc('year',current_date)) AS desligamentos_ano,
      (SELECT count(*)::int FROM logs_auditoria_imutaveis) AS eventos_auditoria,
      (SELECT max(timestamp_evento) FROM logs_auditoria_imutaveis) AS ultima_auditoria`) as Row[];
  return rows[0] ?? {};
}
