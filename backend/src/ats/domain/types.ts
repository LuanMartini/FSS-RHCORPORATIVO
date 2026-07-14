export const ATS_STAGES = ['APLICACAO', 'TRIAGEM', 'ENTREVISTA_TECNICA', 'FIT_CULTURAL', 'PROPOSTA', 'CONTRATADO'] as const;
export type AtsStage = typeof ATS_STAGES[number];

export interface ResumeExperience {
  title: string;
  company?: string;
  period?: string;
}

export interface ParsedResume {
  name: string;
  email: string;
  phone: string | null;
  headline: string | null;
  location: string | null;
  skills: string[];
  experiences: ResumeExperience[];
  languages: Array<{ language: string; level: string | null }>;
  education: string[];
  estimatedExperienceYears: number;
  confidence: number;
  parser: 'SIMULATED_LLM_V1';
}

export interface JobRequirements {
  skillsObrigatorias: string[];
  skillsDesejaveis: string[];
  idiomas: string[];
  anosExperienciaMin: number;
}

export interface MatchResult {
  score: number;
  matchedRequired: string[];
  missingRequired: string[];
  matchedDesired: string[];
  matchedLanguages: string[];
  breakdown: {
    requiredSkills: number;
    desiredSkills: number;
    experience: number;
    languages: number;
  };
  algorithm: 'DETERMINISTIC_MATCH_V1';
}

export interface MoveCardInput {
  candidaturaId: number;
  vagaId: number;
  targetStage: AtsStage;
  targetPosition: number;
  expectedVersion: number;
  userId: number;
  correlationId?: string;
}
