'use strict';

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL              = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    '[supabase] AVISO: SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no están definidos en .env. ' +
    'Las operaciones de Supabase fallarán hasta que los configures.'
  );
}

// Usamos la service_role key para que el motor pueda leer/escribir sin restricciones de RLS.
// NUNCA expongas esta key en el frontend ni en GitHub.
const supabase = createClient(
  SUPABASE_URL              || '',
  SUPABASE_SERVICE_ROLE_KEY || '',
  {
    auth: {
      autoRefreshToken:  false,
      persistSession:    false,
      detectSessionInUrl: false
    }
  }
);

module.exports = supabase;
