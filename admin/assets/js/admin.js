/* ============================================================
   EcommerceAgent — Panel de Administrador
   admin/assets/js/admin.js
   ============================================================ */

/* ============================================================
   AUTH — login / logout del panel admin
   ============================================================ */
var _ADMIN_TOKEN_STORAGE = 'ea_admin_jwt';

function _getAdminToken() {
  return sessionStorage.getItem(_ADMIN_TOKEN_STORAGE) || '';
}

function _adminShowLogin() {
  var loginEl   = document.getElementById('adm-login-screen');
  var contentEl = document.getElementById('adm-main-content');
  if (loginEl)   loginEl.style.display   = 'flex';
  if (contentEl) contentEl.style.display = 'none';
  var pwEl = document.getElementById('adm-login-password');
  if (pwEl) { pwEl.value = ''; pwEl.focus(); }
}

function _adminShowPanel() {
  var loginEl   = document.getElementById('adm-login-screen');
  var contentEl = document.getElementById('adm-main-content');
  if (loginEl)   loginEl.style.display   = 'none';
  if (contentEl) contentEl.style.display = 'block';
}

function adminLogin() {
  var pwEl  = document.getElementById('adm-login-password');
  var btnEl = document.getElementById('adm-login-btn');
  var errEl = document.getElementById('adm-login-error');
  if (!pwEl) return;
  var pw = pwEl.value.trim();
  if (!pw) return;

  if (errEl) errEl.style.display = 'none';
  if (btnEl) { btnEl.disabled = true; btnEl.textContent = 'Verificando...'; }

  fetch((window.MOTOR_URL_LOGIN || 'https://motor.ecommerceagents.store') + '/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: pw })
  })
    .then(function (r) { return r.json().then(function (d) { return { status: r.status, data: d }; }); })
    .then(function (res) {
      if (!res.data.ok || !res.data.token) throw new Error(res.data.error || 'Credenciales incorrectas');
      sessionStorage.setItem(_ADMIN_TOKEN_STORAGE, res.data.token);
      _adminShowPanel();
      renderInventario();
    })
    .catch(function (e) {
      if (errEl) { errEl.textContent = e.message || 'Error al conectar'; errEl.style.display = 'block'; }
    })
    .finally(function () {
      if (btnEl) { btnEl.disabled = false; btnEl.textContent = 'Entrar al panel'; }
    });
}

function adminLogout() {
  sessionStorage.removeItem(_ADMIN_TOKEN_STORAGE);
  _adminShowLogin();
}

/** Wrapper de fetch que añade Authorization Bearer y redirige al login en 401 */
function _adminFetch(url, opts) {
  opts = opts || {};
  var token = _getAdminToken();
  if (!token) {
    _adminShowLogin();
    return Promise.reject(new Error('Sin sesion de admin'));
  }
  var baseHeaders = { 'Authorization': 'Bearer ' + token };
  if (opts.headers) {
    opts.headers = Object.assign({}, opts.headers, baseHeaders);
  } else {
    opts.headers = baseHeaders;
  }
  return fetch(url, opts).then(function (r) {
    if (r.status === 401) {
      sessionStorage.removeItem(_ADMIN_TOKEN_STORAGE);
      _adminShowLogin();
      throw new Error('Sesion expirada. Vuelve a iniciar sesion.');
    }
    return r;
  });
}

/* ============================================================
   DATA — arrays vacios, listos para datos reales
   TODO: cargar datos reales desde Supabase/backend en cada seccion
   ============================================================ */

// -- INVENTARIO --
// TODO: cargar datos reales desde Supabase tabla `productos`
var DEMO_INVENTARIO = [];

// -- CATALOGO --
// TODO: cargar datos reales desde Supabase tabla `productos`
var DEMO_CATALOGO = [];

// -- PAGINAS DE VENTA --
// TODO: cargar datos reales desde Supabase tabla `paginas_venta`
var DEMO_PAGINAS_VENTA = [];

// -- USUARIOS --
// TODO: cargar datos reales desde Supabase tabla `usuarios`
var DEMO_USUARIOS = [];

// -- VENTAS GLOBALES (se cargan desde motor via /api/admin/ventas-por-vendedor) --
var DEMO_VENTAS_GLOBAL = [];   // solo usado para ranking del dashboard hasta migrar ese bloque

// -- SOLICITUDES DE PAGO --
// TODO: cargar datos reales desde Supabase tabla `solicitudes_pago`
var DEMO_SOLICITUDES_PAGO = [];

// -- LINKS ACTIVOS --
// TODO: cargar datos reales desde Supabase tabla `links`
var DEMO_LINKS = [];

/* ============================================================
   HELPERS
   ============================================================ */

function _esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _fmt(n) {
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function _fmtFecha(str) {
  if (!str) return '—';
  var d = new Date(str);
  var m = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return d.getDate() + ' ' + m[d.getMonth()] + ' ' + d.getFullYear();
}

function _badgeStock(estado) {
  var map = { 'Disponible': 'adm-badge--ok', 'Bajo': 'adm-badge--bajo', 'Agotado': 'adm-badge--agotado' };
  return '<span class="adm-badge ' + (map[estado] || 'adm-badge--inactivo') + '">' + _esc(estado) + '</span>';
}

function _badgeVenta(estado) {
  var map = {
    'Pendiente':  'adm-badge--bajo',
    'Procesando': 'adm-badge--proceso',
    'Enviado':    'adm-badge--enviado',
    'Entregado':  'adm-badge--ok',
    'Cancelado':  'adm-badge--agotado'
  };
  return '<span class="adm-badge ' + (map[estado] || 'adm-badge--bajo') + '">' + _esc(estado) + '</span>';
}

function _badgePago(estado) {
  var map = {
    'Pendiente':  'adm-badge--bajo',
    'En proceso': 'adm-badge--bajo',
    'Pagando':    'adm-badge--pagando',
    'Pagado':     'adm-badge--pagado',
    'Rechazado':  'adm-badge--rechazado'
  };
  return '<span class="adm-badge ' + (map[estado] || 'adm-badge--bajo') + '">' + _esc(estado) + '</span>';
}

function _badgePagina(estado) {
  var map = { 'Activa': 'adm-badge--ok', 'Pausada': 'adm-badge--bajo', 'Borrador': 'adm-badge--inactivo' };
  return '<span class="adm-badge ' + (map[estado] || 'adm-badge--inactivo') + '">' + _esc(estado) + '</span>';
}

function _badgeLink(tipo) {
  var map = { 'Afiliado': 'adm-badge--afiliado', 'Pagina Venta': 'adm-badge--pagina', 'Invitacion': 'adm-badge--invitacion' };
  return '<span class="adm-badge ' + (map[tipo] || 'adm-badge--inactivo') + '">' + _esc(tipo) + '</span>';
}

function _badgeEstado(estado) {
  var map = { 'Activo': 'adm-badge--ok', 'Activa': 'adm-badge--ok', 'Inactivo': 'adm-badge--inactivo', 'Pausado': 'adm-badge--bajo' };
  return '<span class="adm-badge ' + (map[estado] || 'adm-badge--inactivo') + '">' + _esc(estado) + '</span>';
}

function _statCard(value, label) {
  return '<div class="adm-stat-card"><div class="adm-stat-value">' + value +
    '</div><div class="adm-stat-label">' + label + '</div></div>';
}

function _setHtml(id, html) {
  var el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

/* ============================================================
   TAB SWITCHING
   ============================================================ */

var ADMIN_TABS = ['inventario', 'catalogo', 'paginas', 'usuarios', 'cuentas', 'pedidos', 'miniapps'];

function switchAdminTab(tabId) {
  ADMIN_TABS.forEach(function (id) {
    var panel = document.getElementById('adm-panel-' + id);
    var btn   = document.getElementById('adm-tab-btn-' + id);
    var active = id === tabId;
    if (panel) { panel.classList.toggle('active', active); panel.hidden = !active; }
    if (btn)   { btn.classList.toggle('active', active); btn.setAttribute('aria-selected', active ? 'true' : 'false'); }
  });
  if (tabId === 'inventario') renderInventario();
  if (tabId === 'catalogo')   renderCatalogo();
  if (tabId === 'paginas')    renderPaginas();
  if (tabId === 'usuarios')   renderUsuarios();
  if (tabId === 'cuentas')    renderCuentasAdmin();
  if (tabId === 'pedidos')    renderPedidos();
  if (tabId === 'miniapps')   renderMiniappsAdmin();
}

/* ============================================================
   1. INVENTARIO — conectado a Supabase via motor (puerto 3002)
   ============================================================ */

var _invFormOpen = false;
var _invImagenes = []; // base64 hasta 5 // TODO: produccion → Cloudflare R2 / Supabase Storage
var INV_MAX_IMGS = 5;
var _invCache    = null; // cache en memoria de la sesion actual

function _invEstado(stock) {
  if (stock === 0)  return 'Agotado';
  if (stock <= 15)  return 'Bajo';
  return 'Disponible';
}

function invToggleForm() {
  _invFormOpen = !_invFormOpen;
  var wrap = document.getElementById('inv-form-wrap');
  var txt  = document.getElementById('inv-form-toggle-txt');
  if (wrap) wrap.hidden = !_invFormOpen;
  if (txt)  txt.textContent = _invFormOpen ? 'Ocultar formulario' : 'Agregar producto';
  if (_invFormOpen) { _invImagenes = []; invRenderImagenesGrid(); }
}

function invCategoriaChange() {
  var sel    = document.getElementById('inv-f-categoria');
  var custom = document.getElementById('inv-f-categoria-custom');
  if (!sel || !custom) return;
  var isCustom = sel && sel.value === '__custom__';
  custom.style.display = isCustom ? 'block' : 'none';
  if (isCustom) { custom.focus(); }
  else          { custom.value = ''; }
}

// ── Imagenes (hasta 5, base64) ────────────────────────────────────────

function invAgregarImagenes(input) {
  if (!input || !input.files || !input.files.length) return;
  var remaining = INV_MAX_IMGS - _invImagenes.length;
  if (remaining <= 0) { alert('Maximo ' + INV_MAX_IMGS + ' imagenes.'); input.value = ''; return; }
  var files = Array.prototype.slice.call(input.files, 0, remaining);
  if (input.files.length > remaining) {
    alert('Solo se agregaron ' + remaining + ' imagen' + (remaining > 1 ? 'es' : '') + '.');
  }
  var loaded = 0;
  files.forEach(function (file) {
    var reader = new FileReader();
    reader.onload = function (e) {
      _invImagenes.push(e.target.result);
      loaded++;
      if (loaded === files.length) invRenderImagenesGrid();
    };
    reader.readAsDataURL(file);
  });
  input.value = '';
}

function invQuitarImagen(idx) {
  _invImagenes.splice(idx, 1);
  invRenderImagenesGrid();
}

function invRenderImagenesGrid() {
  var grid    = document.getElementById('inv-imgs-grid');
  var countEl = document.getElementById('inv-imgs-count');
  if (!grid) return;
  var html = _invImagenes.map(function (url, i) {
    return '<div class="adm-img-slot">' +
      '<img src="' + url + '" class="adm-img-slot-img" alt="Imagen ' + (i + 1) + '">' +
      '<button type="button" class="adm-img-slot-rm" onclick="invQuitarImagen(' + i + ')" title="Quitar">&times;</button>' +
      '<span class="adm-img-slot-num">' + (i + 1) + '</span>' +
    '</div>';
  }).join('');
  if (_invImagenes.length < INV_MAX_IMGS) {
    html += '<label class="adm-img-add" for="inv-f-imagenes">' +
      '<span class="adm-img-add-icon">+</span><span class="adm-img-add-txt">Agregar</span></label>';
  }
  grid.innerHTML = html;
  if (countEl) {
    countEl.textContent = _invImagenes.length + ' / ' + INV_MAX_IMGS;
    countEl.className = 'adm-imgs-count' + (_invImagenes.length >= INV_MAX_IMGS ? ' adm-imgs-count--full' : '');
  }
}

function invCalcGanancia() {
  var precio   = parseFloat(document.getElementById('inv-f-precio')   ? document.getElementById('inv-f-precio').value   || '0' : '0');
  var utilidad = parseFloat(document.getElementById('inv-f-utilidad') ? document.getElementById('inv-f-utilidad').value || '0' : '0');
  var el = document.getElementById('inv-ganancia-preview');
  if (el) el.textContent = 'Ganancia por venta: ' + _fmt((isNaN(precio)||isNaN(utilidad)) ? 0 : precio*(utilidad/100));
}

function invActualizarGanancia(id) {
  var precioEl   = document.getElementById('inv-precio-'   + id);
  var utilEl     = document.getElementById('inv-utilidad-' + id);
  var gananciaEl = document.getElementById('inv-ganancia-' + id);
  if (!precioEl || !utilEl || !gananciaEl) return;
  gananciaEl.textContent = _fmt((parseFloat(precioEl.value)||0) * ((parseFloat(utilEl.value)||0) / 100));
}

// ── Guardar nuevo producto → Supabase ─────────────────────────────────

function invGuardarProducto() {
  var elNombre   = document.getElementById('inv-f-nombre');
  var elPrecio   = document.getElementById('inv-f-precio');
  var elUtilidad = document.getElementById('inv-f-utilidad');
  var elStock    = document.getElementById('inv-f-stock');
  var errEl      = document.getElementById('inv-form-error');
  var btnEl      = document.getElementById('inv-form-save-btn');

  var nombre   = elNombre   ? elNombre.value.trim()    : '';
  var precio   = parseFloat(elPrecio   ? elPrecio.value   || '0' : '0');
  var utilidad = parseFloat(elUtilidad ? elUtilidad.value || '0' : '0');
  var stock    = parseInt(elStock      ? elStock.value    || '0' : '0', 10);

  if (!nombre) {
    if (errEl) { errEl.textContent = 'El nombre del producto es obligatorio.'; errEl.hidden = false; }
    return;
  }
  if (_invImagenes.length === 0) {
    if (errEl) { errEl.textContent = 'Agrega al menos 1 imagen del producto.'; errEl.hidden = false; }
    return;
  }
  if (errEl) errEl.hidden = true;
  if (btnEl) { btnEl.disabled = true; btnEl.textContent = 'Guardando...'; }

  _adminFetch(MOTOR_URL + '/api/admin/productos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nombre:   nombre,
      precio:   isNaN(precio)   ? 0 : precio,
      utilidad: isNaN(utilidad) ? 0 : utilidad,
      stock:    isNaN(stock)    ? 0 : stock,
      imagenes: _invImagenes.slice()
    })
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.ok) throw new Error(data.error || 'Error del servidor.');
      if (elNombre)   elNombre.value   = '';
      if (elPrecio)   elPrecio.value   = '';
      if (elUtilidad) elUtilidad.value = '';
      if (elStock)    elStock.value    = '';
      var fi = document.getElementById('inv-f-imagenes');
      if (fi) fi.value = '';
      _invImagenes = [];
      invRenderImagenesGrid();
      var gp = document.getElementById('inv-ganancia-preview');
      if (gp) gp.textContent = 'Ganancia por venta: $0.00';
      invToggleForm();
      _invCache = null;
      renderInventario();
    })
    .catch(function (e) {
      if (errEl) { errEl.textContent = 'Error al guardar: ' + e.message; errEl.hidden = false; }
    })
    .finally(function () {
      if (btnEl) { btnEl.disabled = false; btnEl.textContent = 'Guardar producto'; }
    });
}

