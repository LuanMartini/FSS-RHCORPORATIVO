import os from 'node:os';
import { all, withTransaction } from '../../db/client.js';
import type { PayrollResult, PayrollTaxTables, TaxBracket } from '../domain/types.js';

export interface PayrollEmployeeRow {
  id: number;
  legacy_id: number | null;
  nome: string;
  cpf: string;
  salario: string;
  departamento_id: number;
  departamento_nome: string;
  cargo_nome: string;
}

export interface EmployeeBatchData {
  dependents: Map<number, number>;
  launches: Map<number, Array<Record<string, unknown>>>;
  benefits: Map<number, Array<Record<string, unknown>>>;
  alimonies: Map<number, Array<Record<string, unknown>>>;
}

function isoCompetency(value: string): string {
  return `${value.slice(0, 7)}-01`;
}

function bracketFromRow(row: Record<string, unknown>): TaxBracket {
  return {
    lowerCents: BigInt(String(row.limite_inferior_centavos)),
    upperCents: row.limite_superior_centavos == null ? null : BigInt(String(row.limite_superior_centavos)),
    rateMillionths: BigInt(String(row.aliquota_milionesimos)),
    deductionCents: BigInt(String(row.parcela_deduzir_centavos ?? 0)),
  };
}

export async function loadTaxTables(competency: string): Promise<{ tables: PayrollTaxTables; inssTableId: string; irrfTableId: string }> {
  const versions = await all(
    `SELECT * FROM tabelas_tributarias
     WHERE vigencia_inicio <= ? AND (vigencia_fim IS NULL OR vigencia_fim >= ?)
     ORDER BY vigencia_inicio DESC`,
    [competency, competency]
  ) as Array<Record<string, unknown>>;
  const inss = versions.find((row) => row.tipo === 'INSS_EMPREGADO');
  const irrf = versions.find((row) => row.tipo === 'IRRF_MENSAL');
  const fgts = versions.find((row) => row.tipo === 'FGTS');
  if (!inss || !irrf || !fgts) throw new Error(`Tabelas tributarias ausentes para ${competency}.`);
  const rows = await all(
    `SELECT * FROM faixas_tributarias WHERE tabela_id IN (?, ?) ORDER BY tabela_id, ordem`,
    [inss.id, irrf.id]
  ) as Array<Record<string, unknown>>;
  const metadata = (irrf.metadados ?? {}) as Record<string, unknown>;
  const fgtsMetadata = (fgts.metadados ?? {}) as Record<string, unknown>;
  return {
    inssTableId: String(inss.id),
    irrfTableId: String(irrf.id),
    tables: {
      inss: rows.filter((row) => String(row.tabela_id) === String(inss.id)).map(bracketFromRow),
      irrf: rows.filter((row) => String(row.tabela_id) === String(irrf.id)).map(bracketFromRow),
      dependentDeductionCents: BigInt(String(irrf.deducao_dependente_centavos)),
      simplifiedDeductionCents: BigInt(String(irrf.desconto_simplificado_centavos)),
      irReductionZeroUntilCents: BigInt(String(metadata.reducao_ate_centavos ?? 0)),
      irReductionEndsAtCents: BigInt(String(metadata.reducao_decrescente_ate_centavos ?? 0)),
      fgtsRateMillionths: BigInt(String(fgtsMetadata.aliquota_milionesimos ?? 80000)),
    },
  };
}

