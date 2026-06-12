/* ============================================================
   EcommerceAgent — Panel de Administrador
   admin/assets/js/admin.js
   ============================================================ */

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

// -- VENTAS GLOBALES --
// TODO: cargar datos reales desde Supabase tabla `ventas`
var DEMO_VENTAS_GLOBAL = [];

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

var ADMIN_TABS = ['inventario', 'catalogo', 'paginas', 'usuarios', 'cuentas', 'pedidos'];

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
}

/* ============================================================
   1. INVENTARIO
   ============================================================ */

var INV_KEY        = 'admin_inventario';
var INV_TOTAL_ROWS = 50;
var _invFormOpen   = false;
// TODO: en produccion las imagenes van a Cloudflare R2 / Supabase Storage, no a localStorage en base64
var _invImagenes   = []; // Array de hasta 5 data URLs (base64) para el formulario activo
var INV_MAX_IMGS   = 5;

function _invCargar() {
  try { return JSON.parse(localStorage.getItem(INV_KEY) || '[]'); } catch (e) { return []; }
}

function _invGuardar(arr) {
  // TODO: cargar datos reales desde Supabase/backend — sincronizar con tabla `productos`
  localStorage.setItem(INV_KEY, JSON.stringify(arr));
}

function _invEstado(stock) {
  if (stock === 0)   return 'Agotado';
  if (stock <= 15)   return 'Bajo';
  return 'Disponible';
}

function _invNextId(arr) {
  if (!arr.length) return 1;
  return Math.max.apply(null, arr.map(function (p) { return p.id; })) + 1;
}

function invToggleForm() {
  _invFormOpen = !_invFormOpen;
  var wrap = document.getElementById('inv-form-wrap');
  var txt  = document.getElementById('inv-form-toggle-txt');
  if (wrap) wrap.hidden = !_invFormOpen;
  if (txt)  txt.textContent = _invFormOpen ? 'Ocultar formulario' : 'Agregar producto';
  if (_invFormOpen) {
    _invImagenes = [];
    invRenderImagenesGrid();
  }
}

// ── Multi-image upload (up to 5) ──────────────────────────────────────

