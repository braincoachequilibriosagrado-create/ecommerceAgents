'use strict';

/**
 * Keepalive de Supabase para AGORATUM · Activos Digitales (ecommerceAgents).
 *
 * Hace UNA consulta minima (SELECT id LIMIT 1 sobre la tabla `miniapps`) para
 * mantener "despierto" el proyecto de Supabase y evitar que se pause por
 * inactividad. Corre en el VPS (motor), no en Vercel.
 *
 * Uso:
 *   node scripts/supabase-keepalive.js
 *
 * Escribe una linea en motor/logs/keepalive.log con fecha/hora UTC y resultado.
 * No hardcodea credenciales: usa SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
 * del .env del motor (las mismas que ya usa el server).
 */

const path = require('path');
const fs   = require('fs');

// Cargar el .env del motor de forma explicita para que funcione desde cron
// (independiente del directorio de trabajo desde el que se ejecute).
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Requerir el cliente DESPUES de cargar dotenv (lee process.env al importarse).
const supabase = require('../supabase');

const LOG_DIR  = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'keepalive.log');

function timestampUTC() {
  // Ej: 2026-09-30 09:00 UTC
  const iso = new Date().toISOString();          // 2026-09-30T09:00:12.345Z
  return iso.slice(0, 16).replace('T', ' ') + ' UTC';
}

function log(line) {
  const full = '[keepalive] ' + timestampUTC() + ' - ' + line + '\n';
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, full);
  } catch (e) {
    // Si no se puede escribir el log, al menos que quede en stdout/stderr.
    console.error('[keepalive] no se pudo escribir el log:', e.message);
  }
  // Tambien a stdout para verlo en la salida de cron si hace falta.
  process.stdout.write(full);
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    log('ERROR - faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el .env');
    process.exit(1);
  }

  try {
    const { error } = await supabase
      .from('miniapps')
      .select('id')
      .limit(1);

    if (error) {
      log('ERROR - ' + error.message);
      process.exit(1);
    }

    log('toque OK');
    process.exit(0);
  } catch (e) {
    log('ERROR - ' + (e && e.message ? e.message : String(e)));
    process.exit(1);
  }
}

main();