// ── Pausar / reanudar → Supabase ──────────────────────────────────────

function invPausarProducto(id) {
  var producto = null;
  if (_invCache) {
    for (var i = 0; i < _invCache.length; i++) {
      if (String(_invCache[i].id) === String(id)) { producto = _invCache[i]; break; }
    }
  }
  var nuevoPausado = producto ? !producto.pausado : true;

  _adminFetch(MOTOR_URL + '/api/admin/productos/actualizar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: id, pausado: nuevoPausado })
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.ok) throw new Error(data.error || 'Error.');
      if (producto) producto.pausado = nuevoPausado;
      _invRenderTabla(_invCache || []);
    })
    .catch(function (e) { alert('Error al pausar: ' + e.message); });
}

// ── Eliminar → Supabase ───────────────────────────────────────────────

function invEliminarProducto(id) {
  if (!confirm('Eliminar este producto del inventario? Esta accion no se puede deshacer.')) return;

  _adminFetch(MOTOR_URL + '/api/admin/productos/eliminar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: id })
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.ok) throw new Error(data.error || 'Error.');
      _invCache = null;
      renderInventario();
    })
    .catch(function (e) { alert('Error al eliminar: ' + e.message); });
}

// ── Guardar cambios de stock/precio/utilidad en filas → Supabase ──────

function invGuardarCambios() {
  if (!_invCache || !_invCache.length) { renderInventario(); return; }
  var updates = [];
  _invCache.forEach(function (p) {
    var inpStock    = document.getElementById('inv-stock-'    + p.id);
    var inpPrecio   = document.getElementById('inv-precio-'   + p.id);
    var inpUtilidad = document.getElementById('inv-utilidad-' + p.id);
    var changed = {};
    if (inpStock)    { var v  = parseInt(inpStock.value, 10);    if (!isNaN(v)  && v  >= 0) changed.stock    = v;  }
    if (inpPrecio)   { var vp = parseFloat(inpPrecio.value);     if (!isNaN(vp) && vp >= 0) changed.precio   = vp; }
    if (inpUtilidad) { var vu = parseFloat(inpUtilidad.value);   if (!isNaN(vu) && vu >= 0) changed.utilidad = vu; }
    if (Object.keys(changed).length) { changed.id = p.id; updates.push(changed); }
  });

  if (!updates.length) {
    var ok = document.getElementById('inv-save-ok');
    if (ok) { ok.hidden = false; setTimeout(function () { ok.hidden = true; }, 2000); }
    return;
  }

  var btnEl = document.getElementById('inv-save-changes-btn');
  if (btnEl) { btnEl.disabled = true; btnEl.textContent = 'Guardando...'; }

  Promise.all(updates.map(function (upd) {
    return _adminFetch(MOTOR_URL + '/api/admin/productos/actualizar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(upd)
    }).then(function (r) { return r.json(); });
  }))
    .then(function () {
      _invCache = null;
      renderInventario();
      var ok = document.getElementById('inv-save-ok');
      if (ok) { ok.hidden = false; setTimeout(function () { ok.hidden = true; }, 3000); }
    })
    .catch(function (e) { alert('Error al guardar cambios: ' + e.message); })
    .finally(function () {
      if (btnEl) { btnEl.disabled = false; btnEl.textContent = 'Guardar cambios'; }
    });
}

// ── Render tabla ──────────────────────────────────────────────────────

function _invRenderTabla(arr) {
  DEMO_INVENTARIO = arr;
  var disponibles = arr.filter(function (p) { return _invEstado(p.stock) === 'Disponible'; }).length;
  var bajos       = arr.filter(function (p) { return _invEstado(p.stock) === 'Bajo'; }).length;
  var agotados    = arr.filter(function (p) { return _invEstado(p.stock) === 'Agotado'; }).length;

  _setHtml('inv-summary-row',
    _statCard(arr.length, 'Total productos') +
    _statCard(disponibles, 'Disponibles') +
    _statCard('<span style="color:#8B6E1A">' + bajos + '</span>', 'Stock bajo') +
    _statCard('<span style="color:#9B3333">' + agotados + '</span>', 'Agotados')
  );

  if (!arr.length) {
    _setHtml('inv-table-wrap', '<p style="padding:32px 24px;color:#999;font-style:italic;">No hay productos aun. Agrega el primero arriba.</p>');
    return;
  }

  var rows = arr.map(function (p) {
    var estado   = _invEstado(p.stock);
    var imgs     = (p.imagenes && p.imagenes.length) ? p.imagenes : [];
    var thumb    = imgs.length > 0
      ? '<div class="adm-prod-thumb-wrap">' +
          '<img src="' + _esc(imgs[0]) + '" class="adm-prod-thumb" alt="">' +
          (imgs.length > 1 ? '<span class="adm-prod-img-count">1/' + imgs.length + '</span>' : '') +
        '</div>'
      : '<span class="adm-prod-no-img"></span>';
    var pausaTxt = p.pausado ? 'Reanudar' : 'Pausar';
    var precio   = p.precio   || 0;
    var utilidad = p.utilidad || 0;
    var ganancia = precio * (utilidad / 100);
    var idQ      = _esc(p.id); // UUID seguro para atributos HTML
    return '<tr' + (p.pausado ? ' class="adm-row--pausado"' : '') + '>' +
      '<td><div class="adm-prod-cell">' + thumb +
        '<span class="adm-td-strong">' + _esc(p.nombre) + '</span>' +
        (p.pausado ? '<span class="adm-badge adm-badge--inactivo adm-badge--xs">Pausado</span>' : '') +
      '</div></td>' +
      '<td><input type="number" class="adm-stock-input" id="inv-precio-' + idQ + '" value="' + precio + '" min="0" step="0.01" style="width:90px" oninput="invActualizarGanancia(\'' + idQ + '\')"></td>' +
      '<td><input type="number" class="adm-stock-input" id="inv-utilidad-' + idQ + '" value="' + utilidad + '" min="0" max="100" step="1" style="width:70px" oninput="invActualizarGanancia(\'' + idQ + '\')"><span class="adm-td-muted" style="font-size:11px;margin-left:3px">%</span></td>' +
      '<td id="inv-ganancia-' + idQ + '" class="adm-ganancia-cell">' + _fmt(ganancia) + '</td>' +
      '<td><input type="number" class="adm-stock-input" id="inv-stock-' + idQ + '" value="' + p.stock + '" min="0"></td>' +
      '<td>' + _badgeStock(estado) + '</td>' +
      '<td><div class="adm-action-cell">' +
        '<button type="button" class="adm-btn adm-btn--sm adm-btn--outline" onclick="invPausarProducto(\'' + idQ + '\')">' + pausaTxt + '</button>' +
        '<button type="button" class="adm-btn adm-btn--sm adm-btn--danger"   onclick="invEliminarProducto(\'' + idQ + '\')">Eliminar</button>' +
      '</div></td>' +
    '</tr>';
  }).join('');

  _setHtml('inv-table-wrap',
      '<table class="adm-table">' +
    '<thead><tr>' +
      '<th>Producto</th><th>Precio ($)</th><th>Utilidad (%)</th>' +
      '<th>Ganancia ($)</th><th>Stock actual</th><th>Estado</th><th>Acciones</th>' +
    '</tr></thead>' +
    '<tbody>' + rows + '</tbody></table>'
  );
}

function renderInventario() {
  _setHtml('inv-table-wrap', '<p style="padding:24px;color:#999;font-style:italic;">Cargando inventario de Supabase...</p>');

  _adminFetch(MOTOR_URL + '/api/admin/productos')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.ok) throw new Error(data.error || 'Error del servidor.');
      _invCache = data.productos;
      _invRenderTabla(_invCache);
    })
    .catch(function (e) {
      console.error('[renderInventario]', e);
      _setHtml('inv-summary-row', '');
      _setHtml('inv-table-wrap',
        '<div style="padding:32px 24px;text-align:center;">' +
        '<p style="color:#c0392b;font-weight:600;margin-bottom:8px;">No se pudo conectar al servidor.</p>' +
        '<p style="color:#888;font-size:13px;">Verifica que el motor este encendido en el puerto 3002.</p>' +
        '<button class="adm-btn adm-btn--sm" style="margin-top:16px" onclick="renderInventario()">Reintentar</button>' +
        '</div>'
      );
    });
}

/* ============================================================
   2. CATALOGO — Estadisticas de ventas
   ============================================================ */

function _catRankRows(arr, maxVal, cols) {
  // cols: array of { key, label, fmt }
  return arr.map(function (p, i) {
    var val = p[cols[0].key] || 0;
    var pct = Math.max(2, Math.round((val / (maxVal || 1)) * 100));
    var rankCls = i === 0 ? 'adm-rank adm-rank--gold'
      : i === 1 ? 'adm-rank adm-rank--silver'
      : i === 2 ? 'adm-rank adm-rank--bronze'
      : 'adm-rank';
    var cells = cols.map(function (c) {
      return '<td>' + (c.fmt ? c.fmt(p[c.key]) : _esc(String(p[c.key] !== undefined ? p[c.key] : '—'))) + '</td>';
    }).join('');
    return '<tr>' +
      '<td><span class="' + rankCls + '">' + (i + 1) + '</span></td>' +
      '<td class="adm-td-strong">' + _esc(p.nombre) + '</td>' +
      cells +
      '<td class="adm-bar-cell">' +
        '<div class="adm-bar-wrap"><div class="adm-bar" style="width:' + pct + '%"></div></div>' +
        '<span class="adm-bar-pct">' + pct + '%</span>' +
      '</td>' +
    '</tr>';
  }).join('');
}

