import { all, withTransaction } from '../../db/client.js';
import { calculateLeafProgress, weightedChildrenProgress } from '../domain/performanceEngine.js';
import type { WeightedScoreResult } from '../domain/types.js';

type Row=Record<string,unknown>;
const appError=(message:string,status:number,code:string):Error=>Object.assign(new Error(message),{status,code});

export async function listCycles():Promise<Row[]> {
  return all(`SELECT id,nome,descricao,inicio_em,fim_em,status,pesos_avaliadores,minimo_anonimato
    FROM ciclos_avaliacao ORDER BY inicio_em DESC,id DESC`) as Promise<Row[]>;
}

export async function getCycle(cycleId:number):Promise<Row|null> {
  const rows=await all(`SELECT * FROM ciclos_avaliacao WHERE id=?`,[cycleId]) as Row[];
  return rows[0]??null;
}

export async function dashboard(cycleId:number,departmentId:number|null,scope:{managerId:number|null;all:boolean}):Promise<Record<string,unknown>> {
  if(!scope.all&&scope.managerId==null)return{cycles:await listCycles(),departments:[],talents:[],okrs:[],calibrations:[]};
  const params=departmentId===null?[cycleId]:[cycleId,departmentId];
  const departmentFilter=departmentId===null?'':' AND col.departamento_id=?';
  const talentScope=scope.all?'':' AND (col.id=? OR col.gestor_id=?)';
  const talentParams=scope.all?params:[...params,scope.managerId,scope.managerId];
  const okrScope=scope.all?'':` AND (o.nivel IN ('CORPORATIVO','DEPARTAMENTO') OR o.colaborador_id=?
    OR EXISTS (SELECT 1 FROM colaboradores mc WHERE mc.id=o.colaborador_id AND mc.gestor_id=?))`;
  const okrParams=scope.all?params:[...params,scope.managerId,scope.managerId];
  const calibrationScope=scope.all?'':' AND (c.id=? OR c.gestor_id=?)';
  const calibrationParams=scope.all?params:[...params,scope.managerId,scope.managerId];
  const [cycles,departments,talents,okrs,calibrations]=await Promise.all([
    listCycles(),
    all(`SELECT id,nome,sigla FROM departamentos ORDER BY nome`) as Promise<Row[]>,
    all(`SELECT r.id AS resultado_id,r.ciclo_id,r.colaborador_id,
        COALESCE(col.nome_social,col.nome_completo) AS nome,col.email,col.foto_url,
        col.departamento_id,d.nome AS departamento,ca.nome AS cargo,
        r.desempenho_calculado,r.potencial_calculado,r.desempenho_calibrado,r.potencial_calibrado,
        COALESCE(r.desempenho_calibrado,r.desempenho_calculado) AS desempenho,
        COALESCE(r.potencial_calibrado,r.potencial_calculado) AS potencial,
        r.quadrante_x,r.quadrante_y,r.total_avaliacoes,r.distribuicao_avaliadores,r.versao,
        r.calibrado_em,last_log.justificativa AS ultima_justificativa,last_log.calibrado_em AS ultima_calibracao
      FROM resultados_talento r JOIN colaboradores col ON col.id=r.colaborador_id
      LEFT JOIN departamentos d ON d.id=col.departamento_id LEFT JOIN cargos ca ON ca.id=col.cargo_id
      LEFT JOIN LATERAL (SELECT justificativa,calibrado_em FROM logs_calibracao_ninebox l
        WHERE l.resultado_id=r.id ORDER BY calibrado_em DESC LIMIT 1) last_log ON true
      WHERE r.ciclo_id=?${departmentFilter}${talentScope} ORDER BY r.quadrante_y DESC,r.quadrante_x,col.nome_completo`,talentParams) as Promise<Row[]>,
    all(`SELECT o.id,o.objetivo_pai_id,o.nivel,o.titulo,o.descricao,o.departamento_id,o.colaborador_id,
        o.unidade,o.valor_atual,o.valor_meta,o.peso,o.progresso,o.status,o.versao,d.nome AS departamento,
        COALESCE(c.nome_social,c.nome_completo) AS colaborador
      FROM objetivos_okr o LEFT JOIN departamentos d ON d.id=o.departamento_id
      LEFT JOIN colaboradores c ON c.id=o.colaborador_id
      WHERE o.ciclo_id=?${departmentId===null?'':' AND (o.nivel=\'CORPORATIVO\' OR o.departamento_id=?)'}${okrScope}
      ORDER BY CASE o.nivel WHEN 'CORPORATIVO' THEN 1 WHEN 'DEPARTAMENTO' THEN 2 ELSE 3 END,o.id`,okrParams) as Promise<Row[]>,
    all(`SELECT l.id,l.colaborador_id,COALESCE(c.nome_social,c.nome_completo) AS colaborador,
        l.quadrante_x_anterior,l.quadrante_y_anterior,l.quadrante_x_novo,l.quadrante_y_novo,
        l.justificativa,l.calibrado_em,u.nome AS calibrado_por
      FROM logs_calibracao_ninebox l JOIN colaboradores c ON c.id=l.colaborador_id
      LEFT JOIN usuarios u ON u.id=l.calibrado_por
      WHERE l.ciclo_id=?${departmentId===null?'':' AND c.departamento_id=?'}${calibrationScope}
      ORDER BY l.calibrado_em DESC LIMIT 30`,calibrationParams) as Promise<Row[]>,
  ]);
  return {cycles,departments,talents,okrs,calibrations};
}