export async function createPayrollProcessing(competency: string, userId: number | null): Promise<Record<string, unknown>> {
  const date = isoCompetency(competency);
  return withTransaction(async (tx) => {
    const versions = await tx.all(
      `SELECT COALESCE(MAX(versao), 0) + 1 AS versao FROM folhas_processadas
       WHERE empresa_id=1 AND competencia=? AND tipo='MENSAL'`, [date]
    );
    const rows = await tx.all(
      `INSERT INTO folhas_processadas
       (empresa_id, competencia, tipo, versao, status, total_funcionarios, iniciado_por)
       VALUES (1, ?, 'MENSAL', ?, 'PENDENTE', 0, ?) RETURNING *`,
      [date, Number(versions[0]?.versao ?? 1), userId]
    );
    await tx.run(
      `WITH dados_snapshot AS (
        SELECT c.id AS colaborador_id,
          jsonb_build_object(
            'id',c.id,'legacyId',fc.funcionario_id,'nome',c.nome_completo,'cpf',c.cpf,
            'salario',c.salario::text,'departamentoId',c.departamento_id,
            'departamentoNome',d.nome,'cargoNome',ca.nome,
            'dependentes',(SELECT count(*)::int FROM dependentes_folha df
              WHERE df.colaborador_id=c.id AND df.deduz_irrf AND df.valido_desde<=?
                AND (df.valido_ate IS NULL OR df.valido_ate>=?)),
            'lancamentos',COALESCE((SELECT jsonb_agg(to_jsonb(l)||jsonb_build_object(
                'codigo',r.codigo,'descricao',r.descricao,'natureza',r.natureza,
                'incide_inss',r.incide_inss,'incide_irrf',r.incide_irrf,'incide_fgts',r.incide_fgts))
              FROM lancamentos_folha l JOIN rubricas_folha r ON r.id=l.rubrica_id
              WHERE l.colaborador_id=c.id AND l.competencia=?),'[]'::jsonb),
            'beneficios',COALESCE((SELECT jsonb_agg(to_jsonb(a)||jsonb_build_object(
                'codigo',b.codigo,'nome',b.nome,'tipo',b.tipo,'valor_padrao_centavos',b.valor_padrao_centavos,
                'percentual_salario_milionesimos',b.percentual_salario_milionesimos,
                'dedutivel_irrf',r.dedutivel_irrf,'prioridade_margem',r.prioridade_margem))
              FROM adesoes_beneficios a JOIN beneficios_flexiveis b ON b.id=a.beneficio_id
              JOIN rubricas_folha r ON r.id=b.rubrica_id
              WHERE a.colaborador_id=c.id AND a.vigencia_inicio<=?
                AND (a.vigencia_fim IS NULL OR a.vigencia_fim>=?) AND b.ativo),'[]'::jsonb),
            'pensoes',COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM pensoes_alimenticias p
              WHERE p.colaborador_id=c.id AND p.vigencia_inicio<=?
                AND (p.vigencia_fim IS NULL OR p.vigencia_fim>=?)),'[]'::jsonb)
          ) AS dados
        FROM colaboradores c
        JOIN departamentos d ON d.id=c.departamento_id
        JOIN cargos ca ON ca.id=c.cargo_id
        LEFT JOIN funcionarios_colaboradores fc ON fc.colaborador_id=c.id
        WHERE c.lifecycle_status='ATIVO' AND c.status='ATIVO'
      )
      INSERT INTO snapshots_folha_colaboradores (folha_id,colaborador_id,dados,hash_dados)
      SELECT ?,colaborador_id,dados,encode(digest(dados::text,'sha256'),'hex') FROM dados_snapshot`,
      [date,date,date,date,date,date,date,rows[0].id]
    );
    const count = await tx.all('SELECT count(*)::int AS total FROM snapshots_folha_colaboradores WHERE folha_id=?', [rows[0].id]);
    await tx.run('UPDATE folhas_processadas SET total_funcionarios=? WHERE id=?', [Number(count[0]?.total ?? 0), rows[0].id]);
    rows[0].total_funcionarios = Number(count[0]?.total ?? 0);
    await tx.run(`INSERT INTO fila_folha (folha_id) VALUES (?)`, [rows[0].id]);
    await tx.run(
      `INSERT INTO audit_outbox
        (ator_usuario_id,ator_referencia,acao,recurso_tipo,recurso_id,metadados)
       VALUES (?,COALESCE((SELECT email FROM usuarios WHERE id=?),?),'PAYROLL_PROCESSING_STARTED',
               'FOLHA',?,?::jsonb)`,
      [userId,userId,userId == null ? 'sistema:payroll' : `usuario:${userId}`,String(rows[0].id),
        JSON.stringify({ competency, totalEmployees: Number(count[0]?.total ?? 0) })]
    );
    return rows[0] as Record<string, unknown>;
  }, { isolationLevel: 'SERIALIZABLE' });
}

