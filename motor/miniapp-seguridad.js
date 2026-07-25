'use strict';

/** Dominios permitidos para scripts/styles externos en mini apps */
const MINIAPP_CDN_PERMITIDOS = [
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
  'unpkg.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'ajax.googleapis.com',
  'code.jquery.com',
  'stackpath.bootstrapcdn.com',
  'maxcdn.bootstrapcdn.com',
  'cdn.tailwindcss.com'
];

const DOMINIOS_IA_PERMITIDOS = [
  'https://api.groq.com',
  'https://api.openai.com',
  'https://api.anthropic.com',
  'https://generativelanguage.googleapis.com'
];

const MSG_FETCH_IA_NO_AUTORIZADO =
  'Solo se permiten llamadas a proveedores de IA autorizados: Groq, OpenAI, Anthropic y Google';

/** img-src restringido: self, data/blob, CDNs conocidos y host del API (fotos de venta) */
function buildMiniappCsp(apiOrigin, usaIa) {
  const apiHost = (function () {
    try { return new URL(apiOrigin || 'https://api.activosdigitales.click').hostname; } catch (_) {
      return 'api.activosdigitales.click';
    }
  })();
  const connectSrc = usaIa
    ? "connect-src 'self' " + DOMINIOS_IA_PERMITIDOS.join(' ')
    : "connect-src 'self'";
  return [
    "default-src 'self'",
    "script-src 'unsafe-inline' 'self' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com https://ajax.googleapis.com https://code.jquery.com https://cdn.tailwindcss.com",
    "style-src 'unsafe-inline' 'self' https://fonts.googleapis.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com",
    "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net",
    "img-src 'self' data: blob: https://" + apiHost + " https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com https://fonts.gstatic.com",
    connectSrc,
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; ');
}

const MINIAPP_CSP = buildMiniappCsp(process.env.PUBLIC_BASE_URL || 'https://api.activosdigitales.click', false);

function _idAmenaza(codigo, severidad, mensaje, bloqueaSubida) {
  return {
    codigo,
    severidad,
    mensaje,
    bloquea_subida: bloqueaSubida !== false
  };
}

function _hostnameDeUrl(raw) {
  const s = String(raw || '').trim();
  if (!s || s.startsWith('#') || s.startsWith('javascript:') || s.startsWith('data:')) return null;
  if (s.startsWith('/') || s.startsWith('./')) return null;
  try {
    return new URL(s, 'https://base.invalid').hostname.toLowerCase();
  } catch (_) {
    return null;
  }
}

function _esCdnPermitido(hostname) {
  if (!hostname) return true;
  const h = hostname.toLowerCase();
  return MINIAPP_CDN_PERMITIDOS.some(function (cdn) {
    return h === cdn || h.endsWith('.' + cdn);
  });
}

function _esHostIaPermitido(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (!h) return false;
  return DOMINIOS_IA_PERMITIDOS.some(function (origin) {
    try {
      const allowed = new URL(origin).hostname.toLowerCase();
      return h === allowed || h.endsWith('.' + allowed);
    } catch (_) {
      return false;
    }
  });
}

function _extraerSrcScripts(html) {
  const urls = [];
  const re = /<script\b[^>]*\ssrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) urls.push(m[1]);
  return urls;
}

function _extraerFormActions(html) {
  const urls = [];
  const re = /<form\b[^>]*\saction\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) urls.push(m[1]);
  return urls;
}

