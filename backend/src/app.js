import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import { usuarioRoutes } from './routes/usuarioRoutes.js';
import { rhRoutes } from './routes/rhRoutes.js';

const app = Fastify({ logger: false });

// JWT
app.register(jwt, { secret: process.env.JWT_SECRET || 'CHAVE_SECRETA_IFC' });

// Autenticação JWT para rotas fora do prefixo /rh
app.decorate('authenticate', async function(req, reply) {
    try { await req.jwtVerify(); }
    catch { reply.status(401).send({ erro: "Token inválido ou expirado" }); }
});

app.addHook('onRequest', async (req, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    if (req.method === 'OPTIONS') return reply.status(204).send();
});

app.get('/health', async () => ({ status: 'ok', versao: '2.0.0', timestamp: new Date().toISOString() }));

app.register(usuarioRoutes);
app.register(rhRoutes, { prefix: '/rh' });

export default app;
