require('dotenv').config();
const express       = require('express');
const cors          = require('cors');
const path          = require('path');
const fs            = require('fs');
const crypto        = require('crypto');
const bcrypt        = require('bcrypt');
const { exec, execFile } = require('child_process');
const { promisify }      = require('util');
const multer        = require('multer');

const execAsync     = promisify(exec);
const execFileAsync = promisify(execFile);

const SYSTEM_TENDENCIAS  = require('./system-tendencias');
const SYSTEM_DESARROLLO  = require('./system-desarrollo');
const SYSTEM_MODULAR     = require('./system-modular');
const SYSTEM_COPY_EDITOR = require('./system-copy-editor');
const SYSTEM_CONTENIDO   = require('./system-contenido');
const SYSTEM_AVATAR      = require('./system-avatar');
const agenteVentas       = require('./agente-ventas');
const supabase           = require('./supabase');
const { subirArchivo, obtenerArchivo, obtenerArchivoBuffer, generarUrlFirmada, R2_PRESIGNED_EXPIRES_SEC } = require('./r2');
const { generarPaginaVentaMiniapp } = require('./generar-pagina-miniapp');
const miniappSeg = require('./miniapp-seguridad');
const jwtAuth    = require('./jwt-auth');
const rateLimit = require('express-rate-limit');
const ipKeyGenerator = rateLimit.ipKeyGenerator;
const Stripe     = require('stripe');
const { Resend } = require('resend');

const app  = express();
const PORT = process.env.PORT || 3002;

app.set('trust proxy', 1);

const RATE_LIMIT_MSG   = 'Demasiados intentos, espera unos minutos.';
const CLIENT_ERROR_MSG = 'Ocurrio un error, intenta de nuevo.';

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: RATE_LIMIT_MSG }
});

const recuperarPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: function (req) {
    const email = String((req.body && req.body.email) || '').trim().toLowerCase();
    const ipKey = req.ip ? ipKeyGenerator(req.ip) : 'unknown';
    return (email || 'no-email') + '|' + ipKey;
  },
  message: { ok: true, mensaje: 'Si el email esta registrado, recibiras un correo con instrucciones.' }
});

const compraRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: RATE_LIMIT_MSG }
});

// URL pública base del motor (API, checkout, páginas /p/, entrega, emails)
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || 'https://api.activosdigitales.click').replace(/\/$/, '');
const MARKETPLACE_PUBLIC_URL = (process.env.MARKETPLACE_PUBLIC_URL || 'https://activosdigitales.click').replace(/\/$/, '');
const API_PUBLIC_HOST = (function () {
  try { return new URL(PUBLIC_BASE_URL).hostname; } catch (_) { return 'api.activosdigitales.click'; }
})();
const COMPRA_PRUEBA_ACTIVA = process.env.COMPRA_PRUEBA_ACTIVA === 'true';
const STRIPE_SECRET_KEY       = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET   = process.env.STRIPE_WEBHOOK_SECRET || '';
const STRIPE_PUBLISHABLE_KEY  = process.env.STRIPE_PUBLISHABLE_KEY || '';
const RESEND_API_KEY          = process.env.RESEND_API_KEY || '';
const RESEND_FROM_EMAIL       = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
const CREADORES_PANEL_URL     = (process.env.CREADORES_PANEL_URL || 'https://app.activosdigitales.click').replace(/\/$/, '');

let _resendClient = null;
function _getResend() {
  if (!RESEND_API_KEY) return null;
  if (!_resendClient) _resendClient = new Resend(RESEND_API_KEY);
  return _resendClient;
}

let _stripeClient = null;
function _getStripe() {
  if (!STRIPE_SECRET_KEY) return null;
  if (!_stripeClient) _stripeClient = new Stripe(STRIPE_SECRET_KEY);
  return _stripeClient;
}

function _miniappFotoUrl(slug, file) {
  if (!slug) return null;
  return PUBLIC_BASE_URL + '/api/miniapps/asset/' + encodeURIComponent(slug) + '/' + file;
}

function _miniappToClient(m) {
  if (!m || typeof m !== 'object') return m;
  const out = Object.assign({}, m);
  const slug = out.slug;
  if (slug) {
    out.foto1_url = _miniappFotoUrl(slug, 'foto1');
    if (out.foto2_key) out.foto2_url = _miniappFotoUrl(slug, 'foto2');
  }
  delete out.r2_key;
  delete out.foto1_key;
  delete out.foto2_key;
  delete out.pdf_key;
  delete out.pack_key;
  delete out.video_key;
  return out;
}

function _vitrinaDescCorta(desc, maxLen) {
  const s = String(desc || '').replace(/\s+/g, ' ').trim();
  const max = maxLen || 140;
  if (!s) return '';
  if (s.length <= max) return s;
  return s.slice(0, max).trim() + '…';
}

function _miniappToVitrina(m) {
  const pagSlug = String(m.pagina_venta_slug || '').trim();
  const miniSlug = String(m.slug || '').trim();
  const promo = m.precio_promocion != null ? Number(m.precio_promocion) : null;
  return {
    nombre:              String(m.nombre || '').trim(),
    descripcion_corta:   _vitrinaDescCorta(m.descripcion, 140),
    precio:              Number(m.precio) || 0,
    precio_promocion:    promo != null && promo > 0 ? promo : null,
    categoria:           String(m.categoria || 'miniapp').toLowerCase(),
    foto1_url:           miniSlug && m.foto1_key ? _miniappFotoUrl(miniSlug, 'foto1') : null,
    pagina_venta_slug:   pagSlug,
    link_dueno:          pagSlug ? PUBLIC_BASE_URL + '/p/' + encodeURIComponent(pagSlug) : null
  };
}

function _setNoCacheJson(res) {
  res.setHeader('Cache-Control', 'no-cache, must-revalidate');
}

const ENTREGA_MINIAPP_TEMPLATE = path.join(__dirname, 'templates', 'template-entrega-miniapp.html');
const LEGAL_TERMINOS_TEMPLATE    = path.join(__dirname, 'templates', 'template-terminos.html');
const LEGAL_PRIVACIDAD_TEMPLATE  = path.join(__dirname, 'templates', 'template-privacidad.html');
const MOTOR_ASSETS_DIR           = path.join(__dirname, 'assets');
const DEFAULT_MINIAPP_COLORS = { color_1: '#2f86ff', color_2: '#7c3aed', color_3: '#ff5a3c' };
// Cambia en cada deploy/restart → cache-buster para JS/CSS/HTML del motor
const ASSET_VERSION = String(Date.now());

function _assetUrl(assetPath) {
  const p = String(assetPath || '');
  if (!p) return p;
  return p + (p.indexOf('?') >= 0 ? '&' : '?') + 'v=' + ASSET_VERSION;
}

function _setNoCacheHtml(res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, must-revalidate');
}

function _setNoCacheJs(res) {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, must-revalidate');
}

function _serveLegalPage(res, templatePath) {
  try {
    if (!fs.existsSync(templatePath)) {
      return res.status(500).send('Pagina no disponible.');
    }
    let html = fs.readFileSync(templatePath, 'utf-8');
    html = html
      .replace(/\{\{LOGO_URL\}\}/g, _assetUrl('/assets/logo-activos.jpg'))
      .replace(/\{\{CSS_URL\}\}/g, _assetUrl('/assets/legal.css'))
      .replace(/\{\{PREMIUM_CSS_URL\}\}/g, _assetUrl('/assets/premium-platform.css'))
      .replace(/\{\{HERO_JS_URL\}\}/g, _assetUrl('/assets/premium-hero.js'))
      .replace(/\{\{MARKETPLACE_URL\}\}/g, MARKETPLACE_PUBLIC_URL);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(html);
  } catch (e) {
    console.error('[legal]', e.message);
    res.status(500).send('Error al cargar la pagina.');
  }
}

// ── Autenticación JWT ─────────────────────────────────────────────────────────
function _authUnauthorized(res) {
  return res.status(401).json({ ok: false, error: 'No autorizado' });
}

function _verifyJwtRole(req, res, role) {
  const decoded = jwtAuth.decodeAuth(req);
  if (!decoded || decoded.role !== role || !decoded.sub) {
    _authUnauthorized(res);
    return null;
  }
  return decoded;
}

function requireAdmin(req, res, next) {
  const decoded = _verifyJwtRole(req, res, jwtAuth.ROLES.ADMIN);
  if (!decoded) return;
  req.admin = true;
  next();
}

async function requireUsuario(req, res, next) {
  const decoded = _verifyJwtRole(req, res, jwtAuth.ROLES.VENDEDOR);
  if (!decoded) return;
  const usuario_id = String(decoded.sub);
  try {
    const { data, error } = await supabase
      .from('usuarios')
      .select('id, activo')
      .eq('id', usuario_id)
      .maybeSingle();
    if (error || !data || !data.activo) {
      return _authUnauthorized(res);
    }
    req.usuario_id = usuario_id;
    next();
  } catch (e) {
    return _authUnauthorized(res);
  }
}

async function requireCreador(req, res, next) {
  const decoded = _verifyJwtRole(req, res, jwtAuth.ROLES.CREADOR);
  if (!decoded) return;
  const creador_id = String(decoded.sub);
  try {
    const { data, error } = await supabase
      .from('creadores')
      .select('id, nombre, email, estado')
      .eq('id', creador_id)
      .maybeSingle();
    if (error || !data || data.estado !== 'activo') {
      return _authUnauthorized(res);
    }
    req.creador_id = creador_id;
    req.creador    = data;
    next();
  } catch (e) {
    return _authUnauthorized(res);
  }
}

function _forbidUnlessSelf(req, res, targetId) {
  if (targetId != null && String(targetId) !== String(req.usuario_id)) {
    res.status(403).json({ ok: false, error: 'No autorizado' });
    return false;
  }
  return true;
}

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

// Verifica y descuenta créditos de Supabase.
// Si costo <= 0 resuelve sin tocar la BD. Devuelve { ok, creditos_restantes } o { ok:false, error }.
async function _deductCreditsBackend(usuario_id, costo, motor, descripcion) {
  if (!costo || costo <= 0) return { ok: true, creditos_restantes: null };
  const { data: usr, error: errL } = await supabase
    .from('usuarios').select('creditos_ia').eq('id', usuario_id).single();
  if (errL) throw new Error(errL.message);
  const actuales = Number(usr.creditos_ia) || 0;
  if (actuales < costo) {
    return { ok: false, error: 'Creditos insuficientes', creditos_actuales: actuales };
  }
  const nuevos = actuales - costo;
  const { error: errU } = await supabase
    .from('usuarios').update({ creditos_ia: nuevos }).eq('id', usuario_id);
  if (errU) throw new Error(errU.message);
  supabase.from('movimientos_creditos').insert({
    usuario_id, tipo: 'consumo', cantidad: costo,
    motor: motor || 'desconocido', descripcion: descripcion || '',
    saldo_despues: nuevos, fecha: new Date().toISOString()
  }).then(() => {}).catch(e => console.warn('[movimientos_creditos]', e.message));
  console.log(`[creditos] uid=${usuario_id} motor=${motor} -${costo} → restantes=${nuevos}`);
  return { ok: true, creditos_restantes: nuevos };
}

// ── Directorios de trabajo ────────────────────────────────────────────────────
const TEMP_DIR    = path.join(__dirname, 'temp');
const OUTPUTS_DIR = path.join(__dirname, 'outputs');
[TEMP_DIR, OUTPUTS_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// ── Multer: storage compartido ────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: TEMP_DIR,
  filename: function (req, file, cb) {
    const ext    = path.extname(file.originalname).toLowerCase() || '.mp4';
    const unique = `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, unique);
  }
});
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } }); // 500 MB

const uploadModular        = upload.single('video');
const uploadEditorFields   = upload.fields([{ name: 'video', maxCount: 1 }, { name: 'video2', maxCount: 1 }]);
const uploadReaccionFields = upload.fields([{ name: 'reaccionMemeFile', maxCount: 1 }]);
const uploadContenidoImg   = upload.single('imagen');
const uploadAvatarFields   = upload.fields([{ name: 'fotoAvatar', maxCount: 1 }, { name: 'fotoProducto', maxCount: 1 }]);

// Multer en disco para subida de activos digitales (fotos, PDF, videos)
const uploadMiniappFields = multer({
  storage: multer.diskStorage({
    destination: TEMP_DIR,
    filename: function (req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase() || '.bin';
      cb(null, Date.now() + '_' + Math.random().toString(36).slice(2) + ext);
    }
  }),
  limits: { fileSize: 100 * 1024 * 1024 }
}).fields([
  { name: 'pdf',    maxCount: 1 },
  { name: 'foto1',  maxCount: 1 },
  { name: 'foto2',  maxCount: 1 },
  { name: 'videos', maxCount: 30 }
]);

const CREADOR_CATEGORIAS = ['infoproducto', 'contenido_digital', 'miniapp'];

// ── CORS — lista blanca de orígenes permitidos ────────────────────────────────
// Editar aquí para agregar dominios de producción / Vercel / staging.
const ORIGENES_PERMITIDOS = [
  'http://localhost:3000',  // app vendedores (local)
  'http://localhost:3001',  // admin (local)
  'http://localhost:3002',  // motor local
  'http://localhost:3003',  // panel creadores (local)
  'https://activosdigitales.click',
  'https://www.activosdigitales.click',
  'https://api.activosdigitales.click',
  'https://app.activosdigitales.click',
  'https://admin.activosdigitales.click',
  // Vendedores fisicos (transitorio hasta Sistema Viral Pro)
  'https://ecommerceagents.store',
  'https://www.ecommerceagents.store',
  'https://ecommerce-agents-mauve.vercel.app',
];

const _corsOpts = {
  origin: function (origin, callback) {
    // Sin origen = petición directa de browser (barra de URL), curl, Postman, etc.
    // Permitirla para que las páginas HTML públicas (/p/:slug, /checkout) carguen bien.
    if (!origin) return callback(null, true);
    if (ORIGENES_PERMITIDOS.includes(origin)) return callback(null, true);
    callback(new Error('Origen no permitido por CORS: ' + origin));
  },
  credentials: true // permite enviar cookies / headers de auth en peticiones cross-origin
};

// ── Middleware ────────────────────────────────────────────────────────────────
// Stripe webhook: raw body ANTES de express.json (verificacion de firma)
app.post('/api/checkout/webhook', express.raw({ type: 'application/json' }), _handleStripeWebhook);

app.use(cors(_corsOpts));
app.use(express.json({ limit: '50mb' })); // 50 MB para soportar imagenes base64
app.use('/assets', express.static(MOTOR_ASSETS_DIR, {
  setHeaders: function (res) {
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  }
}));

// ════════════════════════════════════════════════════════════════════════════
// OBJETIVO 1 — Helper de limpieza de archivos
// Borra cada ruta de la lista de forma individual y segura.
// Ignora archivos que ya no existen; loguea solo si no puede borrar algo.
// ════════════════════════════════════════════════════════════════════════════
function limpiarArchivos(lista, contexto) {
  const ctx  = contexto ? `[${contexto}]` : '[limpieza]';
  let borrados = 0;
  for (const f of lista) {
    if (!f) continue;
    try {
      if (fs.existsSync(f)) {
        fs.unlinkSync(f);
        borrados++;
      }
    } catch (e) {
      console.warn(`${ctx} No se pudo borrar ${path.basename(f)}: ${e.code || e.message}`);
    }
  }
  if (borrados > 0) console.log(`${ctx} ${borrados} archivo(s) temporales eliminados`);
}

// ════════════════════════════════════════════════════════════════════════════
// OBJETIVO 3 — Limpieza programada de seguridad (cada 30 min)
// Borra archivos en temp/ y outputs/ con mas de 1 hora de antiguedad
// para limpiar restos de procesos que fallaron sin ejecutar su finally.
// ════════════════════════════════════════════════════════════════════════════
function limpiarDirectorioAntiguo(dir) {
  const UNA_HORA = 60 * 60 * 1000;
  const ahora    = Date.now();
  try {
    const archivos = fs.readdirSync(dir);
    let borrados = 0;
    for (const nombre of archivos) {
      if (nombre === '.gitkeep') continue;
      const ruta = path.join(dir, nombre);
      try {
        const stat = fs.statSync(ruta);
        if (stat.isFile() && (ahora - stat.mtimeMs) > UNA_HORA) {
          fs.unlinkSync(ruta);
          borrados++;
        }
      } catch {}
    }
    if (borrados > 0) {
      console.log(`[limpieza-auto] ${borrados} archivo(s) antiguos borrados en ${path.basename(dir)}/`);
    }
  } catch (e) {
    console.warn(`[limpieza-auto] Error escaneando ${dir}: ${e.message}`);
  }
}

// ── Utilidades de AI / video ──────────────────────────────────────────────────
function limpiarJSON(texto) {
  let t = texto.replace(/```(?:json)?/gi, '').trim();
  const inicio = t.indexOf('{');
  const fin    = t.lastIndexOf('}');
  if (inicio !== -1 && fin !== -1 && fin > inicio) t = t.slice(inicio, fin + 1);
  return t.trim();
}

async function getVideoDuration(filePath) {
  const { stdout } = await execAsync(
    `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`,
    { timeout: 15000 }
  );
  return parseFloat(stdout.trim()) || 0;
}

async function getVideoDimensions(filePath) {
  const { stdout } = await execAsync(
    `ffprobe -v quiet -print_format json -show_streams "${filePath}"`,
    { timeout: 15000 }
  );
  let data;
  try { data = JSON.parse(stdout); } catch { return { width: 1080, height: 1920 }; }
  const vs = (data.streams || []).find(s => s.codec_type === 'video');
  return { width: vs?.width || 1080, height: vs?.height || 1920 };
}

function _isPrivateIpv4(ip) {
  const parts = String(ip || '').split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isFinite(n) || n < 0 || n > 255)) return false;
  if (parts[0] === 127) return true;
  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  return false;
}

function _hostnameBloqueadoParaDescarga(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host === '::1' || host === '0:0:0:0:0:0:0:1') return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return _isPrivateIpv4(host);
  return false;
}

function validateDownloadVideoUrl(urlStr) {
  let parsed;
  try {
    parsed = new URL(String(urlStr || '').trim());
  } catch {
    throw new Error('URL invalida.');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('Solo se permiten URLs HTTPS.');
  }
  if (_hostnameBloqueadoParaDescarga(parsed.hostname)) {
    throw new Error('URL no permitida (red privada o localhost).');
  }
  return parsed.href;
}

async function downloadVideo(url, outputBase) {
  const safeUrl = validateDownloadVideoUrl(url);
  const outputTemplate = `${outputBase}.%(ext)s`;
  try {
    await execFileAsync('yt-dlp', [
      '-f', 'best[ext=mp4][height<=1080]/best[ext=mp4]/best',
      '--max-filesize', '200M',
      '-o', outputTemplate,
      safeUrl
    ], { timeout: 300000, maxBuffer: 10 * 1024 * 1024 });
  } catch (err) {
    const msg = err.message || '';
    if (msg.includes('max-filesize')) throw new Error('El video supera el tamano maximo permitido (200 MB).');
    if (msg.includes('URL invalida') || msg.includes('Solo se permiten') || msg.includes('URL no permitida')) throw err;
    throw new Error('Error al descargar el video. Verifica el link y que sea publico. (' + msg.slice(0, 100) + ')');
  }
  const dir      = path.dirname(outputBase);
  const baseName = path.basename(outputBase);
  const files    = fs.readdirSync(dir).filter(f => f.startsWith(baseName + '.') && !f.endsWith('.part'));
  if (files.length === 0) throw new Error('yt-dlp descargo el archivo pero no se pudo localizar. Intenta de nuevo.');
  return path.join(dir, files[0]);
}

// Genera copy optimizado para una red social analizando frames del video de salida.
// NO lanza excepciones — devuelve null si algo falla (el video ya fue procesado).
// Los frames temporales se registran en tempFiles para limpieza garantizada en finally.
async function generarCopyParaVideo(outVideoPath, redSocial, anthropicKey, tempFiles) {
  if (!anthropicKey) {
    console.warn('[copy-editor] ANTHROPIC_API_KEY no disponible, omitiendo copy');
    return null;
  }
  try {
    const dur = await getVideoDuration(outVideoPath);
    if (dur <= 0) return null;

    // Extraer 3 frames representativos al 20 %, 50 % y 80 % de la duracion
    const copyPrefix = `cpf_${Date.now()}`;
    const positions  = [0.2, 0.5, 0.8].map(p => Math.max(0.5, dur * p));
    const framePaths = [];

    for (let i = 0; i < positions.length; i++) {
      const fPath = path.join(TEMP_DIR, `${copyPrefix}_${i}.jpg`);
      framePaths.push(fPath);
      tempFiles.push(fPath); // el finally del endpoint padre los limpiara
      try {
        await execAsync(`ffmpeg -ss ${positions[i].toFixed(2)} -i "${outVideoPath}" -vframes 1 "${fPath}" -y`, { timeout: 15000 });
      } catch {
        // Frame individual fallido; continuar con los demas
      }
    }

    const framesOk = framePaths.filter(f => fs.existsSync(f));
    if (framesOk.length === 0) return null;

    // ── Claude Vision: describir el video ────────────────────────────────────
    const visionContent = [];
    for (const fPath of framesOk) {
      const b64 = fs.readFileSync(fPath).toString('base64');
      visionContent.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } });
    }
    visionContent.push({
      type: 'text',
      text: 'Describe briefly in Spanish what you see in these video frames: main subject, setting, and any visible action or text. Be concise (2-3 sentences).'
    });

    const vRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 500, messages: [{ role: 'user', content: visionContent }] })
    });
    if (!vRes.ok) { console.warn('[copy-editor] Vision HTTP', vRes.status); return null; }

    const vData      = await vRes.json();
    const descripcion = (vData.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    if (!descripcion) return null;

    // ── Claude: generar copy con SYSTEM_COPY_EDITOR ──────────────────────────
    const copyMsg = `RED SOCIAL: ${redSocial || 'TikTok'}\n\nDESCRIPCION DEL VIDEO:\n${descripcion}`;

    const cRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 800, system: SYSTEM_COPY_EDITOR, messages: [{ role: 'user', content: copyMsg }] })
    });
    if (!cRes.ok) { console.warn('[copy-editor] Copy HTTP', cRes.status); return null; }

    const cData = await cRes.json();
    if (cData.usage) {
      console.log(`[copy-editor] Tokens — entrada: ${cData.usage.input_tokens}, salida: ${cData.usage.output_tokens}`);
    }
    const cText   = (cData.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const cParsed = JSON.parse(limpiarJSON(cText));
    return cParsed.copy || null;

  } catch (err) {
    console.warn('[copy-editor] Error al generar copy (no critico):', err.message);
    return null;
  }
}

// ── Endpoint: POST /api/monetizacion/tendencias ───────────────────────────────
app.post('/api/monetizacion/tendencias', requireUsuario, async (req, res) => {
  const costo = COSTO_MOTOR_IA['viral-tendencias'];
  let _credRest = null;
  try {
    const cr = await _deductCreditsBackend(req.usuario_id, costo, 'viral-tendencias', 'Video viral - busqueda de tendencias');
    if (!cr.ok) return res.status(402).json({ ok: false, error: cr.error, creditos_actuales: cr.creditos_actuales });
    _credRest = cr.creditos_restantes;
  } catch (e) { return res.status(500).json({ ok: false, error: 'Error al verificar creditos' }); }

  const { macroNicho, microNicho, duracion, formato, relacionDeAspecto, idea } = req.body;

  if (!macroNicho || !microNicho || !formato) {
    return res.status(400).json({ error: 'Faltan campos obligatorios: macroNicho, microNicho y formato son requeridos.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[motor] ERROR: ANTHROPIC_API_KEY no esta configurada en .env');
    return res.status(500).json({ error: 'El servidor no tiene API key configurada.' });
  }

  const duracionTexto = duracion          ? `${duracion} segundos` : 'no especificada';
  const aspectoTexto  = relacionDeAspecto || '9:16';
  const ideaTexto     = idea && idea.trim() ? idea.trim() : 'ninguna';
  const userMessage = [
    `MACRO NICHO: ${macroNicho}`,
    `MICRO NICHO: ${microNicho}`,
    `FORMATO (red social): ${formato}`,
    `FORMATO DE PANTALLA: ${aspectoTexto}`,
    `DURACION: ${duracionTexto}`,
    `IDEA DEL USUARIO (opcional): ${ideaTexto}`
  ].join('\n');

  console.log('[motor] Llamando a Anthropic para:', { macroNicho, microNicho, formato, relacionDeAspecto, duracion });

  let anthropicRes;
  try {
    anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 4000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        system: SYSTEM_TENDENCIAS,
        messages: [{ role: 'user', content: userMessage }]
      })
    });
  } catch (fetchErr) {
    console.error('[motor] Error de red al llamar a Anthropic:', fetchErr.message);
    return res.status(502).json({ error: 'No se pudo conectar con la API de Anthropic.' });
  }

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text().catch(() => '');
    console.error(`[motor] Anthropic respondio ${anthropicRes.status}:`, errText);
    return res.status(502).json({ error: `La API de Anthropic respondio con error ${anthropicRes.status}.` });
  }

  let anthropicData;
  try { anthropicData = await anthropicRes.json(); }
  catch (jsonErr) {
    console.error('[motor] Error parseando respuesta de Anthropic:', jsonErr.message);
    return res.status(502).json({ error: 'respuesta invalida del motor' });
  }

  if (anthropicData.usage) {
    console.log(`[motor] Tokens — entrada: ${anthropicData.usage.input_tokens}, salida: ${anthropicData.usage.output_tokens}`);
  }

  const bloques = (anthropicData.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  if (!bloques) {
    console.error('[motor] La respuesta no contiene bloques de texto:', JSON.stringify(anthropicData.content));
    return res.status(502).json({ error: 'respuesta invalida del motor' });
  }

  let bocetosData;
  try { bocetosData = JSON.parse(limpiarJSON(bloques)); }
  catch (parseErr) {
    console.error('[motor] Error parseando JSON del modelo:', parseErr.message);
    console.error('[motor] Texto recibido:', bloques.slice(0, 500));
    return res.status(502).json({ error: 'respuesta invalida del motor' });
  }

  if (!bocetosData.bocetos || !Array.isArray(bocetosData.bocetos)) {
    console.error('[motor] JSON no tiene campo "bocetos":', JSON.stringify(bocetosData));
    return res.status(502).json({ error: 'respuesta invalida del motor' });
  }

  console.log(`[motor] OK — ${bocetosData.bocetos.length} bocetos generados.`);
  return res.json({ bocetos: bocetosData.bocetos, creditos_restantes: _credRest });
});

// ── Endpoint: POST /api/monetizacion/desarrollar ─────────────────────────────
app.post('/api/monetizacion/desarrollar', requireUsuario, async (req, res) => {
  // costo 0: incluido en viral-tendencias; solo requiere autenticacion
  const { titular, boceto, gancho, formato, relacionDeAspecto, duracion, numeroEscenas } = req.body;

  if (!titular || !boceto) {
    return res.status(400).json({ error: 'Faltan campos obligatorios: titular y boceto son requeridos.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[motor] ERROR: ANTHROPIC_API_KEY no esta configurada en .env');
    return res.status(500).json({ error: 'El servidor no tiene API key configurada.' });
  }

  const duracionTexto = duracion          ? `${duracion} segundos` : 'no especificada';
  const escenesTexto  = numeroEscenas     ? String(numeroEscenas)  : '5';
  const formatoTexto  = formato           || 'no especificado';
  const aspectoTexto  = relacionDeAspecto || '9:16';
  const ganchoTexto   = gancho            || 'no especificado';

  const userMessage = [
    `TITULAR: ${titular}`,
    `BOCETO: ${boceto}`,
    `GANCHO: ${ganchoTexto}`,
    `FORMATO (red social): ${formatoTexto}`,
    `FORMATO DE PANTALLA: ${aspectoTexto}`,
    `DURACION: ${duracionTexto}`,
    `NUMERO DE ESCENAS: ${escenesTexto}`
  ].join('\n');

  console.log('[motor] Desarrollando boceto:', { titular, formato, relacionDeAspecto, duracion, numeroEscenas });

  let anthropicRes;
  try {
    anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 4000,
        system: SYSTEM_DESARROLLO,
        messages: [{ role: 'user', content: userMessage }]
      })
    });
  } catch (fetchErr) {
    console.error('[motor] Error de red al llamar a Anthropic:', fetchErr.message);
    return res.status(502).json({ error: 'No se pudo conectar con la API de Anthropic.' });
  }

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text().catch(() => '');
    console.error(`[motor] Anthropic respondio ${anthropicRes.status}:`, errText);
    return res.status(502).json({ error: `La API de Anthropic respondio con error ${anthropicRes.status}.` });
  }

  let anthropicData;
  try { anthropicData = await anthropicRes.json(); }
  catch (jsonErr) {
    console.error('[motor] Error parseando respuesta de Anthropic:', jsonErr.message);
    return res.status(502).json({ error: 'respuesta invalida del motor' });
  }

  if (anthropicData.usage) {
    console.log(`[motor] Tokens — entrada: ${anthropicData.usage.input_tokens}, salida: ${anthropicData.usage.output_tokens}`);
  }

  const bloques = (anthropicData.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  if (!bloques) {
    console.error('[motor] La respuesta no contiene bloques de texto:', JSON.stringify(anthropicData.content));
    return res.status(502).json({ error: 'respuesta invalida del motor' });
  }

  let desarrolloData;
  try { desarrolloData = JSON.parse(limpiarJSON(bloques)); }
  catch (parseErr) {
    console.error('[motor] Error parseando JSON del modelo:', parseErr.message);
    console.error('[motor] Texto recibido:', bloques.slice(0, 500));
    return res.status(502).json({ error: 'respuesta invalida del motor' });
  }

  if (!desarrolloData.guion || !desarrolloData.miniatura || !Array.isArray(desarrolloData.escenas) || !desarrolloData.copy) {
    console.error('[motor] JSON de desarrollo incompleto:', JSON.stringify(desarrolloData).slice(0, 300));
    return res.status(502).json({ error: 'respuesta invalida del motor' });
  }

  console.log(`[motor] OK — desarrollo generado con ${desarrolloData.escenas.length} escenas.`);
  return res.json({
    guion:     desarrolloData.guion,
    miniatura: desarrolloData.miniatura,
    escenas:   desarrolloData.escenas,
    copy:      desarrolloData.copy
  });
});

