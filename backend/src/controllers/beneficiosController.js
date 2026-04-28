import { beneficios, beneficiosFuncionario, funcionarios } from '../config/db.js';

export const beneficiosController = {

    listarBeneficios: async (req, res) => beneficios,

    criarBeneficio: async (req, res) => {
        const { nome, tipo, valorMensal } = req.body;
        if (!nome || !tipo || !valorMensal) {
            return res.status(400).send({ erro: "nome, tipo e valorMensal são obrigatórios" });
        }
        const novo = { id: beneficios.length + 1, nome, tipo, valorMensal: Number(valorMensal) };
        beneficios.push(novo);
        return res.status(201).send(novo);
    },

    vincularFuncionario: async (req, res) => {
        const { funcionarioId, beneficioId } = req.body;
        if (!funcionarios.find(f => f.id === Number(funcionarioId))) {
            return res.status(404).send({ erro: "Funcionário não encontrado" });
        }
        if (!beneficios.find(b => b.id === Number(beneficioId))) {
            return res.status(404).send({ erro: "Benefício não encontrado" });
        }
        if (beneficiosFuncionario.find(b => b.funcionarioId === Number(funcionarioId) && b.beneficioId === Number(beneficioId))) {
            return res.status(409).send({ erro: "Funcionário já possui este benefício" });
        }

        const vinculo = {
            id: beneficiosFuncionario.length + 1,
            funcionarioId: Number(funcionarioId),
            beneficioId: Number(beneficioId),
            dataInicio: new Date().toLocaleDateString('pt-BR'),
        };
        beneficiosFuncionario.push(vinculo);
        return res.status(201).send({ mensagem: "Benefício vinculado com sucesso", vinculo });
    },

    beneficiosPorFuncionario: async (req, res) => {
        const id = Number(req.params.funcionarioId);
        if (!funcionarios.find(f => f.id === id)) {
            return res.status(404).send({ erro: "Funcionário não encontrado" });
        }
        const vinculos = beneficiosFuncionario.filter(b => b.funcionarioId === id);
        const detalhes = vinculos.map(v => ({
            ...v,
            beneficio: beneficios.find(b => b.id === v.beneficioId),
        }));
        const totalMensal = detalhes.reduce((acc, d) => acc + (d.beneficio?.valorMensal || 0), 0);
        return { funcionarioId: id, totalMensalBeneficios: totalMensal.toFixed(2), beneficios: detalhes };
    },

    desvincularFuncionario: async (req, res) => {
        const idx = beneficiosFuncionario.findIndex(b => b.id === Number(req.params.id));
        if (idx === -1) return res.status(404).send({ erro: "Vínculo não encontrado" });
        beneficiosFuncionario.splice(idx, 1);
        return { mensagem: "Benefício desvinculado" };
    },
};
