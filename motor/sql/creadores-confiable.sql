-- Creadores de confianza: saltan el escaner de seguridad al subir mini apps
-- (solo admin puede marcar). Externos externos siguen escaneados.

ALTER TABLE creadores
  ADD COLUMN IF NOT EXISTS creador_confiable boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN creadores.creador_confiable IS
  'Si true, las mini apps de este creador no se bloquean por el escaner de seguridad.';