// ── Endpoint: POST /api/monetizacion/modular ──────────────────────────────────
// Archivos gestionados: video subido + hasta 20 frames JPG + audio MP3
// Limpieza: SIEMPRE en finally, incluido el caso de error parcial de ffmpeg.
app.post('/api/monetizacion/modular', requireUsuario, function (req, res, next) {
  uploadModular(req, res, function (err) {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'El video es demasiado grande. Maximo 500 MB.' });
      return res.status(400).json({ error: 'Error al subir el archivo.' });
    }
    next();
  });
}, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Se requiere un archivo de video (campo "video").' });

  const _costo = COSTO_MOTOR_IA['modular'];
  let _credRest = null;
  try {
    const cr = await _deductCreditsBackend(req.usuario_id, _costo, 'modular', 'Video modular recreado');
    if (!cr.ok) { limpiarArchivos([req.file.path], 'modular-creditos'); return res.status(402).json({ ok: false, error: cr.error, creditos_actuales: cr.creditos_actuales }); }
    _credRest = cr.creditos_restantes;
  } catch (e) { limpiarArchivos([req.file.path], 'modular-creditos'); return res.status(500).json({ ok: false, error: 'Error al verificar creditos' }); }

  const { macroNicho, microNicho, formato, relacionDeAspecto, tramoDuracion } = req.body;
  if (!macroNicho || !microNicho || !formato) {
    // El archivo ya subio; hay que borrarlo antes de salir
    limpiarArchivos([req.file.path], 'modular-validacion');
    return res.status(400).json({ error: 'Faltan campos: macroNicho, microNicho y formato son requeridos.' });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const groqKey      = process.env.GROQ_API_KEY;
  if (!anthropicKey) {
    limpiarArchivos([req.file.path], 'modular-validacion');
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY no esta configurada en el servidor.' });
  }
  if (!groqKey) {
    limpiarArchivos([req.file.path], 'modular-validacion');
    return res.status(500).json({ error: 'GROQ_API_KEY no esta configurada en el servidor.' });
  }

  try { await execAsync('ffmpeg -version'); }
  catch {
    limpiarArchivos([req.file.path], 'modular-validacion');
    return res.status(500).json({ error: 'ffmpeg no esta instalado en el servidor.' });
  }

  const prefix    = req.file.filename.replace(/\.[^.]+$/, '');
  const videoPath = req.file.path;
  const audioPath = path.join(TEMP_DIR, `${prefix}_audio.mp3`);

  // Pre-registrar TODOS los posibles frames para limpieza garantizada,
  // incluso si ffmpeg crea algunos frames antes de fallar.
  const framesPosibles = [];
  for (let i = 1; i <= 20; i++) {
    framesPosibles.push(path.join(TEMP_DIR, `${prefix}_frame_${String(i).padStart(3, '0')}.jpg`));
  }

  // Lista maestra de archivos a borrar en finally
  const tempFiles = [videoPath, audioPath, ...framesPosibles];

  try {
    console.log(`[modular] Iniciando pipeline para ${prefix}`);

    // Extraer frames (1 cada 6s, max 20)
    console.log('[modular] Extrayendo frames...');
    const frameBase = path.join(TEMP_DIR, `${prefix}_frame_%03d.jpg`);
    try { await execAsync(`ffmpeg -i "${videoPath}" -vf fps=1/6 -frames:v 20 "${frameBase}" -y`); }
    catch (ffErr) { throw new Error('Error extrayendo frames del video. Verifica que el archivo no este corrupto.'); }

    // Recopilar frames que realmente existen (para enviar a Vision)
    const frameFiles = framesPosibles.filter(f => fs.existsSync(f));
    console.log(`[modular] ${frameFiles.length} frames extraidos`);

    // Extraer audio y transcribir
    let transcripcion = '(sin audio detectado)';
    try {
      console.log('[modular] Extrayendo audio...');
      await execAsync(`ffmpeg -i "${videoPath}" -q:a 0 -map a "${audioPath}" -y`);

      console.log('[modular] Transcribiendo con Whisper (Groq)...');
      const audioBuffer = fs.readFileSync(audioPath);
      const audioBlob   = new Blob([audioBuffer], { type: 'audio/mpeg' });
      const groqForm    = new FormData();
      groqForm.append('file', audioBlob, 'audio.mp3');
      groqForm.append('model', 'whisper-large-v3');
      groqForm.append('response_format', 'text');

      const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${groqKey}` },
        body: groqForm
      });

      if (groqRes.ok) {
        transcripcion = (await groqRes.text()).trim() || '(transcripcion vacia)';
        console.log(`[modular] Transcripcion OK — ${transcripcion.length} caracteres`);
      } else {
        const groqErrText = await groqRes.text().catch(() => '');
        console.warn(`[modular] Groq Whisper error ${groqRes.status}:`, groqErrText);
        transcripcion = '(error al transcribir el audio)';
      }
    } catch (audioErr) {
      console.warn('[modular] Sin audio o error de extraccion:', audioErr.message);
    }

    // Analizar frames con Claude Vision
    let descripcionesFrames = '(no se encontraron frames para analizar)';
    if (frameFiles.length > 0) {
      console.log(`[modular] Analizando ${frameFiles.length} frames con Claude Vision...`);
      const visionContent = [];
      for (const framePath of frameFiles) {
        const imgData = fs.readFileSync(framePath).toString('base64');
        visionContent.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imgData } });
      }
      visionContent.push({
        type: 'text',
        text: 'Describe briefly in English what you see in each of these video frames in order (one line per frame, format: "Frame 1: ..."). Be concise.'
      });

      const visionRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 2000, messages: [{ role: 'user', content: visionContent }] })
      });

      if (visionRes.ok) {
        const vd = await visionRes.json();
        if (vd.usage) console.log(`[modular] Vision tokens — entrada: ${vd.usage.input_tokens}, salida: ${vd.usage.output_tokens}`);
        const vt = (vd.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
        if (vt) descripcionesFrames = vt;
      } else {
        console.warn(`[modular] Claude Vision error ${visionRes.status}`);
      }
    }

    // Generar recreacion con SYSTEM_MODULAR
    console.log('[modular] Generando recreacion con Claude...');
    const duracionEstimada = tramoDuracion === 'largo' ? 120 : tramoDuracion === 'medio' ? 60 : 30;
    const numeroEscenas    = Math.round(duracionEstimada / 6);
    const aspectoTexto     = relacionDeAspecto || '9:16';

    const userMessage = [
      `MACRO NICHO: ${macroNicho}`, `MICRO NICHO: ${microNicho}`,
      `FORMATO (red social): ${formato}`, `FORMATO DE PANTALLA: ${aspectoTexto}`,
      `DURACION ESTIMADA: ${duracionEstimada} segundos`, `NUMERO DE ESCENAS: ${numeroEscenas}`,
      '', 'TRANSCRIPCION DEL VIDEO ORIGINAL:', transcripcion,
      '', 'DESCRIPCION DE FRAMES:', descripcionesFrames
    ].join('\n');

    const genRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 4000, system: SYSTEM_MODULAR, messages: [{ role: 'user', content: userMessage }] })
    });

    if (!genRes.ok) {
      const errText = await genRes.text().catch(() => '');
      console.error(`[modular] Anthropic generacion error ${genRes.status}:`, errText);
      throw new Error(`La API de Anthropic respondio con error ${genRes.status}.`);
    }

    const genData = await genRes.json();
    if (genData.usage) console.log(`[modular] Gen tokens — entrada: ${genData.usage.input_tokens}, salida: ${genData.usage.output_tokens}`);

    const genBloques = (genData.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    if (!genBloques) throw new Error('El motor no devolvio texto en la generacion final.');

    let modularData;
    try { modularData = JSON.parse(limpiarJSON(genBloques)); }
    catch (parseErr) {
      console.error('[modular] Error parseando JSON:', parseErr.message, genBloques.slice(0, 300));
      throw new Error('respuesta invalida del motor de modulacion');
    }

    if (!modularData.guion || !modularData.miniatura || !Array.isArray(modularData.escenas) || !modularData.copy) {
      throw new Error('respuesta invalida del motor de modulacion (campos faltantes)');
    }

    console.log(`[modular] OK — ${modularData.escenas.length} escenas generadas`);
    return res.json({ guion: modularData.guion, miniatura: modularData.miniatura, escenas: modularData.escenas, copy: modularData.copy, creditos_restantes: _credRest });

  } catch (err) {
    console.error('[modular] Error en pipeline:', err.message);
    if (!res.headersSent) return res.status(502).json({ error: CLIENT_ERROR_MSG });
  } finally {
    // Borra el video subido + audio extraido + todos los frames posibles (existsSync interno)
    limpiarArchivos(tempFiles, 'modular');
  }
});

// ── Endpoint: POST /api/editor/procesar-video ─────────────────────────────────
// OBJETIVO 2: -map_metadata -1 en todos los outputs ffmpeg para limpiar metadata.
// OBJETIVO 1: limpiarArchivos() en finally con lista pre-registrada.
app.post('/api/editor/procesar-video', requireUsuario, function (req, res, next) {
  uploadEditorFields(req, res, function (err) {
    if (err) return res.status(400).json({ ok: false, error: 'Error al subir archivo.' });
    next();
  });
}, async (req, res) => {
  let _credRest = null;
  try {
    const cr = await _deductCreditsBackend(req.usuario_id, COSTO_MOTOR_IA['editor-video'], 'editor-video', 'Editor de video split');
    if (!cr.ok) return res.status(402).json({ ok: false, error: cr.error, creditos_actuales: cr.creditos_actuales });
    _credRest = cr.creditos_restantes;
  } catch (e) { return res.status(500).json({ ok: false, error: 'Error al verificar creditos' }); }

  const { url = '', url2 = '', accion = 'split-vertical', clips = '1', audio_opcion = 'original', redSocial = 'TikTok' } = req.body;
  const numClips     = Math.min(3, Math.max(1, parseInt(clips) || 1));
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const tempFiles    = []; // videos de entrada (temp/) + frames copy (temp/)

  try {
    // Verificar herramientas
    try { await execAsync('ffmpeg -version', { timeout: 8000 }); }
    catch { return res.status(500).json({ ok: false, error: 'ffmpeg no esta instalado en el servidor.' }); }

    const needsVideo2 = accion === 'split-vertical' || accion === 'split-mitad' || accion === 'split';
    const needsYtdlp  = (!req.files?.video?.[0] && url.trim()) ||
                        (!req.files?.video2?.[0] && url2.trim() && needsVideo2);
    if (needsYtdlp) {
      try { await execAsync('yt-dlp --version', { timeout: 8000 }); }
      catch { return res.status(500).json({ ok: false, error: 'yt-dlp no esta instalado en el servidor.' }); }
    }

    // Resolver video 1 (archivo subido > link)
    let video1Path;
    if (req.files?.video?.[0]) {
      video1Path = req.files.video[0].path;
      tempFiles.push(video1Path);
    } else if (url.trim()) {
      const base = path.join(TEMP_DIR, `ed1_${Date.now()}`);
      video1Path = await downloadVideo(url.trim(), base);
      tempFiles.push(video1Path);
    } else {
      return res.status(400).json({ ok: false, error: 'Se requiere un video principal (link o archivo).' });
    }

    const dur1 = await getVideoDuration(video1Path);
    if (dur1 > 300) {
      return res.status(400).json({ ok: false, error: `El video principal dura ${Math.round(dur1)}s. Maximo 5 minutos (300s).` });
    }

    // ── ACCION: split-vertical (vstack, arriba/abajo, 9:16) ───────────────────
    if (accion === 'split-vertical' || accion === 'split') {
      let video2Path;
      if (req.files?.video2?.[0]) {
        video2Path = req.files.video2[0].path;
        tempFiles.push(video2Path);
      } else if (url2.trim()) {
        const base = path.join(TEMP_DIR, `ed2_${Date.now()}`);
        video2Path = await downloadVideo(url2.trim(), base);
        tempFiles.push(video2Path);
      } else {
        return res.status(400).json({ ok: false, error: 'Se requiere un segundo video.' });
      }

      const dur2 = await getVideoDuration(video2Path);
      if (dur2 > 300) {
        return res.status(400).json({ ok: false, error: `El segundo video dura ${Math.round(dur2)}s. Maximo 5 minutos.` });
      }

      const durMax = Math.max(dur1, dur2);

      let audioArg = '';
      if (audio_opcion === 'original' || audio_opcion === 'arriba') audioArg = '-map 0:a?';
      else if (audio_opcion === 'abajo') audioArg = '-map 1:a?';
      else if (audio_opcion === 'sin')   audioArg = '-an';

      const outName   = `split_vertical_${Date.now()}.mp4`;
      const outPath   = path.join(OUTPUTS_DIR, outName);
      const halfScale = 'scale=1080:960:force_original_aspect_ratio=decrease,pad=1080:960:(ow-iw)/2:(oh-ih)/2';
      const filterCx  = `[0:v]${halfScale}[v0];[1:v]${halfScale}[v1];[v0][v1]vstack=inputs=2[v]`;

      const splitCmd = `ffmpeg -stream_loop -1 -i "${video1Path}" -stream_loop -1 -i "${video2Path}" -filter_complex "${filterCx}" -map "[v]" ${audioArg} -t ${durMax.toFixed(2)} -r 30 -c:v libx264 -preset fast -crf 23 -map_metadata -1 "${outPath}" -y`;

      console.log('[editor/split-vertical] Procesando...');
      await execAsync(splitCmd, { timeout: 600000 });

      const copy = await generarCopyParaVideo(outPath, redSocial, anthropicKey, tempFiles);
      return res.json({ ok: true, filename: outName, copy, creditos_restantes: _credRest });
    }

    // ── ACCION: split-mitad (hstack, lado a lado, 9:16) ──────────────────────
    // Cada video ocupa 540px de ancho × 1920px de alto → resultado 1080×1920 (9:16)
    if (accion === 'split-mitad') {
      let video2Path;
      if (req.files?.video2?.[0]) {
        video2Path = req.files.video2[0].path;
        tempFiles.push(video2Path);
      } else if (url2.trim()) {
        const base = path.join(TEMP_DIR, `ed2m_${Date.now()}`);
        video2Path = await downloadVideo(url2.trim(), base);
        tempFiles.push(video2Path);
      } else {
        return res.status(400).json({ ok: false, error: 'Se requiere un segundo video.' });
      }

      const dur2 = await getVideoDuration(video2Path);
      if (dur2 > 300) {
        return res.status(400).json({ ok: false, error: `El segundo video dura ${Math.round(dur2)}s. Maximo 5 minutos.` });
      }

      const durMax = Math.max(dur1, dur2);

      let audioArg = '';
      if (audio_opcion === 'original' || audio_opcion === 'arriba') audioArg = '-map 0:a?';
      else if (audio_opcion === 'abajo') audioArg = '-map 1:a?';
      else if (audio_opcion === 'sin')   audioArg = '-an';

      const outName  = `split_mitad_${Date.now()}.mp4`;
      const outPath  = path.join(OUTPUTS_DIR, outName);
      // Cada video → 540×1920 manteniendo AR, relleno negro si no encaja exacto
      const halfScale = 'scale=540:1920:force_original_aspect_ratio=decrease,pad=540:1920:(ow-iw)/2:(oh-ih)/2';
      const filterCx  = `[0:v]${halfScale}[v0];[1:v]${halfScale}[v1];[v0][v1]hstack=inputs=2[v]`;

      const splitCmd = `ffmpeg -stream_loop -1 -i "${video1Path}" -stream_loop -1 -i "${video2Path}" -filter_complex "${filterCx}" -map "[v]" ${audioArg} -t ${durMax.toFixed(2)} -r 30 -c:v libx264 -preset fast -crf 23 -map_metadata -1 "${outPath}" -y`;

      console.log('[editor/split-mitad] Procesando...');
      await execAsync(splitCmd, { timeout: 600000 });

      const copy = await generarCopyParaVideo(outPath, redSocial, anthropicKey, tempFiles);
      return res.json({ ok: true, filename: outName, copy, creditos_restantes: _credRest });
    }

    // ── ACCION: clip ──────────────────────────────────────────────────────────
    if (accion === 'clip') {
      const clipDur = 20;
      const dims    = await getVideoDimensions(video1Path);
      const isVert  = dims.height > dims.width;

      const scaleFilter = isVert
        ? 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2'
        : 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2';

      const audioArg = audio_opcion === 'sin' ? '-an' : '-map 0:a?';

      const clipFilenames = [];
      for (let i = 0; i < numClips; i++) {
        let startSec;
        if (numClips === 1) {
          startSec = Math.max(0, dur1 * 0.66 - clipDur / 2);
        } else {
          startSec = Math.max(0, dur1 * 0.33 * (i + 1) - clipDur / 2);
          if (startSec + clipDur > dur1) startSec = Math.max(0, dur1 - clipDur);
        }

        const outName = `clip${i + 1}_${Date.now()}.mp4`;
        const outPath = path.join(OUTPUTS_DIR, outName);

        // -map_metadata -1 limpia metadata del clip generado
        const clipCmd = `ffmpeg -ss ${startSec.toFixed(2)} -i "${video1Path}" -t ${clipDur} -vf "${scaleFilter}" ${audioArg} -r 30 -c:v libx264 -preset fast -crf 23 -map_metadata -1 "${outPath}" -y`;
        console.log(`[editor/clip] Clip ${i + 1} desde ${startSec.toFixed(1)}s...`);
        await execAsync(clipCmd, { timeout: 180000 });
        clipFilenames.push(outName);
      }

      // Copy: se genera solo del primer clip (aplica tanto a 1 como a multiples clips)
      const firstClipPath = path.join(OUTPUTS_DIR, clipFilenames[0]);
      const copy = await generarCopyParaVideo(firstClipPath, redSocial, anthropicKey, tempFiles);

      if (clipFilenames.length === 1) return res.json({ ok: true, filename: clipFilenames[0], copy, creditos_restantes: _credRest });
      return res.json({ ok: true, clips: clipFilenames, copy, creditos_restantes: _credRest });
    }

    // ── ACCION: descargar ─────────────────────────────────────────────────────
    if (accion === 'descargar') {
      const outName = `descarga_${Date.now()}.mp4`;
      const outPath = path.join(OUTPUTS_DIR, outName);

      // -map_metadata -1 elimina metadata incluso en copia de stream
      const dlCmd = audio_opcion === 'sin'
        ? `ffmpeg -i "${video1Path}" -an -c:v copy -map_metadata -1 "${outPath}" -y`
        : `ffmpeg -i "${video1Path}" -c copy -map_metadata -1 "${outPath}" -y`;

      console.log('[editor/descargar] Copiando video...');
      await execAsync(dlCmd, { timeout: 120000 });

      const copy = await generarCopyParaVideo(outPath, redSocial, anthropicKey, tempFiles);
      return res.json({ ok: true, filename: outName, copy, creditos_restantes: _credRest });
    }

    return res.status(400).json({ ok: false, error: 'Accion no reconocida: ' + accion });

  } catch (err) {
    console.error('[editor/procesar-video] Error:', err.message);
    if (!res.headersSent) return res.status(502).json({ ok: false, error: CLIENT_ERROR_MSG });
  } finally {
    // Borra SIEMPRE los videos de entrada (subidos o descargados con yt-dlp)
    limpiarArchivos(tempFiles, 'editor/procesar-video');
  }
});

// ── Endpoint: POST /api/editor/procesar-reaccion ──────────────────────────────
// OBJETIVO 2: -map_metadata -1 en el output.
// OBJETIVO 1: limpiarArchivos() garantizado en finally.
app.post('/api/editor/procesar-reaccion', requireUsuario, function (req, res, next) {
  uploadReaccionFields(req, res, function (err) {
    if (err) return res.status(400).json({ ok: false, error: 'Error al subir archivo.' });
    next();
  });
}, async (req, res) => {
  let _credRest = null;
  try {
    const cr = await _deductCreditsBackend(req.usuario_id, COSTO_MOTOR_IA['editor-reaccion'], 'editor-reaccion', 'Video reaccion con meme');
    if (!cr.ok) return res.status(402).json({ ok: false, error: cr.error, creditos_actuales: cr.creditos_actuales });
    _credRest = cr.creditos_restantes;
  } catch (e) { return res.status(500).json({ ok: false, error: 'Error al verificar creditos' }); }

  const {
    url            = '',
    reaccionGifUrl = '',
    posicion       = 'bottomright',
    duracion       = '30',
    tamanoMeme     = '55',
    audio_opcion   = 'principal',
    redSocial      = 'TikTok'
  } = req.body;

  const maxDur     = Math.min(120, Math.max(5, parseInt(duracion) || 30));
  const tamano     = Math.min(90, Math.max(10, parseInt(tamanoMeme) || 55));
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const tempFiles  = [];

  try {
    try { await execAsync('ffmpeg -version', { timeout: 8000 }); }
    catch { return res.status(500).json({ ok: false, error: 'ffmpeg no esta instalado en el servidor.' }); }

    if (url.trim() || reaccionGifUrl.trim()) {
      try { await execAsync('yt-dlp --version', { timeout: 8000 }); }
      catch { return res.status(500).json({ ok: false, error: 'yt-dlp no esta instalado en el servidor.' }); }
    }

    if (!url.trim()) {
      return res.status(400).json({ ok: false, error: 'Se requiere la URL del video principal.' });
    }

    const hasMemeFile = req.files?.reaccionMemeFile?.[0];
    if (!hasMemeFile && !reaccionGifUrl.trim()) {
      return res.status(400).json({ ok: false, error: 'Se requiere el meme/reaccion green screen (link o archivo).' });
    }

    // Descargar video principal
    console.log('[reaccion] Descargando video principal...');
    const mainBase = path.join(TEMP_DIR, `react_main_${Date.now()}`);
    const mainPath = await downloadVideo(url.trim(), mainBase);
    tempFiles.push(mainPath);

    const mainDur = await getVideoDuration(mainPath);
    if (mainDur > 300) {
      return res.status(400).json({ ok: false, error: `El video principal dura ${Math.round(mainDur)}s. Maximo 5 minutos.` });
    }

    // Resolver meme (archivo subido > link)
    let memePath;
    if (hasMemeFile) {
      memePath = hasMemeFile.path;
      tempFiles.push(memePath);
    } else {
      console.log('[reaccion] Descargando meme...');
      const memeBase = path.join(TEMP_DIR, `react_meme_${Date.now()}`);
      memePath = await downloadVideo(reaccionGifUrl.trim(), memeBase);
      tempFiles.push(memePath);
    }

    const dims = await getVideoDimensions(mainPath);
    const boxW = Math.round(dims.width * tamano / 100);

    const posMap = {
      bottomright: 'W-w-20:H-h-20',
      bottomleft:  '20:H-h-20',
      topright:    'W-w-20:20'
    };
    const overlayPos = posMap[posicion] || posMap.bottomright;

    let audioFilter = '';
    let audioMapArg = '-an';
    if (audio_opcion === 'principal') {
      audioMapArg = '-map 0:a?';
    } else if (audio_opcion === 'reaccion') {
      audioMapArg = '-map 1:a?';
    } else if (audio_opcion === 'ambos') {
      audioFilter = ';[0:a][1:a]amix=inputs=2:duration=first[a]';
      audioMapArg = '-map "[a]"';
    }

    const outName       = `reaccion_${Date.now()}.mp4`;
    const outPath       = path.join(OUTPUTS_DIR, outName);
    const filterComplex = `[1:v]scale=${boxW}:-2,colorkey=0x00FF00:0.4:0.1[meme];[0:v][meme]overlay=${overlayPos}:shortest=1[v]${audioFilter}`;

    // -map_metadata -1 elimina toda metadata del video de reaccion generado
    const reaccionCmd = `ffmpeg -i "${mainPath}" -stream_loop -1 -i "${memePath}" -filter_complex "${filterComplex}" -map "[v]" ${audioMapArg} -t ${maxDur} -r 30 -c:v libx264 -preset fast -crf 23 -map_metadata -1 "${outPath}" -y`;

    console.log('[reaccion] Procesando overlay...');
    await execAsync(reaccionCmd, { timeout: 600000 });

    const copy = await generarCopyParaVideo(outPath, redSocial, anthropicKey, tempFiles);
    return res.json({ ok: true, filename: outName, copy, creditos_restantes: _credRest });

  } catch (err) {
    console.error('[reaccion] Error:', err.message);
    if (!res.headersSent) return res.status(502).json({ ok: false, error: CLIENT_ERROR_MSG });
  } finally {
    // Borra video principal descargado + meme (subido o descargado)
    limpiarArchivos(tempFiles, 'editor/procesar-reaccion');
  }
});

// ── Endpoint: GET /api/editor/preview/:filename ───────────────────────────────
// Sirve el video con soporte Range para que <video> pueda seekear.
// El archivo en outputs/ NO se borra aqui; se borra al descargar.
app.get('/api/editor/preview/:filename', (req, res) => {
  const filename = path.basename(req.params.filename); // prevenir path traversal
  const filePath = path.join(OUTPUTS_DIR, filename);

  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Archivo no encontrado.' });

  const stat     = fs.statSync(filePath);
  const fileSize = stat.size;
  const range    = req.headers.range;

  if (range) {
    const [rawStart, rawEnd] = range.replace(/bytes=/, '').split('-');
    const start     = parseInt(rawStart, 10);
    const end       = rawEnd ? parseInt(rawEnd, 10) : fileSize - 1;
    const chunkSize = end - start + 1;
    res.writeHead(206, {
      'Content-Range':  `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges':  'bytes',
      'Content-Length': chunkSize,
      'Content-Type':   'video/mp4'
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Length': fileSize, 'Content-Type': 'video/mp4' });
    fs.createReadStream(filePath).pipe(res);
  }
});

// ── Endpoint: GET /api/editor/descargar/:filename ─────────────────────────────
// OBJETIVO 1 (outputs/): Envia el archivo como descarga y lo borra al terminar,
// tanto si la descarga completa (finish) como si el cliente corta (close).
app.get('/api/editor/descargar/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(OUTPUTS_DIR, filename);

  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Archivo no encontrado.' });

  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'video/mp4');

  const stream = fs.createReadStream(filePath);
  stream.pipe(res);

  // Borrar UNA SOLA VEZ, tanto si termina bien como si el cliente desconecta
  let yaEliminado = false;
  function eliminarOutput() {
    if (yaEliminado) return;
    yaEliminado = true;
    // Retardo minimo para que el OS libere el file handle antes del unlink
    setTimeout(() => limpiarArchivos([filePath], 'descargar'), 800);
  }
  res.on('finish', eliminarOutput); // descarga completada
  res.on('close',  eliminarOutput); // cliente desconecto a mitad
});

// ── Helper: analizar imagen de producto con Claude Vision ─────────────────────
async function analizarImagenProducto(imagePath, anthropicKey) {
  if (!anthropicKey) return '';
  try {
    const ext      = path.extname(imagePath).toLowerCase();
    const mimeMap  = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
    const mimeType = mimeMap[ext] || 'image/jpeg';
    const b64      = fs.readFileSync(imagePath).toString('base64');

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: b64 } },
            { type: 'text', text: 'Describe detalladamente este producto en español: que es, como se ve, sus caracteristicas visuales relevantes (color, forma, materiales aparentes) y como podria beneficiar al comprador. Responde en 3-4 oraciones concisas.' }
          ]
        }]
      })
    });
    if (!res.ok) { console.warn('[vision-producto] HTTP', res.status); return ''; }
    const data = await res.json();
    if (data.usage) console.log(`[vision-producto] Tokens — entrada: ${data.usage.input_tokens}, salida: ${data.usage.output_tokens}`);
    return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
  } catch (err) {
    console.warn('[vision-producto] Error (no critico):', err.message);
    return '';
  }
}

// ── Helper: buscar info del producto en internet con web search ───────────────
async function buscarProductoInternet(producto, anthropicKey) {
  if (!anthropicKey) return '';
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }],
        messages: [{
          role: 'user',
          content: `Busca informacion sobre el producto "${producto}". Describe brevemente en español: que es, sus principales caracteristicas, beneficios para el cliente y publico objetivo. Responde en 3-5 oraciones concisas.`
        }]
      })
    });
    if (!res.ok) { console.warn('[web-search] HTTP', res.status); return ''; }
    const data = await res.json();
    if (data.usage) console.log(`[web-search] Tokens — entrada: ${data.usage.input_tokens}, salida: ${data.usage.output_tokens}`);
    return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
  } catch (err) {
    console.warn('[web-search] Error (no critico):', err.message);
    return '';
  }
}

// ── Endpoint: POST /api/contenido/organico ────────────────────────────────────
app.post('/api/contenido/organico', requireUsuario, function (req, res, next) {
  uploadContenidoImg(req, res, function (err) {
    if (err) return res.status(400).json({ ok: false, error: 'Error al subir imagen.' });
    next();
  });
}, async (req, res) => {
  let _credRest = null;
  try {
    const _tipo = (req.body && req.body.tipoContenido) || 'imagen';
    const _cKey = _tipo === 'video' ? 'contenido-avatar' : 'contenido-organico';
    const cr = await _deductCreditsBackend(req.usuario_id, COSTO_MOTOR_IA[_cKey], _cKey, 'Contenido organico - ' + _tipo);
    if (!cr.ok) return res.status(402).json({ ok: false, error: cr.error, creditos_actuales: cr.creditos_actuales });
    _credRest = cr.creditos_restantes;
  } catch (e) { return res.status(500).json({ ok: false, error: 'Error al verificar creditos' }); }

  const { producto = '', tipoContenido = 'imagen', redSocial = '', tono = '', idea = '', enfoque = 'emocional', duracion = '18', relacionImagen = '9:16', relacionDeAspecto = '9:16' } = req.body;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const tempFiles    = [];

  try {
    if (!anthropicKey) return res.status(500).json({ ok: false, error: 'ANTHROPIC_API_KEY no configurada.' });
    if (!producto.trim())  return res.status(400).json({ ok: false, error: 'Se requiere el nombre del producto.' });
    if (!redSocial.trim()) return res.status(400).json({ ok: false, error: 'Se requiere la red social.' });

    // Vision: analizar imagen del producto si fue subida
    let descripcionFoto = '';
    if (req.file) {
      tempFiles.push(req.file.path);
      console.log('[contenido/organico] Analizando imagen con Vision...');
      descripcionFoto = await analizarImagenProducto(req.file.path, anthropicKey);
    }

    // Web search: buscar info del producto en internet
    console.log('[contenido/organico] Buscando info del producto en internet...');
    const infoInternet = await buscarProductoInternet(producto.trim(), anthropicKey);

    // Construir mensaje para el generador de contenido
    const durSeg    = Math.max(6, parseInt(duracion) || 30);
    const numEscenas = Math.round(durSeg / 6);
    const partes = [
      `MODO: organico`,
      `PRODUCTO: ${producto.trim()}`,
      `TIPO: ${tipoContenido}`,
      `RED SOCIAL: ${redSocial}`,
      `TONO: ${tono || 'sin preferencia'}`,
      `ENFOQUE: ${enfoque}`
    ];
    if (tipoContenido === 'video') {
      partes.push(`DURACION: ${durSeg} segundos (${numEscenas} escenas de 6 segundos)`);
      partes.push(`FORMATO DE PANTALLA: ${relacionDeAspecto}`);
    }
    if (tipoContenido === 'imagen') partes.push(`FORMATO DE IMAGEN: ${relacionImagen}`);
    if (descripcionFoto) partes.push(`\nDESCRIPCION DE LA FOTO:\n${descripcionFoto}`);
    if (infoInternet)    partes.push(`\nINFORMACION DEL PRODUCTO:\n${infoInternet}`);
    if (idea && idea.trim()) partes.push(`\nIDEA O ANGULO:\n${idea.trim()}`);

    console.log('[contenido/organico] Generando contenido con Claude...');
    const genRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 2000,
        system: SYSTEM_CONTENIDO,
        messages: [{ role: 'user', content: partes.join('\n') }]
      })
    });

    if (!genRes.ok) {
      const errText = await genRes.text();
      throw new Error(`Claude error ${genRes.status}: ${errText}`);
    }

    const genData = await genRes.json();
    if (genData.usage) console.log(`[contenido/organico] Tokens — entrada: ${genData.usage.input_tokens}, salida: ${genData.usage.output_tokens}`);

    const rawText = (genData.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const parsed  = JSON.parse(limpiarJSON(rawText));

    // Devolver los campos que corresponden al tipo solicitado
    const respuesta = { ok: true, tipo: tipoContenido, copy: parsed.copy || '', creditos_restantes: _credRest };
    if (tipoContenido === 'video') {
      respuesta.guion    = parsed.guion    || '';
      respuesta.miniatura = parsed.miniatura || '';
      respuesta.escenas   = Array.isArray(parsed.escenas) ? parsed.escenas : [];
    } else {
      respuesta.prompt_imagen = parsed.prompt_imagen || '';
    }
    return res.json(respuesta);

  } catch (err) {
    console.error('[contenido/organico] Error:', err.message);
    if (!res.headersSent) return res.status(502).json({ ok: false, error: CLIENT_ERROR_MSG });
  } finally {
    limpiarArchivos(tempFiles, 'contenido/organico');
  }
});

// ── Endpoint: POST /api/contenido/anuncio ─────────────────────────────────────
app.post('/api/contenido/anuncio', requireUsuario, function (req, res, next) {
  uploadContenidoImg(req, res, function (err) {
    if (err) return res.status(400).json({ ok: false, error: 'Error al subir imagen.' });
    next();
  });
}, async (req, res) => {
  let _credRest = null;
  try {
    const _tipo = (req.body && req.body.tipoContenido) || 'imagen';
    const _cKey = _tipo === 'video' ? 'contenido-avatar' : 'contenido-anuncio';
    const cr = await _deductCreditsBackend(req.usuario_id, COSTO_MOTOR_IA[_cKey], _cKey, 'Contenido anuncio - ' + _tipo);
    if (!cr.ok) return res.status(402).json({ ok: false, error: cr.error, creditos_actuales: cr.creditos_actuales });
    _credRest = cr.creditos_restantes;
  } catch (e) { return res.status(500).json({ ok: false, error: 'Error al verificar creditos' }); }

  const { producto = '', tipoContenido = 'imagen', plataforma = '', objetivo = '', idea = '', enfoque = 'emocional', relacionImagen = '9:16', duracion: duracionAnun = '18', relacionDeAspecto: relacionDeAspectoAnun = '9:16' } = req.body;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const tempFiles    = [];

  try {
    if (!anthropicKey)   return res.status(500).json({ ok: false, error: 'ANTHROPIC_API_KEY no configurada.' });
    if (!producto.trim())  return res.status(400).json({ ok: false, error: 'Se requiere el nombre del producto.' });
    if (!plataforma.trim()) return res.status(400).json({ ok: false, error: 'Se requiere la plataforma.' });

    // Vision: analizar imagen del producto si fue subida
    let descripcionFoto = '';
    if (req.file) {
      tempFiles.push(req.file.path);
      console.log('[contenido/anuncio] Analizando imagen con Vision...');
      descripcionFoto = await analizarImagenProducto(req.file.path, anthropicKey);
    }

    // Web search: buscar info del producto en internet
    console.log('[contenido/anuncio] Buscando info del producto en internet...');
    const infoInternet = await buscarProductoInternet(producto.trim(), anthropicKey);

    // Construir mensaje para el generador de contenido
    const partes = [
      `MODO: anuncio`,
      `PRODUCTO: ${producto.trim()}`,
      `TIPO: ${tipoContenido}`,
      `PLATAFORMA: ${plataforma}`,
      `OBJETIVO: ${objetivo || 'sin preferencia'}`,
      `ENFOQUE: ${enfoque}`
    ];
    if (tipoContenido === 'imagen') partes.push(`FORMATO DE IMAGEN: ${relacionImagen}`);
    if (tipoContenido === 'video') {
      const durSegAnun     = Math.max(6, parseInt(duracionAnun) || 18);
      const numEscenasAnun = Math.round(durSegAnun / 6);
      partes.push(`DURACION: ${durSegAnun} segundos (${numEscenasAnun} escenas de 6 segundos)`);
      partes.push(`FORMATO DE PANTALLA: ${relacionDeAspectoAnun}`);
    }
    if (descripcionFoto) partes.push(`\nDESCRIPCION DE LA FOTO:\n${descripcionFoto}`);
    if (infoInternet)    partes.push(`\nINFORMACION DEL PRODUCTO:\n${infoInternet}`);
    if (idea && idea.trim()) partes.push(`\nIDEA O ANGULO:\n${idea.trim()}`);

    console.log('[contenido/anuncio] Generando anuncio con Claude...');
    const genRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 2000,
        system: SYSTEM_CONTENIDO,
        messages: [{ role: 'user', content: partes.join('\n') }]
      })
    });

    if (!genRes.ok) {
      const errText = await genRes.text();
      throw new Error(`Claude error ${genRes.status}: ${errText}`);
    }

    const genData = await genRes.json();
    if (genData.usage) console.log(`[contenido/anuncio] Tokens — entrada: ${genData.usage.input_tokens}, salida: ${genData.usage.output_tokens}`);

    const rawText = (genData.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const parsed  = JSON.parse(limpiarJSON(rawText));

    return res.json({
      ok:             true,
      titular:        parsed.titular        || '',
      cuerpo:         parsed.cuerpo         || '',
      llamado_accion: parsed.llamado_accion || '',
      copy:           parsed.copy           || '',
      creditos_restantes: _credRest
    });

  } catch (err) {
    console.error('[contenido/anuncio] Error:', err.message);
    if (!res.headersSent) return res.status(502).json({ ok: false, error: CLIENT_ERROR_MSG });
  } finally {
    limpiarArchivos(tempFiles, 'contenido/anuncio');
  }
});

// ── Helper: analizar foto de avatar (persona) con Claude Vision ───────────────
async function analizarImagenAvatar(imagePath, anthropicKey) {
  if (!anthropicKey) return '';
  try {
    const ext      = path.extname(imagePath).toLowerCase();
    const mimeMap  = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
    const mimeType = mimeMap[ext] || 'image/jpeg';
    const b64      = fs.readFileSync(imagePath).toString('base64');

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 400,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: b64 } },
            { type: 'text', text: 'Describe this person in Spanish for a UGC video ad: approximate age range, gender presentation, hair color and style, skin tone, facial expression, clothing style, and overall energy or vibe. Be concise (2-3 sentences).' }
          ]
        }]
      })
    });
    if (!res.ok) { console.warn('[vision-avatar] HTTP', res.status); return ''; }
    const data = await res.json();
    if (data.usage) console.log(`[vision-avatar] Tokens — entrada: ${data.usage.input_tokens}, salida: ${data.usage.output_tokens}`);
    return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
  } catch (err) {
    console.warn('[vision-avatar] Error (no critico):', err.message);
    return '';
  }
}

// ── Endpoint: POST /api/contenido/avatar ──────────────────────────────────────
app.post('/api/contenido/avatar', requireUsuario, function (req, res, next) {
  uploadAvatarFields(req, res, function (err) {
    if (err) return res.status(400).json({ ok: false, error: 'Error al subir imagen.' });
    next();
  });
}, async (req, res) => {
  let _credRest = null;
  try {
    const cr = await _deductCreditsBackend(req.usuario_id, COSTO_MOTOR_IA['contenido-avatar'], 'contenido-avatar', 'Video avatar UGC');
    if (!cr.ok) return res.status(402).json({ ok: false, error: cr.error, creditos_actuales: cr.creditos_actuales });
    _credRest = cr.creditos_restantes;
  } catch (e) { return res.status(500).json({ ok: false, error: 'Error al verificar creditos' }); }

  const { producto = '', redSocial = '', plataforma = '', enfoque = 'emocional', duracion = '10', relacionDeAspecto = '9:16', idea = '' } = req.body;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const tempFiles    = [];

  try {
    if (!anthropicKey) return res.status(500).json({ ok: false, error: 'ANTHROPIC_API_KEY no configurada.' });
    if (!producto.trim()) return res.status(400).json({ ok: false, error: 'Se requiere el nombre del producto.' });
    if (!req.files?.fotoAvatar?.[0]) return res.status(400).json({ ok: false, error: 'Se requiere la foto del avatar.' });
    if (!req.files?.fotoProducto?.[0]) return res.status(400).json({ ok: false, error: 'Se requiere la foto del producto.' });

    const avatarPath  = req.files.fotoAvatar[0].path;
    const productPath = req.files.fotoProducto[0].path;
    tempFiles.push(avatarPath, productPath);

    // Analizar ambas fotos con Vision
    console.log('[avatar] Analizando foto del avatar...');
    const descAvatar = await analizarImagenAvatar(avatarPath, anthropicKey);

    console.log('[avatar] Analizando foto del producto...');
    const descProducto = await analizarImagenProducto(productPath, anthropicKey);

    // Buscar info del producto en internet
    console.log('[avatar] Buscando info del producto...');
    const infoInternet = await buscarProductoInternet(producto.trim(), anthropicKey);

    const redSocialPlataforma = redSocial || plataforma || 'TikTok';
    const durSeg              = parseInt(duracion) || 10;
    const numEscenas          = durSeg >= 20 ? 2 : 1;

    const partes = [
      `PRODUCTO: ${producto.trim()}`,
      `RED SOCIAL / PLATAFORMA: ${redSocialPlataforma}`,
      `ENFOQUE: ${enfoque}`,
      `DURACION: ${durSeg} segundos (${numEscenas} escena${numEscenas > 1 ? 's' : ''} de 10 segundos)`,
      `FORMATO DE PANTALLA: ${relacionDeAspecto}`,
      `\nDESCRIPCION DEL AVATAR (persona):\n${descAvatar || 'No disponible'}`,
      `\nDESCRIPCION DEL PRODUCTO:\n${descProducto || 'No disponible'}`
    ];
    if (infoInternet) partes.push(`\nINFORMACION DEL PRODUCTO:\n${infoInternet}`);
    if (idea && idea.trim()) partes.push(`\nIDEA O ANGULO:\n${idea.trim()}`);

    console.log('[avatar] Generando anuncio UGC con Claude...');
    const genRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 2000,
        system: SYSTEM_AVATAR,
        messages: [{ role: 'user', content: partes.join('\n') }]
      })
    });

    if (!genRes.ok) {
      const errText = await genRes.text();
      throw new Error(`Claude error ${genRes.status}: ${errText}`);
    }

    const genData = await genRes.json();
    if (genData.usage) console.log(`[avatar] Tokens — entrada: ${genData.usage.input_tokens}, salida: ${genData.usage.output_tokens}`);

    const rawText = (genData.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const parsed  = JSON.parse(limpiarJSON(rawText));

    return res.json({
      ok:       true,
      guion:    parsed.guion    || '',
      tono_voz: parsed.tono_voz || '',
      escenas:  Array.isArray(parsed.escenas) ? parsed.escenas : [],
      copy:     parsed.copy     || '',
      creditos_restantes: _credRest
    });

  } catch (err) {
    console.error('[avatar] Error:', err.message);
    if (!res.headersSent) return res.status(502).json({ ok: false, error: CLIENT_ERROR_MSG });
  } finally {
    limpiarArchivos(tempFiles, 'contenido/avatar');
  }
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', motor: 'EcommerceAgent' }));

// ── AGENTE DE VENTAS WhatsApp ─────────────────────────────────────────────────

function _maskTelegramToken(token) {
  const t = String(token || '').trim();
  if (!t) return '';
  if (t.length <= 4) return '****';
  return '...' + t.slice(-4);
}

function _ventasConfigParaCliente(cfg) {
  const raw = cfg || {};
  const token = String(raw.telegramToken || '').trim();
  const safe = { ...raw };
  delete safe.telegramToken;
  safe.telegramToken = token ? _maskTelegramToken(token) : '';
  safe.telegramConfigured = !!token;
  return safe;
}

function _esTokenTelegramEnmascarado(val) {
  const s = String(val || '').trim();
  return !s || /^\.\.\.[A-Za-z0-9_-]{1,8}$/.test(s) || s === '****';
}

app.post('/api/ventas/config', requireAdmin, (req, res) => {
  try {
    const cfg = req.body || {};
    const current = agenteVentas.cargarConfig();
    const updated = { ...current, ...cfg };
    const incomingToken = cfg.telegramToken;
    if (incomingToken !== undefined && _esTokenTelegramEnmascarado(incomingToken)) {
      updated.telegramToken = current.telegramToken || '';
    }
    agenteVentas.guardarConfig(updated);
    res.json({ ok: true });
  } catch (e) {
    console.error('[ventas/config]', e.message);
    res.status(500).json({ error: CLIENT_ERROR_MSG });
  }
});

app.get('/api/ventas/config', requireAdmin, (req, res) => {
  try {
    const cfg = agenteVentas.cargarConfig();
    res.json(_ventasConfigParaCliente(cfg));
  } catch (e) {
    console.error('[ventas/config GET]', e.message);
    res.status(500).json({ error: CLIENT_ERROR_MSG });
  }
});

app.post('/api/ventas/conectar-whatsapp', requireAdmin, async (req, res) => {
  try {
    await agenteVentas.conectarWhatsApp();
    const estado = agenteVentas.getEstado();
    res.json({ ok: true, ...estado });
  } catch (e) {
    console.error('[ventas/conectar]', e.message);
    res.status(500).json({ error: CLIENT_ERROR_MSG });
  }
});