export async function listPayrollProcessings(limit = 18): Promise<Array<Record<string, unknown>>> {
  return all(
    `SELECT f.*,
      (SELECT COUNT(*) FROM eventos_esocial_folha e WHERE e.folha_id=f.id AND e.status='PRONTO_ENVIO') AS eventos_esocial_pendentes
     FROM folhas_processadas f ORDER BY competencia DESC, versao DESC LIMIT ?`, [limit]
  ) as Promise<Array<Record<string, unknown>>>;
}

export async function getPayrollProcessing(id: string): Promise<Record<string, unknown> | null> {
  const rows = await all(
    `SELECT f.*,
      (SELECT COUNT(*) FROM eventos_esocial_folha e WHERE e.folha_id=f.id AND e.status='PRONTO_ENVIO') AS eventos_esocial_pendentes
     FROM folhas_processadas f WHERE f.id=?`, [id]
  ) as Array<Record<string, unknown>>;
  return rows[0] ?? null;
}

export async function payrollDashboard(competency?: string): Promise<Record<string, unknown>> {
  const params: unknown[] = [];
  let filter = '';
  if (competency) {
    params.push(isoCompetency(competency));
    filter = 'WHERE competencia=?';
  }
  const currentRows = await all(
    `SELECT * FROM folhas_processadas ${filter} ORDER BY competencia DESC, versao DESC LIMIT 1`, params
  ) as Array<Record<string, unknown>>;
  const current = currentRows[0] ?? null;
  const distribution = current ? await all(
    `SELECT COALESCE(d.nome, 'Sem departamento') AS departamento,
      SUM(c.total_bruto_centavos + c.fgts_centavos)::bigint AS custo_centavos,
      COUNT(*)::int AS colaboradores
     FROM contracheques c LEFT JOIN departamentos d ON d.id=c.departamento_id
     WHERE c.folha_id=? GROUP BY d.nome ORDER BY custo_centavos DESC`, [current.id]
  ) : [];
  return { atual: current, distribuicaoDepartamentos: distribution, processamentos: await listPayrollProcessings() };
}

export async function claimNextJob(workerId = `${os.hostname()}:${process.pid}`): Promise<Record<string, unknown> | null> {
  return withTransaction(async (tx) => {
    await tx.run(
      `UPDATE fila_folha SET status='AGUARDANDO', bloqueado_por=NULL, bloqueado_em=NULL,
       executar_apos=now(), atualizado_em=now()
       WHERE status='EXECUTANDO' AND bloqueado_em < now() - interval '20 minutes'`
    );
    const rows = await tx.all(
      `UPDATE fila_folha SET status='EXECUTANDO', tentativas=tentativas+1,
       bloqueado_por=?, bloqueado_em=now(), atualizado_em=now()
       WHERE id=(
         SELECT id FROM fila_folha WHERE status='AGUARDANDO' AND executar_apos<=now()
         ORDER BY prioridade, id FOR UPDATE SKIP LOCKED LIMIT 1
       ) RETURNING *`, [workerId]
    );
    if (!rows[0]) return null;
    await tx.run(
      `UPDATE folhas_processadas SET status='PROCESSANDO', iniciado_em=COALESCE(iniciado_em,now()), atualizado_em=now()
       WHERE id=?`, [rows[0].folha_id]
    );
    return rows[0] as Record<string, unknown>;
  });
}