function _extraerFetchUrls(html) {
  const urls = [];
  const re = /fetch\s*\(\s*["'](https?:[^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) urls.push(m[1]);
  const xhrRe = /\.open\s*\(\s*["'][A-Z]+["']\s*,\s*["'](https?:[^"']+)["']/gi;
  while ((m = xhrRe.exec(html)) !== null) urls.push(m[1]);
  return urls;
}

function _contarHexEscapes(html) {
  const m = html.match(/\\x[0-9a-fA-F]{2}/g);
  return m ? m.length : 0;
}

function _tieneBase64Largo(html) {
  return /[A-Za-z0-9+/=]{200,}/.test(html);
}

function _detectarInlineHandlers(html) {
  return /\s(on[a-z]+\s*=)/i.test(html);
}

function _detectarScriptsInline(html, usaIa) {
  const amenazas = [];
  const re = /<script\b(?![^>]*\ssrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const body = m[1] || '';
    if (!body.trim()) continue;
    if (/\beval\s*\(|\bnew\s+Function\s*\(|document\.write\s*\(|javascript:|\.innerHTML\s*=|document\.cookie/i.test(body)) {
      amenazas.push(_idAmenaza('script_inline_peligroso', 'alta', 'Script inline con codigo potencialmente peligroso', true));
    } else if (usaIa) {
      // Con IA se permite JS inline seguro (fetch a Groq en click); no bloquea subida
    } else {
      amenazas.push(_idAmenaza('script_inline', 'media', 'Script inline detectado (usa archivos .js externos)', true));
    }
  }
  return amenazas;
}

/**
 * Detecta fetch/XHR automaticos (no disparados por click/submit del usuario).
 * Solo aplica cuando usaIa = true.
 */
function _detectarFetchAutomatico(html) {
  const re = /<script\b(?![^>]*\ssrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const body = m[1] || '';
    if (!/fetch\s*\(|XMLHttpRequest|\.open\s*\(/i.test(body)) continue;

    // DOMContentLoaded / load / onload
    if (/addEventListener\s*\(\s*["'](?:DOMContentLoaded|load)["']/i.test(body) &&
        /fetch\s*\(|XMLHttpRequest|\.open\s*\(/i.test(body)) {
      return true;
    }
    if (/\.onload\s*=|onload\s*=\s*function/i.test(body) &&
        /fetch\s*\(|XMLHttpRequest/i.test(body)) {
      return true;
    }
    // setInterval / setTimeout periodico con fetch
    if (/setInterval\s*\(/i.test(body) && /fetch\s*\(|XMLHttpRequest/i.test(body)) {
      return true;
    }
    // Bucles for/while con fetch
    if (/\b(?:for|while)\s*\(/i.test(body) && /fetch\s*\(|XMLHttpRequest/i.test(body)) {
      return true;
    }
  }
  // Tambien en HTML completo (scripts externos no, pero codigo suelto)
  if (/addEventListener\s*\(\s*["'](?:DOMContentLoaded|load)["'][\s\S]{0,800}?fetch\s*\(/i.test(html)) {
    return true;
  }
  return false;
}

/**
 * Escanea HTML de mini app.
 * @param {string} html
 * @param {boolean|object} [opts] - usaIa boolean, o { usaIa: boolean }
 * @returns {{ amenazas, tieneAlta, tieneMedia, rechazar, requiere_revision_seguridad }}
 */
function analizarHtmlMiniapp(html, opts) {
  const usaIa = typeof opts === 'boolean'
    ? opts
    : !!(opts && (opts.usaIa === true || opts.usa_ia === true));
  const src = String(html || '');
  const amenazas = [];

  if (/\bcoinhive\b|\bcryptonight\b|\bcryptoloot\b|\bcoin-hive\b|\bminero\b|\bcrypto\s*miner\b|\bwasm.*min(e|ing)/i.test(src)) {
    amenazas.push(_idAmenaza('crypto_miner', 'alta', 'Posible codigo de mineria de criptomonedas', true));
  }

  if (/\beval\s*\(/i.test(src)) {
    amenazas.push(_idAmenaza('eval', 'alta', 'Uso de eval() no permitido', true));
  }
  if (/\bnew\s+Function\s*\(/i.test(src)) {
    amenazas.push(_idAmenaza('new_function', 'alta', 'Uso de new Function() no permitido', true));
  }

  if (/<meta\b[^>]+http-equiv\s*=\s*["']?refresh/i.test(src)) {
    amenazas.push(_idAmenaza('meta_refresh', 'alta', 'Redireccion automatica (meta refresh)', true));
  }

  if (/<iframe\b/i.test(src)) {
    amenazas.push(_idAmenaza('iframe_anidado', 'alta', 'Iframes anidados no permitidos', true));
  }

  if (_detectarInlineHandlers(src)) {
    amenazas.push(_idAmenaza('inline_handler', 'media', 'Atributos de evento inline (onclick, onerror, etc.) no permitidos', true));
  }

  _detectarScriptsInline(src, usaIa).forEach(function (a) { amenazas.push(a); });

  _extraerFormActions(src).forEach(function (action) {
    const host = _hostnameDeUrl(action);
    if (host && !_esCdnPermitido(host)) {
      amenazas.push(_idAmenaza('form_externo', 'alta', 'Formulario envia datos a dominio externo: ' + host, true));
    }
  });

  _extraerSrcScripts(src).forEach(function (scriptSrc) {
    const host = _hostnameDeUrl(scriptSrc);
    if (host && !_esCdnPermitido(host)) {
      amenazas.push(_idAmenaza('script_externo', 'media', 'Script externo no autorizado: ' + host, false));
    }
    if (/^data:/i.test(scriptSrc)) {
      amenazas.push(_idAmenaza('script_data_uri', 'alta', 'Script con URI data: no permitido', true));
    }
  });

  _extraerFetchUrls(src).forEach(function (url) {
    const host = _hostnameDeUrl(url);
    if (!host) return;
    if (usaIa && _esHostIaPermitido(host)) {
      return; // permitido: lista blanca de proveedores IA
    }
    amenazas.push(_idAmenaza(
      'fetch_externo',
      'media',
      usaIa ? MSG_FETCH_IA_NO_AUTORIZADO : ('Peticion de red a dominio externo: ' + host),
      true
    ));
  });

  if (usaIa && _detectarFetchAutomatico(src)) {
    amenazas.push(_idAmenaza(
      'fetch_automatico_ia',
      'alta',
      'Las llamadas a IA deben ejecutarse solo al hacer clic, no automaticamente',
      true
    ));
  }

  if (/\bdocument\.write\s*\(/i.test(src)) {
    amenazas.push(_idAmenaza('document_write', 'media', 'document.write() detectado', true));
  }

  if (/\bdocument\.cookie\b/i.test(src)) {
    amenazas.push(_idAmenaza('document_cookie', 'media', 'Acceso a document.cookie', true));
  }

  if (/\blocalStorage\b|\bsessionStorage\b/i.test(src)) {
    amenazas.push(_idAmenaza('web_storage', 'media', 'Acceso a localStorage/sessionStorage', true));
  }

  if (/\bwindow\.location\s*=|\blocation\.href\s*=|\blocation\.replace\s*\(/i.test(src)) {
    amenazas.push(_idAmenaza('redireccion', 'media', 'Redireccion de navegacion (location)', true));
  }

  if (/addEventListener\s*\(\s*["'](?:keydown|keypress|keyup)["']/i.test(src) &&
      /fetch\s*\(|XMLHttpRequest|navigator\.sendBeacon/i.test(src)) {
    amenazas.push(_idAmenaza('keylogger_sospechoso', 'alta', 'Posible captura de teclas con envio de datos', true));
  }

  if (_contarHexEscapes(src) >= 12 || (_contarHexEscapes(src) >= 6 && _tieneBase64Largo(src))) {
    amenazas.push(_idAmenaza('ofuscacion', 'alta', 'Codigo posiblemente ofuscado (hex/base64)', true));
  } else if (_contarHexEscapes(src) >= 4 || _tieneBase64Largo(src)) {
    amenazas.push(_idAmenaza('ofuscacion_leve', 'media', 'Patrones de ofuscacion detectados', false));
  }

  const tieneAlta = amenazas.some(function (a) { return a.severidad === 'alta'; });
  const tieneMedia = amenazas.some(function (a) { return a.severidad === 'media'; });
  const rechazar = amenazas.some(function (a) { return a.bloquea_subida; });

  return {
    amenazas,
    tieneAlta,
    tieneMedia,
    rechazar,
    requiere_revision_seguridad: tieneMedia && !rechazar
  };
}

function _mensajeRechazoCreador(escaneo) {
  const lista = (escaneo.amenazas || [])
    .filter(function (a) { return a.bloquea_subida; })
    .map(function (a) { return a.mensaje; })
    .slice(0, 8)
    .join('; ');
  return 'Tu mini app contiene codigo no permitido: ' + lista + '. Contacta soporte si crees que es un error.';
}

/** Limpia patrones claramente maliciosos sin eliminar JS legitimo */
function sanitizeMiniappHtml(html) {
  let s = String(html || '');

  s = s.replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh[^>]*>/gi, '');
  s = s.replace(/<iframe\b[\s\S]*?<\/iframe>/gi, '');
  s = s.replace(/<object\b[\s\S]*?<\/object>/gi, '');
  s = s.replace(/<embed\b[^>]*>/gi, '');

  s = s.replace(/<form\b([^>]*)>/gi, function (_m, attrs) {
    var a = String(attrs || '');
    a = a.replace(/\saction\s*=\s*["'][^"']*["']/gi, '');
    a = a.replace(/\saction\s*=\s*[^\s>]+/gi, '');
    return '<form' + a + ' action="#">';
  });

  s = s.replace(/<script\b[^>]*\ssrc\s*=\s*["']([^"']+)["'][^>]*>\s*<\/script>/gi, function (_m, src) {
    const host = _hostnameDeUrl(src);
    if (host && !_esCdnPermitido(host)) return '<!-- script externo bloqueado -->';
    if (/^data:/i.test(src)) return '<!-- script data: bloqueado -->';
    return _m;
  });

  return s;
}

function htmlContenedorSandbox(codigo, titulo, usaIa) {
  const safeCodigo = String(codigo || '').replace(/[^A-Za-z0-9]/g, '');
  const safeTitulo = String(titulo || 'Mini app').replace(/[<>&"]/g, '');
  const embedUrl = '/usar-miniapp/' + encodeURIComponent(safeCodigo) + '/app';
  const banner = usaIa
    ? '<div class="ia-banner" role="note">Esta app usa inteligencia artificial con tu propia clave gratuita de Groq. La app te guía para obtenerla en 30 segundos.</div>'
    : '';
  return '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + safeTitulo + '</title>' +
    '<style>body{margin:0;background:#f5f7fb;font-family:system-ui,sans-serif}' +
    '.wrap{min-height:100vh;display:flex;flex-direction:column}' +
    'header{padding:10px 16px;background:#fff;border-bottom:1px solid #e4e7eb;font-size:14px;font-weight:600;color:#0d1117}' +
    '.ia-banner{padding:10px 16px;background:#f0f4ff;border-bottom:1px solid #d8e0f5;font-size:12.5px;line-height:1.45;color:#3a4560}' +
    'iframe{flex:1;width:100%;min-height:calc(100vh - 44px);border:0;background:#fff}' +
    '</style></head><body><div class="wrap">' +
    '<header>' + safeTitulo + '</header>' +
    banner +
    '<iframe sandbox="allow-scripts" referrerpolicy="no-referrer" title="' + safeTitulo + '" src="' + embedUrl + '"></iframe>' +
    '</div></body></html>';
}

module.exports = {
  MINIAPP_CSP,
  DOMINIOS_IA_PERMITIDOS,
  buildMiniappCsp,
  analizarHtmlMiniapp,
  sanitizeMiniappHtml,
  htmlContenedorSandbox,
  mensajeRechazoCreador: _mensajeRechazoCreador
};
