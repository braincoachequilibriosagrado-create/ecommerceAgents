'use strict';

const path = require('path');
const fs   = require('fs');

const groqChat = require('./groq-chat');

const GROQ_URL    = 'https://api.groq.com/openai/v1/chat/completions';
const AUTH_DIR    = path.join(__dirname, 'baileys-auth');
const CONFIG_PATH = path.join(__dirname, 'ventas-config.json');
const MAX_HIST    = 24;

const buildSystemVentas = require('./system-ventas');

// ── Silent pino-compatible logger ─────────────────────────────────────────────
const silentLogger = {
  level: 'silent',
  fatal: () => {}, error: () => {}, warn: () => {},
  info:  () => {}, debug: () => {}, trace: () => {},
  child: function () { return silentLogger; }
};

// ── State ─────────────────────────────────────────────────────────────────────
let sock           = null;
let estadoConexion = 'desconectado'; // 'desconectado' | 'esperando_qr' | 'conectado'
let qrBase64       = null;
const conversaciones = new Map(); // numero -> [{role,content}]

// ── Config helpers ─────────────────────────────────────────────────────────────
function cargarConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) { console.error('[ventas-cfg] Error:', e.message); }
  return {};
}

function guardarConfig(data) {
  try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), 'utf8'); }
  catch (e) { console.error('[ventas-cfg] Error guardando:', e.message); }
}

// ── Telegram ──────────────────────────────────────────────────────────────────
async function notificarTelegram(token, chatId, texto) {
  if (!token || !chatId || !texto) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: texto, parse_mode: 'HTML' })
    });
    const data = await res.json();
    if (!res.ok) console.warn('[telegram] Error:', data);
    return res.ok;
  } catch (e) { console.error('[telegram] Excepcion:', e.message); return false; }
}

// ── Groq ──────────────────────────────────────────────────────────────────────
async function llamarGroq(cfg, historial) {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    console.warn('[groq] GROQ_API_KEY no configurada');
    return { mensaje: 'Hola, en que te puedo ayudar hoy?', interes_compra: false };
  }
  try {
    const res = await fetch(GROQ_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
      body: JSON.stringify(groqChat.buildGroqChatBody({
        messages: [
          { role: 'system', content: buildSystemVentas(cfg) },
          ...historial.slice(-MAX_HIST)
        ],
        max_tokens:  400,
        temperature: 0.78
      }))
    });
    if (!res.ok) {
      const err = await res.text();
      console.error('[groq] HTTP', res.status, err.substring(0, 200));
      return { mensaje: 'Un momento, vuelvo enseguida.', interes_compra: false };
    }
    const data    = await res.json();
    const content = groqChat.extractGroqText(data);

    // Try JSON parse
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          mensaje:        (parsed.mensaje || content).trim(),
          interes_compra: !!parsed.interes_compra,
          link_producto:  parsed.link_producto || null
        };
      } catch {}
    }

    // Fallback: keyword detection + try to find matching product link
    const userMsg = (historial.slice(-1)[0]?.content || '').toLowerCase();
    const lower   = content.toLowerCase();
    const buyKeys = ['comprar', 'lo quiero', 'cuanto cuesta', 'precio', 'como pago', 'pedido', 'quiero pedirlo', 'me lo mandan', 'hacer el pedido'];
    const interes = buyKeys.some(k => lower.includes(k) || userMsg.includes(k));
    // Try to find product link from catalogue if intent detected
    let linkFallback = null;
    if (interes) {
      const catalogo = cargarConfig().catalogo || [];
      const match = catalogo.find(p =>
        userMsg.includes((p.producto || p.nombre || '').toLowerCase().split(' ')[0])
      );
      if (match && match.link) linkFallback = match.link;
    }
    return { mensaje: content, interes_compra: interes, link_producto: linkFallback };

  } catch (e) {
    console.error('[groq] Excepcion:', e.message);
    return { mensaje: 'Disculpa, dame un momento.', interes_compra: false };
  }
}