function invAgregarImagenes(input) {
  if (!input || !input.files || !input.files.length) return;
  var remaining = INV_MAX_IMGS - _invImagenes.length;
  if (remaining <= 0) {
    alert('Maximo ' + INV_MAX_IMGS + ' imagenes por producto.');
    input.value = '';
    return;
  }
  var files = Array.prototype.slice.call(input.files, 0, remaining);
  if (input.files.length > remaining) {
    alert('Solo se agregaron ' + remaining + ' imagen' + (remaining > 1 ? 'es' : '') + '. Maximo ' + INV_MAX_IMGS + ' por producto.');
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
  input.value = ''; // reset so same file can be re-selected
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
      '<span class="adm-img-add-icon">+</span>' +
      '<span class="adm-img-add-txt">Agregar</span>' +
    '</label>';
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
  var ganancia = (isNaN(precio) || isNaN(utilidad)) ? 0 : precio * (utilidad / 100);
  var el = document.getElementById('inv-ganancia-preview');
  if (el) el.textContent = 'Ganancia por venta: ' + _fmt(ganancia);
}

function invActualizarGanancia(id) {
  var precioEl   = document.getElementById('inv-precio-'   + id);
  var utilEl     = document.getElementById('inv-utilidad-' + id);
  var gananciaEl = document.getElementById('inv-ganancia-' + id);
  if (!precioEl || !utilEl || !gananciaEl) return;
  var precio   = parseFloat(precioEl.value)   || 0;
  var utilidad = parseFloat(utilEl.value)     || 0;
  gananciaEl.textContent = _fmt(precio * utilidad / 100);
}

function invGuardarProducto() {
  var elNombre    = document.getElementById('inv-f-nombre');
  var elCategoria = document.getElementById('inv-f-categoria');
  var elPrecio    = document.getElementById('inv-f-precio');
  var elUtilidad  = document.getElementById('inv-f-utilidad');
  var elStock     = document.getElementById('inv-f-stock');
  var errEl       = document.getElementById('inv-form-error');

  var nombre    = elNombre    ? elNombre.value.trim()    : '';
  var categoria = elCategoria ? elCategoria.value.trim() : 'General';
  var precio    = parseFloat(elPrecio   ? elPrecio.value   || '0' : '0');
  var utilidad  = parseFloat(elUtilidad ? elUtilidad.value || '0' : '0');
  var stock     = parseInt(elStock      ? elStock.value    || '0' : '0', 10);

  if (!nombre) {
    if (errEl) { errEl.textContent = 'El nombre del producto es obligatorio.'; errEl.hidden = false; }
    return;
  }
  if (_invImagenes.length === 0) {
    if (errEl) { errEl.textContent = 'Agrega al menos 1 imagen del producto.'; errEl.hidden = false; }
    return;
  }
  if (errEl) errEl.hidden = true;

  var arr = _invCargar();
  arr.push({
    id:        _invNextId(arr),
    nombre:    nombre,
    // TODO: en produccion imagenes[] son URLs de Cloudflare R2 / Supabase Storage
    // TODO: estas 5 imagenes se sincronizan con el catalogo de usuarios (Mis Productos)
    //       para que cada vendedor pueda descargar cualquiera y usarla en su contenido
    imagenes:  _invImagenes.slice(),
    categoria: categoria || 'General',
    precio:    isNaN(precio)   ? 0 : precio,
    utilidad:  isNaN(utilidad) ? 0 : utilidad,
    stock:     isNaN(stock)    ? 0 : stock,
    visible:   true,
    pausado:   false
  });
  _invGuardar(arr);

  // Reset form
  if (elNombre)    elNombre.value    = '';
  if (elPrecio)    elPrecio.value    = '';
  if (elUtilidad)  elUtilidad.value  = '';
  if (elStock)     elStock.value     = '';
  if (elCategoria) elCategoria.selectedIndex = 0;
  var fi = document.getElementById('inv-f-imagenes');
  if (fi) fi.value = '';
  _invImagenes = [];
  invRenderImagenesGrid();
  var gp = document.getElementById('inv-ganancia-preview');
  if (gp) gp.textContent = 'Ganancia por venta: $0.00';
  invToggleForm();
  renderInventario();
  // TODO: en produccion sincronizar producto con Supabase tabla `productos`
}

function invPausarProducto(id) {
  var arr = _invCargar();
  for (var i = 0; i < arr.length; i++) {
    if (arr[i].id === id) { arr[i].pausado = !arr[i].pausado; break; }
  }
  _invGuardar(arr);
  renderInventario();
  // TODO: cargar datos reales desde Supabase/backend — sincronizar visibilidad con catalogo de usuario
}

function invEliminarProducto(id) {
  if (!confirm('Eliminar este producto del inventario? Esta accion no se puede deshacer.')) return;
  var arr = _invCargar().filter(function (p) { return p.id !== id; });
  _invGuardar(arr);
  renderInventario();
  // TODO: cargar datos reales desde Supabase tabla `productos`
}

function invGuardarCambios() {
  var arr = _invCargar();
  arr.forEach(function (p) {
    var inpStock    = document.getElementById('inv-stock-'    + p.id);
    var inpPrecio   = document.getElementById('inv-precio-'   + p.id);
    var inpUtilidad = document.getElementById('inv-utilidad-' + p.id);
    if (inpStock) {
      var v = parseInt(inpStock.value, 10);
      if (!isNaN(v) && v >= 0) p.stock = v;
    }
    if (inpPrecio) {
      var vp = parseFloat(inpPrecio.value);
      if (!isNaN(vp) && vp >= 0) p.precio = vp;
    }
    if (inpUtilidad) {
      var vu = parseFloat(inpUtilidad.value);
      if (!isNaN(vu) && vu >= 0) p.utilidad = vu;
    }
  });
  _invGuardar(arr);
  renderInventario();
  var ok = document.getElementById('inv-save-ok');
  if (ok) { ok.hidden = false; setTimeout(function () { ok.hidden = true; }, 3000); }
  // TODO: cargar datos reales desde Supabase tabla `productos`
}

function renderInventario() {
  var arr = _invCargar();
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

  var rows = '';
  for (var i = 0; i < INV_TOTAL_ROWS; i++) {
    var p = arr[i] || null;
    if (p) {
      var estado = _invEstado(p.stock);
      // backward compat: support old `foto` field and new `imagenes[]`
      var imgs  = (p.imagenes && p.imagenes.length) ? p.imagenes : (p.foto ? [p.foto] : []);
      var thumb = imgs.length > 0
        ? '<div class="adm-prod-thumb-wrap">' +
            '<img src="' + _esc(imgs[0]) + '" class="adm-prod-thumb" alt="">' +
            (imgs.length > 1
              ? '<span class="adm-prod-img-count">1/' + imgs.length + '</span>'
              : '') +
          '</div>'
        : '<span class="adm-prod-no-img"></span>';
      var pausaTxt = p.pausado ? 'Reanudar' : 'Pausar';
      var precio   = p.precio   || 0;
      var utilidad = p.utilidad || 0;
      var ganancia = precio * (utilidad / 100);
      rows +=
        '<tr' + (p.pausado ? ' class="adm-row--pausado"' : '') + '>' +
          '<td><div class="adm-prod-cell">' + thumb +
            '<span class="adm-td-strong">' + _esc(p.nombre) + '</span>' +
            (p.pausado ? '<span class="adm-badge adm-badge--inactivo adm-badge--xs">Pausado</span>' : '') +
          '</div></td>' +
          '<td class="adm-td-muted">' + _esc(p.categoria) + '</td>' +
          '<td><input type="number" class="adm-stock-input" id="inv-precio-' + p.id + '" value="' + precio + '" min="0" step="0.01" style="width:90px" oninput="invActualizarGanancia(' + p.id + ')"></td>' +
          '<td><input type="number" class="adm-stock-input" id="inv-utilidad-' + p.id + '" value="' + utilidad + '" min="0" max="100" step="1" style="width:70px" oninput="invActualizarGanancia(' + p.id + ')"><span class="adm-td-muted" style="font-size:11px;margin-left:3px">%</span></td>' +
          '<td id="inv-ganancia-' + p.id + '" class="adm-ganancia-cell">' + _fmt(ganancia) + '</td>' +
          '<td><input type="number" class="adm-stock-input" id="inv-stock-' + p.id + '" value="' + p.stock + '" min="0"></td>' +
          '<td>' + _badgeStock(estado) + '</td>' +
          '<td><div class="adm-action-cell">' +
            '<button type="button" class="adm-btn adm-btn--sm adm-btn--outline" onclick="invPausarProducto(' + p.id + ')">' + pausaTxt + '</button>' +
            '<button type="button" class="adm-btn adm-btn--sm adm-btn--danger"   onclick="invEliminarProducto(' + p.id + ')">Eliminar</button>' +
          '</div></td>' +
        '</tr>';
    } else {
      rows += '<tr class="adm-row--empty"><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>';
    }
  }

  _setHtml('inv-table-wrap',
    '<table class="adm-table">' +
    '<thead><tr>' +
      '<th>Producto</th><th>Categoria</th><th>Precio ($)</th><th>Utilidad (%)</th>' +
      '<th>Ganancia ($)</th><th>Stock actual</th><th>Estado</th><th>Acciones</th>' +
    '</tr></thead>' +
    '<tbody>' + rows + '</tbody></table>'
  );
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
      '<td class="adm-td-muted">' + _esc(p.categoria || '—') + '</td>' +
      cells +
      '<td class="adm-bar-cell">' +
        '<div class="adm-bar-wrap"><div class="adm-bar" style="width:' + pct + '%"></div></div>' +
        '<span class="adm-bar-pct">' + pct + '%</span>' +
      '</td>' +
    '</tr>';
  }).join('');
}

