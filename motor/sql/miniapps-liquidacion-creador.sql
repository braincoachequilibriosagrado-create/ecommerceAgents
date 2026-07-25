-- Liquidacion de pagos a creadores (Activos Digitales)
-- Ejecutar en Supabase SQL Editor. No borra ni recalcula ventas existentes.

-- 1) Flags de liquidacion por venta
ALTER TABLE miniapp_compras
  ADD COLUMN IF NOT EXISTS pagado_al_creador boolean NOT NULL DEFAULT false;

ALTER TABLE miniapp_compras
  ADD COLUMN IF NOT EXISTS fecha_pago_creador timestamptz NULL;

COMMENT ON COLUMN miniapp_compras.pagado_al_creador IS
  'true = el saldo de esa venta ya se liquido/pago al creador (historial se conserva)';
COMMENT ON COLUMN miniapp_compras.fecha_pago_creador IS
  'Momento en que el admin marco la venta como pagada al creador';

CREATE INDEX IF NOT EXISTS idx_miniapp_compras_liquidacion
  ON miniapp_compras (estado_pago, pagado_al_creador)
  WHERE estado_pago = 'pagado' AND pagado_al_creador = false;

-- 2) Historial de comprobantes de pago a creadores
CREATE TABLE IF NOT EXISTS pagos_creadores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creador_id uuid NOT NULL REFERENCES creadores(id),
  numero_comprobante text NOT NULL UNIQUE,
  fecha timestamptz NOT NULL DEFAULT now(),
  total_vendido numeric(12,2) NOT NULL DEFAULT 0,
  comision_plataforma numeric(12,2) NOT NULL DEFAULT 0,
  total_pagado numeric(12,2) NOT NULL DEFAULT 0,
  detalle jsonb NOT NULL DEFAULT '[]'::jsonb,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pagos_creadores_creador
  ON pagos_creadores (creador_id, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_pagos_creadores_fecha
  ON pagos_creadores (fecha DESC);

COMMENT ON TABLE pagos_creadores IS
  'Historial de liquidaciones a creadores; detalle jsonb guarda productos/ventas del comprobante';
COMMENT ON COLUMN pagos_creadores.numero_comprobante IS
  'Correlativo unico tipo PAGO-0001';
COMMENT ON COLUMN pagos_creadores.detalle IS
  'Array de productos: [{nombre, cantidad, monto_generado, monto_creador, monto_plataforma, miniapp_id}]';
