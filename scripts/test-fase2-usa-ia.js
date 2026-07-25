'use strict';

/**
 * FASE 2 — Verificación final (escáner + CSP + franja + flujo lógico de publicación).
 * No deja productos de prueba en la BD: simula aceptar/rechazar y limpia si inserta algo.
 *
 * Uso: node scripts/test-fase2-usa-ia.js
 */

const path = require('path');
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

const API = 'https://api.activosdigitales.click';
const HTML_OK =
  '<!DOCTYPE html><html><head><title>Test IA</title></head><body>' +
  '<input id="key" placeholder="Groq key"/><button id="b">Generar</button>' +
  '<script>' +
  'var apiKey="";' +
  'document.getElementById("b").addEventListener("click",function(){' +
  '  apiKey=document.getElementById("key").value;' +
  '  fetch("https://api.groq.com/openai/v1/chat/completions",{method:"POST",headers:{"Authorization":"Bearer "+apiKey,"Content-Type":"application/json"},body:"{}"});' +
  '});' +
  '</script></body></html>';

let passed = 0;
let failed = 0;

function assert(name, cond, detail) {
  if (cond) {
    passed += 1;
    console.log('  PASS  ' + name);
  } else {
    failed += 1;
    console.log('  FAIL  ' + name + (detail ? ' — ' + detail : ''));
  }
}

async function main() {
  console.log('=== VERIFICACIÓN FASE 2 usa_ia ===\n');

  // (a) Subida lógica: usa_ia=true + fetch groq en click → aceptar
  const escA = miniappSeg.analizarHtmlMiniapp(HTML_OK, { usaIa: true });
  assert('(a) Escáner acepta HTML IA (fetch groq en click)', escA.rechazar === false,
    JSON.stringify((escA.amenazas || []).map(function (a) { return a.codigo; })));

  // Simular "publicar": insert temporal + CSP + franja, luego borrar
  let testId = null;
  try {
    const { data: creador } = await supabase
      .from('creadores')
      .select('id')
      .limit(1)
      .maybeSingle();

    if (!creador || !creador.id) {
      console.warn('  Aviso: no hay creadores en BD — se omite insert de prueba.');
    } else {
      const slug = 'test-fase2-ia-' + Date.now();
      const { data: inserted, error: insErr } = await supabase
        .from('miniapps')
        .insert({
          creador_id: creador.id,
          nombre: 'TEST FASE2 IA (borrar)',
          slug: slug,
          descripcion: 'Producto de prueba temporal Fase 2 — borrar',
          precio: 1,
          categoria: 'miniapp',
          tipo_producto: 'html',
          usa_ia: true,
          estado: 'activo',
          estado_aprobacion: 'aprobada',
          r2_key: 'miniapps/' + slug + '/app.html',
          foto1_key: 'miniapps/' + slug + '/foto1.jpg'
        })
        .select('id, usa_ia, nombre')
        .single();

      if (insErr) {
        console.warn('  Aviso: no se pudo insertar producto de prueba en BD:', insErr.message);
        console.warn('  Continuando con verificación en memoria (CSP + franja).');
      } else {
        testId = inserted.id;
        assert('(a) Producto de prueba publicado en BD con usa_ia=true', !!inserted.usa_ia, String(inserted.id));
      }
    }
  } catch (e) {
    console.warn('  Aviso insert prueba:', e.message);
  }

  // (b) Entrega: CSP + franja
  const csp = miniappSeg.buildMiniappCsp(API, true);
  assert('(b) CSP entrega incluye api.groq.com', csp.indexOf('https://api.groq.com') >= 0,
    csp.match(/connect-src[^;]*/)?.[0]);

  const contenedor = miniappSeg.htmlContenedorSandbox('TESTCODE', 'Test IA', true);
  assert('(b) Franja informativa visible en contenedor',
    contenedor.indexOf('clave gratuita de Groq') >= 0 &&
    contenedor.indexOf('sandbox="allow-scripts"') >= 0,
    'banner o sandbox ausente');

  // (c) Mismo HTML con usa_ia=false → rechazar
  const escC = miniappSeg.analizarHtmlMiniapp(HTML_OK, { usaIa: false });
  assert('(c) Escáner rechaza mismo HTML con usa_ia=false', escC.rechazar === true,
    JSON.stringify((escC.amenazas || []).map(function (a) { return a.codigo; })));

  // Cleanup
  if (testId) {
    const { error: delErr } = await supabase.from('miniapps').delete().eq('id', testId);
    if (delErr) {
      console.warn('  Aviso: no se pudo borrar prueba id=' + testId + ':', delErr.message);
      assert('(cleanup) Borrar producto de prueba', false, delErr.message);
    } else {
      assert('(cleanup) Producto de prueba borrado', true);
    }
  }

  console.log('\n--- Resultado: ' + passed + ' passed, ' + failed + ' failed ---');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});
