-- Liquidacion de pagos a creadores (Activos Digitales)
-- Ejecutar en Supabase SQL Editor. No borra ni recalcula ventas existentes.

ALTER TABLE miniapp_compras
  ADD COLUMN IF NOT EXISTS pagado_al_creador boolean NOT NULL DEFAULT false;

ALTER TABLE miniapp_compras
  ADD COLUMN IF NOT EXISTS fecha_pago_creador timestamptz NULL;

COMMENT ON COLUMN miniapp_compras.pagado_al_creador IS
  'true = el saldo de esa venta ya se liquido/pago al creador (historial se conserva)';
COMMENT ON COLUMN miniapp_compras.fecha_pago_creador IS
  'Momento en que el admin marco la venta como pagada al creador';

-- Indice util para consultas de saldo pendiente
CREATE INDEX IF NOT EXISTS idx_miniapp_compras_liquidacion
  ON miniapp_compras (estado_pago, pagado_al_creador)
  WHERE estado_pago = 'pagado' AND pagado_al_creador = false;
