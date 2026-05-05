import bcrypt from 'bcryptjs';
import { all, execRaw, isMysql } from './client.js';

const pgStmts = [
  `CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(120) NOT NULL,
    email VARCHAR(180) NOT NULL UNIQUE,
    senha_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS departamentos (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(120) NOT NULL,
    sigla VARCHAR(16) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS cargos (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(120) NOT NULL,
    departamento_id INT NOT NULL REFERENCES departamentos(id),
    salario_base DECIMAL(12,2) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS funcionarios (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(180) NOT NULL,
    cpf VARCHAR(14) NOT NULL UNIQUE,
    email VARCHAR(180) NOT NULL,
    cargo_id INT NOT NULL REFERENCES cargos(id),
    departamento_id INT NOT NULL REFERENCES departamentos(id),
    salario DECIMAL(12,2) NOT NULL,
    telefone VARCHAR(32),
    data_nascimento DATE,
    status VARCHAR(24) NOT NULL DEFAULT 'ATIVO',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS registros_ponto (
    id SERIAL PRIMARY KEY,
    funcionario_id INT NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
    tipo VARCHAR(32) NOT NULL,
    registrado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS ferias (
    id SERIAL PRIMARY KEY,
    funcionario_id INT NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
    data_inicio DATE NOT NULL,
    data_fim DATE NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'PENDENTE',
    observacao TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS advertencias (
    id SERIAL PRIMARY KEY,
    funcionario_id INT NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
    tipo VARCHAR(32) NOT NULL,
    descricao TEXT NOT NULL,
    data_ocorrencia DATE
  )`,
  `CREATE TABLE IF NOT EXISTS beneficios (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(120) NOT NULL,
    tipo VARCHAR(64) NOT NULL,
    valor_mensal DECIMAL(12,2) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS funcionario_beneficio (
    funcionario_id INT NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
    beneficio_id INT NOT NULL REFERENCES beneficios(id) ON DELETE CASCADE,
    PRIMARY KEY (funcionario_id, beneficio_id)
  )`,
  `CREATE TABLE IF NOT EXISTS treinamentos (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(180) NOT NULL,
    carga_horaria INT NOT NULL,
    modalidade VARCHAR(32) NOT NULL DEFAULT 'PRESENCIAL',
    descricao TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS funcionario_treinamento (
    funcionario_id INT NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
    treinamento_id INT NOT NULL REFERENCES treinamentos(id) ON DELETE CASCADE,
    PRIMARY KEY (funcionario_id, treinamento_id)
  )`,
];

async function runPg() {
  for (const s of pgStmts) await execRaw(s);
}

const mysqlStmts = [
  `CREATE TABLE IF NOT EXISTS usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(120) NOT NULL,
    email VARCHAR(180) NOT NULL UNIQUE,
    senha_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS departamentos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(120) NOT NULL,
    sigla VARCHAR(16) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS cargos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(120) NOT NULL,
    departamento_id INT NOT NULL,
    salario_base DECIMAL(12,2) NOT NULL,
    FOREIGN KEY (departamento_id) REFERENCES departamentos(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS funcionarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(180) NOT NULL,
    cpf VARCHAR(14) NOT NULL UNIQUE,
    email VARCHAR(180) NOT NULL,
    cargo_id INT NOT NULL,
    departamento_id INT NOT NULL,
    salario DECIMAL(12,2) NOT NULL,
    telefone VARCHAR(32),
    data_nascimento DATE,
    status VARCHAR(24) NOT NULL DEFAULT 'ATIVO',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cargo_id) REFERENCES cargos(id),
    FOREIGN KEY (departamento_id) REFERENCES departamentos(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS registros_ponto (
    id INT AUTO_INCREMENT PRIMARY KEY,
    funcionario_id INT NOT NULL,
    tipo VARCHAR(32) NOT NULL,
    registrado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS ferias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    funcionario_id INT NOT NULL,
    data_inicio DATE NOT NULL,
    data_fim DATE NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'PENDENTE',
    observacao TEXT,
    FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS advertencias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    funcionario_id INT NOT NULL,
    tipo VARCHAR(32) NOT NULL,
    descricao TEXT NOT NULL,
    data_ocorrencia DATE,
    FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS beneficios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(120) NOT NULL,
    tipo VARCHAR(64) NOT NULL,
    valor_mensal DECIMAL(12,2) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS funcionario_beneficio (
    funcionario_id INT NOT NULL,
    beneficio_id INT NOT NULL,
    PRIMARY KEY (funcionario_id, beneficio_id),
    FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id) ON DELETE CASCADE,
    FOREIGN KEY (beneficio_id) REFERENCES beneficios(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS treinamentos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(180) NOT NULL,
    carga_horaria INT UNSIGNED NOT NULL,
    modalidade VARCHAR(32) NOT NULL DEFAULT 'PRESENCIAL',
    descricao TEXT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS funcionario_treinamento (
    funcionario_id INT NOT NULL,
    treinamento_id INT NOT NULL,
    PRIMARY KEY (funcionario_id, treinamento_id),
    FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id) ON DELETE CASCADE,
    FOREIGN KEY (treinamento_id) REFERENCES treinamentos(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];

async function runMysql() {
  for (const s of mysqlStmts) await execRaw(s);
}

export async function ensureSchema() {
  if (isMysql) await runMysql();
  else await runPg();
}

export async function seedIfEmpty() {
  const u = await all('SELECT COUNT(*) AS c FROM usuarios');
  const n = Number(u[0]?.c ?? 0);
  if (n > 0) return;
  const hash = await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD || 'admin123', 10);
  await run(
    'INSERT INTO usuarios (nome, email, senha_hash) VALUES (?, ?, ?)',
    ['Administrador', process.env.SEED_ADMIN_EMAIL || 'admin@empresa.com', hash]
  );
  await run(
    'INSERT INTO departamentos (nome, sigla) VALUES (?, ?), (?, ?)',
    ['Recursos Humanos', 'RH', 'Tecnologia', 'TI']
  );
  const depts = await all('SELECT id, sigla FROM departamentos ORDER BY id');
  const rh = depts.find((d) => d.sigla === 'RH').id;
  const ti = depts.find((d) => d.sigla === 'TI').id;
  await run(
    `INSERT INTO cargos (nome, departamento_id, salario_base) VALUES
      (?, ?, ?), (?, ?, ?), (?, ?, ?)`,
    ['Analista de RH', rh, 4200, 'Desenvolvedor', ti, 8500, 'Gerente de TI', ti, 12000]
  );
}
