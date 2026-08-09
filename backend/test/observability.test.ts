import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import express from 'express';
import { errorLogFields, sanitizeForObservability } from '../src/observability/logger.js';
import { requestIdMiddleware } from '../src/observability/metrics.js';

process.env.NODE_ENV = 'test';

async function listen(app: http.RequestListener): Promise<http.Server> {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  return server;
}

async function withServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const { createApp } = await import('../src/server.js');
  const server = await listen(createApp());
  try {
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('redige senha, token, CPF e valor salarial antes de registrar erro', () => {
  const raw = 'senha=super-segreda token=abc.def.ghi CPF: 123.456.789-09 salario=12450 Bearer eyJhbGciOiJIUzI1NiJ9.a.b';
  const sanitized = sanitizeForObservability(raw);
  assert.equal(sanitized.includes('super-segreda'), false);
  assert.equal(sanitized.includes('abc.def.ghi'), false);
  assert.equal(sanitized.includes('123.456.789-09'), false);
  assert.equal(sanitized.includes('12450'), false);
  assert.equal(sanitized.includes('eyJhbGciOiJIUzI1NiJ9.a.b'), false);
  const fields = errorLogFields(new Error(raw));
  assert.equal(JSON.stringify(fields).includes('super-segreda'), false);
});

test('middleware de erro devolve resposta generica sem vazar o valor sensivel', async () => {
  const { errorCaptureMiddleware } = await import('../src/server.js');
  const app = express();
  app.use(requestIdMiddleware);
  app.get('/falha', (_req, _res, next) => next(new Error('cpf=12345678909 senha=super-segreda salario=12450')));
  app.use(errorCaptureMiddleware);
  const server = await listen(app);
  try {
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const response = await fetch(`http://127.0.0.1:${address.port}/falha`);
    assert.equal(response.status, 500);
    const body = await response.text();
    assert.match(body, /Erro interno do servidor/);
    assert.equal(body.includes('12345678909'), false);
    assert.equal(body.includes('super-segreda'), false);
    assert.equal(body.includes('12450'), false);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('propaga request-id e protege o endpoint de metricas', { concurrency: false }, async () => {
  const previous = {
    enabled: process.env.METRICS_ENABLED,
    token: process.env.METRICS_TOKEN,
    timeout: process.env.PG_CONNECT_TIMEOUT_MS,
  };
  try {
    process.env.METRICS_ENABLED = 'true';
    process.env.METRICS_TOKEN = 'metricas-segredo-de-teste';
    process.env.PG_CONNECT_TIMEOUT_MS = '100';
    await withServer(async (baseUrl) => {
      const health = await fetch(`${baseUrl}/health`, { headers: { 'x-request-id': 'trace-test-0001' } });
      assert.equal(health.status, 200);
      assert.equal(health.headers.get('x-request-id'), 'trace-test-0001');
      assert.equal(health.headers.get('x-correlation-id'), 'trace-test-0001');

      const denied = await fetch(`${baseUrl}/metrics`);
      assert.equal(denied.status, 401);

      const metrics = await fetch(`${baseUrl}/metrics`, { headers: { 'x-metrics-token': 'metricas-segredo-de-teste' } });
      assert.equal(metrics.status, 200);
      assert.match(await metrics.text(), /rhcorp_http_requests_total/);
    });
  } finally {
    if (previous.enabled === undefined) delete process.env.METRICS_ENABLED; else process.env.METRICS_ENABLED = previous.enabled;
    if (previous.token === undefined) delete process.env.METRICS_TOKEN; else process.env.METRICS_TOKEN = previous.token;
    if (previous.timeout === undefined) delete process.env.PG_CONNECT_TIMEOUT_MS; else process.env.PG_CONNECT_TIMEOUT_MS = previous.timeout;
  }
});