function renderCatalogo() {
  // TODO: cargar datos reales desde Supabase/backend
  var inv = _invCargar();

  // ── Ranking mas vendidos ─────────────────────────────────
  // TODO: cargar datos reales desde Supabase tabla `ventas`
  var ventasMap = {};
  DEMO_VENTAS_GLOBAL.forEach(function (v) {
    var k = v.producto || ''; if (!k) return;
    if (!ventasMap[k]) ventasMap[k] = { nombre: k, categoria: '', unidades: 0, ingresos: 0 };
    ventasMap[k].unidades++;
    ventasMap[k].ingresos += (v.monto || 0);
  });
  inv.forEach(function (p) { if (ventasMap[p.nombre]) ventasMap[p.nombre].categoria = p.categoria || ''; });
  var statsVentas = Object.keys(ventasMap).map(function (k) { return ventasMap[k]; });
  statsVentas.sort(function (a, b) { return b.unidades - a.unidades; });

  // ── Ranking mas vistos ───────────────────────────────────
  // TODO: cargar datos reales desde Supabase (contador de vistas en tabla `paginas_venta`)
  var vistasMap = {};
  DEMO_PAGINAS_VENTA.forEach(function (pg) {
    var k = pg.producto || ''; if (!k) return;
    if (!vistasMap[k]) vistasMap[k] = { nombre: k, categoria: '', vistas: 0, conversiones: 0 };
    vistasMap[k].vistas      += (pg.visitas      || 0);
    vistasMap[k].conversiones += (pg.conversiones || 0);
  });
  inv.forEach(function (p) { if (vistasMap[p.nombre]) vistasMap[p.nombre].categoria = p.categoria || ''; });
  var statsVistas = Object.keys(vistasMap).map(function (k) { return vistasMap[k]; });
  statsVistas.sort(function (a, b) { return b.vistas - a.vistas; });

  // ── Cards resumen ────────────────────────────────────────
  var totalUnidades = statsVentas.reduce(function (s, p) { return s + p.unidades; }, 0);
  var totalIngresos = statsVentas.reduce(function (s, p) { return s + p.ingresos; }, 0);
  var totalVistas   = statsVistas.reduce(function (s, p) { return s + p.vistas;   }, 0);
  var topVenta  = statsVentas[0] || null;
  var topVistas = statsVistas[0] || null;

  _setHtml('cat-summary-row',
    _statCard(totalUnidades, 'Unidades vendidas') +
    _statCard(_fmt(totalIngresos), 'Ingresos totales') +
    _statCard(totalVistas.toLocaleString(), 'Total vistas') +
    _statCard(topVenta ? _esc(topVenta.nombre) : '—', 'Producto top ventas')
  );

  // ── Tabla mas vendidos ───────────────────────────────────
  var emptyMsg = '<p class="adm-empty" style="padding:36px 0;">Aun no hay datos suficientes.</p>';
  if (!statsVentas.length) {
    _setHtml('cat-ranking-ventas', emptyMsg);
  } else {
    var maxV = statsVentas[0].unidades || 1;
    var rowsV = _catRankRows(statsVentas, maxV, [
      { key: 'unidades', fmt: function (v) { return '<strong>' + v + '</strong>'; } },
      { key: 'ingresos', fmt: _fmt }
    ]);
    _setHtml('cat-ranking-ventas',
      '<table class="adm-table">' +
      '<thead><tr><th>#</th><th>Producto</th><th>Categoria</th><th>Unidades</th><th>Ingresos</th><th>Proporcion</th></tr></thead>' +
      '<tbody>' + rowsV + '</tbody></table>'
    );
  }

  // ── Tabla mas vistos ─────────────────────────────────────
  if (!statsVistas.length) {
    _setHtml('cat-ranking-vistas', emptyMsg);
  } else {
    var maxVi = statsVistas[0].vistas || 1;
    var rowsVi = statsVistas.map(function (p, i) {
      var pct     = Math.max(2, Math.round((p.vistas / maxVi) * 100));
      var convPct = p.vistas > 0 ? ((p.conversiones / p.vistas) * 100).toFixed(1) + '%' : '—';
      var convCls = p.vistas > 0 && (p.conversiones / p.vistas) >= 0.05 ? 'adm-conv--ok' : 'adm-conv--low';
      var rankCls = i === 0 ? 'adm-rank adm-rank--gold'
        : i === 1 ? 'adm-rank adm-rank--silver'
        : i === 2 ? 'adm-rank adm-rank--bronze'
        : 'adm-rank';
      return '<tr>' +
        '<td><span class="' + rankCls + '">' + (i + 1) + '</span></td>' +
        '<td class="adm-td-strong">' + _esc(p.nombre) + '</td>' +
        '<td class="adm-td-muted">' + _esc(p.categoria || '—') + '</td>' +
        '<td><strong>' + p.vistas.toLocaleString() + '</strong></td>' +
        '<td><span class="' + convCls + '">' + convPct + '</span></td>' +
        '<td class="adm-bar-cell">' +
          '<div class="adm-bar-wrap"><div class="adm-bar adm-bar--blue" style="width:' + pct + '%"></div></div>' +
          '<span class="adm-bar-pct">' + pct + '%</span>' +
        '</td>' +
      '</tr>';
    }).join('');
    _setHtml('cat-ranking-vistas',
      '<table class="adm-table">' +
      '<thead><tr><th>#</th><th>Producto</th><th>Categoria</th><th>Vistas</th><th>Conversion</th><th>Proporcion</th></tr></thead>' +
      '<tbody>' + rowsVi + '</tbody></table>'
    );
  }

  // ── Insights cruzados ────────────────────────────────────
  var insightsEl = document.getElementById('cat-insights-section');
  if (!statsVentas.length && !statsVistas.length) {
    _setHtml('cat-insights-body', emptyMsg);
    if (insightsEl) insightsEl.hidden = false;
    return;
  }

  // Cruzar: para cada producto con vistas, calcular conversion real vs ventas reales
  var cruzMap = {};
  statsVistas.forEach(function (p) { cruzMap[p.nombre] = { nombre: p.nombre, vistas: p.vistas, ventas: 0 }; });
  statsVentas.forEach(function (p) { if (cruzMap[p.nombre]) cruzMap[p.nombre].ventas = p.unidades; });

  var oportunidades = [];
  var campeones     = [];
  Object.keys(cruzMap).forEach(function (k) {
    var p = cruzMap[k];
    if (p.vistas < 10) return; // no hay suficiente trafico aun
    var conv = p.ventas / p.vistas;
    if (conv < 0.02)  oportunidades.push(p);  // < 2% conversion
    if (conv >= 0.05) campeones.push(p);       // >= 5% conversion
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
      }).join('') +
      '</ul></div>';
  }

  if (oportunidades.length) {
    html += '<div class="adm-insight adm-insight--warn">' +
      '<div class="adm-insight-title">Oportunidad de mejora</div>' +
      '<p class="adm-insight-desc">Muchas vistas pero poca conversion (menos del 2%). Revisar precio o pagina de venta.</p>' +
      '<ul class="adm-insight-list">' +
      oportunidades.map(function (p) {
        return '<li><strong>' + _esc(p.nombre) + '</strong> — ' +
          p.vistas + ' vistas, ' + p.ventas + ' ventas (' +
          ((p.ventas / p.vistas) * 100).toFixed(1) + '% conv.)</li>';
      }).join('') +
      '</ul></div>';
  }

  if (!html) {
    html = '<p class="adm-empty" style="padding:20px 0;">Aun no hay suficiente trafico cruzado para mostrar insights.</p>';
  }

  _setHtml('cat-insights-body', html);
  if (insightsEl) insightsEl.hidden = false;
}

