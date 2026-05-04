import { treinamentos, inscricoesTreinamento, funcionarios } from '../config/db.js';

export const treinamentosController = {

    criar: async (req, res) => {
        const { nome, descricao, cargaHoraria, dataInicio, dataFim, modalidade } = req.body;
        if (!nome || !cargaHoraria) {
            return res.status(400).send({ erro: "nome e cargaHoraria são obrigatórios" });
        }
        const novo = {
            id: treinamentos.length + 1,
            nome, descricao: descricao || null,
            cargaHoraria: Number(cargaHoraria),
            dataInicio: dataInicio || null,
            dataFim: dataFim || null,
            modalidade: modalidade || "PRESENCIAL",
            criadoPor: req.user.id,
            criadoEm: new Date().toISOString(),
        };
        treinamentos.push(novo);
        return res.status(201).send(novo);
    },

    listar: async (req, res) => treinamentos,

    inscrever: async (req, res) => {
        const { funcionarioId, treinamentoId } = req.body;
        if (!funcionarios.find(f => f.id === Number(funcionarioId))) {
            return res.status(404).send({ erro: "Funcionário não encontrado" });
        }
        if (!treinamentos.find(t => t.id === Number(treinamentoId))) {
            return res.status(404).send({ erro: "Treinamento não encontrado" });
        }
        if (inscricoesTreinamento.find(i => i.funcionarioId === Number(funcionarioId) && i.treinamentoId === Number(treinamentoId))) {
            return res.status(409).send({ erro: "Funcionário já inscrito neste treinamento" });
        }

        const inscricao = {
            id: inscricoesTreinamento.length + 1,
            funcionarioId: Number(funcionarioId),
            treinamentoId: Number(treinamentoId),
            status: "INSCRITO",
            inscritoEm: new Date().toISOString(),
        };
        inscricoesTreinamento.push(inscricao);
        return res.status(201).send({ mensagem: "Inscrição realizada", inscricao });
    },

    concluir: async (req, res) => {
        const idx = inscricoesTreinamento.findIndex(i => i.id === Number(req.params.id));
        if (idx === -1) return res.status(404).send({ erro: "Inscrição não encontrada" });
        inscricoesTreinamento[idx].status = "CONCLUIDO";
        inscricoesTreinamento[idx].concluidoEm = new Date().toISOString();
        return { mensagem: "Treinamento concluído", inscricao: inscricoesTreinamento[idx] };
    },

    treinamentosPorFuncionario: async (req, res) => {
        const id = Number(req.params.funcionarioId);
        if (!funcionarios.find(f => f.id === id)) {
            return res.status(404).send({ erro: "Funcionário não encontrado" });
        }
        const inscricoes = inscricoesTreinamento
            .filter(i => i.funcionarioId === id)
            .map(i => ({ ...i, treinamento: treinamentos.find(t => t.id === i.treinamentoId) }));

        const horasConcluidas = inscricoes
            .filter(i => i.status === "CONCLUIDO")
            .reduce((acc, i) => acc + (i.treinamento?.cargaHoraria || 0), 0);

        return { funcionarioId: id, horasConcluidas, inscricoes };
    },
};
