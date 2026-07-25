'use strict';

/**
 * Restaura miniapps despublicadas en FASE 0 (scripts/despublicados-usa-ia.json).
 * Solo restaura si el HTML en R2 pasa el escáner con usa_ia=true.
 *
 * Uso: node scripts/restaurar-despublicados-usa-ia.js
 */

const path = require('path');
const fs = require('fs');
const Module = require('module');

const MOTOR_DIR = path.join(__dirname, '..', 'motor');
const _origPaths = Module._nodeModulePaths;
Module._nodeModulePaths = function (from) {
  const paths = _origPaths.call(this, from);
  const motorNm = path.join(MOTOR_DIR, 'node_modules');
  if (paths.indexOf(motorNm) === -1) paths.unshift(motorNm);
  return paths;
};

require(path.join(MOTOR_DIR, 'node_modules', 'dotenv')).config({ path: path.join(MOTOR_DIR, '.env') });
const supabase = require(path.join(MOTOR_DIR, 'supabase'));
const miniappSeg = require(path.join(MOTOR_DIR, 'miniapp-seguridad'));
const { obtenerArchivo } = require(path.join(MOTOR_DIR, 'r2'));

const JSON_PATH = path.join(__dirname, 'despublicados-usa-ia.json');

async function main() {
  if (!fs.existsSync(JSON_PATH)) {
    console.log('No existe', JSON_PATH, '— nada que restaurar.');
    return;
  }
  const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  const lista = data.despublicados || [];
  console.log('Despublicados en JSON:', lista.length);
  if (!lista.length) {
    console.log('JSON vacío — no se restaura nada.');
    return;
  }

  let ok = 0;
  let skip = 0;
  for (let i = 0; i < lista.length; i++) {
    const row = lista[i];
    const { data: mini, error } = await supabase
      .from('miniapps')
      .select('id, nombre, r2_key, usa_ia, estado')
      .eq('id', row.id)
      .maybeSingle();
    if (error || !mini) {
      console.warn('Skip id=' + row.id + ': no encontrado');
      skip += 1;
      continue;
    }
    if (!mini.r2_key) {
      console.warn('Skip id=' + row.id + ': sin r2_key');
      skip += 1;
      continue;
    }
    let html = '';
    try {
      html = await obtenerArchivo(mini.r2_key);
    } catch (e) {
      console.warn('Skip id=' + row.id + ': no se pudo leer R2 —', e.message);
      skip += 1;
      continue;
    }
    const escaneo = miniappSeg.analizarHtmlMiniapp(html, { usaIa: true });
    if (escaneo.rechazar) {
      console.warn('Skip id=' + row.id + ' "' + mini.nombre + '": no pasa escáner IA —',
        miniappSeg.mensajeRechazoCreador(escaneo));
      skip += 1;
      continue;
    }
    const estadoNuevo = row.estado_anterior || 'activo';
    const { error: uErr } = await supabase
      .from('miniapps')
      .update({ estado: estadoNuevo, usa_ia: true })
      .eq('id', row.id);
    if (uErr) {
      console.error('Error restaurando id=' + row.id + ':', uErr.message);
      skip += 1;
      continue;
    }
    console.log('Restaurado: id=' + row.id + ' → estado=' + estadoNuevo);
    ok += 1;
  }
  console.log('Listo. Restaurados:', ok, '| Omitidos:', skip);
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});
