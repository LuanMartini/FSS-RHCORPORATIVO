import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const { createApp } = await import('../src/server.js');

function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, () => resolve(server));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

test('health check responde status operacional', async () => {
  const server = await listen(createApp());
  const address = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.service, 'rhcorp-api');
  } finally {
    await close(server);
  }
});

test('rotas do core exigem autenticacao', async () => {
  const server = await listen(createApp());
  const address = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/core/admissoes`);
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(body.erro, 'Token ausente');
  } finally {
    await close(server);
  }
});

test('rotas de jornada exigem autenticacao', async () => {
  const server = await listen(createApp());
  const address = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/jornada/colaboradores`);
    assert.equal(response.status, 401);
  } finally {
    await close(server);
  }
});

test('rotas de payroll exigem autenticacao', async () => {
  const server = await listen(createApp());
  const address = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/payroll/dashboard`);
    assert.equal(response.status, 401);
  } finally {
    await close(server);
  }
});

test('rotas administrativas do ATS exigem autenticacao', async () => {
  const server = await listen(createApp());
  const address = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/ats/vagas`);
    assert.equal(response.status, 401);
  } finally {
    await close(server);
  }
});

test('rotas de desempenho e sucessao exigem autenticacao', async () => {
  const server = await listen(createApp());
  const address = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/performance/dashboard`);
    assert.equal(response.status, 401);
  } finally {
    await close(server);
  }
});

test('rotas de beneficios flexiveis exigem autenticacao', async () => {
  const server = await listen(createApp());
  const address = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/flex-benefits/dashboard`);
    assert.equal(response.status, 401);
  } finally {
    await close(server);
  }
});

test('rotas do LMS exigem autenticacao', async () => {
  const server = await listen(createApp());
  const address = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/lms/dashboard`);
    assert.equal(response.status, 401);
  } finally {
    await close(server);
  }
});

test('rotas identificadas de clima exigem autenticacao', async () => {
  const server = await listen(createApp());
  const address = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/clima/dashboard`);
    assert.equal(response.status, 401);
  } finally {
    await close(server);
  }
});

test('painel de auditoria exige autenticacao', async () => {
  const server = await listen(createApp());
  const address = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/auditoria/dashboard`);
    assert.equal(response.status, 401);
  } finally {
    await close(server);
  }
});
