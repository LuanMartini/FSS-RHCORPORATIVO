// Dados em memória (substituir por persistência real quando necessário).

export const usuariosDB = [];

export const departamentos = [
    { id: 1, nome: "Tecnologia", sigla: "TI", gestorId: null },
    { id: 2, nome: "Recursos Humanos", sigla: "RH", gestorId: null },
    { id: 3, nome: "Financeiro", sigla: "FIN", gestorId: null },
    { id: 4, nome: "Comercial", sigla: "COM", gestorId: null },
];

export const cargos = [
    { id: 1, nome: "Desenvolvedor Júnior", departamentoId: 1, salarioBase: 3500 },
    { id: 2, nome: "Desenvolvedor Pleno",  departamentoId: 1, salarioBase: 6000 },
    { id: 3, nome: "Desenvolvedor Sênior", departamentoId: 1, salarioBase: 10000 },
    { id: 4, nome: "Analista de RH",       departamentoId: 2, salarioBase: 4000 },
    { id: 5, nome: "Analista Financeiro",  departamentoId: 3, salarioBase: 4800 },
    { id: 6, nome: "Gerente Comercial",    departamentoId: 4, salarioBase: 12000 },
];

export const funcionarios = [];
export const registrosPonto = [];
export const ferias = [];
export const advertencias = [];

export const beneficios = [
    { id: 1, nome: "Vale Refeição",   tipo: "VR",    valorMensal: 600 },
    { id: 2, nome: "Vale Transporte", tipo: "VT",    valorMensal: 220 },
    { id: 3, nome: "Plano de Saúde",  tipo: "SAUDE", valorMensal: 350 },
];

export const beneficiosFuncionario = [];
export const historicoSalarial = [];
export const treinamentos = [];
export const inscricoesTreinamento = [];