app.get('/api/ventas/qr', requireAdmin, (req, res) => {
  const estado = agenteVentas.getEstado();
  res.json(estado);
});

app.post('/api/ventas/desconectar-whatsapp', requireAdmin, async (req, res) => {
  try {
    const result = await agenteVentas.desconectarWhatsApp();
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error('[ventas/desconectar]', e.message);
    res.status(500).json({ error: CLIENT_ERROR_MSG });
  }
});

app.post('/api/ventas/probar-telegram', requireAdmin, async (req, res) => {
  try {
    const { token, chatId } = req.body || {};
    if (!token || !chatId) return res.status(400).json({ error: 'Falta token o chatId' });
    const ok = await agenteVentas.notificarTelegram(token, chatId, '<b>EcommerceAgent</b>: Telegram configurado correctamente. Tu agente de ventas ya puede enviarte notificaciones.');
    if (ok) res.json({ ok: true, mensaje: 'Mensaje de prueba enviado.' });
    else res.status(400).json({ error: 'No se pudo enviar. Verifica el token y el Chat ID.' });
  } catch (e) {
    console.error('[ventas/probar-telegram]', e.message);
    res.status(500).json({ error: CLIENT_ERROR_MSG });
  }
});

// ── Login ──────────────────────────────────────────────────────────────────────

// POST /api/login
// Valida codigo + codigoSeguridad contra Supabase tabla `usuarios`.
// POST /api/admin/login — verifica la contraseña de admin y devuelve la API key
app.post('/api/admin/login', authRateLimiter, (req, res) => {
  const { password } = req.body || {};
  if (!password || !ADMIN_PASSWORD || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ ok: false, error: 'Contraseña incorrecta' });
  }
  try {
    const token = jwtAuth.signAdminToken();
    console.log('[admin/login] Acceso concedido (JWT)');
    res.json({ ok: true, token });
  } catch (e) {
    console.error('[admin/login]', e.message);
    res.status(500).json({ ok: false, error: 'Error de autenticacion en el servidor.' });
  }
});

// Devuelve datos del usuario si todo es correcto. NUNCA devuelve codigo_seguridad.
app.post('/api/login', authRateLimiter, async (req, res) => {
  const { codigo, codigoSeguridad } = req.body || {};

  if (!codigo || !codigoSeguridad) {
    return res.status(400).json({ ok: false, error: 'Faltan datos de acceso.' });
  }

  try {
    // codigo_seguridad se trae SOLO para comparar en servidor, nunca se devuelve al cliente
    const { data, error } = await supabase
      .from('usuarios')
      .select('id, codigo, nombre, codigo_seguridad, activo, creditos_ia, saldo_productos, ref_codigo, whatsapp')
      .eq('codigo', String(codigo).trim().toUpperCase())
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return res.json({ ok: false, error: 'Credenciales invalidas.' });
    }
    const codigoOk = await _verificarCodigoSeguridadVendedor(data.codigo_seguridad, codigoSeguridad);
    if (!codigoOk) {
      return res.json({ ok: false, error: 'Credenciales invalidas.' });
    }
    await _rehashCodigoSeguridadVendedorSiLegacy(data.id, data.codigo_seguridad, codigoSeguridad);
    if (!data.activo) {
      return res.json({ ok: false, error: 'Tu cuenta aun no esta activa. Contacta al administrador.' });
    }

    let token;
    try {
      token = jwtAuth.signVendedorToken(data.id);
    } catch (jwtErr) {
      console.error('[login] JWT:', jwtErr.message);
      return res.status(503).json({ ok: false, error: 'Servidor de autenticacion no configurado.' });
    }

    return res.json({
      ok: true,
      token,
      usuario: {
        id:              data.id,
        codigo:          data.codigo,
        nombre:          data.nombre          || data.codigo,
        creditos_ia:     data.creditos_ia     ?? 0,
        saldo_productos: data.saldo_productos ?? 0,
        ref_codigo:      data.ref_codigo      || data.codigo,
        whatsapp:        data.whatsapp        || ''
      }
    });

  } catch (e) {
    console.error('[login]', e.message);
    res.status(500).json({ ok: false, error: 'Error interno. Intenta de nuevo.' });
  }
});

const VENDEDOR_SALT_ROUNDS = 12;

function _esHashBcrypt(str) {
  return /^\$2[aby]\$\d{2}\$/.test(String(str || ''));
}

async function hashCodigoSeguridadVendedor(plain) {
  return bcrypt.hash(String(plain || '').trim(), VENDEDOR_SALT_ROUNDS);
}

async function _verificarCodigoSeguridadVendedor(stored, plain) {
  const pass = String(plain || '').trim();
  const hash = String(stored || '');
  if (!hash || !pass) return false;
  if (_esHashBcrypt(hash)) {
    return bcrypt.compare(pass, hash);
  }
  return hash === pass;
}

async function _rehashCodigoSeguridadVendedorSiLegacy(usuarioId, stored, plain) {
  if (_esHashBcrypt(stored)) return;
  const pass = String(plain || '').trim();
  if (String(stored || '') !== pass) return;
  try {
    const newHash = await hashCodigoSeguridadVendedor(pass);
    const { error } = await supabase
      .from('usuarios')
      .update({ codigo_seguridad: newHash })
      .eq('id', usuarioId);
    if (error) console.warn('[login] rehash codigo_seguridad:', error.message);
    else console.log('[login] codigo_seguridad migrado a bcrypt uid=' + usuarioId);
  } catch (e) {
    console.warn('[login] rehash codigo_seguridad:', e.message);
  }
}

// ── Creadores de mini apps ────────────────────────────────────────────────────

const CREADOR_SALT_ROUNDS = 10;

