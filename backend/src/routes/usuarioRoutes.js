import { registrarAdmin, login, listarUsuarios, atualizarSenha, desativarUsuario } from '../controllers/usuarioControllers.js';

export async function usuarioRoutes(app) {
    app.post('/registrar', registrarAdmin);
    app.post('/login',     login);

    // Rotas protegidas
    app.get('/usuarios', { preHandler: [app.authenticate] }, listarUsuarios);
    app.put('/usuarios/senha', { preHandler: [app.authenticate] }, atualizarSenha);
    app.delete('/usuarios/:id', { preHandler: [app.authenticate] }, desativarUsuario);
}
