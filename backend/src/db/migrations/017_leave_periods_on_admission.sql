BEGIN;

-- Todo colaborador novo precisa de periodos aquisitivos para que o saldo de ferias
-- exista de forma consistente, independentemente do fluxo que inseriu o registro.
CREATE OR REPLACE FUNCTION fn_gerar_periodos_ferias(p_colaborador_id BIGINT, p_inicio DATE)
RETURNS void AS $$
BEGIN
  INSERT INTO periodos_aquisitivos_ferias
    (colaborador_id,inicio_em,fim_em,disponivel_em,dias_direito)
  SELECT p_colaborador_id,
         (p_inicio + make_interval(years => n))::date,
         (p_inicio + make_interval(years => n + 1) - interval '1 day')::date,
         (p_inicio + make_interval(years => n + 1))::date,
         30
    FROM generate_series(
           0,
           GREATEST(0, (EXTRACT(YEAR FROM age(current_date, p_inicio)))::int)
         ) AS n
  ON CONFLICT (colaborador_id,inicio_em) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_colaboradores_periodos_ferias()
RETURNS trigger AS $$
BEGIN
  PERFORM fn_gerar_periodos_ferias(NEW.id, COALESCE(NEW.data_admissao, NEW.created_at::date));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_colaboradores_periodos_ferias ON colaboradores;
CREATE TRIGGER trg_colaboradores_periodos_ferias
AFTER INSERT ON colaboradores
FOR EACH ROW EXECUTE FUNCTION fn_colaboradores_periodos_ferias();

-- Preenche colaboradores existentes sem periodos e periodos anuais ainda ausentes.
SELECT fn_gerar_periodos_ferias(id, COALESCE(data_admissao, created_at::date))
  FROM colaboradores
 WHERE status <> 'DESLIGADO';

COMMIT;
