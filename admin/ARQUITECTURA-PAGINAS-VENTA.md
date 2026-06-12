# EcommerceAgent — Arquitectura de Paginas de Venta
## Como se unen las paginas del admin con el embudo interno de pago

---

## 1. VISION GENERAL

```
[Admin crea pagina HTML]
        |
        v
[Pagina de venta publica]  <-- cliente llega con ?ref=codigo_vendedor
        |
        | (ea-checkout.js detecta clic en .btn-comprar-ea)
        v
[checkout-direccion.html?producto=ID&ref=codigo]
        |
        | (cliente llena direccion y confirma)
        v
[Backend crea sesion Stripe Checkout]  // TODO: produccion
        |
        v
[Stripe gateway]  <-- cliente paga
        |
        v
[Webhook Stripe -> Backend registra venta]  // TODO: produccion
        |  (producto, monto, comprador, direccion, ref=vendedor)
        v
[Notificacion al vendedor + al admin]  // TODO: Telegram / Supabase
```

---

## 2. ROL DE CADA PIEZA

### 2.1 Pagina de venta (HTML libre del admin)

- La crea el admin desde el panel (sub-tab "HTML personalizado").
- Puede ser cualquier HTML: landing page, VSL, carta de ventas.
- **Regla unica**: el boton de compra debe tener `class="btn-comprar-ea"`.

```html
<!-- Ejemplo de boton en la pagina del admin -->
<button class="btn-comprar-ea">Comprar ahora — $59</button>

<!-- Tambien acepta atributo alternativo -->
<a href="#" data-comprar>Quiero el mio</a>
```

- La pagina NO maneja ningun pago ni captura datos. Solo vende.
- Al servirse publicamente, el sistema **inyecta** `ea-checkout.js` automaticamente.

---

### 2.2 ea-checkout.js (script inyector)

**Ubicacion**: `admin/ea-checkout.js`  
**Como llega a la pagina**: inyectado automaticamente por el servidor al servir la pagina (ver seccion 4).

**Que hace**:
1. Espera a que el DOM cargue.
2. Busca todos los elementos con `class="btn-comprar-ea"` o atributo `data-comprar`.
3. Lee el parametro `?ref=` de la URL actual (el link con que entro el cliente).
4. Al hacer clic en cualquiera de esos botones, redirige a:

```
/admin/checkout-direccion.html?producto=SLUG_O_ID&ref=CODIGO_VENDEDOR
```

5. El `producto` lo lee del atributo `data-producto` del boton, o del meta tag `<meta name="ea-producto">` de la pagina.

---

### 2.3 checkout-direccion.html (formulario interno)

**Ubicacion**: `admin/checkout-direccion.html`

**Que hace**:
1. Lee `?producto=` y `?ref=` de la URL.
2. Muestra el resumen del pedido (nombre, foto, precio — desde el inventario o desde los params).
3. Captura la direccion de envio completa (USA).
4. Al confirmar, envia los datos al backend:

```js
POST /api/checkout/crear-sesion
{
  producto:   "slug-del-producto",
  ref:        "codigo_vendedor",
  direccion:  { nombre, email, telefono, addr1, addr2, ciudad, estado, zip, pais },
  monto:      5900  // centavos
}
```

5. El backend crea una sesion de Stripe Checkout y devuelve la `sessionUrl`.
6. El frontend redirige al cliente a `sessionUrl` (la pasarela de Stripe).

---

### 2.4 Webhook de Stripe (backend — produccion)

```
POST /api/checkout/webhook  (stripe-signature header)
```

Al recibir evento `checkout.session.completed`:

```js
{
  producto:   "slug",
  monto:      5900,
  comprador:  { nombre, email },
  direccion:  { ... },
  ref:        "codigo_vendedor",
  stripeSessionId: "cs_live_..."
}
```

El backend:
1. Registra la venta en Supabase (`tabla: ventas`).
2. Calcula la utilidad del vendedor (`precio * utilidad% del inventario`).
3. Notifica al vendedor por Telegram: "Venta registrada, $X de ganancia".
4. Notifica al admin por Telegram: "Nueva venta — producto X — vendedor Y — $Z".
5. Actualiza el stock del producto en inventario.

---

## 3. PARAMETROS DE URL — CONVENIO

| Parametro   | Quien lo pone             | Para que sirve                              |
|-------------|---------------------------|---------------------------------------------|
| `?ref=`     | Link del vendedor          | Identificar al vendedor y pagarle utilidad  |
| `?producto=`| ea-checkout.js al redirigir| Saber que producto se esta comprando        |
| `?nombre=`  | Opcional en pagina         | Pre-rellenar nombre del producto en resumen |
| `?precio=`  | Opcional en pagina         | Mostrar precio en resumen del pedido        |
| `?foto=`    | Opcional en pagina         | Mostrar foto en resumen del pedido          |

**Ejemplo de URL completa del cliente:**
```
https://tienda.ecommerceagent.com/p/rizador-nova?ref=jlopez7
```

**Despues del clic en comprar, ea-checkout.js redirige a:**
```
/admin/checkout-direccion.html?producto=rizador-nova&ref=jlopez7
```

---

## 4. INYECCION AUTOMATICA DEL SCRIPT EN PRODUCCION

Cuando el servidor sirve una pagina de venta al publico, debe inyectar
`ea-checkout.js` justo antes del `</body>` del HTML almacenado.

