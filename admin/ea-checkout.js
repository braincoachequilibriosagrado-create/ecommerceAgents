/**
 * ea-checkout.js — EcommerceAgent Checkout Injector
 *
 * Este script se inyecta automaticamente en cada pagina de venta publica
 * (antes de </body>) cuando el servidor la sirve al cliente.
 *
 * Responsabilidad unica: detectar el boton de compra (.btn-comprar-ea o
 * [data-comprar]) y, al hacer clic, redirigir al formulario interno de
 * direccion de envio con los parametros correctos.
 *
 * La pagina de venta (HTML del admin) NO maneja ningun pago.
 * Este script conecta la pagina con el embudo interno de EcommerceAgent.
 *
 * TODO (produccion):
 *   - El servidor inyecta este script en cada pagina antes de servirla.
 *   - La URL base de checkout se configura como variable de entorno.
 *   - Se conecta con Stripe via POST /api/checkout/crear-sesion.
 *
 * Ver: admin/ARQUITECTURA-PAGINAS-VENTA.md para el flujo completo.
 */

(function () {
  'use strict';

  /* ── CONFIGURACION ────────────────────────────────────────────────── */

  // TODO (produccion): cambiar por la URL del dominio de produccion
  var CHECKOUT_BASE_URL = '/admin/checkout-direccion.html';

  // Selectores que identifican un boton de compra de EcommerceAgent
  var SELECTOR_COMPRAR = '.btn-comprar-ea, [data-comprar]';

  /* ── UTILIDADES ───────────────────────────────────────────────────── */

  /**
   * Lee un parametro de la query string de la URL actual.
   * @param {string} nombre
   * @returns {string} valor del parametro, o cadena vacia si no existe
   */
  function leerParam(nombre) {
    try {
      var params = new URLSearchParams(window.location.search);
      return params.get(nombre) || '';
    } catch (e) {
      // Fallback para navegadores muy viejos
      var match = window.location.search.match(
        new RegExp('[?&]' + nombre + '=([^&]*)')
      );
      return match ? decodeURIComponent(match[1].replace(/\+/g, ' ')) : '';
  }
  }

  /**
   * Determina el slug/id del producto en este orden de prioridad:
   *   1. Atributo data-producto del boton clickeado.
   *   2. Meta tag <meta name="ea-producto" content="slug">.
   *   3. Ultimo segmento del pathname de la URL actual.
   *   4. Parametro ?producto= de la URL actual.
   *
   * @param {HTMLElement} boton - el elemento que fue clickeado
   * @returns {string}
   */
  function resolverProducto(boton) {
    // 1. data-producto en el boton
    if (boton && boton.dataset && boton.dataset.producto) {
      return boton.dataset.producto.trim();
    }

    // 2. <meta name="ea-producto">
    var meta = document.querySelector('meta[name="ea-producto"]');
    if (meta && meta.getAttribute('content')) {
      return meta.getAttribute('content').trim();
    }

    // 3. Ultimo segmento del path (p.ej. /p/rizador-nova -> rizador-nova)
    var segments = window.location.pathname.replace(/\/$/, '').split('/');
    var lastSegment = segments[segments.length - 1];
    if (lastSegment && lastSegment !== 'index.html' && lastSegment !== '') {
      return lastSegment;
    }

    // 4. ?producto= en la URL
    var productoParam = leerParam('producto');
    if (productoParam) return productoParam;

    return '';
  }

  /* ── LOGICA PRINCIPAL ─────────────────────────────────────────────── */

  /**
   * Vincula los botones de compra al embudo interno.
   * Se llama cuando el DOM esta listo.
   */
  function inicializar() {
    var botones = document.querySelectorAll(SELECTOR_COMPRAR);

    if (botones.length === 0) {
      // No hay botones de compra en esta pagina; nada que hacer.
      return;
    }

    // El ?ref= llego en la URL con que el cliente abrio la pagina de venta
    var refVendedor = leerParam('ref');

    botones.forEach(function (boton) {
      // Evitar registrar el listener mas de una vez si el script se carga dos veces
      if (boton.dataset.eaInyectado) return;
      boton.dataset.eaInyectado = '1';

      boton.addEventListener('click', function (e) {
        e.preventDefault();

        var producto = resolverProducto(boton);

        // Construir URL del formulario de direccion
        var params = new URLSearchParams();
        if (producto)    params.set('producto', producto);
        if (refVendedor) params.set('ref', refVendedor);

        var urlCheckout = CHECKOUT_BASE_URL + '?' + params.toString();

        // TODO (produccion): antes de redirigir, se puede guardar el estado
        // del carrito en sessionStorage para que checkout-direccion.html lo lea
        // sin depender solo de los params de URL.
        // sessionStorage.setItem('ea_carrito', JSON.stringify({ producto, ref: refVendedor }));

        window.location.href = urlCheckout;
      });
    });

    console.log(
      '[ea-checkout] ' + botones.length + ' boton(es) de compra vinculado(s).' +
      (refVendedor ? ' Vendedor: ' + refVendedor : ' (venta directa)')
    );
  }

  /* ── INICIALIZACION ───────────────────────────────────────────────── */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializar);
  } else {
    // DOM ya disponible (script cargado defer/async o al final del body)
    inicializar();
  }

})();

/*
 * ── GUIA DE USO ──────────────────────────────────────────────────────
 *
 * A. PARA EL ADMIN (al crear la pagina HTML):
 *    El boton de compra DEBE tener class="btn-comprar-ea":
 *
 *      <button class="btn-comprar-ea">Comprar ahora</button>
 *
 *    Opcionalmente, especificar el producto directamente en el boton:
 *
 *      <button class="btn-comprar-ea" data-producto="rizador-nova">
 *        Comprar ahora — $59
 *      </button>
 *
 *    O declararlo una sola vez en el <head> de la pagina:
 *
 *      <meta name="ea-producto" content="rizador-nova">
 *
 * B. PARA EL VENDEDOR (al compartir su link):
 *    El vendedor comparte su link con ?ref=su_codigo:
 *
 *      https://tienda.ejemplo.com/p/rizador-nova?ref=jlopez7
 *
 *    ea-checkout.js lee ese ?ref= automaticamente y lo pasa al formulario.
 *
 * C. INYECCION EN EL SERVIDOR (produccion — motor/server.js):
 *
 *    const EA_SNIPPET = '\n<script src="/admin/ea-checkout.js"><\/script>\n';
 *
 *    function inyectar(html) {
 *      if (!html) return html;
 *      if (html.includes('ea-checkout.js')) return html;   // ya inyectado
 *      if (html.includes('</body>'))
 *        return html.replace('</body>', EA_SNIPPET + '</body>');
 *      return html + EA_SNIPPET;
 *    }
 *
 *    app.get('/p/:slug', (req, res) => {
 *      const pagina = await obtenerPaginaDeDB(req.params.slug);  // Supabase
 *      if (!pagina) return res.status(404).send('No encontrada');
 *      res.send(inyectar(pagina.html));
 *    });
 *
 * ────────────────────────────────────────────────────────────────────
 */