function renderCatalogo() {
  var emptyMsg = '<p class="adm-empty" style="padding:36px 0;">Aun no hay datos suficientes.</p>';
  var loadMsg  = '<p class="adm-empty" style="padding:36px 0;">Cargando...</p>';
  var errMsg   = '<p class="adm-empty" style="padding:36px 0;color:#c0392b">Error al cargar datos. Verifica que el motor este activo.</p>';

  _setHtml('cat-ranking-ventas', loadMsg);
  _setHtml('cat-ranking-vistas', loadMsg);
  _setHtml('cat-summary-row',
    _statCard('...', 'Unidades vendidas') +
    _statCard('...', 'Ingresos totales') +
    _statCard('...', 'Total vistas') +
    _statCard('...', 'Producto top ventas')
  );

  var p1 = _adminFetch(MOTOR_URL + '/api/admin/metricas/mas-vendidos').then(function (r) { return r.json(); });
  var p2 = _adminFetch(MOTOR_URL + '/api/admin/metricas/mas-vistos').then(function (r) { return r.json(); });

  Promise.all([p1, p2])
    .then(function (results) {
      var dataV  = results[0];
      var dataPg = results[1];
      if (!dataV.ok)  throw new Error(dataV.error  || 'Error mas-vendidos');
      if (!dataPg.ok) throw new Error(dataPg.error || 'Error mas-vistos');

      var statsVentas  = dataV.productos  || [];
      var statsPaginas = dataPg.paginas   || [];

      var totalUnidades = statsVentas.reduce(function (s, p) { return s + p.unidades; }, 0);
      var totalIngresos = statsVentas.reduce(function (s, p) { return s + p.total_vendido; }, 0);
      var totalVistas   = statsPaginas.reduce(function (s, p) { return s + (p.vistas || 0); }, 0);
      var topVenta      = statsVentas[0] || null;

      _setHtml('cat-summary-row',
        _statCard(totalUnidades,             'Unidades vendidas') +
        _statCard(_fmt(totalIngresos),       'Ingresos totales') +
        _statCard(totalVistas.toLocaleString(), 'Total vistas') +
        _statCard(topVenta ? _esc(topVenta.nombre) : '—', 'Producto top ventas')
      );

      // ── Tabla mas vendidos ─────────────────────────────────
      if (!statsVentas.length) {
        _setHtml('cat-ranking-ventas', emptyMsg);
      } else {
        var mappedV = statsVentas.map(function (p) {
          return { nombre: p.nombre, unidades: p.unidades, ingresos: p.total_vendido };
        });
        var maxV  = mappedV[0].unidades || 1;
        var rowsV = _catRankRows(mappedV, maxV, [
          { key: 'unidades', fmt: function (v) { return '<strong>' + v + '</strong>'; } },
          { key: 'ingresos', fmt: _fmt }
        ]);
        _setHtml('cat-ranking-ventas',
          '<table class="adm-table">' +
          '<thead><tr><th>#</th><th>Producto</th><th>Unidades</th><th>Ingresos</th><th>Proporcion</th></tr></thead>' +
          '<tbody>' + rowsV + '</tbody></table>'
        );
      }

      // ── Tabla mas vistos ───────────────────────────────────
      if (!statsPaginas.length) {
        _setHtml('cat-ranking-vistas', emptyMsg);
      } else {
        var maxVi  = statsPaginas[0].vistas || 1;
        var rowsVi = statsPaginas.map(function (p, i) {
          var pct     = Math.max(2, Math.round(((p.vistas || 0) / maxVi) * 100));
          var rankCls = i === 0 ? 'adm-rank adm-rank--gold'
            : i === 1 ? 'adm-rank adm-rank--silver'
            : i === 2 ? 'adm-rank adm-rank--bronze'
            : 'adm-rank';
          return '<tr>' +
            '<td><span class="' + rankCls + '">' + (i + 1) + '</span></td>' +
            '<td class="adm-td-strong">' + _esc(p.nombre) + '</td>' +
            '<td class="adm-td-muted" style="font-size:0.82em">' + _esc(p.slug || '') + '</td>' +
            '<td><strong>' + (p.vistas || 0).toLocaleString() + '</strong></td>' +
            '<td class="adm-bar-cell">' +
              '<div class="adm-bar-wrap"><div class="adm-bar adm-bar--blue" style="width:' + pct + '%"></div></div>' +
              '<span class="adm-bar-pct">' + pct + '%</span>' +
            '</td>' +
          '</tr>';
        }).join('');
        _setHtml('cat-ranking-vistas',
          '<table class="adm-table">' +
          '<thead><tr><th>#</th><th>Pagina</th><th>URL slug</th><th>Vistas</th><th>Proporcion</th></tr></thead>' +
          '<tbody>' + rowsVi + '</tbody></table>'
        );
      }

      // ── Insights cruzados ──────────────────────────────────
      var insightsEl = document.getElementById('cat-insights-section');
      if (!statsVentas.length && !statsPaginas.length) {
        _setHtml('cat-insights-body', emptyMsg);
        if (insightsEl) insightsEl.hidden = false;
        return;
      }

      // Cruzar paginas (que tienen producto) con ventas de ese producto
      var ventasNombreMap = {};
      statsVentas.forEach(function (p) { ventasNombreMap[p.nombre] = p.unidades; });

      var oportunidades = [];
      var campeones     = [];
      statsPaginas.forEach(function (pg) {
        if (!pg.producto) return;
        var vistas = pg.vistas || 0;
        if (vistas < 10) return;
        var ventas = ventasNombreMap[pg.producto] || 0;
        var conv   = ventas / vistas;
        var entry  = { nombre: pg.producto, pagina: pg.nombre, vistas: vistas, ventas: ventas };
        if (conv < 0.02)  oportunidades.push(entry);
        if (conv >= 0.05) campeones.push(entry);
      });

      var html = '';
      if (campeones.length) {
        html += '<div class="adm-insight adm-insight--ok">' +
          '<div class="adm-insight-title">Productos campeones</div>' +
          '<p class="adm-insight-desc">Alta conversion (5% o mas de vistas terminan en venta).</p>' +
          '<ul class="adm-insight-list">' +
          campeones.map(function (p) {
            return '<li><strong>' + _esc(p.nombre) + '</strong> — ' +
              p.vistas + ' vistas, ' + p.ventas + ' ventas (' +
              ((p.ventas / p.vistas) * 100).toFixed(1) + '% conv.)</li>';
          }).join('') + '</ul></div>';
      }
      if (oportunidades.length) {
        html += '<div class="adm-insight adm-insight--warn">' +
          '<div class="adm-insight-title">Oportunidad de mejora</div>' +
          '<p class="adm-insight-desc">Muchas vistas pero poca conversion. Revisar precio o pagina de venta.</p>' +
          '<ul class="adm-insight-list">' +
          oportunidades.map(function (p) {
            return '<li><strong>' + _esc(p.nombre) + '</strong> — ' +
              p.vistas + ' vistas, ' + p.ventas + ' ventas (' +
              ((p.ventas / p.vistas) * 100).toFixed(1) + '% conv.)</li>';
          }).join('') + '</ul></div>';
      }
      if (!html) {
        html = '<p class="adm-empty" style="padding:20px 0;">Aun no hay suficiente trafico cruzado para mostrar insights.</p>';
      }

      _setHtml('cat-insights-body', html);
      if (insightsEl) insightsEl.hidden = false;
    })
    .catch(function () {
      _setHtml('cat-ranking-ventas', errMsg);
      _setHtml('cat-ranking-vistas', errMsg);
      _setHtml('cat-summary-row',
        _statCard('—', 'Unidades vendidas') +
        _statCard('—', 'Ingresos totales') +
        _statCard('—', 'Total vistas') +
        _statCard('—', 'Producto top ventas')
      );
    });
}

/* ============================================================
   3. PAGINAS DE VENTA  — conectado a Supabase via motor
   ============================================================ */

var _pagCache = null; // cache en memoria

function pagSwitchSubTab(tabId) {
  ['crear', 'activas'].forEach(function (id) {
    var panel = document.getElementById('pag-subpanel-' + id);
    var btn   = document.getElementById('pag-subtab-btn-' + id);
    var active = id === tabId;
    if (panel) panel.hidden = !active;
    if (btn)   btn.classList.toggle('active', active);
  });
  if (tabId === 'activas') renderPagActivas();
  if (tabId === 'crear')   pagCargarProductos();
}

function pagCargarProductos() {
  var sel = document.getElementById('pag-producto-id');
  if (!sel) return;
  _adminFetch(MOTOR_URL + '/api/admin/productos')
    .then(function(r){ return r.json(); })
    .then(function(data){
      var lista = Array.isArray(data) ? data : (data.productos || []);
      sel.innerHTML = '<option value="">— Sin producto asociado —</option>';
      lista.filter(function(p){ return p.activo !== false; }).forEach(function(p){
        var opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.nombre + (p.precio ? ' — $' + Number(p.precio).toLocaleString('en-US') : '');
        sel.appendChild(opt);
      });
    })
    .catch(function(){ /* silencioso */ });
}

function pagPrevisualizar() {
  var elCode = document.getElementById('pag-html-code');
  var errEl  = document.getElementById('pag-html-error');
  var html   = elCode ? elCode.value.trim() : '';
  if (!html) {
    if (errEl) { errEl.textContent = 'Pega el HTML antes de previsualizar.'; errEl.hidden = false; }
    return;
  }
  if (errEl) errEl.hidden = true;
  var iframe = document.getElementById('pag-preview-iframe');
  var wrap   = document.getElementById('pag-preview-wrap');
  if (!iframe || !wrap) return;
  iframe.srcdoc = html;
  wrap.hidden = false;
  setTimeout(function () { wrap.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 80);
}

function pagUsarPlantilla() {
  var el = document.getElementById('pag-html-code');
  if (!el) return;
  if (el.value.trim() && !confirm('Esto reemplazara el codigo que tienes en el editor. Continuar?')) return;
  el.value = [
    '<!DOCTYPE html>',
    '<html lang="es">',
    '<head>',
    '  <meta charset="UTF-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '  <meta name="ea-producto" content="slug-del-producto">',
    '  <title>Nombre del Producto</title>',
    '  <style>',
    '    * { box-sizing: border-box; margin: 0; padding: 0; }',
    '    body { font-family: sans-serif; background: #fff; color: #1a1714; }',
    '    .hero { max-width: 540px; margin: 0 auto; padding: 40px 20px; text-align: center; }',
    '    .hero img { width: 100%; max-width: 400px; border-radius: 4px; margin-bottom: 24px; }',
    '    .hero h1 { font-size: 28px; font-weight: 700; margin-bottom: 12px; }',
    '    .hero p  { font-size: 15px; color: #555; line-height: 1.6; margin-bottom: 20px; }',
    '    .precio  { font-size: 32px; font-weight: 800; color: #b8973a; margin-bottom: 24px; }',
    '    .precio s { font-size: 18px; color: #999; font-weight: 400; margin-right: 10px; }',
    '    .btn-comprar-ea {',
    '      display: inline-block; width: 100%; max-width: 360px;',
    '      padding: 16px 24px; font-size: 16px; font-weight: 700;',
    '      background: #b8973a; color: #fff; border: none; border-radius: 4px;',
    '      cursor: pointer; letter-spacing: 0.04em; text-transform: uppercase;',
    '    }',
    '    .btn-comprar-ea:hover { opacity: 0.9; }',
    '    .beneficios { text-align: left; margin-bottom: 28px; }',
    '    .beneficios li { padding: 6px 0; font-size: 14px; list-style: none; }',
    '    .beneficios li::before { content: "\\u2713 "; color: #b8973a; font-weight: 700; }',
    '  </style>',
    '</head>',
    '<body>',
    '  <section class="hero">',
    '    <img src="URL_DE_FOTO_DEL_PRODUCTO" alt="Nombre del Producto">',
    '    <h1>Nombre del Producto</h1>',
    '    <p>Descripcion breve del producto: que es, para quien es y que problema resuelve.</p>',
    '    <ul class="beneficios">',
    '      <li>Primer beneficio clave del producto</li>',
    '      <li>Segundo beneficio clave</li>',
    '      <li>Tercer beneficio clave</li>',
    '    </ul>',
    '    <div class="precio"><s>$79</s>$49</div>',
    '    <button class="btn-comprar-ea">Comprar ahora</button>',
    '  </section>',
    '</body>',
    '</html>'
  ].join('\n');
  el.focus();
}

function pagCrearHtml() {
  var elNombre    = document.getElementById('pag-html-nombre');
  var elCode      = document.getElementById('pag-html-code');
  var elProducto  = document.getElementById('pag-producto-id');
  var errEl       = document.getElementById('pag-html-error');
  var successEl   = document.getElementById('pag-html-success');
  var btnEl       = document.getElementById('pag-crear-btn');
  var nombre      = elNombre   ? elNombre.value.trim()  : '';
  var html        = elCode     ? elCode.value.trim()    : '';
  var producto_id = elProducto ? elProducto.value       : '';

  if (successEl) successEl.hidden = true;
  if (!nombre) {
    if (errEl) { errEl.textContent = 'El nombre de la pagina es obligatorio.'; errEl.hidden = false; }
    if (elNombre) elNombre.focus();
    return;
  }
  if (!html) {
    if (errEl) { errEl.textContent = 'Pega el codigo HTML de la pagina.'; errEl.hidden = false; }
    if (elCode) elCode.focus();
    return;
  }
  if (errEl) errEl.hidden = true;
  if (btnEl) { btnEl.disabled = true; btnEl.textContent = 'Guardando...'; }

  _adminFetch(MOTOR_URL + '/api/admin/paginas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre: nombre, html: html, producto_id: producto_id || null })
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.ok) throw new Error(data.error || 'Error del servidor.');
      var link = PUBLIC_BASE_URL + '/p/' + data.pagina.slug;
      if (elNombre)   elNombre.value   = '';
      if (elCode)     elCode.value     = '';
      if (elProducto) elProducto.value = '';
      var pv = document.getElementById('pag-preview-wrap');
      if (pv) pv.hidden = true;
      if (successEl) {
        successEl.innerHTML = 'Pagina creada. Link: <a href="' + _esc(link) + '" target="_blank">' + _esc(link) + '</a> ' +
          '<button type="button" class="adm-btn adm-btn--sm adm-btn--outline" onclick="pagCopiarLink(\'' + _esc(link) + '\')">Copiar</button>';
        successEl.hidden = false;
      }
      _pagCache = null;
      renderPaginas();
      pagSwitchSubTab('activas');
    })
    .catch(function (e) {
      if (errEl) { errEl.textContent = 'Error al guardar: ' + e.message; errEl.hidden = false; }
    })
    .finally(function () {
      if (btnEl) { btnEl.disabled = false; btnEl.textContent = 'Crear pagina'; }
    });
}

