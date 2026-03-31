const express = require('express');
const app = express();

app.use(express.json());


const usuarioRoutes = require('./routes/usuarioRoutes');
app.use('/usuarios', usuarioRoutes);

module.exports = app;