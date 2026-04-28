import { funcionarios, registrosPonto, cargos, departamentos, historicoSalarial } from '../config/db.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function enriquecerFuncionario(f) {
    const cargo = cargos.find(c => c.id === f.cargoId) || null;
    const depto = departamentos.find(d => d.id === f.departamentoId) || null;
    return { ...f, cargo, departamento: depto };
}

// ─── Controller ───────────────────────────────────────────────────────────────

export const rhController = {

    // ── Admissão ─────────────────────────────────────────────────────────────
    admitir: async (req, res) => {
        const { nome, cpf, email, cargoId, departamentoId, salario, dataAdmissao, telefone, dataNascimento } = req.body;

        if (!nome || !cpf || !email || !cargoId || !salario) {
            return res.status(400).send({ erro: "Campos obrigatórios: nome, cpf, email, cargoId, salario" });
        }

        if (funcionarios.find(f => f.cpf === cpf)) {
            return res.status(409).send({ erro: "CPF já cadastrado" });
        }
        if (funcionarios.find(f => f.email === email)) {
            return res.status(409).send({ erro: "E-mail já cadastrado" });
        }

        const novoCargo = cargos.find(c => c.id === Number(cargoId));
        if (!novoCargo) return res.status(404).send({ erro: "Cargo não encontrado" });

        const novo = {
            id: funcionarios.length + 1,
            nome, cpf, email, telefone: telefone || null,
            dataNascimento: dataNascimento || null,
            cargoId: Number(cargoId),
            departamentoId: departamentoId ? Number(departamentoId) : novoCargo.departamentoId,
            salario: Number(salario),
            status: "ATIVO",
            dataAdmissao: dataAdmissao || new Date().toLocaleDateString('pt-BR'),
        };

        funcionarios.push(novo);
        return res.status(201).send(enriquecerFuncionario(novo));
    },

    // ── Listagem ─────────────────────────────────────────────────────────────
    listarTodos: async (req, res) => {
        const { status, departamentoId, cargoId, busca } = req.query;
        let lista = funcionarios;

        if (status)         lista = lista.filter(f => f.status === status.toUpperCase());
        if (departamentoId) lista = lista.filter(f => f.departamentoId === Number(departamentoId));
        if (cargoId)        lista = lista.filter(f => f.cargoId === Number(cargoId));
        if (busca) {
            const q = busca.toLowerCase();
            lista = lista.filter(f =>
                f.nome.toLowerCase().includes(q) ||
                f.email.toLowerCase().includes(q) ||
                f.cpf.includes(q)
            );
        }

        return lista.map(enriquecerFuncionario);
    },

    // ── Buscar por ID ─────────────────────────────────────────────────────────
    buscarPorId: async (req, res) => {
        const f = funcionarios.find(f => f.id === Number(req.params.id));
        if (!f) return res.status(404).send({ erro: "Funcionário não encontrado" });
        return enriquecerFuncionario(f);
    },

    // ── Atualizar dados ───────────────────────────────────────────────────────
    atualizar: async (req, res) => {
        const idx = funcionarios.findIndex(f => f.id === Number(req.params.id));
        if (idx === -1) return res.status(404).send({ erro: "Funcionário não encontrado" });

        const { cpf, id, ...changes } = req.body; // CPF e ID não podem ser alterados
        funcionarios[idx] = { ...funcionarios[idx], ...changes };
        return enriquecerFuncionario(funcionarios[idx]);
    },

    // ── Desligamento ──────────────────────────────────────────────────────────
    desligar: async (req, res) => {
        const idx = funcionarios.findIndex(f => f.id === Number(req.params.id));
        if (idx === -1) return res.status(404).send({ erro: "Funcionário não encontrado" });
        if (funcionarios[idx].status === "DESLIGADO") {
            return res.status(400).send({ erro: "Funcionário já está desligado" });
        }

        funcionarios[idx].status = "DESLIGADO";
        funcionarios[idx].dataDesligamento = new Date().toLocaleDateString('pt-BR');
        funcionarios[idx].motivoDesligamento = req.body.motivo || null;

        return { mensagem: "Funcionário desligado com sucesso", funcionario: funcionarios[idx] };
    },

    // ── Reajuste salarial ─────────────────────────────────────────────────────
    reajustarSalario: async (req, res) => {
        const idx = funcionarios.findIndex(f => f.id === Number(req.params.id));
        if (idx === -1) return res.status(404).send({ erro: "Funcionário não encontrado" });

        const { novoSalario, motivo } = req.body;
        if (!novoSalario || novoSalario <= 0) {
            return res.status(400).send({ erro: "novoSalario inválido" });
        }

        const salarioAnterior = funcionarios[idx].salario;
        historicoSalarial.push({
            id: historicoSalarial.length + 1,
            funcionarioId: funcionarios[idx].id,
            salarioAnterior,
            novoSalario: Number(novoSalario),
            motivo: motivo || null,
            data: new Date().toLocaleDateString('pt-BR'),
            responsavelId: req.user.id,
        });

        funcionarios[idx].salario = Number(novoSalario);
        return {
            mensagem: "Salário atualizado",
            salarioAnterior,
            novoSalario: funcionarios[idx].salario,
            variacao: `${(((novoSalario - salarioAnterior) / salarioAnterior) * 100).toFixed(1)}%`,
        };
    },

    // ── Histórico salarial ────────────────────────────────────────────────────
    historicoSalarial: async (req, res) => {
        const id = Number(req.params.id);
        if (!funcionarios.find(f => f.id === id)) {
            return res.status(404).send({ erro: "Funcionário não encontrado" });
        }
        return historicoSalarial.filter(h => h.funcionarioId === id);
    },

    // ── Registro de ponto ─────────────────────────────────────────────────────
    registrarPonto: async (req, res) => {
        const { funcionarioId, tipo } = req.body;
        const f = funcionarios.find(f => f.id === Number(funcionarioId));
        if (!f) return res.status(404).send({ erro: "Funcionário não encontrado" });
        if (!["ENTRADA", "SAIDA", "INTERVALO_INICIO", "INTERVALO_FIM"].includes(tipo)) {
            return res.status(400).send({ erro: "tipo deve ser ENTRADA, SAIDA, INTERVALO_INICIO ou INTERVALO_FIM" });
        }

        const registro = {
            id: registrosPonto.length + 1,
            funcionarioId: Number(funcionarioId),
            tipo,
            data: new Date().toLocaleDateString('pt-BR'),
            hora: new Date().toLocaleTimeString('pt-BR'),
            timestamp: new Date().toISOString(),
        };
        registrosPonto.push(registro);
        return res.status(201).send(registro);
    },

    // ── Espelho de ponto ──────────────────────────────────────────────────────
    espelhoPonto: async (req, res) => {
        const id = Number(req.params.id);
        if (!funcionarios.find(f => f.id === id)) {
            return res.status(404).send({ erro: "Funcionário não encontrado" });
        }

        const { mes, ano } = req.query;
        let registros = registrosPonto.filter(p => p.funcionarioId === id);

        if (mes && ano) {
            registros = registros.filter(p => {
                const d = new Date(p.timestamp);
                return d.getMonth() + 1 === Number(mes) && d.getFullYear() === Number(ano);
            });
        }

        return { funcionarioId: id, totalRegistros: registros.length, registros };
    },

    // ── Holerite ──────────────────────────────────────────────────────────────
    gerarHolerite: async (req, res) => {
        const f = funcionarios.find(f => f.id === Number(req.params.id));
        if (!f) return res.status(404).send({ erro: "Funcionário não encontrado" });

        return calcularHolerite(f);
    },
};