function pagVerPagina(slug) {
  window.open(MOTOR_URL + '/p/' + slug, '_blank');
}

function pagToggleEstado(id, estaActiva) {
  _adminFetch(MOTOR_URL + '/api/admin/paginas/actualizar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: id, activa: !estaActiva })
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.ok) throw new Error(data.error || 'Error');
      _pagCache = null;
      renderPaginas();
      renderPagActivas();
    })
    .catch(function (e) { alert('Error: ' + e.message); });
}

function pagEliminar(id) {
  if (!confirm('Eliminar esta pagina de venta? Esta accion no se puede deshacer.')) return;
  _adminFetch(MOTOR_URL + '/api/admin/paginas/eliminar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: id })
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.ok) throw new Error(data.error || 'Error');
      _pagCache = null;
      renderPaginas();
      renderPagActivas();
    })
    .catch(function (e) { alert('Error al eliminar: ' + e.message); });
}

function pagCopiarLink(link) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(link).catch(function () {});
  } else {
    var ta = document.createElement('textarea');
    ta.value = link; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
  }
}

function _pagRenderCards(arr, wrapEl) {
  if (!arr.length) {
    wrapEl.innerHTML = '<p class="adm-empty" style="padding:40px 0;">Aun no hay paginas de venta. Crea una en la pestana "Crear pagina".</p>';
    return;
  }
  var cards = arr.map(function (p) {
    var localLink = PUBLIC_BASE_URL + '/p/' + p.slug;
    var estadoCls = p.activa ? 'adm-badge--ok'      : 'adm-badge--inactivo';
    var estadoTxt = p.activa ? 'Activa'             : 'Pausada';
    var toggleTxt = p.activa ? 'Pausar'             : 'Activar';
    return (
      '<div class="adm-pag-card' + (p.activa ? '' : ' adm-pag-card--pausada') + '">' +
        '<div class="adm-pag-card-thumb"><div class="adm-pag-html-thumb">&lt;/&gt;</div></div>' +
        '<div class="adm-pag-card-body">' +
          '<div class="adm-pag-card-header">' +
            '<span class="adm-td-strong">' + _esc(p.nombre) + '</span>' +
            '<span class="adm-badge ' + estadoCls + '">' + estadoTxt + '</span>' +
          '</div>' +
          '<div class="adm-pag-card-meta">' +
            '<span class="adm-badge adm-badge--html">HTML</span>' +
            '<span class="adm-td-muted" style="font-size:11px">' + (p.vistas || 0) + ' vistas</span>' +
            '<span class="adm-td-muted" style="font-size:11px">' + _fmtFecha(p.creado_en) + '</span>' +
          '</div>' +
          '<div class="adm-pag-card-link">' +
            '<a class="adm-link" href="' + _esc(localLink) + '" target="_blank">' + _esc(localLink) + '</a>' +
            '<button type="button" class="adm-btn adm-btn--sm adm-btn--outline" onclick="pagCopiarLink(\'' + _esc(localLink) + '\')">Copiar</button>' +
          '</div>' +
        '</div>' +
        '<div class="adm-pag-card-actions">' +
          '<button type="button" class="adm-btn adm-btn--sm adm-btn--outline" onclick="pagVerPagina(\'' + _esc(p.slug) + '\')">Ver</button>' +
          '<button type="button" class="adm-btn adm-btn--sm adm-btn--outline" onclick="pagToggleEstado(\'' + _esc(p.id) + '\',' + (p.activa ? 'true' : 'false') + ')">' + toggleTxt + '</button>' +
          '<button type="button" class="adm-btn adm-btn--sm adm-btn--danger" onclick="pagEliminar(\'' + _esc(p.id) + '\')">Eliminar</button>' +
        '</div>' +
      '</div>'
    );
  }).join('');
  wrapEl.innerHTML = '<div class="adm-pag-list">' + cards + '</div>';
}

function renderPagActivas() {
  var wrapEl = document.getElementById('pag-activas-wrap');
  if (!wrapEl) return;
  if (_pagCache) { _pagRenderCards(_pagCache, wrapEl); return; }
  wrapEl.innerHTML = '<p style="padding:32px;color:#999;font-style:italic;">Cargando paginas...</p>';
  _adminFetch(MOTOR_URL + '/api/admin/paginas')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.ok) throw new Error(data.error || 'Error');
      _pagCache = data.paginas || [];
      _pagRenderCards(_pagCache, wrapEl);
    })
    .catch(function (e) {
      wrapEl.innerHTML = '<p style="padding:32px;color:#c0392b;font-size:13px;">No se pudo conectar al servidor. Verifica que el motor este encendido.</p>';
    });
}

function renderPaginas() {
  _pagCache = null; // forzar fetch fresco
  // El sub-tab "Crear pagina" esta activo por defecto: cargar el dropdown de productos ya.
  pagCargarProductos();
  _adminFetch(MOTOR_URL + '/api/admin/paginas')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.ok) throw new Error(data.error || 'Error');
      var arr = data.paginas || [];
      _pagCache = arr;
      var activas     = arr.filter(function (p) { return p.activa; }).length;
      var totalVistas = arr.reduce(function (s, p) { return s + (p.vistas || 0); }, 0);
      _setHtml('pag-summary-row',
        _statCard(arr.length, 'Total paginas') +
        _statCard(activas, 'Activas') +
        _statCard(totalVistas.toLocaleString(), 'Vistas totales') +
        _statCard(arr.length - activas, 'Pausadas')
      );
      var activasPanel = document.getElementById('pag-subpanel-activas');
      if (activasPanel && !activasPanel.hidden) _pagRenderCards(arr, document.getElementById('pag-activas-wrap'));
    })
    .catch(function (e) {
      _setHtml('pag-summary-row', '<p style="color:#c0392b;font-size:13px;padding:16px;">No se pudo conectar al servidor. Verifica que el motor este encendido.</p>');
    });
}

/* ============================================================
   4. USUARIOS  — conectado a Supabase via motor (puerto 3002)
   ============================================================ */

// TODO: cuando el dominio esté listo, cambiar por: https://motor.ecommerceagents.store
var MOTOR_URL      = 'https://motor.ecommerceagents.store';
var PUBLIC_BASE_URL = MOTOR_URL; // misma base; cambiar junto con MOTOR_URL cuando haya dominio

// Cache en memoria para no recargar en cada re-render dentro de la misma sesión
var _usrCache = null;
var _crdCache = null;
var _usrSubTab = 'vendedores';

function usrSwitchSubTab(tab) {
  _usrSubTab = tab === 'creadores' ? 'creadores' : 'vendedores';
  ['vendedores', 'creadores'].forEach(function (t) {
    var btn = document.getElementById('usr-subtab-btn-' + t);
    var panel = document.getElementById('usr-subpanel-' + t);
    var active = t === _usrSubTab;
    if (btn) btn.classList.toggle('active', active);
    if (panel) panel.hidden = !active;
  });
  if (_usrSubTab === 'creadores') {
    if (_crdCache) _crdRenderTabla(_crdCache);
    else _crdLoadTabla();
  }
}

function _usrRenderSummary(vendedores, creadores) {
  var vCount = vendedores ? vendedores.length : 0;
  var cCount = creadores ? creadores.length : 0;
  _setHtml('usr-summary-row',
    _statCard(vCount, 'Total vendedores') +
    _statCard(cCount, 'Total creadores')
  );
}

function usrCopiar(texto) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(texto);
  } else {
    var ta = document.createElement('textarea');
    ta.value = texto; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
  }
}

function _usrRenderTabla(arr) {
  var rows = arr.map(function (u, idx) {
    var estadoCls = u.activo ? 'adm-badge--ok'   : 'adm-badge--inactivo';
    var estadoTxt = u.activo ? 'Activo'           : 'Desactivado';
    var toggleTxt = u.activo ? 'Desactivar'       : 'Activar';
    var toggleCls = u.activo ? 'adm-btn--danger'  : 'adm-btn--success';
    var idAttr    = 'data-uid="' + _esc(u.id) + '"';
    return '<tr id="usr-row-' + _esc(u.id) + '">' +
      '<td class="adm-td-muted adm-td-n">' + (idx + 1) + '</td>' +
      '<td><div class="adm-usr-cell">' +
        '<span class="adm-usr-name">' + _esc(u.codigo) + '</span>' +
        '<button type="button" class="adm-copy-mini" onclick="usrCopiar(\'' + _esc(u.codigo) + '\')">Copiar</button>' +
      '</div></td>' +
      '<td><span class="adm-badge ' + estadoCls + '" id="usr-badge-' + _esc(u.id) + '">' + estadoTxt + '</span></td>' +
      '<td><button type="button" class="adm-btn adm-btn--sm ' + toggleCls + '" ' + idAttr + ' id="usr-btn-' + _esc(u.id) + '" onclick="usrToggle(\'' + _esc(u.id) + '\',' + (u.activo ? 'true' : 'false') + ')">' + toggleTxt + '</button></td>' +
    '</tr>';
  }).join('');

  _setHtml('usr-table-wrap',
    '<table class="adm-table">' +
    '<thead><tr>' +
      '<th class="adm-th-n">N</th>' +
      '<th>Codigo de usuario</th>' +
      '<th>Estado</th>' +
      '<th>Accion</th>' +
    '</tr></thead>' +
    '<tbody>' + rows + '</tbody></table>'
  );
}

function _crdRenderTabla(arr) {
  if (!arr || !arr.length) {
    _setHtml('crd-table-wrap',
      '<table class="adm-table"><thead><tr>' +
      '<th class="adm-th-n">N</th><th>Nombre</th><th>Email</th><th>Productos</th><th>Estado</th><th>Accion</th>' +
      '</tr></thead><tbody><tr><td colspan="6" class="adm-td-muted" style="padding:24px;text-align:center;">No hay creadores registrados.</td></tr></tbody></table>'
    );
    return;
  }
  var rows = arr.map(function (c, idx) {
    var activo = String(c.estado || '').toLowerCase() === 'activo';
    var estadoCls = activo ? 'adm-badge--ok' : 'adm-badge--inactivo';
    var estadoTxt = activo ? 'Activo' : 'Inactivo';
    var toggleTxt = activo ? 'Desactivar' : 'Activar';
    var toggleCls = activo ? 'adm-btn--danger' : 'adm-btn--success';
    return '<tr id="crd-row-' + _esc(c.id) + '">' +
      '<td class="adm-td-muted adm-td-n">' + (idx + 1) + '</td>' +
      '<td><span class="adm-usr-name">' + _esc(c.nombre || '—') + '</span></td>' +
      '<td>' + _esc(c.email || '') + '</td>' +
      '<td class="adm-td-muted">' + (Number(c.num_productos) || 0) + '</td>' +
      '<td><span class="adm-badge ' + estadoCls + '" id="crd-badge-' + _esc(c.id) + '">' + estadoTxt + '</span></td>' +
      '<td><button type="button" class="adm-btn adm-btn--sm ' + toggleCls + '" id="crd-btn-' + _esc(c.id) + '" onclick="crdToggle(\'' + _esc(c.id) + '\',' + (activo ? 'true' : 'false') + ')">' + toggleTxt + '</button></td>' +
    '</tr>';
  }).join('');

  _setHtml('crd-table-wrap',
    '<table class="adm-table">' +
    '<thead><tr>' +
      '<th class="adm-th-n">N</th>' +
      '<th>Nombre</th>' +
      '<th>Email</th>' +
      '<th>Productos</th>' +
      '<th>Estado</th>' +
      '<th>Accion</th>' +
    '</tr></thead>' +
    '<tbody>' + rows + '</tbody></table>'
  );
}

function _crdLoadTabla() {
  _setHtml('crd-table-wrap', '<p style="padding:24px;color:#999;font-style:italic;">Cargando creadores...</p>');
  return _adminFetch(MOTOR_URL + '/api/admin/creadores')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.ok) throw new Error(data.error || 'Error del servidor.');
      _crdCache = data.creadores || [];
      _crdRenderTabla(_crdCache);
      _usrRenderSummary(_usrCache, _crdCache);
      return _crdCache;
    })
    .catch(function (e) {
      console.error('[crdLoadTabla]', e);
      _setHtml('crd-table-wrap',
        '<div style="padding:32px 24px;text-align:center;">' +
        '<p style="color:#c0392b;font-weight:600;margin-bottom:8px;">No se pudieron cargar los creadores.</p>' +
        '<button class="adm-btn adm-btn--sm" style="margin-top:16px" onclick="_crdLoadTabla()">Reintentar</button>' +
        '</div>'
      );
      throw e;
    });
}