export async function loadEmployees(folhaId: string): Promise<PayrollEmployeeRow[]> {
  const rows = await all(
    `SELECT colaborador_id AS id,
      NULLIF(dados->>'legacyId','')::int AS legacy_id,
      dados->>'nome' AS nome,dados->>'cpf' AS cpf,dados->>'salario' AS salario,
      (dados->>'departamentoId')::int AS departamento_id,
      dados->>'departamentoNome' AS departamento_nome,dados->>'cargoNome' AS cargo_nome
     FROM snapshots_folha_colaboradores WHERE folha_id=? ORDER BY colaborador_id`,
    [folhaId]
  );
  return rows as PayrollEmployeeRow[];
}

function groupRows(rows: Array<Record<string, unknown>>): Map<number, Array<Record<string, unknown>>> {
  const result = new Map<number, Array<Record<string, unknown>>>();
  rows.forEach((row) => {
    const id = Number(row.colaborador_id);
    result.set(id, [...(result.get(id) ?? []), row]);
  });
  return result;
}

export async function loadEmployeeBatchData(folhaId: string): Promise<EmployeeBatchData> {
  const snapshots = await all(
    'SELECT colaborador_id,dados FROM snapshots_folha_colaboradores WHERE folha_id=?',
    [folhaId]
  ) as Array<Record<string, unknown>>;
  const dependentRows: Array<Record<string, unknown>> = [];
  const launchRows: Array<Record<string, unknown>> = [];
  const benefitRows: Array<Record<string, unknown>> = [];
  const alimonyRows: Array<Record<string, unknown>> = [];
  for (const snapshot of snapshots) {
    const data = snapshot.dados as Record<string, unknown>;
    const collaboratorId = Number(snapshot.colaborador_id);
    dependentRows.push({ colaborador_id: collaboratorId, total: Number(data.dependentes ?? 0) });
    for (const row of (data.lancamentos as Array<Record<string, unknown>> ?? [])) launchRows.push({ ...row, colaborador_id: collaboratorId });
    for (const row of (data.beneficios as Array<Record<string, unknown>> ?? [])) benefitRows.push({ ...row, colaborador_id: collaboratorId });
    for (const row of (data.pensoes as Array<Record<string, unknown>> ?? [])) alimonyRows.push({ ...row, colaborador_id: collaboratorId });
  }
  return {
    dependents: new Map(dependentRows.map((row) => [Number(row.colaborador_id), Number(row.total)])),
    launches: groupRows(launchRows),
    benefits: groupRows(benefitRows),
    alimonies: groupRows(alimonyRows),
  };
}

export interface PersistPayslipInput {
  folhaId: string;
  employee: PayrollEmployeeRow;
  result: PayrollResult;
  inssTableId: string;
  irrfTableId: string;
  pdfStorageKey: string;
  pdfSha256: string;
  signatureStatus: string;
  signatureAlgorithm: string | null;
  signatureBase64: string | null;
  competency: string;
}

