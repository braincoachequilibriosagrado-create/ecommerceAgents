-- Creadores de confianza: saltan el escaner de seguridad al subir mini apps
-- (solo admin puede marcar). Scripts externos siguen escaneados.
--
-- RESERVADA / NO USADA actualmente: la columna existe en el esquema, pero el
-- motor y los paneles no la leen ni escriben. No borrar; queda para un uso
-- futuro (bypass de escaner para creadores marcados por admin).

ALTER TABLE creadores
  ADD COLUMN IF NOT EXISTS creador_confiable boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN creadores.creador_confiable IS
  'RESERVADA/NO USADA en codigo. Intencion futura: si true, las mini apps de este creador no se bloquean por el escaner de seguridad.';
