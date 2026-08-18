-- Subcategorias por categoria (Activos Digitales)
-- Correr EN SUPABASE ANTES de subir el codigo nuevo (git push + VPS).
-- No toca infoproductos (ya tienen pdf/arte/prompts).
-- No toca entrega, ventas ni Stripe.

-- Contenido Digital viejos sin subcategoria → videos
UPDATE miniapps
SET subcategoria = 'videos'
WHERE categoria = 'contenido_digital'
  AND (subcategoria IS NULL OR subcategoria = '');

-- Mini Apps viejos sin subcategoria → entretenimiento
UPDATE miniapps
SET subcategoria = 'entretenimiento'
WHERE categoria = 'miniapp'
  AND (subcategoria IS NULL OR subcategoria = '');

COMMENT ON COLUMN miniapps.subcategoria IS
  'Subcategoria segun categoria: infoproducto=pdf|arte|prompts; contenido_digital=videos|avatar_ugc|audios; miniapp=juegos|educacion|entretenimiento.';

CREATE INDEX IF NOT EXISTS idx_miniapps_categoria_subcategoria
  ON miniapps (categoria, subcategoria);
