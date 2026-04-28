import app from './src/app.js';

const PORT = Number(process.env.PORT) || 3333;

app.listen({ port: PORT, host: '0.0.0.0' }).then(() => {
    console.log(`🚀 API RH Corporativo v2.0 rodando em http://localhost:${PORT}`);
    console.log('\n📋 Rotas disponíveis:');
    console.log('  POST   /registrar              → Criar usuário admin');
    console.log('  POST   /login                  → Autenticar');
    console.log('  GET    /health                 → Status da API');
    console.log('  GET    /rh/dashboard           → Métricas gerais');
    console.log('  POST   /rh/admitir             → Admitir funcionário');
    console.log('  GET    /rh/funcionarios        → Listar funcionários');
    console.log('  GET    /rh/funcionarios/:id    → Buscar funcionário');
    console.log('  PUT    /rh/funcionarios/:id    → Atualizar funcionário');
    console.log('  DELETE /rh/funcionarios/:id    → Desligar funcionário');
    console.log('  PATCH  /rh/funcionarios/:id/salario → Reajuste salarial');
    console.log('  POST   /rh/ponto               → Registrar ponto');
    console.log('  GET    /rh/ponto/:id           → Espelho de ponto');
    console.log('  GET    /rh/folha/:id           → Holerite individual');
    console.log('  GET    /rh/folha               → Folha completa do mês');
    console.log('  CRUD   /rh/departamentos       → Gestão de departamentos');
    console.log('  CRUD   /rh/cargos              → Gestão de cargos');
    console.log('  CRUD   /rh/ferias              → Solicitação e aprovação de férias');
    console.log('  CRUD   /rh/beneficios          → Gestão de benefícios');
    console.log('  POST   /rh/advertencias        → Registrar advertência');
    console.log('  CRUD   /rh/treinamentos        → Gestão de treinamentos');
});
