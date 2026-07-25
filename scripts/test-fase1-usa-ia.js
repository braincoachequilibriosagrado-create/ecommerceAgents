'use strict';

/**
 * FASE 1 — Tests CSP + escáner condicional usa_ia
 * Ejecutar: node scripts/test-fase1-usa-ia.js
 */

const path = require('path');
const miniappSeg = require(path.join(__dirname, '..', 'motor', 'miniapp-seguridad'));

const API = 'https://api.activosdigitales.click';
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

console.log('=== TEST FASE 1 usa_ia (CSP + escáner) ===\n');

// A: CSP sin IA
(function () {
  const csp = miniappSeg.buildMiniappCsp(API, false);
  const ok = /connect-src 'self'(?!.*api\.groq\.com)/.test(csp) &&
    csp.indexOf("connect-src 'self'") >= 0 &&
    csp.indexOf('api.groq.com') === -1;
  assert('A: usa_ia=false → connect-src sin groq', ok, csp.match(/connect-src[^;]*/)?.[0]);
})();

// B: CSP con IA
(function () {
  const csp = miniappSeg.buildMiniappCsp(API, true);
  const ok = csp.indexOf("connect-src 'self' https://api.groq.com") >= 0;
  assert('B: usa_ia=true → connect-src incluye api.groq.com', ok, csp.match(/connect-src[^;]*/)?.[0]);
})();

// C: fetch groq en click — aceptar
(function () {
  const html =
    '<!DOCTYPE html><html><body><button id="b">Go</button>' +
    '<script>' +
    'document.getElementById("b").addEventListener("click", function(){' +
    '  fetch("https://api.groq.com/openai/v1/chat/completions");' +
    '});' +
    '</script></body></html>';
  const r = miniappSeg.analizarHtmlMiniapp(html, true);
  assert('C: usa_ia=true acepta fetch groq en click', r.rechazar === false,
    JSON.stringify((r.amenazas || []).map(function (a) { return a.codigo; })));
})();

// D: fetch evil — rechazar
(function () {
  const html =
    '<!DOCTYPE html><html><body><button id="b">Go</button>' +
    '<script>' +
    'document.getElementById("b").addEventListener("click", function(){' +
    '  fetch("https://evil.com/x");' +
    '});' +
    '</script></body></html>';
  const r = miniappSeg.analizarHtmlMiniapp(html, true);
  assert('D: usa_ia=true rechaza fetch evil.com', r.rechazar === true,
    JSON.stringify((r.amenazas || []).map(function (a) { return a.codigo; })));
})();

// E: localStorage — rechazar
(function () {
  const html =
    '<!DOCTYPE html><html><body><script>' +
    'localStorage.setItem("k","v");' +
    '</script></body></html>';
  const r = miniappSeg.analizarHtmlMiniapp(html, true);
  assert('E: usa_ia=true rechaza localStorage', r.rechazar === true,
    JSON.stringify((r.amenazas || []).map(function (a) { return a.codigo; })));
})();

// F: usa_ia=false rechaza fetch groq
(function () {
  const html =
    '<!DOCTYPE html><html><body><button id="b">Go</button>' +
    '<script src="https://cdn.jsdelivr.net/npm/jquery"></script>' +
    '<script>' +
    'document.getElementById("b").addEventListener("click", function(){' +
    '  fetch("https://api.groq.com/openai/v1/chat/completions");' +
    '});' +
    '</script></body></html>';
  const r = miniappSeg.analizarHtmlMiniapp(html, false);
  assert('F: usa_ia=false rechaza fetch groq', r.rechazar === true,
    JSON.stringify((r.amenazas || []).map(function (a) { return a.codigo; })));
})();

// G: fetch groq en load — rechazar
(function () {
  const html =
    '<!DOCTYPE html><html><body><script>' +
    "window.addEventListener('load', function(){" +
    '  fetch("https://api.groq.com/openai/v1/chat/completions");' +
    '});' +
    '</script></body></html>';
  const r = miniappSeg.analizarHtmlMiniapp(html, true);
  const msgOk = (r.amenazas || []).some(function (a) {
    return a.codigo === 'fetch_automatico_ia' ||
      (a.mensaje && a.mensaje.indexOf('solo al hacer clic') >= 0);
  });
  assert('G: usa_ia=true rechaza fetch groq en load', r.rechazar === true && msgOk,
    JSON.stringify((r.amenazas || []).map(function (a) { return a.codigo + ':' + a.mensaje; })));
})();

console.log('\n--- Resultado: ' + passed + ' passed, ' + failed + ' failed ---');
process.exit(failed > 0 ? 1 : 0);
