'use strict';

const fs   = require('fs');
const path = require('path');
const { obtenerArchivoBuffer } = require('./r2');

const TEMPLATE_PATH = path.join(__dirname, 'templates', 'template-venta-miniapp.html');
const CLAUDE_MODEL  = 'claude-sonnet-4-6';
const GROQ_MODEL    = 'openai/gpt-oss-120b';

const DEFAULT_COLORS = {
  color_1: '#2f86ff',
  color_2: '#7c3aed',
  color_3: '#ff5a3c'
};

function limpiarJSON(texto) {
  let t = String(texto || '').replace(/```(?:json)?/gi, '').trim();
  const inicio = t.indexOf('{');
  const fin    = t.lastIndexOf('}');
  if (inicio !== -1 && fin !== -1 && fin > inicio) t = t.slice(inicio, fin + 1);
  return t.trim();
}

function mediaTypeFromKey(key) {
  const ext = String(key || '').split('.').pop().toLowerCase();
  const map = {
    jpg:  'image/jpeg',
    jpeg: 'image/jpeg',
    png:  'image/png',
    webp: 'image/webp',
    gif:  'image/gif'
  };
  return map[ext] || 'image/jpeg';
}

function hexToRgba(hex, alpha) {
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6) return `rgba(47,134,255,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function fmtPrecio(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  return (Math.round(v * 100) / 100).toFixed(v % 1 === 0 ? 0 : 2);
}

function processConditionalBlock(html, blockName, include) {
  const re = new RegExp('\\{\\{#IF_' + blockName + '\\}\\}([\\s\\S]*?)\\{\\{/IF_' + blockName + '\\}\\}', 'g');
  return html.replace(re, include ? '$1' : '');
}

function replaceAll(html, map) {
  let out = html;
  Object.keys(map).forEach(function (key) {
    out = out.split('{{' + key + '}}').join(String(map[key] != null ? map[key] : ''));
  });
  return out;
}

async function leerImagenBase64(key) {
  if (!key) return null;
  const buf = await obtenerArchivoBuffer(key);
  return {
    media_type: mediaTypeFromKey(key),
    data: buf.toString('base64')
  };
}

async function obtenerPaletaColores(nombre, imagenes, anthropicKey) {
  if (!anthropicKey || !imagenes.length) {
    console.warn('[generar-pagina] Sin API key o sin imagenes — colores por defecto');
    return { ...DEFAULT_COLORS };
  }

  const content = [
    {
      type: 'text',
      text:
        'Analiza las fotos del producto "' + nombre + '" y devuelve SOLO un JSON con una paleta de 3 colores hex armonicos que combinen con las imagenes para una landing page moderna: ' +
        '{ "color_1": "#...", "color_2": "#...", "color_3": "#..." }. ' +
        'color_1 el principal/mas vibrante, color_2 secundario, color_3 acento. ' +
        'Que sean colores que se vean bien en botones y degradados sobre fondo claro. Sin markdown ni texto extra.'
    }
  ];

  imagenes.forEach(function (img) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: img.media_type, data: img.data }
    });
  });

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 300,
        messages: [{ role: 'user', content: content }]
      })
    });

    if (!res.ok) {
      const errText = await res.text().catch(function () { return ''; });
      console.warn('[generar-pagina] Claude vision HTTP ' + res.status + ':', errText.slice(0, 200));
      return { ...DEFAULT_COLORS };
    }

    const data = await res.json();
    const raw  = (data.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('');
    const parsed = JSON.parse(limpiarJSON(raw));

    return {
      color_1: parsed.color_1 || DEFAULT_COLORS.color_1,
      color_2: parsed.color_2 || DEFAULT_COLORS.color_2,
      color_3: parsed.color_3 || DEFAULT_COLORS.color_3
    };
  } catch (e) {
    console.warn('[generar-pagina] Claude vision fallo:', e.message);
    return { ...DEFAULT_COLORS };
  }
}

async function generarTextosGroq(nombre, descripcion, groqKey) {
  const fallback = {
    descripcion_corta: String(descripcion || nombre).slice(0, 160),
    descripcion_larga: String(descripcion || nombre)
  };

  if (!groqKey) {
    console.warn('[generar-pagina] Sin GROQ_API_KEY — descripcion original');
    return fallback;
  }

  const prompt =
    'Genera textos persuasivos de alta conversion en espanol para la pagina de venta del producto "' + nombre + '" con descripcion: "' + descripcion + '". ' +
    'Devuelve SOLO un JSON con: { "descripcion_corta": "...", "descripcion_larga": "..." }. ' +
    'descripcion_corta = 1-2 frases gancho; descripcion_larga = parrafo persuasivo de que incluye y beneficios. Sin markdown.';

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + groqKey
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 800,
        temperature: 0.75
      })
    });

    const data = await res.json();
    if (!data.choices || !data.choices[0]) {
      console.warn('[generar-pagina] Groq sin choices:', data.error?.message || 'respuesta vacia');
      return fallback;
    }

    const parsed = JSON.parse(limpiarJSON(data.choices[0].message.content || ''));
    return {
      descripcion_corta: parsed.descripcion_corta || fallback.descripcion_corta,
      descripcion_larga: parsed.descripcion_larga || fallback.descripcion_larga
    };
  } catch (e) {
    console.warn('[generar-pagina] Groq fallo:', e.message);
    return fallback;
  }
}

function tipoProductoLabel(tipo) {
  const t = String(tipo || '').toLowerCase();
  if (t.includes('pdf')) return 'Mini App + PDF';
  return 'Mini App';
}

