import { registrosPonto, funcionarios } from '../config/db.js';

export const pontoController = {

    registrar: async (req, res) => {
        const { funcionarioId, tipo } = req.body;
        const f = funcionarios.find(f => f.id === Number(funcionarioId));
        if (!f) return res.status(404).send({ erro: "Funcionário não encontrado" });
        if (f.status !== "ATIVO") return res.status(400).send({ erro: "Funcionário não está ativo" });

        const tiposValidos = ["ENTRADA", "SAIDA", "INTERVALO_INICIO", "INTERVALO_FIM"];
        if (!tiposValidos.includes(tipo)) {
            return res.status(400).send({ erro: `tipo deve ser: ${tiposValidos.join(', ')}` });
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

    espelhoPonto: async (req, res) => {
        const id = Number(req.params.id);
        const f = funcionarios.find(f => f.id === id);
        if (!f) return res.status(404).send({ erro: "Funcionário não encontrado" });

        const { mes, ano } = req.query;
        let registros = registrosPonto.filter(p => p.funcionarioId === id);

        if (mes && ano) {
            registros = registros.filter(p => {
                const d = new Date(p.timestamp);
                return d.getMonth() + 1 === Number(mes) && d.getFullYear() === Number(ano);
            });
        }

        const porDia = {};
        registros.forEach(r => {
            if (!porDia[r.data]) porDia[r.data] = [];
            porDia[r.data].push(r);
        });

        const diasTrabalhados = Object.entries(porDia).map(([data, regs]) => {
            const entrada = regs.find(r => r.tipo === 'ENTRADA');
            const saida   = regs.find(r => r.tipo === 'SAIDA');
            let horasTrabalhadas = null;
            if (entrada && saida) {
                const diff = new Date(saida.timestamp) - new Date(entrada.timestamp);
                horasTrabalhadas = (diff / 1000 / 60 / 60).toFixed(2);
            }
            return { data, registros: regs, horasTrabalhadas };
        });

        return {
            funcionario: { id: f.id, nome: f.nome },
            totalRegistros: registros.length,
            diasTrabalhados,
        };
    },

    corrigirPonto: async (req, res) => {
        const idx = registrosPonto.findIndex(p => p.id === Number(req.params.id));
        if (idx === -1) return res.status(404).send({ erro: "Registro não encontrado" });

        const { hora, justificativa } = req.body;
        registrosPonto[idx].hora = hora;
        registrosPonto[idx].corrigidoPor = req.user.id;
        registrosPonto[idx].justificativa = justificativa;
        registrosPonto[idx].corrigidoEm = new Date().toISOString();

        return { mensagem: "Ponto corrigido", registro: registrosPonto[idx] };
    },
};
