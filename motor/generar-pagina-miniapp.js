'use strict';

const fs   = require('fs');
const path = require('path');
const { obtenerArchivoBuffer } = require('./r2');

const TEMPLATE_PATH = path.join(__dirname, 'templates', 'template-venta-pro.html');
const CLAUDE_MODEL  = 'claude-sonnet-4-6';
const GROQ_MODEL    = 'openai/gpt-oss-120b';

const DEFAULT_PALETTE = {
  bg:           '#0d0b1f',
  bg2:          '#161232',
  ink:          '#f4f2ff',
  ink_dim:      '#a29dc4',
  brand:        '#6d3ce0',
  brand_bright: '#9a6bff',
  accent:       '#ff6a3d'
};

const TEXT_KEYS = [
  'eyebrow', 'titulo_hero', 'titulo_hero_accent', 'hero_lead',
  'pain_titulo', 'pain_1_titulo', 'pain_1_texto', 'pain_2_titulo', 'pain_2_texto', 'pain_3_titulo', 'pain_3_texto',
  'transform_titulo', 'transform_desc',
  'transform_1_titulo', 'transform_1_texto', 'transform_2_titulo', 'transform_2_texto',
  'transform_3_titulo', 'transform_3_texto', 'transform_4_titulo', 'transform_4_texto',
  'incluye_titulo',
  'incluye_1_titulo', 'incluye_1_texto', 'incluye_2_titulo', 'incluye_2_texto',
  'incluye_3_titulo', 'incluye_3_texto', 'incluye_4_titulo', 'incluye_4_texto',
  'formato_titulo', 'formato_desc',
  'pilar_1_titulo', 'pilar_1_texto', 'pilar_2_titulo', 'pilar_2_texto', 'pilar_3_titulo', 'pilar_3_texto',
  'para_quien_titulo', 'para_quien_1', 'para_quien_2', 'para_quien_3', 'para_quien_4',
  'pullquote', 'pullquote_cite',
  'cta_titulo', 'cta_subtitulo'
];

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

function fmtPrecio(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  return (Math.round(v * 100) / 100).toFixed(v % 1 === 0 ? 0 : 2);
}

function fmtPrecioUsd(n) {
  return '$' + fmtPrecio(n);
}

function replaceAll(html, map) {
  let out = html;
  Object.keys(map).forEach(function (key) {
    out = out.split('{{' + key + '}}').join(String(map[key] != null ? map[key] : ''));
  });
  return out;
}

function categoriaLabel(categoria) {
  const cat = String(categoria || 'miniapp').toLowerCase();
  if (cat === 'infoproducto') return 'Infoproducto';
  if (cat === 'contenido_digital') return 'Contenido Digital';
  return 'Mini App';
}

function categoriaTipo(categoria) {
  const cat = String(categoria || 'miniapp').toLowerCase();
  if (cat === 'infoproducto') return 'infoproducto';
  if (cat === 'contenido_digital') return 'contenido digital';
  return 'mini app';
}

async function leerImagenBase64(key) {
  if (!key) return null;
  const buf = await obtenerArchivoBuffer(key);
  return {
    media_type: mediaTypeFromKey(key),
    data: buf.toString('base64')
  };
}

function normalizarPaleta(parsed) {
  const p = parsed || {};
  return {
    bg:           p.bg           || DEFAULT_PALETTE.bg,
    bg2:          p.bg2          || DEFAULT_PALETTE.bg2,
    ink:          p.ink          || DEFAULT_PALETTE.ink,
    ink_dim:      p.ink_dim      || DEFAULT_PALETTE.ink_dim,
    brand:        p.brand        || DEFAULT_PALETTE.brand,
    brand_bright: p.brand_bright || DEFAULT_PALETTE.brand_bright,
    accent:       p.accent       || DEFAULT_PALETTE.accent
  };
}

function paletaToMarkers(paleta) {
  const p = normalizarPaleta(paleta);
  return {
    COLOR_BG:           p.bg,
    COLOR_BG2:          p.bg2,
    COLOR_INK:          p.ink,
    COLOR_INK_DIM:      p.ink_dim,
    COLOR_BRAND:        p.brand,
    COLOR_BRAND_BRIGHT: p.brand_bright,
    COLOR_ACCENT:       p.accent
  };
}

