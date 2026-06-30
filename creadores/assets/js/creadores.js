'use strict';

// TODO: en local usar http://localhost:3002 o http://localhost:80 segun el motor
const MOTOR_URL = 'https://motor.ecommerceagents.store';

const CR_SESION_KEY = 'ea_creador_sesion';

var currentCreador = { id: null, nombre: '', email: '' };

/* ── Session helpers ─────────────────────────────────────── */

function _getCreadorId() {
  return currentCreador.id || null;
}

function _guardarSesion(c) {
  currentCreador.id     = c.id;
  currentCreador.nombre = c.nombre || '';
  currentCreador.email  = c.email  || '';
  try {
    sessionStorage.setItem(CR_SESION_KEY, JSON.stringify(c));
  } catch (e) {}
}

function _restaurarSesion(c) {
  _guardarSesion(c);
}

function _limpiarSesion() {
  currentCreador = { id: null, nombre: '', email: '' };
  try { sessionStorage.removeItem(CR_SESION_KEY); } catch (e) {}
}

function _creadorFetch(url, opts) {
  var uid = _getCreadorId();
  opts = opts || {};
  if (!opts.headers) opts.headers = {};
  if (uid) opts.headers['x-creador-id'] = uid;
  return fetch(url, opts).then(function (r) {
    if (r.status === 401) {
      _limpiarSesion();
      mostrarAuth();
      return Promise.reject(new Error('Sesion expirada. Vuelve a iniciar sesion.'));
    }
    return r;
  });
}

/* ── UI toggles ─────────────────────────────────────────── */

function mostrarAuth() {
  document.getElementById('cr-auth-screen').hidden = false;
  document.getElementById('cr-dashboard').hidden   = true;
  document.getElementById('cr-nav-logout').hidden  = true;
  document.getElementById('cr-nav-badge').hidden     = true;
}

function mostrarDashboard() {
  document.getElementById('cr-auth-screen').hidden = true;
  document.getElementById('cr-dashboard').hidden   = false;
  document.getElementById('cr-nav-logout').hidden  = false;
  document.getElementById('cr-nav-badge').hidden     = false;
  document.getElementById('cr-welcome-nombre').textContent = currentCreador.nombre || currentCreador.email;
}

function switchAuthTab(tab) {
  var isLogin = tab === 'login';
  document.getElementById('cr-tab-login').classList.toggle('active', isLogin);
  document.getElementById('cr-tab-registro').classList.toggle('active', !isLogin);
  document.getElementById('cr-panel-login').hidden    = !isLogin;
  document.getElementById('cr-panel-registro').hidden = isLogin;
  _clearMsg('cr-login-msg');
  _clearMsg('cr-reg-msg');
}

function _clearMsg(id) {
  var el = document.getElementById(id);
  if (el) { el.textContent = ''; el.className = 'cr-msg'; el.style.display = 'none'; }
}

function _showMsg(id, text, ok) {
  var el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = 'cr-msg ' + (ok ? 'cr-msg--ok' : 'cr-msg--err');
  el.style.display = 'block';
}

/* ── Login ──────────────────────────────────────────────── */

async function creadorLogin() {
  var email    = (document.getElementById('cr-login-email').value    || '').trim();
  var password = (document.getElementById('cr-login-password').value || '');
  var btn      = document.getElementById('cr-login-btn');

  if (!email || !password) {
    _showMsg('cr-login-msg', 'Completa email y contraseña.', false);
    return;
  }

  if (btn) btn.disabled = true;
  _clearMsg('cr-login-msg');

  try {
    var r = await fetch(MOTOR_URL + '/api/creador/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    var d = await r.json();
    if (!d.ok) throw new Error(d.error || 'Error al iniciar sesion.');

    _restaurarSesion(d.creador);
    mostrarDashboard();
  } catch (e) {
    _showMsg('cr-login-msg', e.message || 'Error de conexion.', false);
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* ── Registro ───────────────────────────────────────────── */

async function creadorRegistro() {
  var nombre   = (document.getElementById('cr-reg-nombre').value   || '').trim();
  var email    = (document.getElementById('cr-reg-email').value    || '').trim();
  var password = (document.getElementById('cr-reg-password').value || '');
  var confirm  = (document.getElementById('cr-reg-confirm').value  || '');
  var btn      = document.getElementById('cr-reg-btn');

  if (!email || !password) {
    _showMsg('cr-reg-msg', 'Email y contraseña son obligatorios.', false);
    return;
  }
  if (password.length < 6) {
    _showMsg('cr-reg-msg', 'La contraseña debe tener al menos 6 caracteres.', false);
    return;
  }
  if (password !== confirm) {
    _showMsg('cr-reg-msg', 'Las contraseñas no coinciden.', false);
    return;
  }

  if (btn) btn.disabled = true;
  _clearMsg('cr-reg-msg');

  try {
    var r = await fetch(MOTOR_URL + '/api/creador/registro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, email, password })
    });
    var d = await r.json();
    if (!d.ok) throw new Error(d.error || 'Error al registrarse.');

    _restaurarSesion(d.creador);
    mostrarDashboard();
  } catch (e) {
    _showMsg('cr-reg-msg', e.message || 'Error de conexion.', false);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function creadorLogout() {
  _limpiarSesion();
  mostrarAuth();
  switchAuthTab('login');
}

/* ── Init ───────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', function () {
  try {
    var raw = sessionStorage.getItem(CR_SESION_KEY);
    if (raw) {
      var c = JSON.parse(raw);
      if (c && c.id) {
        _restaurarSesion(c);
        mostrarDashboard();
        return;
      }
    }
  } catch (e) {}
  mostrarAuth();
  switchAuthTab('login');
});
