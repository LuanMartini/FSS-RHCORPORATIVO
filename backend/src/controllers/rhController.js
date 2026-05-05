import * as rh from '../models/rh.js';
import { montarHolerite, holeritePublico, fmt, calcularFGTS } from '../services/payrollService.js';

function horaBr(dt) {
  const d = dt instanceof Date ? dt : new Date(dt);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export async function dashboard(req, res) {
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
    res.status(500).json({ erro: e.message });
  }
}

export async function funcionarios(req, res) {
  try {
    const rows = await rh.listFuncionarios();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
}

export async function funcionarioDesligar(req, res) {
  try {
    await rh.desligarFuncionario(req.params.id);
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
}

export async function cargos(req, res) {
  try {
    res.json(await rh.listCargos());
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
}

export async function departamentos(req, res) {
  try {
    res.json(await rh.listDepartamentos());
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
}

export async function admitir(req, res) {
  try {
    const b = req.body ?? {};
    const cargoId = Number(b.cargoId);
    const deptId = b.departamentoId != null ? Number(b.departamentoId) : undefined;
    if (!b.nome || !b.cpf || !b.email || !cargoId || !b.salario) {
      return res.status(400).json({ erro: 'Dados incompletos' });
    }
    const cargos = await rh.listCargos();
    const cg = cargos.find((c) => c.id === cargoId);
    if (!cg) return res.status(400).json({ erro: 'Cargo inválido' });
    await rh.admitir({
      nome: String(b.nome).trim(),
      cpf: String(b.cpf).replace(/\D/g, ''),
      email: String(b.email).trim(),
      cargoId,
      departamentoId: deptId ?? cg.departamentoId,
      salario: Number(b.salario),
      telefone: b.telefone,
      dataNascimento: b.dataNascimento,
    });
    res.status(201).json({ ok: true });
  } catch (e) {
    if (e.code === '23505' || e.errno === 1062) {
      return res.status(409).json({ erro: 'CPF ou e-mail já cadastrado' });
    }
    res.status(500).json({ erro: e.message });
  }
}

export async function pontoPost(req, res) {
  try {
    const { funcionarioId, tipo } = req.body ?? {};
    const row = await rh.insertPonto(Number(funcionarioId), String(tipo));
    res.status(201).json({
      tipo: row.tipo,
      hora: horaBr(row.registrado_em),
      registrado_em: row.registrado_em,
    });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
}

export async function pontoEspelho(req, res) {
  try {
    const rows = await rh.espelhoPonto(req.params.funcionarioId);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
}

export async function feriasList(req, res) {
  try {
    res.json(await rh.listFerias());
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
}

export async function feriasPost(req, res) {
  try {
    await rh.createFeria(req.body ?? {});
    res.status(201).json({ ok: true });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
}

export async function feriasAprovar(req, res) {
  try {
    const ok = await rh.feriasAprovar(req.params.id);
    if (!ok) return res.status(404).json({ erro: 'Registro não encontrado' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
}

export async function feriasReprovar(req, res) {
  try {
    const motivo = req.body?.motivo ?? '';
    const ok = await rh.feriasReprovar(req.params.id, motivo);
    if (!ok) return res.status(404).json({ erro: 'Registro não encontrado' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
}

export async function feriasEncerrar(req, res) {
  try {
    const ok = await rh.feriasEncerrar(req.params.id);
    if (!ok) return res.status(404).json({ erro: 'Registro não encontrado' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
}

export async function advertenciasList(req, res) {
  try {
    res.json(await rh.listAdvertencias());
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
}

export async function advertenciasPost(req, res) {
  try {
    await rh.createAdvertencia(req.body ?? {});
    res.status(201).json({ ok: true });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
}

export async function beneficiosList(req, res) {
  try {
    res.json(await rh.listBeneficios());
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
}

export async function beneficiosPost(req, res) {
  try {
    await rh.createBeneficio(req.body ?? {});
    res.status(201).json({ ok: true });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
}

export async function beneficiosVincular(req, res) {
  try {
    const { funcionarioId, beneficioId } = req.body ?? {};
    await rh.vincularBeneficio(Number(funcionarioId), Number(beneficioId));
    res.status(201).json({ ok: true });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
}

export async function treinamentosList(req, res) {
  try {
    res.json(await rh.listTreinamentos());
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
}

export async function treinamentosPost(req, res) {
  try {
    await rh.createTreinamento(req.body ?? {});
    res.status(201).json({ ok: true });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
}

export async function treinamentosInscrever(req, res) {
  try {
    const { funcionarioId, treinamentoId } = req.body ?? {};
    await rh.inscreverTreinamento(Number(funcionarioId), Number(treinamentoId));
    res.status(201).json({ ok: true });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
}

export async function folhaUm(req, res) {
  try {
    const f = await rh.getFuncionarioAtivo(req.params.id);
    if (!f) return res.status(404).json({ erro: 'Funcionário não encontrado' });
    const h = montarHolerite(f);
    res.json(holeritePublico(h));
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
}

export async function folhaCompleta(req, res) {
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
    res.status(500).json({ erro: e.message });
  }
}