// ── Process incoming WhatsApp message ─────────────────────────────────────────
async function procesarMensaje(msg) {
  if (!sock) return;
  const jid = msg.key.remoteJid;
  if (!jid || jid.endsWith('@g.us') || msg.key.fromMe) return;

  const texto = (
    msg.message?.conversation                          ||
    msg.message?.extendedTextMessage?.text             ||
    msg.message?.imageMessage?.caption                 ||
    msg.message?.videoMessage?.caption                 ||
    ''
  ).trim();
  if (!texto) return;

  const numero = jid.split('@')[0];

  if (!conversaciones.has(numero)) conversaciones.set(numero, []);
  const hist = conversaciones.get(numero);
  hist.push({ role: 'user', content: texto });
  if (hist.length > MAX_HIST) hist.splice(0, hist.length - MAX_HIST);

  // Read fresh config on every message → hot-reload without reconnecting
  const cfg = cargarConfig();

  // Diagnostic log: shows exactly what config the agent is using
  const nProd = Array.isArray(cfg.catalogo) ? cfg.catalogo.filter(p => p.link).length : 0;
  console.log(
    `[ventas] Msg de +${numero} | agente: "${cfg.nombre || '?'}" | tono: ${cfg.tono || '?'} | estrategia: ${cfg.estrategia || '?'} | personalidad: ${cfg.personalidad ? 'si (' + cfg.personalidad.substring(0, 30) + '...)' : 'no'} | catalogo: ${nProd} producto(s) con link | msg: "${texto.substring(0, 60)}"`
  );
  const { mensaje, interes_compra, link_producto } = await llamarGroq(cfg, hist);
  hist.push({ role: 'assistant', content: mensaje });

  // Simulate human typing
  const delayMs = Math.min(Math.max(mensaje.length * 45, 900), 3500);
  try {
    await sock.sendPresenceUpdate('composing', jid);
    await new Promise(r => setTimeout(r, delayMs));
    await sock.sendMessage(jid, { text: mensaje });
    await sock.sendPresenceUpdate('paused', jid);
  } catch (e) { console.error('[ventas] Error al enviar:', e.message); return; }

  // Send per-product link and notify Telegram if buyer intent detected
  if (interes_compra) {
    const linkEnviar = link_producto || null;
    if (linkEnviar) {
      setTimeout(async () => {
        try {
          await sock.sendPresenceUpdate('composing', jid);
          await new Promise(r => setTimeout(r, 700));
          await sock.sendMessage(jid, { text: linkEnviar });
          await sock.sendPresenceUpdate('paused', jid);
        } catch {}
      }, 1400);
    }
    if (cfg.telegramToken && cfg.telegramChatId) {
      const catalogo = cfg.catalogo || [];
      const prod = catalogo.find(p =>
        texto.toLowerCase().includes((p.producto || p.nombre || '').toLowerCase().split(' ')[0])
      );
      const prodNombre = prod ? (prod.producto || prod.nombre) : null;
      const aviso = `<b>Interesado detectado</b>\nCliente: <code>+${numero}</code>\nMensaje: "<i>${texto.substring(0, 100)}</i>"${prodNombre ? `\nProducto: ${prodNombre}` : ''}${linkEnviar ? `\nLink enviado: ${linkEnviar}` : ''}`;
      notificarTelegram(cfg.telegramToken, cfg.telegramChatId, aviso);
    }
  }
}

// ── WhatsApp connection ───────────────────────────────────────────────────────
async function conectarWhatsApp() {
  let makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion;
  try {
    const b = require('@whiskeysockets/baileys');
    makeWASocket              = b.default;
    useMultiFileAuthState     = b.useMultiFileAuthState;
    DisconnectReason          = b.DisconnectReason;
    fetchLatestBaileysVersion = b.fetchLatestBaileysVersion;
  } catch (e) {
    throw new Error('Baileys no instalado. Ejecuta: cd motor && npm install');
  }

  if (estadoConexion === 'conectado') return;

  estadoConexion = 'esperando_qr';
  qrBase64       = null;

  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  let version = [2, 3000, 1023140];
  try { ({ version } = await fetchLatestBaileysVersion()); } catch {}

  sock = makeWASocket({
    version,
    auth:                  state,
    logger:                silentLogger,
    printQRInTerminal:     false,
    browser:               ['EcommerceAgent', 'Chrome', '122.0.0'],
    connectTimeoutMs:      60_000,
    keepAliveIntervalMs:   30_000,
    generateHighQualityLinkPreview: false
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        const QRCode = require('qrcode');
        qrBase64 = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
        estadoConexion = 'esperando_qr';
        console.log('[ventas] QR listo para escanear.');
      } catch (e) { console.error('[ventas] Error generando QR:', e.message); }
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const { loggedOut } = DisconnectReason;
      console.log('[ventas] Conexion cerrada. Codigo:', code, '| loggedOut:', code === loggedOut);

      if (code !== loggedOut) {
        estadoConexion = 'desconectado';
        console.log('[ventas] Reconectando en 5s...');
        setTimeout(() => conectarWhatsApp(), 5000);
      } else {
        estadoConexion = 'desconectado';
        qrBase64 = null;
        sock = null;
      }
    } else if (connection === 'open') {
      estadoConexion = 'conectado';
      qrBase64       = null;
      console.log('[ventas] WhatsApp conectado y listo para vender.');
      const cfg = cargarConfig();
      if (cfg.telegramToken && cfg.telegramChatId) {
        notificarTelegram(cfg.telegramToken, cfg.telegramChatId, '<b>EcommerceAgent</b>: WhatsApp conectado. El agente esta listo para atender clientes.');
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) await procesarMensaje(msg);
  });
}

async function desconectarWhatsApp() {
  if (sock) {
    try { await sock.logout(); } catch {}
    try { sock.end(undefined); } catch {}
    sock = null;
  }
  estadoConexion = 'desconectado';
  qrBase64       = null;
  conversaciones.clear();
  try {
    if (fs.existsSync(AUTH_DIR))
      fs.readdirSync(AUTH_DIR).forEach(f => {
        try { fs.unlinkSync(path.join(AUTH_DIR, f)); } catch {}
      });
  } catch {}
  return { ok: true };
}

function getEstado() {
  return { estado: estadoConexion, qr: qrBase64 };
}

module.exports = { conectarWhatsApp, desconectarWhatsApp, getEstado, cargarConfig, guardarConfig, notificarTelegram };