async function obtenerPaletaColores(nombre, imagenes, anthropicKey) {
  if (!anthropicKey || !imagenes.length) {
    console.warn('[generar-pagina] Sin API key o sin imagenes — paleta por defecto');
    return { ...DEFAULT_PALETTE };
  }

  const content = [
    {
      type: 'text',
      text:
        'Analiza las fotos del producto digital "' + nombre + '" y devuelve SOLO un JSON con una paleta OSCURA cinematografica coherente con el producto: ' +
        '{ "bg": "#...", "bg2": "#...", "ink": "#...", "ink_dim": "#...", "brand": "#...", "brand_bright": "#...", "accent": "#..." }. ' +
        'Reglas: bg = fondo muy oscuro (casi negro con tinte del color dominante); bg2 = fondo secundario un poco mas claro; ' +
        'ink = texto claro (casi blanco con leve tinte); ink_dim = texto tenue/gris; brand = color principal del producto; ' +
        'brand_bright = version brillante del brand; accent = color de acento que contraste. ' +
        'Pensado para landing premium sobre fondo oscuro. Sin markdown ni texto extra.'
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
        max_tokens: 400,
        messages: [{ role: 'user', content: content }]
      })
    });

    if (!res.ok) {
      const errText = await res.text().catch(function () { return ''; });
      console.warn('[generar-pagina] Claude vision HTTP ' + res.status + ':', errText.slice(0, 200));
      return { ...DEFAULT_PALETTE };
    }

    const data = await res.json();
    const raw  = (data.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('');
    return normalizarPaleta(JSON.parse(limpiarJSON(raw)));
  } catch (e) {
    console.warn('[generar-pagina] Claude vision fallo:', e.message);
    return { ...DEFAULT_PALETTE };
  }
}

function buildFallbackTextos(nombre, descripcion, categoria) {
  const nom = String(nombre || 'Tu producto').trim();
  const desc = String(descripcion || nom).trim();
  const tipo = categoriaTipo(categoria);
  const catLbl = categoriaLabel(categoria);

  return {
    eyebrow: catLbl.toUpperCase() + ' · ACCESO DIGITAL',
    titulo_hero: nom,
    titulo_hero_accent: 'listo para usar',
    hero_lead: desc.slice(0, 220) || ('Accede a ' + nom + ' al instante. Compra segura, entrega automatica y acceso inmediato desde cualquier dispositivo.'),
    pain_titulo: 'Vender ' + tipo + ' por tu cuenta es mas dificil de lo que parece',
    pain_1_titulo: 'Demasiado tiempo en lo tecnico',
    pain_1_texto: 'Crear la pagina, configurar pagos y proteger el acceso puede llevar dias o semanas.',
    pain_2_titulo: 'Sin trafico, sin ventas',
    pain_2_texto: 'Aunque el producto sea bueno, llegar solo a compradores es lento y agotador.',
    pain_3_titulo: 'Herramientas que no escalan',
    pain_3_texto: 'Plataformas genericas cobran mensualidades y no estan pensadas para activos digitales.',
    transform_titulo: 'Lo que logras con ' + nom,
    transform_desc: 'Un activo digital listo para vender, con pagina profesional, entrega segura y acceso inmediato para tu comprador.',
    transform_1_titulo: 'Acceso inmediato',
    transform_1_texto: 'Tu comprador recibe su producto al instante, sin friccion ni registros innecesarios.',
    transform_2_titulo: 'Pagina de venta profesional',
    transform_2_texto: 'Una experiencia premium que transmite valor y convierte visitas en compras.',
    transform_3_titulo: 'Entrega protegida',
    transform_3_texto: 'Cada compra genera un acceso unico y seguro para proteger tu contenido.',
    transform_4_titulo: 'Listo para escalar',
    transform_4_texto: 'Tu producto puede promocionarse en red y venderse las 24 horas del dia.',
    incluye_titulo: 'Que incluye tu compra',
    incluye_1_titulo: 'Acceso completo a ' + nom,
    incluye_1_texto: 'Todo el contenido del ' + tipo + ' disponible de inmediato tras la compra.',
    incluye_2_titulo: 'Pagina de entrega personal',
    incluye_2_texto: 'Un enlace unico con tu codigo de acceso para volver cuando quieras.',
    incluye_3_titulo: 'Entrega digital segura',
    incluye_3_texto: 'Descarga o uso online protegido, sin compartir archivos por email.',
    incluye_4_titulo: 'Soporte de la plataforma',
    incluye_4_texto: 'Infraestructura de Ecommerce Agents para una experiencia fluida.',
    formato_titulo: 'Como recibes el producto',
    formato_desc: 'Compra, accede y usa. Todo el flujo esta automatizado para que empieces en minutos.',
    pilar_1_titulo: 'Compra instantanea',
    pilar_1_texto: 'Pago rapido sin crear cuenta. Acceso en segundos.',
    pilar_2_titulo: 'Acceso protegido',
    pilar_2_texto: 'Tu compra queda vinculada a un codigo unico de acceso.',
    pilar_3_titulo: 'Disponible 24/7',
    pilar_3_texto: 'Entra cuando quieras desde cualquier dispositivo.',
    para_quien_titulo: 'Para quien es ' + nom,
    para_quien_1: 'Personas que buscan resultados concretos sin perder tiempo.',
    para_quien_2: 'Compradores que valoran acceso inmediato y entrega digital segura.',
    para_quien_3: 'Quienes prefieren una solucion lista en lugar de armar todo desde cero.',
    para_quien_4: 'Usuarios que quieren un ' + tipo + ' practico, claro y accionable.',
    pullquote: 'Tu conocimiento merece convertirse en un activo que trabaje por ti.',
    pullquote_cite: 'Activos Digitales',
    cta_titulo: 'Obtén acceso a ' + nom,
    cta_subtitulo: 'Compra segura, entrega automatica y acceso inmediato a tu ' + tipo + '.'
  };
}