// ─── Cálculo de holerite (exportado para uso em folhaController) ───────────────
export function calcularHolerite(f) {
    const bruto = f.salario;

    // INSS (tabela progressiva simplificada 2024)
    let inss = 0;
    if      (bruto <= 1412.00)  inss = bruto * 0.075;
    else if (bruto <= 2666.68)  inss = bruto * 0.09;
    else if (bruto <= 4000.03)  inss = bruto * 0.12;
    else if (bruto <= 7786.02)  inss = bruto * 0.14;
    else                         inss = 7786.02 * 0.14; // teto

    const baseIRRF = bruto - inss;

    // IRRF (tabela 2024)
    let irrf = 0;
    if      (baseIRRF <= 2259.20) irrf = 0;
    else if (baseIRRF <= 2826.65) irrf = baseIRRF * 0.075 - 169.44;
    else if (baseIRRF <= 3751.05) irrf = baseIRRF * 0.15  - 381.44;
    else if (baseIRRF <= 4664.68) irrf = baseIRRF * 0.225 - 662.77;
    else                           irrf = baseIRRF * 0.275 - 896.00;

    const fgts  = bruto * 0.08;
    const liquido = bruto - inss - irrf;

    const now = new Date();
    return {
        funcionario: { id: f.id, nome: f.nome, cpf: f.cpf, cargo: f.cargoId },
        mesReferencia: now.getMonth() + 1,
        anoReferencia: now.getFullYear(),
        vencimentos: { salarioBase: bruto.toFixed(2) },
        descontos: {
            inss: inss.toFixed(2),
            irrf: irrf.toFixed(2),
        },
        provisoes: { fgts: fgts.toFixed(2) },
        totalBruto:   bruto.toFixed(2),
        totalDescontos: (inss + irrf).toFixed(2),
        totalLiquido:  liquido.toFixed(2),
    };
}
