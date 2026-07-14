import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateMatch, parseResumeText, sanitizeRequirements } from '../src/ats/domain/matchEngine.js';
import { validateResumeFile } from '../src/ats/infrastructure/resumeParser.js';

test('parser deterministico extrai contato, skills, idiomas e experiencia',()=>{
  const profile=parseResumeText(`
    Marina Costa
    marina.costa@example.com | (11) 99999-1234
    Engenheira de Software Senior
    7 anos de experiencia com TypeScript, React, Node.js, PostgreSQL e Docker.
    Ingles fluente e Espanhol intermediario.
    Bacharel em Ciencia da Computacao - Universidade Exemplo
  `);
  assert.equal(profile.name,'Marina Costa');
  assert.equal(profile.email,'marina.costa@example.com');
  assert.equal(profile.estimatedExperienceYears,7);
  assert.ok(profile.skills.includes('TypeScript'));
  assert.ok(profile.skills.includes('React'));
  assert.ok(profile.languages.some((item)=>item.language==='Inglês'&&item.level?.toLowerCase()==='fluente'));
});

test('match explica requisitos atendidos e ausentes',()=>{
  const profile=parseResumeText('Joao Silva\njoao@example.com\n5 anos com React, TypeScript e Docker. Ingles avancado.');
  const result=calculateMatch(profile,{
    skillsObrigatorias:['React','Python'],skillsDesejaveis:['Docker'],idiomas:['Inglês'],anosExperienciaMin:5,
  });
  assert.equal(result.score,75);
  assert.deepEqual(result.matchedRequired,['React']);
  assert.deepEqual(result.missingRequired,['Python']);
  assert.equal(result.algorithm,'DETERMINISTIC_MATCH_V1');
});

test('normaliza requisitos malformados sem propagar NaN',()=>{
  assert.deepEqual(sanitizeRequirements({skillsObrigatorias:'React',anosExperienciaMin:'invalido'}),{
    skillsObrigatorias:[],skillsDesejaveis:[],idiomas:[],anosExperienciaMin:0,
  });
});

test('valida tamanho, MIME e magic bytes do curriculo',()=>{
  assert.doesNotThrow(()=>validateResumeFile(Buffer.from('%PDF-1.4 arquivo'),'application/pdf',16));
  assert.throws(()=>validateResumeFile(Buffer.from('arquivo falso'),'application/pdf',13),/Assinatura/);
  assert.throws(()=>validateResumeFile(Buffer.from('PK arquivo'),'text/plain',10),/PDF ou DOCX/);
});