function textosToMarkers(textos) {
  const map = {};
  TEXT_KEYS.forEach(function (key) {
    map[key.toUpperCase()] = String(textos[key] != null ? textos[key] : '');
  });
  return map;
}

function mergeTextos(parsed, fallback) {
  const out = { ...fallback };
  TEXT_KEYS.forEach(function (key) {
    if (parsed && parsed[key] != null && String(parsed[key]).trim()) {
      out[key] = String(parsed[key]).trim();
    }
  });
  return out;
}

async function generarTextosGroq(nombre, descripcion, categoria, groqKey) {
  const fallback = buildFallbackTextos(nombre, descripcion, categoria);

  if (!groqKey) {
    console.warn('[generar-pagina] Sin GROQ_API_KEY — textos fallback');
    return fallback;
  }

  const catLbl = categoriaLabel(categoria);
  const keysJson = TEXT_KEYS.map(function (k) { return '"' + k + '"'; }).join(', ');

  const prompt =
    'Genera textos persuasivos de alta conversion en espanol para la pagina de venta del producto digital "' + nombre + '".\n' +
    'Categoria: ' + catLbl + '.\n' +
    'Descripcion del creador: "' + (descripcion || nombre) + '".\n\n' +
    'Devuelve SOLO un JSON con exactamente estas claves: ' + keysJson + '.\n\n' +
    'Reglas:\n' +
    '- Tono startup tech, premium, energetico, adaptado a la categoria.\n' +
    '- NO inventes estadisticas, cifras de ventas ni testimonios de personas reales.\n' +
    '- pullquote: frase inspiradora sobre el TEMA del producto (no cita de persona inventada).\n' +
    '- pullquote_cite: solo "Activos Digitales" o el nombre del producto, nunca un nombre de persona falso.\n' +
    '- titulo_hero_accent: frase corta (2-4 palabras) para degradado junto al titulo.\n' +
    '- Textos concisos: titulos cortos, parrafos de 1-2 frases.\n' +
    'Sin markdown.';

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
        max_tokens: 4500,
        temperature: 0.72
      })
    });

    const data = await res.json();
    if (!data.choices || !data.choices[0]) {
      console.warn('[generar-pagina] Groq sin choices:', data.error?.message || 'respuesta vacia');
      return fallback;
    }

    const parsed = JSON.parse(limpiarJSON(data.choices[0].message.content || ''));
    return mergeTextos(parsed, fallback);
  } catch (e) {
    console.warn('[generar-pagina] Groq fallo:', e.message);
    return fallback;
  }
}

