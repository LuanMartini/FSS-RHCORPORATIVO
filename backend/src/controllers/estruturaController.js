// src/controllers/estruturaController.js
import { departamentos, cargos } from '../config/db.js';

export const estruturaController = {
    // Listar todos os departamentos
    listarDepartamentos: async (req, res) => {
        return departamentos;
    },

    // Criar um novo setor
    criarDepartamento: async (req, res) => {
        const { nome, sigla } = req.body;
        const novoDepto = { id: departamentos.length + 1, nome, sigla };
        departamentos.push(novoDepto);
        return res.status(201).send(novoDepto);
    },

    // Criar um cargo dentro de um departamento
    criarCargo: async (req, res) => {
        const { nome, deptoId, salario } = req.body;
        const novoCargo = { id: cargos.length + 1, nome, departamentoId: deptoId, salarioBase: salario };
        cargos.push(novoCargo);
        return res.status(201).send(novoCargo);
    }
};