/* ============================================================
   3. PAGINAS DE VENTA
   ============================================================ */

var PAG_KEY = 'admin_paginas_venta';

function _pagCargar() {
  try { return JSON.parse(localStorage.getItem(PAG_KEY) || '[]'); } catch (e) { return []; }
}

function _pagGuardar(arr) {
  // TODO: en produccion guardar en Supabase tabla `paginas_venta`
  localStorage.setItem(PAG_KEY, JSON.stringify(arr));
}

function _pagSlug(nombre) {
  return nombre.toLowerCase()
    .replace(/[áàâä]/g, 'a').replace(/[éèêë]/g, 'e')
    .replace(/[íìîï]/g, 'i').replace(/[óòôö]/g, 'o')
    .replace(/[úùûü]/g, 'u').replace(/ñ/g, 'n')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function _pagNextId(arr) {
  if (!arr.length) return 1;
  return Math.max.apply(null, arr.map(function (p) { return p.id; })) + 1;
}

function pagSwitchSubTab(tabId) {
  ['crear', 'activas'].forEach(function (id) {
    var panel = document.getElementById('pag-subpanel-' + id);
    var btn   = document.getElementById('pag-subtab-btn-' + id);
    var active = id === tabId;
    if (panel) panel.hidden = !active;
    if (btn)   btn.classList.toggle('active', active);
  });
  if (tabId === 'activas') renderPagActivas();
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
    '    .beneficios li::before { content: "✓ "; color: #b8973a; font-weight: 700; }',
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
  var elNombre = document.getElementById('pag-html-nombre');
  var elCode   = document.getElementById('pag-html-code');
  var errEl    = document.getElementById('pag-html-error');
  var nombre   = elNombre ? elNombre.value.trim() : '';
  var html     = elCode   ? elCode.value.trim()   : '';

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

  var arr  = _pagCargar();
  var slug = _pagSlug(nombre);
  var base = slug; var n = 1;
  while (arr.some(function (p) { return p.slug === slug; })) { slug = base + '-' + (n++); }

  arr.push({
    id:           _pagNextId(arr),
    slug:         slug,
    nombre:       nombre,
    html:         html,
    link:         '',
    fechaCreacion: new Date().toISOString().slice(0, 10),
    activa:       true,
    vistas:       0
  });
  _pagGuardar(arr);

  DEMO_PAGINAS_VENTA = arr.map(function (p) {
    return { producto: p.nombre, visitas: p.vistas || 0, conversiones: 0 };
  });

  if (elNombre) elNombre.value = '';
  if (elCode)   elCode.value   = '';
  var pv = document.getElementById('pag-preview-wrap');
  if (pv) pv.hidden = true;

  renderPaginas();
  pagSwitchSubTab('activas');
  // TODO: en produccion servir el HTML en GET /p/:slug con inyeccion automatica de ea-checkout.js
}

function pagVerHtml(id) {
  var arr  = _pagCargar();
  var page = null;
  for (var i = 0; i < arr.length; i++) { if (arr[i].id === id) { page = arr[i]; break; } }
  if (!page || !page.html) return;
  var win = window.open('', '_blank');
  if (win) { win.document.write(page.html); win.document.close(); }
}

function pagToggleEstado(id) {
  var arr = _pagCargar();
  for (var i = 0; i < arr.length; i++) {
    if (arr[i].id === id) { arr[i].activa = !arr[i].activa; break; }
  }
  _pagGuardar(arr);
  renderPaginas();
  renderPagActivas();
  // TODO: cargar datos reales desde Supabase/backend — actualizar visibilidad de la pagina
}

function pagEliminar(id) {
  if (!confirm('Eliminar esta pagina de venta? Esta accion no se puede deshacer.')) return;
  var arr = _pagCargar().filter(function (p) { return p.id !== id; });
  _pagGuardar(arr);
  renderPaginas();
  renderPagActivas();
  // TODO: cargar datos reales desde Supabase/backend
}

function pagCopiarLink(link) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(link);
  } else {
    var ta = document.createElement('textarea');
    ta.value = link; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
  }
}

