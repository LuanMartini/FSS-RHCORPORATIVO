import { registrosPonto, funcionarios } from '../config/db.js';

export const pontoController = {
    registrar: async (req, res) => {
        const { funcionarioId, tipo } = req.body; // tipo: 'ENTRADA' ou 'SAIDA'
        
        const f = funcionarios.find(f => f.id == funcionarioId);
        if (!f) return res.status(404).send({ erro: "Funcionário não encontrado" });

        const registro = {
            id: registrosPonto.length + 1,
            funcionarioId,
            data: new Date().toLocaleDateString('pt-BR'),
            hora: new Date().toLocaleTimeString('pt-BR'),
            tipo
        };

        registrosPonto.push(registro);
        return res.status(201).send(registro);
    },

    espelhoPonto: async (req, res) => {
        const { id } = req.params;
        return registrosPonto.filter(p => p.funcionarioId == id);
    }
};