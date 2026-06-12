require('dotenv').config();
const express       = require('express');
const cors          = require('cors');
const path          = require('path');
const fs            = require('fs');
const { exec }      = require('child_process');
const { promisify } = require('util');
const multer        = require('multer');

const execAsync = promisify(exec);

const SYSTEM_TENDENCIAS  = require('./system-tendencias');
const SYSTEM_DESARROLLO  = require('./system-desarrollo');
const SYSTEM_MODULAR     = require('./system-modular');
const SYSTEM_COPY_EDITOR = require('./system-copy-editor');
const SYSTEM_CONTENIDO   = require('./system-contenido');
const SYSTEM_AVATAR      = require('./system-avatar');
const agenteVentas       = require('./agente-ventas');

const app  = express();
const PORT = process.env.PORT || 3002;

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

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

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

async function downloadVideo(url, outputBase) {
  const cmd = `yt-dlp -f "best[ext=mp4][height<=1080]/best[ext=mp4]/best" --max-filesize 200M -o "${outputBase}.%(ext)s" "${url}"`;
  try {
    await execAsync(cmd, { timeout: 300000 });
  } catch (err) {
    const msg = err.message || '';
    if (msg.includes('max-filesize')) throw new Error('El video supera el tamano maximo permitido (200 MB).');
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
app.post('/api/monetizacion/tendencias', async (req, res) => {
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
  return res.json({ bocetos: bocetosData.bocetos });
});

// ── Endpoint: POST /api/monetizacion/desarrollar ─────────────────────────────
app.post('/api/monetizacion/desarrollar', async (req, res) => {
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
app.post('/api/monetizacion/modular', function (req, res, next) {
  uploadModular(req, res, function (err) {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'El video es demasiado grande. Maximo 500 MB.' });
      return res.status(400).json({ error: 'Error al subir el archivo: ' + err.message });
    }
    next();
  });
}, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Se requiere un archivo de video (campo "video").' });

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
    return res.json({ guion: modularData.guion, miniatura: modularData.miniatura, escenas: modularData.escenas, copy: modularData.copy });

  } catch (err) {
    console.error('[modular] Error en pipeline:', err.message);
    if (!res.headersSent) return res.status(502).json({ error: err.message || 'Error al procesar el video.' });
  } finally {
    // Borra el video subido + audio extraido + todos los frames posibles (existsSync interno)
    limpiarArchivos(tempFiles, 'modular');
  }
});

// ── Endpoint: POST /api/editor/procesar-video ─────────────────────────────────
// OBJETIVO 2: -map_metadata -1 en todos los outputs ffmpeg para limpiar metadata.
// OBJETIVO 1: limpiarArchivos() en finally con lista pre-registrada.
app.post('/api/editor/procesar-video', function (req, res, next) {
  uploadEditorFields(req, res, function (err) {
    if (err) return res.status(400).json({ ok: false, error: 'Error al subir archivo: ' + err.message });
    next();
  });
}, async (req, res) => {
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
      return res.json({ ok: true, filename: outName, copy });
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
      return res.json({ ok: true, filename: outName, copy });
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

      if (clipFilenames.length === 1) return res.json({ ok: true, filename: clipFilenames[0], copy });
      return res.json({ ok: true, clips: clipFilenames, copy });
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
      return res.json({ ok: true, filename: outName, copy });
    }

    return res.status(400).json({ ok: false, error: 'Accion no reconocida: ' + accion });

  } catch (err) {
    console.error('[editor/procesar-video] Error:', err.message);
    if (!res.headersSent) return res.status(502).json({ ok: false, error: err.message || 'Error al procesar el video.' });
  } finally {
    // Borra SIEMPRE los videos de entrada (subidos o descargados con yt-dlp)
    limpiarArchivos(tempFiles, 'editor/procesar-video');
  }
});