function renderPagActivas() {
  var arr    = _pagCargar();
  var wrapEl = document.getElementById('pag-activas-wrap');
  if (!wrapEl) return;

  if (!arr.length) {
    wrapEl.innerHTML = '<p class="adm-empty" style="padding:40px 0;">Aun no has creado paginas de venta. Crea una en la pestana "Crear pagina".</p>';
    return;
  }

  var cards = arr.map(function (p) {
    var fullLink  = 'https://ecommerceagent.com/p/' + p.slug;
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
            '<span class="adm-td-muted" style="font-size:11px">' + _fmtFecha(p.fechaCreacion) + '</span>' +
          '</div>' +
          '<div class="adm-pag-card-link">' +
            '<a class="adm-link" href="' + _esc(fullLink) + '" target="_blank">' + _esc(fullLink) + '</a>' +
            '<button type="button" class="adm-btn adm-btn--sm adm-btn--outline" onclick="pagCopiarLink(\'' + _esc(fullLink) + '\')">Copiar</button>' +
          '</div>' +
        '</div>' +
        '<div class="adm-pag-card-actions">' +
          '<button type="button" class="adm-btn adm-btn--sm adm-btn--outline" onclick="pagVerHtml(' + p.id + ')">Ver HTML</button>' +
          '<button type="button" class="adm-btn adm-btn--sm adm-btn--outline" onclick="pagToggleEstado(' + p.id + ')">' + toggleTxt + '</button>' +
          '<button type="button" class="adm-btn adm-btn--sm adm-btn--danger" onclick="pagEliminar(' + p.id + ')">Eliminar</button>' +
        '</div>' +
      '</div>'
    );
  }).join('');

  wrapEl.innerHTML = '<div class="adm-pag-list">' + cards + '</div>';
}

function renderPaginas() {
  var arr = _pagCargar();
  DEMO_PAGINAS_VENTA = arr.map(function (p) {
    return { producto: p.nombre, visitas: p.vistas || 0, conversiones: 0 };
  });

  var activas     = arr.filter(function (p) { return p.activa; }).length;
  var totalVistas = arr.reduce(function (s, p) { return s + (p.vistas || 0); }, 0);

  _setHtml('pag-summary-row',
    _statCard(arr.length, 'Total paginas') +
    _statCard(activas, 'Activas') +
    _statCard(totalVistas.toLocaleString(), 'Vistas totales') +
    _statCard(arr.length - activas, 'Pausadas')
  );

  var activasPanel = document.getElementById('pag-subpanel-activas');
  if (activasPanel && !activasPanel.hidden) renderPagActivas();
  // TODO: cargar datos reales desde Supabase/backend
}