function crdToggle(cid, estaActivo) {
  var endpoint = estaActivo ? '/api/admin/creadores/desactivar' : '/api/admin/creadores/activar';
  var btn   = document.getElementById('crd-btn-'   + cid);
  var badge = document.getElementById('crd-badge-' + cid);
  if (btn) btn.disabled = true;

  _adminFetch(MOTOR_URL + endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creador_id: cid })
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.ok) throw new Error(data.error || 'Error del servidor.');
      var nuevoActivo = !estaActivo;
      if (_crdCache) {
        for (var i = 0; i < _crdCache.length; i++) {
          if (_crdCache[i].id === cid) {
            _crdCache[i].estado = nuevoActivo ? 'activo' : 'inactivo';
            break;
          }
        }
      }
      if (badge) {
        badge.className = 'adm-badge ' + (nuevoActivo ? 'adm-badge--ok' : 'adm-badge--inactivo');
        badge.textContent = nuevoActivo ? 'Activo' : 'Inactivo';
      }
      if (btn) {
        btn.disabled = false;
        btn.className = 'adm-btn adm-btn--sm ' + (nuevoActivo ? 'adm-btn--danger' : 'adm-btn--success');
        btn.textContent = nuevoActivo ? 'Desactivar' : 'Activar';
        btn.setAttribute('onclick', 'crdToggle(\'' + cid + '\',' + (nuevoActivo ? 'true' : 'false') + ')');
      }
    })
    .catch(function (e) {
      console.error('[crdToggle]', e);
      if (btn) btn.disabled = false;
      alert('Error al cambiar estado: ' + e.message);
    });
}

function usrToggle(uid, estaActivo) {
  var endpoint = estaActivo ? '/api/admin/usuarios/desactivar' : '/api/admin/usuarios/activar';
  var btn   = document.getElementById('usr-btn-'   + uid);
  var badge = document.getElementById('usr-badge-' + uid);
  if (btn) btn.disabled = true;

  _adminFetch(MOTOR_URL + endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: uid })
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.ok) throw new Error(data.error || 'Error del servidor.');
      var nuevoActivo = !estaActivo;
      // Actualizar cache local
      if (_usrCache) {
        for (var i = 0; i < _usrCache.length; i++) {
          if (_usrCache[i].id === uid) { _usrCache[i].activo = nuevoActivo; break; }
        }
      }
      // Actualizar fila sin recargar todo
      if (badge) {
        badge.className = 'adm-badge ' + (nuevoActivo ? 'adm-badge--ok' : 'adm-badge--inactivo');
        badge.textContent = nuevoActivo ? 'Activo' : 'Desactivado';
      }
      if (btn) {
        btn.disabled = false;
        btn.className = 'adm-btn adm-btn--sm ' + (nuevoActivo ? 'adm-btn--danger' : 'adm-btn--success');
        btn.textContent = nuevoActivo ? 'Desactivar' : 'Activar';
        btn.setAttribute('onclick', 'usrToggle(\'' + uid + '\',' + (nuevoActivo ? 'true' : 'false') + ')');
      }
      // Recalcular cards de resumen
      if (_usrCache) _usrRenderSummary(_usrCache, _crdCache);
    })
    .catch(function (e) {
      console.error('[usrToggle]', e);
      if (btn) btn.disabled = false;
      alert('Error al cambiar estado: ' + e.message);
    });
}

function renderUsuarios() {
  _usrSubTab = 'vendedores';
  usrSwitchSubTab('vendedores');
  _setHtml('usr-table-wrap', '<p style="padding:24px;color:#999;font-style:italic;">Cargando vendedores...</p>');
  _setHtml('crd-table-wrap', '<p style="padding:24px;color:#999;font-style:italic;">Cargando creadores...</p>');

  Promise.all([
    _adminFetch(MOTOR_URL + '/api/admin/usuarios').then(function (r) { return r.json(); }),
    _adminFetch(MOTOR_URL + '/api/admin/creadores').then(function (r) { return r.json(); })
  ])
    .then(function (results) {
      var vendData = results[0];
      var crdData  = results[1];
      if (!vendData.ok) throw new Error(vendData.error || 'Error al cargar vendedores.');
      if (!crdData.ok) throw new Error(crdData.error || 'Error al cargar creadores.');
      _usrCache = vendData.usuarios || [];
      _crdCache = crdData.creadores || [];
      _usrRenderSummary(_usrCache, _crdCache);
      _usrRenderTabla(_usrCache);
      if (_usrSubTab === 'creadores') _crdRenderTabla(_crdCache);
    })
    .catch(function (e) {
      console.error('[renderUsuarios]', e);
      _setHtml('usr-summary-row', '');
      _setHtml('usr-table-wrap',
        '<div style="padding:32px 24px;text-align:center;">' +
        '<p style="color:#c0392b;font-weight:600;margin-bottom:8px;">No se pudo conectar al servidor.</p>' +
        '<p style="color:#888;font-size:13px;">Verifica que el motor este encendido e intenta de nuevo.</p>' +
        '<button class="adm-btn adm-btn--sm" style="margin-top:16px" onclick="renderUsuarios()">Reintentar</button>' +
        '</div>'
      );
    });

  // Ventas globales
  // TODO: cargar datos reales desde Supabase/backend
  var rowsV = DEMO_VENTAS_GLOBAL.map(function (v) {
    return '<tr>' +
      '<td class="adm-td-muted">' + _fmtFecha(v.fecha) + '</td>' +
      '<td class="adm-td-strong">' + _esc(v.usuario) + '</td>' +
      '<td>' + _esc(v.producto) + '</td>' +
      '<td>' + _fmt(v.monto) + '</td>' +
      '<td>' + _badgeVenta(v.estado) + '</td>' +
    '</tr>';
  }).join('');

  _setHtml('usr-ventas-wrap',
    '<table class="adm-table">' +
    '<thead><tr><th>Fecha</th><th>Usuario</th><th>Producto</th><th>Monto</th><th>Estado</th></tr></thead>' +
    '<tbody>' + (rowsV || '<tr><td colspan="5" class="adm-empty">No hay ventas registradas aun.</td></tr>') + '</tbody></table>'
  );
}

/* ============================================================
   5. CUENTAS (admin) — Utilidad y Ventas + Pagos
   ============================================================ */

// ── Sub-tab switching ─────────────────────────────────────────────────
var _cuentasSubTab = 'utilidad'; // default active

function cuentasSwitchSubTab(tabId) {
  ['utilidad', 'pagos'].forEach(function (id) {
    var panel = document.getElementById('cuentas-subpanel-' + id);
    var btn   = document.getElementById('cuentas-subtab-btn-' + id);
    var active = id === tabId;
    if (panel) panel.hidden = !active;
    if (btn)   btn.classList.toggle('active', active);
  });
  _cuentasSubTab = tabId;
  if (tabId === 'utilidad') renderUtilidadVentas();
  if (tabId === 'pagos')    renderPagosAdmin();
}

function renderCuentasAdmin() {
  // Render whichever sub-tab is active
  if (_cuentasSubTab === 'pagos') {
    renderPagosAdmin();
  } else {
    renderUtilidadVentas();
  }
}

// ── SUB-TAB: UTILIDAD Y VENTAS ────────────────────────────────────────

function renderUtilidadVentas() {
  var summaryEl = document.getElementById('cuentas-util-summary');
  var tableEl   = document.getElementById('cuentas-ventas-wrap');

  if (summaryEl) summaryEl.innerHTML =
    _statCard('...', 'Ventas plataforma') +
    _statCard('...', 'Comisiones a pagar') +
    _statCard('...', 'Pedidos totales') +
    _statCard('...', 'Vendedores activos');
  if (tableEl) tableEl.innerHTML = '<p class="adm-empty-text">Cargando...</p>';

  _adminFetch(MOTOR_URL + '/api/admin/ventas-por-vendedor')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.ok) throw new Error(data.error || 'Error del servidor');
      var rg = data.resumen_global || {};
      var vendedores = data.vendedores || [];

      if (summaryEl) {
        summaryEl.innerHTML =
          _statCard(_fmt(rg.total_vendido || 0),  'Ventas plataforma') +
          _statCard('<span style="color:var(--adm-green)">' + _fmt(rg.total_comision || 0) + '</span>', 'Comisiones a pagar') +
          _statCard(rg.total_ventas || 0,          'Pedidos totales') +
          _statCard(vendedores.length,             'Vendedores activos');
      }

      if (!tableEl) return;
      if (vendedores.length === 0) {
        tableEl.innerHTML = '<p class="adm-empty-text">Aun no hay ventas registradas.</p>';
        return;
      }

      var rows = vendedores.map(function (v) {
        return '<tr>' +
          '<td class="adm-td-strong">' + _esc(v.codigo || '—') + '</td>' +
          '<td>' + (v.ventas || 0) + '</td>' +
          '<td>' + _fmt(v.total_vendido || 0) + '</td>' +
          '<td style="color:var(--adm-green);font-weight:600">' + _fmt(v.total_comision || 0) + '</td>' +
          '<td>' + _fmt(v.pagado || 0) + '</td>' +
          '<td style="color:var(--adm-accent,#b89368);font-weight:600">' + _fmt(v.saldo_pendiente || 0) + '</td>' +
        '</tr>';
      }).join('');

      tableEl.innerHTML =
        '<div class="adm-table-wrap">' +
        '<table class="adm-table">' +
        '<thead><tr>' +
          '<th>Vendedor</th>' +
          '<th>Ventas</th>' +
          '<th>Total vendido</th>' +
          '<th>Comision generada</th>' +
          '<th>Ya pagado</th>' +
          '<th>Saldo pendiente</th>' +
        '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
        '</table></div>';
    })
    .catch(function () {
      if (summaryEl) summaryEl.innerHTML =
        _statCard('—', 'Ventas plataforma') +
        _statCard('—', 'Comisiones a pagar') +
        _statCard('—', 'Pedidos totales') +
        _statCard('—', 'Vendedores activos');
      if (tableEl) tableEl.innerHTML = '<p class="adm-empty-text" style="color:#c0392b">Error al cargar datos. Verifica que el motor este activo.</p>';
    });
}

// ── SUB-TAB: PAGOS ────────────────────────────────────────────────────

var APAG_KEY      = 'admin_solicitudes_pago';
var APAG_HIST_KEY = 'admin_pagos_historial';

// TODO: en produccion, las solicitudes llegan de los usuarios reales (cuando
// piden pago en su panel) via Supabase. El detalle de ventas/devoluciones se
// calcula de las ventas reales. El boton Pagar se conecta al desembolso real.

function _apagCargar() {
  try { return JSON.parse(localStorage.getItem(APAG_KEY) || '[]'); } catch (e) { return []; }
}
function _apagGuardar(arr) {
  try { localStorage.setItem(APAG_KEY, JSON.stringify(arr)); } catch (e) {}
}
function _apagHistCargar() {
  try { return JSON.parse(localStorage.getItem(APAG_HIST_KEY) || '[]'); } catch (e) { return []; }
}
function _apagHistGuardar(arr) {
  try { localStorage.setItem(APAG_HIST_KEY, JSON.stringify(arr)); } catch (e) {}
}

// Returns label like "1-15 Jun 2026" or "16-30 Jun 2026"
function _apagQuincena(fechaStr) {
  var d   = fechaStr ? new Date(fechaStr) : new Date();
  var M   = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  var dia = d.getDate();
  var mes = M[d.getMonth()];
  var anio = d.getFullYear();
  if (dia <= 15) return '1-15 ' + mes + ' ' + anio;
  var ultimo = new Date(anio, d.getMonth() + 1, 0).getDate();
  return '16-' + ultimo + ' ' + mes + ' ' + anio;
}

// Sortable key: "YYYY-MM-1" or "YYYY-MM-2"
function _apagQuincenaKey(fechaStr) {
  var d = fechaStr ? new Date(fechaStr) : new Date();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  return d.getFullYear() + '-' + m + '-' + (d.getDate() <= 15 ? '1' : '2');
}

function renderPagosAdmin() {
  var solicitudes = _apagCargar();
  var historial   = _apagHistCargar();

  // Pending = everything not yet fully Pagado
  var pendientes = solicitudes.filter(function (s) { return s.estado !== 'Pagado'; });

  // Paid this quincena
  var qActual = _apagQuincena();
  var pagadoEstaQ = historial
    .filter(function (h) { return h.quincena === qActual; })
    .reduce(function (sum, h) { return sum + (h.totalPagar || h.monto || 0); }, 0);

  var totalPend = pendientes.reduce(function (sum, s) {
    return sum + (s.totalPagar != null ? s.totalPagar : (s.monto || 0));
  }, 0);

  _setHtml('pag-summary-row',
    _statCard('<span style="color:#8B6E1A">' + _fmt(totalPend) + '</span>', 'Por pagar') +
    _statCard(_fmt(pagadoEstaQ), 'Pagado esta quincena') +
    _statCard(pendientes.length, 'Solicitudes pendientes')
  );

  _setHtml('pag-solicitudes-wrap', _apagRenderPendientes(pendientes));
  _setHtml('pag-historial-wrap',   _apagRenderHistorial(historial));
}

