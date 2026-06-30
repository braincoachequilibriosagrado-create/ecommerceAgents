'use strict';

const MOTOR_URL = 'https://motor.ecommerceagents.store';

const CR_SESION_KEY = 'ea_creador_sesion';
const CR_TABS = ['cuentas', 'subir', 'info'];

var currentCreador = { id: null, nombre: '', email: '' };
var _htmlMode = 'pegar';
var _htmlFromFile = '';

/* ── Session helpers ─────────────────────────────────────── */

function _getCreadorId() {
  return currentCreador.id || null;
}

function _guardarSesion(c) {
  currentCreador.id     = c.id;
  currentCreador.nombre = c.nombre || '';
  currentCreador.email  = c.email  || '';
  try { sessionStorage.setItem(CR_SESION_KEY, JSON.stringify(c)); } catch (e) {}
  _actualizarNavNombre();
}

function _restaurarSesion(c) { _guardarSesion(c); }

function _limpiarSesion() {
  currentCreador = { id: null, nombre: '', email: '' };
  try { sessionStorage.removeItem(CR_SESION_KEY); } catch (e) {}
}

function _actualizarNavNombre() {
  var n = currentCreador.nombre || currentCreador.email || 'Creador';
  var el = document.getElementById('cr-nav-nombre');
  if (el) el.textContent = n;
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

function _fmtUsd(n) {
  return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function _esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ── Auth UI ─────────────────────────────────────────────── */

function _setView(showAuth) {
  var auth = document.getElementById('cr-auth-screen');
  var dash = document.getElementById('cr-dashboard');
  if (auth) auth.hidden = !showAuth;
  if (dash) dash.hidden = showAuth;
}

function mostrarAuth() {
  _setView(true);
  document.getElementById('cr-nav-logout').hidden = true;
  document.getElementById('cr-nav-badge').hidden  = true;
  document.getElementById('cr-nav-hola').hidden   = true;
}

function mostrarDashboard() {
  _setView(false);
  document.getElementById('cr-nav-logout').hidden = false;
  document.getElementById('cr-nav-badge').hidden  = false;
  document.getElementById('cr-nav-hola').hidden   = false;
  _actualizarNavNombre();
  switchCrTab('cuentas');
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

async function creadorLogin() {
  var email    = (document.getElementById('cr-login-email').value    || '').trim();
  var password = (document.getElementById('cr-login-password').value || '');
  var btn      = document.getElementById('cr-login-btn');
  if (!email || !password) { _showMsg('cr-login-msg', 'Completa email y contraseña.', false); return; }
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

async function creadorRegistro() {
  var nombre   = (document.getElementById('cr-reg-nombre').value   || '').trim();
  var email    = (document.getElementById('cr-reg-email').value    || '').trim();
  var password = (document.getElementById('cr-reg-password').value || '');
  var confirm  = (document.getElementById('cr-reg-confirm').value  || '');
  var btn      = document.getElementById('cr-reg-btn');
  if (!email || !password) { _showMsg('cr-reg-msg', 'Email y contraseña son obligatorios.', false); return; }
  if (password.length < 6) { _showMsg('cr-reg-msg', 'La contraseña debe tener al menos 6 caracteres.', false); return; }
  if (password !== confirm) { _showMsg('cr-reg-msg', 'Las contraseñas no coinciden.', false); return; }
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

/* ── Dashboard tabs ──────────────────────────────────────── */

function switchCrTab(tabId) {
  CR_TABS.forEach(function (id) {
    var panel = document.getElementById('cr-panel-' + id);
    var btn   = document.getElementById('cr-dash-tab-' + id);
    var active = id === tabId;
    if (panel) { panel.hidden = !active; panel.classList.toggle('active', active); }
    if (btn)   btn.classList.toggle('active', active);
  });
  if (tabId === 'subir')    cargarMiniappsLista();
  if (tabId === 'info')     cargarInfoCreador();
  if (tabId === 'cuentas')  cargarCuentasCreador();
}

/* ── HTML input modes ────────────────────────────────────── */

function switchHtmlMode(mode) {
  _htmlMode = mode;
  var pegar = mode === 'pegar';
  document.getElementById('cr-html-tab-pegar').classList.toggle('active', pegar);
  document.getElementById('cr-html-tab-archivo').classList.toggle('active', !pegar);
  document.getElementById('cr-html-textarea').hidden = !pegar;
  document.getElementById('cr-html-file-wrap').hidden = pegar;
}

function onHtmlFileSelected(input) {
  var file = input.files && input.files[0];
  var nameEl = document.getElementById('cr-html-file-name');
  if (!file) {
    _htmlFromFile = '';
    if (nameEl) nameEl.textContent = '';
    return;
  }
  var reader = new FileReader();
  reader.onload = function (e) {
    _htmlFromFile = e.target.result || '';
    if (nameEl) nameEl.textContent = 'Archivo cargado: ' + file.name + ' (' + _htmlFromFile.length + ' caracteres)';
  };
  reader.readAsText(file);
}

function previewFoto(input, previewId) {
  var file = input.files && input.files[0];
  var img = document.getElementById(previewId);
  var phId = previewId.replace('-preview', '-ph');
  var ph = document.getElementById(phId);
  if (!file) {
    if (img) { img.hidden = true; img.src = ''; }
    if (ph) ph.hidden = false;
    return;
  }
  var reader = new FileReader();
  reader.onload = function (e) {
    if (img) {
      img.src = e.target.result;
      img.hidden = false;
    }
    if (ph) ph.hidden = true;
  };
  reader.readAsDataURL(file);
}

function onPdfSelected(input) {
  var file = input.files && input.files[0];
  var lbl = document.getElementById('cr-pdf-label');
  if (lbl) lbl.textContent = file ? file.name : 'Seleccionar PDF';
}

function _resetSubirForm() {
  document.getElementById('cr-html-textarea').value = '';
  document.getElementById('cr-ma-nombre').value = '';
  document.getElementById('cr-ma-precio').value = '';
  document.getElementById('cr-ma-precio-promo').value = '';
  document.getElementById('cr-ma-desc').value = '';
  document.getElementById('cr-ma-usa-ia').checked = false;
  document.getElementById('cr-ma-vendedores').checked = false;
  document.getElementById('cr-ma-comision').value = '';
  _htmlFromFile = '';
  var htmlFile = document.getElementById('cr-html-file');
  if (htmlFile) htmlFile.value = '';
  var htmlName = document.getElementById('cr-html-file-name');
  if (htmlName) htmlName.textContent = '';
  var foto1 = document.getElementById('cr-foto1');
  var foto2 = document.getElementById('cr-foto2');
  var pdf = document.getElementById('cr-pdf');
  if (foto1) foto1.value = '';
  if (foto2) foto2.value = '';
  if (pdf) pdf.value = '';
  previewFoto({ files: [] }, 'cr-foto1-preview');
  previewFoto({ files: [] }, 'cr-foto2-preview');
  onPdfSelected({ files: [] });
  switchHtmlMode('pegar');
  toggleComisionField();
}

function _obtenerHtml() {
  if (_htmlMode === 'archivo') return _htmlFromFile.trim();
  return (document.getElementById('cr-html-textarea').value || '').trim();
}

function toggleComisionField() {
  var chk = document.getElementById('cr-ma-vendedores');
  var wrap = document.getElementById('cr-comision-wrap');
  if (wrap) wrap.hidden = !(chk && chk.checked);
}

/* ── Subir mini app ──────────────────────────────────────── */

async function publicarMiniapp() {
  var btn = document.getElementById('cr-ma-publicar-btn');
  var btnText = document.getElementById('cr-ma-publicar-text');
  var html = _obtenerHtml();
  var nombre = (document.getElementById('cr-ma-nombre').value || '').trim();
  var precio = parseFloat(document.getElementById('cr-ma-precio').value);
  var precioPromo = parseFloat(document.getElementById('cr-ma-precio-promo').value);
  var descripcion = (document.getElementById('cr-ma-desc').value || '').trim();
  var usa_ia = document.getElementById('cr-ma-usa-ia').checked;
  var disponible_vendedores = document.getElementById('cr-ma-vendedores').checked;
  var comision_vendedor = parseFloat(document.getElementById('cr-ma-comision').value) || 0;
  var foto1Input = document.getElementById('cr-foto1');
  var foto2Input = document.getElementById('cr-foto2');
  var pdfInput = document.getElementById('cr-pdf');

  if (!html) { _showMsg('cr-subir-msg', 'El HTML no puede estar vacio.', false); return; }
  if (!nombre) { _showMsg('cr-subir-msg', 'El nombre es obligatorio.', false); return; }
  if (!precio || precio <= 0) { _showMsg('cr-subir-msg', 'Ingresa un precio normal valido.', false); return; }
  if (!foto1Input || !foto1Input.files || !foto1Input.files[0]) {
    _showMsg('cr-subir-msg', 'La foto 1 del producto es obligatoria.', false);
    return;
  }

  var fd = new FormData();
  fd.append('html', html);
  fd.append('nombre', nombre);
  fd.append('descripcion', descripcion);
  fd.append('precio', String(precio));
  if (precioPromo > 0) fd.append('precio_promocion', String(precioPromo));
  fd.append('usa_ia', usa_ia ? 'true' : 'false');
  fd.append('disponible_vendedores', disponible_vendedores ? 'true' : 'false');
  if (disponible_vendedores) fd.append('comision_vendedor', String(comision_vendedor));
  fd.append('foto1', foto1Input.files[0]);
  if (foto2Input && foto2Input.files && foto2Input.files[0]) {
    fd.append('foto2', foto2Input.files[0]);
  }
  if (pdfInput && pdfInput.files && pdfInput.files[0]) {
    fd.append('pdf', pdfInput.files[0]);
  }

  if (btn) btn.disabled = true;
  if (btnText) btnText.textContent = 'Subiendo...';
  _clearMsg('cr-subir-msg');

  try {
    var r = await _creadorFetch(MOTOR_URL + '/api/creador/miniapps/subir', {
      method: 'POST',
      body: fd
    });
    var d = await r.json();
    if (!d.ok) throw new Error(d.error || 'Error al publicar.');

    var link = d.url || (MOTOR_URL + '/miniapps/' + (d.miniapp && d.miniapp.slug));
    _showMsg('cr-subir-msg', 'Mini app publicada correctamente. Slug: ' + d.miniapp.slug + ' — ' + link, true);

    _resetSubirForm();
    cargarMiniappsLista();
  } catch (e) {
    _showMsg('cr-subir-msg', e.message || 'Error de conexion.', false);
  } finally {
    if (btn) btn.disabled = false;
    if (btnText) btnText.textContent = 'Publicar mini app';
  }
}

async function cargarMiniappsLista() {
  var wrap = document.getElementById('cr-ma-lista');
  var countEl = document.getElementById('cr-ma-count');
  if (!wrap) return;
  wrap.innerHTML = '<p class="cr-empty">Cargando...</p>';
  if (countEl) countEl.textContent = '';

  try {
    var r = await _creadorFetch(MOTOR_URL + '/api/creador/miniapps');
    var d = await r.json();
    if (!d.ok) throw new Error(d.error || 'Error');

    var list = d.miniapps || [];
    if (countEl) {
      countEl.textContent = list.length
        ? list.length + ' producto' + (list.length !== 1 ? 's' : '')
        : '';
    }

    if (!list.length) {
      wrap.innerHTML = '<p class="cr-empty">Aun no has publicado ninguna mini app.</p>';
      return;
    }

    wrap.innerHTML = list.map(function (m) {
      var imgUrl = MOTOR_URL + '/api/miniapps/asset/' + encodeURIComponent(m.slug) + '/foto1';
      var tipoLabel = m.tipo_producto === 'html_pdf' ? 'HTML + PDF' : 'HTML';
      var tipoClass = m.tipo_producto === 'html_pdf' ? 'cr-product-tag--pdf' : 'cr-product-tag--html';
      var iaBadge = m.usa_ia
        ? '<span class="cr-product-tag cr-product-tag--ia">Usa IA</span>'
        : '';
      var checked = m.disponible_vendedores ? ' checked' : '';

      var precioHtml = '';
      if (m.precio_promocion && Number(m.precio_promocion) > 0) {
        precioHtml =
          '<span class="cr-product-price-old">' + _fmtUsd(m.precio) + '</span>' +
          '<span class="cr-product-price-promo">' + _fmtUsd(m.precio_promocion) + '</span>';
      } else {
        precioHtml = '<span class="cr-product-price-promo">' + _fmtUsd(m.precio) + '</span>';
      }

      return (
        '<article class="cr-product-card" id="cr-ma-item-' + m.id + '">' +
          '<div class="cr-product-thumb">' +
            '<img src="' + imgUrl + '" alt="' + _esc(m.nombre) + '" loading="lazy" onerror="this.parentElement.classList.add(\'cr-product-thumb--empty\')" />' +
          '</div>' +
          '<div class="cr-product-body">' +
            '<h4 class="cr-product-name">' + _esc(m.nombre) + '</h4>' +
            '<p class="cr-product-slug">' + _esc(m.slug) + '</p>' +
            '<div class="cr-product-prices">' + precioHtml + '</div>' +
            '<div class="cr-product-tags">' +
              '<span class="cr-product-tag ' + tipoClass + '">' + tipoLabel + '</span>' +
              iaBadge +
            '</div>' +
            '<label class="cr-product-toggle">' +
              '<input type="checkbox"' + checked + ' onchange="toggleVendedores(\'' + m.id + '\', this.checked)" />' +
              '<span>Disponible para vendedores</span>' +
            '</label>' +
          '</div>' +
        '</article>'
      );
    }).join('');
  } catch (e) {
    wrap.innerHTML = '<p class="cr-empty cr-empty--err">' + _esc(e.message) + '</p>';
  }
}

async function toggleVendedores(miniappId, disponible) {
  try {
    var r = await _creadorFetch(MOTOR_URL + '/api/creador/miniapps/toggle-vendedores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ miniapp_id: miniappId, disponible: disponible })
    });
    var d = await r.json();
    if (!d.ok) throw new Error(d.error || 'Error');
  } catch (e) {
    alert(e.message || 'Error al actualizar.');
    cargarMiniappsLista();
  }
}

/* ── Informacion ─────────────────────────────────────────── */

async function cargarInfoCreador() {
  _clearMsg('cr-info-msg');
  try {
    var r = await _creadorFetch(MOTOR_URL + '/api/creador/info');
    var d = await r.json();
    if (!d.ok) throw new Error(d.error || 'Error');
    document.getElementById('cr-info-nombre').value = d.creador.nombre || '';
    document.getElementById('cr-info-email').value  = d.creador.email  || '';
    if (d.creador.nombre) {
      currentCreador.nombre = d.creador.nombre;
      _actualizarNavNombre();
      try {
        var raw = sessionStorage.getItem(CR_SESION_KEY);
        if (raw) {
          var u = JSON.parse(raw);
          u.nombre = d.creador.nombre;
          sessionStorage.setItem(CR_SESION_KEY, JSON.stringify(u));
        }
      } catch (_) {}
    }
  } catch (e) {
    _showMsg('cr-info-msg', e.message || 'Error al cargar.', false);
  }
}

async function guardarInfoCreador() {
  var btn = document.getElementById('cr-info-save-btn');
  var nombre = (document.getElementById('cr-info-nombre').value || '').trim();
  if (!nombre) { _showMsg('cr-info-msg', 'El nombre es obligatorio.', false); return; }
  if (btn) btn.disabled = true;
  _clearMsg('cr-info-msg');
  try {
    var r = await _creadorFetch(MOTOR_URL + '/api/creador/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre })
    });
    var d = await r.json();
    if (!d.ok) throw new Error(d.error || 'Error');
    currentCreador.nombre = d.creador.nombre;
    _actualizarNavNombre();
    try {
      var raw = sessionStorage.getItem(CR_SESION_KEY);
      if (raw) {
        var u = JSON.parse(raw);
        u.nombre = d.creador.nombre;
        sessionStorage.setItem(CR_SESION_KEY, JSON.stringify(u));
      }
    } catch (_) {}
    _showMsg('cr-info-msg', 'Informacion actualizada correctamente.', true);
  } catch (e) {
    _showMsg('cr-info-msg', e.message || 'Error al guardar.', false);
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* ── Cuentas ─────────────────────────────────────────────── */

async function cargarCuentasCreador() {
  document.getElementById('cr-stat-ventas').textContent   = '...';
  document.getElementById('cr-stat-ganancia').textContent  = '...';
  document.getElementById('cr-stat-pagar').textContent    = '...';
  document.getElementById('cr-cuentas-tabla').innerHTML = '<p class="cr-empty">Cargando...</p>';

  try {
    var r = await _creadorFetch(MOTOR_URL + '/api/creador/cuentas');
    var d = await r.json();
    if (!d.ok) throw new Error(d.error || 'Error');

    var res = d.resumen || {};
    document.getElementById('cr-stat-ventas').textContent  = res.ventas_totales || 0;
    document.getElementById('cr-stat-ganancia').textContent = _fmtUsd(res.ganancia_total);
    document.getElementById('cr-stat-pagar').textContent   = _fmtUsd(res.por_pagar);

    var apps = d.miniapps || [];
    if (!apps.length) {
      document.getElementById('cr-cuentas-tabla').innerHTML = '<p class="cr-empty">No tienes mini apps publicadas.</p>';
      return;
    }

    var rows = apps.map(function (m) {
      return '<tr>' +
        '<td class="cr-td-name">' + _esc(m.nombre) + '</td>' +
        '<td class="cr-td-muted">' + _esc(m.slug) + '</td>' +
        '<td>' + (m.ventas || 0) + '</td>' +
        '<td class="cr-td-money">' + _fmtUsd(m.ganancia) + '</td>' +
      '</tr>';
    }).join('');

    document.getElementById('cr-cuentas-tabla').innerHTML =
      '<table class="cr-table">' +
      '<thead><tr><th>Mini app</th><th>Slug</th><th>Ventas</th><th>Tu ganancia</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table>';
  } catch (e) {
    document.getElementById('cr-cuentas-tabla').innerHTML =
      '<p class="cr-empty cr-empty--err">' + _esc(e.message) + '</p>';
  }
}

/* ── Init ───────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', function () {
  switchHtmlMode('pegar');
  toggleComisionField();
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
