import { usuariosDB } from '../config/db.js';
import bcrypt from 'bcryptjs';

export const registrarAdmin = async (request, reply) => {
    const { nome, email, senha, role } = request.body;
    if (!nome || !email || !senha) {
        return reply.status(400).send({ erro: "nome, email e senha são obrigatórios" });
    }
    if (usuariosDB.find(u => u.email === email)) {
        return reply.status(409).send({ erro: "E-mail já cadastrado" });
    }

    const senhaCripto = await bcrypt.hash(senha, 10);
    const novoUsuario = {
        id: usuariosDB.length + 1,
        nome, email,
        senha: senhaCripto,
        role: role || 'ADMIN',
        ativo: true,
        criadoEm: new Date().toISOString(),
    };
    usuariosDB.push(novoUsuario);
    const { senha: _, ...dados } = novoUsuario;
    return reply.status(201).send({ mensagem: "Usuário criado com sucesso", usuario: dados });
};

export const login = async (request, reply) => {
    const { email, senha } = request.body;
    if (!email || !senha) {
        return reply.status(400).send({ erro: "email e senha são obrigatórios" });
    }

    const usuario = usuariosDB.find(u => u.email === email);
    if (!usuario || !usuario.ativo) {
        return reply.status(401).send({ erro: "Credenciais inválidas" });
    }

    const senhaValida = await bcrypt.compare(senha, usuario.senha);
    if (!senhaValida) return reply.status(401).send({ erro: "Credenciais inválidas" });

    const token = request.server.jwt.sign(
        { id: usuario.id, nome: usuario.nome, email: usuario.email, role: usuario.role },
        { expiresIn: '8h' }
    );

    return { token, usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, role: usuario.role } };
};

export const listarUsuarios = async (request, reply) => {
    if (request.user.role !== 'ADMIN') {
        return reply.status(403).send({ erro: "Acesso restrito a administradores" });
    }
    return usuariosDB.map(({ senha, ...u }) => u);
};

export const atualizarSenha = async (request, reply) => {
    const { senhaAtual, novaSenha } = request.body;
    const usuario = usuariosDB.find(u => u.id === request.user.id);

    const valida = await bcrypt.compare(senhaAtual, usuario.senha);
    if (!valida) return reply.status(400).send({ erro: "Senha atual incorreta" });
    if (!novaSenha || novaSenha.length < 6) {
        return reply.status(400).send({ erro: "Nova senha deve ter pelo menos 6 caracteres" });
    }

    usuario.senha = await bcrypt.hash(novaSenha, 10);
    return { mensagem: "Senha alterada com sucesso" };
};

export const desativarUsuario = async (request, reply) => {
    if (request.user.role !== 'ADMIN') {
        return reply.status(403).send({ erro: "Acesso restrito a administradores" });
    }
    const usuario = usuariosDB.find(u => u.id === Number(request.params.id));
    if (!usuario) return reply.status(404).send({ erro: "Usuário não encontrado" });
    usuario.ativo = false;
    return { mensagem: "Usuário desativado" };
};