function _apagRenderPendientes(solicitudes) {
  if (!solicitudes.length) {
    return '<p class="adm-empty-text">No hay solicitudes de pago pendientes.</p>';
  }

  var sorted = solicitudes.slice().sort(function (a, b) {
    return new Date(b.fechaSolicitud) - new Date(a.fechaSolicitud);
  });

  var rows = sorted.map(function (s) {
    var esPagando = s.estado === 'Pagando';
    var accion = esPagando
      ? '<span class="adm-pagando-label">Procesando...</span>'
      : '<button type="button" class="adm-btn adm-btn--sm adm-btn--pagar" onclick="pagoMarcarPagado(\'' + s.id + '\')">Pagar</button>';

    var dev = s.devoluciones || 0;
    var devStr = dev > 0
      ? '<span class="adm-dev-neg">-' + _fmt(dev) + '</span>'
      : '<span class="adm-muted-dash">—</span>';

    var total = s.totalPagar != null ? s.totalPagar : s.monto;

    return '<tr id="apag-row-' + s.id + '">' +
      '<td class="adm-td-usr">' +
        '<div class="adm-usr-name">' + _esc(s.usuario) + '</div>' +
        '<div class="adm-usr-code">' + _esc(s.codigo || '') + '</div>' +
      '</td>' +
      '<td>' + _fmt(s.monto) + '</td>' +
      '<td class="adm-td-muted">' + _esc(s.productosVendidos || '—') + '</td>' +
      '<td>' + devStr + '</td>' +
      '<td class="adm-td-strong">' + _fmt(total) + '</td>' +
      '<td class="adm-td-muted">' + _fmtFecha(s.fechaSolicitud) + '</td>' +
      '<td>' + _badgePago(s.estado) + '</td>' +
      '<td>' + accion + '</td>' +
    '</tr>';
  }).join('');

  return '<div class="adm-table-wrap">' +
    '<table class="adm-table">' +
    '<thead><tr>' +
      '<th>Usuario</th>' +
      '<th>Monto</th>' +
      '<th>Productos vendidos</th>' +
      '<th>Devoluciones</th>' +
      '<th>Total a pagar</th>' +
      '<th>Fecha solicitud</th>' +
      '<th>Estado</th>' +
      '<th>Accion</th>' +
    '</tr></thead>' +
    '<tbody>' + rows + '</tbody>' +
    '</table></div>';
}

function _apagRenderHistorial(historial) {
  if (!historial.length) {
    return '<p class="adm-empty-text">El historial de pagos por quincena aparecera aqui.</p>';
  }

  // Group by quincenaKey
  var grupos = {};
  historial.forEach(function (h) {
    var key = h.quincenaKey || _apagQuincenaKey(h.fechaPago);
    if (!grupos[key]) {
      grupos[key] = { label: h.quincena || _apagQuincena(h.fechaPago), items: [], total: 0 };
    }
    grupos[key].items.push(h);
    grupos[key].total += (h.totalPagar != null ? h.totalPagar : (h.monto || 0));
  });

  var keys = Object.keys(grupos).sort().reverse();

  return keys.map(function (key) {
    var g = grupos[key];

    var rows = g.items.map(function (h) {
      var dev = h.devoluciones || 0;
      var devStr = dev > 0
        ? '<span class="adm-dev-neg">-' + _fmt(dev) + '</span>'
        : '<span class="adm-muted-dash">—</span>';
      var total = h.totalPagar != null ? h.totalPagar : h.monto;

      return '<tr>' +
        '<td class="adm-td-usr">' +
          '<div class="adm-usr-name">' + _esc(h.usuario) + '</div>' +
          '<div class="adm-usr-code">' + _esc(h.codigo || '') + '</div>' +
        '</td>' +
        '<td>' + _fmt(h.monto) + '</td>' +
        '<td class="adm-td-muted">' + _esc(h.productosVendidos || '—') + '</td>' +
        '<td>' + devStr + '</td>' +
        '<td class="adm-td-strong">' + _fmt(total) + '</td>' +
        '<td class="adm-td-muted">' + _fmtFecha(h.fechaPago) + '</td>' +
        '<td>' + _badgePago('Pagado') + '</td>' +
      '</tr>';
    }).join('');

    return '<div class="adm-hist-group">' +
      '<div class="adm-hist-header">' +
        '<span class="adm-hist-quincena">' + _esc(g.label) + '</span>' +
        '<span class="adm-hist-total">Total pagado: <strong>' + _fmt(g.total) + '</strong></span>' +
      '</div>' +
      '<div class="adm-table-wrap">' +
      '<table class="adm-table">' +
      '<thead><tr>' +
        '<th>Usuario</th>' +
        '<th>Monto</th>' +
        '<th>Productos vendidos</th>' +
        '<th>Devoluciones</th>' +
        '<th>Total pagado</th>' +
        '<th>Fecha de pago</th>' +
        '<th>Estado</th>' +
      '</tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
      '</table></div>' +
    '</div>';
  }).join('');
}

function pagoMarcarPagado(id) {
  var solicitudes = _apagCargar();
  var idx = solicitudes.findIndex(function (s) { return String(s.id) === String(id); });
  if (idx === -1) return;

  // Immediate feedback: set Pagando + update that row only
  solicitudes[idx].estado = 'Pagando';
  _apagGuardar(solicitudes);

  var row = document.getElementById('apag-row-' + id);
  if (row) {
    row.cells[6].innerHTML = _badgePago('Pagando');
    row.cells[7].innerHTML = '<span class="adm-pagando-label">Procesando...</span>';
  }

  // After short delay, finalize as Pagado and move to historial
  setTimeout(function () {
    var arr = _apagCargar();
    var i   = arr.findIndex(function (s) { return String(s.id) === String(id); });
    if (i === -1) return;

    var sol = arr[i];
    var now = new Date().toISOString();
    sol.estado      = 'Pagado';
    sol.fechaPago   = now;
    sol.quincena    = _apagQuincena(now);
    sol.quincenaKey = _apagQuincenaKey(now);

    // Move to historial
    var hist = _apagHistCargar();
    hist.push(sol);
    _apagHistGuardar(hist);

    // Remove from pending
    arr.splice(i, 1);
    _apagGuardar(arr);

    // TODO: en produccion — notificar al usuario via Telegram + registrar en Supabase
    renderPagosAdmin();
  }, 1200);
}

/* ============================================================
   6. PEDIDOS  — conectado a Supabase via motor
   ============================================================ */

var _pedCache        = null;   // cache en memoria
var _pedFiltroActivo = 'todos';

function _badgePedido(estado) {
  var map = {
    'Pendiente': 'adm-badge--bajo',
    'Procesado': 'adm-badge--pagado',
    'Enviado':   'adm-badge--disponible',
    'Cancelado': 'adm-badge--agotado'
  };
  return '<span class="adm-badge ' + (map[estado] || 'adm-badge--bajo') + '">' + _esc(estado) + '</span>';
}

function _fmtDir(p) {
  return [p.direccion, p.ciudad, p.estado_region, p.zip, p.pais]
    .filter(Boolean).join(', ') || '—';
}

function pedFiltrar(valor) {
  _pedFiltroActivo = valor;
  document.querySelectorAll('.ped-filtro-btn').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-filtro') === valor);
  });
  if (_pedCache) renderPedidosTabla(_pedCache);
}

/* ============================================================
   VENTA MANUAL
   ============================================================ */

var _manualFormOpen = false;
var _manualProductos = []; // cache de productos para el dropdown

function manualToggleForm() {
  _manualFormOpen = !_manualFormOpen;
  var wrap = document.getElementById('adm-manual-form-wrap');
  var icon = document.getElementById('adm-manual-toggle-icon');
  if (wrap) wrap.hidden = !_manualFormOpen;
  if (icon) icon.textContent = _manualFormOpen ? '▲' : '▼';
  if (_manualFormOpen && _manualProductos.length === 0) _manualCargarProductos();
}

function _manualCargarProductos() {
  _adminFetch(MOTOR_URL + '/api/admin/productos')
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d.ok) return;
      _manualProductos = d.productos || [];
      var sel = document.getElementById('adm-m-producto');
      if (!sel) return;
      var opts = '<option value="">— Seleccionar del catalogo —</option>';
      _manualProductos.forEach(function (p) {
        opts += '<option value="' + _esc(p.id) + '" data-precio="' + Number(p.precio || 0) + '">' +
                _esc(p.nombre) + ' — $' + Number(p.precio || 0).toLocaleString('es-CO') + '</option>';
      });
      sel.innerHTML = opts;
    })
    .catch(function () {});
}

function manualOnProductoChange(sel) {
  var opt = sel.options[sel.selectedIndex];
  var precioEl = document.getElementById('adm-m-precio');
  var nombreEl = document.getElementById('adm-m-nombre-prod');
  if (opt && opt.value && precioEl) {
    var p = Number(opt.getAttribute('data-precio') || 0);
    if (p > 0) precioEl.value = p;
    if (nombreEl) nombreEl.value = ''; // usar nombre del catalogo
  }
}

function _manualLimpiarForm() {
  ['adm-m-vendedor','adm-m-nombre-prod','adm-m-precio','adm-m-cli-nombre',
   'adm-m-cli-tel','adm-m-dir','adm-m-ciudad','adm-m-estado','adm-m-zip','adm-m-comprobante']
    .forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ''; });
  var pais = document.getElementById('adm-m-pais'); if (pais) pais.value = 'Colombia';
  var prod = document.getElementById('adm-m-producto'); if (prod) prod.selectedIndex = 0;
  var met  = document.getElementById('adm-m-metodo');  if (met)  met.selectedIndex  = 0;
  var msg  = document.getElementById('adm-manual-msg');
  if (msg) { msg.textContent = ''; msg.className = 'adm-manual-msg'; }
}

function manualGuardarVenta() {
  var btn   = document.getElementById('adm-manual-save-btn');
  var msg   = document.getElementById('adm-manual-msg');
  var _g    = function (id) { var e = document.getElementById(id); return e ? e.value.trim() : ''; };

  var codigo_vendedor  = _g('adm-m-vendedor').toUpperCase();
  var prodSel          = document.getElementById('adm-m-producto');
  var producto_id      = prodSel && prodSel.value ? prodSel.value : null;
  var nombre_producto  = _g('adm-m-nombre-prod');
  var precio           = parseFloat(_g('adm-m-precio')) || 0;
  var cliente_nombre   = _g('adm-m-cli-nombre');
  var cliente_telefono = _g('adm-m-cli-tel');
  var direccion        = _g('adm-m-dir');
  var ciudad           = _g('adm-m-ciudad');
  var estado_region    = _g('adm-m-estado');
  var zip              = _g('adm-m-zip');
  var pais             = _g('adm-m-pais') || 'Colombia';
  var metodo_pago      = _g('adm-m-metodo') || 'efectivo';
  var comprobante      = _g('adm-m-comprobante');

  // Validaciones básicas
  if (!codigo_vendedor) {
    if (msg) { msg.className = 'adm-manual-msg adm-manual-msg--err'; msg.textContent = 'El codigo del vendedor es obligatorio.'; }
    return;
  }
  if (!cliente_nombre || !cliente_telefono) {
    if (msg) { msg.className = 'adm-manual-msg adm-manual-msg--err'; msg.textContent = 'Nombre y telefono del cliente son obligatorios.'; }
    return;
  }
  if (!producto_id && !nombre_producto && precio <= 0) {
    if (msg) { msg.className = 'adm-manual-msg adm-manual-msg--err'; msg.textContent = 'Selecciona un producto del catalogo o ingresa nombre y precio.'; }
    return;
  }
  if (precio <= 0 && !producto_id) {
    if (msg) { msg.className = 'adm-manual-msg adm-manual-msg--err'; msg.textContent = 'El precio es obligatorio cuando no seleccionas un producto del catalogo.'; }
    return;
  }

  if (btn) btn.disabled = true;
  if (msg) { msg.className = 'adm-manual-msg'; msg.textContent = 'Guardando...'; }

  _adminFetch(MOTOR_URL + '/api/admin/pedidos/manual', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      codigo_vendedor, producto_id, nombre_producto, precio: precio || undefined,
      cliente_nombre, cliente_telefono,
      direccion, ciudad, estado_region, zip, pais,
      metodo_pago, comprobante
    })
  })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (btn) btn.disabled = false;
      if (!d.ok) throw new Error(d.error || 'Error al guardar.');
      if (msg) { msg.className = 'adm-manual-msg adm-manual-msg--ok'; msg.textContent = '✓ Venta registrada correctamente. Suma a la comision del vendedor.'; }
      _manualLimpiarForm();
      // Refrescar lista de pedidos
      renderPedidos();
    })
    .catch(function (e) {
      if (btn) btn.disabled = false;
      if (msg) { msg.className = 'adm-manual-msg adm-manual-msg--err'; msg.textContent = e.message || 'Error al guardar la venta.'; }
    });
}

