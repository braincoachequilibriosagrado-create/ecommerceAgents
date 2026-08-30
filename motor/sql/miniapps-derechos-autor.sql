-- Registro de confirmacion de derechos al subir producto
ALTER TABLE miniapps
  ADD COLUMN IF NOT EXISTS derechos_confirmados boolean NOT NULL DEFAULT false;

ALTER TABLE miniapps
  ADD COLUMN IF NOT EXISTS derechos_confirmados_en timestamptz NULL;

COMMENT ON COLUMN miniapps.derechos_confirmados IS
  'true si el creador marco la casilla de confirmacion de derechos al subir.';
COMMENT ON COLUMN miniapps.derechos_confirmados_en IS
  'Fecha/hora UTC en que el creador confirmo derechos sobre el contenido.';
