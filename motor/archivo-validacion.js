'use strict';

const FileType = require('file-type');
const sharp    = require('sharp');

const MIME_IMAGEN = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp'
};

/** Portada uniforme 4:3 (marketplace / venta / tarjetas) */
const FOTO_PRODUCTO_W = 1200;
const FOTO_PRODUCTO_H = 900;
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
 * Valida magic bytes y normaliza la foto de producto:
 * recorte cover centrado a 1200x900 (4:3), JPEG ~85, sin metadata.
 * Cualquier orientacion (vertical/horizontal/cuadrada) queda uniforme.
 */
async function validarImagenSubida(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (!buf.length) return { ok: false, error: 'Archivo de imagen vacio.' };
  if (buf.length > 5 * 1024 * 1024) return { ok: false, error: 'La imagen supera el limite de 5 MB.' };

  const tipo = await _detectarTipo(buf);
  if (!tipo || !MIME_IMAGEN[tipo.mime]) {
    return { ok: false, error: 'La imagen debe ser JPG, PNG o WebP valido (contenido no coincide).' };
  }

  try {
    const out = await sharp(buf, { failOn: 'error' })
      .rotate()
      .resize(FOTO_PRODUCTO_W, FOTO_PRODUCTO_H, {
        fit: 'cover',
        position: 'centre'
      })
      .jpeg({ quality: FOTO_PRODUCTO_JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
    return { ok: true, buffer: out, mime: 'image/jpeg', ext: 'jpg' };
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
  FOTO_PRODUCTO_W,
  FOTO_PRODUCTO_H
};
