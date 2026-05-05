import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import * as c from '../controllers/rhController.js';

const r = Router();
r.use(authMiddleware);

r.get('/dashboard', c.dashboard);
r.get('/funcionarios', c.funcionarios);
r.delete('/funcionarios/:id', c.funcionarioDesligar);
r.get('/cargos', c.cargos);
r.get('/departamentos', c.departamentos);
r.post('/admitir', c.admitir);
r.post('/ponto', c.pontoPost);
r.get('/ponto/:funcionarioId', c.pontoEspelho);
r.get('/ferias', c.feriasList);
r.post('/ferias', c.feriasPost);
r.patch('/ferias/:id/aprovar', c.feriasAprovar);
r.patch('/ferias/:id/reprovar', c.feriasReprovar);
r.patch('/ferias/:id/encerrar', c.feriasEncerrar);
r.get('/advertencias', c.advertenciasList);
r.post('/advertencias', c.advertenciasPost);
r.get('/beneficios', c.beneficiosList);
r.post('/beneficios', c.beneficiosPost);
r.post('/beneficios/vincular', c.beneficiosVincular);
r.get('/treinamentos', c.treinamentosList);
r.post('/treinamentos', c.treinamentosPost);
r.post('/treinamentos/inscrever', c.treinamentosInscrever);
r.get('/folha', c.folhaCompleta);
r.get('/folha/:id', c.folhaUm);

export default r;
