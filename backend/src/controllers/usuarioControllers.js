import { usuariosDB } from '../config/db.js';
import bcrypt from 'bcryptjs';

export const registrarAdmin = async (request, reply) => {
    const { nome, email, senha } = request.body;
    const senhaCripto = await bcrypt.hash(senha, 8);
    usuariosDB.push({ id: usuariosDB.length + 1, nome, email, senha: senhaCripto, role: 'ADMIN' });
    return reply.status(201).send({ mensagem: "Administrador criado com sucesso" });
};

export const login = async (request, reply) => {
    const { email, senha } = request.body;
    const usuario = usuariosDB.find(u => u.email === email);
    if (!usuario) return reply.status(401).send({ erro: "Usuário não encontrado" });

    const senhaValida = await bcrypt.compare(senha, usuario.senha);
    if (!senhaValida) return reply.status(401).send({ erro: "Senha incorreta" });

    const token = request.server.jwt.sign({ id: usuario.id, role: usuario.role }, { expiresIn: '1d' });
    return { token };
};