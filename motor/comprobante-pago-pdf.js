'use strict';

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const BRAND = {
  indigo: '#1a6bff',
  violet: '#8b2fd6',
  ink: '#0a1628',
  muted: '#5a5f74',
  line: '#e8eaf0',
  soft: '#f6f7fb',
  success: '#0f7a4a'
};

function _money(n) {
  const v = Number(n) || 0;
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function _fmtFecha(iso) {
  try {
    const d = new Date(iso || Date.now());
    return d.toLocaleString('es-MX', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (_) {
    return String(iso || '');
  }
}

function _logoPath() {
  const candidates = [
    path.join(__dirname, 'assets/logo-activos.png'),
    path.join(__dirname, 'assets/logo-activos.jpg'),
    path.join(__dirname, 'assets/img/logo-activos.png'),
    path.join(__dirname, '../creadores/assets/img/logo-activos.png'),
    path.join(__dirname, '../creadores/assets/img/logo.jpg')
  ];
  for (let i = 0; i < candidates.length; i++) {
    try {
      if (fs.existsSync(candidates[i])) return candidates[i];
    } catch (_) { /* ignore */ }
  }
  return null;
}

/**
 * Genera un PDF Buffer de comprobante de pago a creador.
 * @param {object} pago
 * @param {string} pago.numero_comprobante
 * @param {string} pago.fecha
 * @param {string} pago.creador_nombre
 * @param {number} pago.total_vendido
 * @param {number} pago.comision_plataforma
 * @param {number} pago.total_pagado
 * @param {Array}  pago.detalle
 * @param {number} [pago.plataforma_pct]
 * @param {number} [pago.creador_pct]
 * @returns {Promise<Buffer>}
 */
function generarComprobantePagoPdf(pago) {
  return new Promise(function (resolve, reject) {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 48,
        info: {
          Title: 'Comprobante ' + (pago.numero_comprobante || ''),
          Author: 'AGORATUM · Activos Digitales',
          Subject: 'Comprobante de pago a creador'
        }
      });
      const chunks = [];
      doc.on('data', function (c) { chunks.push(c); });
      doc.on('end', function () { resolve(Buffer.concat(chunks)); });
      doc.on('error', reject);

      const pageW = doc.page.width;
      const left = doc.page.margins.left;
      const right = pageW - doc.page.margins.right;
      const contentW = right - left;
      const platPct = Number(pago.plataforma_pct) || 12;
      const creadorPct = Number(pago.creador_pct) || (100 - platPct);

      // Header bar
      doc.rect(0, 0, pageW, 96).fill(BRAND.ink);
      const logo = _logoPath();
      let textX = left;
      if (logo) {
        try {
          doc.image(logo, left, 22, { fit: [240, 52], align: 'left', valign: 'center' });
          textX = left + 252;
        } catch (_) { /* logo opcional */ }
      }
      doc.fillColor('#c9cde0')
        .font('Helvetica')
        .fontSize(10)
        .text('Comprobante de pago a creador', textX, 40, { width: Math.max(80, contentW - (textX - left)) });

      let y = 120;

      // Meta box
      doc.roundedRect(left, y, contentW, 72, 8).fill(BRAND.soft);
      doc.fillColor(BRAND.muted).font('Helvetica').fontSize(9)
        .text('NUMERO DE COMPROBANTE', left + 16, y + 14);
      doc.fillColor(BRAND.indigo).font('Helvetica-Bold').fontSize(16)
        .text(String(pago.numero_comprobante || '—'), left + 16, y + 28);
      doc.fillColor(BRAND.muted).font('Helvetica').fontSize(9)
        .text('FECHA', left + contentW / 2, y + 14);
      doc.fillColor(BRAND.ink).font('Helvetica').fontSize(11)
        .text(_fmtFecha(pago.fecha), left + contentW / 2, y + 30, { width: contentW / 2 - 20 });
      y += 92;

      doc.fillColor(BRAND.muted).font('Helvetica').fontSize(9).text('PAGADO A', left, y);
      y += 14;
      doc.fillColor(BRAND.ink).font('Helvetica-Bold').fontSize(14)
        .text(String(pago.creador_nombre || 'Creador'), left, y);
      y += 28;

      doc.moveTo(left, y).lineTo(right, y).strokeColor(BRAND.line).lineWidth(1).stroke();
      y += 18;

      doc.fillColor(BRAND.ink).font('Helvetica-Bold').fontSize(12).text('Detalle de productos', left, y);
      y += 18;

      // Table header
      const colNombre = left;
      const colCant = left + contentW * 0.52;
      const colMonto = left + contentW * 0.68;
      doc.rect(left, y, contentW, 22).fill(BRAND.ink);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9);
      doc.text('Producto', colNombre + 10, y + 7);
      doc.text('Ventas', colCant, y + 7, { width: 60, align: 'right' });
      doc.text('Monto generado', colMonto, y + 7, { width: right - colMonto - 10, align: 'right' });
      y += 22;

      const detalle = Array.isArray(pago.detalle) ? pago.detalle : [];
      if (!detalle.length) {
        doc.fillColor(BRAND.muted).font('Helvetica').fontSize(10)
          .text('Sin detalle de productos.', left + 10, y + 10);
        y += 30;
      } else {
        detalle.forEach(function (row, idx) {
          if (y > 700) {
            doc.addPage();
            y = 48;
          }
          if (idx % 2 === 0) {
            doc.rect(left, y, contentW, 24).fill('#fafbfe');
          }
          doc.fillColor(BRAND.ink).font('Helvetica').fontSize(10);
          doc.text(String(row.nombre || 'Producto'), colNombre + 10, y + 7, {
            width: colCant - colNombre - 16,
            ellipsis: true
          });
          doc.text(String(row.cantidad || 0), colCant, y + 7, { width: 60, align: 'right' });
          doc.text(_money(row.monto_generado), colMonto, y + 7, {
            width: right - colMonto - 10,
            align: 'right'
          });
          y += 24;
        });
      }

      y += 16;
      doc.moveTo(left, y).lineTo(right, y).strokeColor(BRAND.line).lineWidth(1).stroke();
      y += 20;

      doc.fillColor(BRAND.ink).font('Helvetica-Bold').fontSize(12).text('Resumen', left, y);
      y += 16;

      function resumenLinea(label, value, opts) {
        opts = opts || {};
        doc.fillColor(opts.muted ? BRAND.muted : BRAND.ink)
          .font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(opts.size || 11)
          .text(label, left, y, { width: contentW * 0.6 });
        doc.fillColor(opts.valueColor || BRAND.ink)
          .font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(opts.size || 11)
          .text(value, left + contentW * 0.55, y, { width: contentW * 0.45, align: 'right' });
        y += opts.gap || 18;
      }

      resumenLinea('Total vendido', _money(pago.total_vendido));
      resumenLinea(
        'Comision plataforma (' + platPct + '%)',
        _money(pago.comision_plataforma),
        { muted: true }
      );

      y += 6;
      doc.roundedRect(left, y, contentW, 44, 8).fill(BRAND.indigo);
      doc.fillColor('#ffffff').font('Helvetica').fontSize(9)
        .text('TOTAL PAGADO AL CREADOR (' + creadorPct + '%)', left + 16, y + 10);
      doc.font('Helvetica-Bold').fontSize(18)
        .text(_money(pago.total_pagado), left + 16, y + 22, { width: contentW - 32, align: 'right' });
      y += 60;

      doc.fillColor(BRAND.muted).font('Helvetica').fontSize(8)
        .text(
          'Documento generado por AGORATUM · Activos Digitales. Los montos corresponden al reparto guardado en cada venta (snapshot). ' +
          'La tarifa vigente para ventas nuevas es ' + platPct + '% plataforma / ' + creadorPct + '% creador.',
          left,
          y,
          { width: contentW, align: 'left', lineGap: 2 }
        );

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

module.exports = { generarComprobantePagoPdf };
