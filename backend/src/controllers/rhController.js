import * as rh from '../models/rh.js';
import { loadPrincipal } from '../middleware/authorization.js';
import * as admissionService from '../core/application/admissionService.js';
import * as lifecycleService from '../core/application/lifecycleService.js';
import { parseNewAdmission } from '../core/domain/contracts.js';
import { montarHolerite, holeritePublico, fmt, calcularFGTS } from '../services/payrollService.js';
import {
  optionalDate,
  positiveInteger,
  positiveNumber,
  requiredString,
  validEmail,
  validate,
} from '../utils/validation.js';

const tiposPonto = new Set(['ENTRADA', 'SAIDA', 'INTERVALO_INICIO', 'INTERVALO_FIM']);

function validationResponse(res, errors) {
  if (!errors) return false;
  res.status(400).json({ erro: errors[0], detalhes: errors });
  return true;
}

function horaBr(dt) {
  const d = dt instanceof Date ? dt : new Date(dt);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export async function dashboard(req, res, next) {
  try {
    const st = await rh.countsFuncionarios();
    const total = st.ATIVO + st.DESLIGADO + st.FERIAS;
    const folks = await rh.listFuncionariosComSalario();
    let custoMensalBruto = 0;
    let custoFGTS = 0;
    const salarios = [];
    for (const f of folks) {
      const sb = Number(f.salario);
      custoMensalBruto += sb;
      custoFGTS += calcularFGTS(sb);
      salarios.push(sb);
    }
    salarios.sort((a, b) => a - b);
    const n = salarios.length;
    const media = n ? custoMensalBruto / n : 0;
    const maior = n ? salarios[n - 1] : 0;
    const menor = n ? salarios[0] : 0;
    const encargos = custoFGTS;
    const custoTotalEmpresa = custoMensalBruto + encargos;
    const { cargos: totalCargos, deptos: totalDepartamentos } = await rh.countsCargosDeptos();
    const dist = await rh.countsDeptDist();
    const registrosHoje = await rh.countPontoHoje();

    res.json({
      colaboradores: {
        total,
        ativos: st.ATIVO,
        desligados: st.DESLIGADO,
        emFerias: st.FERIAS,
      },
      folha: {
        custoMensalBruto: fmt(custoMensalBruto),
        mediaSalarial: fmt(media),
        maiorSalario: fmt(maior),
        menorSalario: fmt(menor),
        custoFGTS: fmt(custoFGTS),
        custoTotalEmpresa: fmt(custoTotalEmpresa),
      },
      estrutura: {
        totalDepartamentos,
        totalCargos,
        distribuicaoPorDepto: dist.map((r) => ({
          departamento: r.departamento,
          sigla: r.sigla,
          total: Number(r.total),
        })),
      },
      pontoDoDia: { registrosHoje },
    });
  } catch (e) {
    next(e);
  }
}

export async function funcionarios(req, res, next) {
  try {
    const principal = await loadPrincipal(req);
    const requestedLimit = Number(req.query?.limite ?? 100);
    const requestedCursor = Number(req.query?.cursor ?? 0);
    const rows = await rh.listFuncionariosScoped({
      collaboratorId: principal.collaboratorId,
      canReadAll: principal.permissions.has('employee.read.all') || principal.role === 'ADMINISTRADOR',
      canReadSensitive: principal.permissions.has('employee.read.sensitive'),
      canReadSalary: principal.permissions.has('employee.read.salary'),
      limit: Number.isInteger(requestedLimit) ? Math.min(100, Math.max(1, requestedLimit)) : 100,
      cursor: Number.isInteger(requestedCursor) && requestedCursor > 0 ? requestedCursor : 0,
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
}

export async function funcionarioDesligar(req, res, next) {
  try {
    const principal=await loadPrincipal(req);
    await lifecycleService.terminateCollaborator({
      collaboratorId:Number(req.params.id),expectedVersion:req.body?.versao,
      actorUserId:principal.userId,actorReference:`usuario:${principal.userId}`,
    });
    res.status(204).end();
  } catch (e) { next(e); }
}

export async function cargos(req, res, next) {
  try {
    res.json(await rh.listCargos());
  } catch (e) {
    next(e);
  }
}

export async function departamentos(req, res, next) {
  try {
    res.json(await rh.listDepartamentos());
  } catch (e) {
    next(e);
  }
}

export async function admitir(req, res, next) {
  try {
    const b = req.body ?? {};
    const cargoId = Number(b.cargoId);
    const deptId = b.departamentoId != null ? Number(b.departamentoId) : undefined;
    const cpf = String(b.cpf ?? '').replace(/\D/g, '');
    if (
      validationResponse(
        res,
        validate([
          requiredString(b.nome, 'Nome', 180),
          cpf.length !== 11 ? 'CPF deve conter 11 digitos.' : '',
          validEmail(b.email),
          positiveInteger(cargoId, 'Cargo'),
          deptId != null ? positiveInteger(deptId, 'Departamento') : '',
          positiveNumber(b.salario, 'Salario'),
          optionalDate(b.dataNascimento, 'Data de nascimento'),
        ])
      )
    ) return;

    const cargos = await rh.listCargos();
    const cg = cargos.find((c) => c.id === cargoId);
    if (!cg) return res.status(400).json({ erro: 'Cargo inválido' });
    const principal=await loadPrincipal(req);
    const input=parseNewAdmission({
      nomeCompleto:String(b.nome).trim(),cpf,email:String(b.email).trim(),cargoId,
      departamentoId:deptId??cg.departamentoId,salario:Number(b.salario),telefone:b.telefone,
      dataNascimento:b.dataNascimento,dataAdmissao:b.dataAdmissao,
    });
    const created=await admissionService.createAdmission({...input,userId:principal.userId,actorReference:`usuario:${principal.userId}`});
    res.status(201).json({ ok: true,colaboradorId:Number(created.id) });
  } catch (e) {
    if (e.code === '23505' || e.errno === 1062) {
      return res.status(409).json({ erro: 'CPF ou e-mail já cadastrado' });
    }
    next(e);
  }
}

export async function pontoPost(req, res, next) {
  try {
    const { funcionarioId, tipo } = req.body ?? {};
    if (
      validationResponse(
        res,
        validate([
          positiveInteger(funcionarioId, 'Funcionario'),
          !tiposPonto.has(String(tipo)) ? 'Tipo de ponto invalido.' : '',
        ])
      )
    ) return;

    const row = await rh.insertPonto(Number(funcionarioId), String(tipo));
    res.status(201).json({
      tipo: row.tipo,
      hora: horaBr(row.registrado_em),
      registrado_em: row.registrado_em,
    });
  } catch (e) {
    next(e);
  }
}

export async function pontoEspelho(req, res, next) {
  try {
    const rows = await rh.espelhoPonto(req.params.funcionarioId);
    res.json(rows);
  } catch (e) {
    next(e);
  }
}

export async function feriasList(req, res, next) {
  try {
    const principal=await loadPrincipal(req);
    res.json(await rh.listFerias({managerId:principal.collaboratorId,all:principal.permissions.has('time.manage.all')}));
  } catch (e) { next(e); }
}

export async function feriasPost(req, res, next) {
  try {
    const b = req.body ?? {};
    if (
      validationResponse(
        res,
        validate([
          positiveInteger(b.funcionarioId, 'Funcionario'),
          requiredString(b.dataInicio, 'Data de inicio', 10),
          requiredString(b.dataFim, 'Data de fim', 10),
          optionalDate(b.dataInicio, 'Data de inicio'),
          optionalDate(b.dataFim, 'Data de fim'),
        ])
      )
    ) return;

    if(String(b.dataInicio)>String(b.dataFim))return res.status(422).json({erro:'Data final deve ser igual ou posterior a data inicial.'});
    const principal=await loadPrincipal(req);
    if(!principal.permissions.has('time.manage.all')){
      const allowed=await rh.isManagedCollaborator(principal.collaboratorId,Number(b.funcionarioId));
      if(!allowed)return res.status(403).json({erro:'Colaborador fora da equipe autorizada.',codigo:'LEAVE_MANAGER_FORBIDDEN'});
    }
    await rh.createFeria(req.body ?? {},{userId:principal.userId,reference:`usuario:${principal.userId}`});
    res.status(201).json({ ok: true });
  } catch (e) { next(e); }
}

export async function feriasAprovar(req, res, next) {
  try {
    const principal=await loadPrincipal(req);
    const ok = await rh.feriasAprovar(req.params.id,{versao:req.body?.versao,userId:principal.userId,managerId:principal.collaboratorId,all:principal.permissions.has('time.manage.all')});
    if (!ok) return res.status(404).json({ erro: 'Registro não encontrado' });
    res.json({ ok: true });
  } catch (e) { next(e); }
}

export async function feriasReprovar(req, res, next) {
  try {
    const motivo = req.body?.motivo ?? '';
    const principal=await loadPrincipal(req);
    const ok = await rh.feriasReprovar(req.params.id, motivo,{versao:req.body?.versao,userId:principal.userId,managerId:principal.collaboratorId,all:principal.permissions.has('time.manage.all')});
    if (!ok) return res.status(404).json({ erro: 'Registro não encontrado' });
    res.json({ ok: true });
  } catch (e) { next(e); }
}

export async function feriasEncerrar(req, res, next) {
  try {
    const ok = await rh.feriasEncerrar(req.params.id);
    if (!ok) return res.status(404).json({ erro: 'Registro não encontrado' });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

export async function advertenciasList(req, res, next) {
  try {
    res.json(await rh.listAdvertencias());
  } catch (e) {
    next(e);
  }
}

export async function advertenciasPost(req, res, next) {
  try {
    const b = req.body ?? {};
    if (
      validationResponse(
        res,
        validate([
          positiveInteger(b.funcionarioId, 'Funcionario'),
          requiredString(b.tipo, 'Tipo', 32),
          requiredString(b.descricao, 'Descricao', 1000),
          optionalDate(b.dataOcorrencia, 'Data da ocorrencia'),
        ])
      )
    ) return;

    await rh.createAdvertencia(req.body ?? {});
    res.status(201).json({ ok: true });
  } catch (e) {
    next(e);
  }
}

export async function beneficiosList(req, res, next) {
  try {
    res.json(await rh.listBeneficios());
  } catch (e) {
    next(e);
  }
}

export async function beneficiosPost(req, res, next) {
  try {
    const b = req.body ?? {};
    if (
      validationResponse(
        res,
        validate([
          requiredString(b.nome, 'Nome', 120),
          requiredString(b.tipo, 'Tipo', 64),
          positiveNumber(b.valorMensal, 'Valor mensal'),
        ])
      )
    ) return;

    await rh.createBeneficio(req.body ?? {});
    res.status(201).json({ ok: true });
  } catch (e) {
    next(e);
  }
}

export async function beneficiosVincular(req, res, next) {
  try {
    const { funcionarioId, beneficioId } = req.body ?? {};
    if (
      validationResponse(
        res,
        validate([
          positiveInteger(funcionarioId, 'Funcionario'),
          positiveInteger(beneficioId, 'Beneficio'),
        ])
      )
    ) return;

    await rh.vincularBeneficio(Number(funcionarioId), Number(beneficioId));
    res.status(201).json({ ok: true });
  } catch (e) {
    next(e);
  }
}

export async function treinamentosList(req, res, next) {
  try {
    res.json(await rh.listTreinamentos());
  } catch (e) {
    next(e);
  }
}

export async function treinamentosPost(req, res, next) {
  try {
    const b = req.body ?? {};
    if (
      validationResponse(
        res,
        validate([
          requiredString(b.nome, 'Nome', 180),
          positiveInteger(b.cargaHoraria, 'Carga horaria'),
          requiredString(b.modalidade, 'Modalidade', 32),
        ])
      )
    ) return;

    await rh.createTreinamento(req.body ?? {});
    res.status(201).json({ ok: true });
  } catch (e) {
    next(e);
  }
}

export async function treinamentosInscrever(req, res, next) {
  try {
    const { funcionarioId, treinamentoId } = req.body ?? {};
    if (
      validationResponse(
        res,
        validate([
          positiveInteger(funcionarioId, 'Funcionario'),
          positiveInteger(treinamentoId, 'Treinamento'),
        ])
      )
    ) return;

    await rh.inscreverTreinamento(Number(funcionarioId), Number(treinamentoId));
    res.status(201).json({ ok: true });
  } catch (e) {
    next(e);
  }
}

export async function folhaUm(req, res, next) {
  try {
    const f = await rh.getFuncionarioAtivo(req.params.id);
    if (!f) return res.status(404).json({ erro: 'Funcionário não encontrado' });
    const h = montarHolerite(f);
    res.json(holeritePublico(h));
  } catch (e) {
    next(e);
  }
}

export async function folhaCompleta(req, res, next) {
  try {
    const ref = new Date();
    const folks = await rh.listFuncionariosComSalario();
    const holerites = [];
    let totalBruto = 0;
    let totalDesc = 0;
    let totalLiq = 0;
    let totalFGTS = 0;
    for (const f of folks) {
      const h = montarHolerite(f, ref);
      holerites.push(holeritePublico(h));
      totalBruto += Number(h.totalBruto);
      totalDesc += Number(h.totalDescontos);
      totalLiq += Number(h.totalLiquido);
      totalFGTS += h.__fgts;
    }
    const custoTotalEmpresa = totalBruto + totalFGTS;
    res.json({
      mesReferencia: ref.getMonth() + 1,
      anoReferencia: ref.getFullYear(),
      totalFuncionarios: folks.length,
      resumo: {
        totalBruto: fmt(totalBruto),
        totalDescontos: fmt(totalDesc),
        totalLiquido: fmt(totalLiq),
        totalFGTS: fmt(totalFGTS),
        custoTotalEmpresa: fmt(custoTotalEmpresa),
      },
      holerites,
    });
  } catch (e) {
    next(e);
  }
}

export async function vagasList(req, res, next) {
  try {
    res.json(await rh.listVagas());
  } catch (e) {
    next(e);
  }
}

export async function vagasPost(req, res, next) {
  try {
    if (
      validationResponse(
        res,
        validate([
          requiredString(req.body?.titulo, 'Titulo', 120),
          positiveInteger(req.body?.departamentoId, 'Departamento'),
          requiredString(req.body?.descricao, 'Descricao', 2000),
        ])
      )
    ) return;

    await rh.createVaga(req.body);
    res.status(201).json({ ok: true });
  } catch (e) {
    next(e);
  }
}

export async function candidatosList(req, res, next) {
  try {
    const vagaId = req.params.vagaId;
    res.json(await rh.listCandidatos(vagaId));
  } catch (e) {
    next(e);
  }
}

export async function candidatosPost(req, res, next) {
  try {
    if (
      validationResponse(
        res,
        validate([
          positiveInteger(req.body?.vagaId, 'Vaga'),
          requiredString(req.body?.nome, 'Nome', 180),
          validEmail(req.body?.email),
        ])
      )
    ) return;

    await rh.createCandidato(req.body);
    res.status(201).json({ ok: true });
  } catch (e) {
    next(e);
  }
}

export async function candidatosPatchFase(req, res, next) {
  try {
    const { fase } = req.body;
    if (!fase) return res.status(400).json({ erro: 'Fase não informada' });
    
    await rh.updateFaseCandidato(req.params.id, fase);
    res.json({ ok: true, faseAtualizada: fase });
  } catch (e) {
    next(e);
  }
}