/* ── Pedidos ─────────────────────────────────────────────── */

function renderPedidos() {
  _pedFiltroActivo = 'todos';
  document.querySelectorAll('.ped-filtro-btn').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-filtro') === 'todos');
  });
  _setHtml('ped-tabla-wrap', '<p class="adm-empty-text" style="padding:28px">Cargando pedidos...</p>');
  _setHtml('ped-summary-row', '');

  _adminFetch(MOTOR_URL + '/api/admin/pedidos')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.ok) throw new Error(data.error || 'Error del servidor.');
      _pedCache = data.pedidos || [];
      var arr = _pedCache;

      var pendientes = arr.filter(function (p) { return p.estado === 'Pendiente'; }).length;
      var procesados = arr.filter(function (p) { return p.estado === 'Procesado'; }).length;
      var enviados   = arr.filter(function (p) { return p.estado === 'Enviado';   }).length;
      var totalMonto = arr.reduce(function (s, p) { return s + (Number(p.monto) || 0); }, 0);

      _setHtml('ped-summary-row',
        _statCard('<span style="color:#b8973a">' + pendientes + '</span>', 'Pendientes') +
        _statCard('<span style="color:#2E7D32">' + procesados + '</span>', 'Procesados') +
        _statCard('<span style="color:#1565C0">' + enviados + '</span>', 'Enviados') +
        _statCard(_fmt(totalMonto), 'Total vendido')
      );

      renderPedidosTabla(arr);
    })
    .catch(function (e) {
      _setHtml('ped-tabla-wrap',
        '<p class="adm-empty-text" style="color:#c0392b;padding:28px">Error al cargar pedidos: ' +
        _esc(e.message) + '. Verifica que el motor este encendido.</p>');
    });
}

function renderPedidosTabla(arr) {
  var filtro   = _pedFiltroActivo;
  var filtered = filtro === 'todos' ? arr : arr.filter(function (p) { return p.estado === filtro; });

  if (!arr.length) {
    _setHtml('ped-tabla-wrap', '<p class="adm-empty-text">Aun no hay pedidos. Cuando un cliente complete una compra, aparecera aqui.</p>');
    return;
  }
  if (!filtered.length) {
    _setHtml('ped-tabla-wrap', '<p class="adm-empty-text">No hay pedidos con estado "' + _esc(filtro) + '" en este momento.</p>');
    return;
  }

  var rows = filtered.map(function (p) {
    var vendedor  = p.ref_vendedor ? p.ref_vendedor : 'Directo';
    var esManual  = p.origen === 'manual';
    var manualTag = esManual ? '<span class="adm-badge-manual">Manual</span>' : '';

    var accionHtml = '';
    if (p.estado === 'Pendiente') {
      accionHtml = '<button type="button" class="adm-btn adm-btn--sm adm-btn--pagar" ' +
        'onclick="pedidoActualizar(\'' + p.id + '\',\'Procesado\')">Marcar procesado</button>';
    } else if (p.estado === 'Procesado') {
      accionHtml = '<button type="button" class="adm-btn adm-btn--sm adm-btn--primary" ' +
        'onclick="pedidoActualizar(\'' + p.id + '\',\'Enviado\')">Marcar enviado</button>';
    } else {
      accionHtml = '<span class="adm-td-muted" style="font-size:11px">—</span>';
    }

    return '<tr id="ped-row-' + p.id + '"' + (esManual ? ' class="ped-row-manual"' : '') + '>' +
      '<td class="adm-td-strong">' + _esc(p.nombre_producto || '—') + ' ' + manualTag + '</td>' +
      '<td class="adm-td-strong">' + _fmt(p.monto || 0) + '</td>' +
      '<td class="adm-td-usr">' +
        '<div class="adm-usr-name">' + _esc(p.cliente_nombre || '—') + '</div>' +
        '<div class="adm-usr-code">' + _esc(p.cliente_email || '') + '</div>' +
        '<div class="adm-usr-code">' + _esc(p.cliente_telefono || '') + '</div>' +
      '</td>' +
      '<td class="adm-td-muted adm-td-dir">' + _esc(_fmtDir(p)) + '</td>' +
      '<td class="adm-td-usr">' +
        '<div class="adm-usr-name">' + _esc(vendedor) + '</div>' +
        (p.metodo_pago ? '<div class="adm-usr-code">' + _esc(p.metodo_pago) + '</div>' : '') +
      '</td>' +
      '<td>' + _badgePedido(p.estado || 'Pendiente') + '</td>' +
      '<td class="adm-td-muted">' + _fmtFecha(p.fecha) + '</td>' +
      '<td style="white-space:nowrap">' + accionHtml + '</td>' +
    '</tr>';
  }).join('');

  _setHtml('ped-tabla-wrap',
    '<div class="adm-table-wrap">' +
    '<table class="adm-table">' +
    '<thead><tr>' +
      '<th>Producto</th>' +
      '<th>Monto</th>' +
      '<th>Cliente</th>' +
      '<th>Direccion de envio</th>' +
      '<th>Vendedor</th>' +
      '<th>Estado</th>' +
      '<th>Fecha</th>' +
      '<th>Accion</th>' +
    '</tr></thead>' +
    '<tbody>' + rows + '</tbody>' +
    '</table></div>'
  );
}

function pedidoActualizar(id, nuevoEstado) {
  var btn = document.querySelector('#ped-row-' + id + ' .adm-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

  _adminFetch(MOTOR_URL + '/api/admin/pedidos/actualizar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: id, estado: nuevoEstado })
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.ok) throw new Error(data.error || 'Error');
      if (_pedCache) {
        var idx = _pedCache.findIndex(function (p) { return String(p.id) === String(id); });
        if (idx !== -1) _pedCache[idx].estado = nuevoEstado;
      }
      renderPedidosTabla(_pedCache || []);
    })
    .catch(function (e) {
      alert('Error al actualizar pedido: ' + e.message);
      if (btn) { btn.disabled = false; btn.textContent = 'Reintentar'; }
    });
}

/* ============================================================
   MODAL
   ============================================================ */

function admAbrirModal(titulo, cuerpo) {
  var overlay = document.getElementById('adm-modal');
  var title   = document.getElementById('adm-modal-title');
  var body    = document.getElementById('adm-modal-body');
  if (!overlay) return;
  if (title) title.textContent = titulo;
  if (body)  body.innerHTML    = cuerpo;
  overlay.hidden = false;
}

function admCerrarModal() {
  var overlay = document.getElementById('adm-modal');
  if (overlay) overlay.hidden = true;
}

/* ── Activos Digitales (aprobacion + cuentas) ─────────────────────── */

var _maCache = [];
var _maSubTabActivo = 'por-aprobar';
var _maCategoriaActiva = '';
var _maCuentasCache = [];

var MA_SUBTABS = ['por-aprobar', 'aprobados', 'cuentas'];
var MA_CATEGORIAS = ['', 'infoproducto', 'contenido_digital', 'miniapp'];

function _maCategoriaLabel(cat) {
  var map = {
    infoproducto:      'Infoproducto',
    contenido_digital: 'Contenido Digital',
    miniapp:           'Mini App'
  };
  return map[cat] || 'Mini App';
}

function _maCategoriaBadgeClass(cat) {
  var map = {
    infoproducto:      'adm-badge--cat-info',
    contenido_digital: 'adm-badge--cat-contenido',
    miniapp:           'adm-badge--cat-miniapp'
  };
  return map[cat] || 'adm-badge--cat-miniapp';
}

function _maFetchUrl() {
  var url = MOTOR_URL + '/api/admin/miniapps';
  if (_maCategoriaActiva) {
    url += '?categoria=' + encodeURIComponent(_maCategoriaActiva);
  }
  return url;
}

function _maUpdateCategoriaFiltroUI() {
  MA_CATEGORIAS.forEach(function (cat) {
    var btnId = cat ? 'ma-cat-btn-' + cat : 'ma-cat-btn-todas';
    var btn = document.getElementById(btnId);
    if (btn) btn.classList.toggle('active', cat === _maCategoriaActiva);
  });
  var filtro = document.getElementById('ma-categoria-filtro');
  if (filtro) {
    filtro.hidden = _maSubTabActivo === 'cuentas';
  }
}

function switchMaCategoria(cat) {
  _maCategoriaActiva = cat || '';
  _maUpdateCategoriaFiltroUI();
  loadMaData();
}

function switchMaSubTab(tabId) {
  _maSubTabActivo = tabId;
  MA_SUBTABS.forEach(function (id) {
    var panel = document.getElementById('ma-panel-' + id);
    var btn   = document.getElementById('ma-subtab-btn-' + id);
    var active = id === tabId;
    if (panel) { panel.hidden = !active; panel.classList.toggle('active', active); }
    if (btn)   btn.classList.toggle('active', active);
  });
  _maUpdateCategoriaFiltroUI();
  if (tabId === 'cuentas') {
    renderMaCuentas();
  } else {
    renderMaCards();
  }
}

function _maPrecioHtml(m) {
  if (m.precio_promocion && Number(m.precio_promocion) > 0) {
    return '<span class="ma-price-old">' + _fmt(m.precio) + '</span>' +
      '<strong class="ma-price-promo">' + _fmt(m.precio_promocion) + '</strong>';
  }
  return '<strong class="ma-price-promo">' + _fmt(m.precio) + '</strong>';
}

function _maSeguridadHtml(m) {
  var amenazas = Array.isArray(m.escaneo_seguridad) ? m.escaneo_seguridad : [];
  if (!m.requiere_revision_seguridad && !amenazas.length) return '';
  var badge = m.requiere_revision_seguridad
    ? '<span class="adm-badge adm-badge--seg-alerta ma-card-badge ma-card-badge--seg">Revision seguridad</span>'
    : '';
  var items = amenazas.length
    ? '<ul class="ma-seg-list">' + amenazas.map(function (a) {
        var sev = (a && a.severidad) === 'alta' ? 'alta' : 'media';
        return '<li class="ma-seg-item ma-seg-item--' + sev + '">' + _esc((a && a.mensaje) || '') + '</li>';
      }).join('') + '</ul>'
    : '<p class="ma-seg-empty">Sin detalle de escaneo.</p>';
  return badge +
    '<div class="ma-seg-box">' +
      '<p class="ma-seg-title">Escaneo de seguridad</p>' +
      items +
    '</div>';
}

function _maCardHtml(m, modo) {
  var imgUrl = MOTOR_URL + '/api/miniapps/asset/' + encodeURIComponent(m.slug) + '/foto1';
  var tipo = m.tipo_producto === 'html_pdf' ? 'HTML + PDF' : 'HTML';
  var cardClass = 'ma-card' + (modo === 'pendiente' ? ' ma-card--pendiente' : ' ma-card--aprobada');
  var badge = modo === 'aprobada'
    ? '<span class="adm-badge adm-badge--ok ma-card-badge">Aprobada</span>'
    : '<span class="adm-badge adm-badge--bajo ma-card-badge">Pendiente</span>';

  var tags = '<span class="adm-badge ' + _maCategoriaBadgeClass(m.categoria || 'miniapp') + '">' +
    _maCategoriaLabel(m.categoria || 'miniapp') + '</span>';
  tags += ' <span class="adm-badge adm-badge--html">' + tipo + '</span>';
  if (m.usa_ia) tags += ' <span class="adm-badge adm-badge--pagina">Usa IA</span>';
  if (m.disponible_vendedores) {
    tags += ' <span class="adm-badge adm-badge--afiliado">Vendedores ' + Number(m.comision_vendedor || 0) + '%</span>';
  }

  var desc = m.descripcion
    ? '<p class="ma-card-desc">' + _esc(m.descripcion) + '</p>'
    : '';

  var acciones = '';
  acciones += '<button type="button" class="adm-btn adm-btn--outline adm-btn--xs" onclick="maVerHtmlById(\'' + m.id + '\')">Ver mini app (HTML)</button>';
  if (modo === 'pendiente') {
    acciones += ' <button type="button" class="adm-btn adm-btn--outline adm-btn--xs" onclick="maVerFotosById(\'' + m.id + '\')">Ver fotos</button>';
    acciones += ' <button type="button" class="adm-btn adm-btn--primary adm-btn--xs" onclick="maAprobar(\'' + m.id + '\')">Aprobar</button>';
    acciones += ' <button type="button" class="adm-btn adm-btn--danger adm-btn--xs" onclick="maAbrirRechazo(\'' + m.id + '\')">Rechazar</button>';
  }
  if (modo === 'aprobada') {
    var btnGenTxt = m.pagina_venta_slug ? 'Regenerar pagina' : 'Generar pagina de venta';
    acciones += ' <button type="button" class="adm-btn adm-btn--primary adm-btn--xs" id="ma-gen-btn-' + m.id + '" onclick="maGenerarPagina(\'' + m.id + '\')">' + btnGenTxt + '</button>';
  }

  var paginaLinkHtml = '';
  if (modo === 'aprobada' && m.pagina_venta_slug) {
    var pagLink = PUBLIC_BASE_URL + '/p/' + m.pagina_venta_slug;
    paginaLinkHtml =
      '<div class="ma-pagina-link">' +
        '<span class="adm-td-muted" style="font-size:11px">Pagina de venta:</span> ' +
        '<a class="adm-link" href="' + _esc(pagLink) + '" target="_blank">' + _esc(pagLink) + '</a> ' +
        '<button type="button" class="adm-btn adm-btn--sm adm-btn--outline" onclick="pagCopiarLink(\'' + _esc(pagLink) + '\')">Copiar</button>' +
      '</div>';
  }

  return (
    '<article class="' + cardClass + '">' +
      badge +
      _maSeguridadHtml(m) +
      '<div class="ma-card-thumb"><img src="' + imgUrl + '" alt="" loading="lazy" onerror="this.parentElement.classList.add(\'ma-card-thumb--err\')" /></div>' +
      '<div class="ma-card-body">' +
        '<h4 class="ma-card-title">' + _esc(m.nombre) + '</h4>' +
        '<p class="ma-card-slug">' + _esc(m.slug) + '</p>' +
        '<p class="ma-card-creator">' + _esc(m.creador_nombre || '—') + ' · <span class="ma-email">' + _esc(m.creador_email || '') + '</span></p>' +
        '<div class="ma-card-prices">' + _maPrecioHtml(m) + '</div>' +
        '<div class="ma-card-tags">' + tags + '</div>' +
        desc +
        paginaLinkHtml +
        '<div class="ma-card-actions">' + acciones + '</div>' +
      '</div>' +
    '</article>'
  );
}

