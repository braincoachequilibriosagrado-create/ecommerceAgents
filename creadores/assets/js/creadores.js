'use strict';

const MOTOR_URL = 'https://motor.ecommerceagents.store';

const CR_SESION_KEY = 'ea_creador_sesion';
const CR_TOKEN_KEY = 'ea_creador_jwt';
const CR_EMAIL_KEY = 'ea_creador_last_email';
const CR_REMEMBER_PREF_KEY = 'ea_creador_remember';
const CR_TABS = ['cuentas', 'catalogo', 'subir', 'info', 'contactar'];
const CR_SOPORTE_WHATSAPP = '393246864824';
const CR_SOPORTE_EMAIL = 'soporte@ecommerceagents.store';
const CR_SOPORTE_WA_MSG = 'Hola, soy creador en MiniApps y necesito ayuda con...';

var currentCreador = { id: null, nombre: '', email: '' };
var _htmlMode = 'pegar';
var _htmlFromFile = '';
var _categoriaActiva = null;

var CR_CATEGORIAS = ['infoproducto', 'contenido_digital', 'miniapp'];

var CR_CATEGORIA_META = {
  infoproducto: {
    title: 'Publicar infoproducto',
    sub: 'Sube tu PDF, las fotos de venta y configura precios.',
    publish: 'Publicar infoproducto',
    nombrePh: 'Ej: Guia completa de inversiones',
    descPh: 'Describe tu infoproducto para vendedores y compradores...'
  },
  contenido_digital: {
    title: 'Publicar contenido digital',
    sub: 'Sube tus videos, las fotos de venta y configura precios.',
    publish: 'Publicar contenido digital',
    nombrePh: 'Ej: Pack 30 reels virales',
    descPh: 'Describe tu contenido digital para vendedores y compradores...'
  },
  miniapp: {
    title: 'Publicar mini app',
    sub: 'Sube el HTML, las fotos de venta y configura precios.',
    publish: 'Publicar mini app',
    nombrePh: 'Ej: Calculadora de macros IA',
    descPh: 'Describe tu mini app para vendedores y compradores...'
  }
};

/* ── Session helpers ─────────────────────────────────────── */

function _getCreadorId() {
  return currentCreador.id || null;
}

function _getCreadorToken() {
  try {
    var t = localStorage.getItem(CR_TOKEN_KEY);
    if (t) return t;
    return sessionStorage.getItem(CR_TOKEN_KEY) || null;
  } catch (e) { return null; }
}

function _guardarToken(token, recordarme) {
  try {
    if (recordarme) {
      localStorage.setItem(CR_TOKEN_KEY, token);
      sessionStorage.removeItem(CR_TOKEN_KEY);
    } else {
      sessionStorage.setItem(CR_TOKEN_KEY, token);
      localStorage.removeItem(CR_TOKEN_KEY);
    }
  } catch (e) {}
}

function _leerSesionAlmacenada() {
  try {
    var raw = localStorage.getItem(CR_SESION_KEY);
    var token = localStorage.getItem(CR_TOKEN_KEY);
    var persistent = true;
    if (!raw || !token) {
      raw = sessionStorage.getItem(CR_SESION_KEY);
      token = sessionStorage.getItem(CR_TOKEN_KEY);
      persistent = false;
    }
    if (raw && token) {
      var c = JSON.parse(raw);
      if (c && c.id) return { c: c, token: token, persistent: persistent };
    }
  } catch (e) {}
  return null;
}

function _aplicarSesionMemoria(c) {
  currentCreador.id     = c.id;
  currentCreador.nombre = c.nombre || '';
  currentCreador.email  = c.email  || '';
  _actualizarNavNombre();
}

function _guardarSesion(c, recordarme, token) {
  _aplicarSesionMemoria(c);
  var payload = JSON.stringify(c);
  try {
    if (recordarme) {
      localStorage.setItem(CR_SESION_KEY, payload);
      sessionStorage.removeItem(CR_SESION_KEY);
      localStorage.setItem(CR_REMEMBER_PREF_KEY, '1');
    } else {
      sessionStorage.setItem(CR_SESION_KEY, payload);
      localStorage.removeItem(CR_SESION_KEY);
      localStorage.setItem(CR_REMEMBER_PREF_KEY, '0');
    }
    if (token) _guardarToken(token, recordarme);
  } catch (e) {}
}