export async function evaluationRows(cycleId:number):Promise<Row[]> {
  return all(`SELECT a.avaliado_id,a.id AS avaliacao_id,a.tipo_avaliador,p.dimensao,p.peso AS pergunta_peso,r.nota
    FROM avaliacoes_360 a JOIN respostas_avaliacao_numericas r ON r.avaliacao_id=a.id
    JOIN perguntas_avaliacao p ON p.id=r.pergunta_id
    WHERE a.ciclo_id=? AND a.status='CONCLUIDA' AND p.dimensao IN ('DESEMPENHO','POTENCIAL')`,[cycleId]) as Promise<Row[]>;
}

export async function saveCalculatedResults(cycleId:number,results:Map<number,WeightedScoreResult>):Promise<void> {
  await withTransaction(async(tx)=>{
    for(const [collaboratorId,result] of results){
      const x=result.potencial<=33.333?1:result.potencial<=66.666?2:3;
      const y=result.desempenho<=33.333?1:result.desempenho<=66.666?2:3;
      await tx.run(`INSERT INTO resultados_talento
        (ciclo_id,colaborador_id,desempenho_calculado,potencial_calculado,quadrante_x,quadrante_y,total_avaliacoes,distribuicao_avaliadores)
        VALUES (?,?,?,?,?,?,?,?::jsonb)
        ON CONFLICT (ciclo_id,colaborador_id) DO UPDATE SET
          desempenho_calculado=EXCLUDED.desempenho_calculado,potencial_calculado=EXCLUDED.potencial_calculado,
          quadrante_x=CASE WHEN resultados_talento.potencial_calibrado IS NULL THEN EXCLUDED.quadrante_x ELSE resultados_talento.quadrante_x END,
          quadrante_y=CASE WHEN resultados_talento.desempenho_calibrado IS NULL THEN EXCLUDED.quadrante_y ELSE resultados_talento.quadrante_y END,
          total_avaliacoes=EXCLUDED.total_avaliacoes,distribuicao_avaliadores=EXCLUDED.distribuicao_avaliadores,
          calculado_em=now(),versao=resultados_talento.versao+1`,
        [cycleId,collaboratorId,result.desempenho,result.potencial,x,y,result.totalAvaliacoes,JSON.stringify(result.distribuicao)]);
    }
  });
}