export async function persistPayslip(input: PersistPayslipInput): Promise<{ id: string; created: boolean }> {
  return withTransaction(async (tx) => {
    const r = input.result;
    const demoId = `DM-${input.competency.replace('-', '')}-${input.employee.id}-${input.folhaId}`;
    const existing = await tx.all(
      `SELECT id FROM contracheques WHERE folha_id=? AND colaborador_id=? FOR UPDATE`,
      [input.folhaId, input.employee.id]
    );
    if (existing[0]) return { id: String(existing[0].id), created: false };
    const previousFailure = await tx.all(
      `SELECT id FROM falhas_processamento_folha WHERE folha_id=? AND colaborador_id=? FOR UPDATE`,
      [input.folhaId, input.employee.id]
    );
    const rows = await tx.all(
      `INSERT INTO contracheques
       (folha_id, funcionario_id, colaborador_id, departamento_id, tabela_inss_id, tabela_irrf_id,
        salario_base_centavos, base_inss_centavos, base_irrf_centavos, base_fgts_centavos,
        total_bruto_centavos, total_descontos_centavos, total_liquido_centavos, fgts_centavos,
        margem_consignavel_centavos, margem_utilizada_centavos, metodo_deducao_irrf,
        pdf_storage_key, pdf_sha256, assinatura_status, assinatura_algoritmo, assinatura_base64, esocial_demonstrativo_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
      [input.folhaId, input.employee.legacy_id, input.employee.id, input.employee.departamento_id, input.inssTableId, input.irrfTableId,
       input.result.lines.find((line) => line.code === 'SALARIO')?.amountCents.toString() ?? '0',
       r.inssBaseCents.toString(), r.irrfBaseCents.toString(), r.fgtsBaseCents.toString(),
       r.grossCents.toString(), r.totalDeductionsCents.toString(), r.netCents.toString(), r.fgtsCents.toString(),
       r.consignableMarginCents.toString(), r.consignableUsedCents.toString(), r.irDeductionMethod,
       input.pdfStorageKey, input.pdfSha256, input.signatureStatus, input.signatureAlgorithm, input.signatureBase64, demoId]
    );
    const payslipId = String(rows[0].id);
    await tx.run(`DELETE FROM contracheque_rubricas WHERE contracheque_id=?`, [payslipId]);
    for (const [index, line] of r.lines.entries()) {
      await tx.run(
        `INSERT INTO contracheque_rubricas
         (contracheque_id, rubrica_id, codigo, descricao, natureza, valor_centavos, referencia, ordem)
         VALUES (?, (SELECT id FROM rubricas_folha WHERE codigo=? LIMIT 1), ?, ?, ?, ?, ?, ?)`,
        [payslipId, line.code, line.code, line.description, line.nature, line.amountCents.toString(),
         line.requestedCents == null ? null : `Solicitado ${line.requestedCents}`, index + 1]
      );
    }
    const payload = {
      evento: 'S-1200', competencia: input.competency, cpf: input.employee.cpf,
      ideDmDev: demoId, rubricas: r.lines.map((line) => ({ codigo: line.code, natureza: line.nature, valorCentavos: line.amountCents.toString() })),
    };
    await tx.run(
      `INSERT INTO eventos_esocial_folha
       (folha_id, contracheque_id, tipo_evento, chave_idempotencia, payload)
       VALUES (?,?,'S-1200',?,?::jsonb) ON CONFLICT (chave_idempotencia) DO NOTHING`,
      [input.folhaId, payslipId, `S1200:${input.folhaId}:${input.employee.id}`, JSON.stringify(payload)]
    );
    await tx.run(
      `UPDATE folhas_processadas SET
       processados=processados+?, falhas=GREATEST(0,falhas-?),
       progresso_percentual=ROUND(((processados+?)::numeric / GREATEST(total_funcionarios,1))*100,2),
       total_bruto_centavos=total_bruto_centavos+?, total_descontos_centavos=total_descontos_centavos+?,
       total_liquido_centavos=total_liquido_centavos+?, total_fgts_centavos=total_fgts_centavos+?,
       custo_empresa_centavos=custo_empresa_centavos+?+?, atualizado_em=now() WHERE id=?`,
      [previousFailure[0] ? 0 : 1, previousFailure[0] ? 1 : 0, previousFailure[0] ? 0 : 1,
       r.grossCents.toString(), r.totalDeductionsCents.toString(), r.netCents.toString(),
       r.fgtsCents.toString(), r.grossCents.toString(), r.fgtsCents.toString(), input.folhaId]
    );
    if (previousFailure[0]) await tx.run(`DELETE FROM falhas_processamento_folha WHERE id=?`, [previousFailure[0].id]);
    return { id: payslipId, created: true };
  });
}

export async function registerEmployeeFailure(folhaId: string, employeeId: number, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await withTransaction(async (tx) => {
    const inserted = await tx.all(
      `INSERT INTO falhas_processamento_folha (folha_id, funcionario_id, colaborador_id, codigo, mensagem)
       VALUES (?,(SELECT funcionario_id FROM funcionarios_colaboradores WHERE colaborador_id=?),?,'CALCULO',?)
       ON CONFLICT (folha_id, colaborador_id) WHERE colaborador_id IS NOT NULL DO UPDATE SET
       mensagem=EXCLUDED.mensagem, criado_em=now() RETURNING id, (xmax=0) AS nova`,
      [folhaId, employeeId, employeeId, message]
    );
    if (inserted[0]?.nova) await tx.run(
      `UPDATE folhas_processadas SET falhas=falhas+1, processados=processados+1,
       progresso_percentual=ROUND(((processados+1)::numeric / GREATEST(total_funcionarios,1))*100,2), atualizado_em=now() WHERE id=?`, [folhaId]
    );
  });
}

export async function completeJob(jobId: string, folhaId: string): Promise<void> {
  await withTransaction(async (tx) => {
    await tx.run(`UPDATE fila_folha SET status='CONCLUIDO', atualizado_em=now() WHERE id=?`, [jobId]);
    await tx.run(
      `UPDATE folhas_processadas SET status=CASE WHEN falhas>0 THEN 'CONCLUIDA_COM_ERROS' ELSE 'CONCLUIDA' END,
       progresso_percentual=100, concluido_em=now(), atualizado_em=now() WHERE id=?`, [folhaId]
    );
  });
}

export async function failJob(job: Record<string, unknown>, error: unknown): Promise<void> {
  const retry = Number(job.tentativas) < Number(job.max_tentativas);
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  await withTransaction(async (tx) => {
    await tx.run(
      `UPDATE fila_folha SET status=?, ultimo_erro=?, executar_apos=now()+interval '30 seconds', atualizado_em=now() WHERE id=?`,
      [retry ? 'AGUARDANDO' : 'FALHOU', message.slice(0, 4000), job.id]
    );
    if (!retry) await tx.run(
      `UPDATE folhas_processadas SET status='CONCLUIDA_COM_ERROS', erro_resumo=?, concluido_em=now(), atualizado_em=now() WHERE id=?`,
      [message.slice(0, 4000), job.folha_id]
    );
  });
}

export async function markSentToBank(folhaId: string, paymentDate: string, userId: number): Promise<void> {
  await withTransaction(async (tx) => {
    const payslips = await tx.all(`SELECT id, colaborador_id, total_liquido_centavos, esocial_demonstrativo_id FROM contracheques WHERE folha_id=?`, [folhaId]);
    for (const payslip of payslips) {
      const payload = { evento: 'S-1210', dataPagamento: paymentDate, ideDmDev: payslip.esocial_demonstrativo_id, valorLiquidoCentavos: String(payslip.total_liquido_centavos) };
      await tx.run(
        `INSERT INTO eventos_esocial_folha (folha_id, contracheque_id, tipo_evento, chave_idempotencia, payload)
         VALUES (?,?,'S-1210',?,?::jsonb) ON CONFLICT (chave_idempotencia) DO NOTHING`,
        [folhaId, payslip.id, `S1210:${folhaId}:${payslip.colaborador_id}`, JSON.stringify(payload)]
      );
    }
    await tx.run(`UPDATE folhas_processadas SET status='ENVIADA_BANCO', enviado_banco_em=now(), atualizado_em=now() WHERE id=?`, [folhaId]);
    await tx.run(
      `INSERT INTO audit_outbox
        (ator_usuario_id,ator_referencia,acao,recurso_tipo,recurso_id,metadados)
       VALUES (?,COALESCE((SELECT email FROM usuarios WHERE id=?),?),'PAYROLL_SENT_TO_BANK',
               'FOLHA',?,?::jsonb)`,
      [userId,userId,`usuario:${userId}`,folhaId,JSON.stringify({ paymentDate })]
    );
  });
}

export async function getPayslipPdfRecord(id: string): Promise<Record<string, unknown> | null> {
  const rows = await all(
    `SELECT c.*, co.nome_completo AS nome, fp.competencia FROM contracheques c JOIN colaboradores co ON co.id=c.colaborador_id
     JOIN folhas_processadas fp ON fp.id=c.folha_id WHERE c.id=?`, [id]
  ) as Array<Record<string, unknown>>;
  return rows[0] ?? null;
}