/* ============================================================
   4. USUARIOS
   ============================================================ */

var USR_KEY = 'admin_usuarios';

function _usrCargar() {
  try { return JSON.parse(localStorage.getItem(USR_KEY) || '[]'); } catch (e) { return []; }
}

function _usrGuardar(arr) {
  // TODO: cargar datos reales desde Supabase/backend
  localStorage.setItem(USR_KEY, JSON.stringify(arr));
}

function _usrRandLetra()  { return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)]; }
function _usrRandDigito() { return '0123456789'[Math.floor(Math.random() * 10)]; }
function _usrRandChar() {
  var pool = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-#@!';
  return pool[Math.floor(Math.random() * pool.length)];
}

function _usrGenNombreUnico(usados) {
  var n;
  do {
    n = _usrRandLetra() + _usrRandLetra() + _usrRandLetra() + _usrRandLetra() +
        _usrRandDigito() + _usrRandDigito() + _usrRandDigito();
  } while (usados[n]);
  usados[n] = true;
  return n;
}

function _usrGenCodigoUnico(usados) {
  var c;
  do {
    c = '';
    for (var i = 0; i < 7; i++) c += _usrRandChar();
  } while (usados[c]);
  usados[c] = true;
  return c;
}

function _usrInit() {
  var existing = _usrCargar();
  if (existing.length >= 100) return existing;
  // Genera 100 usuarios una sola vez y los persiste
  var usadosN = {};
  var usadosC = {};
  var arr = [];
  for (var i = 1; i <= 100; i++) {
    arr.push({
      n:       i,
      usuario: _usrGenNombreUnico(usadosN),
      codigo:  _usrGenCodigoUnico(usadosC),
      activo:  false
    });
  }
  _usrGuardar(arr);
  return arr;
}

