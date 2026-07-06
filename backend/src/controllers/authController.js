import bcrypt from 'bcryptjs';
import * as authModel from '../models/auth.js';
import { signToken } from '../middleware/auth.js';

export async function login(req, res) {
  try {
    const { email, senha } = req.body ?? {};
    if (!email || !senha) return res.status(400).json({ erro: 'E-mail e senha obrigatórios' });
    const u = await authModel.findUserByEmail(String(email).trim().toLowerCase());
    if (!u || !(await bcrypt.compare(senha, u.senha_hash))) {
      return res.status(401).json({ erro: 'Credenciais inválidas' });
    }
    const token = signToken({ sub: u.id, email: u.email });
    res.json({
      token,
      usuario: { nome: u.nome, email: u.email },
    });
  } catch (e) {
    res.status(500).json({ erro: e.message || 'Erro no login' });
  }
}

export async function registrar(req, res) {
  try {
    const allowRegistration = process.env.ALLOW_ADMIN_REGISTRATION === 'true';
    if (!allowRegistration && (await authModel.countUsers()) > 0) {
      return res.status(403).json({
        erro: 'Cadastro de administradores desabilitado. Use o administrador inicial ou habilite ALLOW_ADMIN_REGISTRATION=true.',
      });
    }

    const { nome, email, senha } = req.body ?? {};
    if (!nome || !email || !senha) return res.status(400).json({ erro: 'Preencha todos os campos' });
    if (String(senha).length < 6) return res.status(400).json({ erro: 'Senha mínimo 6 caracteres' });
    const em = String(email).trim().toLowerCase();
    if (await authModel.findUserByEmail(em)) {
      return res.status(409).json({ erro: 'E-mail já cadastrado' });
    }
    const senhaHash = await bcrypt.hash(String(senha), 10);
    await authModel.createUser({ nome: String(nome).trim(), email: em, senhaHash });
    res.status(201).json({ ok: true });
  } catch (e) {
    res.status(500).json({ erro: e.message || 'Erro ao registrar' });
  }
}
