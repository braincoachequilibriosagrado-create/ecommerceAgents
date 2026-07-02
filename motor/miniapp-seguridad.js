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

const MINIAPP_CSP = [
  "default-src 'self'",
  "script-src 'unsafe-inline' 'self' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com https://ajax.googleapis.com https://code.jquery.com https://cdn.tailwindcss.com",
  "style-src 'unsafe-inline' 'self' https://fonts.googleapis.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com",
  "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net",
  "img-src 'self' data: blob: https:",
  "connect-src 'self'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'"
].join('; ');

function _idAmenaza(codigo, severidad, mensaje) {
  return { codigo, severidad, mensaje };
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

/**
 * Escanea HTML de mini app. Devuelve:
 * { amenazas, tieneAlta, tieneMedia, rechazar, requiere_revision_seguridad }
 */
function analizarHtmlMiniapp(html) {
  const src = String(html || '');
  const amenazas = [];
  const lower = src.toLowerCase();

  if (/\bcoinhive\b|\bcryptonight\b|\bcryptoloot\b|\bcoin-hive\b|\bminero\b|\bcrypto\s*miner\b|\bwasm.*min(e|ing)/i.test(src)) {
    amenazas.push(_idAmenaza('crypto_miner', 'alta', 'Posible codigo de mineria de criptomonedas'));
  }

  if (/\beval\s*\(/i.test(src)) {
    amenazas.push(_idAmenaza('eval', 'alta', 'Uso de eval() no permitido'));
  }
  if (/\bnew\s+Function\s*\(/i.test(src)) {
    amenazas.push(_idAmenaza('new_function', 'alta', 'Uso de new Function() no permitido'));
  }

  if (/<meta\b[^>]+http-equiv\s*=\s*["']?refresh/i.test(src)) {
    amenazas.push(_idAmenaza('meta_refresh', 'alta', 'Redireccion automatica (meta refresh)'));
  }

  if (/<iframe\b/i.test(src)) {
    amenazas.push(_idAmenaza('iframe_anidado', 'alta', 'Iframes anidados no permitidos'));
  }

  _extraerFormActions(src).forEach(function (action) {
    const host = _hostnameDeUrl(action);
    if (host && !_esCdnPermitido(host)) {
      amenazas.push(_idAmenaza('form_externo', 'alta', 'Formulario envia datos a dominio externo: ' + host));
    }
  });

  _extraerSrcScripts(src).forEach(function (scriptSrc) {
    const host = _hostnameDeUrl(scriptSrc);
    if (host && !_esCdnPermitido(host)) {
      amenazas.push(_idAmenaza('script_externo', 'media', 'Script externo no autorizado: ' + host));
    }
    if (/^data:/i.test(scriptSrc)) {
      amenazas.push(_idAmenaza('script_data_uri', 'alta', 'Script con URI data: no permitido'));
    }
  });

  _extraerFetchUrls(src).forEach(function (url) {
    const host = _hostnameDeUrl(url);
    if (host) {
      amenazas.push(_idAmenaza('fetch_externo', 'media', 'Peticion de red a dominio externo: ' + host));
    }
  });

  if (/\bdocument\.write\s*\(/i.test(src)) {
    amenazas.push(_idAmenaza('document_write', 'media', 'document.write() detectado'));
  }

  if (/\bdocument\.cookie\b/i.test(src)) {
    amenazas.push(_idAmenaza('document_cookie', 'media', 'Acceso a document.cookie'));
  }

  if (/\blocalStorage\b|\bsessionStorage\b/i.test(src)) {
    amenazas.push(_idAmenaza('web_storage', 'media', 'Acceso a localStorage/sessionStorage'));
  }

  if (/\bwindow\.location\s*=|\blocation\.href\s*=|\blocation\.replace\s*\(/i.test(src)) {
    amenazas.push(_idAmenaza('redireccion', 'media', 'Redireccion de navegacion (location)'));
  }

  if (/addEventListener\s*\(\s*["'](?:keydown|keypress|keyup)["']/i.test(src) &&
      /fetch\s*\(|XMLHttpRequest|navigator\.sendBeacon/i.test(src)) {
    amenazas.push(_idAmenaza('keylogger_sospechoso', 'alta', 'Posible captura de teclas con envio de datos'));
  }

  if (_contarHexEscapes(src) >= 12 || (_contarHexEscapes(src) >= 6 && _tieneBase64Largo(src))) {
    amenazas.push(_idAmenaza('ofuscacion', 'alta', 'Codigo posiblemente ofuscado (hex/base64)'));
  } else if (_contarHexEscapes(src) >= 4 || _tieneBase64Largo(src)) {
    amenazas.push(_idAmenaza('ofuscacion_leve', 'media', 'Patrones de ofuscacion detectados'));
  }

  const tieneAlta = amenazas.some(function (a) { return a.severidad === 'alta'; });
  const tieneMedia = amenazas.some(function (a) { return a.severidad === 'media'; });

  return {
    amenazas,
    tieneAlta,
    tieneMedia,
    rechazar: tieneAlta,
    requiere_revision_seguridad: tieneMedia && !tieneAlta
  };
}

function _mensajeRechazoCreador(escaneo) {
  const lista = (escaneo.amenazas || [])
    .filter(function (a) { return a.severidad === 'alta'; })
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

function htmlContenedorSandbox(codigo, titulo) {
  const safeCodigo = String(codigo || '').replace(/[^A-Za-z0-9]/g, '');
  const safeTitulo = String(titulo || 'Mini app').replace(/[<>&"]/g, '');
  const embedUrl = '/usar-miniapp/' + encodeURIComponent(safeCodigo) + '/app';
  return '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + safeTitulo + '</title>' +
    '<style>body{margin:0;background:#f5f7fb;font-family:system-ui,sans-serif}' +
    '.wrap{min-height:100vh;display:flex;flex-direction:column}' +
    'header{padding:10px 16px;background:#fff;border-bottom:1px solid #e4e7eb;font-size:14px;font-weight:600;color:#0d1117}' +
    'iframe{flex:1;width:100%;min-height:calc(100vh - 44px);border:0;background:#fff}' +
    '</style></head><body><div class="wrap">' +
    '<header>' + safeTitulo + '</header>' +
    '<iframe sandbox="allow-scripts" referrerpolicy="no-referrer" title="' + safeTitulo + '" src="' + embedUrl + '"></iframe>' +
    '</div></body></html>';
}

module.exports = {
  MINIAPP_CSP,
  analizarHtmlMiniapp,
  sanitizeMiniappHtml,
  htmlContenedorSandbox,
  mensajeRechazoCreador: _mensajeRechazoCreador
};