### Codigo de inyeccion (backend — Node.js / Express)

```js
// TODO: implementar en produccion en motor/server.js o en el servidor de paginas

const EA_CHECKOUT_SCRIPT = `<script src="/admin/ea-checkout.js"></script>`;
const EA_CHECKOUT_SNIPPET = `\n<!-- EcommerceAgent checkout injector -->\n${EA_CHECKOUT_SCRIPT}\n`;

/**
 * Inyecta ea-checkout.js en el HTML de una pagina de venta antes de servirla.
 * Llamar desde el endpoint que sirve las paginas publicas.
 *
 * @param {string} htmlOriginal  - HTML tal como lo guardo el admin
 * @returns {string}             - HTML con el script inyectado
 */
function inyectarCheckoutScript(htmlOriginal) {
  if (!htmlOriginal) return htmlOriginal;

  // Si ya tiene el script, no duplicar
  if (htmlOriginal.includes('ea-checkout.js')) return htmlOriginal;

  // Inyectar antes de </body> si existe
  if (htmlOriginal.includes('</body>')) {
    return htmlOriginal.replace('</body>', EA_CHECKOUT_SNIPPET + '</body>');
  }

  // Si no hay </body>, agregar al final
  return htmlOriginal + EA_CHECKOUT_SNIPPET;
}

// Uso en el endpoint de paginas publicas:
// app.get('/p/:slug', (req, res) => {
//   const pagina = obtenerPaginaDeDB(req.params.slug);   // TODO: Supabase
//   if (!pagina) return res.status(404).send('Pagina no encontrada');
//   const htmlFinal = inyectarCheckoutScript(pagina.html);
//   res.send(htmlFinal);
// });
```

### En el panel admin (previsualizacion iframe)

La previsualizacion del admin (`adm-preview-iframe`) ya usa `srcdoc`, por lo que
el script no se inyecta en la preview. Esto es correcto: la inyeccion solo ocurre
al servir la pagina al publico.

Si se quiere probar el flujo completo en local, agregar manualmente al HTML:
```html
<script src="/admin/ea-checkout.js"></script>
```

---

## 5. ATRIBUTO `data-producto` EN EL BOTON

Para que `ea-checkout.js` sepa que producto corresponde a ese boton,
el admin puede agregar `data-producto` directamente:

```html
<button class="btn-comprar-ea" data-producto="rizador-nova">
  Comprar ahora
</button>
```

Si no se pone, el script busca en este orden:
1. `data-producto` del boton clickeado.
2. `<meta name="ea-producto" content="slug">` en el `<head>` de la pagina.
3. El slug de la URL actual (ultimo segmento del path).
4. Cadena vacia (el formulario lo pedira o el admin debera corregir).

---

## 6. ESTRUCTURA DE DATOS — VENTA REGISTRADA

```json
{
  "id":            "venta_abc123",
  "fecha":         "2026-06-12T00:00:00Z",
  "producto":      "rizador-nova",
  "nombreProducto":"Rizador Pinza Ondulador Espiral Nova",
  "precioTotal":   59.00,
  "utilidadPct":   45,
  "utilidadMonto": 26.55,
  "ref":           "jlopez7",
  "comprador": {
    "nombre":  "Maria Gonzalez",
    "email":   "maria@email.com",
    "telefono":"555-123-4567"
  },
  "direccion": {
    "addr1":   "123 Main St",
    "addr2":   "Apt 2B",
    "ciudad":  "Miami",
    "estado":  "FL",
    "zip":     "33101",
    "pais":    "US"
  },
  "stripeSessionId": "cs_live_...",
  "estado":    "pagado"
}
```

---

## 7. RESUMEN DE ARCHIVOS INVOLUCRADOS

| Archivo                               | Rol                                                      |
|---------------------------------------|----------------------------------------------------------|
| `admin/index.html`                    | Panel admin — crear/gestionar paginas de venta           |
| `admin/assets/js/admin.js`            | Logica del panel — guarda HTML en localStorage/Supabase  |
| `admin/ea-checkout.js`                | Script inyector — conecta .btn-comprar-ea con el embudo  |
| `admin/checkout-direccion.html`       | Formulario de direccion — captura datos antes del pago   |
| `motor/server.js`                     | Backend — crea sesion Stripe, recibe webhook, registra venta |
| `motor/ventas-config.json`            | Config del agente de ventas (Telegram tokens, catalogo)  |

---

## 8. TODO — PRODUCCION

- [ ] Endpoint `GET /p/:slug` que sirve la pagina e inyecta `ea-checkout.js`
- [ ] Endpoint `POST /api/checkout/crear-sesion` (Stripe Checkout Session)
- [ ] Endpoint `POST /api/checkout/webhook` (Stripe webhook)
- [ ] Migracion de `localStorage` a Supabase para inventario, paginas, usuarios
- [ ] Sistema de links con dominio propio: `tienda.dominio.com/p/slug?ref=codigo`
- [ ] Dashboard de ventas en tiempo real (admin ve todas; vendedor ve las suyas)
- [ ] Calculo y registro automatico de utilidades por vendedor
- [ ] Notificaciones Telegram al vendedor y admin en cada venta confirmada
- [ ] Logica de cooldown para pagos (15 dias) usando fechas de Supabase
