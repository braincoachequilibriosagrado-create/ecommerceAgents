'use strict';

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || '';

const JWT_EXPIRES = {
  vendedor: process.env.JWT_EXPIRES_VENDEDOR || '7d',
  creador:  process.env.JWT_EXPIRES_CREADOR  || '7d',
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
  verifyToken,
  extractBearer,
  decodeAuth,
  assertJwtConfigured
};
