const usuarioModel = require('../models/usuarioModel');

exports.criarUsuario = async (req, res) => {
    try {
        const { nome, email, idade } = req.body;
        const usuario = await usuarioModel.criarUsuario(nome, email, idade);
        res.status(201).json(usuario);
    } catch (error) {
        res.status(500).json({ erro: error.message });
    }
};

exports.listarUsuarios = async (req, res) => {
    try {
        const usuarios = await usuarioModel.listarUsuarios();
        res.json(usuarios);
    } catch (error) {
        res.status(500).json({ erro: error.message });
    }
};