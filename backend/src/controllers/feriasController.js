import { ferias, funcionarios } from '../config/db.js';

export const feriasController = {

    solicitar: async (req, res) => {
        const { funcionarioId, dataInicio, dataFim, observacao } = req.body;
        const f = funcionarios.find(f => f.id === Number(funcionarioId));
        if (!f) return res.status(404).send({ erro: "Funcionário não encontrado" });
        if (f.status !== "ATIVO") return res.status(400).send({ erro: "Funcionário não está ativo" });

        const inicio = new Date(dataInicio);
        const fim    = new Date(dataFim);
        if (isNaN(inicio) || isNaN(fim)) return res.status(400).send({ erro: "Datas inválidas" });
        if (fim <= inicio) return res.status(400).send({ erro: "dataFim deve ser posterior a dataInicio" });

        const diasSolicitados = Math.ceil((fim - inicio) / (1000 * 60 * 60 * 24));

        const nova = {
            id: ferias.length + 1,
            funcionarioId: Number(funcionarioId),
            dataInicio, dataFim,
            diasSolicitados,
            observacao: observacao || null,
            status: "PENDENTE",
            solicitadoEm: new Date().toISOString(),
        };
        ferias.push(nova);
        return res.status(201).send(nova);
    },

    listar: async (req, res) => {
        const { funcionarioId, status } = req.query;
        let lista = ferias;
        if (funcionarioId) lista = lista.filter(f => f.funcionarioId === Number(funcionarioId));
        if (status)        lista = lista.filter(f => f.status === status.toUpperCase());
        return lista.map(f => ({
            ...f,
            funcionario: funcionarios.find(func => func.id === f.funcionarioId) || null,
        }));
    },

    aprovar: async (req, res) => {
        const idx = ferias.findIndex(f => f.id === Number(req.params.id));
        if (idx === -1) return res.status(404).send({ erro: "Solicitação não encontrada" });
        if (ferias[idx].status !== "PENDENTE") {
            return res.status(400).send({ erro: "Solicitação já foi processada" });
        }

        ferias[idx].status = "APROVADO";
        ferias[idx].aprovadoPor = req.user.id;
        ferias[idx].aprovadoEm  = new Date().toISOString();

        // Atualizar status do funcionário
        const fIdx = funcionarios.findIndex(f => f.id === ferias[idx].funcionarioId);
        if (fIdx !== -1) funcionarios[fIdx].status = "FERIAS";

        return { mensagem: "Férias aprovadas", ferias: ferias[idx] };
    },

    reprovar: async (req, res) => {
        const idx = ferias.findIndex(f => f.id === Number(req.params.id));
        if (idx === -1) return res.status(404).send({ erro: "Solicitação não encontrada" });
        if (ferias[idx].status !== "PENDENTE") {
            return res.status(400).send({ erro: "Solicitação já foi processada" });
        }

        ferias[idx].status = "REPROVADO";
        ferias[idx].motivoReprovacao = req.body.motivo || null;
        ferias[idx].reprovadoPor = req.user.id;
        ferias[idx].reprovadoEm  = new Date().toISOString();

        return { mensagem: "Férias reprovadas", ferias: ferias[idx] };
    },

    encerrar: async (req, res) => {
        const solicitacao = ferias.find(f => f.id === Number(req.params.id));
        if (!solicitacao) return res.status(404).send({ erro: "Solicitação não encontrada" });

        solicitacao.status = "ENCERRADO";
        const fIdx = funcionarios.findIndex(f => f.id === solicitacao.funcionarioId);
        if (fIdx !== -1) funcionarios[fIdx].status = "ATIVO";

        return { mensagem: "Férias encerradas, funcionário marcado como ativo" };
    },
};