export async function calibrate(input:{resultId:number;x:number;y:number;reason:string;expectedVersion:number;userId:number}):Promise<Row> {
  return withTransaction(async(tx)=>{
    const rows=await tx.all(`SELECT * FROM resultados_talento WHERE id=? FOR UPDATE`,[input.resultId]) as Row[];
    const current=rows[0];
    if(!current) throw appError('Resultado de talento nao encontrado.',404,'TALENT_RESULT_NOT_FOUND');
    if(Number(current.versao)!==input.expectedVersion) throw appError('A matriz foi alterada por outro usuario. Recarregue antes de calibrar.',409,'CALIBRATION_VERSION_CONFLICT');
    const previousPerformance=Number(current.desempenho_calibrado??current.desempenho_calculado);
    const previousPotential=Number(current.potencial_calibrado??current.potencial_calculado);
    const nextPotential=[16.67,50,83.33][input.x-1] as number;
    const nextPerformance=[16.67,50,83.33][input.y-1] as number;
    await tx.run(`INSERT INTO logs_calibracao_ninebox
      (resultado_id,ciclo_id,colaborador_id,quadrante_x_anterior,quadrante_y_anterior,quadrante_x_novo,quadrante_y_novo,
       desempenho_anterior,potencial_anterior,desempenho_novo,potencial_novo,justificativa,calibrado_por)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,[
      input.resultId,current.ciclo_id,current.colaborador_id,current.quadrante_x,current.quadrante_y,input.x,input.y,
      previousPerformance,previousPotential,nextPerformance,nextPotential,input.reason,input.userId,
    ]);
    const updated=await tx.all(`UPDATE resultados_talento SET quadrante_x=?,quadrante_y=?,
      desempenho_calibrado=?,potencial_calibrado=?,calibrado_em=now(),versao=versao+1
      WHERE id=? RETURNING *`,[input.x,input.y,nextPerformance,nextPotential,input.resultId]) as Row[];
    return updated[0] as Row;
  },{isolationLevel:'SERIALIZABLE'});
}

export async function updateOkr(input:{okrId:number;currentValue:number;expectedVersion:number;userId:number;correlationId:string}):Promise<Row[]> {
  return withTransaction(async(tx)=>{
    const ancestry=await tx.all(`WITH RECURSIVE chain AS (
      SELECT id,objetivo_pai_id,0 AS depth FROM objetivos_okr WHERE id=?
      UNION ALL SELECT p.id,p.objetivo_pai_id,c.depth+1 FROM objetivos_okr p JOIN chain c ON p.id=c.objetivo_pai_id
    ) SELECT * FROM chain ORDER BY depth`,[input.okrId]) as Row[];
    if(!ancestry.length) throw appError('Key Result nao encontrado.',404,'OKR_NOT_FOUND');
    const ids=ancestry.map((row)=>Number(row.id));
    await tx.all(`SELECT id FROM objetivos_okr WHERE id=ANY(?::bigint[]) ORDER BY id FOR UPDATE`,[ids]);
    const leafRows=await tx.all(`SELECT * FROM objetivos_okr WHERE id=?`,[input.okrId]) as Row[];
    const leaf=leafRows[0] as Row;
    if(Number(leaf.versao)!==input.expectedVersion) throw appError('O KR foi atualizado por outro usuario.',409,'OKR_VERSION_CONFLICT');
    const children=await tx.all(`SELECT id FROM objetivos_okr WHERE objetivo_pai_id=? LIMIT 1`,[input.okrId]) as Row[];
    if(children.length) throw appError('Somente Key Results sem filhos aceitam atualizacao manual.',422,'OKR_NOT_LEAF');
    const leafProgress=calculateLeafProgress(input.currentValue,Number(leaf.valor_inicial),Number(leaf.valor_meta));
    await tx.run(`UPDATE objetivos_okr SET valor_atual=?,progresso=?,versao=versao+1,atualizado_em=now() WHERE id=?`,[input.currentValue,leafProgress,input.okrId]);
    await tx.run(`INSERT INTO historico_progresso_okr
      (objetivo_id,valor_anterior,valor_novo,progresso_anterior,progresso_novo,origem,alterado_por,correlation_id)
      VALUES (?,?,?,?,?,'MANUAL',?,?::uuid)`,[input.okrId,leaf.valor_atual,input.currentValue,leaf.progresso,leafProgress,input.userId,input.correlationId]);

    for(const ancestor of ancestry.slice(1)){
      const parentId=Number(ancestor.id);
      const directChildren=await tx.all(`SELECT progresso,peso FROM objetivos_okr
        WHERE objetivo_pai_id=? AND status<>'CANCELADO' FOR SHARE`,[parentId]) as Row[];
      const next=weightedChildrenProgress(directChildren.map((row)=>({progress:Number(row.progresso),weight:Number(row.peso)})));
      const parentRows=await tx.all(`SELECT valor_atual,progresso FROM objetivos_okr WHERE id=?`,[parentId]) as Row[];
      const parent=parentRows[0] as Row;
      await tx.run(`UPDATE objetivos_okr SET progresso=?,versao=versao+1,atualizado_em=now() WHERE id=?`,[next,parentId]);
      await tx.run(`INSERT INTO historico_progresso_okr
        (objetivo_id,valor_anterior,valor_novo,progresso_anterior,progresso_novo,origem,alterado_por,correlation_id)
        VALUES (?,?,?,?,?,'CASCATA',?,?::uuid)`,[parentId,parent.valor_atual,parent.valor_atual,parent.progresso,next,input.userId,input.correlationId]);
    }
    return tx.all(`SELECT * FROM objetivos_okr WHERE id=ANY(?::bigint[])`,[ids]) as Promise<Row[]>;
  },{isolationLevel:'READ COMMITTED'});
}
