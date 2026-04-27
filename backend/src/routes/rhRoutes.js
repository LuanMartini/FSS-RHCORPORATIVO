import { rhController } from '../controllers/rhController.js';

export async function rhRoutes(app) {
    // Bloqueia acesso sem Token JWT
    app.addHook("onRequest", async (request, reply) => {
        try {
            await request.jwtVerify();
        } catch (err) {
            reply.status(401).send({ erro: "Acesso negado. Faça login primeiro." });
        }
    });

    app.post('/admitir', rhController.admitir);
    app.get('/funcionarios', rhController.listarTodos);
    app.post('/ponto', rhController.registrarPonto);
    app.get('/folha/:id', rhController.gerarHolerite);
}