function usrToggle(n) {
  var arr = _usrCargar();
  for (var i = 0; i < arr.length; i++) {
    if (arr[i].n === n) { arr[i].activo = !arr[i].activo; break; }
  }
  _usrGuardar(arr);
  renderUsuarios();
  // TODO: cargar datos reales desde Supabase/backend — activar/desactivar acceso al app
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

function renderUsuarios() {
  var arr          = _usrInit();
  var activos      = arr.filter(function (u) { return u.activo; }).length;
  var desactivados = arr.length - activos;

  _setHtml('usr-summary-row',
    _statCard(arr.length, 'Total usuarios') +
    _statCard('<span style="color:#2E7D50">' + activos + '</span>', 'Activos') +
    _statCard(desactivados, 'Desactivados')
  );

  var rows = arr.map(function (u) {
    var estadoCls = u.activo ? 'adm-badge--ok'      : 'adm-badge--inactivo';
    var estadoTxt = u.activo ? 'Activo'             : 'Desactivado';
    var toggleTxt = u.activo ? 'Desactivar'         : 'Activar';
    var toggleCls = u.activo ? 'adm-btn--danger'    : 'adm-btn--success';
    return '<tr>' +
      '<td class="adm-td-muted adm-td-n">' + u.n + '</td>' +
      '<td><div class="adm-usr-cell">' +
        '<span class="adm-usr-name">' + _esc(u.usuario) + '</span>' +
        '<button type="button" class="adm-copy-mini" onclick="usrCopiar(\'' + _esc(u.usuario) + '\')">Copiar</button>' +
      '</div></td>' +
      '<td><div class="adm-usr-cell">' +
        '<span class="adm-usr-code">' + _esc(u.codigo) + '</span>' +
        '<button type="button" class="adm-copy-mini" onclick="usrCopiar(\'' + _esc(u.codigo) + '\')">Copiar</button>' +
      '</div></td>' +
      '<td><span class="adm-badge ' + estadoCls + '">' + estadoTxt + '</span></td>' +
      '<td><button type="button" class="adm-btn adm-btn--sm ' + toggleCls + '" onclick="usrToggle(' + u.n + ')">' + toggleTxt + '</button></td>' +
    '</tr>';
  }).join('');

  _setHtml('usr-table-wrap',
    '<table class="adm-table">' +
    '<thead><tr>' +
      '<th class="adm-th-n">N</th>' +
      '<th>Usuario</th>' +
      '<th>Codigo de seguridad</th>' +
      '<th>Estado</th>' +
      '<th>Accion</th>' +
    '</tr></thead>' +
    '<tbody>' + rows + '</tbody></table>'
  );

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

// TODO: en produccion estas ventas vienen de Supabase tabla `ventas`
//       con join a `usuarios` (para nombre/codigo) y a `inventario` (para precio, utilidad%)
var CUENTAS_VENTAS_KEY = 'admin_ventas_global';

function _cventasCargar() {
  try { return JSON.parse(localStorage.getItem(CUENTAS_VENTAS_KEY) || '[]'); } catch (e) { return []; }
}

function _badgeVentaEstado(estado) {
  var map = {
    'Pendiente':  'adm-badge--bajo',
    'Procesando': 'adm-badge--proceso',
    'Enviado':    'adm-badge--enviado',
    'Entregado':  'adm-badge--ok',
    'Cancelado':  'adm-badge--agotado',
    'Pagado':     'adm-badge--pagado'
  };
  return '<span class="adm-badge ' + (map[estado] || 'adm-badge--bajo') + '">' + _esc(estado) + '</span>';
}

function _startOfMonth() {
  var d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function renderUtilidadVentas() {
  var ventas = _cventasCargar();

  // Summary calculations
  var totalVentas     = ventas.reduce(function (s, v) { return s + (v.monto || 0); }, 0);
  var totalUtilidad   = ventas.reduce(function (s, v) { return s + (v.utilidad || 0); }, 0);
  var som             = _startOfMonth();
  var ventasMes       = ventas.filter(function (v) { return v.fecha && new Date(v.fecha) >= som; });
  var ventasMesMonto  = ventasMes.reduce(function (s, v) { return s + (v.monto || 0); }, 0);
  var utilidadMes     = ventasMes.reduce(function (s, v) { return s + (v.utilidad || 0); }, 0);

  _setHtml('cuentas-util-summary',
    _statCard(_fmt(totalVentas),   'Ventas totales') +
    _statCard('<span style="color:var(--adm-green)">' + _fmt(totalUtilidad) + '</span>', 'Utilidad generada') +
    _statCard(_fmt(ventasMesMonto), 'Ventas del mes') +
    _statCard('<span style="color:var(--adm-green)">' + _fmt(utilidadMes) + '</span>', 'Utilidad del mes')
  );

  if (!ventas.length) {
    _setHtml('cuentas-ventas-wrap', '<p class="adm-empty-text">Aun no hay ventas registradas.</p>');
    return;
  }

  var sorted = ventas.slice().sort(function (a, b) {
    return new Date(b.fecha || 0) - new Date(a.fecha || 0);
  });

  var rows = sorted.map(function (v) {
    return '<tr>' +
      '<td class="adm-td-usr">' +
        '<div class="adm-usr-name">' + _esc(v.usuario || '—') + '</div>' +
        '<div class="adm-usr-code">' + _esc(v.codigo  || '') + '</div>' +
      '</td>' +
      '<td class="adm-td-strong">' + _esc(v.producto || '—') + '</td>' +
      '<td class="adm-td-muted">' + _fmtFecha(v.fecha) + '</td>' +
      '<td>' + _fmt(v.monto || 0) + '</td>' +
      '<td style="color:var(--adm-green);font-weight:600">' + _fmt(v.utilidad || 0) + '</td>' +
      '<td>' + _badgeVentaEstado(v.estado || 'Pendiente') + '</td>' +
    '</tr>';
  }).join('');

  _setHtml('cuentas-ventas-wrap',
    '<div class="adm-table-wrap">' +
    '<table class="adm-table">' +
    '<thead><tr>' +
      '<th>Usuario</th>' +
      '<th>Producto</th>' +
      '<th>Fecha</th>' +
      '<th>Monto venta</th>' +
      '<th>Utilidad</th>' +
      '<th>Estado</th>' +
    '</tr></thead>' +
    '<tbody>' + rows + '</tbody>' +
    '</table></div>'
  );
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
   6. PEDIDOS
   ============================================================ */

// Misma key que escribe checkout-direccion.html para que el flujo sea end-to-end
var PEDIDOS_KEY = 'ea_pedidos';

// TODO: en produccion los pedidos llegan via webhook de Stripe (checkout.session.completed)
//       y se guardan en Supabase tabla `pedidos`. _pedidosCargar() consultaria Supabase.

function _pedidosCargar() {
  try { return JSON.parse(localStorage.getItem(PEDIDOS_KEY) || '[]'); } catch (e) { return []; }
}
function _pedidosGuardar(arr) {
  try { localStorage.setItem(PEDIDOS_KEY, JSON.stringify(arr)); } catch (e) {}
}

function _pedidoNextNum(arr) {
  if (!arr.length) return 1;
  return Math.max.apply(null, arr.map(function (p) { return p.nPedido || 0; })) + 1;
}

function _badgePedido(estado) {
  var map = {
    'Pendiente':  'adm-badge--bajo',
    'Procesado':  'adm-badge--pagado',
    'Cancelado':  'adm-badge--agotado'
  };
  return '<span class="adm-badge ' + (map[estado] || 'adm-badge--bajo') + '">' + _esc(estado) + '</span>';
}

function _fmtDireccion(d) {
  if (!d) return '—';
  var partes = [d.addr1, d.addr2, d.ciudad, d.estado, d.zip].filter(Boolean);
  return partes.join(', ') || '—';
}

var _pedFiltroActivo = 'todos';

function pedFiltrar(valor) {
  _pedFiltroActivo = valor;
  // update pill active state
  var pills = document.querySelectorAll('.ped-filtro-btn');
  pills.forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-filtro') === valor);
  });
  renderPedidosTabla(_pedidosCargar());
}

function renderPedidos() {
  _pedFiltroActivo = 'todos';
  // reset filter pills
  var pills = document.querySelectorAll('.ped-filtro-btn');
  pills.forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-filtro') === 'todos');
  });

  var arr = _pedidosCargar();

  var pendientes = arr.filter(function (p) { return p.estado === 'Pendiente'; }).length;
  var procesados = arr.filter(function (p) { return p.estado === 'Procesado'; }).length;

  _setHtml('ped-summary-row',
    _statCard('<span style="color:#b8973a">' + pendientes + '</span>', 'Pedidos pendientes') +
    _statCard('<span style="color:#2E7D32">' + procesados + '</span>', 'Procesados') +
    _statCard(arr.length, 'Total de pedidos')
  );

  renderPedidosTabla(arr);
}

