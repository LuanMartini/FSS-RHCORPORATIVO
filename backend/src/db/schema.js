import bcrypt from 'bcryptjs';
import { all, execRaw, isMysql, run } from './client.js';

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

  `CREATE TABLE IF NOT EXISTS vagas (
    id SERIAL PRIMARY KEY,
    titulo VARCHAR(120) NOT NULL,
    departamento_id INT NOT NULL REFERENCES departamentos(id),
    descricao TEXT NOT NULL,
    status VARCHAR(24) DEFAULT 'ABERTA',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS candidatos (
    id SERIAL PRIMARY KEY,
    vaga_id INT NOT NULL REFERENCES vagas(id) ON DELETE CASCADE,
    nome VARCHAR(180) NOT NULL,
    email VARCHAR(180) NOT NULL,
    telefone VARCHAR(32),
    link_curriculo VARCHAR(255),
    fase VARCHAR(32) DEFAULT 'TRIAGEM',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`
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

  `CREATE TABLE IF NOT EXISTS vagas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    titulo VARCHAR(120) NOT NULL,
    departamento_id INT NOT NULL,
    descricao TEXT NOT NULL,
    status VARCHAR(24) DEFAULT 'ABERTA',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (departamento_id) REFERENCES departamentos(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS candidatos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    vaga_id INT NOT NULL,
    nome VARCHAR(180) NOT NULL,
    email VARCHAR(180) NOT NULL,
    telefone VARCHAR(32),
    link_curriculo VARCHAR(255),
    fase VARCHAR(32) DEFAULT 'TRIAGEM',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (vaga_id) REFERENCES vagas(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
];

async function runMysql() {
  for (const s of mysqlStmts) await execRaw(s);
}

export async function ensureBaseSchema() {
  if (isMysql) await runMysql();
  else await runPg();
}

// Compatibilidade para ferramentas antigas. A API nao chama este metodo.
export const ensureSchema = ensureBaseSchema;

export async function seedIfEmpty() {
  if ((await countTable('usuarios')) === 0) {
    if (process.env.NODE_ENV === 'production' && !process.env.SEED_ADMIN_PASSWORD) {
      throw new Error('SEED_ADMIN_PASSWORD e obrigatoria para seed explicito em producao.');
    }
    const hash = await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD || 'admin123', 10);
    const email = process.env.SEED_ADMIN_EMAIL || 'admin@empresa.com';
    await run(
      isMysql
        ? 'INSERT INTO usuarios (nome, email, senha_hash) VALUES (?, ?, ?)'
        : "INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES (?, ?, ?, 'ADMINISTRADOR')",
      ['Administrador', email, hash]
    );
  }

  if ((await countTable('departamentos')) === 0) {
    await run(
      `INSERT INTO departamentos (nome, sigla, codigo) VALUES
       (?, ?, ?), (?, ?, ?), (?, ?, ?)`,
      ['Recursos Humanos', 'RH', 'RH', 'Tecnologia', 'TI', 'TI', 'Financeiro', 'FIN', 'FIN']
    );
  }

  await ensureDepartamento('Recursos Humanos', 'RH');
  await ensureDepartamento('Tecnologia', 'TI');
  await ensureDepartamento('Financeiro', 'FIN');

  if ((await countTable('cargos')) === 0) {
    const { rh, ti, fin } = await getDepartamentoIds();
    await run(
      `INSERT INTO cargos (nome, departamento_id, salario_base) VALUES
       (?, ?, ?), (?, ?, ?), (?, ?, ?), (?, ?, ?)`,
      [
        'Analista de RH',
        rh,
        4200.0,
        'Desenvolvedor',
        ti,
        8500.0,
        'Gerente de TI',
        ti,
        12000.0,
        'Analista Financeiro',
        fin,
        6100.0,
      ]
    );
  }

  const { rh, ti, fin } = await getDepartamentoIds();
  await ensureCargo('Analista de RH', rh, 4200.0);
  await ensureCargo('Desenvolvedor', ti, 8500.0);
  await ensureCargo('Gerente de TI', ti, 12000.0);
  await ensureCargo('Analista Financeiro', fin, 6100.0);

  if ((await countTable('funcionarios')) === 0) {
    const cargos = await all(
      `SELECT c.id, c.nome, c.departamento_id, c.salario_base
       FROM cargos c ORDER BY c.id`
    );
    const porNome = (nome) => cargos.find((c) => c.nome === nome) ?? cargos[0];
    const amanda = porNome('Analista de RH');
    const bruno = porNome('Desenvolvedor');
    const clara = porNome('Analista Financeiro');

    await run(
      `INSERT INTO funcionarios
       (nome, cpf, email, cargo_id, departamento_id, salario, telefone, data_nascimento, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ATIVO'),
              (?, ?, ?, ?, ?, ?, ?, ?, 'ATIVO'),
              (?, ?, ?, ?, ?, ?, ?, ?, 'FERIAS')`,
      [
        'Amanda Souza',
        '12345678901',
        'amanda.souza@empresa.com',
        amanda.id,
        amanda.departamento_id,
        amanda.salario_base,
        '(11) 98888-1001',
        '1991-04-18',
        'Bruno Lima',
        '23456789012',
        'bruno.lima@empresa.com',
        bruno.id,
        bruno.departamento_id,
        bruno.salario_base,
        '(11) 97777-2002',
        '1988-09-03',
        'Clara Mendes',
        '34567890123',
        'clara.mendes@empresa.com',
        clara.id,
        clara.departamento_id,
        clara.salario_base,
        '(11) 96666-3003',
        '1994-01-27',
      ]
    );
  }

  if (!isMysql) {
    await run(
      `INSERT INTO colaboradores
       (nome_completo, cpf, email, telefone, data_nascimento, cargo_id, departamento_id, salario, data_admissao, status, etapa_admissao)
       SELECT f.nome, f.cpf, f.email, f.telefone, f.data_nascimento, f.cargo_id, f.departamento_id, f.salario,
              CURRENT_DATE, CASE WHEN f.status = 'ATIVO' THEN 'ATIVO' ELSE 'AFASTADO' END, 'CONCLUIDA'
       FROM funcionarios f
       ON CONFLICT (cpf) DO NOTHING`
    );
    await run(
      `INSERT INTO funcionarios_colaboradores (funcionario_id,colaborador_id)
       SELECT f.id,c.id FROM funcionarios f JOIN colaboradores c ON c.cpf=f.cpf
       ON CONFLICT DO NOTHING`
    );
    await run(
      `INSERT INTO carteira_colaborador (colaborador_id,competencia,saldo_total_centavos,saldo_alocado_centavos)
       SELECT c.id,date_trunc('month',current_date)::date,120000,0 FROM colaboradores c WHERE c.status<>'DESLIGADO'
       ON CONFLICT (colaborador_id,competencia) DO NOTHING`
    );
    await run(
      `INSERT INTO periodos_aquisitivos_ferias
       (colaborador_id,inicio_em,fim_em,disponivel_em,dias_direito)
       SELECT c.id,COALESCE(c.data_admissao,c.created_at::date),
         COALESCE(c.data_admissao,c.created_at::date)+interval '1 year'-interval '1 day',
         COALESCE(c.data_admissao,c.created_at::date)+interval '1 year',30
       FROM colaboradores c ON CONFLICT (colaborador_id,inicio_em) DO NOTHING`
    );
    await run(
      `INSERT INTO matriculas_cursos (colaborador_id, curso_id)
       SELECT c.id, curso.id FROM colaboradores c CROSS JOIN cursos curso
       WHERE c.status = 'ATIVO' AND curso.ativo
       ON CONFLICT (colaborador_id, curso_id) DO NOTHING`
    );
    await run(
      `INSERT INTO usuarios_colaboradores (usuario_id,colaborador_id)
       SELECT u.id,c.id FROM usuarios u JOIN colaboradores c ON lower(c.email)=lower(u.email)
       ON CONFLICT DO NOTHING`
    );
    await run(
      `INSERT INTO usuarios_colaboradores (usuario_id,colaborador_id)
       SELECT u.id,c.id FROM usuarios u
       CROSS JOIN LATERAL (SELECT c0.id FROM colaboradores c0 WHERE c0.status='ATIVO'
         AND NOT EXISTS (SELECT 1 FROM usuarios_colaboradores uc0 WHERE uc0.colaborador_id=c0.id)
         ORDER BY c0.id LIMIT 1) c
       WHERE NOT EXISTS (SELECT 1 FROM usuarios_colaboradores uc WHERE uc.usuario_id=u.id)
         AND NOT EXISTS (SELECT 1 FROM usuarios_colaboradores uc WHERE uc.colaborador_id=c.id)
       ON CONFLICT DO NOTHING`
    );
    await run(
      `INSERT INTO historico_contratos
       (colaborador_id,departamento_id,cargo_id,salario_centavos,data_admissao,data_desligamento,
        desligamento_voluntario,tipo_contrato,vigencia,fonte)
       SELECT c.id,c.departamento_id,c.cargo_id,round(COALESCE(c.salario,0)*100)::bigint,
              COALESCE(c.data_admissao,c.created_at::date),
              CASE WHEN c.status='DESLIGADO' THEN c.updated_at::date ELSE NULL END,
              NULL,'CLT',daterange(COALESCE(c.data_admissao,c.created_at::date),
                CASE WHEN c.status='DESLIGADO' THEN c.updated_at::date + 1 ELSE NULL END,'[)'),
              'SINCRONIZACAO_CORE'
       FROM colaboradores c
       WHERE c.departamento_id IS NOT NULL AND c.cargo_id IS NOT NULL
       ON CONFLICT (colaborador_id,data_admissao,versao) DO NOTHING`
    );
  }

  if ((await countTable('beneficios')) === 0) {
    await run(
      `INSERT INTO beneficios (nome, tipo, valor_mensal) VALUES
       (?, ?, ?), (?, ?, ?), (?, ?, ?)`,
      [
        'Vale Refeicao',
        'VR',
        750.0,
        'Vale Transporte',
        'VT',
        320.0,
        'Plano de Saude',
        'SAUDE',
        590.0,
      ]
    );
  }

  if ((await countTable('treinamentos')) === 0) {
    await run(
      `INSERT INTO treinamentos (nome, carga_horaria, modalidade, descricao) VALUES
       (?, ?, ?, ?), (?, ?, ?, ?)`,
      [
        'Integracao corporativa',
        8,
        'ONLINE',
        'Onboarding para novos colaboradores',
        'LGPD aplicada ao RH',
        6,
        'HIBRIDO',
        'Boas praticas para tratamento de dados pessoais',
      ]
    );
  }

  if ((await countTable('vagas')) === 0) {
    const { rh, ti } = await getDepartamentoIds();
    await run(
      `INSERT INTO vagas (titulo, departamento_id, descricao, status) VALUES
       (?, ?, ?, ?), (?, ?, ?, ?)`,
      [
        'Assistente de RH',
        rh,
        'Apoio em admissoes, ferias, ponto e atendimento interno.',
        'ABERTA',
        'Desenvolvedor Front-end',
        ti,
        'Construcao de interfaces internas para operacoes corporativas.',
        'ABERTA',
      ]
    );
  }
}

async function countTable(table) {
  const rows = await all(`SELECT COUNT(*) AS c FROM ${table}`);
  return Number(rows[0]?.c ?? rows[0]?.['COUNT(*)'] ?? 0);
}

async function getDepartamentoIds() {
  const depts = await all('SELECT id, sigla FROM departamentos ORDER BY id');
  const bySigla = (sigla) => depts.find((d) => d.sigla === sigla)?.id ?? depts[0]?.id;
  return {
    rh: bySigla('RH'),
    ti: bySigla('TI'),
    fin: bySigla('FIN'),
  };
}

async function ensureDepartamento(nome, sigla) {
  const rows = await all('SELECT id FROM departamentos WHERE sigla = ? LIMIT 1', [sigla]);
  if (rows.length > 0) return rows[0].id;
  await run('INSERT INTO departamentos (nome, sigla, codigo) VALUES (?, ?, ?)', [nome, sigla, sigla]);
  const created = await all('SELECT id FROM departamentos WHERE sigla = ? LIMIT 1', [sigla]);
  return created[0]?.id;
}

async function ensureCargo(nome, departamentoId, salarioBase) {
  const rows = await all('SELECT id FROM cargos WHERE nome = ? LIMIT 1', [nome]);
  if (rows.length > 0) return rows[0].id;
  await run(
    'INSERT INTO cargos (nome, departamento_id, salario_base) VALUES (?, ?, ?)',
    [nome, departamentoId, salarioBase]
  );
  const created = await all('SELECT id FROM cargos WHERE nome = ? LIMIT 1', [nome]);
  return created[0]?.id;
}