/**
 * Genera (o regenera) la pagina de venta HTML de una mini app aprobada.
 * @param {object} miniapp  Fila de miniapps + creador_nombre opcional
 * @param {object} opts     { supabase, publicBaseUrl, anthropicKey, groqKey }
 * @returns {Promise<{ ok: true, pagina_slug: string }>}
 */
async function generarPaginaVentaMiniapp(miniapp, opts) {
  const { supabase, publicBaseUrl, anthropicKey, groqKey } = opts || {};
  if (!supabase) throw new Error('Se requiere cliente Supabase.');
  if (!miniapp || !miniapp.slug) throw new Error('Mini app invalida.');

  const baseUrl = publicBaseUrl || 'https://motor.ecommerceagents.store';
  const paginaSlug = miniapp.pagina_venta_slug || ('app-' + miniapp.slug);

  console.log('[generar-pagina] Iniciando miniapp=' + miniapp.slug + ' pagina=' + paginaSlug);

  // 1. Fotos desde R2
  const imagenes = [];
  if (miniapp.foto1_key) {
    const img1 = await leerImagenBase64(miniapp.foto1_key);
    if (img1) imagenes.push(img1);
  }
  if (miniapp.foto2_key) {
    const img2 = await leerImagenBase64(miniapp.foto2_key);
    if (img2) imagenes.push(img2);
  }

  // 2. Paleta Claude Vision
  const colores = await obtenerPaletaColores(miniapp.nombre, imagenes, anthropicKey);

  // 3. Textos Groq
  const textos = await generarTextosGroq(
    miniapp.nombre,
    miniapp.descripcion || '',
    groqKey
  );

  // 4. Template
  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error('No se encontro el template en ' + TEMPLATE_PATH);
  }
  let html = fs.readFileSync(TEMPLATE_PATH, 'utf-8');

  const precioNormal = Number(miniapp.precio) || 0;
  const promoRaw     = Number(miniapp.precio_promocion);
  const hasPromo     = Number.isFinite(promoRaw) && promoRaw > 0 && promoRaw < precioNormal;
  const precioPromo  = hasPromo ? promoRaw : precioNormal;
  const descuentoPct = hasPromo && precioNormal > 0
    ? Math.round((precioNormal - precioPromo) / precioNormal * 100)
    : 0;

  const foto1Url = baseUrl + '/api/miniapps/asset/' + encodeURIComponent(miniapp.slug) + '/foto1';
  const foto2Url = miniapp.foto2_key
    ? baseUrl + '/api/miniapps/asset/' + encodeURIComponent(miniapp.slug) + '/foto2'
    : '';

  const c1 = colores.color_1;
  const c2 = colores.color_2;
  const c3 = colores.color_3;

  html = replaceAll(html, {
    NOMBRE:            miniapp.nombre,
    DESCRIPCION:       textos.descripcion_larga,
    DESCRIPCION_CORTA: textos.descripcion_corta,
    PRECIO_NORMAL:     fmtPrecio(precioNormal),
    PRECIO_PROMO:      fmtPrecio(precioPromo),
    DESCUENTO_PCT:     String(descuentoPct),
    FOTO1_URL:         foto1Url,
    FOTO2_URL:         foto2Url,
    CREADOR:           miniapp.creador_nombre || 'Creador',
    TIPO:              tipoProductoLabel(miniapp.tipo_producto),
    CHECKOUT_URL:      '/checkout?slug=' + encodeURIComponent(paginaSlug),
    SLUG:              miniapp.slug,
    COLOR_1:           c1,
    COLOR_2:           c2,
    COLOR_3:           c3,
    GRAD_SOFT_1:       hexToRgba(c1, 0.12),
    GRAD_SOFT_2:       hexToRgba(c2, 0.12),
    GRAD_SOFT_3:       hexToRgba(c3, 0.12)
  });

  html = processConditionalBlock(html, 'FOTO2', !!miniapp.foto2_key);
  html = processConditionalBlock(html, 'IA', !!miniapp.usa_ia);

  // 5. Guardar en paginas_venta
  const { data: existing, error: findErr } = await supabase
    .from('paginas_venta')
    .select('id')
    .eq('slug', paginaSlug)
    .maybeSingle();

  if (findErr) throw findErr;

  const paginaRow = {
    nombre: miniapp.nombre,
    slug:   paginaSlug,
    html:   html,
    activa: true
  };

  if (existing && existing.id) {
    const { error: upErr } = await supabase
      .from('paginas_venta')
      .update({ nombre: paginaRow.nombre, html: paginaRow.html, activa: true })
      .eq('id', existing.id);
    if (upErr) throw upErr;
    console.log('[generar-pagina] Pagina actualizada id=' + existing.id);
  } else {
    paginaRow.vistas    = 0;
    paginaRow.creado_en = new Date().toISOString();
    const { error: insErr } = await supabase.from('paginas_venta').insert(paginaRow);
    if (insErr) throw insErr;
    console.log('[generar-pagina] Pagina creada slug=' + paginaSlug);
  }

  // 6. Vincular slug en miniapps (columna pagina_venta_slug)
  const { error: linkErr } = await supabase
    .from('miniapps')
    .update({ pagina_venta_slug: paginaSlug })
    .eq('id', miniapp.id);

  if (linkErr) {
    console.warn('[generar-pagina] No se pudo guardar pagina_venta_slug (¿falta columna en Supabase?):', linkErr.message);
  }

  return { ok: true, pagina_slug: paginaSlug };
}

module.exports = { generarPaginaVentaMiniapp };
