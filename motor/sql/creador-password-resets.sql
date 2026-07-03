-- Recuperacion de contraseña — creadores (Activos Digitales)
-- Ejecutar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS password_resets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creador_id  uuid NOT NULL REFERENCES creadores(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  expira_en   timestamptz NOT NULL,
  usado       boolean NOT NULL DEFAULT false,
  creado_en   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_resets_creador
  ON password_resets (creador_id);

CREATE INDEX IF NOT EXISTS idx_password_resets_activos
  ON password_resets (expira_en)
  WHERE usado = false;
