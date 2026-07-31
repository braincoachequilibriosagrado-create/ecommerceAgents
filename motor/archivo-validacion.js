'use strict';

const FileType = require('file-type');
const sharp    = require('sharp');

const MIME_IMAGEN = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp'
};

/** Foto 1 (Reels vertical 9:16) */
const FOTO1_W = 1080;
const FOTO1_H = 1920;
/** Foto 2 (portada horizontal 16:9) */
const FOTO2_W = 1920;
const FOTO2_H = 1080;
const FOTO_MIN_LADO = 600;
const FOTO_PRODUCTO_JPEG_QUALITY = 85;

const MIME_PDF = ['application/pdf'];

const MIME_VIDEO = {
  'video/mp4':        'mp4',
  'video/quicktime':  'mov',
  'video/webm':       'webm'
};

async function _detectarTipo(buf) {
  if (!buf || !buf.length) return null;
  const ft = await FileType.fromBuffer(buf);
  if (ft) return ft;
  if (buf.slice(0, 5).toString('ascii') === '%PDF-') {
    return { ext: 'pdf', mime: 'application/pdf' };
  }
  return null;
}

/**
 * Valida magic bytes, orientacion (foto1 vertical / foto2 horizontal),
 * resolucion minima, y re-encode JPEG con resize cover al estandar.
 * @param {Buffer} buffer
 * @param {{ rol?: 'foto1'|'foto2' }} [opts]
 */
async function validarImagenSubida(buffer, opts) {
  const rol = opts && opts.rol === 'foto2' ? 'foto2' : (opts && opts.rol === 'foto1' ? 'foto1' : 'foto1');
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (!buf.length) return { ok: false, error: 'Archivo de imagen vacio.' };
  if (buf.length > 5 * 1024 * 1024) return { ok: false, error: 'La imagen supera el limite de 5 MB.' };

  const tipo = await _detectarTipo(buf);
  if (!tipo || !MIME_IMAGEN[tipo.mime]) {
    return { ok: false, error: 'La imagen debe ser JPG, PNG o WebP valido (contenido no coincide).' };
  }

  try {
    // Orientacion EXIF aplicada; metadata de la imagen "real"
    const metaIn = await sharp(buf, { failOn: 'error' }).rotate().metadata();
    const w = Number(metaIn.width) || 0;
    const h = Number(metaIn.height) || 0;
    if (!w || !h) {
      return { ok: false, error: 'No se pudo leer el tamano de la imagen.' };
    }
    const ladoMenor = Math.min(w, h);
    if (ladoMenor < FOTO_MIN_LADO) {
      return {
        ok: false,
        error: 'Resolucion muy baja, minimo 600 px en el lado menor.'
      };
    }
    if (rol === 'foto1') {
      if (w >= h) {
        return {
          ok: false,
          error: 'La Foto 1 debe ser VERTICAL (mas alta que ancha), tipo Reels 9:16.'
        };
      }
    } else {
      if (h >= w) {
        return {
          ok: false,
          error: 'La Foto 2 debe ser HORIZONTAL (mas ancha que alta), tipo portada 16:9.'
        };
      }
    }

    const targetW = rol === 'foto1' ? FOTO1_W : FOTO2_W;
    const targetH = rol === 'foto1' ? FOTO1_H : FOTO2_H;

    const out = await sharp(buf, { failOn: 'error' })
      .rotate()
      .resize(targetW, targetH, {
        fit: 'cover',
        position: 'centre'
      })
      .jpeg({ quality: FOTO_PRODUCTO_JPEG_QUALITY, mozjpeg: true })
      .toBuffer();

    // Fail-closed: verificar metadata del archivo ya re-encoded
    const metaOut = await sharp(out).metadata();
    const ow = Number(metaOut.width) || 0;
    const oh = Number(metaOut.height) || 0;
    if (rol === 'foto1' && !(oh > ow)) {
      return { ok: false, error: 'La Foto 1 debe ser VERTICAL (mas alta que ancha), tipo Reels 9:16.' };
    }
    if (rol === 'foto2' && !(ow > oh)) {
      return { ok: false, error: 'La Foto 2 debe ser HORIZONTAL (mas ancha que alta), tipo portada 16:9.' };
    }
    if (Math.min(ow, oh) < FOTO_MIN_LADO) {
      return { ok: false, error: 'Resolucion muy baja, minimo 600 px en el lado menor.' };
    }

    return { ok: true, buffer: out, mime: 'image/jpeg', ext: 'jpg', width: ow, height: oh };
  } catch (e) {
    console.warn('[archivo-validacion/imagen]', e.message);
    return { ok: false, error: 'No se pudo procesar la imagen. Usa JPG, PNG o WebP valido.' };
  }
}

async function validarPdfSubida(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (!buf.length) return { ok: false, error: 'Archivo PDF vacio.' };
  if (buf.length > 50 * 1024 * 1024) return { ok: false, error: 'El PDF supera el limite de 50 MB.' };

  const tipo = await _detectarTipo(buf);
  if (!tipo || !MIME_PDF.includes(tipo.mime)) {
    return { ok: false, error: 'El archivo debe ser un PDF valido (contenido no coincide).' };
  }
  return { ok: true, buffer: buf, mime: 'application/pdf', ext: 'pdf' };
}

async function validarVideoSubida(buffer, maxBytes) {
  const max = maxBytes || 100 * 1024 * 1024;
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (!buf.length) return { ok: false, error: 'Archivo de video vacio.' };
  if (buf.length > max) return { ok: false, error: 'El video supera el tamano maximo permitido.' };

  const tipo = await _detectarTipo(buf);
  if (!tipo || !MIME_VIDEO[tipo.mime]) {
    return { ok: false, error: 'El video debe ser MP4, MOV o WebM valido (contenido no coincide).' };
  }
  return { ok: true, buffer: buf, mime: tipo.mime, ext: MIME_VIDEO[tipo.mime] };
}

module.exports = {
  validarImagenSubida,
  validarPdfSubida,
  validarVideoSubida,
  FOTO1_W,
  FOTO1_H,
  FOTO2_W,
  FOTO2_H,
  FOTO_MIN_LADO
};
