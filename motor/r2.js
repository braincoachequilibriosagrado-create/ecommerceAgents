/**
 * r2.js — Conexión con Cloudflare R2 (compatible con AWS S3 SDK v3)
 *
 * Exporta:
 *   r2Client   — S3Client configurado para R2
 *   R2_BUCKET  — nombre del bucket desde .env
 *   subirArchivo(key, contenido, contentType)  → sube y devuelve la key
 *   obtenerArchivo(key)                        → devuelve el contenido como string
 *   borrarArchivo(key)                         → borra el objeto
 */

'use strict';

const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand
} = require('@aws-sdk/client-s3');

// ── Validar que las variables de entorno estén presentes ──────────────────────
const R2_ENDPOINT         = process.env.R2_ENDPOINT;
const R2_ACCESS_KEY_ID    = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY= process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET           = process.env.R2_BUCKET;

const _r2Configurado = Boolean(R2_ENDPOINT && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET);

if (_r2Configurado) {
  console.log('[r2] Conexion configurada  bucket=' + R2_BUCKET +
              '  endpoint=' + R2_ENDPOINT.replace(/https?:\/\//, '').split('.')[0] + '.r2…');
} else {
  console.warn('[r2] ADVERTENCIA: faltan variables R2_ENDPOINT / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET. Las operaciones de R2 fallaran.');
}

// ── Cliente S3 apuntando a R2 ─────────────────────────────────────────────────
const r2Client = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId:     R2_ACCESS_KEY_ID     || '',
    secretAccessKey: R2_SECRET_ACCESS_KEY || ''
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Sube un archivo a R2.
 * @param {string} key          Ruta dentro del bucket (ej. 'apps/mi-app.html')
 * @param {string|Buffer} body  Contenido del archivo
 * @param {string} contentType  MIME type (ej. 'text/html', 'application/json')
 * @returns {Promise<string>}   La misma key si todo sale bien
 */
async function subirArchivo(key, body, contentType) {
  try {
    await r2Client.send(new PutObjectCommand({
      Bucket:      R2_BUCKET,
      Key:         key,
      Body:        body,
      ContentType: contentType || 'application/octet-stream'
    }));
    console.log('[r2] Subido: ' + key);
    return key;
  } catch (e) {
    console.error('[r2] Error al subir ' + key + ':', e.message);
    throw e;
  }
}

/**
 * Obtiene el contenido de un archivo de R2 como string.
 * @param {string} key  Ruta dentro del bucket
 * @returns {Promise<string>}
 */
async function obtenerArchivo(key) {
  try {
    const resp = await r2Client.send(new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key:    key
    }));
    // resp.Body es un ReadableStream; lo convertimos a string
    const chunks = [];
    for await (const chunk of resp.Body) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    const contenido = Buffer.concat(chunks).toString('utf-8');
    console.log('[r2] Leido: ' + key + ' (' + contenido.length + ' chars)');
    return contenido;
  } catch (e) {
    console.error('[r2] Error al leer ' + key + ':', e.message);
    throw e;
  }
}

/**
 * Borra un archivo de R2.
 * @param {string} key  Ruta dentro del bucket
 * @returns {Promise<void>}
 */
async function borrarArchivo(key) {
  try {
    await r2Client.send(new DeleteObjectCommand({
      Bucket: R2_BUCKET,
      Key:    key
    }));
    console.log('[r2] Borrado: ' + key);
  } catch (e) {
    console.error('[r2] Error al borrar ' + key + ':', e.message);
    throw e;
  }
}

// ── Exports ───────────────────────────────────────────────────────────────────
module.exports = {
  r2Client,
  R2_BUCKET,
  subirArchivo,
  obtenerArchivo,
  borrarArchivo
};
