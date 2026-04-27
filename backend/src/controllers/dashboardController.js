import { funcionarios, departamentos } from '../config/db.js';

export const dashboardController = {
    metricasGerais: async (req, res) => {
        const totalSalarios = funcionarios.reduce((acc, f) => acc + f.salario, 0);
        const mediaSalarial = totalSalarios / (funcionarios.length || 1);
        const ativos = funcionarios.filter(f => f.status === "ATIVO").length;

        return {
            colaboradoresAtivos: ativos,
            custoMensalFolha: totalSalarios.toFixed(2),
            mediaSalarial: mediaSalarial.toFixed(2),
            totalDepartamentos: departamentos.length
        };
    }
};