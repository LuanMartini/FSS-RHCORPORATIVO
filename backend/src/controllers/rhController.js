import { funcionarios, registrosPonto } from '../config/db.js';

export const rhController = {
    admitir: async (req, res) => {
        const { nome, cpf, email, cargoId, salario } = req.body;
        const novo = { 
            id: funcionarios.length + 1, 
            nome, cpf, email, cargoId, salario, 
            status: "ATIVO", 
            dataAdmissao: new Date().toLocaleDateString('pt-BR') 
        };
        funcionarios.push(novo);
        return res.status(201).send(novo);
    },
    
    listarTodos: async () => funcionarios,

    registrarPonto: async (req, res) => {
        const { funcionarioId, tipo } = req.body; // 'ENTRADA' ou 'SAIDA'
        const registro = { 
            id: registrosPonto.length + 1, 
            funcionarioId, tipo, 
            data: new Date().toLocaleDateString('pt-BR'), 
            hora: new Date().toLocaleTimeString('pt-BR') 
        };
        registrosPonto.push(registro);
        return res.status(201).send(registro);
    },

    gerarHolerite: async (req, res) => {
        const { id } = req.params;
        const f = funcionarios.find(f => f.id == id);
        if (!f) return res.status(404).send({ erro: "Funcionário não encontrado" });
        
        const inss = f.salario * 0.11;
        return { 
            nome: f.nome, 
            bruto: f.salario, 
            descontos: { inss }, 
            liquido: f.salario - inss 
        };
    }
};