-- Subcategorias de infoproducto (Activos Digitales)
-- Ejecutar en Supabase SQL Editor. No toca entrega ni ventas.

ALTER TABLE miniapps
  ADD COLUMN IF NOT EXISTS subcategoria text NULL;

COMMENT ON COLUMN miniapps.subcategoria IS
  'Solo para categoria=infoproducto. Valores: pdf | arte | prompts. NULL en otras categorias.';

-- Infoproductos existentes → pdf por defecto
UPDATE miniapps
SET subcategoria = 'pdf'
WHERE categoria = 'infoproducto'
  AND (subcategoria IS NULL OR subcategoria = '');

-- Limpiar subcategoria en productos que no son infoproducto
UPDATE miniapps
SET subcategoria = NULL
WHERE categoria IS DISTINCT FROM 'infoproducto'
  AND subcategoria IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_miniapps_infoproducto_subcategoria
  ON miniapps (categoria, subcategoria)
  WHERE categoria = 'infoproducto';
