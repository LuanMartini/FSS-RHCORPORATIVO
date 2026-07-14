import type { JobRequirements, MatchResult, ParsedResume } from './types.js';

export function normalizeTerm(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9+#.]+/g, ' ').trim();
}

function unique(values: string[]): string[] {
  return [...new Map(values.filter(Boolean).map((value) => [normalizeTerm(value), value.trim()])).values()];
}

function ratio(matched: number, total: number): number {
  return total === 0 ? 0 : matched / total;
}

export function sanitizeRequirements(value: unknown): JobRequirements {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const strings = (key: string): string[] => Array.isArray(row[key]) ? unique(row[key].map(String)) : [];
  const years = Number(row.anosExperienciaMin ?? 0);
  return {
    skillsObrigatorias: strings('skillsObrigatorias'),
    skillsDesejaveis: strings('skillsDesejaveis'),
    idiomas: strings('idiomas'),
    anosExperienciaMin: Number.isFinite(years) && years > 0 ? Math.min(50, years) : 0,
  };
}

export function calculateMatch(resume: ParsedResume, rawRequirements: unknown): MatchResult {
  const requirements = sanitizeRequirements(rawRequirements);
  const candidateSkills = new Set(resume.skills.map(normalizeTerm));
  const candidateLanguages = new Set(resume.languages.map((item) => normalizeTerm(item.language)));
  const matchedRequired = requirements.skillsObrigatorias.filter((skill) => candidateSkills.has(normalizeTerm(skill)));
  const missingRequired = requirements.skillsObrigatorias.filter((skill) => !candidateSkills.has(normalizeTerm(skill)));
  const matchedDesired = requirements.skillsDesejaveis.filter((skill) => candidateSkills.has(normalizeTerm(skill)));
  const matchedLanguages = requirements.idiomas.filter((language) => candidateLanguages.has(normalizeTerm(language)));

  const categories = [
    { key: 'requiredSkills' as const, weight: 50, active: requirements.skillsObrigatorias.length > 0, value: ratio(matchedRequired.length, requirements.skillsObrigatorias.length) },
    { key: 'desiredSkills' as const, weight: 20, active: requirements.skillsDesejaveis.length > 0, value: ratio(matchedDesired.length, requirements.skillsDesejaveis.length) },
    { key: 'experience' as const, weight: 20, active: requirements.anosExperienciaMin > 0, value: requirements.anosExperienciaMin === 0 ? 0 : Math.min(1, resume.estimatedExperienceYears / requirements.anosExperienciaMin) },
    { key: 'languages' as const, weight: 10, active: requirements.idiomas.length > 0, value: ratio(matchedLanguages.length, requirements.idiomas.length) },
  ];
  const activeWeight = categories.filter((item) => item.active).reduce((sum, item) => sum + item.weight, 0);
  const breakdown = { requiredSkills: 0, desiredSkills: 0, experience: 0, languages: 0 };
  categories.forEach((category) => {
    breakdown[category.key] = category.active && activeWeight > 0
      ? Math.round(category.value * category.weight / activeWeight * 100)
      : 0;
  });
  const score = activeWeight === 0 ? 0 : Math.min(100, Object.values(breakdown).reduce((sum, value) => sum + value, 0));
  return { score, matchedRequired, missingRequired, matchedDesired, matchedLanguages, breakdown, algorithm: 'DETERMINISTIC_MATCH_V1' };
}

const SKILL_DICTIONARY = [
  'JavaScript', 'TypeScript', 'React', 'Node.js', 'Python', 'Java', 'C#', '.NET', 'Go', 'Rust',
  'SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP',
  'Git', 'GraphQL', 'REST', 'Spring', 'Django', 'FastAPI', 'NestJS', 'Next.js', 'Angular', 'Vue',
  'Figma', 'Power BI', 'Excel', 'SAP', 'Scrum', 'Kanban', 'Inglês', 'Espanhol',
];

export function parseResumeText(textInput: string): ParsedResume {
  const text = textInput.replace(/\0/g, '').replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n').slice(0, 250_000);
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase() ?? '';
  const phone = text.match(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9\s*)?\d{4}[-\s]?\d{4}/)?.[0]?.replace(/\s+/g, ' ') ?? null;
  const nameCandidate = lines.find((line) =>
    line.length >= 3 && line.length <= 80 && /^[\p{L}][\p{L}\s.'-]+$/u.test(line) && !/curr[ií]culo|resume|perfil|contato/i.test(line)
  ) ?? 'Candidato sem nome';
  const skills = SKILL_DICTIONARY.filter((skill) => {
    const escaped = normalizeTerm(skill).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(normalizeTerm(text));
  });
  const languageNames = ['Inglês', 'Espanhol', 'Francês', 'Alemão', 'Italiano', 'Português'];
  const languages = languageNames.filter((language) => normalizeTerm(text).includes(normalizeTerm(language))).map((language) => {
    const context = lines.find((line) => normalizeTerm(line).includes(normalizeTerm(language))) ?? '';
    const level = context.match(/b[aá]sico|intermedi[aá]rio|avan[cç]ado|fluente|nativo/i)?.[0] ?? null;
    return { language, level };
  });
  const experiences = lines.filter((line) =>
    /\b(19|20)\d{2}\b/.test(line) || /\b\d+\s*(anos?|years?)\b/i.test(line)
  ).slice(0, 12).map((line) => ({ title: line.slice(0, 220) }));
  const education = lines.filter((line) =>
    /gradua[cç][aã]o|bacharel|tecn[oó]logo|mestrado|doutorado|universidade|faculdade|mba/i.test(line)
  ).slice(0, 10);
  const explicitYears = [...text.matchAll(/\b(\d{1,2})\+?\s*(?:anos?|years?)\b/gi)].map((match) => Number(match[1]));
  const confidenceSignals = [email.length > 0, nameCandidate !== 'Candidato sem nome', skills.length > 0, experiences.length > 0, languages.length > 0];
  return {
    name: nameCandidate,
    email,
    phone,
    headline: lines.find((line) => /desenvolvedor|engenheir|analista|gerente|especialista|designer|product/i.test(line))?.slice(0, 220) ?? null,
    location: null,
    skills,
    experiences,
    languages,
    education,
    estimatedExperienceYears: explicitYears.length > 0 ? Math.max(...explicitYears) : Math.min(20, Math.floor(experiences.length / 2)),
    confidence: Math.round(confidenceSignals.filter(Boolean).length / confidenceSignals.length * 100),
    parser: 'SIMULATED_LLM_V1',
  };
}
