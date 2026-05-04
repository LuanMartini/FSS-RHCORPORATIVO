import app from './src/app.js';

const PORT = Number(process.env.PORT) || 3333;

app.listen({ port: PORT, host: '0.0.0.0' }).then(() => {
    console.log(`API RH Corporativo v2.0 em http://localhost:${PORT}`);
});
