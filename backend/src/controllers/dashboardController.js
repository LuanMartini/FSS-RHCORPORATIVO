import { funcionarios, departamentos, cargos, registrosPonto, ferias, historicoSalarial } from '../config/db.js';

export const dashboardController = {

    metricasGerais: async (req, res) => {
        const ativos      = funcionarios.filter(f => f.status === "ATIVO");
        const desligados  = funcionarios.filter(f => f.status === "DESLIGADO");
        const emFerias    = funcionarios.filter(f => f.status === "FERIAS");

        const totalSalarios  = ativos.reduce((acc, f) => acc + f.salario, 0);
        const mediaSalarial  = totalSalarios / (ativos.length || 1);
        const maiorSalario   = ativos.length ? Math.max(...ativos.map(f => f.salario)) : 0;
        const menorSalario   = ativos.length ? Math.min(...ativos.map(f => f.salario)) : 0;

        const porDepto = departamentos.map(d => ({
            departamento: d.nome,
            sigla: d.sigla,
            total: ativos.filter(f => f.departamentoId === d.id).length,
        })).filter(d => d.total > 0);

        return {
            colaboradores: {
                total: funcionarios.length,
                ativos: ativos.length,
                desligados: desligados.length,
                emFerias: emFerias.length,
            },
            folha: {
                custoMensalBruto:  totalSalarios.toFixed(2),
                mediaSalarial:     mediaSalarial.toFixed(2),
                maiorSalario:      maiorSalario.toFixed(2),
                menorSalario:      menorSalario.toFixed(2),
                custoFGTS:         (totalSalarios * 0.08).toFixed(2),
                custoTotalEmpresa: (totalSalarios * 1.08).toFixed(2),
            },
            estrutura: {
                totalDepartamentos: departamentos.length,
                totalCargos: cargos.length,
                distribuicaoPorDepto: porDepto,
            },
            pontoDoDia: {
                registrosHoje: registrosPonto.filter(p => {
                    const hoje = new Date().toLocaleDateString('pt-BR');
                    return p.data === hoje;
                }).length,
            },
        };
    },
};
