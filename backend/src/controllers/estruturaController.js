import { departamentos, cargos, funcionarios } from '../config/db.js';

export const estruturaController = {

    listarDepartamentos: async (req, res) => {
        return departamentos.map(d => ({
            ...d,
            totalFuncionarios: funcionarios.filter(f => f.departamentoId === d.id && f.status === 'ATIVO').length,
        }));
    },

    buscarDepartamento: async (req, res) => {
        const d = departamentos.find(d => d.id === Number(req.params.id));
        if (!d) return res.status(404).send({ erro: "Departamento não encontrado" });
        const funcs = funcionarios.filter(f => f.departamentoId === d.id);
        return { ...d, funcionarios: funcs };
    },

    criarDepartamento: async (req, res) => {
        const { nome, sigla, gestorId } = req.body;
        if (!nome || !sigla) return res.status(400).send({ erro: "nome e sigla são obrigatórios" });
        if (departamentos.find(d => d.sigla === sigla)) {
            return res.status(409).send({ erro: "Sigla já utilizada" });
        }
        const novo = { id: departamentos.length + 1, nome, sigla, gestorId: gestorId || null };
        departamentos.push(novo);
        return res.status(201).send(novo);
    },

    atualizarDepartamento: async (req, res) => {
        const idx = departamentos.findIndex(d => d.id === Number(req.params.id));
        if (idx === -1) return res.status(404).send({ erro: "Departamento não encontrado" });
        departamentos[idx] = { ...departamentos[idx], ...req.body };
        return departamentos[idx];
    },

    excluirDepartamento: async (req, res) => {
        const id = Number(req.params.id);
        const temFuncionarios = funcionarios.some(f => f.departamentoId === id && f.status === 'ATIVO');
        if (temFuncionarios) {
            return res.status(400).send({ erro: "Não é possível excluir um departamento com funcionários ativos" });
        }
        const idx = departamentos.findIndex(d => d.id === id);
        if (idx === -1) return res.status(404).send({ erro: "Departamento não encontrado" });
        departamentos.splice(idx, 1);
        return { mensagem: "Departamento removido" };
    },

    listarCargos: async (req, res) => {
        const { departamentoId } = req.query;
        let lista = cargos;
        if (departamentoId) lista = lista.filter(c => c.departamentoId === Number(departamentoId));
        return lista.map(c => ({
            ...c,
            departamento: departamentos.find(d => d.id === c.departamentoId) || null,
            totalFuncionarios: funcionarios.filter(f => f.cargoId === c.id && f.status === 'ATIVO').length,
        }));
    },

    buscarCargo: async (req, res) => {
        const c = cargos.find(c => c.id === Number(req.params.id));
        if (!c) return res.status(404).send({ erro: "Cargo não encontrado" });
        return {
            ...c,
            departamento: departamentos.find(d => d.id === c.departamentoId) || null,
            funcionarios: funcionarios.filter(f => f.cargoId === c.id),
        };
    },

    criarCargo: async (req, res) => {
        const { nome, departamentoId, salarioBase } = req.body;
        if (!nome || !departamentoId || !salarioBase) {
            return res.status(400).send({ erro: "nome, departamentoId e salarioBase são obrigatórios" });
        }
        if (!departamentos.find(d => d.id === Number(departamentoId))) {
            return res.status(404).send({ erro: "Departamento não encontrado" });
        }
        const novo = { id: cargos.length + 1, nome, departamentoId: Number(departamentoId), salarioBase: Number(salarioBase) };
        cargos.push(novo);
        return res.status(201).send(novo);
    },

    atualizarCargo: async (req, res) => {
        const idx = cargos.findIndex(c => c.id === Number(req.params.id));
        if (idx === -1) return res.status(404).send({ erro: "Cargo não encontrado" });
        cargos[idx] = { ...cargos[idx], ...req.body };
        return cargos[idx];
    },

    excluirCargo: async (req, res) => {
        const id = Number(req.params.id);
        if (funcionarios.some(f => f.cargoId === id && f.status === 'ATIVO')) {
            return res.status(400).send({ erro: "Não é possível excluir um cargo com funcionários ativos" });
        }
        const idx = cargos.findIndex(c => c.id === id);
        if (idx === -1) return res.status(404).send({ erro: "Cargo não encontrado" });
        cargos.splice(idx, 1);
        return { mensagem: "Cargo removido" };
    },
};