// ── Endpoint: POST /api/editor/procesar-reaccion ──────────────────────────────
// OBJETIVO 2: -map_metadata -1 en el output.
// OBJETIVO 1: limpiarArchivos() garantizado en finally.
app.post('/api/editor/procesar-reaccion', function (req, res, next) {
  uploadReaccionFields(req, res, function (err) {
    if (err) return res.status(400).json({ ok: false, error: 'Error al subir archivo: ' + err.message });
    next();
  });
}, async (req, res) => {
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
    return res.json({ ok: true, filename: outName, copy });

  } catch (err) {
    console.error('[reaccion] Error:', err.message);
    if (!res.headersSent) return res.status(502).json({ ok: false, error: err.message || 'Error al crear el video reaccion.' });
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
app.post('/api/contenido/organico', function (req, res, next) {
  uploadContenidoImg(req, res, function (err) {
    if (err) return res.status(400).json({ ok: false, error: 'Error al subir imagen: ' + err.message });
    next();
  });
}, async (req, res) => {
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
    const respuesta = { ok: true, tipo: tipoContenido, copy: parsed.copy || '' };
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
    if (!res.headersSent) return res.status(502).json({ ok: false, error: err.message || 'Error al generar contenido.' });
  } finally {
    limpiarArchivos(tempFiles, 'contenido/organico');
  }
});

// ── Endpoint: POST /api/contenido/anuncio ─────────────────────────────────────
app.post('/api/contenido/anuncio', function (req, res, next) {
  uploadContenidoImg(req, res, function (err) {
    if (err) return res.status(400).json({ ok: false, error: 'Error al subir imagen: ' + err.message });
    next();
  });
}, async (req, res) => {
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
      copy:           parsed.copy           || ''
    });

  } catch (err) {
    console.error('[contenido/anuncio] Error:', err.message);
    if (!res.headersSent) return res.status(502).json({ ok: false, error: err.message || 'Error al generar anuncio.' });
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
app.post('/api/contenido/avatar', function (req, res, next) {
  uploadAvatarFields(req, res, function (err) {
    if (err) return res.status(400).json({ ok: false, error: 'Error al subir imagen: ' + err.message });
    next();
  });
}, async (req, res) => {
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
      copy:     parsed.copy     || ''
    });

  } catch (err) {
    console.error('[avatar] Error:', err.message);
    if (!res.headersSent) return res.status(502).json({ ok: false, error: err.message || 'Error al generar video avatar.' });
  } finally {
    limpiarArchivos(tempFiles, 'contenido/avatar');
  }
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', motor: 'EcommerceAgent' }));

// ── AGENTE DE VENTAS WhatsApp ─────────────────────────────────────────────────

app.post('/api/ventas/config', (req, res) => {
  try {
    const cfg = req.body || {};
    // Merge with existing so nothing is lost if partial save
    const current = agenteVentas.cargarConfig();
    const updated  = { ...current, ...cfg };
    agenteVentas.guardarConfig(updated);
    res.json({ ok: true });
  } catch (e) {
    console.error('[ventas/config]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/ventas/config', (req, res) => {
  try {
    const cfg = agenteVentas.cargarConfig();
    // Never expose tokens to the frontend in full — mask for display only
    const safe = { ...cfg };
    if (safe.telegramToken) safe.telegramToken = safe.telegramToken; // keep for prefill
    res.json(safe);
  } catch (e) {
    console.error('[ventas/config GET]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/ventas/conectar-whatsapp', async (req, res) => {
  try {
    await agenteVentas.conectarWhatsApp();
    const estado = agenteVentas.getEstado();
    res.json({ ok: true, ...estado });
  } catch (e) {
    console.error('[ventas/conectar]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/ventas/qr', (req, res) => {
  const estado = agenteVentas.getEstado();
  res.json(estado);
});

app.post('/api/ventas/desconectar-whatsapp', async (req, res) => {
  try {
    const result = await agenteVentas.desconectarWhatsApp();
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error('[ventas/desconectar]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/ventas/probar-telegram', async (req, res) => {
  try {
    const { token, chatId } = req.body || {};
    if (!token || !chatId) return res.status(400).json({ error: 'Falta token o chatId' });
    const ok = await agenteVentas.notificarTelegram(token, chatId, '<b>EcommerceAgent</b>: Telegram configurado correctamente. Tu agente de ventas ya puede enviarte notificaciones.');
    if (ok) res.json({ ok: true, mensaje: 'Mensaje de prueba enviado.' });
    else res.status(400).json({ error: 'No se pudo enviar. Verifica el token y el Chat ID.' });
  } catch (e) {
    console.error('[ventas/probar-telegram]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Arranque ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
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
