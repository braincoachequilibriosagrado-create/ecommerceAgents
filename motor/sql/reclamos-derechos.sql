-- Reclamos de derechos de autor (legislacion colombiana)
CREATE TABLE IF NOT EXISTS reclamos_derechos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  miniapp_id      uuid NULL REFERENCES miniapps(id) ON DELETE SET NULL,
  producto_texto  text NOT NULL,
  quien_reclama   text NOT NULL,
  email           text NOT NULL,
  motivo          text NOT NULL,
  prueba          text NULL,
  estado          text NOT NULL DEFAULT 'pendiente',
  creado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_en  timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_reclamos_derechos_estado
  ON reclamos_derechos (estado, creado_en DESC);

CREATE INDEX IF NOT EXISTS idx_reclamos_derechos_miniapp
  ON reclamos_derechos (miniapp_id);

COMMENT ON TABLE reclamos_derechos IS
  'Reclamos publicos de derechos de autor sobre productos. No bajan el producto automaticamente.';
COMMENT ON COLUMN reclamos_derechos.estado IS
  'pendiente | revisado | descartado | accion_tomada';
