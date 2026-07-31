-- Hash SHA-256 del HTML sanitizado (anti-duplicados al subir mini apps).
-- Opcional: sin esta columna, sigue funcionando el bloqueo por nombre duplicado.

ALTER TABLE miniapps
  ADD COLUMN IF NOT EXISTS content_hash text;

CREATE INDEX IF NOT EXISTS idx_miniapps_creador_content_hash
  ON miniapps (creador_id, content_hash)
  WHERE content_hash IS NOT NULL AND estado IS DISTINCT FROM 'eliminado';

COMMENT ON COLUMN miniapps.content_hash IS
  'SHA-256 del HTML sanitizado; evita subir la misma mini app dos veces (ignorando eliminados).';