function _actualizarSesionAlmacenada(partial) {
  var stored = _leerSesionAlmacenada();
  if (!stored) return;
  var u = Object.assign({}, stored.c, partial);
  try {
    var payload = JSON.stringify(u);
    if (stored.persistent) localStorage.setItem(CR_SESION_KEY, payload);
    else sessionStorage.setItem(CR_SESION_KEY, payload);
  } catch (e) {}
}

function _guardarEmailReciente(email) {
  try { if (email) localStorage.setItem(CR_EMAIL_KEY, email); } catch (e) {}
}

function _limpiarSesion() {
  currentCreador = { id: null, nombre: '', email: '' };
  try {
    sessionStorage.removeItem(CR_SESION_KEY);
    localStorage.removeItem(CR_SESION_KEY);
    sessionStorage.removeItem(CR_TOKEN_KEY);
    localStorage.removeItem(CR_TOKEN_KEY);
  } catch (e) {}
}

function _crPassIconShow() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
}

function _crPassIconHide() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>' +
    '<path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>' +
    '<line x1="1" y1="1" x2="23" y2="23"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/></svg>';
}

function toggleCrPassword(inputId, btnId) {
  var input = document.getElementById(inputId);
  var btn   = document.getElementById(btnId);
  if (!input || !btn) return;
  var visible = input.type === 'text';
  input.type = visible ? 'password' : 'text';
  btn.innerHTML = visible ? _crPassIconShow() : _crPassIconHide();
  btn.setAttribute('aria-label', visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
}

function _actualizarNavNombre() {
  var n = currentCreador.nombre || currentCreador.email || 'Creador';
  var el = document.getElementById('cr-nav-nombre');
  if (el) el.textContent = n;
}

function _creadorFetch(url, opts) {
  var token = _getCreadorToken();
  opts = opts || {};
  if (!opts.headers) opts.headers = {};
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;
  return fetch(url, opts).then(function (r) {
    if (r.status === 401) {
      _limpiarSesion();
      mostrarAuth();
      switchAuthTab('login');
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
    if (!d.ok || !d.token) throw new Error(d.error || 'Error al iniciar sesion.');
    var recordarme = !!(document.getElementById('cr-login-recordar') && document.getElementById('cr-login-recordar').checked);
    _guardarSesion(d.creador, recordarme, d.token);
    _guardarEmailReciente(email);
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
    if (!d.ok || !d.token) throw new Error(d.error || 'Error al registrarse.');
    _guardarSesion(d.creador, false, d.token);
    _guardarEmailReciente(email);
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
  if (tabId === 'subir')     cargarMiniappsLista();
  if (tabId === 'catalogo')  cargarCatalogoCreador();
  if (tabId === 'info')      cargarInfoCreador();
  if (tabId === 'cuentas')   cargarCuentasCreador();
  if (tabId === 'contactar') initContactarTab();
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

function onPdfInfoSelected(input) {
  var file = input.files && input.files[0];
  var lbl = document.getElementById('cr-pdf-info-label');
  if (lbl) lbl.textContent = file ? file.name : 'Seleccionar PDF';
}

function onVideosSelected(input) {
  var files = input.files ? Array.prototype.slice.call(input.files) : [];
  var lbl = document.getElementById('cr-videos-label');
  var listEl = document.getElementById('cr-videos-list');

  if (files.length > 30) {
    _showMsg('cr-subir-msg', 'Maximo 30 videos por producto.', false);
    input.value = '';
    files = [];
  }

  if (lbl) {
    lbl.textContent = files.length
      ? files.length + ' video' + (files.length === 1 ? '' : 's') + ' seleccionado' + (files.length === 1 ? '' : 's')
      : 'Seleccionar videos';
  }

  if (!listEl) return;
  if (!files.length) {
    listEl.hidden = true;
    listEl.innerHTML = '';
    return;
  }

  listEl.hidden = false;
  listEl.innerHTML = files.map(function (f, i) {
    var mb = (f.size / (1024 * 1024)).toFixed(1);
    return '<div class="cr-video-item"><span class="cr-video-item-num">' + (i + 1) + '</span>' +
      '<span class="cr-video-item-name">' + _esc(f.name) + '</span>' +
      '<span class="cr-video-item-size">' + mb + ' MB</span></div>';
  }).join('');
}

function _updateCategoriaUI() {
  CR_CATEGORIAS.forEach(function (cat) {
    var btn = document.getElementById('cr-cat-btn-' + cat);
    if (btn) btn.classList.toggle('active', cat === _categoriaActiva);
  });

  var stack = document.getElementById('cr-upload-stack');
  if (stack) stack.hidden = !_categoriaActiva;

  var meta = _categoriaActiva ? CR_CATEGORIA_META[_categoriaActiva] : null;
  var titleEl = document.getElementById('cr-upload-hero-title');
  var subEl   = document.getElementById('cr-upload-hero-sub');
  var pubEl   = document.getElementById('cr-ma-publicar-text');
  var nomInp  = document.getElementById('cr-ma-nombre');
  var descInp = document.getElementById('cr-ma-desc');

  if (titleEl) titleEl.textContent = meta ? meta.title : 'Publicar activo digital';
  if (subEl)   subEl.textContent   = meta ? meta.sub : 'Elige el tipo de producto y completa el formulario.';
  if (pubEl)   pubEl.textContent   = meta ? meta.publish : 'Publicar activo digital';
  if (nomInp && meta) nomInp.placeholder = meta.nombrePh;
  if (descInp && meta) descInp.placeholder = meta.descPh;

  var blockHtml  = document.getElementById('cr-block-html');
  var blockPdfMa = document.getElementById('cr-block-pdf-miniapp');
  var blockPdfInfo = document.getElementById('cr-block-pdf-info');
  var blockVideos = document.getElementById('cr-block-videos');
  var optIa      = document.getElementById('cr-option-ia-wrap');

  if (blockHtml)    blockHtml.hidden    = _categoriaActiva !== 'miniapp';
  if (blockPdfMa)   blockPdfMa.hidden   = _categoriaActiva !== 'miniapp';
  if (blockPdfInfo) blockPdfInfo.hidden = _categoriaActiva !== 'infoproducto';
  if (blockVideos)  blockVideos.hidden  = _categoriaActiva !== 'contenido_digital';
  if (optIa)        optIa.hidden        = _categoriaActiva !== 'miniapp';
}

function switchCategoriaActivo(cat) {
  if (CR_CATEGORIAS.indexOf(cat) === -1) return;
  _categoriaActiva = cat;
  _updateCategoriaUI();
  _clearMsg('cr-subir-msg');
}

function _resetSubirForm() {
  _categoriaActiva = null;
  _updateCategoriaUI();
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
  var pdfInfo = document.getElementById('cr-pdf-info');
  var videosInput = document.getElementById('cr-videos');
  if (foto1) foto1.value = '';
  if (foto2) foto2.value = '';
  if (pdf) pdf.value = '';
  if (pdfInfo) pdfInfo.value = '';
  if (videosInput) videosInput.value = '';
  previewFoto({ files: [] }, 'cr-foto1-preview');
  previewFoto({ files: [] }, 'cr-foto2-preview');
  onPdfSelected({ files: [] });
  onPdfInfoSelected({ files: [] });
  onVideosSelected({ files: [] });
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
  if (!_categoriaActiva) {
    _showMsg('cr-subir-msg', 'Elige primero el tipo de activo digital.', false);
    return;
  }

  var btn = document.getElementById('cr-ma-publicar-btn');
  var btnText = document.getElementById('cr-ma-publicar-text');
  var html = _categoriaActiva === 'miniapp' ? _obtenerHtml() : '';
  var nombre = (document.getElementById('cr-ma-nombre').value || '').trim();
  var precio = parseFloat(document.getElementById('cr-ma-precio').value);
  var precioPromo = parseFloat(document.getElementById('cr-ma-precio-promo').value);
  var descripcion = (document.getElementById('cr-ma-desc').value || '').trim();
  var usa_ia = _categoriaActiva === 'miniapp' && document.getElementById('cr-ma-usa-ia').checked;
  var disponible_vendedores = document.getElementById('cr-ma-vendedores').checked;
  var comision_vendedor = parseFloat(document.getElementById('cr-ma-comision').value) || 0;
  var foto1Input = document.getElementById('cr-foto1');
  var foto2Input = document.getElementById('cr-foto2');
  var pdfInput = document.getElementById('cr-pdf');
  var pdfInfoInput = document.getElementById('cr-pdf-info');
  var videosInput = document.getElementById('cr-videos');

  if (_categoriaActiva === 'miniapp' && !html) {
    _showMsg('cr-subir-msg', 'El HTML no puede estar vacio.', false);
    return;
  }
  if (_categoriaActiva === 'infoproducto') {
    if (!pdfInfoInput || !pdfInfoInput.files || !pdfInfoInput.files[0]) {
      _showMsg('cr-subir-msg', 'El PDF es obligatorio para un infoproducto.', false);
      return;
    }
  }
  if (_categoriaActiva === 'contenido_digital') {
    if (!videosInput || !videosInput.files || !videosInput.files.length) {
      _showMsg('cr-subir-msg', 'Debes subir al menos un video.', false);
      return;
    }
    if (videosInput.files.length > 30) {
      _showMsg('cr-subir-msg', 'Maximo 30 videos por producto.', false);
      return;
    }
    for (var vi = 0; vi < videosInput.files.length; vi++) {
      var vf = videosInput.files[vi];
      if (vf.size > 100 * 1024 * 1024) {
        _showMsg('cr-subir-msg', 'El video "' + vf.name + '" supera 100 MB.', false);
        return;
      }
    }
  }
  if (!nombre) { _showMsg('cr-subir-msg', 'El nombre es obligatorio.', false); return; }
  if (!precio || precio <= 0) { _showMsg('cr-subir-msg', 'Ingresa un precio normal valido.', false); return; }
  if (!foto1Input || !foto1Input.files || !foto1Input.files[0]) {
    _showMsg('cr-subir-msg', 'La foto 1 del producto es obligatoria.', false);
    return;
  }

  var fd = new FormData();
  fd.append('categoria', _categoriaActiva);
  if (_categoriaActiva === 'miniapp') fd.append('html', html);
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
  if (_categoriaActiva === 'miniapp' && pdfInput && pdfInput.files && pdfInput.files[0]) {
    fd.append('pdf', pdfInput.files[0]);
  }
  if (_categoriaActiva === 'infoproducto' && pdfInfoInput.files[0]) {
    fd.append('pdf', pdfInfoInput.files[0]);
  }
  if (_categoriaActiva === 'contenido_digital' && videosInput && videosInput.files) {
    for (var vj = 0; vj < videosInput.files.length; vj++) {
      fd.append('videos', videosInput.files[vj]);
    }
  }

  var publishLabel = (CR_CATEGORIA_META[_categoriaActiva] || {}).publish || 'Publicar';
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

    var tipoLabel = _categoriaActiva === 'miniapp' ? 'Mini app' : (_categoriaActiva === 'infoproducto' ? 'Infoproducto' : 'Contenido digital');
    var msgOk = tipoLabel + ' publicado correctamente. Slug: ' + d.miniapp.slug;
    if (d.aviso) msgOk += ' ' + d.aviso;
    _showMsg('cr-subir-msg', msgOk, true);

    _resetSubirForm();
    cargarMiniappsLista();
  } catch (e) {
    _showMsg('cr-subir-msg', e.message || 'Error de conexion.', false);
  } finally {
    if (btn) btn.disabled = false;
    if (btnText) btnText.textContent = publishLabel;
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
      var cat = m.categoria || 'miniapp';
      var catLabels = { infoproducto: 'Infoproducto', contenido_digital: 'Contenido Digital', miniapp: 'Mini App' };
      var catLabel = catLabels[cat] || 'Mini App';
      var tipoLabel = m.tipo_producto === 'html_pdf' ? 'HTML + PDF'
        : m.tipo_producto === 'pdf' ? 'PDF'
        : m.tipo_producto === 'pack' ? 'ZIP Pack'
        : 'HTML';
      var tipoClass = m.tipo_producto === 'html_pdf' ? 'cr-product-tag--pdf'
        : m.tipo_producto === 'pdf' ? 'cr-product-tag--pdf'
        : m.tipo_producto === 'pack' ? 'cr-product-tag--pack'
        : 'cr-product-tag--html';
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
              '<span class="cr-product-tag cr-product-tag--cat">' + catLabel + '</span>' +
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

/* ── Mi catalogo ─────────────────────────────────────────── */

function _crCategoriaLabel(cat) {
  var map = { infoproducto: 'Infoproducto', contenido_digital: 'Contenido Digital', miniapp: 'Mini App' };
  return map[cat] || 'Mini App';
}

function _crEstadoBadge(estado, motivo) {
  var e = (estado || 'pendiente').toLowerCase();
  if (e === 'aprobada') {
    return '<span class="cr-status-badge cr-status-badge--aprobada">Aprobado</span>';
  }
  if (e === 'rechazada') {
    var motivoHtml = motivo
      ? '<p class="cr-status-motivo">' + _esc(motivo) + '</p>'
      : '';
    return '<span class="cr-status-badge cr-status-badge--rechazada">Rechazado</span>' + motivoHtml;
  }
  return '<span class="cr-status-badge cr-status-badge--pendiente">En revision</span>';
}

function _crPrecioHtml(m) {
  if (m.precio_promocion && Number(m.precio_promocion) > 0) {
    return '<span class="cr-product-price-old">' + _fmtUsd(m.precio) + '</span>' +
      '<span class="cr-product-price-promo">' + _fmtUsd(m.precio_promocion) + '</span>';
  }
  return '<span class="cr-product-price-promo">' + _fmtUsd(m.precio) + '</span>';
}

function copiarLinkCatalogo(url) {
  if (!url) return;
  function ok() { alert('Enlace copiado.'); }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(ok).catch(function () {
      window.prompt('Copia este enlace:', url);
    });
  } else {
    window.prompt('Copia este enlace:', url);
  }
}

async function cargarCatalogoCreador() {
  var wrap = document.getElementById('cr-catalogo-lista');
  if (!wrap) return;
  wrap.innerHTML = '<p class="cr-empty">Cargando...</p>';

  try {
    var r = await _creadorFetch(MOTOR_URL + '/api/creador/miniapps');
    var d = await r.json();
    if (!d.ok) throw new Error(d.error || 'Error');

    var list = d.miniapps || [];
    if (!list.length) {
      wrap.innerHTML = '<p class="cr-empty">Aun no has publicado ningun producto. Ve a Subir producto para empezar.</p>';
      return;
    }

    wrap.innerHTML = list.map(function (m) {
      var imgUrl = MOTOR_URL + '/api/miniapps/asset/' + encodeURIComponent(m.slug) + '/foto1';
      var cat = m.categoria || 'miniapp';
      var estado = (m.estado_aprobacion || 'pendiente').toLowerCase();
      var paginaHtml = '';
      if (estado === 'aprobada' && m.pagina_venta_slug) {
        var pagLink = MOTOR_URL + '/p/' + m.pagina_venta_slug;
        paginaHtml =
          '<div class="cr-catalogo-pagina">' +
            '<span class="cr-catalogo-pagina-lbl">Pagina de venta</span>' +
            '<div class="cr-catalogo-pagina-row">' +
              '<a class="cr-catalogo-link" href="' + _esc(pagLink) + '" target="_blank" rel="noopener noreferrer">' + _esc(pagLink) + '</a>' +
              '<button type="button" class="cr-btn-copy" onclick="copiarLinkCatalogo(' + JSON.stringify(pagLink) + ')">Copiar</button>' +
            '</div>' +
          '</div>';
      }

      return (
        '<article class="cr-product-card cr-catalogo-card">' +
          '<div class="cr-product-thumb">' +
            '<img src="' + imgUrl + '" alt="' + _esc(m.nombre) + '" loading="lazy" onerror="this.parentElement.classList.add(\'cr-product-thumb--empty\')" />' +
          '</div>' +
          '<div class="cr-product-body">' +
            '<h4 class="cr-product-name">' + _esc(m.nombre) + '</h4>' +
            '<p class="cr-product-slug">' + _esc(m.slug) + '</p>' +
            '<div class="cr-product-tags">' +
              '<span class="cr-product-tag cr-product-tag--cat">' + _crCategoriaLabel(cat) + '</span>' +
              _crEstadoBadge(estado, m.motivo_rechazo) +
            '</div>' +
            '<div class="cr-product-prices">' + _crPrecioHtml(m) + '</div>' +
            paginaHtml +
          '</div>' +
        '</article>'
      );
    }).join('');
  } catch (e) {
    wrap.innerHTML = '<p class="cr-empty cr-empty--err">' + _esc(e.message) + '</p>';
  }
}

/* ── Contactar ─────────────────────────────────────────── */

function _crWaUrl(mensaje) {
  return 'https://wa.me/' + CR_SOPORTE_WHATSAPP + '?text=' + encodeURIComponent(mensaje || CR_SOPORTE_WA_MSG);
}

function initContactarTab() {
  var waLink = document.getElementById('cr-contact-wa-link');
  if (waLink) waLink.href = _crWaUrl(CR_SOPORTE_WA_MSG);
  var nomInput = document.getElementById('cr-contact-nombre');
  if (nomInput && currentCreador.nombre && !nomInput.value.trim()) {
    nomInput.value = currentCreador.nombre;
  }
}

function _crContactoMensajeCompleto() {
  var nombre = (document.getElementById('cr-contact-nombre').value || '').trim();
  var mensaje = (document.getElementById('cr-contact-mensaje').value || '').trim();
  var partes = [CR_SOPORTE_WA_MSG];
  if (nombre) partes.push('Nombre: ' + nombre);
  if (mensaje) partes.push(mensaje);
  return partes.join('\n\n');
}

function enviarContactoWhatsApp() {
  window.open(_crWaUrl(_crContactoMensajeCompleto()), '_blank', 'noopener,noreferrer');
}

function enviarContactoEmail() {
  var nombre = (document.getElementById('cr-contact-nombre').value || '').trim();
  var mensaje = (document.getElementById('cr-contact-mensaje').value || '').trim();
  var subject = encodeURIComponent('Soporte creador MiniApps' + (nombre ? ' — ' + nombre : ''));
  var body = encodeURIComponent(_crContactoMensajeCompleto());
  window.location.href = 'mailto:' + CR_SOPORTE_EMAIL + '?subject=' + subject + '&body=' + body;
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
      _actualizarSesionAlmacenada({ nombre: d.creador.nombre });
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
    _actualizarSesionAlmacenada({ nombre: d.creador.nombre });
    _showMsg('cr-info-msg', 'Informacion actualizada correctamente.', true);
  } catch (e) {
    _showMsg('cr-info-msg', e.message || 'Error al guardar.', false);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function _catLabelCuentas(cat) {
  var map = { infoproducto: 'Infoproducto', contenido_digital: 'Contenido Digital', miniapp: 'Mini App' };
  return map[cat] || 'Mini App';
}

/* ── Cuentas ─────────────────────────────────────────────── */

async function cargarCuentasCreador() {
  document.getElementById('cr-stat-ventas').textContent   = '...';
  document.getElementById('cr-stat-brutos').textContent   = '...';
  document.getElementById('cr-stat-ganancia').textContent  = '...';
  document.getElementById('cr-cuentas-tabla').innerHTML = '<p class="cr-empty">Cargando...</p>';

  try {
    var r = await _creadorFetch(MOTOR_URL + '/api/creador/cuentas');
    var d = await r.json();
    if (!d.ok) throw new Error(d.error || 'Error');

    var res = d.resumen || {};
    document.getElementById('cr-stat-ventas').textContent  = res.total_ventas != null ? res.total_ventas : (res.ventas_totales || 0);
    document.getElementById('cr-stat-brutos').textContent  = _fmtUsd(res.ingresos_brutos || 0);
    document.getElementById('cr-stat-ganancia').textContent = _fmtUsd(res.total_creador != null ? res.total_creador : (res.ganancia_total || 0));

    var productos = d.productos || d.miniapps || [];
    if (!productos.length) {
      document.getElementById('cr-cuentas-tabla').innerHTML = '<p class="cr-empty">Aun no tienes productos publicados.</p>';
      return;
    }

    var rows = productos.map(function (p) {
      return '<tr>' +
        '<td class="cr-td-name">' + _esc(p.nombre) + '</td>' +
        '<td><span class="cr-cat-pill">' + _esc(_catLabelCuentas(p.categoria)) + '</span></td>' +
        '<td>' + (p.ventas || 0) + '</td>' +
        '<td class="cr-td-muted">' + _fmtUsd(p.ingresos_brutos || 0) + '</td>' +
        '<td class="cr-td-money">' + _fmtUsd(p.ganancia || 0) + '</td>' +
      '</tr>';
    }).join('');

    document.getElementById('cr-cuentas-tabla').innerHTML =
      '<table class="cr-table">' +
      '<thead><tr><th>Producto</th><th>Categoria</th><th>Ventas</th><th>Total generado</th><th>Tu ganancia</th></tr></thead>' +
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
  _updateCategoriaUI();
  try {
    var lastEmail = localStorage.getItem(CR_EMAIL_KEY);
    if (lastEmail) {
      var emailEl = document.getElementById('cr-login-email');
      if (emailEl) emailEl.value = lastEmail;
    }
    var rememberEl = document.getElementById('cr-login-recordar');
    if (rememberEl) rememberEl.checked = localStorage.getItem(CR_REMEMBER_PREF_KEY) === '1';
  } catch (e) {}
  try {
    var stored = _leerSesionAlmacenada();
    if (stored && stored.c && stored.c.id) {
      _aplicarSesionMemoria(stored.c);
      mostrarDashboard();
      return;
    }
  } catch (e) {}
  mostrarAuth();
  switchAuthTab('login');
});
