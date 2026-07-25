'use strict';

/**
 * FASE 0 — Auditoría + despublicación temporal de miniapps con usa_ia = true
 *
 * Uso (desde la raíz del repo o desde motor/):
 *   node scripts/auditoria-usa-ia.js
 *   node scripts/auditoria-usa-ia.js --solo-auditoria
 *
 * Por defecto: audita, imprime resultado, y despublica (estado → inactivo)
 * los que estén publicados (estado=activo Y estado_aprobacion=aprobada).
 */

const path = require('path');
const fs = require('fs');
const Module = require('module');

const MOTOR_DIR = path.join(__dirname, '..', 'motor');
// Resolver dependencias desde motor/node_modules
const _origPaths = Module._nodeModulePaths;
Module._nodeModulePaths = function (from) {
  const paths = _origPaths.call(this, from);
  const motorNm = path.join(MOTOR_DIR, 'node_modules');
  if (paths.indexOf(motorNm) === -1) paths.unshift(motorNm);
  return paths;
};

require(path.join(MOTOR_DIR, 'node_modules', 'dotenv')).config({ path: path.join(MOTOR_DIR, '.env') });

const supabase = require(path.join(MOTOR_DIR, 'supabase'));

const SOLO_AUDITORIA = process.argv.includes('--solo-auditoria');
const OUT_JSON = path.join(__dirname, 'despublicados-usa-ia.json');

function esPublicado(row) {
  return String(row.estado || '') === 'activo' &&
    String(row.estado_aprobacion || '') === 'aprobada';
}

async function main() {
  console.log('=== AUDITORÍA usa_ia = true ===\n');

  const { data: rows, error } = await supabase
    .from('miniapps')
    .select('id, nombre, slug, estado, estado_aprobacion, usa_ia, creado_en, categoria')
    .eq('usa_ia', true)
    .order('creado_en', { ascending: true });

  if (error) {
    console.error('Error consultando miniapps:', error.message);
    process.exit(1);
  }

  const lista = rows || [];
  console.log('Total con usa_ia = true:', lista.length);

  if (!lista.length) {
    console.log('\nNingún producto con usa_ia = true.');
    if (!SOLO_AUDITORIA) {
      fs.writeFileSync(OUT_JSON, JSON.stringify({
        generado_en: new Date().toISOString(),
        despublicados: [],
        nota: 'Ninguno con usa_ia=true'
      }, null, 2), 'utf8');
      console.log('Registro vacío escrito en', OUT_JSON);
    }
    return;
  }

  const ids = lista.map(function (r) { return r.id; });
  const ventasPorMiniapp = {};
  ids.forEach(function (id) { ventasPorMiniapp[id] = { total: 0, pagadas: 0 }; });

  const { data: compras, error: cErr } = await supabase
    .from('miniapp_compras')
    .select('miniapp_id, estado_pago')
    .in('miniapp_id', ids);

  if (cErr) {
    console.warn('Aviso: no se pudieron cargar ventas:', cErr.message);
  } else {
    (compras || []).forEach(function (c) {
      const mid = c.miniapp_id;
      if (!ventasPorMiniapp[mid]) ventasPorMiniapp[mid] = { total: 0, pagadas: 0 };
      ventasPorMiniapp[mid].total += 1;
      if (c.estado_pago === 'pagado') ventasPorMiniapp[mid].pagadas += 1;
    });
  }

  console.log('\n--- Detalle ---');
  lista.forEach(function (r, i) {
    const v = ventasPorMiniapp[r.id] || { total: 0, pagadas: 0 };
    const publicado = esPublicado(r);
    console.log(
      (i + 1) + '. id=' + r.id +
      ' | nombre="' + r.nombre + '"' +
      ' | estado=' + (r.estado || '(null)') +
      ' | estado_aprobacion=' + (r.estado_aprobacion || '(null)') +
      ' | publicado=' + (publicado ? 'SI' : 'NO') +
      ' | creado_en=' + (r.creado_en || '') +
      ' | ventas_total=' + v.total +
      ' | ventas_pagadas=' + v.pagadas +
      ' | slug=' + (r.slug || '')
    );
  });

  const publicados = lista.filter(esPublicado);
  console.log('\nPublicados (activo + aprobada):', publicados.length);

  if (SOLO_AUDITORIA) {
    console.log('\n(--solo-auditoria: no se despublica)');
    return;
  }

  console.log('\n=== DESPUBLICAR (estado → inactivo) ===\n');

  if (!publicados.length) {
    console.log('Nada que despublicar.');
    fs.writeFileSync(OUT_JSON, JSON.stringify({
      generado_en: new Date().toISOString(),
      despublicados: [],
      nota: 'Habia productos usa_ia=true pero ninguno publicado'
    }, null, 2), 'utf8');
    console.log('Registro escrito en', OUT_JSON);
    return;
  }

  const despublicados = [];
  for (let i = 0; i < publicados.length; i++) {
    const r = publicados[i];
    const prevEstado = r.estado;
    const { data: updated, error: uErr } = await supabase
      .from('miniapps')
      .update({ estado: 'inactivo' })
      .eq('id', r.id)
      .eq('usa_ia', true)
      .select('id, nombre, slug, estado, estado_aprobacion, usa_ia')
      .maybeSingle();

    if (uErr) {
      console.error('ERROR despublicando id=' + r.id + ':', uErr.message);
      continue;
    }

    const entry = {
      id: r.id,
      nombre: r.nombre,
      slug: r.slug,
      estado_anterior: prevEstado,
      estado_nuevo: (updated && updated.estado) || 'inactivo',
      estado_aprobacion: r.estado_aprobacion,
      usa_ia: true,
      creado_en: r.creado_en,
      despublicado_en: new Date().toISOString()
    };
    despublicados.push(entry);
    console.log('Despublicado: id=' + r.id + ' "' + r.nombre + '" (' + prevEstado + ' → inactivo)');
  }

  fs.writeFileSync(OUT_JSON, JSON.stringify({
    generado_en: new Date().toISOString(),
    motivo: 'FASE 0 — desactivacion temporal usa_ia (CSP rompe entrega IA)',
    restaurar_en_fase_2: 'Poner estado = estado_anterior (tipicamente activo) para cada id',
    despublicados: despublicados
  }, null, 2), 'utf8');

  console.log('\nDespublicados:', despublicados.length);
  console.log('Registro guardado en', OUT_JSON);

  // Verificación final
  const { data: check, error: checkErr } = await supabase
    .from('miniapps')
    .select('id, nombre, estado, estado_aprobacion')
    .eq('usa_ia', true)
    .eq('estado', 'activo')
    .eq('estado_aprobacion', 'aprobada');

  if (checkErr) {
    console.warn('No se pudo verificar publicados restantes:', checkErr.message);
  } else {
    console.log('\nVerificación: publicados con usa_ia=true restantes:', (check || []).length);
    if (check && check.length) {
      check.forEach(function (c) {
        console.log('  AUN PUBLICADO: id=' + c.id + ' ' + c.nombre);
      });
    } else {
      console.log('OK: cero productos publicados con usa_ia = true.');
    }
  }
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});