// POST /api/creador/registro
app.post('/api/creador/registro', authRateLimiter, async (req, res) => {
  const { nombre, email, password } = req.body || {};
  const nombreTrim = String(nombre || '').trim();
  const emailNorm  = String(email || '').trim().toLowerCase();
  const pass       = String(password || '');

  if (!emailNorm || !pass) {
    return res.status(400).json({ ok: false, error: 'Email y contraseña son obligatorios.' });
  }
  if (pass.length < 6) {
    return res.status(400).json({ ok: false, error: 'La contraseña debe tener al menos 6 caracteres.' });
  }

  try {
    const { data: existente } = await supabase
      .from('creadores')
      .select('id')
      .eq('email', emailNorm)
      .maybeSingle();

    if (existente) {
      return res.status(409).json({ ok: false, error: 'Ese email ya esta registrado.' });
    }

    const password_hash = await bcrypt.hash(pass, CREADOR_SALT_ROUNDS);

    const { data, error } = await supabase
      .from('creadores')
      .insert({
        nombre:        nombreTrim || emailNorm.split('@')[0],
        email:         emailNorm,
        password_hash,
        estado:        'activo',
        creado_en:     new Date().toISOString()
      })
      .select('id, nombre, email')
      .single();

    if (error) throw error;

    console.log('[creador/registro] nuevo creador:', data.email);
    res.json({
      ok: true,
      token: jwtAuth.signCreadorToken(data.id),
      creador: data
    });
  } catch (e) {
    console.error('[creador/registro]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// POST /api/creador/login
app.post('/api/creador/login', authRateLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  const emailNorm = String(email || '').trim().toLowerCase();
  const pass      = String(password || '');

  if (!emailNorm || !pass) {
    return res.status(400).json({ ok: false, error: 'Email y contraseña son obligatorios.' });
  }

  try {
    const { data, error } = await supabase
      .from('creadores')
      .select('id, nombre, email, password_hash, estado')
      .eq('email', emailNorm)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return res.status(401).json({ ok: false, error: 'Email o contraseña incorrectos.' });
    }

    const match = await bcrypt.compare(pass, data.password_hash);
    if (!match) {
      return res.status(401).json({ ok: false, error: 'Email o contraseña incorrectos.' });
    }

    if (data.estado !== 'activo') {
      return res.status(403).json({ ok: false, error: 'Tu cuenta no esta activa. Contacta al administrador.' });
    }

    console.log('[creador/login] ok:', data.email);
    res.json({
      ok: true,
      token: jwtAuth.signCreadorToken(data.id),
      creador: { id: data.id, nombre: data.nombre, email: data.email }
    });
  } catch (e) {
    console.error('[creador/login]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

const CREADOR_MSG_RECUPERAR_OK = 'Si el email esta registrado, recibiras un correo con instrucciones.';

function _hashPasswordResetToken(token) {
  return crypto.createHash('sha256').update(String(token || '').trim()).digest('hex');
}

function _generarPasswordResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function _enviarCorreoRecuperarCreador(email, nombre, resetUrl) {
  const resend = _getResend();
  if (!resend) {
    console.error('[creador/recuperar-password] RESEND_API_KEY no configurada');
    return false;
  }
  const displayName = String(nombre || '').trim() || 'Creador';
  const html =
    '<div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;color:#0f1222">' +
    '<h2 style="color:#5b28e0;margin:0 0 12px">Recupera tu contraseña</h2>' +
    '<p>Hola ' + displayName.replace(/</g, '&lt;') + ',</p>' +
    '<p>Recibimos una solicitud para restablecer la contraseña de tu cuenta en <strong>Activos Digitales</strong>.</p>' +
    '<p style="margin:28px 0"><a href="' + resetUrl + '" style="display:inline-block;background:linear-gradient(120deg,#2b3af5,#8b2fd6);color:#fff;text-decoration:none;padding:14px 24px;border-radius:10px;font-weight:700">Restablecer contraseña</a></p>' +
    '<p style="font-size:13px;color:#5a5f74">O copia este enlace en tu navegador:<br><a href="' + resetUrl + '">' + resetUrl + '</a></p>' +
    '<p style="font-size:13px;color:#8b90a4;margin-top:24px">Este enlace expira en <strong>1 hora</strong>. Si no solicitaste este cambio, ignora este correo.</p>' +
    '</div>';
  try {
    const { error } = await resend.emails.send({
      from:    RESEND_FROM_EMAIL,
      to:      email,
      subject: 'Recupera tu contraseña - Activos Digitales',
      html
    });
    if (error) {
      console.error('[creador/recuperar-password] Resend:', error.message || error);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[creador/recuperar-password] Resend:', e.message);
    return false;
  }
}

// POST /api/creador/recuperar-password
app.post('/api/creador/recuperar-password', recuperarPasswordLimiter, async (req, res) => {
  const emailNorm = String((req.body && req.body.email) || '').trim().toLowerCase();
  const responderOk = function () {
    res.json({ ok: true, mensaje: CREADOR_MSG_RECUPERAR_OK });
  };

  if (!emailNorm || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
    return responderOk();
  }

  try {
    const { data: creador, error } = await supabase
      .from('creadores')
      .select('id, nombre, email, estado')
      .eq('email', emailNorm)
      .maybeSingle();

    if (error) throw error;

    if (!creador || creador.estado !== 'activo') {
      return responderOk();
    }

    const token     = _generarPasswordResetToken();
    const tokenHash = _hashPasswordResetToken(token);
    const expira    = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    await supabase
      .from('password_resets')
      .update({ usado: true })
      .eq('creador_id', creador.id)
      .eq('usado', false);

    const { error: insErr } = await supabase
      .from('password_resets')
      .insert({
        creador_id: creador.id,
        token_hash: tokenHash,
        expira_en:  expira,
        usado:      false
      });

    if (insErr) {
      if (/password_resets|relation|schema cache/i.test(String(insErr.message || ''))) {
        console.error('[creador/recuperar-password] tabla password_resets ausente');
        return responderOk();
      }
      throw insErr;
    }

    const resetUrl = CREADORES_PANEL_URL + '/restablecer?token=' + encodeURIComponent(token);
    const enviado  = await _enviarCorreoRecuperarCreador(creador.email, creador.nombre, resetUrl);
    if (!enviado) {
      await supabase.from('password_resets').update({ usado: true }).eq('token_hash', tokenHash);
    } else {
      console.log('[creador/recuperar-password] correo enviado a', creador.email);
    }

    responderOk();
  } catch (e) {
    console.error('[creador/recuperar-password]', e.message);
    responderOk();
  }
});

// POST /api/creador/restablecer-password
app.post('/api/creador/restablecer-password', authRateLimiter, async (req, res) => {
  const token   = String((req.body && req.body.token) || '').trim();
  const nueva   = String((req.body && req.body.nueva_password) || '');

  if (!token) {
    return res.status(400).json({ ok: false, error: 'El enlace no es valido o ha expirado.' });
  }
  if (!nueva || nueva.length < 6) {
    return res.status(400).json({ ok: false, error: 'La contraseña debe tener al menos 6 caracteres.' });
  }

  try {
    const tokenHash = _hashPasswordResetToken(token);
    const { data: row, error: selErr } = await supabase
      .from('password_resets')
      .select('id, creador_id, expira_en, usado')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (selErr) {
      if (/password_resets|relation|schema cache/i.test(String(selErr.message || ''))) {
        console.error('[creador/restablecer-password] tabla password_resets ausente');
        return res.status(503).json({ ok: false, error: 'Servicio no disponible. Intenta mas tarde.' });
      }
      throw selErr;
    }

    if (!row || row.usado) {
      return res.status(400).json({ ok: false, error: 'El enlace no es valido o ya fue utilizado.' });
    }
    if (new Date(row.expira_en).getTime() < Date.now()) {
      return res.status(400).json({ ok: false, error: 'El enlace ha expirado. Solicita uno nuevo.' });
    }

    const password_hash = await bcrypt.hash(nueva, CREADOR_SALT_ROUNDS);
    const { error: updErr } = await supabase
      .from('creadores')
      .update({ password_hash })
      .eq('id', row.creador_id);

    if (updErr) throw updErr;

    const { error: markErr } = await supabase
      .from('password_resets')
      .update({ usado: true })
      .eq('id', row.id)
      .eq('usado', false);

    if (markErr) throw markErr;

    await supabase
      .from('password_resets')
      .update({ usado: true })
      .eq('creador_id', row.creador_id)
      .eq('usado', false);

    console.log('[creador/restablecer-password] ok creador_id=' + row.creador_id);
    res.json({ ok: true, mensaje: 'Contraseña actualizada. Ya puedes iniciar sesion.' });
  } catch (e) {
    console.error('[creador/restablecer-password]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

const CREADOR_PARTE_PLATAFORMA_DEFAULT = 10;
const MINIAPP_PLATAFORMA_PCT = 10;
/** ref=directo (venta del dueño / creador): sin vendedor, reparto 90% creador / 10% plataforma */
const REF_VENTA_DIRECTA = 'DIRECTO';
// Comision vendedores en activos digitales desactivada. Reactivar para Sistema Viral Pro poniendo true.
const COMISION_VENDEDORES_DIGITAL_ACTIVA = false;

async function _refVendedorCompraDigital(ref) {
  if (!COMISION_VENDEDORES_DIGITAL_ACTIVA) {
    return { vendedor_id: null, ref_vendedor: null };
  }
  return _resolverRefVendedorCompra(ref);
}

function _roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

function _calcComisionVendedorMiniapp(monto, comisionVendedorPct) {
  const m   = Number(monto) || 0;
  const pct = Number(comisionVendedorPct) || 0;
  return _roundMoney(m * pct / 100);
}

function _calcPartePlataformaMiniapp(monto) {
  return _roundMoney((Number(monto) || 0) * MINIAPP_PLATAFORMA_PCT / 100);
}

function _calcParteCreadorMiniapp(monto, comisionVendedorPct) {
  const m = Number(monto) || 0;
  return _roundMoney(Math.max(0, m - _calcPartePlataformaMiniapp(m) - _calcComisionVendedorMiniapp(m, comisionVendedorPct)));
}

function _compraTuvoVendedor(compra) {
  if (!compra) return false;
  return compra.vendedor_id != null && String(compra.vendedor_id).trim() !== '';
}

function _emailCompradorValido(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e || e.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
  return e;
}

function _emailCompradorOpcional(email) {
  const raw = String(email || '').trim();
  if (!raw) return null;
  const valido = _emailCompradorValido(raw);
  if (!valido) {
    const err = new Error('Email invalido.');
    err.statusCode = 400;
    throw err;
  }
  return valido;
}

async function _validarMiniappDisponibleCompra(miniapp) {
  if (!miniapp) return { ok: false, error: 'Producto no encontrado.' };
  const cat = String(miniapp.categoria || 'miniapp').toLowerCase();
  if (cat === 'miniapp') {
    if (!miniapp.r2_key) return { ok: false, error: 'Producto no disponible.' };
    return { ok: true };
  }
  if (cat === 'infoproducto') {
    if (!miniapp.pdf_key) return { ok: false, error: 'Producto no disponible.' };
    return { ok: true };
  }
  if (cat === 'contenido_digital') {
    const { count, error } = await supabase
      .from('miniapp_videos')
      .select('id', { count: 'exact', head: true })
      .eq('miniapp_id', miniapp.id);
    if (error) throw error;
    if (!count || count < 1) return { ok: false, error: 'Producto no disponible.' };
    return { ok: true };
  }
  return { ok: false, error: 'Producto no disponible.' };
}

async function _resolverRefVendedorCompra(ref) {
  const refRaw = String(ref || '').trim();
  if (!refRaw) return { vendedor_id: null, ref_vendedor: null };
  const refUpper = refRaw.toUpperCase();
  if (refUpper === REF_VENTA_DIRECTA) {
    return { vendedor_id: null, ref_vendedor: null };
  }
  const { data: vend, error } = await supabase
    .from('usuarios')
    .select('id, codigo')
    .eq('codigo', refUpper)
    .maybeSingle();
  if (error) throw error;
  if (!vend) return { vendedor_id: null, ref_vendedor: null };
  return { vendedor_id: vend.id, ref_vendedor: vend.codigo || refUpper };
}

function _calcRepartoCompraDigital(monto, miniapp, vendedor_id) {
  const m = Number(monto) || 0;
  const comision_plataforma_pct = MINIAPP_PLATAFORMA_PCT;
  const tuvoVendedor = vendedor_id != null && String(vendedor_id).trim() !== '';
  const comision_vendedor_pct = tuvoVendedor ? (Number(miniapp.comision_vendedor) || 0) : 0;
  const monto_plataforma = _calcPartePlataformaMiniapp(m);
  const monto_vendedor   = tuvoVendedor ? _calcComisionVendedorMiniapp(m, comision_vendedor_pct) : 0;
  const monto_creador    = _roundMoney(Math.max(0, m - monto_plataforma - monto_vendedor));
  return {
    comision_plataforma_pct,
    comision_vendedor_pct,
    monto_plataforma,
    monto_vendedor,
    monto_creador
  };
}

const ENTREGA_DESCARGAS_MAX_MINIAPP   = 30;
const ENTREGA_DESCARGAS_MAX_PDF       = 10;
const ENTREGA_DESCARGAS_MAX_POR_VIDEO = 5;

async function _calcDescargasMaxMiniapp(miniapp) {
  const cat = String(miniapp.categoria || 'miniapp').toLowerCase();
  if (cat === 'infoproducto') return ENTREGA_DESCARGAS_MAX_PDF;
  if (cat === 'miniapp') return ENTREGA_DESCARGAS_MAX_MINIAPP;
  if (cat === 'contenido_digital') {
    const { count, error } = await supabase
      .from('miniapp_videos')
      .select('id', { count: 'exact', head: true })
      .eq('miniapp_id', miniapp.id);
    if (error) throw error;
    const numVideos = Math.max(1, Number(count) || 1);
    return numVideos * ENTREGA_DESCARGAS_MAX_POR_VIDEO;
  }
  return 20;
}

async function _registrarCompraDigital(opts) {
  const {
    miniapp,
    ref,
    email,
    estado_pago,
    stripe_session_id,
    stripe_payment_intent_id
  } = opts || {};

  if (!miniapp || !miniapp.id) {
    const err = new Error('Producto no valido.');
    err.statusCode = 400;
    throw err;
  }

  const emailOpcional = _emailCompradorOpcional(email);
  const estado = String(estado_pago || 'pendiente').toLowerCase();
  if (estado !== 'pendiente' && estado !== 'pagado') {
    const err = new Error('estado_pago invalido.');
    err.statusCode = 400;
    throw err;
  }

  let mini = miniapp;
  if (mini.comision_vendedor === undefined) {
    const { data, error } = await supabase
      .from('miniapps')
      .select('id, slug, precio, precio_promocion, comision_vendedor, categoria')
      .eq('id', miniapp.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      const err = new Error('Producto no encontrado.');
      err.statusCode = 404;
      throw err;
    }
    mini = Object.assign({}, miniapp, data);
  }

  const refRes       = await _refVendedorCompraDigital(ref);
  const monto        = _miniappPrecioVenta(mini);
  const codigo       = await _generarCodigoAccesoUnico();
  const descargas_max = await _calcDescargasMaxMiniapp(mini);
  const reparto      = _calcRepartoCompraDigital(monto, mini, refRes.vendedor_id);

  const insertPayload = {
    miniapp_id:              mini.id,
    miniapp_slug:            mini.slug,
    codigo_acceso:           codigo,
    comprador_email:         emailOpcional,
    ref_vendedor:            refRes.ref_vendedor,
    vendedor_id:             refRes.vendedor_id,
    monto,
    estado_pago:             estado,
    descargas_count:         0,
    descargas_max,
    comision_plataforma_pct: reparto.comision_plataforma_pct,
    comision_vendedor_pct:   reparto.comision_vendedor_pct,
    monto_plataforma:        reparto.monto_plataforma,
    monto_vendedor:          reparto.monto_vendedor,
    monto_creador:           reparto.monto_creador
  };

  if (stripe_session_id) {
    insertPayload.stripe_session_id = String(stripe_session_id).slice(0, 255);
  }
  if (stripe_payment_intent_id) {
    insertPayload.stripe_payment_intent_id = String(stripe_payment_intent_id).slice(0, 255);
  }
  if (estado === 'pagado') {
    insertPayload.pagado_en = new Date().toISOString();
  }

  const { data: compra, error: insErr } = await supabase
    .from('miniapp_compras')
    .insert(insertPayload)
    .select()
    .single();

  if (insErr) {
    if (/descargas_count|descargas_max|comision_|monto_|stripe_|pagado_en|column|schema cache/.test(String(insErr.message || ''))) {
      console.error('[registrarCompraDigital] columnas requeridas ausentes — compra denegada (fail-closed):', insErr.message);
      const err = new Error('Servicio de entrega no disponible.');
      err.statusCode = 403;
      throw err;
    }
    throw insErr;
  }

  const link_unico = PUBLIC_BASE_URL + '/mi-compra/' + codigo;
  return { codigo, link_unico, compra };
}

function _calcParteCreadorVenta(monto, comisionVendedorPct, tuvoVendedor) {
  const m = Number(monto) || 0;
  const plat = _calcPartePlataformaMiniapp(m);
  const comV = tuvoVendedor ? _calcComisionVendedorMiniapp(m, comisionVendedorPct) : 0;
  return _roundMoney(Math.max(0, m - plat - comV));
}

function _slugifyMiniapp(nombre) {
  return String(nombre || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'miniapp';
}

async function _generarSlugMiniappUnico(nombre) {
  const base = _slugifyMiniapp(nombre);
  let slug = base;
  let n = 0;
  while (true) {
    const { data } = await supabase.from('miniapps').select('id').eq('slug', slug).maybeSingle();
    if (!data) return slug;
    n += 1;
    slug = base + '-' + n;
  }
}

async function _miniappPerteneceCreador(miniapp_id, creador_id) {
  const { data, error } = await supabase
    .from('miniapps')
    .select('id, creador_id, comision_vendedor, parte_plataforma, slug, nombre, precio')
    .eq('id', miniapp_id)
    .maybeSingle();
  if (error || !data || data.creador_id !== creador_id) return null;
  return data;
}

function _boolForm(val) {
  return val === true || val === 'true' || val === '1' || val === 1;
}

function _extImagen(mimetype, originalname) {
  const map = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  if (map[mimetype]) return map[mimetype];
  const ext = path.extname(originalname || '').toLowerCase().replace('.', '');
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return ext === 'jpeg' ? 'jpg' : ext;
  return null;
}

function _mimeFromKey(key) {
  const ext = path.extname(String(key || '')).toLowerCase();
  if (ext === '.png')  return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

function _readUploadFile(file) {
  if (!file) return null;
  if (file.buffer && file.buffer.length) return file.buffer;
  if (file.path && fs.existsSync(file.path)) return fs.readFileSync(file.path);
  return null;
}

function _cleanupUploadFiles(files) {
  if (!files) return;
  Object.keys(files).forEach(function (field) {
    (files[field] || []).forEach(function (f) {
      if (f.path && fs.existsSync(f.path)) {
        try { fs.unlinkSync(f.path); } catch (e) { /* ignore */ }
      }
    });
  });
}

function _extVideo(mimetype, originalname) {
  const name = String(originalname || '').toLowerCase();
  const mime = String(mimetype || '').toLowerCase();
  if (mime === 'video/mp4' || name.endsWith('.mp4')) return 'mp4';
  if (mime === 'video/quicktime' || name.endsWith('.mov')) return 'mov';
  if (mime === 'video/webm' || name.endsWith('.webm')) return 'webm';
  return null;
}

function _mimeVideoExt(ext) {
  const e = String(ext || '').toLowerCase();
  if (e === 'mp4') return 'video/mp4';
  if (e === 'mov') return 'video/quicktime';
  if (e === 'webm') return 'video/webm';
  return 'application/octet-stream';
}

function _escapeHtmlEntrega(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _buildVideosEntregaHtml(videos, codigo, descargasRestantesMap) {
  if (!videos || !videos.length) return '';
  const map = descargasRestantesMap || {};
  return videos.map(function (v, idx) {
    const baseUrl = PUBLIC_BASE_URL + '/descargar-video/' + encodeURIComponent(codigo) + '/' + encodeURIComponent(v.id);
    const nombre = _escapeHtmlEntrega(v.nombre || ('Video ' + (idx + 1)));
    const vidKey = String(v.id);
    const restantes = map[vidKey] != null ? Number(map[vidKey]) : LIMITE_DESCARGAS_VIDEO;
    const sinDescargas = restantes <= 0;
    const btnDl = sinDescargas
      ? '<button type="button" class="btn btn-video-dl" disabled>Limite alcanzado</button>'
      : '<a href="' + baseUrl + '?download=1" class="btn btn-video-dl" data-video-dl data-restantes="' + restantes + '">Descargar</a>';
    const metaHtml = '<p class="video-dl-meta">Descargas restantes: ' + restantes + ' de ' + LIMITE_DESCARGAS_VIDEO + '</p>';
    return (
      '<div class="video-item">' +
      '<div class="video-item-info">' +
      '<span class="video-item-num">' + (idx + 1) + '</span>' +
      '<span class="video-item-name">' + nombre + '</span>' +
      '</div>' +
      metaHtml +
      '<div class="video-item-actions">' +
      '<a href="' + baseUrl + '" target="_blank" rel="noopener" class="btn btn-grad btn-video">Ver</a>' +
      btnDl +
      '</div>' +
      '</div>'
    );
  }).join('');
}

// POST /api/creador/miniapps/subir  (multipart/form-data)
app.post('/api/creador/miniapps/subir', requireCreador, uploadMiniappFields, async (req, res) => {
  const body            = req.body || {};
  const categoria       = String(body.categoria || 'miniapp').trim().toLowerCase();
  let htmlContent       = String(body.html || '').trim();
  const nombreTrim      = String(body.nombre || '').trim();
  const descripcion     = String(body.descripcion || '').trim();
  const precioNum       = Number(body.precio);
  const precioPromoNum  = Number(body.precio_promocion);
  const usa_ia          = _boolForm(body.usa_ia);
  const dispVendedores  = COMISION_VENDEDORES_DIGITAL_ACTIVA ? _boolForm(body.disponible_vendedores) : false;
  const comisionNum     = dispVendedores ? Math.max(0, Number(body.comision_vendedor) || 0) : 0;

  if (!CREADOR_CATEGORIAS.includes(categoria)) {
    return res.status(400).json({ ok: false, error: 'Categoria invalida. Use infoproducto, contenido_digital o miniapp.' });
  }

  const files      = req.files || {};
  const foto1      = files.foto1 && files.foto1[0];
  const foto2      = files.foto2 && files.foto2[0];
  const pdfFile    = files.pdf && files.pdf[0];
  const videoFiles = files.videos || [];

  if (!nombreTrim) {
    return res.status(400).json({ ok: false, error: 'El nombre es obligatorio.' });
  }
  if (!precioNum || precioNum <= 0) {
    return res.status(400).json({ ok: false, error: 'El precio normal es obligatorio y debe ser mayor a 0.' });
  }
  if (!foto1) {
    return res.status(400).json({ ok: false, error: 'La foto 1 del producto es obligatoria.' });
  }

  const ext1 = _extImagen(foto1.mimetype, foto1.originalname);
  if (!ext1) {
    return res.status(400).json({ ok: false, error: 'Foto 1: solo se permiten JPG, PNG o WebP.' });
  }
  if (foto1.size > 5 * 1024 * 1024) {
    return res.status(400).json({ ok: false, error: 'Foto 1 supera el limite de 5 MB.' });
  }

  if (foto2) {
    const ext2 = _extImagen(foto2.mimetype, foto2.originalname);
    if (!ext2) return res.status(400).json({ ok: false, error: 'Foto 2: solo se permiten JPG, PNG o WebP.' });
    if (foto2.size > 5 * 1024 * 1024) return res.status(400).json({ ok: false, error: 'Foto 2 supera el limite de 5 MB.' });
  }

  let r2Key = null;
  let pdfKey = null;
  let packKey = null;
  let tipo_producto = 'html';
  let escaneoHtml = null;
  const usaIaFinal = categoria === 'miniapp' ? usa_ia : false;

  if (categoria === 'miniapp') {
    if (!htmlContent) {
      return res.status(400).json({ ok: false, error: 'El HTML de la mini app no puede estar vacio.' });
    }
    if (Buffer.byteLength(htmlContent, 'utf8') > 5 * 1024 * 1024) {
      return res.status(400).json({ ok: false, error: 'El HTML supera el limite de 5 MB.' });
    }
    escaneoHtml = miniappSeg.analizarHtmlMiniapp(htmlContent);
    if (escaneoHtml.rechazar) {
      return res.status(400).json({
        ok: false,
        error: miniappSeg.mensajeRechazoCreador(escaneoHtml),
        amenazas: escaneoHtml.amenazas
      });
    }
    htmlContent = miniappSeg.sanitizeMiniappHtml(htmlContent);
    if (pdfFile) {
      if (pdfFile.mimetype !== 'application/pdf' && !String(pdfFile.originalname || '').toLowerCase().endsWith('.pdf')) {
        return res.status(400).json({ ok: false, error: 'El archivo PDF debe ser .pdf valido.' });
      }
      if (pdfFile.size > 50 * 1024 * 1024) {
        return res.status(400).json({ ok: false, error: 'El PDF supera el limite de 50 MB.' });
      }
    }
    tipo_producto = pdfFile ? 'html_pdf' : 'html';
  } else if (categoria === 'infoproducto') {
    if (!pdfFile) {
      return res.status(400).json({ ok: false, error: 'El PDF es obligatorio para un infoproducto.' });
    }
    if (pdfFile.mimetype !== 'application/pdf' && !String(pdfFile.originalname || '').toLowerCase().endsWith('.pdf')) {
      return res.status(400).json({ ok: false, error: 'El archivo debe ser un PDF valido.' });
    }
    if (pdfFile.size > 50 * 1024 * 1024) {
      return res.status(400).json({ ok: false, error: 'El PDF supera el limite de 50 MB.' });
    }
    tipo_producto = 'pdf';
  } else if (categoria === 'contenido_digital') {
    if (!videoFiles.length) {
      return res.status(400).json({ ok: false, error: 'Debes subir al menos un video para contenido digital.' });
    }
    if (videoFiles.length > 30) {
      return res.status(400).json({ ok: false, error: 'Maximo 30 videos por producto.' });
    }
    for (let vi = 0; vi < videoFiles.length; vi++) {
      const vf = videoFiles[vi];
      const vExt = _extVideo(vf.mimetype, vf.originalname);
      if (!vExt) {
        return res.status(400).json({ ok: false, error: 'Video ' + (vi + 1) + ': solo se permiten mp4, mov o webm.' });
      }
      if (vf.size > 100 * 1024 * 1024) {
        return res.status(400).json({ ok: false, error: 'Video ' + (vi + 1) + ' supera el limite de 100 MB.' });
      }
    }
    tipo_producto = 'videos';
  }

  try {
    const slug     = await _generarSlugMiniappUnico(nombreTrim);
    const foto1Key = 'miniapps/' + slug + '/foto1.' + ext1;
    let foto2Key   = null;

    const foto1Buf = _readUploadFile(foto1);
    await subirArchivo(foto1Key, foto1Buf, foto1.mimetype || 'image/jpeg');

    if (foto2) {
      const ext2 = _extImagen(foto2.mimetype, foto2.originalname);
      foto2Key = 'miniapps/' + slug + '/foto2.' + ext2;
      await subirArchivo(foto2Key, _readUploadFile(foto2), foto2.mimetype || 'image/jpeg');
    }

    const videoRows = [];

    if (categoria === 'miniapp') {
      r2Key = 'miniapps/' + slug + '/app.html';
      await subirArchivo(r2Key, htmlContent, 'text/html');
      if (pdfFile) {
        pdfKey = 'miniapps/' + slug + '/producto.pdf';
        await subirArchivo(pdfKey, _readUploadFile(pdfFile), 'application/pdf');
      }
    } else if (categoria === 'infoproducto') {
      pdfKey = 'miniapps/' + slug + '/producto.pdf';
      await subirArchivo(pdfKey, _readUploadFile(pdfFile), 'application/pdf');
    } else if (categoria === 'contenido_digital') {
      for (let vi = 0; vi < videoFiles.length; vi++) {
        const vf = videoFiles[vi];
        const vExt = _extVideo(vf.mimetype, vf.originalname);
        const videoKey = 'miniapps/' + slug + '/videos/' + (vi + 1) + '.' + vExt;
        await subirArchivo(videoKey, _readUploadFile(vf), _mimeVideoExt(vExt));
        videoRows.push({
          video_key: videoKey,
          nombre: path.basename(vf.originalname || '') || ('Video ' + (vi + 1)),
          orden: vi
        });
      }
    }

    const insertRow = {
        creador_id:            req.creador_id,
        nombre:                nombreTrim,
        slug,
        descripcion:           descripcion || null,
        precio:                precioNum,
        precio_promocion:      (precioPromoNum > 0) ? precioPromoNum : null,
        categoria,
        tipo_producto,
        usa_ia:                usaIaFinal,
        r2_key:                r2Key,
        pdf_key:               pdfKey,
        pack_key:              packKey,
        foto1_key:             foto1Key,
        foto2_key:             foto2Key,
        disponible_vendedores: dispVendedores,
        comision_vendedor:     comisionNum,
        parte_plataforma:      CREADOR_PARTE_PLATAFORMA_DEFAULT,
        estado:                'activo',
        estado_aprobacion:     'pendiente',
        creado_en:             new Date().toISOString()
      };

    if (categoria === 'miniapp' && escaneoHtml) {
      insertRow.requiere_revision_seguridad = !!escaneoHtml.requiere_revision_seguridad;
      insertRow.escaneo_seguridad = escaneoHtml.amenazas;
    }

    let { data, error } = await supabase
      .from('miniapps')
      .insert(insertRow)
      .select('id, nombre, slug, categoria, precio, precio_promocion, tipo_producto, usa_ia, disponible_vendedores, comision_vendedor, estado, creado_en, r2_key, foto1_key, pack_key, requiere_revision_seguridad, escaneo_seguridad')
      .single();

    if (error && /requiere_revision_seguridad|escaneo_seguridad|column|schema cache/.test(String(error.message || ''))) {
      delete insertRow.requiere_revision_seguridad;
      delete insertRow.escaneo_seguridad;
      ({ data, error } = await supabase
        .from('miniapps')
        .insert(insertRow)
        .select('id, nombre, slug, categoria, precio, precio_promocion, tipo_producto, usa_ia, disponible_vendedores, comision_vendedor, estado, creado_en, r2_key, foto1_key, pack_key')
        .single());
    }

    if (error) throw error;

    if (videoRows.length) {
      const inserts = videoRows.map(function (v) {
        return {
          miniapp_id: data.id,
          video_key:  v.video_key,
          nombre:     v.nombre,
          orden:      v.orden,
          creado_en:  new Date().toISOString()
        };
      });
      const { error: vErr } = await supabase.from('miniapp_videos').insert(inserts);
      if (vErr) throw vErr;
    }

    console.log('[creador/miniapps/subir] creador=' + req.creador_id + ' slug=' + slug + ' cat=' + categoria + ' tipo=' + tipo_producto + ' videos=' + videoRows.length);
    const resp = {
      ok: true,
      miniapp: _miniappToClient(data),
      videos: videoRows.length,
      url: PUBLIC_BASE_URL + '/miniapps/' + slug
    };
    if (escaneoHtml && escaneoHtml.requiere_revision_seguridad) {
      resp.seguridad = {
        requiere_revision: true,
        amenazas: escaneoHtml.amenazas
      };
      resp.aviso = 'Tu mini app fue registrada pero requiere revision de seguridad adicional antes de aprobacion.';
    }
    res.json(resp);
  } catch (e) {
    console.error('[creador/miniapps/subir]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  } finally {
    _cleanupUploadFiles(req.files);
  }
});

// GET /api/miniapps/asset/:slug/:file  — SOLO fotos de venta (publicas). Productos (html/pdf/video) nunca aqui.
app.get('/api/miniapps/asset/:slug/:file', async (req, res) => {
  const slug = String(req.params.slug || '').trim();
  const file = String(req.params.file || '').trim();

  if (!slug || !['foto1', 'foto2'].includes(file)) {
    return res.status(404).json({ ok: false, error: 'No encontrado.' });
  }

  try {
    const { data, error } = await supabase
      .from('miniapps')
      .select('foto1_key, foto2_key, estado')
      .eq('slug', slug)
      .maybeSingle();
    if (error) throw error;
    if (!data || data.estado !== 'activo') {
      return res.status(404).json({ ok: false, error: 'No encontrado.' });
    }

    const key = file === 'foto1' ? data.foto1_key : data.foto2_key;
    if (!key) return res.status(404).json({ ok: false, error: 'Archivo no disponible.' });

    const buf = await obtenerArchivoBuffer(key);
    res.setHeader('Content-Type', _mimeFromKey(key));
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buf);
  } catch (e) {
    console.error('[miniapps/asset]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// GET /api/creador/miniapps
app.get('/api/creador/miniapps', requireCreador, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('miniapps')
      .select('id, nombre, slug, precio, precio_promocion, tipo_producto, categoria, usa_ia, disponible_vendedores, comision_vendedor, estado, estado_aprobacion, motivo_rechazo, pagina_venta_slug, foto1_key, foto2_key, creado_en')
      .eq('creador_id', req.creador_id)
      .order('creado_en', { ascending: false });
    if (error) throw error;
    res.json({ ok: true, miniapps: (data || []).map(_miniappToClient) });
  } catch (e) {
    console.error('[creador/miniapps]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// POST /api/creador/miniapps/toggle-vendedores
app.post('/api/creador/miniapps/toggle-vendedores', requireCreador, async (req, res) => {
  if (!COMISION_VENDEDORES_DIGITAL_ACTIVA) {
    return res.status(403).json({ ok: false, error: 'Red de vendedores en activos digitales desactivada temporalmente.' });
  }
  const { miniapp_id, disponible } = req.body || {};
  if (!miniapp_id) {
    return res.status(400).json({ ok: false, error: 'Se requiere miniapp_id.' });
  }

  try {
    const mini = await _miniappPerteneceCreador(miniapp_id, req.creador_id);
    if (!mini) {
      return res.status(404).json({ ok: false, error: 'Mini app no encontrada.' });
    }

    const disp = Boolean(disponible);
    const { data, error } = await supabase
      .from('miniapps')
      .update({ disponible_vendedores: disp })
      .eq('id', miniapp_id)
      .select('id, nombre, slug, disponible_vendedores')
      .single();
    if (error) throw error;

    res.json({ ok: true, miniapp: data });
  } catch (e) {
    console.error('[creador/miniapps/toggle-vendedores]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// GET /api/creador/cuentas
app.get('/api/creador/cuentas', requireCreador, async (req, res) => {
  try {
    const { data: miniapps, error: errM } = await supabase
      .from('miniapps')
      .select('id, nombre, slug, categoria, precio, comision_vendedor')
      .eq('creador_id', req.creador_id);
    if (errM) throw errM;

    const ids = (miniapps || []).map(function (m) { return m.id; });
    let compras = [];
    if (ids.length) {
      const { data: ventas, error: errV } = await supabase
        .from('miniapp_compras')
        .select('miniapp_id, monto, estado_pago, ref_vendedor, vendedor_id')
        .in('miniapp_id', ids)
        .eq('estado_pago', 'pagado');
      if (errV) throw errV;
      compras = ventas || [];
    }

    const mapMini = {};
    (miniapps || []).forEach(function (m) {
      mapMini[m.id] = {
        id:              m.id,
        nombre:          m.nombre,
        slug:            m.slug,
        categoria:       m.categoria || 'miniapp',
        ventas:          0,
        ingresos_brutos: 0,
        ganancia:        0
      };
    });

    let totalVentas    = 0;
    let ingresosBrutos = 0;
    let totalCreador   = 0;

    compras.forEach(function (c) {
      const m = (miniapps || []).find(function (x) { return x.id === c.miniapp_id; });
      if (!m || !mapMini[c.miniapp_id]) return;

      const monto       = Number(c.monto) || 0;
      const comisionPct = Number(m.comision_vendedor) || 0;
      const tuvoVend    = _compraTuvoVendedor(c);
      const ganancia    = _calcParteCreadorVenta(monto, comisionPct, tuvoVend);

      mapMini[c.miniapp_id].ventas          += 1;
      mapMini[c.miniapp_id].ingresos_brutos += monto;
      mapMini[c.miniapp_id].ganancia        += ganancia;
      totalVentas    += 1;
      ingresosBrutos += monto;
      totalCreador   += ganancia;
    });

    const productos = Object.values(mapMini).map(function (p) {
      return {
        id:              p.id,
        nombre:          p.nombre,
        slug:            p.slug,
        categoria:       p.categoria,
        ventas:          p.ventas,
        ingresos_brutos: _roundMoney(p.ingresos_brutos),
        ganancia:        _roundMoney(p.ganancia)
      };
    });

    res.json({
      ok: true,
      resumen: {
        total_ventas:    totalVentas,
        ingresos_brutos: _roundMoney(ingresosBrutos),
        total_creador:   _roundMoney(totalCreador),
        ventas_totales:  totalVentas,
        ganancia_total:  _roundMoney(totalCreador),
        por_pagar:       _roundMoney(totalCreador)
      },
      productos: productos,
      miniapps:  productos
    });
  } catch (e) {
    console.error('[creador/cuentas]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// GET /api/creador/info
app.get('/api/creador/info', requireCreador, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('creadores')
      .select('id, nombre, email')
      .eq('id', req.creador_id)
      .single();
    if (error) throw error;
    res.json({ ok: true, creador: data });
  } catch (e) {
    console.error('[creador/info GET]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// POST /api/creador/info
app.post('/api/creador/info', requireCreador, async (req, res) => {
  const nombre = String((req.body || {}).nombre || '').trim();
  if (!nombre) {
    return res.status(400).json({ ok: false, error: 'El nombre es obligatorio.' });
  }
  try {
    const { data, error } = await supabase
      .from('creadores')
      .update({ nombre })
      .eq('id', req.creador_id)
      .select('id, nombre, email')
      .single();
    if (error) throw error;
    res.json({ ok: true, creador: data });
  } catch (e) {
    console.error('[creador/info POST]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// ── Supabase ───────────────────────────────────────────────────────────────────

// GET /api/supabase/test
// Verifica la conexión con Supabase contando los registros de la tabla `usuarios`.
// Úsalo solo para confirmar que las variables de entorno y el proyecto están bien.
app.get('/api/supabase/test', requireAdmin, async (req, res) => {
  try {
    const { count, error } = await supabase
      .from('usuarios')
      .select('*', { count: 'exact', head: true });

    if (error) throw error;

    res.json({ ok: true, total_usuarios: count });
  } catch (e) {
    console.error('[supabase/test]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// ── WhatsApp del vendedor ─────────────────────────────────────────────────────

// POST /api/usuario/whatsapp  — guarda el número de WhatsApp del usuario autenticado
app.post('/api/usuario/whatsapp', requireUsuario, async (req, res) => {
  const { whatsapp } = req.body || {};
  const usuario_id   = req.usuario_id;
  const num = String(whatsapp || '').trim();

  if (num && !/^[+\d\s\-().]{6,20}$/.test(num)) {
    return res.status(400).json({ ok: false, error: 'Formato inválido. Usa solo dígitos, +, espacios o guiones. Ej: +57 300 1234567' });
  }

  try {
    const { error } = await supabase
      .from('usuarios')
      .update({ whatsapp: num || null })
      .eq('id', usuario_id);
    if (error) throw error;
    console.log(`[usuario/whatsapp] uid=${usuario_id} → ${num || '(borrado)'}`);
    res.json({ ok: true, whatsapp: num });
  } catch (e) {
    console.error('[usuario/whatsapp]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// GET /api/checkout/asesor?slug=&ref=
// Devuelve el WhatsApp del vendedor dueño del ref y el nombre del producto.
app.get('/api/checkout/asesor', async (req, res) => {
  const slug = String(req.query.slug || '').trim();
  const ref  = String(req.query.ref  || '').trim().toUpperCase();

  if (!ref) return res.status(400).json({ ok: false, error: 'Falta el código de vendedor (ref).' });

  try {
    const { data: vendor, error: vErr } = await supabase
      .from('usuarios')
      .select('whatsapp, nombre')
      .eq('codigo', ref)
      .maybeSingle();

    if (vErr) throw vErr;

    if (!vendor || !vendor.whatsapp) {
      return res.json({ ok: false, error: 'Este asesor aún no tiene WhatsApp configurado.' });
    }

    let nombre_producto = 'el producto';
    if (slug) {
      const { data: pag } = await supabase
        .from('paginas_venta')
        .select('nombre')
        .eq('slug', slug)
        .maybeSingle();
      if (pag && pag.nombre) nombre_producto = pag.nombre;
    }

    res.json({ ok: true, whatsapp: vendor.whatsapp, nombre_producto, nombre_vendedor: vendor.nombre || ref });
  } catch (e) {
    console.error('[checkout/asesor]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// ── Mis Productos (por vendedor) ──────────────────────────────────────────────

// POST /api/mis-productos/agregar
app.post('/api/mis-productos/agregar', requireUsuario, async (req, res) => {
  const { producto_id } = req.body || {};
  const usuario_id = req.usuario_id;
  if (!producto_id) {
    return res.status(400).json({ ok: false, error: 'Se requiere producto_id.' });
  }
  if (req.body && req.body.usuario_id && !_forbidUnlessSelf(req, res, req.body.usuario_id)) return;
  try {
    // Traer código del usuario y buscar página de venta activa para el producto
    const [{ data: usuario, error: uErr }, { data: paginas, error: pgErr }] = await Promise.all([
      supabase.from('usuarios').select('codigo').eq('id', usuario_id).single(),
      supabase.from('paginas_venta')
        .select('slug')
        .eq('producto_id', producto_id)
        .eq('activa', true)
        .order('creado_en', { ascending: false })
        .limit(1)
    ]);
    if (uErr) throw uErr;
    if (pgErr) throw pgErr;

    // Si existe una página activa, usar su slug; si no, link_venta queda null
    const paginaSlug = paginas && paginas.length > 0 ? paginas[0].slug : null;
    const link_venta = paginaSlug
      ? `${PUBLIC_BASE_URL}/p/${paginaSlug}?ref=${usuario.codigo}`
      : null;

    // upsert: si ya existe la combinación, actualiza el link_venta (por si antes era null)
    const { error: iErr } = await supabase
      .from('mis_productos')
      .upsert({ usuario_id, producto_id, link_venta }, { onConflict: 'usuario_id,producto_id', ignoreDuplicates: false });
    if (iErr) throw iErr;

    console.log(`[mis-productos/agregar] usuario=${usuario_id} producto=${producto_id} pagina=${paginaSlug || 'SIN PAGINA'}`);
    res.json({ ok: true, link_venta });
  } catch (e) {
    console.error('[mis-productos/agregar]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// GET /api/mis-productos/:usuario_id
app.get('/api/mis-productos/:usuario_id', requireUsuario, async (req, res) => {
  const { usuario_id } = req.params;
  if (!_forbidUnlessSelf(req, res, usuario_id)) return;
  try {
    const { data, error } = await supabase
      .from('mis_productos')
      .select('id, producto_id, link_venta, fecha_agregado, productos(id, nombre, categoria, precio, utilidad, stock, imagenes, slug)')
      .eq('usuario_id', usuario_id)
      .order('fecha_agregado', { ascending: false });
    if (error) throw error;
    res.json({ ok: true, productos: data });
  } catch (e) {
    console.error('[mis-productos GET]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// POST /api/mis-productos/quitar
app.post('/api/mis-productos/quitar', requireUsuario, async (req, res) => {
  const { producto_id } = req.body || {};
  const usuario_id = req.usuario_id;
  if (!producto_id) {
    return res.status(400).json({ ok: false, error: 'Se requiere producto_id.' });
  }
  if (req.body && req.body.usuario_id && !_forbidUnlessSelf(req, res, req.body.usuario_id)) return;
  try {
    const { error } = await supabase
      .from('mis_productos')
      .delete()
      .eq('usuario_id', usuario_id)
      .eq('producto_id', producto_id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[mis-productos/quitar]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// ── Marketplace publico (Activos Digitales) ─────────────────────────────────────
const MARKETPLACE_ASSET_BUST = '5';

async function _apiMarketplace(req, res) {
  try {
    const { data, error } = await supabase
      .from('miniapps')
      .select('nombre, slug, descripcion, precio, precio_promocion, categoria, foto1_key, pagina_venta_slug, creado_en')
      .eq('estado_aprobacion', 'aprobada')
      .eq('estado', 'activo')
      .not('pagina_venta_slug', 'is', null)
      .order('creado_en', { ascending: false });
    if (error) throw error;
    _setNoCacheJson(res);
    res.json({
      ok: true,
      productos: (data || []).map(_miniappToVitrina).filter(function (p) {
        return p.pagina_venta_slug && p.link_dueno;
      })
    });
  } catch (e) {
    console.error('[marketplace/api]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
}

app.get('/api/marketplace', _apiMarketplace);
app.get('/api/vitrina', _apiMarketplace);

function _serveMarketplace(req, res) {
  _setNoCacheHtml(res);
  const bust    = '&mp=' + MARKETPLACE_ASSET_BUST;
  const logoUrl = _assetUrl('/assets/logo-activos.jpg') + bust;
  const cssUrl  = _assetUrl('/assets/vitrina.css') + bust;
  const jsUrl   = _assetUrl('/assets/vitrina.js') + bust;
  const heroJsUrl = _assetUrl('/assets/premium-hero.js') + bust;
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Activos Digitales — Marketplace</title>
<meta name="description" content="Marketplace de activos digitales: mini apps, infoproductos y contenido digital. Compra segura y acceso inmediato.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Sora:wght@600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${cssUrl}">
</head>
<body>
<div class="vt-page">
  <header class="vt-header">
    <div class="vt-header-inner">
      <a href="/marketplace" class="vt-brand">
        <img src="${logoUrl}" alt="Activos Digitales" class="vt-brand-logo" />
        <span class="vt-brand-name">Activos Digitales</span>
      </a>
    </div>
  </header>

  <main class="vt-main">
    <section class="vt-hero premium-hero" id="vt-hero">
      <canvas class="premium-hero-canvas" aria-hidden="true"></canvas>
      <div class="premium-hero-overlay" aria-hidden="true"></div>
      <div class="premium-hero-content vt-hero-content">
        <p class="vt-hero-badge"><span class="vt-hero-badge-dot" aria-hidden="true"></span> Marketplace oficial</p>
        <h1 class="vt-hero-title">Marketplace de Activos Digitales</h1>
        <p class="vt-hero-sub">Explora mini apps, infoproductos y contenido digital listos para usar. Compra segura y acceso inmediato.</p>
      </div>
    </section>

    <div class="vt-toolbar">
      <div class="vt-search-wrap">
        <input type="search" id="vt-search" class="vt-search" placeholder="Buscar por nombre..." autocomplete="off" />
      </div>
      <div class="vt-filters" id="vt-filters" role="tablist" aria-label="Filtrar por categoria">
        <button type="button" class="vt-chip vt-chip--active" data-cat="all">Todos</button>
        <button type="button" class="vt-chip" data-cat="infoproducto">Infoproductos</button>
        <button type="button" class="vt-chip" data-cat="contenido_digital">Contenido Digital</button>
        <button type="button" class="vt-chip" data-cat="miniapp">Mini Apps</button>
      </div>
    </div>

    <div id="vt-status" class="vt-status" aria-live="polite">Cargando productos...</div>
    <div id="vt-grid" class="vt-grid" hidden></div>
    <div id="vt-empty" class="vt-empty" hidden>
      <p class="vt-empty-title">Aun no hay productos en el marketplace</p>
      <p class="vt-empty-sub">Vuelve pronto — los creadores estan publicando nuevos activos digitales.</p>
    </div>
  </main>

  <footer class="vt-footer">
    <p>Distribuido por <strong>EcommerceAgents</strong> · Marketplace de activos digitales</p>
    <p class="vt-footer-legal"><a href="/terminos">Terminos y Condiciones</a> · <a href="/privacidad">Politica de Privacidad</a></p>
  </footer>
</div>
<script>window.VT_API_BASE='${PUBLIC_BASE_URL.replace(/'/g, "\\'")}';</script>
<script src="${heroJsUrl}"></script>
<script src="${jsUrl}"></script>
</body>
</html>`);
}

app.get('/marketplace', _serveMarketplace);
app.get('/vitrina', function (req, res) {
  res.redirect(301, '/marketplace');
});

app.get('/terminos', function (req, res) {
  _serveLegalPage(res, LEGAL_TERMINOS_TEMPLATE);
});
app.get('/privacidad', function (req, res) {
  _serveLegalPage(res, LEGAL_PRIVACIDAD_TEMPLATE);
});

// ── Catalogo mini apps (activos digitales para vendedores) ────────────────────

// GET /api/catalogo/miniapps
app.get('/api/catalogo/miniapps', async (req, res) => {
  if (!COMISION_VENDEDORES_DIGITAL_ACTIVA) {
    return res.json({ ok: true, miniapps: [] });
  }
  try {
    const { data, error } = await supabase
      .from('miniapps')
      .select('id, nombre, slug, descripcion, precio, precio_promocion, comision_vendedor, usa_ia, tipo_producto, categoria, foto1_key, pagina_venta_slug, creado_en')
      .eq('estado_aprobacion', 'aprobada')
      .eq('disponible_vendedores', true)
      .not('pagina_venta_slug', 'is', null)
      .order('creado_en', { ascending: false });
    if (error) throw error;
    res.json({ ok: true, miniapps: (data || []).map(_miniappToClient) });
  } catch (e) {
    console.error('[catalogo/miniapps]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// POST /api/mis-miniapps/agregar
app.post('/api/mis-miniapps/agregar', requireUsuario, async (req, res) => {
  if (!COMISION_VENDEDORES_DIGITAL_ACTIVA) {
    return res.status(403).json({ ok: false, error: 'La promocion de activos digitales por vendedores esta desactivada temporalmente.' });
  }
  const { miniapp_id } = req.body || {};
  const usuario_id = req.usuario_id;
  if (!miniapp_id) {
    return res.status(400).json({ ok: false, error: 'Se requiere miniapp_id.' });
  }
  if (req.body && req.body.usuario_id && !_forbidUnlessSelf(req, res, req.body.usuario_id)) return;
  try {
    const { data: usuario, error: uErr } = await supabase
      .from('usuarios')
      .select('id, codigo')
      .eq('id', usuario_id)
      .single();
    if (uErr || !usuario) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado.' });
    }

    const { data: miniapp, error: mErr } = await supabase
      .from('miniapps')
      .select('id, estado_aprobacion, disponible_vendedores, pagina_venta_slug')
      .eq('id', miniapp_id)
      .single();
    if (mErr || !miniapp) {
      return res.status(404).json({ ok: false, error: 'Mini app no encontrada.' });
    }
    if (miniapp.estado_aprobacion !== 'aprobada') {
      return res.status(400).json({ ok: false, error: 'Esta mini app no esta aprobada.' });
    }
    if (!miniapp.disponible_vendedores) {
      return res.status(400).json({ ok: false, error: 'Esta mini app no esta disponible para vendedores.' });
    }
    if (!miniapp.pagina_venta_slug) {
      return res.status(400).json({ ok: false, error: 'Esta mini app aun no tiene pagina de venta. Contacta al administrador.' });
    }

    const link_venta = `${PUBLIC_BASE_URL}/p/${miniapp.pagina_venta_slug}?ref=${usuario.codigo}`;

    const { error: iErr } = await supabase
      .from('mis_miniapps')
      .upsert(
        { usuario_id, miniapp_id, link_venta },
        { onConflict: 'usuario_id,miniapp_id', ignoreDuplicates: false }
      );
    if (iErr) throw iErr;

    console.log(`[mis-miniapps/agregar] usuario=${usuario_id} miniapp=${miniapp_id} link=${link_venta}`);
    res.json({ ok: true, link_venta });
  } catch (e) {
    console.error('[mis-miniapps/agregar]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// GET /api/mis-miniapps/:usuario_id
app.get('/api/mis-miniapps/:usuario_id', requireUsuario, async (req, res) => {
  if (!COMISION_VENDEDORES_DIGITAL_ACTIVA) {
    return res.json({ ok: true, miniapps: [] });
  }
  const { usuario_id } = req.params;
  if (!_forbidUnlessSelf(req, res, usuario_id)) return;
  try {
    const { data, error } = await supabase
      .from('mis_miniapps')
      .select(`
        id, miniapp_id, link_venta, creado_en,
        miniapps ( id, nombre, slug, precio, precio_promocion, comision_vendedor, foto1_key, usa_ia, tipo_producto )
      `)
      .eq('usuario_id', usuario_id)
      .order('creado_en', { ascending: false });
    if (error) throw error;
    const rows = (data || []).map(function (row) {
      const m = row.miniapps;
      if (m && typeof m === 'object') {
        return Object.assign({}, row, { miniapps: _miniappToClient(m) });
      }
      return row;
    });
    res.json({ ok: true, miniapps: rows });
  } catch (e) {
    console.error('[mis-miniapps GET]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// POST /api/mis-miniapps/quitar
app.post('/api/mis-miniapps/quitar', requireUsuario, async (req, res) => {
  if (!COMISION_VENDEDORES_DIGITAL_ACTIVA) {
    return res.status(403).json({ ok: false, error: 'La promocion de activos digitales por vendedores esta desactivada temporalmente.' });
  }
  const { miniapp_id } = req.body || {};
  const usuario_id = req.usuario_id;
  if (!miniapp_id) {
    return res.status(400).json({ ok: false, error: 'Se requiere miniapp_id.' });
  }
  if (req.body && req.body.usuario_id && !_forbidUnlessSelf(req, res, req.body.usuario_id)) return;
  try {
    const { error } = await supabase
      .from('mis_miniapps')
      .delete()
      .eq('usuario_id', usuario_id)
      .eq('miniapp_id', miniapp_id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[mis-miniapps/quitar]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// ── Catalogo público (solo productos visibles y no pausados) ──────────────────

// GET /api/catalogo
app.get('/api/catalogo', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('productos')
      .select('id, nombre, categoria, precio, stock, imagenes, slug')
      .eq('visible', true)
      .eq('pausado', false)
      .order('creado_en', { ascending: false });
    if (error) throw error;
    res.json({ ok: true, productos: data });
  } catch (e) {
    console.error('[catalogo]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// ── Admin: Productos ──────────────────────────────────────────────────────────

function _slugify(nombre) {
  return String(nombre).toLowerCase()
    .replace(/[áàâä]/g, 'a').replace(/[éèêë]/g, 'e')
    .replace(/[íìîï]/g, 'i').replace(/[óòôö]/g, 'o')
    .replace(/[úùûü]/g, 'u').replace(/ñ/g, 'n')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Middleware de autenticación para TODOS los endpoints /api/admin/*
// (el endpoint /api/admin/login ya fue registrado antes, así que no pasa por aquí)
app.use('/api/admin', requireAdmin);

// GET /api/admin/productos
app.get('/api/admin/productos', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('productos')
      .select('*')
      .order('creado_en', { ascending: false });
    if (error) throw error;
    res.json({ ok: true, productos: data });
  } catch (e) {
    console.error('[admin/productos GET]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// POST /api/admin/productos  — crear
app.post('/api/admin/productos', async (req, res) => {
  const { nombre, categoria, precio, utilidad, stock, imagenes } = req.body || {};
  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ ok: false, error: 'El nombre es obligatorio.' });
  }
  try {
    // Generar slug único
    const base = _slugify(nombre);
    const { data: existing } = await supabase
      .from('productos')
      .select('slug')
      .like('slug', base + '%');
    const usados = new Set((existing || []).map(r => r.slug));
    let slug = base;
    let n = 1;
    while (usados.has(slug)) { slug = base + '-' + (n++); }

    const { data, error } = await supabase
      .from('productos')
      .insert({
        nombre:    nombre.trim(),
        categoria: categoria ? categoria.trim() : null,
        precio:    parseFloat(precio)  || 0,
        utilidad:  parseFloat(utilidad)|| 0,
        stock:     parseInt(stock, 10) || 0,
        imagenes:  Array.isArray(imagenes) ? imagenes : [],
        slug,
        visible:   true,
        pausado:   false
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ ok: true, producto: data });
  } catch (e) {
    console.error('[admin/productos POST]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// POST /api/admin/productos/actualizar  — editar campos
app.post('/api/admin/productos/actualizar', async (req, res) => {
  const { id, ...campos } = req.body || {};
  if (!id) return res.status(400).json({ ok: false, error: 'Se requiere id.' });
  // Permitir solo campos seguros
  const permitidos = ['nombre','categoria','precio','utilidad','stock','imagenes','visible','pausado','slug'];
  const update = {};
  permitidos.forEach(k => { if (campos[k] !== undefined) update[k] = campos[k]; });
  if (!Object.keys(update).length) {
    return res.status(400).json({ ok: false, error: 'No hay campos para actualizar.' });
  }
  try {
    const { error } = await supabase.from('productos').update(update).eq('id', id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[admin/productos/actualizar]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// POST /api/admin/productos/eliminar
app.post('/api/admin/productos/eliminar', async (req, res) => {
  const { id } = req.body || {};
  if (!id) return res.status(400).json({ ok: false, error: 'Se requiere id.' });
  try {
    const { error } = await supabase.from('productos').delete().eq('id', id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[admin/productos/eliminar]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// ── Usuario: actualizar nombre propio ─────────────────────────────────────────

// POST /api/usuario/nombre
// Guarda el nombre personalizado del usuario autenticado en Supabase.
// Body: { nombre } — el id se toma del JWT, no del body.
app.post('/api/usuario/nombre', requireUsuario, async (req, res) => {
  const { nombre } = req.body || {};
  const id = req.usuario_id;
  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ ok: false, error: 'Se requiere nombre.' });
  }
  if (req.body && req.body.id && !_forbidUnlessSelf(req, res, req.body.id)) return;
  try {
    const { error } = await supabase
      .from('usuarios')
      .update({ nombre: nombre.trim() })
      .eq('id', id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[usuario/nombre]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// ── Admin: Usuarios ───────────────────────────────────────────────────────────

// GET /api/admin/usuarios
// Devuelve todos los usuarios de Supabase ordenados por codigo.
app.get('/api/admin/usuarios', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('usuarios')
      .select('id, codigo, nombre, activo, creditos_ia, saldo_productos, fecha_registro')
      .order('codigo', { ascending: true });

    if (error) throw error;
    res.json({ ok: true, usuarios: data });
  } catch (e) {
    console.error('[admin/usuarios]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// POST /api/admin/usuarios/activar
// Activa un usuario: activo = true
app.post('/api/admin/usuarios/activar', async (req, res) => {
  const { id, codigo } = req.body || {};
  if (!id && !codigo) return res.status(400).json({ ok: false, error: 'Se requiere id o codigo.' });
  try {
    const filtro = id ? { id } : { codigo };
    const { error } = await supabase
      .from('usuarios')
      .update({ activo: true })
      .match(filtro);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[admin/usuarios/activar]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// POST /api/admin/usuarios/desactivar
// Desactiva un usuario: activo = false
app.post('/api/admin/usuarios/desactivar', async (req, res) => {
  const { id, codigo } = req.body || {};
  if (!id && !codigo) return res.status(400).json({ ok: false, error: 'Se requiere id o codigo.' });
  try {
    const filtro = id ? { id } : { codigo };
    const { error } = await supabase
      .from('usuarios')
      .update({ activo: false })
      .match(filtro);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[admin/usuarios/desactivar]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// ── Admin: Creadores ──────────────────────────────────────────────────────────

// GET /api/admin/creadores
app.get('/api/admin/creadores', async (req, res) => {
  try {
    const { data: creadores, error } = await supabase
      .from('creadores')
      .select('id, nombre, email, estado, creado_en')
      .order('creado_en', { ascending: false });
    if (error) throw error;

    const ids = (creadores || []).map(function (c) { return c.id; });
    const countMap = {};
    if (ids.length) {
      const { data: miniapps, error: mErr } = await supabase
        .from('miniapps')
        .select('creador_id')
        .in('creador_id', ids);
      if (mErr) throw mErr;
      (miniapps || []).forEach(function (m) {
        if (!m.creador_id) return;
        countMap[m.creador_id] = (countMap[m.creador_id] || 0) + 1;
      });
    }

    const rows = (creadores || []).map(function (c) {
      return {
        id:            c.id,
        nombre:        c.nombre,
        email:         c.email,
        estado:        c.estado || 'inactivo',
        creado_en:     c.creado_en,
        num_productos: countMap[c.id] || 0
      };
    });

    res.json({ ok: true, creadores: rows });
  } catch (e) {
    console.error('[admin/creadores]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// POST /api/admin/creadores/activar
app.post('/api/admin/creadores/activar', async (req, res) => {
  const { creador_id } = req.body || {};
  if (!creador_id) return res.status(400).json({ ok: false, error: 'Se requiere creador_id.' });
  try {
    const { error } = await supabase
      .from('creadores')
      .update({ estado: 'activo' })
      .eq('id', creador_id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[admin/creadores/activar]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// POST /api/admin/creadores/desactivar
app.post('/api/admin/creadores/desactivar', async (req, res) => {
  const { creador_id } = req.body || {};
  if (!creador_id) return res.status(400).json({ ok: false, error: 'Se requiere creador_id.' });
  try {
    const { error } = await supabase
      .from('creadores')
      .update({ estado: 'inactivo' })
      .eq('id', creador_id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[admin/creadores/desactivar]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// ── Admin: Páginas de Venta ───────────────────────────────────────────────────

// GET /api/admin/paginas  — lista sin html (liviano)
app.get('/api/admin/paginas', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('paginas_venta')
      .select('id, nombre, slug, vistas, activa, creado_en, producto_id')
      .order('creado_en', { ascending: false });
    if (error) throw error;
    const paginas = (data || []).map(p => ({ ...p, tiene_html: true }));
    res.json({ ok: true, paginas });
  } catch (e) {
    console.error('[admin/paginas GET]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// POST /api/admin/paginas  — crear
app.post('/api/admin/paginas', async (req, res) => {
  const { nombre, html, producto_id } = req.body || {};
  if (!nombre || !nombre.trim()) return res.status(400).json({ ok: false, error: 'El nombre es obligatorio.' });
  if (!html  || !html.trim())   return res.status(400).json({ ok: false, error: 'El HTML es obligatorio.' });
  try {
    const base = _slugify(nombre);
    const { data: existing } = await supabase
      .from('paginas_venta').select('slug').ilike('slug', base + '%');
    const usados = new Set((existing || []).map(p => p.slug));
    let slug = base; let n = 1;
    while (usados.has(slug)) { slug = base + '-' + (n++); }

    const insertObj = {
      nombre:     nombre.trim(),
      slug,
      html:       html.trim(),
      activa:     true,
      vistas:     0,
      creado_en:  new Date().toISOString()
    };
    if (producto_id) insertObj.producto_id = producto_id;

    console.log(`[admin/paginas POST] Insertando: nombre="${insertObj.nombre}" slug="${slug}"`);
    const { data, error } = await supabase.from('paginas_venta').insert(insertObj).select('id, slug').single();
    console.log(`[admin/paginas POST] Resultado: data=${JSON.stringify(data)} error=${JSON.stringify(error)}`);

    if (error) throw error;
    if (!data) throw new Error('Supabase no devolvio datos tras el insert.');

    console.log(`[admin/paginas POST] OK — id=${data.id} slug=${data.slug}`);
    res.json({ ok: true, pagina: { id: data.id, slug: data.slug } });
  } catch (e) {
    console.error('[admin/paginas POST] ERROR:', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// POST /api/admin/paginas/actualizar
app.post('/api/admin/paginas/actualizar', async (req, res) => {
  const { id, ...campos } = req.body || {};
  if (!id) return res.status(400).json({ ok: false, error: 'Se requiere id.' });
  const permitidos = ['nombre', 'html', 'activa', 'producto_id'];
  const update = {};
  permitidos.forEach(k => { if (campos[k] !== undefined) update[k] = campos[k]; });
  if (!Object.keys(update).length) return res.status(400).json({ ok: false, error: 'Sin campos a actualizar.' });
  try {
    const { error } = await supabase.from('paginas_venta').update(update).eq('id', id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[admin/paginas/actualizar]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// POST /api/admin/paginas/eliminar
app.post('/api/admin/paginas/eliminar', async (req, res) => {
  const { id } = req.body || {};
  if (!id) return res.status(400).json({ ok: false, error: 'Se requiere id.' });
  try {
    const { error } = await supabase.from('paginas_venta').delete().eq('id', id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[admin/paginas/eliminar]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// GET /api/admin/paginas/:id  — con html completo (para edición)
app.get('/api/admin/paginas/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('paginas_venta').select('*').eq('id', req.params.id).single();
    if (error) throw error;
    if (!data) return res.status(404).json({ ok: false, error: 'No encontrada.' });
    res.json({ ok: true, pagina: data });
  } catch (e) {
    console.error('[admin/paginas/:id]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// ── Script público de checkout ─────────────────────────────────────────────────
// Solo pasa slug de la página y ref del vendedor — link CORTO, sin base64 ni textos largos
app.get('/ea-checkout.js', (req, res) => {
  _setNoCacheJs(res);
  res.send(`(function(){
  var params   = new URLSearchParams(window.location.search);
  var ref      = params.get('ref') || '';
  var parts    = window.location.pathname.split('/').filter(Boolean);
  var pageSlug = parts[parts.length - 1] || '';
  document.querySelectorAll('.btn-comprar-ea').forEach(function(btn){
    btn.addEventListener('click', function(){
      var url = '/checkout?slug=' + encodeURIComponent(pageSlug);
      if (ref) url += '&ref=' + encodeURIComponent(ref);
      window.location.href = url;
    });
  });
})();`);
});

// ── Extracción de color principal desde HTML de página ───────────────────────
function _isUsableColor(hex) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  if (r>210 && g>210 && b>210) return false; // near-white
  if (r<25  && g<25  && b<25)  return false; // near-black
  const avg = (r+g+b)/3;
  if (Math.abs(r-avg)<18 && Math.abs(g-avg)<18 && Math.abs(b-avg)<18) return false; // gray
  return true;
}
function _extractColor(html) {
  if (!html) return null;
  if (html.includes('activos-venta-landing')) {
    const avBrand = html.match(/--av-brand-bright:\s*(#[0-9a-fA-F]{6})/i);
    if (avBrand && _isUsableColor(avBrand[1])) return avBrand[1].toLowerCase();
    const avAccent = html.match(/--av-accent:\s*(#[0-9a-fA-F]{6})/i);
    if (avAccent && _isUsableColor(avAccent[1])) return avAccent[1].toLowerCase();
  }
  // 1. Color del botón .btn-comprar-ea (más confiable)
  const btnBlock = html.match(/\.btn-comprar-ea\s*\{([^}]+)\}/s);
  if (btnBlock) {
    const m = btnBlock[1].match(/background(?:-color)?\s*:\s*(#[0-9a-fA-F]{6})/);
    if (m && _isUsableColor(m[1])) return m[1].toLowerCase();
  }
  // 2. Variables CSS --color: #... que parezcan de acento
  const vars = html.match(/--[a-z-]+\s*:\s*(#[0-9a-fA-F]{6})/g) || [];
  for (const v of vars) {
    const c = v.match(/#[0-9a-fA-F]{6}/)[0];
    if (_isUsableColor(c)) return c.toLowerCase();
  }
  // 3. Cualquier hex de 6 dígitos dentro de <style>
  const styleBlock = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  if (styleBlock) {
    const hexes = styleBlock[1].match(/#[0-9a-fA-F]{6}/g) || [];
    for (const c of hexes) { if (_isUsableColor(c)) return c.toLowerCase(); }
  }
  return null;
}

function _isMiniappCheckoutSlug(slug) {
  return String(slug || '').trim().toLowerCase().startsWith('app-');
}

function _processTemplateBlock(html, blockName, include) {
  const re = new RegExp('\\{\\{#IF_' + blockName + '\\}\\}([\\s\\S]*?)\\{\\{/IF_' + blockName + '\\}\\}', 'g');
  return html.replace(re, include ? '$1' : '');
}

function _replaceTemplateMarkers(html, map) {
  let out = html;
  Object.keys(map).forEach(function (key) {
    out = out.split('{{' + key + '}}').join(String(map[key] != null ? map[key] : ''));
  });
  return out;
}

function _extractMiniappColors(html) {
  if (!html) return { ...DEFAULT_MINIAPP_COLORS };
  if (html.includes('activos-venta-template-v1') || html.includes('activos-venta-landing')) {
    const brand  = html.match(/--av-brand:\s*(#[0-9a-fA-F]{6})/i);
    const bright = html.match(/--av-brand-bright:\s*(#[0-9a-fA-F]{6})/i);
    const accent = html.match(/--av-accent:\s*(#[0-9a-fA-F]{6})/i);
    return {
      color_1: (brand  && brand[1].toLowerCase())  || DEFAULT_MINIAPP_COLORS.color_1,
      color_2: (bright && bright[1].toLowerCase()) || DEFAULT_MINIAPP_COLORS.color_2,
      color_3: (accent && accent[1].toLowerCase()) || DEFAULT_MINIAPP_COLORS.color_3
    };
  }
  const grad = html.match(/--grad:\s*linear-gradient\([^,]+,\s*(#[0-9a-fA-F]{6})\s+0%[^#]*(#[0-9a-fA-F]{6})[^#]*(#[0-9a-fA-F]{6})/);
  if (grad) {
    return { color_1: grad[1].toLowerCase(), color_2: grad[2].toLowerCase(), color_3: grad[3].toLowerCase() };
  }
  const c1 = html.match(/--blue:\s*(#[0-9a-fA-F]{6})/i);
  const c2 = html.match(/--violet:\s*(#[0-9a-fA-F]{6})/i);
  const c3 = html.match(/--flame:\s*(#[0-9a-fA-F]{6})/i);
  return {
    color_1: (c1 && c1[1]) || DEFAULT_MINIAPP_COLORS.color_1,
    color_2: (c2 && c2[1]) || DEFAULT_MINIAPP_COLORS.color_2,
    color_3: (c3 && c3[1]) || DEFAULT_MINIAPP_COLORS.color_3
  };
}

function _miniappPrecioVenta(miniapp) {
  const normal = Number(miniapp.precio) || 0;
  const promo  = Number(miniapp.precio_promocion);
  if (Number.isFinite(promo) && promo > 0 && (promo < normal || normal === 0)) return promo;
  return normal;
}

function _generarCodigoAcceso() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const len   = 14;
  const bytes = crypto.randomBytes(len);
  let code = '';
  for (let i = 0; i < len; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

async function _generarCodigoAccesoUnico() {
  for (let n = 0; n < 25; n++) {
    const codigo = _generarCodigoAcceso();
    const { data } = await supabase
      .from('miniapp_compras')
      .select('id')
      .eq('codigo_acceso', codigo)
      .maybeSingle();
    if (!data) return codigo;
  }
  throw new Error('No se pudo generar un codigo de acceso unico.');
}

async function _buscarMiniappPorPaginaSlug(slugPagina) {
  const slug = String(slugPagina || '').trim();
  if (!slug) return null;
  const { data, error } = await supabase
    .from('miniapps')
    .select('id, nombre, slug, precio, precio_promocion, r2_key, pdf_key, foto1_key, tipo_producto, categoria, comision_vendedor, pagina_venta_slug, estado_aprobacion')
    .eq('pagina_venta_slug', slug)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function _buscarCompraPorStripeSessionId(sessionId) {
  const sid = String(sessionId || '').trim();
  if (!sid) return null;
  const cols = 'id, miniapp_id, codigo_acceso, monto, estado_pago, stripe_session_id, stripe_payment_intent_id';

  let { data, error } = await supabase
    .from('miniapp_compras')
    .select(cols)
    .eq('stripe_session_id', sid)
    .maybeSingle();

  if (error && /stripe_session_id|stripe_payment_intent_id|column|schema cache/.test(String(error.message || ''))) {
    console.error('[stripe] columnas stripe_* ausentes — webhook fail-closed');
    return null;
  }
  if (error) throw error;
  return data || null;
}

async function _marcarCompraPagadaStripe(compra, session) {
  if (!compra || !compra.id) return { ok: false, reason: 'not_found' };
  if (compra.estado_pago === 'pagado') {
    return { ok: true, idempotent: true };
  }

  const amountPaid = session.amount_total != null ? Number(session.amount_total) / 100 : null;
  const expected   = Number(compra.monto);
  if (amountPaid != null && Number.isFinite(expected) && Math.abs(amountPaid - expected) > 0.02) {
    console.error('[stripe/webhook] Monto no coincide codigo=' + compra.codigo_acceso +
      ' pagado=' + amountPaid + ' esperado=' + expected);
    return { ok: false, reason: 'amount_mismatch' };
  }

  const meta = session.metadata || {};
  if (meta.miniapp_id && String(meta.miniapp_id) !== String(compra.miniapp_id)) {
    console.error('[stripe/webhook] miniapp_id metadata no coincide codigo=' + compra.codigo_acceso);
    return { ok: false, reason: 'metadata_mismatch' };
  }

  const paymentIntentId = session.payment_intent
    ? (typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent.id)
    : null;

  const updatePayload = {
    estado_pago: 'pagado',
    pagado_en:   new Date().toISOString()
  };
  if (paymentIntentId) {
    updatePayload.stripe_payment_intent_id = String(paymentIntentId).slice(0, 255);
  }
  if (session.id && !compra.stripe_session_id) {
    updatePayload.stripe_session_id = String(session.id).slice(0, 255);
  }

  const { data, error } = await supabase
    .from('miniapp_compras')
    .update(updatePayload)
    .eq('id', compra.id)
    .eq('estado_pago', 'pendiente')
    .select('id, codigo_acceso, estado_pago')
    .maybeSingle();

  if (error) {
    if (/stripe_|pagado_en|column|schema cache/.test(String(error.message || ''))) {
      console.error('[stripe/webhook] columnas requeridas ausentes:', error.message);
      return { ok: false, reason: 'schema' };
    }
    throw error;
  }

  if (!data) {
    const { data: again } = await supabase
      .from('miniapp_compras')
      .select('id, codigo_acceso, estado_pago')
      .eq('id', compra.id)
      .maybeSingle();
    if (again && again.estado_pago === 'pagado') {
      return { ok: true, idempotent: true };
    }
    console.error('[stripe/webhook] No se pudo marcar pagada id=' + compra.id);
    return { ok: false, reason: 'update_failed' };
  }

  console.log('[stripe/webhook] Compra pagada codigo=' + data.codigo_acceso);
  return { ok: true, idempotent: false, compra: data };
}

async function _handleStripeWebhook(req, res) {
  const stripe = _getStripe();
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    console.error('[stripe/webhook] Stripe no configurado (falta STRIPE_SECRET_KEY o STRIPE_WEBHOOK_SECRET)');
    return res.status(503).send('Stripe no configurado');
  }

  const sig = req.headers['stripe-signature'];
  if (!sig) {
    console.error('[stripe/webhook] Falta header stripe-signature');
    return res.status(400).send('Missing stripe-signature');
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    console.error('[stripe/webhook] Firma invalida:', e.message);
    return res.status(400).send('Webhook signature verification failed');
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const codigoMeta = session.metadata && session.metadata.codigo
        ? String(session.metadata.codigo).trim().toUpperCase()
        : '';

      let compra = null;
      if (codigoMeta) {
        compra = await _buscarCompraPorCodigo(codigoMeta);
      }
      if (!compra && session.id) {
        compra = await _buscarCompraPorStripeSessionId(session.id);
      }

      if (!compra) {
        console.error('[stripe/webhook] Compra no encontrada session=' + session.id + ' codigo=' + codigoMeta);
        return res.json({ received: true });
      }

      const result = await _marcarCompraPagadaStripe(compra, session);
      if (!result.ok && result.reason === 'amount_mismatch') {
        console.error('[stripe/webhook] Pago rechazado por monto — NO se marca pagada');
      }
    }
  } catch (e) {
    console.error('[stripe/webhook] Error procesando evento:', e.message);
    return res.status(500).send('Webhook handler error');
  }

  return res.json({ received: true });
}

async function _buscarCompraPorCodigo(codigo) {
  const cod = String(codigo || '').trim().toUpperCase();
  if (!cod) return null;
  const colsFull = 'id, miniapp_id, miniapp_slug, codigo_acceso, comprador_email, ref_vendedor, vendedor_id, monto, estado_pago, descargas_count, descargas_max, creado_en';

  let { data, error } = await supabase
    .from('miniapp_compras')
    .select(colsFull)
    .eq('codigo_acceso', cod)
    .maybeSingle();

  if (error && /descargas_count|descargas_max|column|schema cache/.test(String(error.message || ''))) {
    console.error('[entrega/cuota] columnas descargas_* ausentes — acceso denegado (fail-closed)');
    return null;
  }

  if (error) throw error;
  return data || null;
}

// ── Seguridad entrega digital ─────────────────────────────────────────────────
const ENTREGA_DESCARGAS_MAX_DEFAULT = 20;
const ENTREGA_RATE_MAX              = 20;
const ENTREGA_RATE_WINDOW_MS        = 60 * 1000;
const ENTREGA_MSG_INVALIDO          = 'Acceso no valido';
const ENTREGA_MSG_LIMITE            = 'Limite de accesos alcanzado. Contacta soporte.';
const ENTREGA_MSG_RATE              = 'Demasiados intentos. Intenta de nuevo en unos minutos.';
const LIMITE_DESCARGAS_VIDEO        = 3;
const ENTREGA_MSG_VIDEO_DL_LIMITE   = 'Alcanzaste el limite de descargas de este video (3). Puedes verlo online cuando quieras.';

const _entregaRateMap = new Map();

function _getClientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim();
  return req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
}

function _entregaRateLimitCleanup(now) {
  if (_entregaRateMap.size < 2000) return;
  _entregaRateMap.forEach(function (entry, ip) {
    if (now >= entry.resetAt) _entregaRateMap.delete(ip);
  });
}

function _entregaRateLimitPermitir(req) {
  const ip  = _getClientIp(req);
  const now = Date.now();
  _entregaRateLimitCleanup(now);

  let entry = _entregaRateMap.get(ip);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + ENTREGA_RATE_WINDOW_MS };
    _entregaRateMap.set(ip, entry);
  }
  entry.count += 1;
  return entry.count <= ENTREGA_RATE_MAX;
}

function _entregaCodigoValidoFormato(codigo) {
  const cod = String(codigo || '').trim().toUpperCase();
  return /^[A-Z0-9]{4,32}$/.test(cod) ? cod : null;
}

function _denegarEntregaTexto(res, reason, status) {
  if (reason === 'rate') {
    return res.status(429).send(ENTREGA_MSG_RATE);
  }
  if (reason === 'limit') {
    return res.status(403).send(ENTREGA_MSG_LIMITE);
  }
  return res.status(status || 403).send(ENTREGA_MSG_INVALIDO);
}

function _denegarEntregaHtml(res, reason, status) {
  _setNoCacheHtml(res);
  if (reason === 'rate') {
    return res.status(429).send(_htmlAccesoInvalido('Acceso no valido', ENTREGA_MSG_RATE));
  }
  if (reason === 'limit') {
    return res.status(403).send(_htmlAccesoInvalido('Acceso no valido', ENTREGA_MSG_LIMITE));
  }
  return res.status(status || 403).send(_htmlAccesoInvalido('Acceso no valido', ENTREGA_MSG_INVALIDO));
}

async function _entregaValidarCompra(codigo) {
  const cod = _entregaCodigoValidoFormato(codigo);
  if (!cod) {
    return { ok: false, reason: 'invalid' };
  }
  const compra = await _buscarCompraPorCodigo(cod);
  if (!compra || compra.estado_pago !== 'pagado') {
    return { ok: false, reason: 'invalid' };
  }
  return { ok: true, compra };
}

async function _logAccesoEntrega(compra, recurso, ip) {
  try {
    const { error } = await supabase.from('miniapp_accesos_log').insert({
      compra_id:     compra.id,
      codigo_acceso: compra.codigo_acceso,
      recurso:       String(recurso || 'unknown').slice(0, 64),
      ip_address:    String(ip || '').slice(0, 64),
      creado_en:     new Date().toISOString()
    });
    if (error) {
      console.warn('[entrega/log]', error.message);
    }
  } catch (e) {
    console.warn('[entrega/log]', e.message);
  }
}

async function _consumirCuotaDescarga(compra, recurso, req) {
  const ip     = _getClientIp(req);
  const maxRaw = Number(compra.descargas_max);
  const limite = Number.isFinite(maxRaw) && maxRaw > 0 ? maxRaw : ENTREGA_DESCARGAS_MAX_DEFAULT;
  const actual = Number(compra.descargas_count) || 0;

  if (actual >= limite) {
    return { ok: false, reason: 'limit' };
  }

  const { data, error } = await supabase
    .from('miniapp_compras')
    .update({ descargas_count: actual + 1 })
    .eq('id', compra.id)
    .lt('descargas_count', limite)
    .select('descargas_count, descargas_max')
    .maybeSingle();

  if (error) {
    if (/descargas_count|descargas_max|column|schema cache/.test(String(error.message || ''))) {
      console.error('[entrega/cuota] columnas descargas_* ausentes — acceso denegado (fail-closed)');
      return { ok: false, reason: 'invalid' };
    }
    console.error('[entrega/cuota]', error.message);
    return { ok: false, reason: 'invalid' };
  }

  if (!data) {
    return { ok: false, reason: 'limit' };
  }

  compra.descargas_count = data.descargas_count;
  await _logAccesoEntrega(compra, recurso, ip);
  return { ok: true };
}

function _isVideoDlSchemaError(msg) {
  return /miniapp_video_descargas|column|schema cache|relation/i.test(String(msg || ''));
}

async function _leerDescargasVideoUsadas(compraId, videoId) {
  const { data, error } = await supabase
    .from('miniapp_video_descargas')
    .select('descargas_count')
    .eq('compra_id', compraId)
    .eq('video_id', String(videoId).trim())
    .maybeSingle();
  if (error) {
    if (_isVideoDlSchemaError(error.message)) return { ok: false, failClosed: true };
    throw error;
  }
  return { ok: true, usadas: Number(data && data.descargas_count) || 0 };
}

async function _verificarLimiteDescargaVideo(compraId, videoId) {
  const r = await _leerDescargasVideoUsadas(compraId, videoId);
  if (!r.ok) return { ok: false, failClosed: true };
  const restantes = LIMITE_DESCARGAS_VIDEO - r.usadas;
  if (restantes <= 0) {
    return { ok: false, reason: 'video_limit', message: ENTREGA_MSG_VIDEO_DL_LIMITE };
  }
  return { ok: true, usadas: r.usadas, restantes };
}

async function _cargarDescargasVideoRestantesMap(compraId, videoIds) {
  const map = {};
  const ids = (videoIds || []).map(String);
  ids.forEach(function (id) { map[id] = LIMITE_DESCARGAS_VIDEO; });
  if (!ids.length) return map;
  const { data, error } = await supabase
    .from('miniapp_video_descargas')
    .select('video_id, descargas_count')
    .eq('compra_id', compraId)
    .in('video_id', ids);
  if (error) {
    if (_isVideoDlSchemaError(error.message)) return null;
    throw error;
  }
  (data || []).forEach(function (row) {
    const used = Number(row.descargas_count) || 0;
    map[String(row.video_id)] = Math.max(0, LIMITE_DESCARGAS_VIDEO - used);
  });
  return map;
}

async function _incrementarDescargaVideo(compra, videoId, req) {
  const compraId = compra.id;
  const vid      = String(videoId).trim();
  const ip       = _getClientIp(req);

  const prev = await _verificarLimiteDescargaVideo(compraId, vid);
  if (!prev.ok) return prev;

  const { data: row, error: selErr } = await supabase
    .from('miniapp_video_descargas')
    .select('id, descargas_count')
    .eq('compra_id', compraId)
    .eq('video_id', vid)
    .maybeSingle();
  if (selErr) {
    if (_isVideoDlSchemaError(selErr.message)) return { ok: false, failClosed: true };
    throw selErr;
  }

  let data = null;
  let error = null;

  if (!row) {
    const ins = await supabase
      .from('miniapp_video_descargas')
      .insert({ compra_id: compraId, video_id: vid, descargas_count: 1 })
      .select('descargas_count')
      .single();
    data  = ins.data;
    error = ins.error;
    if (error && /duplicate|unique|23505/i.test(String(error.message || ''))) {
      const upd = await supabase
        .from('miniapp_video_descargas')
        .update({ descargas_count: (prev.usadas || 0) + 1 })
        .eq('compra_id', compraId)
        .eq('video_id', vid)
        .lt('descargas_count', LIMITE_DESCARGAS_VIDEO)
        .select('descargas_count')
        .maybeSingle();
      data  = upd.data;
      error = upd.error;
    }
  } else {
    const upd = await supabase
      .from('miniapp_video_descargas')
      .update({ descargas_count: (Number(row.descargas_count) || 0) + 1 })
      .eq('compra_id', compraId)
      .eq('video_id', vid)
      .lt('descargas_count', LIMITE_DESCARGAS_VIDEO)
      .select('descargas_count')
      .maybeSingle();
    data  = upd.data;
    error = upd.error;
  }

  if (error) {
    if (_isVideoDlSchemaError(error.message)) return { ok: false, failClosed: true };
    throw error;
  }
  if (!data) {
    return { ok: false, reason: 'video_limit', message: ENTREGA_MSG_VIDEO_DL_LIMITE };
  }

  await _logAccesoEntrega(compra, 'video-dl:' + vid, ip);
  const usadas = Number(data.descargas_count) || LIMITE_DESCARGAS_VIDEO;
  return { ok: true, restantes: Math.max(0, LIMITE_DESCARGAS_VIDEO - usadas) };
}

function _denegarVideoDescarga(res, message) {
  return res.status(403).send(message || ENTREGA_MSG_VIDEO_DL_LIMITE);
}

function _r2ContentDisposition(filename, inline) {
  const safe = String(filename || 'archivo').replace(/[^\w\s.-]/g, '_').trim() || 'archivo';
  return (inline ? 'inline' : 'attachment') + '; filename="' + safe + '"';
}

async function _redirectPresignedR2(res, key, opts) {
  const url = await generarUrlFirmada(key, {
    expiresIn: R2_PRESIGNED_EXPIRES_SEC,
    contentDisposition: opts.contentDisposition,
    contentType: opts.contentType
  });
  res.setHeader('Cache-Control', 'private, no-store');
  res.redirect(302, url);
}

async function _videoEntregaValidarAcceso(codigo, videoId) {
  const validacion = await _entregaValidarCompra(codigo);
  if (!validacion.ok) return { ok: false, reason: validacion.reason };
  const compra = validacion.compra;
  const vid    = String(videoId || '').trim();
  if (!vid) return { ok: false, reason: 'invalid' };

  const { data: video, error: vErr } = await supabase
    .from('miniapp_videos')
    .select('id, video_key, nombre, miniapp_id')
    .eq('id', vid)
    .eq('miniapp_id', compra.miniapp_id)
    .maybeSingle();
  if (vErr || !video || !video.video_key) {
    return { ok: false, reason: 'invalid' };
  }
  return { ok: true, compra, video };
}

function _entregaCodigoGate(req, res, next) {
  if (!_entregaRateLimitPermitir(req)) {
    const isHtml = req.path.indexOf('/mi-compra/') === 0;
    if (isHtml) return _denegarEntregaHtml(res, 'rate');
    return _denegarEntregaTexto(res, 'rate');
  }
  next();
}

function _htmlAccesoInvalido(titulo, mensaje) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo}</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f7fb;color:#0d1117;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px}
.box{max-width:420px;background:#fff;border:1px solid #e4e7eb;border-radius:16px;padding:32px;text-align:center;box-shadow:0 12px 40px rgba(13,17,23,.08)}
h1{font-size:22px;margin:0 0 10px}p{color:#5f6571;line-height:1.6;margin:0}</style></head>
<body><div class="box"><h1>${titulo}</h1><p>${mensaje}</p></div></body></html>`;
}

// ── Info pública del producto para el checkout ────────────────────────────────
app.get('/api/checkout/info', async (req, res) => {
  const { slug } = req.query;
  if (!slug) return res.status(400).json({ ok: false, error: 'Se requiere slug.' });
  try {
    if (_isMiniappCheckoutSlug(slug)) {
      const miniapp = await _buscarMiniappPorPaginaSlug(slug);
      if (!miniapp) {
        return res.status(404).json({ ok: false, error: 'Mini app no encontrada.' });
      }
      if (miniapp.estado_aprobacion !== 'aprobada') {
        return res.status(400).json({ ok: false, error: 'Producto no disponible.' });
      }
      const disp = await _validarMiniappDisponibleCompra(miniapp);
      if (!disp.ok) {
        return res.status(400).json({ ok: false, error: disp.error });
      }
      const { data: pagina } = await supabase
        .from('paginas_venta')
        .select('html')
        .eq('slug', slug)
        .eq('activa', true)
        .maybeSingle();
      const colores = _extractMiniappColors(pagina && pagina.html);
      const precio  = _miniappPrecioVenta(miniapp);
      const imagen  = miniapp.foto1_key
        ? PUBLIC_BASE_URL + '/api/miniapps/asset/' + encodeURIComponent(miniapp.slug) + '/foto1'
        : null;
      return res.json({
        ok: true,
        es_miniapp: true,
        nombre_producto: miniapp.nombre,
        precio,
        imagen,
        color_principal: colores.color_1,
        miniapp_slug: miniapp.slug,
        stripe_activo: !!STRIPE_SECRET_KEY,
        compra_prueba_activa: COMPRA_PRUEBA_ACTIVA
      });
    }

    const { data: pagina, error: pErr } = await supabase
      .from('paginas_venta')
      .select('id, nombre, producto_id, html')  // incluye html para extraer color
      .eq('slug', slug).eq('activa', true).single();
    if (pErr || !pagina) return res.status(404).json({ ok: false, error: 'Pagina no encontrada.' });

    let nombre_producto = pagina.nombre;
    let precio = 0;
    let imagen = null;

    if (pagina.producto_id) {
      const { data: prod } = await supabase
        .from('productos')
        .select('nombre, precio, imagenes')
        .eq('id', pagina.producto_id).single();
      if (prod) {
        nombre_producto = prod.nombre;
        precio          = prod.precio || 0;
        imagen          = Array.isArray(prod.imagenes) ? prod.imagenes[0] : null;
      }
    }

    const color_principal = _extractColor(pagina.html) || '#b89368';
    res.json({ ok: true, nombre_producto, precio, imagen, color_principal });
  } catch (e) {
    console.error('[checkout/info]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// ── Checkout digital mini apps — JS externo (evita inline script en template literal) ─
app.get('/checkout-miniapp.js', (req, res) => {
  _setNoCacheJs(res);
  res.send(
'(function(){\n' +
'"use strict";\n' +
'var _slug="", _ref="", _precio=0, _stripeActivo=false, _modoPrueba=false;\n' +
'\n' +
'function _coEmailOk(v){\n' +
'  var s=String(v||"").trim();\n' +
'  var at=s.indexOf("@");\n' +
'  return at>0 && s.indexOf(".", at)>at+1 && s.indexOf(" ")===-1;\n' +
'}\n' +
'\n' +
'function _coFmtPrecio(){\n' +
'  return _precio>0 ? "$"+Number(_precio).toLocaleString("en-US") : "Gratis";\n' +
'}\n' +
'\n' +
'function _coBtnLabel(){\n' +
'  var fmt=_coFmtPrecio();\n' +
'  if(_stripeActivo) return "Pagar "+fmt;\n' +
'  if(_modoPrueba) return "Pagar "+fmt+" (prueba)";\n' +
'  return "Pagar "+fmt;\n' +
'}\n' +
'\n' +
'function _coMostrarErr(msg){\n' +
'  var err=document.getElementById("co-pay-err");\n' +
'  if(!err) return;\n' +
'  err.textContent=msg||"";\n' +
'  err.style.display=msg?"block":"none";\n' +
'}\n' +
'\n' +
'function _coResetBtn(){\n' +
'  var btn=document.getElementById("co-btn-pagar");\n' +
'  if(!btn) return;\n' +
'  btn.disabled=false;\n' +
'  btn.textContent=_coBtnLabel();\n' +
'}\n' +
'\n' +
'function _coPayload(){\n' +
'  var emailEl=document.getElementById("co-email");\n' +
'  var email=emailEl?String(emailEl.value||"").trim():"";\n' +
'  var payload={slug_pagina:_slug,ref:_ref||undefined};\n' +
'  if(email) payload.email=email;\n' +
'  return { payload:payload, email:email, emailEl:emailEl };\n' +
'}\n' +
'\n' +
'function _coValidarEmail(email, emailEl){\n' +
'  if(email&&!_coEmailOk(email)){\n' +
'    _coMostrarErr("Email invalido.");\n' +
'    if(emailEl) emailEl.focus();\n' +
'    return false;\n' +
'  }\n' +
'  return true;\n' +
'}\n' +
'\n' +
'function _coPagarPrueba(btn, payload){\n' +
'  fetch("/api/miniapp/comprar-prueba",{\n' +
'    method:"POST",\n' +
'    headers:{"Content-Type":"application/json"},\n' +
'    body:JSON.stringify(payload)\n' +
'  })\n' +
'    .then(function(r){return r.json();})\n' +
'    .then(function(d){\n' +
'      if(!d.ok) throw new Error(d.error||"No se pudo completar la compra.");\n' +
'      if(d.link_unico){window.location.href=d.link_unico;return;}\n' +
'      throw new Error("Respuesta invalida del servidor.");\n' +
'    })\n' +
'    .catch(function(e){\n' +
'      _coMostrarErr((e&&e.message)||"Error al procesar la compra.");\n' +
'      _coResetBtn();\n' +
'    });\n' +
'}\n' +
'\n' +
'function _coPagarStripe(btn, payload){\n' +
'  fetch("/api/checkout/crear-sesion",{\n' +
'    method:"POST",\n' +
'    headers:{"Content-Type":"application/json"},\n' +
'    body:JSON.stringify(payload)\n' +
'  })\n' +
'    .then(function(r){return r.json().then(function(d){return{status:r.status,data:d};});})\n' +
'    .then(function(res){\n' +
'      var d=res.data;\n' +
'      if(d.ok&&d.url){window.location.href=d.url;return;}\n' +
'      if(res.status===503&&_modoPrueba){\n' +
'        _coPagarPrueba(btn,payload);\n' +
'        return;\n' +
'      }\n' +
'      throw new Error((d&&d.error)||"No se pudo iniciar el pago.");\n' +
'    })\n' +
'    .catch(function(e){\n' +
'      _coMostrarErr((e&&e.message)||"Error al procesar el pago.");\n' +
'      _coResetBtn();\n' +
'    });\n' +
'}\n' +
'\n' +
'function eaCoPagar(ev){\n' +
'  if(ev&&ev.preventDefault) ev.preventDefault();\n' +
'  if(ev&&ev.stopPropagation) ev.stopPropagation();\n' +
'  var btn=document.getElementById("co-btn-pagar");\n' +
'  var pack=_coPayload();\n' +
'  _coMostrarErr("");\n' +
'  if(!_coValidarEmail(pack.email,pack.emailEl)) return false;\n' +
'  if(!btn||btn.disabled) return false;\n' +
'  if(!_stripeActivo&&!_modoPrueba){\n' +
'    _coMostrarErr("Pagos no disponibles en este momento.");\n' +
'    return false;\n' +
'  }\n' +
'  btn.disabled=true;\n' +
'  btn.textContent="Procesando...";\n' +
'  if(_stripeActivo){\n' +
'    _coPagarStripe(btn,pack.payload);\n' +
'  }else{\n' +
'    _coPagarPrueba(btn,pack.payload);\n' +
'  }\n' +
'  return false;\n' +
'}\n' +
'window.eaCoPagar=eaCoPagar;\n' +
'\n' +
'function _coBindPagar(){\n' +
'  var btn=document.getElementById("co-btn-pagar");\n' +
'  if(!btn||btn.getAttribute("data-co-bound")==="1") return;\n' +
'  btn.setAttribute("data-co-bound","1");\n' +
'  btn.addEventListener("click", eaCoPagar);\n' +
'}\n' +
'\n' +
'function _coInit(){\n' +
'  _coBindPagar();\n' +
'  var p=new URLSearchParams(window.location.search);\n' +
'  _slug=p.get("slug")||"";\n' +
'  _ref=p.get("ref")||"";\n' +
'  if(!_slug){\n' +
'    var load=document.getElementById("load");\n' +
'    if(load) load.innerHTML=\'<p style="color:#c0392b">Enlace invalido.</p>\';\n' +
'    return;\n' +
'  }\n' +
'  fetch("/api/checkout/info?slug="+encodeURIComponent(_slug))\n' +
'    .then(function(r){return r.json();})\n' +
'    .then(function(d){\n' +
'      var load=document.getElementById("load");\n' +
'      if(load) load.style.display="none";\n' +
'      if(!d.ok){\n' +
'        if(load){\n' +
'          load.style.display="block";\n' +
'          load.innerHTML=\'<p style="color:#c0392b">\'+(d.error||"Producto no disponible.")+"</p>";\n' +
'        }\n' +
'        return;\n' +
'      }\n' +
'      _precio=d.precio||0;\n' +
'      _stripeActivo=!!d.stripe_activo;\n' +
'      _modoPrueba=!!d.compra_prueba_activa;\n' +
'      var badge=document.getElementById("co-badge");\n' +
'      if(badge){\n' +
'        if(_stripeActivo) badge.textContent="Pago seguro · Stripe";\n' +
'        else if(_modoPrueba) badge.textContent="Modo prueba — sin cobro real";\n' +
'        else badge.style.display="none";\n' +
'      }\n' +
'      var accent=(d.color_principal&&/^#[0-9a-fA-F]{6}$/.test(d.color_principal))?d.color_principal:"#2f86ff";\n' +
'      document.documentElement.style.setProperty("--c1",accent);\n' +
'      var nombreEl=document.getElementById("nombre");\n' +
'      if(nombreEl) nombreEl.textContent=d.nombre_producto||"Mini app";\n' +
'      var fmt=_coFmtPrecio();\n' +
'      var precioEl=document.getElementById("precio");\n' +
'      if(precioEl) precioEl.textContent=fmt;\n' +
'      var btn=document.getElementById("co-btn-pagar");\n' +
'      if(btn) btn.textContent=_coBtnLabel();\n' +
'      var iw=document.getElementById("img-wrap");\n' +
'      if(iw&&d.imagen){\n' +
'        var img=document.createElement("img");\n' +
'        img.src=d.imagen;\n' +
'        img.alt=d.nombre_producto||"";\n' +
'        iw.appendChild(img);\n' +
'      }\n' +
'      var card=document.getElementById("card");\n' +
'      if(card) card.style.display="block";\n' +
'      _coBindPagar();\n' +
'    })\n' +
'    .catch(function(){\n' +
'      var load=document.getElementById("load");\n' +
'      if(load) load.innerHTML=\'<p style="color:#c0392b">Error al cargar.</p>\';\n' +
'    });\n' +
'}\n' +
'\n' +
'if(document.readyState==="loading"){\n' +
'  document.addEventListener("DOMContentLoaded", _coInit);\n' +
'}else{\n' +
'  _coInit();\n' +
'}\n' +
'})();\n'
  );
});

// ── Checkout digital mini apps (GET /checkout?slug=app-...) ───────────────────
function _serveCheckoutMiniapp(req, res) {
  const badgeText = STRIPE_SECRET_KEY
    ? 'Pago seguro · Stripe'
    : (COMPRA_PRUEBA_ACTIVA ? 'Modo prueba — sin cobro real' : 'Checkout');
  _setNoCacheHtml(res);
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Comprar mini app · EcommerceAgents</title>
<style>
:root{--c1:#2f86ff;--c2:#7c3aed;--c3:#ff5a3c;--grad:linear-gradient(120deg,var(--c1),var(--c2),var(--c3));--ink:#0d1117;--slate:#5f6571;--line:#e4e7eb;--paper:#f5f7fb;--white:#fff;--err:#c0392b}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;background:radial-gradient(700px 350px at 50% -5%,rgba(124,58,237,.10),transparent 60%),var(--paper);color:var(--ink);min-height:100vh;padding:32px 16px 48px}
.wrap{max-width:480px;margin:0 auto}
.badge{display:inline-flex;align-items:center;gap:6px;background:#fff8e6;border:1px solid #ffe7a3;color:#8a6d1a;font-size:12px;font-weight:700;padding:6px 12px;border-radius:999px;margin-bottom:18px}
.card{background:var(--white);border:1px solid var(--line);border-radius:20px;overflow:hidden;box-shadow:0 20px 60px rgba(13,17,23,.10)}
.hero{padding:28px 24px 22px;text-align:center;border-bottom:1px solid var(--line)}
.hero img{width:100%;max-height:220px;object-fit:cover;border-radius:14px;margin-bottom:18px;background:var(--paper)}
.hero h1{font-size:24px;font-weight:800;line-height:1.25;margin-bottom:8px}
.hero p{font-size:14px;color:var(--slate);line-height:1.5}
.price{font-size:32px;font-weight:800;background:var(--grad);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;margin-top:14px}
.co-card-body{padding:24px}
.co-field{margin-bottom:16px;text-align:left}
.co-field label{display:block;font-size:13px;font-weight:600;color:var(--ink);margin-bottom:6px}
.co-field input{width:100%;border:1px solid var(--line);border-radius:12px;padding:12px 14px;font-size:15px;font-family:inherit;color:var(--ink);background:#fff}
.co-field input:focus{outline:none;border-color:var(--c2);box-shadow:0 0 0 3px rgba(124,58,237,.12)}
#co-pay-err{display:none;color:var(--err);font-size:13px;margin-bottom:12px;padding:10px 12px;background:#fef5f5;border:1px solid #f5c6c6;border-radius:10px;text-align:left}
#co-btn-pagar{width:100%;border:none;border-radius:14px;padding:16px 20px;font-size:17px;font-weight:800;color:#fff;background:var(--grad);cursor:pointer;box-shadow:0 12px 32px rgba(124,58,237,.28);transition:transform .15s,filter .15s}
#co-btn-pagar:hover{transform:translateY(-2px);filter:brightness(1.04)}
#co-btn-pagar:disabled{opacity:.65;cursor:not-allowed;transform:none}
.co-note{margin-top:14px;font-size:12.5px;color:var(--slate);text-align:center;line-height:1.55}
.co-legal{margin-top:12px;font-size:11.5px;color:var(--slate);text-align:center;line-height:1.55}
.co-legal a{color:var(--c2);font-weight:600;text-decoration:underline}
.load{text-align:center;padding:48px 16px;color:var(--slate)}
.spin{width:28px;height:28px;border:2.5px solid var(--line);border-top-color:var(--c2);border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 12px}
@keyframes spin{to{transform:rotate(360deg)}}
</style>
</head>
<body>
<div class="wrap">
  <div class="badge" id="co-badge">${badgeText}</div>
  <div id="load" class="load"><div class="spin"></div>Cargando producto...</div>
  <div id="card" class="card">
    <div class="hero">
      <div id="img-wrap"></div>
      <h1 id="nombre">Mini app</h1>
      <p>Acceso digital instantaneo. Sin envio.</p>
      <div class="price" id="precio">—</div>
    </div>
    <div class="co-card-body">
      <div class="co-field">
        <label for="co-email">Tu email (opcional — te enviamos una copia de tu acceso)</label>
        <input type="email" id="co-email" name="email" autocomplete="email" placeholder="tu@email.com" />
      </div>
      <p id="co-pay-err" role="alert"></p>
      <button type="button" id="co-btn-pagar">Pagar —</button>
      <p class="co-legal">Al comprar aceptas nuestros <a href="/terminos" target="_blank" rel="noopener">Terminos y Condiciones</a> y la <a href="/terminos#no-devoluciones" target="_blank" rel="noopener">Politica de No Devoluciones</a> (productos digitales de descarga inmediata). <a href="/privacidad" target="_blank" rel="noopener">Politica de Privacidad</a>.</p>
      <p class="co-note">Al pagar accedes al instante a tu producto en pantalla. No necesitas esperar correo ni registrarte.</p>
    </div>
  </div>
</div>
<script src="${_assetUrl('/checkout-miniapp.js')}"></script>
</body>
</html>`);
}

// ── Formulario de checkout (GET /checkout) ────────────────────────────────────
app.get('/checkout', (req, res) => {
  const slug = String(req.query.slug || '').trim();
  if (_isMiniappCheckoutSlug(slug)) {
    return _serveCheckoutMiniapp(req, res);
  }
  _setNoCacheHtml(res);
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Confirmar pedido · EcommerceAgents</title>
<style>
:root{--accent:#b89368;--accent-dk:#9a7850;--accent-shadow:rgba(184,147,104,.13);--bg:#f7f5f1;--white:#fff;--txt:#1a1714;--txt-mid:#5a4f44;--txt-lt:#8a7a68;--bd:#e0d8cc;--suc:#2d7a3a;--err:#c0392b;--r:6px}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;background:var(--bg);color:var(--txt);min-height:100vh;font-size:15px}
/* ─── Header ─────────────────────────────── */
.ck-hd{background:#1a1714;padding:0 20px}
.ck-hd-in{max-width:980px;margin:0 auto;height:54px;display:flex;align-items:center;justify-content:space-between}
.ck-logo{color:#fff;font-family:Georgia,'Times New Roman',serif;font-size:19px;font-weight:400;letter-spacing:.02em;text-decoration:none;line-height:1}
.ck-logo em{color:var(--accent);font-style:italic}
.ck-ssl{display:flex;align-items:center;gap:6px;color:#b0a898;font-size:12px}
.ck-ssl svg{color:var(--accent);flex-shrink:0}
/* ─── Stepper ────────────────────────────── */
.ck-steps{background:var(--white);border-bottom:1px solid var(--bd);padding:0 20px}
.ck-steps-in{max-width:980px;margin:0 auto;height:46px;display:flex;align-items:center;justify-content:center;gap:0}
.ck-stp{display:flex;align-items:center;gap:7px;font-size:13px;color:var(--txt-lt)}
.ck-stp-n{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;background:var(--bd);color:var(--txt-lt)}
.ck-stp--on .ck-stp-n{background:var(--accent);color:#fff}
.ck-stp--on .ck-stp-lbl{color:var(--txt);font-weight:600}
.ck-stp-bar{width:28px;height:1px;background:var(--bd);margin:0 6px}
/* ─── Layout ─────────────────────────────── */
.ck-main{max-width:980px;margin:0 auto;padding:28px 16px 72px;display:flex;gap:24px;align-items:flex-start}
.ck-left{flex:1;min-width:0}
.ck-right{width:310px;flex-shrink:0;position:sticky;top:20px}
/* ─── Cards ──────────────────────────────── */
.ck-card{background:var(--white);border-radius:var(--r);border:1px solid var(--bd)}
.ck-card+.ck-card,.ck-card+.ck-note{margin-top:14px}
.ck-card-hd{padding:14px 18px 12px;border-bottom:1px solid var(--bd);font-size:11.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--txt-lt)}
/* ─── Form ───────────────────────────────── */
.ck-fbody{padding:18px}
.ck-fld{margin-bottom:14px}
.ck-lbl{display:block;font-size:12px;font-weight:600;color:var(--txt-mid);margin-bottom:4px}
.ck-req{color:var(--accent)}
.ck-inp{width:100%;padding:10px 12px;border:1.5px solid var(--bd);border-radius:var(--r);font-size:14px;color:var(--txt);background:var(--white);transition:border-color .15s,box-shadow .15s;outline:none;-webkit-appearance:none}
.ck-inp:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-shadow)}
.ck-inp::placeholder{color:#bfb8b0}
.ck-g2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.ck-g2z{display:grid;grid-template-columns:1fr 1fr;gap:12px}
/* ─── Button ─────────────────────────────── */
.ck-btn{width:100%;padding:15px 20px;background:var(--accent);color:#fff;border:none;border-radius:var(--r);font-size:16px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:9px;letter-spacing:.04em;transition:background .15s,transform .1s;margin-top:4px}
.ck-btn:hover{background:var(--accent-dk)}
.ck-btn:active{transform:scale(.99)}
.ck-btn:disabled{opacity:.65;cursor:not-allowed;transform:none}
.ck-bsub{text-align:center;font-size:11px;color:var(--txt-lt);margin-top:9px;line-height:1.5}
.ck-legal{font-size:11px;color:var(--txt-lt);margin-top:10px;line-height:1.55;text-align:center}
.ck-legal a{color:var(--accent-dk);font-weight:600}
.ck-err{color:var(--err);font-size:13px;margin-top:10px;padding:9px 13px;background:#fef5f5;border-radius:4px;border:1px solid #f5c6c6;display:none}
/* ─── Trust zone (near button) ──────────── */
.ck-guarantee{display:flex;align-items:flex-start;gap:10px;background:#faf9f6;border:1px solid var(--bd);border-left:3px solid var(--accent);border-radius:var(--r);padding:11px 13px;margin:14px 0 0}
.ck-guar-ic{color:var(--accent);flex-shrink:0;margin-top:1px}
.ck-guar-t{font-size:12px;font-weight:700;color:var(--txt);line-height:1.3;margin-bottom:2px}
.ck-guar-s{font-size:11px;color:var(--txt-mid);line-height:1.45}
.ck-ssl-line{display:flex;align-items:center;justify-content:center;gap:6px;font-size:11px;color:var(--txt-lt);margin-top:8px;line-height:1.5;text-align:center}
.ck-ssl-line svg{color:var(--suc);flex-shrink:0}
.ck-pay-zone{margin-top:16px;padding-top:14px;border-top:1px solid var(--bd)}
.ck-pay-lbl{display:block;text-align:center;font-size:10px;color:var(--txt-lt);letter-spacing:.06em;text-transform:uppercase;margin-bottom:9px}
.ck-pay-row{display:flex;align-items:center;justify-content:center;gap:7px;flex-wrap:wrap}
.ck-pay-ic{height:26px;border-radius:4px;border:1px solid var(--bd);padding:2px 8px;background:#fff;display:inline-flex;align-items:center;justify-content:center}
.ck-social{display:flex;align-items:center;justify-content:center;gap:6px;font-size:11px;color:var(--txt-lt);margin-top:10px}
.ck-stars{color:#e8a020;font-size:11px;letter-spacing:1px}
/* ─── WhatsApp asesor ────────────────────── */
.ck-asesor-wrap{margin-top:16px}
.ck-asesor-divider{display:flex;align-items:center;gap:10px;margin:14px 0;color:var(--txt-lt);font-size:12px}
.ck-asesor-divider::before,.ck-asesor-divider::after{content:'';flex:1;height:1px;background:var(--bd)}
.ck-asesor-btn{width:100%;padding:13px 20px;background:#25d366;color:#fff;border:none;border-radius:var(--r);font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:9px;transition:background .15s,opacity .15s;letter-spacing:.01em}
.ck-asesor-btn:hover:not(:disabled){background:#1ebe5c}
.ck-asesor-btn:disabled{opacity:.6;cursor:not-allowed}
.ck-asesor-msg{text-align:center;font-size:12.5px;margin-top:8px;color:var(--txt-lt);line-height:1.4}
/* ─── Payment method selector ─────────────── */
.ck-pay-sel{margin-top:18px}
.ck-pay-sel-ttl{font-size:11.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--txt-lt);margin-bottom:10px}
.ck-pay-opts{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.ck-pay-opt{border:2px solid var(--bd);border-radius:var(--r);padding:12px 14px;cursor:pointer;background:var(--white);transition:border-color .15s;user-select:none}
.ck-pay-opt:hover{border-color:var(--accent)}
.ck-pay-opt--active{border-color:var(--accent);background:#faf9f6}
.ck-pay-opt-ic{display:flex;align-items:center;gap:7px;margin-bottom:5px;color:var(--accent)}
.ck-pay-opt-t{font-size:13px;font-weight:700;color:var(--txt);line-height:1.2}
.ck-pay-opt-s{font-size:11px;color:var(--txt-lt);line-height:1.4;margin-top:2px}
.ck-wu-panel{background:#faf9f6;border:1px solid var(--bd);border-left:3px solid #f5a623;border-radius:var(--r);padding:14px 16px;margin-top:12px;display:none}
.ck-wu-panel.visible{display:block}
.ck-wu-ttl{font-size:12px;font-weight:700;color:var(--txt);margin-bottom:8px;display:flex;align-items:center;gap:6px}
.ck-wu-steps{font-size:11.5px;color:var(--txt-mid);line-height:1.8;margin-bottom:12px}
.ck-wu-steps strong{color:var(--txt)}
.ck-wu-ref-lbl{font-size:11px;font-weight:700;color:var(--txt);margin-bottom:5px;display:block}
.ck-wu-ref{width:100%;padding:9px 12px;border:1.5px solid var(--bd);border-radius:4px;font-size:13px;outline:none;background:var(--white);color:var(--txt);transition:border-color .15s}
.ck-wu-ref:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-shadow)}
@media(max-width:500px){.ck-pay-opts{grid-template-columns:1fr}}
/* ─── Summary ────────────────────────────── */
.ck-prod-img-area{border-radius:var(--r) var(--r) 0 0;overflow:hidden;background:var(--bg);border-bottom:1px solid var(--bd)}
.ck-prod-img-area img{width:100%;height:210px;object-fit:cover;display:block}
.ck-prod-img-ph{height:120px;display:flex;align-items:center;justify-content:center;color:var(--bd)}
.ck-prod-info{padding:14px 18px 10px}
.ck-urgency{display:inline-flex;align-items:center;gap:5px;background:var(--accent);color:#fff;font-size:10px;font-weight:800;padding:3px 10px;border-radius:20px;letter-spacing:.06em;text-transform:uppercase;margin-bottom:9px}
.ck-prod-name{font-weight:700;font-size:15px;line-height:1.4;color:var(--txt)}
.ck-stock-badge{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--suc);margin-top:7px;font-weight:600}
.ck-stock-dot{width:7px;height:7px;border-radius:50%;background:var(--suc);flex-shrink:0;animation:pulse-dot 2s ease-in-out infinite}
@keyframes pulse-dot{0%,100%{opacity:1}50%{opacity:.35}}
.ck-no-precio{font-size:12px;color:var(--txt-lt);font-style:italic;margin-top:6px}
.ck-tots{padding:12px 18px;border-top:1px solid var(--bd)}
.ck-trow{display:flex;justify-content:space-between;padding:5px 0;font-size:13px;color:var(--txt-mid)}
.ck-trow--total{padding-top:12px;margin-top:6px;border-top:1px solid var(--bd);font-weight:700;font-size:16px;color:var(--txt)}
.ck-trow--total span:last-child{color:var(--accent);font-size:18px}
.ck-ship-free{color:var(--suc);font-weight:600}
/* ─── Trust badges ───────────────────────── */
.ck-trust{padding:14px 18px;border-top:1px solid var(--bd);display:grid;grid-template-columns:1fr 1fr;gap:10px 8px}
.ck-tr{display:flex;align-items:flex-start;gap:7px}
.ck-tr-ic{color:var(--accent);flex-shrink:0;margin-top:1px}
.ck-tr-t{font-size:11px;font-weight:700;color:var(--txt);line-height:1.3}
.ck-tr-s{font-size:10px;color:var(--txt-lt);line-height:1.3}
/* ─── Loading ────────────────────────────── */
.ck-load{padding:64px 20px;text-align:center;color:var(--txt-lt);font-size:14px}
.ck-spin{width:28px;height:28px;border:2.5px solid var(--bd);border-top-color:var(--accent);border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 14px}
@keyframes spin{to{transform:rotate(360deg)}}
/* ─── Confirmation ───────────────────────── */
.ck-ok{display:none;max-width:480px;margin:56px auto;text-align:center;padding:40px 24px}
.ck-ok-ic{width:76px;height:76px;background:#e8f5e9;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 22px}
.ck-ok-h{font-family:Georgia,serif;font-size:26px;font-weight:700;color:var(--suc);margin-bottom:12px}
.ck-ok-p{font-size:15px;color:var(--txt-mid);line-height:1.7}
.ck-ok-box{margin-top:22px;padding:14px 18px;background:var(--white);border-radius:var(--r);border:1px solid var(--bd);font-size:13px;color:var(--txt-lt);text-align:left}
/* ─── Note ───────────────────────────────── */
.ck-note{font-size:11px;color:#aaa;text-align:center;line-height:1.6;padding:0 8px}
/* ─── Responsive ─────────────────────────── */
@media(max-width:700px){
  .ck-main{flex-direction:column;padding-top:20px}
  .ck-right{width:100%;position:static;order:-1}
  .ck-left{order:1}
  .ck-stp-lbl{display:none}
  .ck-stp--on .ck-stp-lbl{display:block}
  .ck-stp-bar{width:14px}
}
@media(max-width:380px){.ck-g2,.ck-g2z{grid-template-columns:1fr}}
</style>
</head>
<body>

<!-- ── Header ──────────────────────────────────────────────────────── -->
<header class="ck-hd">
  <div class="ck-hd-in">
    <span class="ck-logo">Ecommerce<em>Agents</em></span>
    <div class="ck-ssl">
      <svg width="12" height="14" viewBox="0 0 12 14" fill="none">
        <rect x="1" y="6" width="10" height="8" rx="1.5" fill="currentColor"/>
        <path d="M3 6V4.5a3 3 0 016 0V6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/>
      </svg>
      Compra 100% segura &middot; SSL encriptado
    </div>
  </div>
</header>

<!-- ── Stepper ─────────────────────────────────────────────────────── -->
<nav class="ck-steps">
  <div class="ck-steps-in">
    <div class="ck-stp ck-stp--on">
      <span class="ck-stp-n">1</span>
      <span class="ck-stp-lbl">Datos de envio</span>
    </div>
    <div class="ck-stp-bar"></div>
    <div class="ck-stp">
      <span class="ck-stp-n">2</span>
      <span class="ck-stp-lbl">Pago</span>
    </div>
    <div class="ck-stp-bar"></div>
    <div class="ck-stp">
      <span class="ck-stp-n">3</span>
      <span class="ck-stp-lbl">Confirmacion</span>
    </div>
  </div>
</nav>

<!-- ── Loading ─────────────────────────────────────────────────────── -->
<div id="co-loading" class="ck-load" style="display:none">
  <div class="ck-spin"></div>
  Cargando informacion del pedido...
</div>

<!-- ── Confirmation ────────────────────────────────────────────────── -->
<div id="co-confirm" class="ck-ok">
  <div class="ck-ok-ic">
    <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
      <path d="M7 17l7 7 13-14" stroke="#2d7a3a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </div>
  <h1 class="ck-ok-h">Pedido registrado</h1>
  <p class="ck-ok-p">Gracias, <strong id="co-confirm-nombre"></strong>.<br>
  <span id="co-confirm-msg">Recibimos tu pedido. Pronto nos contactamos para coordinar el envio.</span></p>
  <div class="ck-ok-box" id="co-confirm-box">
    Revisa tu email para la confirmacion. Si tienes dudas, contactanos por WhatsApp.
  </div>
</div>

<!-- ── Main layout ─────────────────────────────────────────────────── -->
<div id="co-main" class="ck-main" style="display:none">

  <!-- Left: form -->
  <div class="ck-left">
    <div class="ck-card">
      <div class="ck-card-hd">Datos de envio</div>
      <div class="ck-fbody">
        <form id="co-form" onsubmit="coSubmit(event)" novalidate>
          <div class="ck-fld">
            <label class="ck-lbl" for="co-nombre">Nombre completo <span class="ck-req">*</span></label>
            <input class="ck-inp" id="co-nombre" type="text" placeholder="Como aparece en tu ID" autocomplete="name" required>
          </div>
          <div class="ck-g2">
            <div class="ck-fld">
              <label class="ck-lbl" for="co-email">Email <span class="ck-req">*</span></label>
              <input class="ck-inp" id="co-email" type="email" placeholder="tu@email.com" autocomplete="email" required>
            </div>
            <div class="ck-fld">
              <label class="ck-lbl" for="co-telefono">Telefono <span class="ck-req">*</span></label>
              <input class="ck-inp" id="co-telefono" type="tel" placeholder="+1 (555) 000-0000" autocomplete="tel">
            </div>
          </div>
          <div class="ck-fld">
            <label class="ck-lbl" for="co-direccion">Direccion <span class="ck-req">*</span></label>
            <input class="ck-inp" id="co-direccion" type="text" placeholder="Calle, numero, apto / suite" autocomplete="street-address" required>
          </div>
          <div class="ck-g2">
            <div class="ck-fld">
              <label class="ck-lbl" for="co-ciudad">Ciudad <span class="ck-req">*</span></label>
              <input class="ck-inp" id="co-ciudad" type="text" placeholder="Ciudad" autocomplete="address-level2" required>
            </div>
            <div class="ck-fld">
              <label class="ck-lbl" for="co-estado">Estado</label>
              <input class="ck-inp" id="co-estado" type="text" placeholder="FL, TX, NY..." autocomplete="address-level1">
            </div>
          </div>
          <div class="ck-g2z">
            <div class="ck-fld">
              <label class="ck-lbl" for="co-zip">Codigo postal (ZIP)</label>
              <input class="ck-inp" id="co-zip" type="text" placeholder="33101" autocomplete="postal-code">
            </div>
            <div class="ck-fld">
              <label class="ck-lbl" for="co-pais">Pais</label>
              <input class="ck-inp" id="co-pais" type="text" value="Estados Unidos" autocomplete="country-name">
            </div>
          </div>
          <p id="co-error" class="ck-err"></p>

          <!-- Seleccion de metodo de pago -->
          <div class="ck-pay-sel">
            <div class="ck-pay-sel-ttl">Metodo de pago</div>
            <div class="ck-pay-opts">
              <div class="ck-pay-opt ck-pay-opt--active" id="opt-tarjeta" onclick="selPago('tarjeta')">
                <div class="ck-pay-opt-ic">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">
                    <rect x="1" y="5" width="22" height="14" rx="2"/>
                    <path d="M1 10h22" stroke-linecap="round"/>
                  </svg>
                </div>
                <div class="ck-pay-opt-t">Pagar con tarjeta</div>
                <div class="ck-pay-opt-s">Visa · Mastercard · Amex</div>
              </div>
              <div class="ck-pay-opt" id="opt-asesor" onclick="selPago('asesor')">
                <div class="ck-pay-opt-ic">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </div>
                <div class="ck-pay-opt-t">Otros medios de pago</div>
                <div class="ck-pay-opt-s">Habla con un asesor de ventas</div>
              </div>
            </div>
            <div class="ck-wu-panel" id="asesor-panel">
              <div class="ck-wu-steps">Al continuar, se abrira WhatsApp con tu asesor para coordinar el pago y el envio de forma personal.</div>
            </div>
          </div>

          <!-- Garantia de devolucion -->
          <div class="ck-guarantee">
            <svg class="ck-guar-ic" width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M9 1.5L2.25 4.5v4.5c0 4.2 2.9 7.35 6.75 8.25C12.85 16.35 15.75 13.2 15.75 9V4.5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
              <path d="M6 9l2.1 2.4 3.9-3.9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <div>
              <div class="ck-guar-t">Garantia de devolucion de 30 dias</div>
              <div class="ck-guar-s">Si no estas satisfecho, te devolvemos tu dinero. Compra sin riesgo.</div>
            </div>
          </div>

          <!-- Boton principal -->
          <button type="submit" id="co-submit-btn" class="ck-btn" style="margin-top:12px">
            <svg width="15" height="17" viewBox="0 0 15 17" fill="none">
              <rect x="1" y="7.5" width="13" height="9" rx="1.5" fill="currentColor"/>
              <path d="M3.5 7.5V5.5a4 4 0 018 0v2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/>
            </svg>
            Confirmar pedido
          </button>

          <p class="ck-legal">Al comprar aceptas nuestros <a href="/terminos" target="_blank" rel="noopener">Terminos y Condiciones</a> y la <a href="/terminos#no-devoluciones" target="_blank" rel="noopener">Politica de No Devoluciones</a> (productos digitales de descarga inmediata).</p>

          <!-- Linea SSL bajo el boton -->
          <div class="ck-ssl-line">
            <svg width="12" height="13" viewBox="0 0 12 13" fill="none">
              <rect x=".5" y="5.5" width="11" height="7" rx="1.2" stroke="currentColor" stroke-width="1.2"/>
              <path d="M2.5 5.5V4a3.5 3.5 0 017 0v1.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            </svg>
            Conexion segura SSL &middot; Tus datos estan encriptados y protegidos
          </div>

          <!-- Metodos de pago -->
          <div class="ck-pay-zone">
            <span class="ck-pay-lbl">Pagos procesados de forma segura</span>
            <div class="ck-pay-row">
              <div class="ck-pay-ic">
                <svg width="40" height="13" viewBox="0 0 40 13"><rect width="40" height="13" rx="2" fill="#1a1f71"/><text x="20" y="9.5" font-family="Arial,sans-serif" font-size="7.5" font-weight="bold" font-style="italic" fill="white" text-anchor="middle" letter-spacing="1.2">VISA</text></svg>
              </div>
              <div class="ck-pay-ic" style="padding:2px 4px">
                <svg width="36" height="22" viewBox="0 0 36 22"><circle cx="12.5" cy="11" r="10" fill="#eb001b"/><circle cx="23.5" cy="11" r="10" fill="#f79e1b" opacity=".9"/><path d="M18 2.8a10 10 0 010 16.4 10 10 0 010-16.4z" fill="#ff5f00"/></svg>
              </div>
              <div class="ck-pay-ic">
                <svg width="42" height="13" viewBox="0 0 42 13"><rect width="42" height="13" rx="2" fill="#006fcf"/><text x="21" y="9.5" font-family="Arial,sans-serif" font-size="7" font-weight="bold" fill="white" text-anchor="middle" letter-spacing=".8">AMEX</text></svg>
              </div>
              <div class="ck-pay-ic" style="padding:2px 6px">
                <svg width="46" height="14" viewBox="0 0 46 14"><text x="0" y="10.5" font-family="Arial,sans-serif" font-size="10" font-weight="bold" fill="#003087">Pay</text><text x="21" y="10.5" font-family="Arial,sans-serif" font-size="10" font-weight="bold" fill="#009cde">Pal</text></svg>
              </div>
            </div>
          </div>

          <!-- Prueba social -->
          <div class="ck-social">
            <span class="ck-stars">&#9733;&#9733;&#9733;&#9733;&#9733;</span>
            <span>Mas de 10,000 clientes satisfechos</span>
          </div>
        </form>

        <!-- Opcion asesor por WhatsApp -->
        <div class="ck-asesor-wrap" id="co-asesor-wrap">
          <div class="ck-asesor-divider">o prefiero otra opcion</div>
          <button type="button" id="co-asesor-btn" class="ck-asesor-btn" onclick="abrirAsesorWA()">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.136.561 4.14 1.541 5.873L0 24l6.315-1.518A11.937 11.937 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.788 9.788 0 01-5.028-1.384l-.36-.214-3.732.898.931-3.618-.235-.372A9.784 9.784 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182c5.43 0 9.818 4.388 9.818 9.818 0 5.43-4.388 9.818-9.818 9.818z"/>
            </svg>
            Prefiero hablar con un asesor
          </button>
          <p id="co-asesor-msg" class="ck-asesor-msg"></p>
        </div>

      </div>
    </div>
  </div>

  <!-- Right: order summary -->
  <div class="ck-right">
    <div class="ck-card">
      <div class="ck-card-hd">Resumen del pedido</div>
      <!-- Imagen del producto (full-width) -->
      <div class="ck-prod-img-area" id="co-img-wrap"></div>
      <!-- Info del producto -->
      <div class="ck-prod-info">
        <div class="ck-urgency">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4.5 13.5H11L10 22l9.5-12H13.5z"/></svg>
          Oferta por tiempo limitado
        </div>
        <div class="ck-prod-name" id="co-nombre-prod">Cargando...</div>
        <div class="ck-stock-badge" id="co-stock-badge" style="display:none">
          <span class="ck-stock-dot"></span>
          Stock disponible
        </div>
        <div class="ck-no-precio" id="co-no-precio" style="display:none">Un asesor confirmara el precio final</div>
      </div>
      <div class="ck-tots">
        <div class="ck-trow" id="co-row-subtotal">
          <span>Subtotal</span>
          <span id="co-subtotal-val">—</span>
        </div>
        <div class="ck-trow" id="co-row-envio">
          <span>Envio</span>
          <span class="ck-ship-free">Gratis</span>
        </div>
        <div class="ck-trow ck-trow--total">
          <span>Total</span>
          <span id="co-precio-prod">—</span>
        </div>
      </div>
      <div class="ck-trust">
        <div class="ck-tr">
          <svg class="ck-tr-ic" width="15" height="15" viewBox="0 0 15 15" fill="none">
            <path d="M7.5 1L1.5 4v5c0 2.8 2.5 4.9 6 5.8 3.5-.9 6-3 6-5.8V4z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
            <path d="M5 7.5l2 2 3.5-3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <div><div class="ck-tr-t">Pago SSL seguro</div><div class="ck-tr-s">Datos encriptados</div></div>
        </div>
        <div class="ck-tr">
          <svg class="ck-tr-ic" width="15" height="15" viewBox="0 0 15 15" fill="none">
            <circle cx="7.5" cy="7.5" r="6" stroke="currentColor" stroke-width="1.4"/>
            <path d="M4.5 7.5l2 2 4-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <div><div class="ck-tr-t">Garantia</div><div class="ck-tr-s">Satisfaccion asegurada</div></div>
        </div>
        <div class="ck-tr">
          <svg class="ck-tr-ic" width="15" height="15" viewBox="0 0 15 15" fill="none">
            <rect x="1" y="6" width="13" height="8" rx="1.5" stroke="currentColor" stroke-width="1.4"/>
            <path d="M1 9.5h13M5 6V4a2.5 2.5 0 015 0v2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
          </svg>
          <div><div class="ck-tr-t">Envio rastreado</div><div class="ck-tr-s">Seguimiento incluido</div></div>
        </div>
        <div class="ck-tr">
          <svg class="ck-tr-ic" width="15" height="15" viewBox="0 0 15 15" fill="none">
            <path d="M13 10.2c0 .45-.15.88-.44 1.22-.29.34-.7.56-1.14.56-1.72 0-3.44-.62-4.86-1.85L5.15 8.6C3.83 7.07 3.2 5.4 3.2 3.68c0-.44.2-.87.54-1.17.34-.3.8-.46 1.27-.44l1.1.07c.77.06 1.45.55 1.72 1.26l.75 1.88c.28.65.1 1.39-.46 1.82l-.76.7c.83 1.2 2.03 2.24 3.38 2.83l.7-.74c.43-.49 1.18-.65 1.82-.4l1.54.62c.71.28 1.19.9 1.26 1.64l.54-.56z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <div><div class="ck-tr-t">Soporte</div><div class="ck-tr-s">Atencion personalizada</div></div>
        </div>
      </div>
    </div>
    <p class="ck-note" style="margin-top:12px">Tus datos estan protegidos. Nunca compartimos tu informacion con terceros.</p>
    <p class="ck-legal" style="margin-top:14px"><a href="/terminos">Terminos</a> · <a href="/privacidad">Privacidad</a></p>
  </div>

</div>

<script>
var _slug = '', _ref = '', _precio = 0, _metodoPago = 'tarjeta';

(function init(){
  var p = new URLSearchParams(window.location.search);
  _slug = p.get('slug') || '';
  _ref  = p.get('ref')  || '';

  var loadEl = document.getElementById('co-loading');
  var mainEl = document.getElementById('co-main');
  loadEl.style.display = 'block';

  if (!_slug) {
    loadEl.innerHTML = '<p style="color:#c0392b">Enlace invalido. Vuelve a la pagina del producto.</p>';
    return;
  }

  fetch('/api/checkout/info?slug=' + encodeURIComponent(_slug))
    .then(function(r){ return r.json(); })
    .then(function(d){
      loadEl.style.display = 'none';
      if (!d.ok) { loadEl.style.display='block'; loadEl.innerHTML='<p style="color:#c0392b">Producto no disponible.</p>'; return; }

      // ── Aplicar color de acento de la página de venta ──
      var accent = (d.color_principal && /^#[0-9a-fA-F]{6}$/.test(d.color_principal)) ? d.color_principal : '#b89368';
      function _h2(n){var h=Math.min(255,Math.max(0,Math.round(n))).toString(16);return h.length<2?'0'+h:h;}
      function _drk(hx,f){return '#'+[1,3,5].map(function(i){return _h2(parseInt(hx.slice(i,i+2),16)*f);}).join('');}
      function _rgba(hx,a){return 'rgba('+parseInt(hx.slice(1,3),16)+','+parseInt(hx.slice(3,5),16)+','+parseInt(hx.slice(5,7),16)+','+a+')';}
      var root = document.documentElement;
      root.style.setProperty('--accent', accent);
      root.style.setProperty('--accent-dk', _drk(accent, 0.84));
      root.style.setProperty('--accent-shadow', _rgba(accent, 0.13));

      _precio = d.precio || 0;
      var nombre = d.nombre_producto || 'Producto';
      document.getElementById('co-nombre-prod').textContent = nombre;

      // Imagen del producto (full-width)
      var iw = document.getElementById('co-img-wrap');
      if (d.imagen) {
        // Usar createElement para evitar XSS si la URL tuviera caracteres especiales
        var _imgEl = document.createElement('img');
        _imgEl.src = d.imagen;
        _imgEl.alt = nombre;
        iw.innerHTML = '';
        iw.appendChild(_imgEl);
      } else {
        iw.innerHTML = '<div class="ck-prod-img-ph"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></div>';
      }

      // Stock badge: siempre visible al cargar
      var stockEl = document.getElementById('co-stock-badge');
      if (stockEl) stockEl.style.display = 'flex';

      // Precio o fallback
      if (_precio > 0) {
        var fmt = '$' + Number(_precio).toLocaleString('en-US');
        document.getElementById('co-precio-prod').textContent = fmt;
        document.getElementById('co-subtotal-val').textContent = fmt;
      } else {
        document.getElementById('co-precio-prod').textContent = 'A confirmar';
        var rowSub = document.getElementById('co-row-subtotal');
        var rowEnv = document.getElementById('co-row-envio');
        if (rowSub) rowSub.style.display = 'none';
        if (rowEnv) rowEnv.style.display = 'none';
        var noPrecioEl = document.getElementById('co-no-precio');
        if (noPrecioEl) noPrecioEl.style.display = 'block';
      }

      mainEl.style.display = 'flex';
    })
    .catch(function(){
      loadEl.style.display='block';
      loadEl.innerHTML='<p style="color:#c0392b">Error al cargar. Intenta de nuevo.</p>';
    });
})();

function selPago(metodo) {
  _metodoPago = metodo;
  document.getElementById('opt-tarjeta').classList.toggle('ck-pay-opt--active', metodo === 'tarjeta');
  document.getElementById('opt-asesor').classList.toggle('ck-pay-opt--active', metodo === 'asesor');
  var asesorPanel = document.getElementById('asesor-panel');
  if (asesorPanel) asesorPanel.classList.toggle('visible', metodo === 'asesor');
}

function coSubmit(e){
  e.preventDefault();
  var errEl = document.getElementById('co-error');
  var btnEl = document.getElementById('co-submit-btn');
  errEl.style.display = 'none';

  var nombre   = (document.getElementById('co-nombre').value   || '').trim();
  var email    = (document.getElementById('co-email').value    || '').trim();
  var telefono = (document.getElementById('co-telefono').value || '').trim();
  var dir      = (document.getElementById('co-direccion').value|| '').trim();
  var ciudad   = (document.getElementById('co-ciudad').value   || '').trim();
  var estado   = (document.getElementById('co-estado').value   || '').trim();
  var zip      = (document.getElementById('co-zip').value      || '').trim();
  var pais     = (document.getElementById('co-pais').value     || '').trim() || 'Estados Unidos';

  if (_metodoPago === 'asesor') {
    if (!nombre || !telefono) {
      errEl.textContent = 'Por favor ingresa tu nombre y telefono para contactar al asesor.';
      errEl.style.display = 'block';
      errEl.scrollIntoView({behavior:'smooth',block:'nearest'});
      return;
    }
    abrirAsesorWA();
    return;
  }

  if (!nombre || !email || !telefono || !dir || !ciudad) {
    errEl.textContent = 'Por favor completa todos los campos obligatorios (*)';
    errEl.style.display = 'block';
    errEl.scrollIntoView({behavior:'smooth',block:'nearest'});
    return;
  }

  btnEl.disabled = true;
  btnEl.textContent = 'Enviando...';

  fetch('/api/pedidos/crear', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      slug: _slug, ref: _ref, precio: _precio,
      nombre: nombre, email: email, telefono: telefono,
      direccion: dir, ciudad: ciudad, estado_region: estado,
      zip: zip, pais: pais,
      metodo_pago: _metodoPago
    })
  })
    .then(function(r){ return r.json(); })
    .then(function(d){
      if (!d.ok) throw new Error(d.error || 'Error al registrar pedido.');
      document.getElementById('co-main').style.display = 'none';
      document.getElementById('co-confirm-nombre').textContent = nombre;
      var msgEl  = document.getElementById('co-confirm-msg');
      var boxEl  = document.getElementById('co-confirm-box');
      if (msgEl) msgEl.innerHTML = 'Recibimos tu pedido.<br>Te contactaremos para coordinar el pago y el envio.';
      if (boxEl) boxEl.textContent = 'Revisa tu email para la confirmacion. Si tienes dudas, contactanos por WhatsApp.';
      document.getElementById('co-confirm').style.display = 'block';
      window.scrollTo(0,0);
    })
    .catch(function(er){
      errEl.textContent = er.message;
      errEl.style.display = 'block';
      errEl.scrollIntoView({behavior:'smooth',block:'nearest'});
      btnEl.disabled = false;
      btnEl.innerHTML = '<svg width="15" height="17" viewBox="0 0 15 17" fill="none"><rect x="1" y="7.5" width="13" height="9" rx="1.5" fill="currentColor"/><path d="M3.5 7.5V5.5a4 4 0 018 0v2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg> Confirmar pedido';
    });
}

function abrirAsesorWA() {
  var errEl = document.getElementById('co-error');
  var msg = document.getElementById('co-asesor-msg');
  var btn = document.getElementById('co-asesor-btn');

  if (!_ref) {
    var noRefMsg = 'No hay codigo de vendedor en este enlace.';
    if (errEl) { errEl.textContent = noRefMsg; errEl.style.display = 'block'; errEl.scrollIntoView({behavior:'smooth',block:'nearest'}); }
    if (msg) { msg.style.color = 'var(--err)'; msg.textContent = noRefMsg; }
    return;
  }

  if (btn) btn.disabled = true;
  if (msg) { msg.style.color = 'var(--txt-lt)'; msg.textContent = 'Conectando con tu asesor...'; }

  fetch('/api/checkout/asesor?slug=' + encodeURIComponent(_slug) + '&ref=' + encodeURIComponent(_ref))
    .then(function(r){ return r.json(); })
    .then(function(d){
      if (btn) btn.disabled = false;
      if (msg) msg.textContent = '';
      if (!d.ok || !d.whatsapp) {
        var errMsg = d.error || 'Este asesor aun no tiene WhatsApp configurado.';
        if (errEl) { errEl.textContent = errMsg; errEl.style.display = 'block'; errEl.scrollIntoView({behavior:'smooth',block:'nearest'}); }
        if (msg) { msg.style.color = 'var(--err)'; msg.textContent = errMsg; }
        return;
      }
      var numero = d.whatsapp.replace(/[^0-9]/g, '');
      var producto = d.nombre_producto || 'el producto';
      var texto = 'Hola, estoy interesado en ' + producto + '. (Ref: ' + _ref + ')';
      window.open('https://wa.me/' + numero + '?text=' + encodeURIComponent(texto), '_blank', 'noopener,noreferrer');
    })
    .catch(function(){
      if (btn) btn.disabled = false;
      var errMsg = 'Error al conectar. Intenta de nuevo.';
      if (errEl) { errEl.textContent = errMsg; errEl.style.display = 'block'; errEl.scrollIntoView({behavior:'smooth',block:'nearest'}); }
      if (msg) { msg.style.color = 'var(--err)'; msg.textContent = errMsg; }
    });
}
</script>
</body>
</html>`);
});

// ── Stripe Checkout — crear sesion de pago ────────────────────────────────────
app.post('/api/checkout/crear-sesion', compraRateLimiter, async (req, res) => {
  const stripe = _getStripe();
  if (!stripe) {
    console.error('[checkout/crear-sesion] STRIPE_SECRET_KEY no configurada');
    return res.status(503).json({ ok: false, error: 'Pagos no disponibles en este momento.' });
  }

  const { slug_pagina, ref, email } = req.body || {};
  const slug = String(slug_pagina || '').trim();
  if (!slug) {
    return res.status(400).json({ ok: false, error: 'Se requiere slug_pagina.' });
  }
  if (!_isMiniappCheckoutSlug(slug)) {
    return res.status(400).json({ ok: false, error: 'Este checkout es solo para activos digitales (slug app-*).' });
  }

  try {
    const miniapp = await _buscarMiniappPorPaginaSlug(slug);
    if (!miniapp) {
      return res.status(404).json({ ok: false, error: 'Producto no encontrado.' });
    }
    if (miniapp.estado_aprobacion !== 'aprobada') {
      return res.status(400).json({ ok: false, error: 'Producto no disponible.' });
    }
    const disp = await _validarMiniappDisponibleCompra(miniapp);
    if (!disp.ok) {
      return res.status(400).json({ ok: false, error: disp.error });
    }

    let emailOpcional = null;
    try {
      emailOpcional = _emailCompradorOpcional(email);
    } catch (e) {
      if (e.statusCode === 400) {
        return res.status(400).json({ ok: false, error: e.message });
      }
      throw e;
    }

    const monto = _miniappPrecioVenta(miniapp);
    const amountCents = Math.round(monto * 100);
    if (!Number.isFinite(amountCents) || amountCents < 50) {
      return res.status(400).json({ ok: false, error: 'Precio del producto no valido para pago con tarjeta.' });
    }

    const result = await _registrarCompraDigital({
      miniapp,
      ref,
      email: emailOpcional,
      estado_pago: 'pendiente'
    });

    const codigo = result.codigo;
    const refQ   = ref ? '?ref=' + encodeURIComponent(String(ref).trim()) : '';
    const cancelUrl = PUBLIC_BASE_URL + '/p/' + encodeURIComponent(slug) + refQ;
    const successUrl = PUBLIC_BASE_URL + '/mi-compra/' + encodeURIComponent(codigo);

    const sessionParams = {
      mode: 'payment',
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: amountCents,
          product_data: {
            name: String(miniapp.nombre || 'Producto digital').slice(0, 120)
          }
        }
      }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        codigo:        codigo,
        miniapp_id:    String(miniapp.id),
        slug_pagina:   slug,
        ref:           String(ref || '').trim().slice(0, 120)
      }
    };
    if (emailOpcional) {
      sessionParams.customer_email = emailOpcional;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    const { error: upErr } = await supabase
      .from('miniapp_compras')
      .update({ stripe_session_id: String(session.id).slice(0, 255) })
      .eq('codigo_acceso', codigo)
      .eq('estado_pago', 'pendiente');

    if (upErr) {
      console.error('[checkout/crear-sesion] No se pudo guardar stripe_session_id codigo=' + codigo + ':', upErr.message);
      return res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
    }

    if (!session.url) {
      console.error('[checkout/crear-sesion] Stripe no devolvio session.url codigo=' + codigo);
      return res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
    }

    console.log('[checkout/crear-sesion] slug=' + slug + ' codigo=' + codigo + ' session=' + session.id + ' monto=' + monto);
    res.json({ ok: true, url: session.url });
  } catch (e) {
    if (e.statusCode === 403) {
      return res.status(403).json({ ok: false, error: e.message });
    }
    if (e.statusCode === 400 || e.statusCode === 404) {
      return res.status(e.statusCode).json({ ok: false, error: e.message });
    }
    console.error('[checkout/crear-sesion]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// ── Compra de prueba mini apps (sin Stripe) ───────────────────────────────────
app.post('/api/miniapp/comprar-prueba', compraRateLimiter, async (req, res) => {
  if (!COMPRA_PRUEBA_ACTIVA) {
    return res.status(403).json({ ok: false, error: 'Funcion no disponible' });
  }

  const { slug_pagina, ref, comprador_email, email } = req.body || {};
  const slug = String(slug_pagina || '').trim();
  if (!slug) {
    return res.status(400).json({ ok: false, error: 'Se requiere slug_pagina.' });
  }
  if (!_isMiniappCheckoutSlug(slug)) {
    return res.status(400).json({ ok: false, error: 'Este checkout es solo para mini apps (slug app-*).' });
  }

  try {
    const miniapp = await _buscarMiniappPorPaginaSlug(slug);
    if (!miniapp) {
      return res.status(404).json({ ok: false, error: 'Mini app no encontrada.' });
    }
    if (miniapp.estado_aprobacion !== 'aprobada') {
      return res.status(400).json({ ok: false, error: 'Producto no disponible.' });
    }
    const disp = await _validarMiniappDisponibleCompra(miniapp);
    if (!disp.ok) {
      return res.status(400).json({ ok: false, error: disp.error });
    }

    let emailOpcional = null;
    try {
      emailOpcional = _emailCompradorOpcional(email || comprador_email);
    } catch (e) {
      if (e.statusCode === 400) {
        return res.status(400).json({ ok: false, error: e.message });
      }
      throw e;
    }

    const result = await _registrarCompraDigital({
      miniapp,
      ref,
      email: emailOpcional,
      estado_pago: 'pagado'
    });

    console.log('[miniapp/comprar-prueba] slug=' + slug + ' codigo=' + result.codigo + ' monto=' + result.compra.monto);
    res.json({ ok: true, codigo: result.codigo, link_unico: result.link_unico });
  } catch (e) {
    if (e.statusCode === 403) {
      return res.status(403).json({ ok: false, error: e.message });
    }
    if (e.statusCode === 400 || e.statusCode === 404) {
      return res.status(e.statusCode).json({ ok: false, error: e.message });
    }
    console.error('[miniapp/comprar-prueba]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// ── Recuperar compra (codigo de acceso → pagina de entrega) ───────────────────
function _serveRecuperarCompra(req, res) {
  const c1 = DEFAULT_MINIAPP_COLORS.color_1;
  const c2 = DEFAULT_MINIAPP_COLORS.color_2;
  const c3 = DEFAULT_MINIAPP_COLORS.color_3;
  _setNoCacheHtml(res);
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Recupera tu compra · EcommerceAgents</title>
<style>
:root{--c1:${c1};--c2:${c2};--c3:${c3};--grad:linear-gradient(120deg,var(--c1),var(--c2),var(--c3));--ink:#0d1117;--slate:#5f6571;--line:#e4e7eb;--paper:#f5f7fb;--white:#fff;--err:#c0392b}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;background:radial-gradient(800px 400px at 50% -5%,rgba(124,58,237,.10),transparent 60%),var(--paper);color:var(--ink);min-height:100vh;display:flex;align-items:flex-start;justify-content:center;padding:40px 20px}
.card{background:var(--white);border:1px solid var(--line);border-radius:20px;box-shadow:0 20px 60px rgba(13,17,23,.12);width:100%;max-width:480px;overflow:hidden}
.top{background:var(--grad);color:#fff;padding:36px 28px 28px;text-align:center}
.brand-logo{width:80px;height:80px;border-radius:50%;object-fit:cover;display:block;margin:0 auto 16px;border:3px solid rgba(255,255,255,.55);box-shadow:0 6px 20px rgba(0,0,0,.18)}
.top h1{font-size:26px;font-weight:800;margin-bottom:8px}
.top p{font-size:15px;opacity:.92;line-height:1.5}
.body{padding:28px}
.field{margin-bottom:18px}
.field label{display:block;font-size:13px;font-weight:600;color:var(--ink);margin-bottom:8px}
.field input{width:100%;border:1.5px solid var(--line);border-radius:12px;padding:14px 16px;font-size:16px;font-family:ui-monospace,Consolas,monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--ink);background:#fff}
.field input:focus{outline:none;border-color:var(--c2);box-shadow:0 0 0 3px rgba(124,58,237,.12)}
.field input::placeholder{text-transform:none;letter-spacing:normal;font-family:inherit;font-size:15px;color:#8b919e}
.btn{width:100%;border:none;border-radius:12px;padding:16px 20px;font-size:17px;font-weight:800;color:#fff;background:var(--grad);cursor:pointer;box-shadow:0 12px 32px rgba(124,58,237,.28)}
.btn:hover{filter:brightness(1.04)}
.note{margin-top:16px;font-size:13px;color:var(--slate);text-align:center;line-height:1.55}
.err{display:none;color:var(--err);font-size:13px;margin-bottom:12px;padding:10px 12px;background:#fef5f5;border:1px solid #f5c6c6;border-radius:10px}
</style>
</head>
<body>
<div class="card">
  <div class="top">
    <img src="${_assetUrl('/assets/logo-activos.jpg')}" alt="Activos Digitales" class="brand-logo" />
    <h1>Recupera tu compra</h1>
    <p>Ingresa el codigo de acceso que recibiste al comprar para volver a tu producto.</p>
  </div>
  <div class="body">
    <p id="err" class="err">Ingresa tu codigo de acceso.</p>
    <div class="field">
      <label for="codigo-acceso">Codigo de acceso</label>
      <input type="text" id="codigo-acceso" autocomplete="off" spellcheck="false" placeholder="Ej. NYRKHYXZS5A4SS" maxlength="20" />
    </div>
    <button type="button" id="btn-acceder" class="btn">Acceder</button>
    <p class="note">Lo encuentras en tu pagina de entrega despues de comprar. Si el codigo no es valido, veras un mensaje de acceso no valido.</p>
  </div>
</div>
<script>
function irAcceder(){
  var err=document.getElementById('err');
  var raw=document.getElementById('codigo-acceso').value||'';
  var cod=raw.trim().toUpperCase().replace(/\\s+/g,'');
  err.style.display='none';
  if(!cod){
    err.textContent='Ingresa tu codigo de acceso.';
    err.style.display='block';
    document.getElementById('codigo-acceso').focus();
    return;
  }
  location.href='/mi-compra/'+encodeURIComponent(cod);
}
document.getElementById('btn-acceder').addEventListener('click',irAcceder);
document.getElementById('codigo-acceso').addEventListener('keydown',function(e){
  if(e.key==='Enter'){e.preventDefault();irAcceder();}
});
</script>
</body>
</html>`);
}

app.get('/recuperar-compra', _serveRecuperarCompra);

// ── Pagina de entrega post-compra (ver pagina NO consume cuota) ───────────────
app.get('/mi-compra/:codigo', _entregaCodigoGate, async (req, res) => {
  const codigo = String(req.params.codigo || '').trim();

  try {
    const validacion = await _entregaValidarCompra(codigo);
    if (!validacion.ok) {
      return _denegarEntregaHtml(res, validacion.reason);
    }
    const compra = validacion.compra;

    const { data: miniapp, error: mErr } = await supabase
      .from('miniapps')
      .select('id, nombre, slug, pdf_key, pack_key, categoria, tipo_producto, pagina_venta_slug')
      .eq('id', compra.miniapp_id)
      .maybeSingle();
    if (mErr || !miniapp) {
      return _denegarEntregaHtml(res, 'invalid', 403);
    }

    if (!fs.existsSync(ENTREGA_MINIAPP_TEMPLATE)) {
      return res.status(500).send('Template de entrega no configurado.');
    }

    const { data: pagina } = await supabase
      .from('paginas_venta')
      .select('html')
      .eq('slug', miniapp.pagina_venta_slug || ('app-' + miniapp.slug))
      .maybeSingle();
    const colores = _extractMiniappColors(pagina && pagina.html);

    const categoria = String(miniapp.categoria || 'miniapp').toLowerCase();
    const esMiniapp = categoria === 'miniapp';
    const esInfoproducto = categoria === 'infoproducto';
    const esContenido = categoria === 'contenido_digital';
    const tienePdf = !!miniapp.pdf_key;

    let videos = [];
    if (esContenido) {
      const { data: vids, error: vErr } = await supabase
        .from('miniapp_videos')
        .select('id, nombre, orden')
        .eq('miniapp_id', miniapp.id)
        .order('orden', { ascending: true });
      if (vErr) throw vErr;
      videos = vids || [];
    }
    const tieneVideos = videos.length > 0;
    const tienePack = !!miniapp.pack_key;

    const linkUnico = PUBLIC_BASE_URL + '/mi-compra/' + compra.codigo_acceso;
    const appUrl    = PUBLIC_BASE_URL + '/usar-miniapp/' + compra.codigo_acceso;
    const pdfUrl    = tienePdf
      ? PUBLIC_BASE_URL + '/descargar-pdf/' + compra.codigo_acceso
      : '';
    const packUrl   = tienePack
      ? PUBLIC_BASE_URL + '/descargar-pack/' + compra.codigo_acceso
      : '';
    let descargasVideoMap = {};
    if (esContenido && videos.length) {
      const videoIds = videos.map(function (v) { return v.id; });
      const map = await _cargarDescargasVideoRestantesMap(compra.id, videoIds);
      if (map) {
        descargasVideoMap = map;
      } else {
        videoIds.forEach(function (id) { descargasVideoMap[String(id)] = 0; });
      }
    }
    const videosHtml = _buildVideosEntregaHtml(videos, compra.codigo_acceso, descargasVideoMap);

    let productoEtiqueta = 'Tu producto';
    let pdfTitulo = 'Descarga tu PDF';
    let pdfDesc = 'Tu producto incluye un PDF premium. Descargalo y guardalo.';
    let pdfBtn = 'Descargar PDF →';

    if (esInfoproducto) {
      productoEtiqueta = 'Tu infoproducto';
      pdfTitulo = 'Descarga tu infoproducto';
      pdfDesc = 'Tu PDF esta listo. Descargalo y guardalo en un lugar seguro.';
      pdfBtn = 'Descargar PDF →';
    } else if (esContenido) {
      productoEtiqueta = 'Tu contenido digital';
    }

    let html = fs.readFileSync(ENTREGA_MINIAPP_TEMPLATE, 'utf-8');
    html = _processTemplateBlock(html, 'MINIAPP', esMiniapp);
    html = _processTemplateBlock(html, 'PDF', tienePdf && (esMiniapp || esInfoproducto));
    html = _processTemplateBlock(html, 'VIDEOS', esContenido && tieneVideos);
    html = _processTemplateBlock(html, 'PACK', esContenido && !tieneVideos && tienePack);
    html = _processTemplateBlock(html, 'CONTENIDO_PENDIENTE', esContenido && !tieneVideos && !tienePack);
    html = _replaceTemplateMarkers(html, {
      NOMBRE:            miniapp.nombre,
      CODIGO:            compra.codigo_acceso,
      LINK_UNICO:        linkUnico,
      APP_URL:           appUrl,
      PDF_URL:           pdfUrl,
      PACK_URL:          packUrl,
      VIDEOS_HTML:       videosHtml,
      PRODUCTO_ETIQUETA: productoEtiqueta,
      PDF_TITULO:        pdfTitulo,
      PDF_DESCRIPCION:   pdfDesc,
      PDF_BTN:           pdfBtn,
      COLOR_1:           colores.color_1,
      COLOR_2:           colores.color_2,
      COLOR_3:           colores.color_3,
      RECUPERAR_URL:     PUBLIC_BASE_URL + '/recuperar-compra',
      LOGO_URL:          _assetUrl('/assets/logo-activos.jpg')
    });

    _setNoCacheHtml(res);
    res.send(html);
  } catch (e) {
    console.error('[mi-compra]', e.message);
    _setNoCacheHtml(res);
    res.status(500).send(_htmlAccesoInvalido('Acceso no valido', ENTREGA_MSG_INVALIDO));
  }
});

// ── Servir mini app al comprador (protegido por codigo + cuota) ───────────────

async function _validarAccesoMiniappCompra(codigo) {
  const validacion = await _entregaValidarCompra(codigo);
  if (!validacion.ok) return { ok: false, reason: validacion.reason };
  const compra = validacion.compra;

  const { data: miniapp, error: mErr } = await supabase
    .from('miniapps')
    .select('r2_key, nombre, categoria')
    .eq('id', compra.miniapp_id)
    .maybeSingle();
  if (mErr || !miniapp || !miniapp.r2_key) {
    return { ok: false, reason: 'invalid', status: 403 };
  }
  if (String(miniapp.categoria || 'miniapp').toLowerCase() !== 'miniapp') {
    return { ok: false, reason: 'invalid', status: 403 };
  }
  return { ok: true, compra, miniapp };
}

// Contenido HTML dentro de sandbox (consume cuota)
app.get('/usar-miniapp/:codigo/app', _entregaCodigoGate, async (req, res) => {
  const codigo = String(req.params.codigo || '').trim();

  try {
    const acc = await _validarAccesoMiniappCompra(codigo);
    if (!acc.ok) return _denegarEntregaTexto(res, acc.reason, acc.status);

    const cuota = await _consumirCuotaDescarga(acc.compra, 'miniapp', req);
    if (!cuota.ok) return _denegarEntregaTexto(res, cuota.reason);

    let contenido = await obtenerArchivo(acc.miniapp.r2_key);
    contenido = miniappSeg.sanitizeMiniappHtml(contenido);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Security-Policy', miniappSeg.MINIAPP_CSP);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.send(contenido);
  } catch (e) {
    console.error('[usar-miniapp/app]', e.message);
    res.status(500).send(ENTREGA_MSG_INVALIDO);
  }
});

// Pagina contenedora con iframe sandbox (no consume cuota; la cuota se consume en /app)
app.get('/usar-miniapp/:codigo', _entregaCodigoGate, async (req, res) => {
  const codigo = String(req.params.codigo || '').trim();

  try {
    const acc = await _validarAccesoMiniappCompra(codigo);
    if (!acc.ok) return _denegarEntregaTexto(res, acc.reason, acc.status);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.send(miniappSeg.htmlContenedorSandbox(codigo, acc.miniapp.nombre || 'Mini app'));
  } catch (e) {
    console.error('[usar-miniapp]', e.message);
    res.status(500).send(ENTREGA_MSG_INVALIDO);
  }
});

// ── Descargar PDF del comprador (protegido por codigo + cuota) ────────────────
app.get('/descargar-pdf/:codigo', _entregaCodigoGate, async (req, res) => {
  const codigo = String(req.params.codigo || '').trim();

  try {
    const validacion = await _entregaValidarCompra(codigo);
    if (!validacion.ok) return _denegarEntregaTexto(res, validacion.reason);
    const compra = validacion.compra;

    const { data: miniapp, error: mErr } = await supabase
      .from('miniapps')
      .select('pdf_key, nombre, slug')
      .eq('id', compra.miniapp_id)
      .maybeSingle();
    if (mErr || !miniapp || !miniapp.pdf_key) {
      return _denegarEntregaTexto(res, 'invalid', 403);
    }

    const cuota = await _consumirCuotaDescarga(compra, 'pdf', req);
    if (!cuota.ok) return _denegarEntregaTexto(res, cuota.reason);

    const filename = (miniapp.slug || 'producto') + '.pdf';
    await _redirectPresignedR2(res, miniapp.pdf_key, {
      contentDisposition: _r2ContentDisposition(filename, false),
      contentType: 'application/pdf'
    });
  } catch (e) {
    console.error('[descargar-pdf]', e.message);
    res.status(500).send(ENTREGA_MSG_INVALIDO);
  }
});

// ── Descargar pack ZIP del comprador (legacy, protegido) ──────────────────────
app.get('/descargar-pack/:codigo', _entregaCodigoGate, async (req, res) => {
  const codigo = String(req.params.codigo || '').trim();

  try {
    const validacion = await _entregaValidarCompra(codigo);
    if (!validacion.ok) return _denegarEntregaTexto(res, validacion.reason);
    const compra = validacion.compra;

    const { data: miniapp, error: mErr } = await supabase
      .from('miniapps')
      .select('pack_key, nombre, slug, categoria')
      .eq('id', compra.miniapp_id)
      .maybeSingle();
    if (mErr || !miniapp || !miniapp.pack_key) {
      return _denegarEntregaTexto(res, 'invalid', 403);
    }

    const cuota = await _consumirCuotaDescarga(compra, 'pack', req);
    if (!cuota.ok) return _denegarEntregaTexto(res, cuota.reason);

    const buf = await obtenerArchivoBuffer(miniapp.pack_key);
    const filename = (miniapp.slug || 'contenido') + '.zip';
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(buf);
  } catch (e) {
    console.error('[descargar-pack]', e.message);
    res.status(500).send(ENTREGA_MSG_INVALIDO);
  }
});

// ── Ver / descargar video individual (R2 presigned — sin cola en VPS) ─────────
app.get('/descargar-video/:codigo/:video_id', _entregaCodigoGate, async (req, res) => {
  const codigo  = String(req.params.codigo || '').trim();
  const videoId = String(req.params.video_id || '').trim();

  try {
    const acc = await _videoEntregaValidarAcceso(codigo, videoId);
    if (!acc.ok) return _denegarEntregaTexto(res, acc.reason);
    const compra = acc.compra;
    const video  = acc.video;

    const asDownload = req.query.download === '1' || req.query.download === 'true';

    if (asDownload) {
      const limite = await _verificarLimiteDescargaVideo(compra.id, videoId);
      if (!limite.ok) {
        if (limite.failClosed) return res.status(503).send(ENTREGA_MSG_INVALIDO);
        return _denegarVideoDescarga(res, limite.message);
      }
      const consumo = await _incrementarDescargaVideo(compra, videoId, req);
      if (!consumo.ok) {
        if (consumo.failClosed) return res.status(503).send(ENTREGA_MSG_INVALIDO);
        return _denegarVideoDescarga(res, consumo.message);
      }
    }

    const ext = path.extname(video.video_key).toLowerCase();
    const mime = _mimeVideoExt(ext.replace('.', ''));
    const safeName = String(video.nombre || 'video').replace(/[^\w\s.-]/g, '_').trim() || 'video';
    const filename = safeName + (ext || '.mp4');

    await _redirectPresignedR2(res, video.video_key, {
      contentDisposition: _r2ContentDisposition(filename, !asDownload),
      contentType: mime
    });
  } catch (e) {
    console.error('[descargar-video]', e.message);
    if (!res.headersSent) res.status(500).send(ENTREGA_MSG_INVALIDO);
  }
});

// ── Crear pedido ──────────────────────────────────────────────────────────────
app.post('/api/pedidos/crear', compraRateLimiter, async (req, res) => {
  // 'precio' del cliente se IGNORA completamente — el monto siempre se obtiene de Supabase
  const { slug, ref, nombre, email, telefono, direccion, ciudad, estado_region, zip, pais,
          metodo_pago, comprobante_pago } = req.body || {};
  if (!nombre || !email || !telefono || !direccion || !ciudad) {
    return res.status(400).json({ ok: false, error: 'Faltan campos obligatorios.' });
  }
  try {
    // Buscar página y producto — precio y utilidad SIEMPRE desde Supabase, nunca del cliente
    let producto_id    = null;
    let nombre_producto = slug || 'Producto';
    let monto          = null; // se asigna SOLO desde la base de datos

    const { data: pagina } = await supabase
      .from('paginas_venta').select('id, nombre, producto_id').eq('slug', slug).single();
    if (pagina) {
      nombre_producto = pagina.nombre;
      if (pagina.producto_id) {
        producto_id = pagina.producto_id;
        const { data: prod } = await supabase
          .from('productos').select('nombre, precio, utilidad').eq('id', pagina.producto_id).single();
        if (prod) {
          nombre_producto = prod.nombre;
          monto           = prod.precio ?? null;  // precio real, ignoramos cualquier valor del cliente
        }
      }
    }

    // Si no se encontró el precio real del producto, rechazar el pedido sin crearlo
    if (monto === null || monto === undefined) {
      console.warn('[pedidos/crear] Precio no determinado para slug:', slug);
      return res.status(400).json({ ok: false, error: 'No se pudo determinar el precio del producto.' });
    }

    // Buscar vendedor por código (ref)
    let vendedor_id = null;
    if (ref) {
      const { data: vend } = await supabase
        .from('usuarios').select('id').eq('codigo', ref).single();
      if (vend) vendedor_id = vend.id;
    }

    // TODO: aqui ira el pago con Stripe antes de confirmar el pedido

    const pedido = {
      producto_id,
      vendedor_id,
      pagina_slug:      slug || null,
      ref_vendedor:     ref || null,
      nombre_producto,
      cliente_nombre:   nombre,
      cliente_email:    email,
      cliente_telefono: telefono,
      direccion,
      ciudad,
      estado_region:    estado_region || null,
      zip:              zip || null,
      pais:             pais || 'Estados Unidos',
      monto,
      estado:           'Pendiente',
      estado_pago:      'pendiente',                          // siempre pendiente al crear
      metodo_pago:      metodo_pago || 'tarjeta',
      comprobante_pago: comprobante_pago || null,
      fecha:            new Date().toISOString()
    };

    console.log('[pedidos/crear] Registrando pedido:', nombre_producto, '- Cliente:', nombre);
    const { data: pedidoData, error } = await supabase.from('pedidos').insert(pedido).select('id').single();
    if (error) throw error;
    console.log('[pedidos/crear] OK — id:', pedidoData?.id);

    res.json({ ok: true, pedido_id: pedidoData?.id });
  } catch (e) {
    console.error('[pedidos/crear] ERROR:', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// ── Admin: Pedidos ────────────────────────────────────────────────────────────

// GET /api/admin/pedidos  — lista todos los pedidos ordenados por fecha desc
app.get('/api/admin/pedidos', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('pedidos')
      .select('id, nombre_producto, cliente_nombre, cliente_email, cliente_telefono, direccion, ciudad, estado_region, zip, pais, monto, estado, estado_pago, metodo_pago, origen, ref_vendedor, vendedor_id, fecha, pagina_slug')
      .order('fecha', { ascending: false });
    if (error) throw error;
    res.json({ ok: true, pedidos: data || [] });
  } catch (e) {
    console.error('[admin/pedidos GET]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// POST /api/admin/pedidos/actualizar  — cambia el estado de un pedido
app.post('/api/admin/pedidos/actualizar', async (req, res) => {
  const { id, estado } = req.body || {};
  if (!id || !estado) return res.status(400).json({ ok: false, error: 'Se requiere id y estado.' });
  const estadosValidos = ['Pendiente', 'Procesado', 'Enviado', 'Cancelado'];
  if (!estadosValidos.includes(estado)) return res.status(400).json({ ok: false, error: 'Estado invalido.' });
  try {
    const { error } = await supabase.from('pedidos').update({ estado }).eq('id', id);
    if (error) throw error;
    console.log(`[admin/pedidos/actualizar] id=${id} → estado=${estado}`);
    res.json({ ok: true });
  } catch (e) {
    console.error('[admin/pedidos/actualizar]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// ── Ventas por usuario (vendedor) ─────────────────────────────────────────────
// POST /api/admin/pedidos/manual  — registra una venta hecha fuera de la plataforma
// El admin confirma que el pago ya fue cobrado; queda estado_pago='pagado' y suma a comisiones.
app.post('/api/admin/pedidos/manual', async (req, res) => {
  const {
    codigo_vendedor,
    producto_id,
    nombre_producto: nombre_prod_manual,
    precio,
    cliente_nombre,
    cliente_telefono,
    direccion, ciudad, estado_region, zip, pais,
    metodo_pago,
    comprobante
  } = req.body || {};

  if (!codigo_vendedor || !cliente_nombre || !cliente_telefono) {
    return res.status(400).json({ ok: false, error: 'Campos obligatorios: codigo_vendedor, cliente_nombre, cliente_telefono.' });
  }

  try {
    // 1. Buscar vendedor por código
    const { data: vend, error: vErr } = await supabase
      .from('usuarios')
      .select('id, nombre')
      .eq('codigo', String(codigo_vendedor).trim().toUpperCase())
      .maybeSingle();
    if (vErr) throw vErr;
    if (!vend) return res.status(404).json({ ok: false, error: 'Vendedor no encontrado. Verifica el código.' });

    // 2. Resolver producto y precio
    let prod_id         = null;
    let nombre_producto = nombre_prod_manual || 'Venta manual';
    let monto           = precio ? Number(precio) : null;

    if (producto_id) {
      const { data: prod } = await supabase
        .from('productos')
        .select('id, nombre, precio')
        .eq('id', producto_id)
        .maybeSingle();
      if (prod) {
        prod_id         = prod.id;
        nombre_producto = prod.nombre;
        if (!monto || monto <= 0) monto = prod.precio;
      }
    }

    if (!monto || monto <= 0) {
      return res.status(400).json({ ok: false, error: 'El precio es obligatorio y debe ser mayor a 0.' });
    }

    // 3. Insertar pedido como venta confirmada (estado_pago='pagado', origen='manual')
    const pedido = {
      producto_id:      prod_id || null,
      vendedor_id:      vend.id,
      ref_vendedor:     String(codigo_vendedor).trim().toUpperCase(),
      pagina_slug:      null,
      nombre_producto,
      cliente_nombre,
      cliente_email:    null,
      cliente_telefono,
      direccion:        direccion   || null,
      ciudad:           ciudad      || null,
      estado_region:    estado_region || null,
      zip:              zip         || null,
      pais:             pais        || 'Colombia',
      monto,
      estado:           'Procesado',
      estado_pago:      'pagado',
      metodo_pago:      metodo_pago || 'efectivo',
      comprobante_pago: comprobante || null,
      origen:           'manual',
      fecha:            new Date().toISOString()
    };

    const { data: pd, error: pErr } = await supabase
      .from('pedidos').insert(pedido).select().single();
    if (pErr) throw pErr;

    console.log(`[admin/pedidos/manual] ${nombre_producto} | vendedor=${codigo_vendedor} | monto=${monto}`);
    res.json({ ok: true, pedido: pd });
  } catch (e) {
    console.error('[admin/pedidos/manual]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// ── Admin: Mini Apps (aprobacion) ─────────────────────────────────────────────

const MINIAPP_APROB_ESTADOS = ['pendiente', 'aprobada', 'rechazada'];
const MINIAPP_CATEGORIAS = ['infoproducto', 'contenido_digital', 'miniapp'];

// GET /api/admin/miniapps  — lista con datos del creador (?estado= & ?categoria=)
app.get('/api/admin/miniapps', async (req, res) => {
  try {
    let query = supabase
      .from('miniapps')
      .select(`
        id, nombre, slug, descripcion, precio, precio_promocion, tipo_producto, categoria,
        usa_ia, disponible_vendedores, comision_vendedor,
        estado_aprobacion, motivo_rechazo, foto1_key, foto2_key, pagina_venta_slug, creado_en,
        requiere_revision_seguridad, escaneo_seguridad,
        creadores ( nombre, email )
      `)
      .order('creado_en', { ascending: false });

    const estado = String(req.query.estado || '').trim().toLowerCase();
    if (estado && MINIAPP_APROB_ESTADOS.includes(estado)) {
      query = query.eq('estado_aprobacion', estado);
    }

    const categoria = String(req.query.categoria || '').trim().toLowerCase();
    if (categoria && MINIAPP_CATEGORIAS.includes(categoria)) {
      query = query.eq('categoria', categoria);
    }

    const { data, error } = await query;
    if (error && /requiere_revision_seguridad|escaneo_seguridad|column|schema cache/.test(String(error.message || ''))) {
      let q2 = supabase
        .from('miniapps')
        .select(`
          id, nombre, slug, descripcion, precio, precio_promocion, tipo_producto, categoria,
          usa_ia, disponible_vendedores, comision_vendedor,
          estado_aprobacion, motivo_rechazo, foto1_key, foto2_key, pagina_venta_slug, creado_en,
          creadores ( nombre, email )
        `)
        .order('creado_en', { ascending: false });
      if (estado && MINIAPP_APROB_ESTADOS.includes(estado)) q2 = q2.eq('estado_aprobacion', estado);
      if (categoria && MINIAPP_CATEGORIAS.includes(categoria)) q2 = q2.eq('categoria', categoria);
      ({ data, error } = await q2);
    }
    if (error) throw error;

    const miniapps = (data || []).map(function (m) {
      const cr = m.creadores || {};
      return {
        id:                    m.id,
        nombre:                m.nombre,
        slug:                  m.slug,
        descripcion:           m.descripcion,
        precio:                m.precio,
        precio_promocion:      m.precio_promocion,
        tipo_producto:         m.tipo_producto,
        categoria:             m.categoria || 'miniapp',
        usa_ia:                m.usa_ia,
        disponible_vendedores: m.disponible_vendedores,
        comision_vendedor:     m.comision_vendedor,
        estado_aprobacion:     m.estado_aprobacion || 'pendiente',
        motivo_rechazo:        m.motivo_rechazo,
        foto1_url:             _miniappFotoUrl(m.slug, 'foto1'),
        foto2_url:             m.foto2_key ? _miniappFotoUrl(m.slug, 'foto2') : null,
        pagina_venta_slug:     m.pagina_venta_slug || null,
        requiere_revision_seguridad: !!m.requiere_revision_seguridad,
        escaneo_seguridad:     Array.isArray(m.escaneo_seguridad) ? m.escaneo_seguridad : (m.escaneo_seguridad || []),
        creador_nombre:        cr.nombre || '',
        creador_email:         cr.email  || '',
        creado_en:             m.creado_en
      };
    });

    res.json({ ok: true, miniapps });
  } catch (e) {
    console.error('[admin/miniapps GET]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// GET /api/admin/miniapps/cuentas  — resumen de ventas y deuda a creadores
app.get('/api/admin/miniapps/cuentas', async (req, res) => {
  try {
    const { data: miniapps, error: mErr } = await supabase
      .from('miniapps')
      .select('id, creador_id, parte_plataforma, comision_vendedor, creadores ( nombre, email )');
    if (mErr) throw mErr;

    const miniMap = {};
    const byCreador = {};

    (miniapps || []).forEach(function (m) {
      miniMap[m.id] = m;
      if (!byCreador[m.creador_id]) {
        const cr = m.creadores || {};
        byCreador[m.creador_id] = {
          creador_id:     m.creador_id,
          creador_nombre: cr.nombre || '',
          creador_email:  cr.email  || '',
          num_ventas:     0,
          total_generado: 0,
          total_a_pagar:  0
        };
      }
    });

    const miniIds = Object.keys(miniMap);
    if (miniIds.length) {
      const { data: compras, error: cErr } = await supabase
        .from('miniapp_compras')
        .select('miniapp_id, monto, vendedor_id, estado_pago')
        .eq('estado_pago', 'pagado')
        .in('miniapp_id', miniIds);
      if (cErr) throw cErr;

      (compras || []).forEach(function (c) {
        const mini = miniMap[c.miniapp_id];
        if (!mini || !byCreador[mini.creador_id]) return;

        const monto    = Number(c.monto) || 0;
        const platPct  = Number(mini.parte_plataforma) || 10;
        const comPct   = c.vendedor_id ? (Number(mini.comision_vendedor) || 0) : 0;
        const parteVend  = monto * comPct / 100;
        const partePlat  = monto * platPct / 100;
        const parteCreador = monto - parteVend - partePlat;

        const row = byCreador[mini.creador_id];
        row.num_ventas     += 1;
        row.total_generado += monto;
        row.total_a_pagar  += parteCreador;
      });
    }

    const cuentas = Object.values(byCreador)
      .map(function (r) {
        return {
          creador_nombre: r.creador_nombre,
          creador_email:  r.creador_email,
          num_ventas:     r.num_ventas,
          total_generado: Math.round(r.total_generado * 100) / 100,
          total_a_pagar:  Math.round(r.total_a_pagar * 100) / 100
        };
      })
      .sort(function (a, b) { return b.total_a_pagar - a.total_a_pagar; });

    res.json({ ok: true, cuentas });
  } catch (e) {
    console.error('[admin/miniapps/cuentas]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// GET /api/admin/miniapps/comisiones-vendedores — resumen de comisiones a pagar manualmente
app.get('/api/admin/miniapps/comisiones-vendedores', async (req, res) => {
  if (!COMISION_VENDEDORES_DIGITAL_ACTIVA) {
    return res.json({ ok: true, total_general: 0, vendedores: [] });
  }
  try {
    const { data: compras, error: cErr } = await supabase
      .from('miniapp_compras')
      .select('vendedor_id, monto, miniapps ( comision_vendedor )')
      .eq('estado_pago', 'pagado')
      .not('vendedor_id', 'is', null);
    if (cErr) throw cErr;

    const byVendedor = {};
    (compras || []).forEach(function (c) {
      const vid = c.vendedor_id;
      if (!vid) return;
      if (!byVendedor[vid]) {
        byVendedor[vid] = { vendedor_id: vid, num_ventas: 0, total_comision_a_pagar: 0 };
      }
      const mini = c.miniapps || {};
      const monto = Number(c.monto) || 0;
      const comPct = Number(mini.comision_vendedor) || 0;
      byVendedor[vid].num_ventas += 1;
      byVendedor[vid].total_comision_a_pagar += _calcComisionVendedorMiniapp(monto, comPct);
    });

    const vendedorIds = Object.keys(byVendedor);
    const userMap = {};
    if (vendedorIds.length) {
      const { data: usuarios, error: uErr } = await supabase
        .from('usuarios')
        .select('id, nombre, codigo')
        .in('id', vendedorIds);
      if (uErr) throw uErr;
      (usuarios || []).forEach(function (u) { userMap[u.id] = u; });
    }

    let totalGeneral = 0;
    const vendedores = vendedorIds.map(function (vid) {
      const row = byVendedor[vid];
      const u = userMap[vid] || {};
      const total = _roundMoney(row.total_comision_a_pagar);
      totalGeneral += total;
      return {
        vendedor_id:           vid,
        nombre:                u.nombre || 'Vendedor',
        codigo:                u.codigo || '',
        num_ventas:            row.num_ventas,
        total_comision_a_pagar: total
      };
    }).sort(function (a, b) { return b.total_comision_a_pagar - a.total_comision_a_pagar; });

    res.json({
      ok: true,
      total_general: _roundMoney(totalGeneral),
      vendedores
    });
  } catch (e) {
    console.error('[admin/miniapps/comisiones-vendedores]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// GET /api/admin/miniapps/:slug/html  — HTML completo desde R2 para revision
app.get('/api/admin/miniapps/:slug/html', async (req, res) => {
  const slug = String(req.params.slug || '').trim();
  if (!slug) return res.status(400).json({ ok: false, error: 'Slug requerido.' });

  try {
    const { data, error } = await supabase
      .from('miniapps')
      .select('r2_key, nombre')
      .eq('slug', slug)
      .maybeSingle();
    if (error) throw error;
    if (!data || !data.r2_key) {
      return res.status(404).json({ ok: false, error: 'Mini app no encontrada.' });
    }

    const html = await obtenerArchivo(data.r2_key);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) {
    console.error('[admin/miniapps/html]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// POST /api/admin/miniapps/aprobar
app.post('/api/admin/miniapps/aprobar', async (req, res) => {
  const { miniapp_id } = req.body || {};
  if (!miniapp_id) {
    return res.status(400).json({ ok: false, error: 'Se requiere miniapp_id.' });
  }

  try {
    const { data, error } = await supabase
      .from('miniapps')
      .update({
        estado_aprobacion: 'aprobada',
        motivo_rechazo:    null,
        fecha_revision:    new Date().toISOString()
      })
      .eq('id', miniapp_id)
      .select('id, nombre, slug, estado_aprobacion, fecha_revision')
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ ok: false, error: 'Mini app no encontrada.' });

    console.log('[admin/miniapps/aprobar] id=' + miniapp_id);
    res.json({ ok: true, miniapp: data });
  } catch (e) {
    console.error('[admin/miniapps/aprobar]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// POST /api/admin/miniapps/generar-pagina  — Claude vision + Groq + template → paginas_venta
app.post('/api/admin/miniapps/generar-pagina', async (req, res) => {
  const { miniapp_id } = req.body || {};
  if (!miniapp_id) {
    return res.status(400).json({ ok: false, error: 'Se requiere miniapp_id.' });
  }

  try {
    const { data: miniapp, error: mErr } = await supabase
      .from('miniapps')
      .select(`
        id, nombre, slug, descripcion, precio, precio_promocion, tipo_producto, categoria,
        usa_ia, foto1_key, foto2_key, estado_aprobacion, pagina_venta_slug,
        creadores ( nombre )
      `)
      .eq('id', miniapp_id)
      .single();

    if (mErr || !miniapp) {
      return res.status(404).json({ ok: false, error: 'Mini app no encontrada.' });
    }
    if (miniapp.estado_aprobacion !== 'aprobada') {
      return res.status(400).json({ ok: false, error: 'Solo se puede generar pagina para mini apps aprobadas.' });
    }
    if (!miniapp.foto1_key) {
      return res.status(400).json({ ok: false, error: 'La mini app no tiene foto principal.' });
    }

    const cr = miniapp.creadores || {};
    const result = await generarPaginaVentaMiniapp(
      {
        id:                 miniapp.id,
        nombre:             miniapp.nombre,
        slug:               miniapp.slug,
        descripcion:        miniapp.descripcion,
        precio:             miniapp.precio,
        precio_promocion:   miniapp.precio_promocion,
        tipo_producto:      miniapp.tipo_producto,
        categoria:          miniapp.categoria,
        usa_ia:             miniapp.usa_ia,
        foto1_key:          miniapp.foto1_key,
        foto2_key:          miniapp.foto2_key,
        pagina_venta_slug:  miniapp.pagina_venta_slug,
        creador_nombre:     cr.nombre || ''
      },
      {
        supabase,
        publicBaseUrl: PUBLIC_BASE_URL,
        anthropicKey:  process.env.ANTHROPIC_API_KEY,
        groqKey:       process.env.GROQ_API_KEY
      }
    );

    const link = PUBLIC_BASE_URL + '/p/' + result.pagina_slug;
    console.log('[admin/miniapps/generar-pagina] OK miniapp=' + miniapp_id + ' pagina=' + result.pagina_slug);
    res.json({ ok: true, pagina_slug: result.pagina_slug, link: link });
  } catch (e) {
    console.error('[admin/miniapps/generar-pagina]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// POST /api/admin/miniapps/rechazar
app.post('/api/admin/miniapps/rechazar', async (req, res) => {
  const { miniapp_id, motivo } = req.body || {};
  if (!miniapp_id) {
    return res.status(400).json({ ok: false, error: 'Se requiere miniapp_id.' });
  }
  const motivoTrim = String(motivo || '').trim();
  if (!motivoTrim) {
    return res.status(400).json({ ok: false, error: 'El motivo de rechazo es obligatorio.' });
  }

  try {
    const { data, error } = await supabase
      .from('miniapps')
      .update({
        estado_aprobacion: 'rechazada',
        motivo_rechazo:    motivoTrim,
        fecha_revision:    new Date().toISOString()
      })
      .eq('id', miniapp_id)
      .select('id, nombre, slug, estado_aprobacion, motivo_rechazo, fecha_revision')
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ ok: false, error: 'Mini app no encontrada.' });

    console.log('[admin/miniapps/rechazar] id=' + miniapp_id);
    res.json({ ok: true, miniapp: data });
  } catch (e) {
    console.error('[admin/miniapps/rechazar]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

app.get('/api/ventas/usuario/:usuario_id', requireUsuario, async (req, res) => {
  const { usuario_id } = req.params;
  if (!_forbidUnlessSelf(req, res, usuario_id)) return;
  try {
    const { data: pedidos, error: errP } = await supabase
      .from('pedidos')
      .select('id, nombre_producto, producto_id, monto, estado, estado_pago, ref_vendedor, fecha, cliente_nombre')
      .eq('vendedor_id', usuario_id)
      .order('fecha', { ascending: false });
    if (errP) throw errP;

    const listaP = pedidos || [];

    // Obtener % utilidad de cada producto involucrado
    const pids = [...new Set(listaP.map(p => p.producto_id).filter(Boolean))];
    const utilMap = {};
    if (pids.length > 0) {
      const { data: prods } = await supabase
        .from('productos').select('id, utilidad').in('id', pids);
      (prods || []).forEach(p => { utilMap[p.id] = Number(p.utilidad) || 0; });
    }

    const ventas = listaP.map(p => {
      const utilPct = utilMap[p.producto_id] || 0;
      const utilidadGanada = p.estado_pago === 'pagado'
        ? Math.round((p.monto || 0) * utilPct / 100 * 100) / 100
        : 0;
      return {
        id: p.id,
        producto: p.nombre_producto || '—',
        monto: p.monto || 0,
        utilidad_pct: utilPct,
        utilidad_ganada: utilidadGanada,
        estado: p.estado || 'pendiente',
        estado_pago: p.estado_pago || 'pendiente',
        fecha: p.fecha,
        cliente: p.cliente_nombre || '—'
      };
    });

    const pagadas    = ventas.filter(v => v.estado_pago === 'pagado');
    const pendientes = ventas.filter(v => v.estado_pago !== 'pagado');
    const resumen = {
      total_ventas:          ventas.length,
      ventas_pagadas:        pagadas.length,
      ventas_pendientes:     pendientes.length,
      total_vendido:         ventas.reduce((s, v) => s + v.monto, 0),
      total_comision_ganada: pagadas.reduce((s, v) => s + v.utilidad_ganada, 0),
      pendiente_confirmacion: pendientes.reduce((s, v) => s + v.monto, 0)
    };

    console.log(`[ventas/usuario] id=${usuario_id} total=${ventas.length} pagadas=${pagadas.length}`);
    res.json({ ok: true, ventas, resumen });
  } catch (e) {
    console.error('[ventas/usuario]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// GET /api/vendedor/miniapps-comisiones — comisiones acumuladas del vendedor autenticado
app.get('/api/vendedor/miniapps-comisiones', requireUsuario, async (req, res) => {
  if (!COMISION_VENDEDORES_DIGITAL_ACTIVA) {
    return res.json({ ok: true, total_ventas: 0, total_comision: 0, detalle: [] });
  }
  const usuario_id = req.usuario_id;
  if (req.query.usuario_id && !_forbidUnlessSelf(req, res, req.query.usuario_id)) return;

  try {
    const { data: compras, error: cErr } = await supabase
      .from('miniapp_compras')
      .select('id, miniapp_id, monto, creado_en, miniapps ( nombre, comision_vendedor )')
      .eq('vendedor_id', usuario_id)
      .eq('estado_pago', 'pagado')
      .order('creado_en', { ascending: false });
    if (cErr) throw cErr;

    let totalComision = 0;
    const detalle = (compras || []).map(function (c) {
      const mini = c.miniapps || {};
      const monto = Number(c.monto) || 0;
      const comPct = Number(mini.comision_vendedor) || 0;
      const comGanada = _calcComisionVendedorMiniapp(monto, comPct);
      totalComision += comGanada;
      return {
        id:                c.id,
        miniapp_nombre:    mini.nombre || 'Mini app',
        fecha:             c.creado_en,
        monto,
        comision_vendedor: comPct,
        comision_ganada:   comGanada
      };
    });

    console.log('[vendedor/miniapps-comisiones] usuario=' + usuario_id + ' ventas=' + detalle.length);
    res.json({
      ok: true,
      total_ventas:  detalle.length,
      total_comision: _roundMoney(totalComision),
      detalle
    });
  } catch (e) {
    console.error('[vendedor/miniapps-comisiones]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// ── Resumen de ventas por vendedor (admin) ─────────────────────────────────────
app.get('/api/admin/ventas-por-vendedor', async (req, res) => {
  try {
    const { data: pedidos, error: errP } = await supabase
      .from('pedidos')
      .select('vendedor_id, ref_vendedor, monto, estado_pago, producto_id')
      .not('vendedor_id', 'is', null);
    if (errP) throw errP;

    const listaP = pedidos || [];

    const pids = [...new Set(listaP.map(p => p.producto_id).filter(Boolean))];
    const utilMap = {};
    if (pids.length > 0) {
      const { data: prods } = await supabase
        .from('productos').select('id, utilidad').in('id', pids);
      (prods || []).forEach(p => { utilMap[p.id] = Number(p.utilidad) || 0; });
    }

    const mapaVend = {};
    listaP.forEach(p => {
      const vid = p.vendedor_id;
      if (!mapaVend[vid]) {
        mapaVend[vid] = {
          vendedor_id:   vid,
          codigo:        p.ref_vendedor || '—',
          ventas:        0,
          total_vendido: 0,
          total_comision: 0,
          pagado:        0   // se llenará cuando haya tabla de pagos
        };
      }
      const v = mapaVend[vid];
      v.ventas++;
      v.total_vendido += p.monto || 0;
      if (p.estado_pago === 'pagado') {
        const utilPct = utilMap[p.producto_id] || 0;
        v.total_comision += Math.round((p.monto || 0) * utilPct / 100 * 100) / 100;
      }
    });

    const vendedores = Object.values(mapaVend).map(v => ({
      ...v,
      saldo_pendiente: Math.round((v.total_comision - v.pagado) * 100) / 100
    }));

    const resumen_global = {
      total_ventas:   vendedores.reduce((s, v) => s + v.ventas, 0),
      total_vendido:  vendedores.reduce((s, v) => s + v.total_vendido, 0),
      total_comision: vendedores.reduce((s, v) => s + v.total_comision, 0)
    };

    console.log(`[admin/ventas-por-vendedor] vendedores=${vendedores.length}`);
    res.json({ ok: true, vendedores, resumen_global });
  } catch (e) {
    console.error('[admin/ventas-por-vendedor]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// ── Costos por motor de IA (ajustables) ───────────────────────────────────────
const COSTO_MOTOR_IA = {
  'viral-tendencias':     50,
  'viral-desarrollar':     0,   // incluido en viral-tendencias
  'modular':              40,
  'editor-video':         30,
  'editor-reaccion':      30,
  'contenido-organico':   20,
  'contenido-anuncio':    20,
  'contenido-avatar':     40
};

// GET /api/creditos/:usuario_id — saldo actual
app.get('/api/creditos/:usuario_id', requireUsuario, async (req, res) => {
  if (!_forbidUnlessSelf(req, res, req.params.usuario_id)) return;
  try {
    const { data, error } = await supabase
      .from('usuarios').select('creditos_ia').eq('id', req.usuario_id).single();
    if (error) throw error;
    res.json({ ok: true, creditos: data.creditos_ia ?? 0 });
  } catch (e) {
    console.error('[creditos/get]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// POST /api/creditos/descontar — verifica y descuenta (requiere sesion de usuario)
app.post('/api/creditos/descontar', requireUsuario, async (req, res) => {
  const { cantidad, motor, descripcion } = req.body || {};
  const usuario_id = req.usuario_id;
  if (req.body && req.body.usuario_id && !_forbidUnlessSelf(req, res, req.body.usuario_id)) return;
  if (!cantidad || Number(cantidad) <= 0) {
    return res.status(400).json({ ok: false, error: 'Parametros invalidos' });
  }
  const cant = Number(cantidad);
  try {
    const { data: usr, error: errL } = await supabase
      .from('usuarios').select('creditos_ia').eq('id', usuario_id).single();
    if (errL) throw errL;

    const actuales = Number(usr.creditos_ia) || 0;
    if (actuales < cant) {
      return res.json({ ok: false, error: 'Creditos insuficientes', creditos_actuales: actuales });
    }

    const nuevos = actuales - cant;
    const { error: errU } = await supabase
      .from('usuarios').update({ creditos_ia: nuevos }).eq('id', usuario_id);
    if (errU) throw errU;

    // Registro en movimientos_creditos (fire-and-forget)
    supabase.from('movimientos_creditos').insert({
      usuario_id,
      tipo:          'consumo',
      cantidad:      cant,
      motor:         motor        || 'desconocido',
      descripcion:   descripcion  || '',
      saldo_despues: nuevos,
      fecha:         new Date().toISOString()
    }).then(() => {}).catch(e2 => console.warn('[movimientos_creditos]', e2.message));

    console.log(`[creditos/descontar] uid=${usuario_id} motor=${motor} -${cant} restantes=${nuevos}`);
    res.json({ ok: true, creditos_restantes: nuevos });
  } catch (e) {
    console.error('[creditos/descontar]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// ── Métricas: más vendidos ─────────────────────────────────────────────────────
app.get('/api/admin/metricas/mas-vendidos', async (req, res) => {
  try {
    // Incluye todos los pedidos (TODO: cambiar a estado_pago='pagado' cuando haya más datos reales)
    const { data: pedidos, error } = await supabase
      .from('pedidos')
      .select('nombre_producto, monto, estado_pago');
    if (error) throw error;

    const prodMap = {};
    (pedidos || []).forEach(p => {
      const k = p.nombre_producto || 'Desconocido';
      if (!prodMap[k]) prodMap[k] = { nombre: k, unidades: 0, total_vendido: 0 };
      prodMap[k].unidades++;
      prodMap[k].total_vendido = Math.round((prodMap[k].total_vendido + (p.monto || 0)) * 100) / 100;
    });

    const productos = Object.values(prodMap)
      .sort((a, b) => b.unidades - a.unidades);

    console.log(`[metricas/mas-vendidos] productos=${productos.length}`);
    res.json({ ok: true, productos });
  } catch (e) {
    console.error('[metricas/mas-vendidos]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// ── Métricas: más vistos ───────────────────────────────────────────────────────
app.get('/api/admin/metricas/mas-vistos', async (req, res) => {
  try {
    const { data: paginas, error } = await supabase
      .from('paginas_venta')
      .select('nombre, slug, vistas, producto_id')
      .order('vistas', { ascending: false });
    if (error) throw error;

    const pids = [...new Set((paginas || []).map(p => p.producto_id).filter(Boolean))];
    const prodMap = {};
    if (pids.length > 0) {
      const { data: prods } = await supabase
        .from('productos').select('id, nombre').in('id', pids);
      (prods || []).forEach(p => { prodMap[p.id] = p.nombre; });
    }

    const paginasList = (paginas || []).map(p => ({
      nombre:   p.nombre || p.slug || '—',
      slug:     p.slug,
      vistas:   p.vistas || 0,
      producto: prodMap[p.producto_id] || null
    }));

    console.log(`[metricas/mas-vistos] paginas=${paginasList.length}`);
    res.json({ ok: true, paginas: paginasList });
  } catch (e) {
    console.error('[metricas/mas-vistos]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// ── Limpieza de HTML del vendedor (handlers inline rotos) ─────────────────────
// Repara markup exterior + JS roto dentro de <script> (URLs sin comillas).
var _INLINE_EVENT_ATTRS =
  'onclick|onmousedown|onmouseup|onmouseover|onmouseout|onload|onchange|onsubmit|ontouchstart|ontouchend';

function _normalizeTagMarkup(s) {
  return s.replace(/<([^>]+)>/g, function (_full, inner) {
    var n = inner.replace(/\s{2,}/g, ' ').replace(/^\s+|\s+$/g, '');
    return '<' + n + '>';
  });
}

function _fixAnchorHrefAttrs(attrs) {
  var a = attrs;

  // href entre comillas dobles: conservar solo http(s), # o /
  a = a.replace(/\bhref\s*=\s*"([^"]*)"/gi, function (_m, val) {
    if (/^(https?:|#|\/)/i.test(val)) return ' href="' + val + '"';
    return ' href="#"';
  });

  // href entre comillas simples
  a = a.replace(/\bhref\s*=\s*'([^']*)'/gi, function (_m, val) {
    if (/^(https?:|#|\/)/i.test(val)) return " href='" + val + "'";
    return ' href="#"';
  });

  // href sin comillas (href=/..., href=javascript:..., etc.)
  a = a.replace(/\bhref\s*=\s*[^\s>"']+/gi, ' href="#"');

  return a;
}

function _sanitizeHtmlTags(fragment) {
  if (!fragment) return fragment;
  var s = fragment;

  // 1. Eliminar por completo atributos de evento inline (comillas dobles, simples o sin comillas)
  s = s.replace(new RegExp('\\s+(?:' + _INLINE_EVENT_ATTRS + ')\\s*=\\s*"[^"]*"', 'gi'), '');
  s = s.replace(new RegExp("\\s+(?:" + _INLINE_EVENT_ATTRS + ")\\s*=\\s*'[^']*'", 'gi'), '');
  // Sin comillas: valor hasta espacio, > o fin de atributo
  s = s.replace(new RegExp('\\s+(?:' + _INLINE_EVENT_ATTRS + ')\\s*=\\s*[^\\s>"\']+', 'gi'), '');

  // 2. En <a>, neutralizar href mal formados; conservar href quoted http(s)/#//
  s = s.replace(/<a\b([^>]*)>/gi, function (_m, attrs) {
    return '<a' + _fixAnchorHrefAttrs(attrs) + '>';
  });

  // 4. Normalizar espacios duplicados y > mal formados dentro de etiquetas
  s = _normalizeTagMarkup(s);

  return s;
}

// Repara asignaciones de navegacion con URL sin comillas dentro de bloques <script>.
// Ej: location.href=/checkout?slug=x  ->  location.href="/checkout?slug=x"
var _NAV_URL_SIN_COMILLAS_RE = /(\blocation\.href|\bwindow\.location\.href|\bwindow\.location)(\s*=\s*)(?!["'])(\/[^\s;"'\n)]+)/g;

function _escaparUrlParaComillas(url) {
  return url.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function _repararJsRoto(js) {
  if (!js) return js;
  return js.replace(_NAV_URL_SIN_COMILLAS_RE, function (_m, prop, eq, url) {
    return prop + eq + '"' + _escaparUrlParaComillas(url) + '"';
  });
}

function _repararScriptBlock(scriptTag) {
  var match = scriptTag.match(/^(\<script\b[^>]*\>)([\s\S]*?)(\<\/script\>)$/i);
  if (!match) return scriptTag;
  var open  = match[1];
  var body  = match[2];
  var close = match[3];
  var fixed = _repararJsRoto(body);
  if (fixed === body) return scriptTag;
  return open + fixed + close;
}

function _sanitizeVendorHtml(html) {
  var src = String(html || '');
  if (!src) return src;

  var out = '';
  var lastIdx = 0;
  var scriptRe = /<script\b[\s\S]*?<\/script>/gi;
  var m;

  while ((m = scriptRe.exec(src)) !== null) {
    out += _sanitizeHtmlTags(src.slice(lastIdx, m.index));
    out += _repararScriptBlock(m[0]);
    lastIdx = m.index + m[0].length;
  }
  out += _sanitizeHtmlTags(src.slice(lastIdx));
  return out;
}

// ── Helpers: inyeccion segura del script de checkout en paginas de venta ───────
function _injectCheckoutScript(html, slug, ref) {
  // Limpiar handlers inline rotos del HTML del vendedor antes de inyectar checkout
  var clean = _sanitizeVendorHtml(html);

  // Quitar ea-checkout.js embebido en el HTML del vendedor (evita doble binding)
  clean = clean.replace(
    /<script[^>]*\ssrc=["'][^"']*ea-checkout\.js[^"']*["'][^>]*>\s*<\/script>/gi,
    ''
  );

  // JSON.stringify escapa comillas, backslashes, saltos de linea, etc. de forma segura
  var checkoutScript = '<script>\n' +
'(function(){\n' +
'  var _slug = ' + JSON.stringify(String(slug || '')) + ';\n' +
'  var _ref  = ' + JSON.stringify(String(ref || '')) + ';\n' +
'  function _irAlCheckout(e) {\n' +
'    if (e) { e.preventDefault(); e.stopPropagation(); }\n' +
'    var url = "/checkout?slug=" + encodeURIComponent(_slug);\n' +
'    if (_ref) url += "&ref=" + encodeURIComponent(_ref);\n' +
'    try {\n' +
'      if (window.parent && window.parent !== window) {\n' +
'        window.parent.postMessage({ ea_checkout_url: url }, "*");\n' +
'        return;\n' +
'      }\n' +
'    } catch (err) {}\n' +
'    window.location.href = url;\n' +
'  }\n' +
'  function _enlazar() {\n' +
'    var url = "/checkout?slug=" + encodeURIComponent(_slug);\n' +
'    if (_ref) url += "&ref=" + encodeURIComponent(_ref);\n' +
'    document.querySelectorAll(".btn-comprar-ea, [data-comprar]").forEach(function(btn) {\n' +
'      if (btn.dataset.eaInyectado) return;\n' +
'      btn.dataset.eaInyectado = "1";\n' +
'      btn.removeAttribute("onclick");\n' +
'      if (btn.href !== undefined) btn.href = url;\n' +
'      btn.addEventListener("click", _irAlCheckout);\n' +
'    });\n' +
'  }\n' +
'  if (document.readyState === "loading") {\n' +
'    document.addEventListener("DOMContentLoaded", _enlazar);\n' +
'  } else {\n' +
'    _enlazar();\n' +
'  }\n' +
'})();\n' +
'<\/script>';

  var lower = clean.toLowerCase();
  var idx   = lower.lastIndexOf('</body>');
  if (idx !== -1) {
    return clean.slice(0, idx) + checkoutScript + '\n' + clean.slice(idx);
  }
  return clean + '\n' + checkoutScript;
}

// ── Página pública de venta  GET /p/:slug ─────────────────────────────────────
// SEGURIDAD: el HTML del vendedor se aísla en un <iframe sandbox="allow-scripts allow-forms">
// para prevenir XSS. El checkout se comunica por postMessage hacia la ventana padre.
app.get('/p/:slug', async (req, res) => {
  const { slug } = req.params;
  const ref = req.query.ref ? String(req.query.ref).slice(0, 120) : '';
  try {
    const { data, error } = await supabase
      .from('paginas_venta').select('id, html, activa, vistas').eq('slug', slug).single();
    if (error || !data || !data.activa) {
      _setNoCacheHtml(res);
      return res.status(404).send('<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px;text-align:center"><h2>Pagina no encontrada</h2><p>Este link no esta disponible.</p></body></html>');
    }
    // Incrementar vistas (fire-and-forget)
    supabase.from('paginas_venta').update({ vistas: (data.vistas || 0) + 1 }).eq('id', data.id).then(() => {}).catch(() => {});

    // Extraer <title> de la página para mostrarlo en la pestaña del browser
    const titleMatch = (data.html || '').match(/<title[^>]*>([^<]*)<\/title>/i);
    const pageTitle  = titleMatch ? titleMatch[1].trim() : slug;

    // URL del contenido real (sin iframe) — incluye ref si viene en el link
    let innerSrc = _assetUrl('/p-inner/' + encodeURIComponent(slug));
    if (ref) innerSrc += '&ref=' + encodeURIComponent(ref);

    _setNoCacheHtml(res);
    res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${pageTitle.replace(/</g,'&lt;')}</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html,body{width:100%;height:100%;overflow:hidden;background:#fff}
  #pf{position:fixed;top:0;left:0;width:100%;height:100%;border:0}
</style>
</head>
<body>
<!-- sandbox: allow-scripts (countdown, animaciones), allow-forms (formularios internos)
     SIN allow-same-origin → el iframe no puede acceder a cookies ni localStorage del padre -->
<iframe
  id="pf"
  src="${innerSrc}"
  sandbox="allow-scripts allow-forms"
  referrerpolicy="no-referrer"
  frameborder="0"
  scrolling="yes"
></iframe>
<script>
// Recibe el mensaje del botón de compra dentro del iframe sandbox y navega la ventana real.
// El iframe usa sandbox sin allow-same-origin → postMessage llega con origin "null"/""; validar por e.source.
window.addEventListener('message', function(e) {
  var pf = document.getElementById('pf');
  var fromIframe = pf && pf.contentWindow && e.source === pf.contentWindow;
  if (!fromIframe && e.origin !== window.location.origin) return;
  var d = e.data;
  if (!d || typeof d.ea_checkout_url !== 'string') return;
  var url = d.ea_checkout_url;
  var ok = url.indexOf('/checkout') === 0;
  if (!ok) {
    try {
      var u = new URL(url, window.location.origin);
      ok = u.pathname === '/checkout' && (u.origin === window.location.origin || u.hostname === '${API_PUBLIC_HOST}');
    } catch (_) { ok = false; }
  }
  if (!ok) return;
  window.location.href = url;
});
</script>
</body>
</html>`);
  } catch (e) {
    console.error('[/p/:slug]', e.message);
    res.status(500).send('Error interno.');
  }
});

// ── Contenido interior de la página de venta  GET /p-inner/:slug ──────────────
// Este endpoint sirve el HTML real del vendedor SOLO para ser cargado dentro del iframe.
// No increments views (ya lo hizo /p/:slug). Inyecta el script de checkout adaptado a postMessage.
app.get('/p-inner/:slug', async (req, res) => {
  const { slug } = req.params;
  const ref = req.query.ref ? String(req.query.ref).slice(0, 120) : '';
  try {
    const { data, error } = await supabase
      .from('paginas_venta').select('html, activa').eq('slug', slug).single();
    if (error || !data || !data.activa) {
      return res.status(404).send('Pagina no encontrada.');
    }

    const htmlOut = _injectCheckoutScript(data.html, slug, ref);

    _setNoCacheHtml(res);
    // Permitir que solo nuestro propio servidor cargue este endpoint en un iframe
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.send(htmlOut);
  } catch (e) {
    console.error('[/p-inner/:slug]', e.message);
    res.status(500).send('Error interno.');
  }
});

// ════════════════════════════════════════════════════════════════════════════
// IA PROXY — endpoints que reenvían al modelo sin exponer la API key al frontend
// ════════════════════════════════════════════════════════════════════════════

const GROQ_MODEL_DEFAULT  = 'llama-3.3-70b-versatile';
const GEMINI_API_KEY      = process.env.GEMINI_API_KEY || '';
const CHAT_AGENTS_LIMITE_DIARIO = 30;

function _fechaHoyYYYYMMDD() {
  return new Date().toISOString().slice(0, 10);
}

// POST /api/ia/groq
// Recibe { prompt?, messages?, system?, max_tokens?, temperature?, es_chat_agents? }
// es_chat_agents=true aplica limite diario (chat_uso_diario). Otros motores IA no se limitan.
// Llama a Groq con la key del .env y devuelve { ok:true, texto }
app.post('/api/ia/groq', requireUsuario, async (req, res) => {
  const { prompt, messages, system, max_tokens, temperature, es_chat_agents } = req.body || {};
  const usuario_id = req.usuario_id;
  const esChatAgents = es_chat_agents === true;
  let chatUsoActual = 0;

  if (esChatAgents) {
    const fecha = _fechaHoyYYYYMMDD();
    try {
      const { data: uso, error: usoErr } = await supabase
        .from('chat_uso_diario')
        .select('cantidad')
        .eq('usuario_id', String(usuario_id))
        .eq('fecha', fecha)
        .maybeSingle();
      if (usoErr) {
        console.error('[ia/groq] chat_uso_diario read:', usoErr.message);
      } else {
        chatUsoActual = uso ? Number(uso.cantidad) || 0 : 0;
        if (chatUsoActual >= CHAT_AGENTS_LIMITE_DIARIO) {
          return res.status(200).json({
            ok: false,
            limite: true,
            error: 'Has alcanzado tu limite de mensajes de hoy. Vuelve manana.'
          });
        }
      }
    } catch (e) {
      console.error('[ia/groq] chat_uso_diario:', e.message);
    }
  }

  try {
    const groqMessages = [];
    if (system) groqMessages.push({ role: 'system', content: system });
    if (messages && messages.length > 0) {
      groqMessages.push(...messages);
    } else if (prompt) {
      groqMessages.push({ role: 'user', content: String(prompt) });
    }
    if (groqMessages.length === 0) {
      return res.status(400).json({ ok: false, error: 'Falta prompt o messages' });
    }

    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + process.env.GROQ_API_KEY
      },
      body: JSON.stringify({
        model: GROQ_MODEL_DEFAULT,
        messages: groqMessages,
        max_tokens: max_tokens || 1500,
        temperature: temperature != null ? temperature : 0.8
      })
    });
    const data = await resp.json();
    if (!data.choices || !data.choices[0]) {
      const errMsg = data.error?.message || 'Respuesta invalida de Groq';
      return res.status(502).json({ ok: false, error: errMsg });
    }

    if (esChatAgents) {
      const fecha = _fechaHoyYYYYMMDD();
      const uid = String(usuario_id);
      try {
        const { error: upErr } = await supabase
          .from('chat_uso_diario')
          .upsert(
            { usuario_id: uid, fecha, cantidad: chatUsoActual + 1 },
            { onConflict: 'usuario_id,fecha' }
          );
        if (upErr) console.error('[ia/groq] chat_uso_diario increment:', upErr.message);
      } catch (e) {
        console.error('[ia/groq] chat_uso_diario increment:', e.message);
      }
    }

    res.json({ ok: true, texto: data.choices[0].message.content });
  } catch (e) {
    console.error('[ia/groq]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// POST /api/ia/gemini-imagen
// Recibe { prompt } — prueba los modelos de imagen de Gemini/Imagen en orden
// Devuelve { ok:true, imagen } donde imagen es un data URL base64
app.post('/api/ia/gemini-imagen', requireUsuario, async (req, res) => {
  const { prompt } = req.body || {};
  if (!prompt) return res.status(400).json({ ok: false, error: 'Falta prompt' });
  if (!GEMINI_API_KEY) return res.status(500).json({ ok: false, error: 'GEMINI_API_KEY no configurada en el motor' });

  const models = [
    {
      url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${GEMINI_API_KEY}`,
      type: 'gemini',
      body: { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } }
    },
    {
      url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${GEMINI_API_KEY}`,
      type: 'gemini',
      body: { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } }
    },
    {
      url: `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${GEMINI_API_KEY}`,
      type: 'imagen',
      body: { instances: [{ prompt }], parameters: { sampleCount: 1, aspectRatio: '1:1', addWatermark: false } }
    }
  ];

  for (const model of models) {
    try {
      const resp = await fetch(model.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(model.body)
      });
      if (resp.status === 429 || resp.status === 503) continue;
      const data = await resp.json();
      if (data.error) continue;

      if (model.type === 'imagen' && data.predictions?.[0]?.bytesBase64Encoded) {
        return res.json({ ok: true, imagen: 'data:image/png;base64,' + data.predictions[0].bytesBase64Encoded });
      }
      if (model.type === 'gemini') {
        const parts = data.candidates?.[0]?.content?.parts;
        const imgPart = parts?.find(p => p.inlineData);
        if (imgPart) {
          return res.json({ ok: true, imagen: 'data:' + imgPart.inlineData.mimeType + ';base64,' + imgPart.inlineData.data });
        }
      }
    } catch (e) { continue; }
  }
  res.status(502).json({ ok: false, error: 'No se pudo generar la imagen con ninguno de los modelos disponibles' });
});

// POST /api/ia/gemini-vision
// Recibe { contents, system_instruction?, generationConfig? } — formato nativo de Gemini
// Llama a gemini-2.5-flash y devuelve { ok:true, texto }
app.post('/api/ia/gemini-vision', requireUsuario, async (req, res) => {
  const { contents, system_instruction, generationConfig } = req.body || {};
  if (!contents) return res.status(400).json({ ok: false, error: 'Falta contents' });
  if (!GEMINI_API_KEY) return res.status(500).json({ ok: false, error: 'GEMINI_API_KEY no configurada en el motor' });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  try {
    const body = { contents };
    if (system_instruction) body.system_instruction = system_instruction;
    if (generationConfig)   body.generationConfig   = generationConfig;

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await resp.json();
    if (data.error) return res.status(502).json({ ok: false, error: data.error.message || 'Error de Gemini' });
    const texto = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    res.json({ ok: true, texto });
  } catch (e) {
    console.error('[ia/gemini-vision]', e.message);
    res.status(500).json({ ok: false, error: CLIENT_ERROR_MSG });
  }
});

// ── Arranque ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  if (!jwtAuth.JWT_SECRET || jwtAuth.JWT_SECRET.length < 16) {
    console.warn('[motor] ADVERTENCIA: JWT_SECRET no configurado — los logins fallaran hasta configurarlo en .env');
  } else {
    console.log('[motor] Autenticacion JWT activa');
  }
  console.log('[motor] ASSET_VERSION=' + ASSET_VERSION + ' (cache-buster JS/CSS/HTML)');
  console.log(`[motor] Servidor corriendo en http://localhost:${PORT}`);
  console.log('[motor] Endpoints:');
  console.log(`[motor]   POST http://localhost:${PORT}/api/monetizacion/tendencias`);
  console.log(`[motor]   POST http://localhost:${PORT}/api/monetizacion/desarrollar`);
  console.log(`[motor]   POST http://localhost:${PORT}/api/monetizacion/modular`);
  console.log(`[motor]   POST http://localhost:${PORT}/api/editor/procesar-video`);
  console.log(`[motor]   POST http://localhost:${PORT}/api/editor/procesar-reaccion`);
  console.log(`[motor]   GET  http://localhost:${PORT}/api/editor/preview/:filename`);
  console.log(`[motor]   GET  http://localhost:${PORT}/api/editor/descargar/:filename`);
  console.log(`[motor]   POST http://localhost:${PORT}/api/contenido/organico`);
  console.log(`[motor]   POST http://localhost:${PORT}/api/contenido/anuncio`);
  console.log(`[motor]   POST http://localhost:${PORT}/api/ventas/config`);
  console.log(`[motor]   GET  http://localhost:${PORT}/api/ventas/config`);
  console.log(`[motor]   POST http://localhost:${PORT}/api/ventas/conectar-whatsapp`);
  console.log(`[motor]   GET  http://localhost:${PORT}/api/ventas/qr`);
  console.log(`[motor]   POST http://localhost:${PORT}/api/ventas/desconectar-whatsapp`);
  console.log(`[motor]   POST http://localhost:${PORT}/api/ventas/probar-telegram`);
  console.log(`[motor]   POST http://localhost:${PORT}/api/login`);
  console.log(`[motor]   GET  http://localhost:${PORT}/api/supabase/test`);
  console.log(`[motor]   POST http://localhost:${PORT}/api/mis-productos/agregar`);
  console.log(`[motor]   GET  http://localhost:${PORT}/api/mis-productos/:usuario_id`);
  console.log(`[motor]   POST http://localhost:${PORT}/api/mis-productos/quitar`);
  console.log(`[motor]   GET  http://localhost:${PORT}/api/catalogo`);
  console.log(`[motor]   GET  http://localhost:${PORT}/api/admin/paginas`);
  console.log(`[motor]   POST http://localhost:${PORT}/api/admin/paginas`);
  console.log(`[motor]   POST http://localhost:${PORT}/api/admin/paginas/actualizar`);
  console.log(`[motor]   POST http://localhost:${PORT}/api/admin/paginas/eliminar`);
  console.log(`[motor]   GET  http://localhost:${PORT}/api/admin/paginas/:id`);
  console.log(`[motor]   GET  http://localhost:${PORT}/p/:slug        (publica - wrapper iframe sandbox)`);
  console.log(`[motor]   GET  http://localhost:${PORT}/p-inner/:slug  (contenido iframe interno)`);
  console.log(`[motor]   GET  http://localhost:${PORT}/checkout  (formulario de envio / digital mini apps)`);
  console.log(`[motor]   GET  http://localhost:${PORT}/api/checkout/info?slug=`);
  console.log(`[motor]   POST http://localhost:${PORT}/api/checkout/crear-sesion`);
  console.log(`[motor]   POST http://localhost:${PORT}/api/checkout/webhook`);
  console.log(`[motor]   POST http://localhost:${PORT}/api/miniapp/comprar-prueba`);
  if (STRIPE_SECRET_KEY) {
    console.log('[motor] Stripe Checkout activo');
  } else {
    console.warn('[motor] STRIPE_SECRET_KEY no configurada — pagos reales desactivados');
  }
  if (RESEND_API_KEY) {
    console.log('[motor] Resend activo (from: ' + RESEND_FROM_EMAIL + ')');
  } else {
    console.warn('[motor] RESEND_API_KEY no configurada — recuperacion de contraseña sin correo');
  }
  console.log('[motor]   POST http://localhost:' + PORT + '/api/creador/recuperar-password');
  console.log('[motor]   POST http://localhost:' + PORT + '/api/creador/restablecer-password');
  console.log('[motor]   Panel creadores reset URL base: ' + CREADORES_PANEL_URL + '/restablecer');
  console.log(`[motor]   GET  http://localhost:${PORT}/api/vendedor/miniapps-comisiones?usuario_id=`);
  console.log(`[motor]   GET  http://localhost:${PORT}/api/admin/miniapps/comisiones-vendedores`);
  console.log(`[motor]   GET  http://localhost:${PORT}/mi-compra/:codigo`);
  console.log(`[motor]   GET  http://localhost:${PORT}/recuperar-compra`);
  console.log(`[motor]   GET  http://localhost:${PORT}/terminos`);
  console.log(`[motor]   GET  http://localhost:${PORT}/privacidad`);
  console.log(`[motor]   GET  http://localhost:${PORT}/marketplace`);
  console.log(`[motor]   GET  http://localhost:${PORT}/vitrina  (redirect → /marketplace)`);
  console.log(`[motor]   GET  http://localhost:${PORT}/api/marketplace`);
  console.log(`[motor]   GET  http://localhost:${PORT}/assets/logo-activos.jpg`);
  console.log(`[motor]   GET  http://localhost:${PORT}/usar-miniapp/:codigo`);
  console.log(`[motor]   GET  http://localhost:${PORT}/descargar-pdf/:codigo (R2 presigned)`);
  console.log(`[motor]   GET  http://localhost:${PORT}/descargar-pack/:codigo`);
  console.log(`[motor]   GET  http://localhost:${PORT}/descargar-video/:codigo/:video_id (R2 presigned)`);
  console.log(`[motor]   POST http://localhost:${PORT}/api/pedidos/crear`);
  console.log(`[motor]   GET  http://localhost:${PORT}/api/admin/pedidos`);
  console.log(`[motor]   POST http://localhost:${PORT}/api/admin/pedidos/actualizar`);
  console.log(`[motor]   GET  http://localhost:${PORT}/api/ventas/usuario/:usuario_id`);
  console.log(`[motor]   GET  http://localhost:${PORT}/api/admin/ventas-por-vendedor`);
  console.log(`[motor]   GET  http://localhost:${PORT}/api/admin/metricas/mas-vendidos`);
  console.log(`[motor]   GET  http://localhost:${PORT}/api/admin/metricas/mas-vistos`);
  console.log(`[motor]   GET  http://localhost:${PORT}/api/creditos/:usuario_id`);
  console.log(`[motor]   POST http://localhost:${PORT}/api/creditos/descontar`);
  console.log(`[motor]   GET  http://localhost:${PORT}/checkout-miniapp.js`);
  console.log(`[motor]   GET  http://localhost:${PORT}/ea-checkout.js`);
  console.log(`[motor]   GET  http://localhost:${PORT}/api/admin/productos`);
  console.log(`[motor]   POST http://localhost:${PORT}/api/admin/productos`);
  console.log(`[motor]   POST http://localhost:${PORT}/api/admin/productos/actualizar`);
  console.log(`[motor]   POST http://localhost:${PORT}/api/admin/productos/eliminar`);
  console.log(`[motor]   POST http://localhost:${PORT}/api/usuario/nombre`);
  console.log(`[motor]   GET  http://localhost:${PORT}/api/admin/usuarios`);
  console.log(`[motor]   POST http://localhost:${PORT}/api/admin/usuarios/activar`);
  console.log(`[motor]   POST http://localhost:${PORT}/api/admin/usuarios/desactivar`);
  console.log(`[motor]   GET  http://localhost:${PORT}/api/admin/creadores`);
  console.log(`[motor]   POST http://localhost:${PORT}/api/admin/creadores/activar`);
  console.log(`[motor]   POST http://localhost:${PORT}/api/admin/creadores/desactivar`);

  // ══ OBJETIVO 3: Limpieza de seguridad cada 30 minutos ═════════════════════
  // Borra archivos de temp/ y outputs/ con mas de 1 hora de antiguedad.
  // Protege contra basura dejada por procesos que crashearon antes del finally.
  setInterval(() => {
    console.log('[limpieza-auto] Ejecutando limpieza programada...');
    limpiarDirectorioAntiguo(TEMP_DIR);
    limpiarDirectorioAntiguo(OUTPUTS_DIR);
  }, 30 * 60 * 1000); // cada 30 minutos

  console.log('[motor] Limpieza automatica programada cada 30 min (archivos > 1h)');
});