function renderMaCards() {
  var pendientes = _maCache.filter(function (m) { return (m.estado_aprobacion || 'pendiente') === 'pendiente'; });
  var aprobadas  = _maCache.filter(function (m) { return m.estado_aprobacion === 'aprobada'; });

  var elP = document.getElementById('ma-cards-pendientes');
  var elA = document.getElementById('ma-cards-aprobados');

  if (elP) {
    elP.innerHTML = pendientes.length
      ? pendientes.map(function (m) { return _maCardHtml(m, 'pendiente'); }).join('')
      : '<p class="adm-empty-text">No hay activos digitales pendientes de aprobacion.</p>';
  }
  if (elA) {
    elA.innerHTML = aprobadas.length
      ? aprobadas.map(function (m) { return _maCardHtml(m, 'aprobada'); }).join('')
      : '<p class="adm-empty-text">Aun no hay activos digitales aprobados.</p>';
  }
}

function loadMaData() {
  _setHtml('ma-cards-pendientes', '<p class="adm-empty-text" style="padding:28px">Cargando...</p>');
  _setHtml('ma-cards-aprobados', '');

  _adminFetch(_maFetchUrl())
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.ok) throw new Error(data.error || 'Error del servidor.');
      _maCache = data.miniapps || [];

      renderMaCards();
    })
    .catch(function (e) {
      _setHtml('ma-cards-pendientes',
        '<p class="adm-empty-text" style="color:#c0392b;padding:28px">Error: ' + _esc(e.message) + '</p>');
    });
}

function renderMiniappsAdmin() {
  _maSubTabActivo = 'por-aprobar';
  _maCategoriaActiva = '';
  switchMaSubTab('por-aprobar');
  _maUpdateCategoriaFiltroUI();
  loadMaData();
}

function renderMaCuentas() {
  var wrap = document.getElementById('ma-cuentas-wrap');
  var wrapVend = document.getElementById('ma-comisiones-vendedores-wrap');
  if (!wrap) return;
  wrap.innerHTML = '<p class="adm-empty-text" style="padding:28px">Cargando cuentas...</p>';
  if (wrapVend) wrapVend.innerHTML = '<p class="adm-empty-text" style="padding:28px">Cargando comisiones a vendedores...</p>';

  _adminFetch(MOTOR_URL + '/api/admin/miniapps/cuentas')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.ok) throw new Error(data.error || 'Error del servidor.');
      _maCuentasCache = data.cuentas || [];

      if (!_maCuentasCache.length) {
        wrap.innerHTML = '<p class="adm-empty-text">No hay creadores con mini apps registradas.</p>';
      } else {
        var rows = _maCuentasCache.map(function (c) {
          return '<tr>' +
            '<td class="adm-td-name">' + _esc(c.creador_nombre || '—') + '</td>' +
            '<td class="ma-email">' + _esc(c.creador_email || '') + '</td>' +
            '<td>' + (c.num_ventas || 0) + '</td>' +
            '<td class="adm-td-money">' + _fmt(c.total_generado) + '</td>' +
            '<td class="adm-td-money ma-td-pagar"><strong>' + _fmt(c.total_a_pagar) + '</strong></td>' +
          '</tr>';
        }).join('');

        wrap.innerHTML =
          '<div class="adm-table-wrap">' +
          '<table class="adm-table ma-cuentas-table">' +
          '<thead><tr><th>Creador</th><th>Email</th><th>Ventas</th><th>Total generado</th><th>Total a pagar</th></tr></thead>' +
          '<tbody>' + rows + '</tbody></table></div>';
      }
    })
    .catch(function (e) {
      wrap.innerHTML = '<p class="adm-empty-text" style="color:#c0392b">Error: ' + _esc(e.message) + '</p>';
    });

  if (!wrapVend) return;

  _adminFetch(MOTOR_URL + '/api/admin/miniapps/comisiones-vendedores')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.ok) throw new Error(data.error || 'Error del servidor.');
      var vendedores = data.vendedores || [];

      if (!vendedores.length) {
        wrapVend.innerHTML = '<p class="adm-empty-text">No hay comisiones de vendedores pendientes por mini apps.</p>';
        return;
      }

      var rows = vendedores.map(function (v) {
        return '<tr>' +
          '<td class="adm-td-name">' + _esc(v.nombre || '—') + '</td>' +
          '<td><code class="adm-code">' + _esc(v.codigo || '—') + '</code></td>' +
          '<td>' + (v.num_ventas || 0) + '</td>' +
          '<td class="adm-td-money ma-td-pagar"><strong>' + _fmt(v.total_comision_a_pagar) + '</strong></td>' +
        '</tr>';
      }).join('');

      wrapVend.innerHTML =
        '<div class="ma-comisiones-total adm-stat-card" style="margin-bottom:16px;display:inline-block;padding:14px 20px">' +
          '<div class="adm-stat-label">Total comisiones pendientes</div>' +
          '<div class="adm-stat-value" style="color:#b8973a">' + _fmt(data.total_general || 0) + '</div>' +
        '</div>' +
        '<div class="adm-table-wrap">' +
        '<table class="adm-table ma-cuentas-table">' +
        '<thead><tr><th>Vendedor</th><th>Codigo</th><th>Ventas</th><th>Total a pagar</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
    })
    .catch(function (e) {
      wrapVend.innerHTML = '<p class="adm-empty-text" style="color:#c0392b">Error: ' + _esc(e.message) + '</p>';
    });
}

function _maById(id) {
  return _maCache.filter(function (x) { return x.id === id; })[0];
}

function maVerHtmlById(id) {
  var m = _maById(id);
  if (!m) return;
  maVerHtml(m.slug);
}

function maVerFotosById(id) {
  var m = _maById(id);
  if (!m) return;
  maVerFotos(m.slug, !!m.foto2_key);
}

function maVerHtml(slug) {
  _adminFetch(MOTOR_URL + '/api/admin/miniapps/' + encodeURIComponent(slug) + '/html')
    .then(function (r) {
      if (!r.ok) return r.json().then(function (d) { throw new Error(d.error || 'Error al cargar HTML.'); });
      return r.text();
    })
    .then(function (html) {
      var w = window.open('', '_blank');
      if (!w) { alert('Permite ventanas emergentes para revisar el HTML.'); return; }
      w.document.open();
      w.document.write(html);
      w.document.close();
    })
    .catch(function (e) { alert(e.message || 'Error al abrir HTML.'); });
}

function maVerFotos(slug, tieneFoto2) {
  var url1 = MOTOR_URL + '/api/miniapps/asset/' + encodeURIComponent(slug) + '/foto1';
  var html = '<div class="ma-fotos-modal">' +
    '<div class="ma-foto-block"><p class="ma-foto-label">Foto 1</p><img src="' + url1 + '" alt="Foto 1" class="ma-foto-lg" /></div>';
  if (tieneFoto2) {
    var url2 = MOTOR_URL + '/api/miniapps/asset/' + encodeURIComponent(slug) + '/foto2';
    html += '<div class="ma-foto-block"><p class="ma-foto-label">Foto 2</p><img src="' + url2 + '" alt="Foto 2" class="ma-foto-lg" /></div>';
  }
  html += '</div>';
  admAbrirModal('Fotos — ' + slug, html);
}

function maAprobar(id) {
  var m = _maById(id);
  var nombre = m ? m.nombre : 'esta mini app';
  var extra = '';
  if (m && m.requiere_revision_seguridad) {
    extra = '\n\nATENCION: esta mini app tiene alertas de seguridad. Revisa el escaneo antes de aprobar.';
  }
  if (!confirm('Aprobar la mini app "' + nombre + '"? Podra venderse una vez aprobada.' + extra)) return;
  _adminFetch(MOTOR_URL + '/api/admin/miniapps/aprobar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ miniapp_id: id })
  })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d.ok) throw new Error(d.error || 'Error al aprobar.');
      renderMiniappsAdmin();
    })
    .catch(function (e) { alert(e.message || 'Error al aprobar.'); });
}

function maAbrirRechazo(id) {
  var m = _maById(id);
  var nombre = m ? m.nombre : 'Mini app';
  admAbrirModal('Rechazar mini app',
    '<p class="adm-modal-desc">Indica el motivo del rechazo para "' + _esc(nombre) + '". El creador podra verlo.</p>' +
    '<textarea id="ma-rechazo-motivo" class="adm-form-input ma-rechazo-input" rows="4" placeholder="Ej: El HTML contiene scripts no permitidos..."></textarea>' +
    '<div class="ma-modal-actions">' +
      '<button type="button" class="adm-btn adm-btn--outline" onclick="admCerrarModal()">Cancelar</button>' +
      '<button type="button" class="adm-btn adm-btn--danger" onclick="maConfirmarRechazo(\'' + id + '\')">Confirmar rechazo</button>' +
    '</div>'
  );
}

function maConfirmarRechazo(id) {
  var ta = document.getElementById('ma-rechazo-motivo');
  var motivo = ta ? ta.value.trim() : '';
  if (!motivo) { alert('Escribe un motivo de rechazo.'); return; }

  _adminFetch(MOTOR_URL + '/api/admin/miniapps/rechazar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ miniapp_id: id, motivo: motivo })
  })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d.ok) throw new Error(d.error || 'Error al rechazar.');
      admCerrarModal();
      renderMiniappsAdmin();
    })
    .catch(function (e) { alert(e.message || 'Error al rechazar.'); });
}

function maGenerarPagina(id) {
  var m = _maById(id);
  if (!m) return;
  var btn = document.getElementById('ma-gen-btn-' + id);
  var accion = m.pagina_venta_slug ? 'Regenerar' : 'Generar';
  if (!confirm(accion + ' la pagina de venta para "' + (m.nombre || 'esta mini app') + '"? Puede tardar unos segundos.')) return;

  if (btn) { btn.disabled = true; btn.textContent = 'Generando...'; }

  _adminFetch(MOTOR_URL + '/api/admin/miniapps/generar-pagina', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ miniapp_id: id })
  })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d.ok) throw new Error(d.error || 'Error al generar pagina.');
      if (m) m.pagina_venta_slug = d.pagina_slug;
      renderMaCards();
      switchMaSubTab('aprobados');
      var msg = 'Pagina de venta lista.\n\n' + (d.link || (PUBLIC_BASE_URL + '/p/' + d.pagina_slug));
      if (confirm(msg + '\n\n¿Abrir la pagina ahora?')) {
        window.open(d.link || (PUBLIC_BASE_URL + '/p/' + d.pagina_slug), '_blank');
      }
    })
    .catch(function (e) { alert(e.message || 'Error al generar pagina.'); })
    .finally(function () {
      if (btn) {
        btn.disabled = false;
        btn.textContent = m && m.pagina_venta_slug ? 'Regenerar pagina' : 'Generar pagina de venta';
      }
    });
}

// Close modal on overlay click
document.addEventListener('DOMContentLoaded', function () {
  var overlay = document.getElementById('adm-modal');
  if (overlay) {
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) admCerrarModal();
    });
  }

  // Auth check: mostrar login o panel según sessionStorage
  var token = _getAdminToken();
  if (!token) {
    _adminShowLogin();
    return;
  }
  _adminShowPanel();
  renderInventario();
});
