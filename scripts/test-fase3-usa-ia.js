'use strict';

/**
 * FASE 3 — Lista blanca multi-proveedor IA
 * Uso: node scripts/test-fase3-usa-ia.js
 */

const path = require('path');
const miniappSeg = require(path.join(__dirname, '..', 'motor', 'miniapp-seguridad'));

const API = 'https://api.activosdigitales.click';
const DOMINIOS = miniappSeg.DOMINIOS_IA_PERMITIDOS;

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

function htmlClickFetch(url) {
  return '<!DOCTYPE html><html><body><button id="b">Go</button><script>' +
    'document.getElementById("b").addEventListener("click",function(){' +
    '  fetch("' + url + '");' +
    '});' +
    '</script></body></html>';
}

console.log('=== TEST FASE 3 lista blanca IA ===\n');

assert('constante DOMINIOS_IA_PERMITIDOS tiene 4 entradas',
  Array.isArray(DOMINIOS) && DOMINIOS.length === 4,
  String(DOMINIOS && DOMINIOS.length));

// A OpenAI
(function () {
  const r = miniappSeg.analizarHtmlMiniapp(htmlClickFetch('https://api.openai.com/v1/chat/completions'), true);
  assert('A: usa_ia=true acepta api.openai.com en click', r.rechazar === false,
    JSON.stringify((r.amenazas || []).map(function (a) { return a.codigo; })));
})();

// B Anthropic
(function () {
  const r = miniappSeg.analizarHtmlMiniapp(htmlClickFetch('https://api.anthropic.com/v1/messages'), true);
  assert('B: usa_ia=true acepta api.anthropic.com en click', r.rechazar === false,
    JSON.stringify((r.amenazas || []).map(function (a) { return a.codigo; })));
})();

// C Google Gemini
(function () {
  const r = miniappSeg.analizarHtmlMiniapp(
    htmlClickFetch('https://generativelanguage.googleapis.com/v1beta/models/x:generateContent'),
    true
  );
  assert('C: usa_ia=true acepta generativelanguage.googleapis.com en click', r.rechazar === false,
    JSON.stringify((r.amenazas || []).map(function (a) { return a.codigo; })));
})();

// D Groq
(function () {
  const r = miniappSeg.analizarHtmlMiniapp(
    htmlClickFetch('https://api.groq.com/openai/v1/chat/completions'),
    true
  );
  assert('D: usa_ia=true acepta api.groq.com en click', r.rechazar === false,
    JSON.stringify((r.amenazas || []).map(function (a) { return a.codigo; })));
})();

// E DeepSeek fuera de lista
(function () {
  const r = miniappSeg.analizarHtmlMiniapp(htmlClickFetch('https://api.deepseek.com/v1/chat'), true);
  const msgOk = (r.amenazas || []).some(function (a) {
    return a.mensaje && a.mensaje.indexOf('proveedores de IA autorizados') >= 0;
  });
  assert('E: usa_ia=true rechaza api.deepseek.com', r.rechazar === true && msgOk,
    JSON.stringify((r.amenazas || []).map(function (a) { return a.codigo + ':' + a.mensaje; })));
})();

// F usa_ia=false rechaza los 4
(function () {
  const rechazados = DOMINIOS.every(function (origin) {
    const r = miniappSeg.analizarHtmlMiniapp(htmlClickFetch(origin + '/v1'), false);
    return r.rechazar === true;
  });
  assert('F: usa_ia=false rechaza los 4 dominios de la lista', rechazados);
})();

// G CSP
(function () {
  const cspOn = miniappSeg.buildMiniappCsp(API, true);
  const cspOff = miniappSeg.buildMiniappCsp(API, false);
  const todosEnOn = DOMINIOS.every(function (d) { return cspOn.indexOf(d) >= 0; });
  const ningunoEnOff = DOMINIOS.every(function (d) { return cspOff.indexOf(d) === -1; });
  const connectOn = cspOn.match(/connect-src[^;]*/);
  const connectOff = cspOff.match(/connect-src[^;]*/);
  assert('G: CSP usaIa=true tiene los 4; usaIa=false ninguno',
    todosEnOn && ningunoEnOff && connectOff && connectOff[0] === "connect-src 'self'",
    'ON=' + (connectOn && connectOn[0]) + ' | OFF=' + (connectOff && connectOff[0]));
})();

console.log('\n--- Resultado: ' + passed + ' passed, ' + failed + ' failed ---');
process.exit(failed > 0 ? 1 : 0);
