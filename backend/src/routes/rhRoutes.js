import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { authorize } from '../middleware/authorization.js';
import * as c from '../controllers/rhController.js';

const r = Router();
r.use(authMiddleware);

r.get('/dashboard', authorize('rh.dashboard.read'), c.dashboard);
r.get('/funcionarios', authorize('employee.read'), c.funcionarios);
r.delete('/funcionarios/:id', authorize('employee.terminate'), c.funcionarioDesligar);
r.get('/cargos', authorize('organization.read'), c.cargos);
r.get('/departamentos', authorize('organization.read'), c.departamentos);
r.post('/admitir', authorize('employee.write'), c.admitir);
r.post('/ponto', authorize('time.manage'), c.pontoPost);
r.get('/ponto/:funcionarioId', authorize('time.manage'), c.pontoEspelho);
r.get('/ferias', authorize('time.manage'), c.feriasList);
r.post('/ferias', authorize('time.manage'), c.feriasPost);
r.patch('/ferias/:id/aprovar', authorize('time.manage'), c.feriasAprovar);
r.patch('/ferias/:id/reprovar', authorize('time.manage'), c.feriasReprovar);
r.patch('/ferias/:id/encerrar', authorize('time.hr.approve'), c.feriasEncerrar);
r.get('/advertencias', authorize('employee.read'), c.advertenciasList);
r.post('/advertencias', authorize('employee.write'), c.advertenciasPost);
r.get('/beneficios', authorize('benefits.approve'), c.beneficiosList);
r.post('/beneficios', authorize('benefits.approve'), c.beneficiosPost);
r.post('/beneficios/vincular', authorize('benefits.approve'), c.beneficiosVincular);
r.get('/treinamentos', authorize('lms.use'), c.treinamentosList);
r.post('/treinamentos', authorize('employee.write'), c.treinamentosPost);
r.post('/treinamentos/inscrever', authorize('employee.write'), c.treinamentosInscrever);
r.get('/folha', authorize('payroll.read'), c.folhaCompleta);
r.get('/folha/:id', authorize('payroll.read'), c.folhaUm);
r.get('/vagas', authorize('ats.use'), c.vagasList);
r.post('/vagas', authorize('ats.use'), c.vagasPost);
r.get('/vagas/:vagaId/candidatos', authorize('ats.use'), c.candidatosList);
r.post('/candidatos', authorize('ats.use'), c.candidatosPost);
r.patch('/candidatos/:id/fase', authorize('ats.use'), c.candidatosPatchFase);

export default r;