/**
 * Valida HTML de pagina de venta Activos Digitales (template pro v1).
 * @returns {{ ok: boolean, tipo: string, errors: string[] }}
 */
function parsePaginaVentaDb(html) {
  const src = String(html || '');
  const errors = [];

  const esActivosV1 = src.includes('<!--activos-venta-template-v1-->') && src.includes('activos-venta-landing');
  const esLegacy    = src.includes('TEMPLATE DE PAGINA DE VENTA') || (src.includes('{{COLOR_1}}') === false && src.includes('--blue:'));

  if (esActivosV1) {
    if (!src.includes('btn-comprar-ea')) errors.push('Falta boton btn-comprar-ea');
    if (!src.includes('data-comprar')) errors.push('Falta atributo data-comprar');
    const leftover = src.match(/\{\{[A-Z0-9_]+\}\}/g);
    if (leftover && leftover.length) {
      errors.push('Marcadores sin rellenar: ' + [...new Set(leftover)].join(', '));
    }
    return { ok: errors.length === 0, tipo: 'activos-v1', errors };
  }

  if (esLegacy) {
    if (!src.includes('btn-comprar-ea')) errors.push('Falta boton btn-comprar-ea');
    return { ok: errors.length === 0, tipo: 'legacy-miniapp', errors };
  }

  if (!src.includes('btn-comprar-ea')) errors.push('Falta boton btn-comprar-ea');
  return { ok: errors.length === 0, tipo: 'unknown', errors };
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
  const categoria = miniapp.categoria || 'miniapp';

  console.log('[generar-pagina] Iniciando slug=' + miniapp.slug + ' pagina=' + paginaSlug + ' cat=' + categoria);

  const imagenes = [];
  if (miniapp.foto1_key) {
    const img1 = await leerImagenBase64(miniapp.foto1_key);
    if (img1) imagenes.push(img1);
  }
  if (miniapp.foto2_key) {
    const img2 = await leerImagenBase64(miniapp.foto2_key);
    if (img2) imagenes.push(img2);
  }

  const paleta = await obtenerPaletaColores(miniapp.nombre, imagenes, anthropicKey);
  const textos = await generarTextosGroq(
    miniapp.nombre,
    miniapp.descripcion || '',
    categoria,
    groqKey
  );

  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error('No se encontro el template en ' + TEMPLATE_PATH);
  }
  let html = fs.readFileSync(TEMPLATE_PATH, 'utf-8');

  const precioNormal = Number(miniapp.precio) || 0;
  const promoRaw     = Number(miniapp.precio_promocion);
  const hasPromo     = Number.isFinite(promoRaw) && promoRaw > 0 && promoRaw < precioNormal;
  const precioVenta  = hasPromo ? promoRaw : precioNormal;

  const foto1Url = baseUrl + '/api/miniapps/asset/' + encodeURIComponent(miniapp.slug) + '/foto1';
  const foto2Url = miniapp.foto2_key
    ? baseUrl + '/api/miniapps/asset/' + encodeURIComponent(miniapp.slug) + '/foto2'
    : foto1Url;

  const markers = Object.assign(
    {},
    paletaToMarkers(paleta),
    textosToMarkers(textos),
    {
      NOMBRE:           miniapp.nombre,
      PRECIO:           fmtPrecioUsd(precioVenta),
      PRECIO_ANTES:     hasPromo ? fmtPrecioUsd(precioNormal) : '',
      FOTO1_URL:        foto1Url,
      FOTO2_URL:        foto2Url,
      CHECKOUT_URL:     '/checkout?slug=' + encodeURIComponent(paginaSlug),
      CATEGORIA_LABEL:  categoriaLabel(categoria)
    }
  );

  html = replaceAll(html, markers);

  const validacion = parsePaginaVentaDb(html);
  if (!validacion.ok) {
    console.warn('[generar-pagina] Validacion pagina:', validacion.errors.join('; '));
  }

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

  const { error: linkErr } = await supabase
    .from('miniapps')
    .update({ pagina_venta_slug: paginaSlug })
    .eq('id', miniapp.id);

  if (linkErr) {
    console.warn('[generar-pagina] No se pudo guardar pagina_venta_slug:', linkErr.message);
  }

  return { ok: true, pagina_slug: paginaSlug };
}

module.exports = { generarPaginaVentaMiniapp, parsePaginaVentaDb };
