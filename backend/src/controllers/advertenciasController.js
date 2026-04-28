import { advertencias, funcionarios } from '../config/db.js';

const TIPOS = ["VERBAL", "ESCRITA", "SUSPENSAO"];

export const advertenciasController = {

    registrar: async (req, res) => {
        const { funcionarioId, tipo, descricao, dataOcorrencia } = req.body;
        const f = funcionarios.find(f => f.id === Number(funcionarioId));
        if (!f) return res.status(404).send({ erro: "Funcionário não encontrado" });
        if (!TIPOS.includes(tipo)) {
            return res.status(400).send({ erro: `tipo deve ser: ${TIPOS.join(', ')}` });
        }
        if (!descricao) return res.status(400).send({ erro: "descricao é obrigatório" });

        const nova = {
            id: advertencias.length + 1,
            funcionarioId: Number(funcionarioId),
            tipo,
            descricao,
            dataOcorrencia: dataOcorrencia || new Date().toLocaleDateString('pt-BR'),
            registradoPor: req.user.id,
            registradoEm: new Date().toISOString(),
        };
        advertencias.push(nova);
        return res.status(201).send(nova);
    },

    listarPorFuncionario: async (req, res) => {
        const id = Number(req.params.funcionarioId);
        if (!funcionarios.find(f => f.id === id)) {
            return res.status(404).send({ erro: "Funcionário não encontrado" });
        }
        const lista = advertencias.filter(a => a.funcionarioId === id);
        return {
            funcionarioId: id,
            total: lista.length,
            porTipo: TIPOS.reduce((acc, t) => ({ ...acc, [t]: lista.filter(a => a.tipo === t).length }), {}),
            advertencias: lista,
        };
    },

    listarTodas: async (req, res) => {
        const { tipo } = req.query;
        let lista = advertencias;
        if (tipo) lista = lista.filter(a => a.tipo === tipo.toUpperCase());
        return lista.map(a => ({
            ...a,
            funcionario: funcionarios.find(f => f.id === a.funcionarioId) || null,
        }));
    },
};
