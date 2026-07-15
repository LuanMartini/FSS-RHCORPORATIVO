import test from 'node:test';
import assert from 'node:assert/strict';
import { getEnv } from '../src/config/env.js';
import { scanBuffer } from '../src/security/malwareScanner.js';

test('TTL anunciado pela API deriva da mesma configuracao usada no JWT', () => {
  const previous=process.env.JWT_ACCESS_TTL;
  try{process.env.JWT_ACCESS_TTL='2h';assert.equal(getEnv().jwtAccessTtlSeconds,7200);process.env.JWT_ACCESS_TTL='45m';assert.equal(getEnv().jwtAccessTtlSeconds,2700);}
  finally{if(previous===undefined)delete process.env.JWT_ACCESS_TTL;else process.env.JWT_ACCESS_TTL=previous;}
});

test('scanner antimalware permite desenvolvimento sem fingir que escaneou', async () => {
  const previousNode=process.env.NODE_ENV;const previousUrl=process.env.MALWARE_SCANNER_URL;
  try{process.env.NODE_ENV='test';delete process.env.MALWARE_SCANNER_URL;assert.deepEqual(await scanBuffer(Buffer.from('safe')),{status:'NOT_CONFIGURED'});}
  finally{if(previousNode===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previousNode;if(previousUrl===undefined)delete process.env.MALWARE_SCANNER_URL;else process.env.MALWARE_SCANNER_URL=previousUrl;}
});

test('scanner antimalware falha fechado em producao sem provedor', async () => {
  const previousNode=process.env.NODE_ENV;const previousUrl=process.env.MALWARE_SCANNER_URL;
  try{process.env.NODE_ENV='production';delete process.env.MALWARE_SCANNER_URL;await assert.rejects(()=>scanBuffer(Buffer.from('unknown')),(error)=>error?.status===503&&error?.code==='MALWARE_SCANNER_UNAVAILABLE');}
  finally{if(previousNode===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previousNode;if(previousUrl===undefined)delete process.env.MALWARE_SCANNER_URL;else process.env.MALWARE_SCANNER_URL=previousUrl;}
});
