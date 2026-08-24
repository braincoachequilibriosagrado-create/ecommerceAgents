'use strict';

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || '';

const JWT_EXPIRES = {
  vendedor: process.env.JWT_EXPIRES_VENDEDOR || '7d',
  // Punto 9: TTL corto por defecto (48h). Override con JWT_EXPIRES_CREADOR (ej. 24h, 7d).
  creador:  process.env.JWT_EXPIRES_CREADOR  || '48h',
  admin:    process.env.JWT_EXPIRES_ADMIN    || '12h'
};

const ROLES = {
  ADMIN:    'admin',
  VENDEDOR: 'vendedor',
  CREADOR:  'creador'
};

function assertJwtConfigured() {
  if (!JWT_SECRET || JWT_SECRET.length < 16) {
    throw new Error('JWT_SECRET no configurado o demasiado corto en el servidor');
  }
}

function signToken(payload, expiresIn) {
  assertJwtConfigured();
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

function signVendedorToken(usuarioId) {
  return signToken({ sub: String(usuarioId), role: ROLES.VENDEDOR }, JWT_EXPIRES.vendedor);
}

function signCreadorToken(creadorId) {
  return signToken({ sub: String(creadorId), role: ROLES.CREADOR }, JWT_EXPIRES.creador);
}

function signAdminToken() {
  return signToken({ sub: 'admin', role: ROLES.ADMIN }, JWT_EXPIRES.admin);
}

/** JWT corto post-password; NO tiene role admin (no sirve como sesion). */
function signAdmin2faChallenge() {
  return signToken({ sub: 'admin', purpose: 'admin_2fa' }, '3m');
}

function verifyAdmin2faChallenge(token) {
  try {
    const decoded = verifyToken(String(token || ''));
    if (!decoded || decoded.purpose !== 'admin_2fa' || decoded.sub !== 'admin') return null;
    if (decoded.role) return null; // rechazar si alguien firma role por error
    return decoded;
  } catch (_) {
    return null;
  }
}

function verifyToken(token) {
  assertJwtConfigured();
  return jwt.verify(token, JWT_SECRET);
}

function extractBearer(req) {
  const raw = req.headers.authorization || req.headers.Authorization || '';
  if (typeof raw === 'string' && raw.startsWith('Bearer ')) {
    return raw.slice(7).trim();
  }
  return null;
}

function decodeAuth(req) {
  const token = extractBearer(req);
  if (!token) return null;
  try {
    return verifyToken(token);
  } catch (_) {
    return null;
  }
}

module.exports = {
  JWT_SECRET,
  ROLES,
  signVendedorToken,
  signCreadorToken,
  signAdminToken,
  signAdmin2faChallenge,
  verifyAdmin2faChallenge,
  verifyToken,
  extractBearer,
  decodeAuth,
  assertJwtConfigured
};
