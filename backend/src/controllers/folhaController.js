import { funcionarios } from '../config/db.js';

export const folhaController = {
    gerarHolerite: async (req, res) => {
        const { id } = req.params;
        const f = funcionarios.find(f => f.id == id);
        
        if (!f) return res.status(404).send({ erro: "Funcionário não encontrado" });

        const salarioBruto = f.salario;
        const inss = salarioBruto * 0.11; // 11% fixo para o exemplo
        const salarioLiquido = salarioBruto - inss;

        return {
            funcionario: f.nome,
            cargoId: f.cargoId,
            vencimentos: {
                salarioBase: salarioBruto
            },
            descontos: {
                inss: inss.toFixed(2)
            },
            totalLiquido: salarioLiquido.toFixed(2),
            mesReferencia: new Date().getMonth() + 1
        };
    }
};