function renderPedidosTabla(arr) {
  var filtro = _pedFiltroActivo;
  var filtered = filtro === 'todos' ? arr : arr.filter(function (p) { return p.estado === filtro; });

  if (!arr.length) {
    _setHtml('ped-tabla-wrap', '<p class="adm-empty-text">No hay pedidos aun. Cuando un cliente complete una compra, el pedido aparecera aqui.</p>');
    return;
  }
  if (!filtered.length) {
    var label = filtro === 'Pendiente' ? 'pedidos pendientes' : 'pedidos procesados';
    _setHtml('ped-tabla-wrap', '<p class="adm-empty-text">No hay ' + label + ' en este momento.</p>');
    return;
  }

  var sorted = filtered.slice().sort(function (a, b) {
    return new Date(b.fecha || 0) - new Date(a.fecha || 0);
  });

  var rows = sorted.map(function (p) {
    var esPendiente = p.estado !== 'Procesado';
    var accion = esPendiente
      ? '<button type="button" class="adm-btn adm-btn--sm adm-btn--pagar" onclick="pedidoMarcarProcesado(\'' + p.id + '\')">Marcar procesado</button>'
      : '<span class="ped-fecha-despacho">' + _fmtFecha(p.fechaProcesado) + '</span>';

    return '<tr id="ped-row-' + p.id + '">' +
      '<td class="adm-td-strong adm-td-mono">#' + String(p.nPedido || '?').padStart(5, '0') + '</td>' +
      '<td class="adm-td-strong">' + _esc(p.producto || '—') + '</td>' +
      '<td class="adm-td-usr">' +
        '<div class="adm-usr-name">' + _esc((p.cliente && p.cliente.nombre) || '—') + '</div>' +
        '<div class="adm-usr-code">' + _esc((p.cliente && p.cliente.email) || '') + '</div>' +
      '</td>' +
      '<td class="adm-td-muted adm-td-dir">' + _esc(_fmtDireccion(p.direccion)) + '</td>' +
      '<td class="adm-td-muted">' + _esc((p.cliente && p.cliente.telefono) || '—') + '</td>' +
      '<td class="adm-td-usr">' +
        '<div class="adm-usr-name">' + _esc(p.vendedor || 'directo') + '</div>' +
        '<div class="adm-usr-code">' + _esc(p.refVendedor || '') + '</div>' +
      '</td>' +
      '<td class="adm-td-strong">' + _fmt(p.monto || 0) + '</td>' +
      '<td class="adm-td-muted">' + _fmtFecha(p.fecha) + '</td>' +
      '<td>' + _badgePedido(p.estado || 'Pendiente') + '</td>' +
      '<td style="white-space:nowrap">' + accion + '</td>' +
    '</tr>';
  }).join('');

  _setHtml('ped-tabla-wrap',
    '<div class="adm-table-wrap">' +
    '<table class="adm-table">' +
    '<thead><tr>' +
      '<th>N</th>' +
      '<th>Producto</th>' +
      '<th>Cliente</th>' +
      '<th>Direccion de envio</th>' +
      '<th>Telefono</th>' +
      '<th>Vendedor</th>' +
      '<th>Monto</th>' +
      '<th>Fecha</th>' +
      '<th>Estado</th>' +
      '<th>Accion</th>' +
    '</tr></thead>' +
    '<tbody>' + rows + '</tbody>' +
    '</table></div>'
  );
}

function pedidoMarcarProcesado(id) {
  var arr = _pedidosCargar();
  var idx = arr.findIndex(function (p) { return String(p.id) === String(id); });
  if (idx === -1) return;

  arr[idx].estado         = 'Procesado';
  arr[idx].fechaProcesado = new Date().toISOString();
  _pedidosGuardar(arr);

  // TODO: en produccion — notificar al cliente (email/SMS) y al vendedor (Telegram) que el pedido fue despachado
  //       y actualizar el estado en Supabase tabla `pedidos`

  renderPedidos();
}

// Funcion utilitaria para que checkout-direccion.html (o el webhook de Stripe) cree pedidos:
// llamar pedidoRegistrar(datos) donde datos = { producto, cliente, direccion, vendedor, refVendedor, monto }
function pedidoRegistrar(datos) {
  var arr  = _pedidosCargar();
  var ahora = new Date().toISOString();
  arr.push({
    id:            'ped_' + Date.now(),
    nPedido:       _pedidoNextNum(arr),
    producto:      datos.producto      || '',
    cliente:       datos.cliente       || { nombre: '', telefono: '' },
    direccion:     datos.direccion     || {},
    vendedor:      datos.vendedor      || '',
    refVendedor:   datos.refVendedor   || '',
    monto:         datos.monto         || 0,
    fecha:         datos.fecha         || ahora,
    estado:        'Pendiente',
    fechaProcesado: null
  });
  _pedidosGuardar(arr);
  // TODO: en produccion este registro viene del webhook de Stripe, no de localStorage
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

// Close modal on overlay click
document.addEventListener('DOMContentLoaded', function () {
  var overlay = document.getElementById('adm-modal');
  if (overlay) {
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) admCerrarModal();
    });
  }
  // Init first tab
  renderInventario();
});
