'use strict';

/**
 * Genera o verifica el secreto TOTP del admin (Google Authenticator).
 *
 * Uso:
 *   node scripts/generar-admin-totp.js
 *       → imprime ADMIN_TOTP_SECRET, otpauth:// y QR en terminal
 *
 *   node scripts/generar-admin-totp.js verify <SECRET> <CODIGO>
 *       → verifica un codigo de 6 digitos contra el secret
 *
 * Despues de escanear el QR, agrega al .env del VPS:
 *   ADMIN_TOTP_SECRET=...
 * y reinicia el motor. Con el secret definido, el login exige 2FA.
 */

const { generateSecret, generateURI, verifySync, generateSync } = require('otplib');
const qrcode = require('qrcode');

const ISSUER = process.env.ADMIN_TOTP_ISSUER || 'AGORATUM Admin';
const LABEL  = process.env.ADMIN_TOTP_LABEL  || 'admin';

async function generar() {
  const secret = generateSecret();
  const uri = generateURI({
    issuer: ISSUER,
    label: LABEL,
    secret: secret
  });

  console.log('');
  console.log('=== Admin TOTP (Google Authenticator) ===');
  console.log('');
  console.log('1) Agrega esto al .env del VPS (DESPUES de escanear el QR):');
  console.log('');
  console.log('ADMIN_TOTP_SECRET=' + secret);
  console.log('');
  console.log('2) URI otpauth (si no puedes escanear el QR, ingresala manualmente):');
  console.log(uri);
  console.log('');
  console.log('3) Escanea este QR con Google Authenticator:');
  console.log('');

  const qr = await qrcode.toString(uri, { type: 'terminal', small: true });
  console.log(qr);

  const sample = generateSync({ secret: secret });
  console.log('Codigo actual de prueba (cambia cada 30s):', sample);
  console.log('');
  console.log('Para verificar un codigo:');
  console.log('  node scripts/generar-admin-totp.js verify ' + secret + ' 123456');
  console.log('');
  console.log('IMPORTANTE: escanea el QR ANTES de poner ADMIN_TOTP_SECRET en el VPS.');
  console.log('Con el secret en el .env, el login admin exigira el segundo paso TOTP.');
  console.log('');
}

function verificar(secret, codigo) {
  const token = String(codigo || '').replace(/\s+/g, '');
  const sec = String(secret || '').trim();
  if (!sec || !/^\d{6}$/.test(token)) {
    console.error('Uso: node scripts/generar-admin-totp.js verify <SECRET> <CODIGO_6_DIGITOS>');
    process.exit(1);
  }
  const result = verifySync({
    token: token,
    secret: sec,
    epochTolerance: 30
  });
  if (result && result.valid) {
    console.log('OK — codigo valido (delta=' + result.delta + '). Ya puedes poner ADMIN_TOTP_SECRET en el .env.');
    process.exit(0);
  }
  console.error('FAIL — codigo invalido o expirado. Reintenta con el codigo actual de Authenticator.');
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === 'verify') {
    verificar(args[1], args[2]);
    return;
  }
  await generar();
}

main().catch(function (e) {
  console.error(e.message || e);
  process.exit(1);
});
