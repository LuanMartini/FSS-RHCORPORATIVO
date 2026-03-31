const db = require('../config/db');

const criarUsuario = async (nome, email, idade) => {
    const query = `
        INSERT INTO usuarios (nome, email, idade)
        VALUES ($1, $2, $3)
        RETURNING *
    `;
    
    const values = [nome, email, idade];
    const result = await db.query(query, values);
    return result.rows[0];
};

const listarUsuarios = async () => {
    const result = await db.query('SELECT * FROM usuarios');
    return result.rows;
};

module.exports = {
    criarUsuario,
    listarUsuarios
};