import { funcionarios } from '../config/db.js';
import { calcularHolerite } from './rhController.js';

export const folhaController = {

    // Holerite individual
    gerarHolerite: async (req, res) => {
        const f = funcionarios.find(f => f.id === Number(req.params.id));
        if (!f) return res.status(404).send({ erro: "Funcionário não encontrado" });
        return calcularHolerite(f);
    },

    // Folha completa do mês (todos os ativos)
    gerarFolhaCompleta: async (req, res) => {
        const ativos = funcionarios.filter(f => f.status === "ATIVO");
        if (ativos.length === 0) return res.status(404).send({ erro: "Nenhum funcionário ativo" });

        const folha = ativos.map(f => calcularHolerite(f));

        const totalBruto    = folha.reduce((acc, h) => acc + Number(h.totalBruto), 0);
        const totalDescontos = folha.reduce((acc, h) => acc + Number(h.totalDescontos), 0);
        const totalLiquido  = folha.reduce((acc, h) => acc + Number(h.totalLiquido), 0);
        const totalFGTS     = folha.reduce((acc, h) => acc + Number(h.provisoes.fgts), 0);

        const now = new Date();
        return {
            mesReferencia: now.getMonth() + 1,
            anoReferencia: now.getFullYear(),
            totalFuncionarios: ativos.length,
            resumo: {
                totalBruto:    totalBruto.toFixed(2),
                totalDescontos: totalDescontos.toFixed(2),
                totalLiquido:  totalLiquido.toFixed(2),
                totalFGTS:     totalFGTS.toFixed(2),
                custoTotalEmpresa: (totalBruto + totalFGTS).toFixed(2),
            },
            holerites: folha,
        };
    },
};
