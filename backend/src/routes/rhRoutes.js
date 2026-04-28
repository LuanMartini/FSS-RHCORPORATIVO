import { rhController }          from '../controllers/rhController.js';
import { dashboardController }   from '../controllers/dashboardController.js';
import { folhaController }       from '../controllers/folhaController.js';
import { pontoController }       from '../controllers/pontoController.js';
import { estruturaController }   from '../controllers/estruturaController.js';
import { feriasController }      from '../controllers/feriasController.js';
import { beneficiosController }  from '../controllers/beneficiosController.js';
import { advertenciasController } from '../controllers/advertenciasController.js';
import { treinamentosController } from '../controllers/treinamentosController.js';

export async function rhRoutes(app) {

    // ── Autenticação obrigatória em todas as rotas ─────────────────────────
    app.addHook("onRequest", async (req, reply) => {
        try { await req.jwtVerify(); }
        catch { reply.status(401).send({ erro: "Acesso negado. Faça login primeiro." }); }
    });

    // ── Dashboard ──────────────────────────────────────────────────────────
    app.get('/dashboard', dashboardController.metricasGerais);

    // ── Funcionários ───────────────────────────────────────────────────────
    app.post('/admitir',              rhController.admitir);
    app.get('/funcionarios',          rhController.listarTodos);
    app.get('/funcionarios/:id',      rhController.buscarPorId);
    app.put('/funcionarios/:id',      rhController.atualizar);
    app.delete('/funcionarios/:id',   rhController.desligar);
    app.patch('/funcionarios/:id/salario',         rhController.reajustarSalario);
    app.get('/funcionarios/:id/historico-salarial', rhController.historicoSalarial);

    // ── Ponto ──────────────────────────────────────────────────────────────
    app.post('/ponto',                    pontoController.registrar);
    app.get('/ponto/:id',                 pontoController.espelhoPonto);
    app.patch('/ponto/registro/:id',      pontoController.corrigirPonto);

    // ── Folha de Pagamento ─────────────────────────────────────────────────
    app.get('/folha/:id',          folhaController.gerarHolerite);
    app.get('/folha',              folhaController.gerarFolhaCompleta);

    // ── Departamentos ──────────────────────────────────────────────────────
    app.get('/departamentos',           estruturaController.listarDepartamentos);
    app.get('/departamentos/:id',       estruturaController.buscarDepartamento);
    app.post('/departamentos',          estruturaController.criarDepartamento);
    app.put('/departamentos/:id',       estruturaController.atualizarDepartamento);
    app.delete('/departamentos/:id',    estruturaController.excluirDepartamento);

    // ── Cargos ─────────────────────────────────────────────────────────────
    app.get('/cargos',          estruturaController.listarCargos);
    app.get('/cargos/:id',      estruturaController.buscarCargo);
    app.post('/cargos',         estruturaController.criarCargo);
    app.put('/cargos/:id',      estruturaController.atualizarCargo);
    app.delete('/cargos/:id',   estruturaController.excluirCargo);

    // ── Férias ─────────────────────────────────────────────────────────────
    app.post('/ferias',                    feriasController.solicitar);
    app.get('/ferias',                     feriasController.listar);
    app.patch('/ferias/:id/aprovar',       feriasController.aprovar);
    app.patch('/ferias/:id/reprovar',      feriasController.reprovar);
    app.patch('/ferias/:id/encerrar',      feriasController.encerrar);

    // ── Benefícios ─────────────────────────────────────────────────────────
    app.get('/beneficios',                                      beneficiosController.listarBeneficios);
    app.post('/beneficios',                                     beneficiosController.criarBeneficio);
    app.post('/beneficios/vincular',                            beneficiosController.vincularFuncionario);
    app.delete('/beneficios/vinculo/:id',                       beneficiosController.desvincularFuncionario);
    app.get('/beneficios/funcionario/:funcionarioId',           beneficiosController.beneficiosPorFuncionario);

    // ── Advertências ───────────────────────────────────────────────────────
    app.post('/advertencias',                              advertenciasController.registrar);
    app.get('/advertencias',                               advertenciasController.listarTodas);
    app.get('/advertencias/funcionario/:funcionarioId',    advertenciasController.listarPorFuncionario);

    // ── Treinamentos ───────────────────────────────────────────────────────
    app.post('/treinamentos',                               treinamentosController.criar);
    app.get('/treinamentos',                                treinamentosController.listar);
    app.post('/treinamentos/inscrever',                     treinamentosController.inscrever);
    app.patch('/treinamentos/inscricao/:id/concluir',       treinamentosController.concluir);
    app.get('/treinamentos/funcionario/:funcionarioId',     treinamentosController.treinamentosPorFuncionario);
}
