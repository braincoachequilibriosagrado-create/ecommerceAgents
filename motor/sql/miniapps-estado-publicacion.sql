-- Estados de publicacion de productos digitales (miniapps / infoproductos / contenido)
-- NO requiere columna nueva: reutiliza miniapps.estado
--
-- Valores:
--   'activo'    -> visible en marketplace y se puede vender
--   'pausado'   -> oculto del marketplace; se puede volver a publicar; compradores siguen con acceso
--   'eliminado' -> soft delete: fuera del catalogo; ventas/comprobantes/entrega se conservan
--
-- Si ya tienes productos, no hace falta migrar filas (default tipico: activo).

COMMENT ON COLUMN miniapps.estado IS
  'Catalogo: activo | pausado | eliminado (soft delete). No borrar filas con ventas.';

-- Opcional: asegurar default
ALTER TABLE miniapps
  ALTER COLUMN estado SET DEFAULT 'activo';
