import { registrarAdmin, login } from '../controllers/usuarioControllers.js';

export async function usuarioRoutes(app) {
    app.post('/registrar', registrarAdmin);
    app.post('/login', login);
}