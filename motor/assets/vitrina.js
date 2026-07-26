(function () {
  'use strict';

  var productos = [];
  var filtroCat = 'all';
  var filtroSub = 'all';
  var busqueda = '';

  var CAT_LABELS = {
    miniapp: 'Mini App',
    infoproducto: 'Infoproducto',
    contenido_digital: 'Contenido Digital'
  };

  var SUB_LABELS = {
    pdf: 'PDF',
    arte: 'Arte',
    prompts: 'Prompts'
  };

  var gridEl   = document.getElementById('vt-grid');
  var statusEl = document.getElementById('vt-status');
  var emptyEl  = document.getElementById('vt-empty');
  var searchEl = document.getElementById('vt-search');
  var filtersEl = document.getElementById('vt-filters');
  var subfiltersEl = document.getElementById('vt-subfilters');

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtUsd(n) {
    return '$' + Number(n).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function precioHtml(p) {
    var promo = p.precio_promocion;
    var precio = Number(p.precio) || 0;
    if (promo != null && promo > 0 && promo < precio) {
      return '<span class="vt-price-old">' + esc(fmtUsd(precio)) + '</span>' +
        '<span class="vt-price-current">' + esc(fmtUsd(promo)) + '</span>';
    }
    return '<span class="vt-price-current">' + esc(fmtUsd(precio)) + '</span>';
  }

  function badgeClass(cat) {
    if (cat === 'infoproducto') return 'vt-badge--infoproducto';
    if (cat === 'contenido_digital') return 'vt-badge--contenido_digital';
    return 'vt-badge--miniapp';
  }

  function subBadgeClass(sub) {
    if (sub === 'arte') return 'vt-badge--sub-arte';
    if (sub === 'prompts') return 'vt-badge--sub-prompts';
    return 'vt-badge--sub-pdf';
  }

  function updateSubfiltersVisibility() {
    if (!subfiltersEl) return;
    var show = filtroCat === 'infoproducto';
    subfiltersEl.hidden = !show;
    if (!show) filtroSub = 'all';
    if (show) {
      subfiltersEl.querySelectorAll('.vt-chip').forEach(function (c) {
        c.classList.toggle('vt-chip--active', (c.getAttribute('data-sub') || 'all') === filtroSub);
      });
    }
  }

  function productosFiltrados() {
    return productos.filter(function (p) {
      if (filtroCat !== 'all' && p.categoria !== filtroCat) return false;
      if (filtroCat === 'infoproducto' && filtroSub !== 'all') {
        var sub = p.subcategoria || 'pdf';
        if (sub !== filtroSub) return false;
      }
      if (busqueda) {
        var q = busqueda.toLowerCase();
        if ((p.nombre || '').toLowerCase().indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function setStatus(msg, isErr) {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.className = 'vt-status' + (isErr ? ' vt-status--err' : '');
    statusEl.hidden = !msg;
  }

  function render() {
    updateSubfiltersVisibility();
    var list = productosFiltrados();

    if (!productos.length) {
      if (gridEl) gridEl.hidden = true;
      if (emptyEl) emptyEl.hidden = false;
      setStatus('');
      return;
    }

    if (!list.length) {
      if (gridEl) {
        gridEl.hidden = true;
        gridEl.innerHTML = '';
      }
      if (emptyEl) emptyEl.hidden = true;
      setStatus('No hay productos que coincidan con tu busqueda o filtro.');
      return;
    }

    setStatus('');
    if (emptyEl) emptyEl.hidden = true;
    if (!gridEl) return;

    gridEl.hidden = false;
    gridEl.innerHTML = list.map(function (p) {
      var cat = p.categoria || 'miniapp';
      var catLabel = CAT_LABELS[cat] || 'Mini App';
      var sub = cat === 'infoproducto' ? (p.subcategoria || 'pdf') : null;
      var subLabel = sub ? (p.subcategoria_label || SUB_LABELS[sub] || sub) : '';
      var thumb = p.foto1_url
        ? '<img src="' + esc(p.foto1_url) + '" alt="' + esc(p.nombre) + '" loading="lazy" onerror="this.parentElement.classList.add(\'vt-card-thumb--empty\');this.remove();" />'
        : '';
      var thumbClass = p.foto1_url ? 'vt-card-thumb' : 'vt-card-thumb vt-card-thumb--empty';
      var desc = p.descripcion_corta
        ? '<p class="vt-card-desc">' + esc(p.descripcion_corta) + '</p>'
        : '';
      var link = p.link_dueno || '#';
      var badges =
        '<span class="vt-badge ' + badgeClass(cat) + '">' + esc(catLabel) + '</span>' +
        (sub
          ? ' <span class="vt-badge ' + subBadgeClass(sub) + '">' + esc(subLabel) + '</span>'
          : '');

      return (
        '<article class="vt-card">' +
          '<div class="' + thumbClass + '">' + thumb + '</div>' +
          '<div class="vt-card-body">' +
            '<div class="vt-card-badges">' + badges + '</div>' +
            '<h2 class="vt-card-name">' + esc(p.nombre) + '</h2>' +
            desc +
            '<div class="vt-card-prices">' + precioHtml(p) + '</div>' +
            '<a href="' + esc(link) + '" class="vt-card-btn premium-btn">Ver / Comprar</a>' +
          '</div>' +
        '</article>'
      );
    }).join('');
  }

  function load() {
    setStatus('Cargando productos...');
    fetch((function () {
      var b = (typeof window.VT_API_BASE === 'string' ? window.VT_API_BASE : '').replace(/\/$/, '');
      return (b || '') + '/api/marketplace';
    })(), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.ok) throw new Error(d.error || 'Error al cargar');
        productos = d.productos || [];
        render();
      })
      .catch(function (e) {
        productos = [];
        if (gridEl) gridEl.hidden = true;
        if (emptyEl) emptyEl.hidden = true;
        setStatus((e && e.message) || 'No se pudieron cargar los productos.', true);
      });
  }

  if (filtersEl) {
    filtersEl.addEventListener('click', function (e) {
      var btn = e.target.closest('.vt-chip');
      if (!btn) return;
      filtroCat = btn.getAttribute('data-cat') || 'all';
      if (filtroCat !== 'infoproducto') filtroSub = 'all';
      filtersEl.querySelectorAll('.vt-chip').forEach(function (c) {
        c.classList.toggle('vt-chip--active', c === btn);
      });
      render();
    });
  }

  if (subfiltersEl) {
    subfiltersEl.addEventListener('click', function (e) {
      var btn = e.target.closest('.vt-chip');
      if (!btn) return;
      filtroSub = btn.getAttribute('data-sub') || 'all';
      subfiltersEl.querySelectorAll('.vt-chip').forEach(function (c) {
        c.classList.toggle('vt-chip--active', c === btn);
      });
      render();
    });
  }

  if (searchEl) {
    var searchTimer;
    searchEl.addEventListener('input', function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        busqueda = (searchEl.value || '').trim();
        render();
      }, 200);
    });
  }

  load();

  document.addEventListener('DOMContentLoaded', function () {
    if (typeof initAllPremiumHeroes === 'function') initAllPremiumHeroes();
  });
})();
