import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import { usuarioRoutes } from './routes/usuarioRoutes.js';
import { rhRoutes } from './routes/rhRoutes.js';

const app = Fastify();

app.register(jwt, { secret: 'CHAVE_SECRETA_IFC' });

app.register(usuarioRoutes);
app.register(rhRoutes, { prefix: '/rh' });

export default app;