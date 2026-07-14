import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSentiment, credentialFingerprint, identityProof, remainingKudos, sanitizeAnonymousText, validateEnpsScore } from '../src/climate/domain/climateEngine.js';
import { encryptFeedback, issueAnonymousBallot, verifyAnonymousBallot } from '../src/climate/application/climateSecurity.js';

test('comprovante de participacao e deterministico por pesquisa sem expor o usuario', () => {
  const first = identityProof('segredo-forte', 10, 42);
  assert.equal(first, identityProof('segredo-forte', 10, 42));
  assert.notEqual(first, identityProof('segredo-forte', 11, 42));
  assert.notEqual(first, identityProof('segredo-forte', 10, 43));
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.notEqual(first, '42');
});

test('credencial anonima carrega somente pesquisa, departamento e nonce', () => {
  const token = issueAnonymousBallot({ jti: 'b2f95373-bbd2-4184-8212-30fa1f50c310', pollId: 3, departmentId: 8, sub: 'anonymous-ballot' });
  const claims = verifyAnonymousBallot(token);
  assert.deepEqual(claims, { jti: 'b2f95373-bbd2-4184-8212-30fa1f50c310', pollId: 3, departmentId: 8, sub: 'anonymous-ballot' });
  assert.equal('userId' in claims, false);
  assert.match(credentialFingerprint('outro-segredo', claims.pollId, claims.jti), /^[0-9a-f]{64}$/);
});

test('anonimizacao remove email, CPF, telefone e mencao do feedback', () => {
  const result = sanitizeAnonymousText('Meu email ana@empresa.com, CPF 123.456.789-01, telefone (11) 98888-7777 e @gestor.');
  assert.equal(result.includes('ana@empresa.com'), false);
  assert.equal(result.includes('123.456.789-01'), false);
  assert.equal(result.includes('98888-7777'), false);
  assert.equal(result.includes('@gestor'), false);
});

test('classifica sentimento em portugues e preserva apenas o texto sanitizado', () => {
  const positive = analyzeSentiment('Excelente colaboração, apoio e reconhecimento!');
  const negative = analyzeSentiment('Muita pressão, sobrecarga e estresse.', true);
  assert.equal(positive.label, 'POSITIVO');
  assert.equal(negative.label, 'NEGATIVO');
  assert.ok(positive.confidence > 0.5);
});

test('feedback usa AES-GCM com nonce aleatorio', () => {
  const first = encryptFeedback('feedback protegido');
  const second = encryptFeedback('feedback protegido');
  assert.ok(first && second);
  assert.equal(first.iv.length, 12);
  assert.equal(first.tag.length, 16);
  assert.notDeepEqual(first.ciphertext, Buffer.from('feedback protegido'));
  assert.notDeepEqual(first.iv, second.iv);
});

test('valida escala e saldo semanal de Kudos', () => {
  assert.equal(validateEnpsScore(10), 10);
  assert.throws(() => validateEnpsScore(11), /inteiro entre 0 e 10/);
  assert.equal(remainingKudos(5, 3), 1);
  assert.throws(() => remainingKudos(5, 5), /insuficiente/);
});
