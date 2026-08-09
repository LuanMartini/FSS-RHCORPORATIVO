-- O hash SHA-256 historico nunca foi um template facial. Ele e invalidado
-- explicitamente: cada colaborador deve recadastrar a biometria com embedding.
ALTER TABLE biometrias_faciais
  ALTER COLUMN template_hash DROP NOT NULL;

ALTER TABLE biometrias_faciais
  ADD COLUMN IF NOT EXISTS template_embedding JSONB,
  ADD COLUMN IF NOT EXISTS template_version VARCHAR(80);

UPDATE biometrias_faciais
   SET template_hash = NULL,
       template_embedding = NULL,
       template_version = 'INVALIDATED-SHA256-V1',
       algoritmo = 'INVALIDATED-SHA256-V1',
       ativo = FALSE,
       updated_at = NOW()
 WHERE template_hash IS NOT NULL
    OR template_embedding IS NULL
    OR algoritmo = 'SIMULATED-HASH-V1';
