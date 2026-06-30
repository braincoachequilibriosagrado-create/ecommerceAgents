window.productoData = {
  nombre: '',
  precio: '',
  desc: '',
  categoria: '',
  idioma: 'Español',
  mercado: 'USA Hispano'
};

window.productoARIASeleccionado = null;
const ariaChatSecHistory = [];

function actualizarProductoData() {
  const nombre = document.getElementById(
    'contenido-producto')?.value || '';
  const precio = document.getElementById(
    'contenido-precio')?.value || '';
  const desc = document.getElementById(
    'contenido-desc')?.value || '';

  window.productoData.nombre = nombre;
  window.productoData.precio = precio;
  window.productoData.desc = desc;
  window.productoData.categoria =
    window.categoriaSeleccionada || '';

  const el = document.getElementById(
    'estrategia-producto-nombre');
  if (el) el.innerText = nombre ||
    'No seleccionado';
}

function sincronizarDesdeEstrategia() {
  const nombre = document.getElementById(
    'estrategia-nombre')?.value || '';
  const precio = document.getElementById(
    'estrategia-precio')?.value || '';
  const desc = document.getElementById(
    'estrategia-desc')?.value || '';
  const mercado = document.getElementById(
    'estrategia-mercado')?.value || 'USA Hispano';
  const idioma = document.getElementById(
    'estrategia-idioma')?.value || 'Español';

  window.productoData.nombre = nombre;
  window.productoData.precio = precio;
  window.productoData.desc = desc;
  window.productoData.mercado = mercado;
  window.productoData.idioma = idioma;

  const c = document.getElementById(
    'contenido-producto');
  const cp = document.getElementById(
    'contenido-precio');
  const cd = document.getElementById(
    'contenido-desc');
  if (c && c.value !== nombre) c.value = nombre;
  if (cp && cp.value !== precio) cp.value = precio;
  if (cd && cd.value !== desc) cd.value = desc;
}

function cargarDatosEnEstrategia() {
  const d = window.productoData;
  const n = document.getElementById(
    'estrategia-nombre');
  const p = document.getElementById(
    'estrategia-precio');
  const de = document.getElementById(
    'estrategia-desc');
  const m = document.getElementById(
    'estrategia-mercado');
  const i = document.getElementById(
    'estrategia-idioma');
  if (n) n.value = d.nombre || '';
  if (p) p.value = d.precio || '';
  if (de) de.value = d.desc || '';
  if (m) m.value = d.mercado || 'USA Hispano';
  if (i) i.value = d.idioma || 'Español';
}

// ══════════════════════════════════════════════════════
// AGENTE IA — Gemini / Groq (sustituye las keys por las tuyas)
// ══════════════════════════════════════════════════════

// Dirección del motor backend. Cambiar aquí para apuntar a otro entorno.
// TODO: cuando el dominio esté listo, cambiar por: https://motor.ecommerceagents.store
const MOTOR_URL    = 'https://motor.ecommerceagents.store';
const MOTOR_IA_URL = MOTOR_URL; // alias para compatibilidad con llamadas de IA

function getProductData() {
  return {
    name: document.getElementById('ai-product-name').value,
    desc: document.getElementById('ai-product-desc').value,
    price: document.getElementById('ai-product-price').value
  };
}

// Selección de botones de opciones
document.addEventListener('click', function(e) {
  if (e.target.classList.contains('aria-opt-btn')) {
    const group = e.target.closest('.aria-btn-group');
    if (group) {
      group.querySelectorAll('.aria-opt-btn')
        .forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
    }
  }
});

const ariaChatHistory = [];

function sendTemplate(idea) {
  const input = document.getElementById(
    'aria-chat-input');
  if (input) {
    const p = getProductData();
    const hooks = [];
    if (document.getElementById('hook-cod')?.checked)
      hooks.push('PAGO CONTRA ENTREGA');
    if (document.getElementById('hook-ship')?.checked)
      hooks.push('ENVÍO GRATIS');
    if (document.getElementById('hook-offer')?.checked)
      hooks.push('OFERTA RELÁMPAGO');
    if (document.getElementById('hook-limited')?.checked)
      hooks.push('STOCK LIMITADO');

    const tieneProducto =
      window.productImageBase64 ? true : false;

    const mensaje = idea +
      ' Producto: ' + (p.name || '') +
      '. Precio: $' + (p.price || '0') + ' USD.' +
      (hooks.length > 0
        ? ' Textos visibles en imagen: ' +
          hooks.join(', ') + '.'
        : ' Solo mostrar el precio.') +
      (tieneProducto
        ? ' Usa los colores y características ' +
          'exactas del producto de la foto.'
        : '');

    input.value = mensaje;
    sendAriaChat();
  }
}

async function sendAriaChat() {
  const input = document.getElementById('aria-chat-input');
  const messages = document.getElementById('aria-chat-messages');
  const userText = input.value.trim();
  if (!userText || !messages) return;

  const p = getProductData();

  const userMsg = document.createElement('div');
  userMsg.className = 'aria-chat-msg aria-chat-user';
  userMsg.textContent = userText;
  messages.appendChild(userMsg);
  input.value = '';
  messages.scrollTop = messages.scrollHeight;

  const loadMsg = document.createElement('div');
  loadMsg.className = 'aria-chat-msg aria-chat-bot';
  loadMsg.textContent = 'Pensando...';
  messages.appendChild(loadMsg);
  messages.scrollTop = messages.scrollHeight;

  if (ariaChatHistory.length === 0 &&
      window.productImageBase64) {
    ariaChatHistory.push({
      role: 'user',
      parts: [
        {
          inline_data: {
            mime_type: window.productImageType ||
              'image/jpeg',
            data: window.productImageBase64
          }
        },
        { text: userText }
      ]
    });
  } else {
    ariaChatHistory.push({
      role: 'user',
      parts: [{ text: userText }]
    });
  }

  const parts = [];

  if (window.productImageBase64) {
    parts.push({
      inline_data: {
        mime_type: window.productImageType ||
          'image/jpeg',
        data: window.productImageBase64
      }
    });
  }

  parts.push({ text: userText });

  ariaChatHistory[ariaChatHistory.length - 1] = {
    role: 'user',
    parts: parts
  };

  const systemContext =
    'Eres ARIA, directora creativa de ' +
    'publicidad para Facebook Ads. ' +
    'Estás ayudando a crear el prompt ' +
    'perfecto para Imagen 4.0. ' +
    'Producto: ' + (p.name || 'no especificado') + '. ' +
    'Precio: $' + (p.price || '0') + ' USD. ' +
    'Conversa naturalmente en español. ' +
    'Cuando tengas suficiente información ' +
    'genera el prompt final en inglés ' +
    'y di exactamente: ' +
    'PROMPT LISTO: [el prompt aquí]. ' +
    'El prompt debe ser de 4 líneas ' +
    'describiendo: persona/producto, ' +
    'ambiente, iluminación, textos overlay. ' +
    'IMPORTANTE: Cuando generes el PROMPT LISTO ' +
    'debes entregarlo COMPLETO en un solo mensaje. ' +
    'Nunca lo cortes ni digas que lo vas a dar después. ' +
    'El prompt debe ir completo después de PROMPT LISTO: ' +
    'REGLA CRÍTICA SOBRE EL PRODUCTO: ' +
    'Cuando generes el PROMPT LISTO debes ' +
    'describir la FORMA y ESTRUCTURA del ' +
    'producto exactamente como se ve en la foto. ' +
    'La forma, tamaño, componentes y partes ' +
    'del producto deben ser idénticos. ' +
    'El color puede variar para hacerlo más ' +
    'atractivo publicitariamente. ' +
    'Ejemplo: si el producto tiene forma cónica ' +
    'con mango cilíndrico, eso debe aparecer ' +
    'exactamente igual en el prompt. ' +
    'Nunca cambies la forma, solo puedes ' +
    'mejorar colores para hacerlo más llamativo.';

  try {
    const response = await fetch(MOTOR_IA_URL + '/api/ia/gemini-vision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-usuario-id': _getUsuarioId() || '' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemContext }] },
        contents: ariaChatHistory,
        generationConfig: { maxOutputTokens: 1000, temperature: 0.9 }
      })
    });

    const data = await response.json();
    if (!data.ok) {
      loadMsg.textContent =
        'Error: ' + (data.error || 'Intenta de nuevo');
      ariaChatHistory.pop();
      return;
    }

    const reply = data.texto || 'Error, intenta de nuevo';

    loadMsg.textContent = reply;

    ariaChatHistory.push({
      role: 'model',
      parts: [{ text: reply }]
    });

    messages.scrollTop = messages.scrollHeight;

    if (reply.includes('PROMPT LISTO:')) {
      const raw = reply.split('PROMPT LISTO:')[1];
      const promptText = raw ? raw.trim() : '';
      window.ariaFinalPrompt = promptText;
      const styleEl = document.getElementById('ai-image-style');
      if (styleEl) styleEl.value = promptText;
      const btnUse = document.getElementById('btn-use-prompt');
      if (btnUse) btnUse.style.display = 'block';
    }
  } catch (err) {
    loadMsg.textContent = 'Error, intenta de nuevo';
    console.error(err);
    ariaChatHistory.pop();
  }
}

function usePromptForImage() {
  const hidden = document.getElementById('ai-image-style');
  const prompt = (
    window.ariaFinalPrompt ||
    (hidden && hidden.value) ||
    ''
  ).trim();
  if (!prompt) {
    alert(
      'Aún no hay un prompt listo. Conversa con ARIA hasta ver PROMPT LISTO.'
    );
    return;
  }
  if (hidden) hidden.value = prompt;
  generateProductImage();
}

function handleAiImageDrop(event) {
  event.preventDefault();
  event.stopPropagation();
  const area = document.getElementById('ai-image-drop-area');
  if (area) area.classList.remove('ai-image-drop-area--drag');
  const input = document.getElementById('ai-product-image-input');
  const file = event.dataTransfer && event.dataTransfer.files[0];
  if (!input || !file || file.type.indexOf('image/') !== 0) return;
  try {
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
  } catch (e) {
    return;
  }
  previewProductImage();
}

function previewProductImage() {
  const input = document.getElementById('ai-product-image-input');
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    window.productImageBase64 = e.target.result.split(',')[1];
    window.productImageType = file.type;

    const area = document.getElementById('ai-image-drop-area');
    area.innerHTML =
      '<div style="position:relative">' +
      '<img src="' +
      e.target.result +
      '" alt="" ' +
      'style="width:100%;border-radius:4px;max-height:160px;object-fit:cover;">' +
      '<button type="button" onclick="event.stopPropagation();clearProductImage();" ' +
      'style="position:absolute;top:6px;right:6px;' +
      'background:rgba(0,0,0,0.6);color:white;' +
      'border:none;border-radius:50%;' +
      'width:24px;height:24px;cursor:pointer;' +
      'font-size:12px;line-height:1;">✕</button></div>';
  };
  reader.readAsDataURL(file);
}

function clearProductImage() {
  window.productImageBase64 = null;
  window.productImageType = null;
  document.getElementById('ai-product-image-input').value = '';
  document.getElementById('ai-image-drop-area').innerHTML =
    '<span class="ai-image-drop-icon" aria-hidden="true">📷</span>' +
    '<p class="ai-image-drop-line">Arrastra tu foto aquí</p>' +
    '<p class="ai-image-drop-sub">o haz clic para seleccionar</p>';
}

async function analyzeProduct() {
  if (!window.productImageBase64) {
    alert('Primero sube una foto del producto');
    return;
  }

  const btn = document.getElementById(
    'btn-analyze-product');
  if (btn) btn.textContent = 'Analizando...';

  try {
    const response = await fetch(MOTOR_IA_URL + '/api/ia/gemini-vision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-usuario-id': _getUsuarioId() || '' },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              inline_data: {
                mime_type: window.productImageType,
                data: window.productImageBase64
              }
            },
            {
              text: 'Analiza esta imagen del producto ' +
              'y descríbelo con el máximo detalle posible. ' +
              'Incluye OBLIGATORIAMENTE:\n' +
              '1. Forma general del producto\n' +
              '2. Cada componente y su forma exacta\n' +
              '3. Cómo están conectados los componentes\n' +
              '4. Proporciones (qué parte es más grande)\n' +
              '5. Texturas y materiales visibles\n' +
              '6. Colores exactos de cada parte\n' +
              'Sé extremadamente detallado como si ' +
              'le describieras el producto a alguien ' +
              'que nunca lo ha visto y debe dibujarlo ' +
              'exactamente igual.'
            }
          ]
        }],
        generationConfig: { maxOutputTokens: 400 }
      })
    });

    const data = await response.json();
    const description = data.texto;

    if (description) {
      window.productDescription = description;

      const messages = document.getElementById(
        'aria-chat-messages');
      const input = document.getElementById(
        'aria-chat-input');

      const botMsg = document.createElement('div');
      botMsg.className = 'aria-chat-msg aria-chat-bot';
      botMsg.textContent = '📦 Producto analizado: '
        + description;
      if (messages) {
        messages.appendChild(botMsg);
        messages.scrollTop = messages.scrollHeight;
      }

      if (btn) {
        btn.textContent = '✅ Producto analizado';
        btn.style.borderColor = '#C9A84C';
        btn.style.color = '#C9A84C';
      }

      // Enviar automáticamente al chat
      if (input) {
        input.value =
          'Genera desde cero una imagen ' +
          'publicitaria nueva de este producto. ' +
          'Usa la descripción que acabas de dar. ' +
          'No estoy pidiendo editar ninguna foto. ' +
          'Crea una imagen nueva con la misma ' +
          'forma y estructura del producto en ' +
          'un ambiente atractivo para Facebook.';
        sendAriaChat();
      }
    }
  } catch(err) {
    if (btn) btn.textContent =
      '🔍 Analizar producto para mejor prompt';
    alert('Error: ' + err.message);
  }
}

async function tryGenerateImage(prompt) {
  try {
    const response = await fetch(MOTOR_IA_URL + '/api/ia/gemini-imagen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-usuario-id': _getUsuarioId() || '' },
      body: JSON.stringify({ prompt })
    });
    const data = await response.json();
    if (data.ok && data.imagen) return data.imagen;
    return null;
  } catch (e) {
    return null;
  }
}

async function generateProductImage() {
  const p = getProductData();
  if (!p.name) {
    alert('Ingresa el nombre del producto');
    return;
  }

  const style = document.querySelector(
    '#aria-style-group .aria-opt-btn.active')
    ?.dataset.value || 'Lujo y Dorado';
  const comp = document.querySelector(
    '#aria-comp-group .aria-opt-btn.active')
    ?.dataset.value || 'Producto Centro';
  const hooks = [];
  if (document.getElementById('hook-cod')?.checked)
    hooks.push('PAGO CONTRA ENTREGA');
  if (document.getElementById('hook-ship')?.checked)
    hooks.push('ENVÍO GRATIS');
  if (document.getElementById('hook-offer')?.checked)
    hooks.push('OFERTA RELÁMPAGO');
  if (document.getElementById('hook-limited')?.checked)
    hooks.push('STOCK LIMITADO');
  const lang = document.querySelector(
    '#aria-lang-group .aria-opt-btn.active')
    ?.dataset.value || 'Spanish';
  const extra = document.getElementById(
    'ai-image-style')?.value.trim() || '';
  const withPerson = comp.toLowerCase()
    .includes('model') ||
    comp.toLowerCase().includes('modelo');

  let prompt = '';

  const usePromptFromBuilder =
    extra.length >= 60 &&
    extra !== 'Generando prompt...' &&
    !/^Generando\s/i.test(extra);

  if (usePromptFromBuilder) {
    prompt = extra;
  } else {
    if (withPerson) {
      prompt =
        'Crea un anuncio publicitario profesional ' +
        'para Facebook. Una mujer atractiva ' +
        'usando ' + p.name + '. ' +
        'El producto se ve claramente en sus manos. ' +
        'En la imagen aparece el texto "$' +
        p.price + ' USD" en letras grandes y ' +
        'llamativas. ';
    } else {
      prompt =
        'Crea un anuncio publicitario profesional ' +
        'para Facebook. El producto principal es: ' +
        p.name + '. ' +
        'El producto se ve en primer plano, ' +
        'bien iluminado y atractivo. ' +
        'En la imagen aparece el texto "$' +
        p.price + ' USD" en letras grandes. ';
    }

    if (hooks.length > 0) {
      prompt += 'También aparece visible en la imagen: ' +
        hooks.join(', ') + '. ';
    }

    if (style.includes('Lujo') ||
        style.includes('Luxury')) {
      prompt += 'Estilo lujoso, fondo oscuro elegante, ' +
        'detalles dorados. ';
    } else if (style.includes('Tech')) {
      prompt += 'Estilo tecnológico moderno, ' +
        'colores vibrantes, fondo futurista. ';
    } else if (style.includes('Natural')) {
      prompt += 'Estilo natural y fresco, ' +
        'colores claros y suaves. ';
    } else {
      prompt += 'Estilo llamativo y colorido, ' +
        'muy visual para redes sociales. ';
    }

    if (lang === 'English') {
      prompt += 'All text in English. ';
    } else {
      prompt += 'Todos los textos en español. ';
    }

    if (extra) prompt += extra + '. ';

    prompt += 'Imagen de alta calidad, ' +
      'fotografía comercial profesional, ' +
      'iluminación cinematográfica.';
  }

  showAiLoading('image', 'Generando imagen...');
  const imgSrc = await tryGenerateImage(prompt);

  if (imgSrc) {
    showAiResult('image',
      '<img src="' + imgSrc + '" '
      + 'id="aria-result-img" '
      + 'style="width:100%;border-radius:4px;">'
      + '<button type="button" '
      + 'class="btn-download-img" '
      + 'id="btn-download-aria">'
      + '⬇ Descargar imagen</button>'
    );
  } else {
    showAiResult('image',
      '<p style="color:#B85450;padding:16px;">'
      + 'Los servidores de Google están saturados. '
      + 'Intenta en 1 minuto.</p>'
    );
  }
}

async function generateCopy() {
  const p = getProductData();
  if (!p.name) {
    alert('Ingresa el nombre del producto');
    return;
  }

  showAiLoading('copy', 'Escribiendo copy...');

  const systemPrompt = 'Eres un experto en marketing de Facebook Ads para el mercado hispano en Estados Unidos.';
  const userPrompt = `Crea el copy completo para un anuncio de Facebook del siguiente producto:

Producto: ${p.name}
Descripción: ${p.desc}
Precio: $${p.price} USD

El copy debe incluir:
1. HOOK (primera línea que para el scroll, máximo 10 palabras, en español)
2. CUERPO (2-3 párrafos cortos que expliquen el beneficio principal, genera urgencia)
3. CTA (llamado a acción claro y directo)
4. HASHTAGS (5 hashtags relevantes)

Escribir en español latino, tono cercano y emocionante. Formato limpio con etiquetas.`;

  try {
    const response = await fetch(MOTOR_IA_URL + '/api/ia/groq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-usuario-id': _getUsuarioId() || '' },
      body: JSON.stringify({
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        max_tokens: 1000,
        temperature: 0.8
      })
    });
    const data = await response.json();
    showAiResult('copy', data.texto || 'Error al generar el copy.');
  } catch (error) {
    showAiResult('copy', 'Error al conectar con la IA. Verifica que el motor este encendido.');
  }
}

async function generateScript() {
  const p = getProductData();
  if (!p.name) {
    alert('Ingresa el nombre del producto');
    return;
  }

  showAiLoading('script', 'Escribiendo guión...');

  const systemPrompt = 'Eres un experto en crear contenido viral para TikTok y Facebook Reels para el mercado hispano en Estados Unidos.';
  const userPrompt = `Crea un guión de video de 30-45 segundos para vender este producto:

Producto: ${p.name}
Descripción: ${p.desc}
Precio: $${p.price} USD

El guión debe tener:
1. HOOK visual (0-3 seg): qué se ve en pantalla
2. PROBLEMA (3-10 seg): el dolor del cliente
3. SOLUCIÓN (10-25 seg): el producto como héroe
4. PRUEBA (25-35 seg): resultado o beneficio
5. CTA final (35-45 seg): qué debe hacer el viewer

Para cada parte indicar:
- Lo que dice la persona (diálogo)
- Lo que se ve en pantalla (acción visual)

En español latino, dinámico y conversacional.`;

  try {
    const response = await fetch(MOTOR_IA_URL + '/api/ia/groq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-usuario-id': _getUsuarioId() || '' },
      body: JSON.stringify({
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        max_tokens: 1000,
        temperature: 0.8
      })
    });
    const data = await response.json();
    showAiResult('script', data.texto || 'Error al generar el guion.');
  } catch (error) {
    showAiResult('script', 'Error al conectar con la IA. Verifica que el motor este encendido.');
  }
}

async function generateCampaignPlan() {
  const p = getProductData();
  if (!p.name) {
    alert('Ingresa el nombre del producto');
    return;
  }

  showAiLoading('plan', 'Creando plan...');

  const systemPrompt = 'Eres un experto en Facebook Ads y dropshipping para el mercado hispano en USA.';
  const userPrompt = `Crea el plan completo de campaña para:

Producto: ${p.name}
Descripción: ${p.desc}
Precio de venta: $${p.price} USD

El plan debe incluir:

1. PÚBLICO OBJETIVO
   - Edad, género, ubicación en USA
   - Intereses específicos para segmentar
   - Comportamientos de compra

2. ESTRUCTURA DE CAMPAÑA
   - Objetivo de campaña recomendado
   - Presupuesto diario sugerido para empezar
   - Tipo de puja recomendada

3. CREATIVOS RECOMENDADOS
   - Formato de anuncio (video/imagen/carrusel)
   - Duración si es video
   - Elementos visuales clave

4. ESTRATEGIA DE PRUEBA
   - Cuántos conjuntos de anuncios probar
   - Qué variables probar primero
   - Cuándo escalar

5. MÉTRICAS CLAVE
   - CPC objetivo
   - CTR esperado
   - ROAS mínimo para escalar

6. CALENDARIO
   - Semana 1: qué hacer
   - Semana 2: qué analizar
   - Semana 3: cómo escalar

Ser específico con números y acciones concretas.
En español, formato claro con secciones.`;

  try {
    const response = await fetch(MOTOR_IA_URL + '/api/ia/groq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-usuario-id': _getUsuarioId() || '' },
      body: JSON.stringify({
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        max_tokens: 1000,
        temperature: 0.8
      })
    });
    const data = await response.json();
    showAiResult('plan', data.texto || 'Error al generar el plan.');
  } catch (error) {
    showAiResult('plan', 'Error al conectar con la IA. Verifica que el motor este encendido.');
  }
}

async function generateAll() {
  const p = getProductData();
  if (!p.name || !p.desc) {
    alert('Ingresa el nombre y descripción del producto');
    return;
  }
  await generateProductImage();
  await generateCopy();
  await generateScript();
  await generateCampaignPlan();
}

async function callGroq(prompt) {
  try {
    const response = await fetch(MOTOR_IA_URL + '/api/ia/groq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-usuario-id': _getUsuarioId() || '' },
      body: JSON.stringify({ prompt, max_tokens: 1500, temperature: 0.8 })
    });
    const data = await response.json();
    if (!data.ok) return 'Error: ' + (data.error || 'Respuesta invalida.');
    return data.texto;
  } catch (error) {
    return 'Error al conectar con la IA. Verifica que el motor este encendido.';
  }
}

function ariaRevealResults() {
  const empty = document.getElementById('aria-empty-state');
  const acc = document.getElementById('aria-results-accordion');
  if (empty) empty.hidden = true;
  if (acc) acc.hidden = false;
}

function showAiLoading(section, message) {
  ariaRevealResults();
  const div = document.getElementById('ai-result-' + section);
  if (!div) return;
  div.innerHTML =
    '<div class="ai-loading">' +
    '<div class="ai-spinner"></div>' +
    '<p>' + message + '</p></div>';
}

function downloadImage(src) {
  if (!src) return;
  if (src.startsWith('data:')) {
    const parts = src.split(',');
    const mime = parts[0].match(/:(.*?);/)[1];
    const binary = atob(parts[1]);
    const arr = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      arr[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([arr], {type: mime});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'aria-producto.png';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  } else {
    const a = document.createElement('a');
    a.href = src;
    a.download = 'aria-producto.png';
    a.target = '_blank';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

function showAiResult(section, content) {
  const emptyState = document.getElementById('aria-empty-state');
  if (emptyState) emptyState.style.display = 'none';
  ariaRevealResults();
  const div = document.getElementById('ai-result-' + section);
  if (!div) return;

  let html = content;
  if (section === 'image' && content.indexOf('data:image') !== -1) {
    const btn =
      '<button class="btn-download-img" id="btn-download-aria" type="button">⬇ Descargar imagen</button>';
    html = content
      .replace(
        /<br\s*\/?>\s*<a[^>]*class="btn-download-img"[^>]*>[\s\S]*?<\/a>/gi,
        btn
      )
      .replace(
        /<a[^>]*class="btn-download-img"[^>]*>[\s\S]*?<\/a>/gi,
        btn
      );
  }

  div.innerHTML =
    '<div class="ai-result-content aria-result-inner" id="content-' +
    section +
    '">' +
    html +
    '</div>';
}

document.addEventListener('click', function(e) {
  if (e.target && e.target.id === 'btn-download-aria') {
    const img = document.querySelector(
      '#ai-result-image img'
    );
    if (!img) return;
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || 512;
    canvas.height = img.naturalHeight || 512;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    canvas.toBlob(function(blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'aria-producto.png';
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }
});

function copyResult(section) {
  const content = document.getElementById('content-' + section);
  if (!content) return;
  navigator.clipboard.writeText(content.innerText).then(function () {
    alert('Copiado al portapapeles');
  });
}

// ══════════════════════════════════════════════════════
// CONFIGURACIÓN
// ══════════════════════════════════════════════════════

// URL base de tu tienda WooCommerce (cambiar cuando esté lista)
const STORE_URL = 'https://tutienda.com';
const VENTA_BASE_URL = MOTOR_URL; // URL base del motor (misma que MOTOR_URL)

// El registro por token ya no está activo — los usuarios los crea el admin directamente.

// Datos del agente actual (en producción viene de Supabase)
let currentAgent = {
  role:            'agent',
  name:            'Agente',
  refCode:         'AGENTE01',
  pixelId:         '',
  // campos desde Supabase (se llenan al hacer login)
  id:              null,
  codigo:          '',
  creditos_ia:     0,
  saldo_productos: 0
};

const EA_DISPLAY_NAME_KEY  = 'ea_display_name';
const EA_PIXEL_ID_KEY      = 'ea_pixel_id';
const EA_MIS_PRODUCTOS_KEY = 'ea_mis_productos';
// Links personales de venta guardados por slug: { slug: "url" }
const EA_MIS_LINKS_KEY     = 'ea_mis_productos_links';
const EA_MIS_MINIAPPS_IDS_KEY   = 'ea_mis_miniapps_ids';
const EA_MIS_MINIAPPS_LINKS_KEY = 'ea_mis_miniapps_links';

const EA_SESION_KEY = 'ea_sesion'; // sessionStorage key para la sesion activa

// Cache de productos reales traidos de Supabase via motor
// null = aun no cargado; [] = cargado pero vacio; [...] = productos reales
var _catalogoSupa = null;
var _catalogoMiniapps = null;
var _catalogoSubTabActivo = 'fisicos';

// Convierte un producto de Supabase al formato que espera buildProductCardHtml
function _normalizarProductoSupa(p) {
  var stock  = p.stock || 0;
  var estado = stock === 0 ? 'Agotado' : stock <= 15 ? 'Limitado' : 'Disponible';
  return {
    id:        p.id,
    slug:      p.slug,
    nombre:    p.nombre,
    categoria: p.categoria || 'General',
    precio:    p.precio    || 0,
    utilidad:  p.utilidad  || 0,
    stock:     stock,
    estado:    estado,
    imagenes:  Array.isArray(p.imagenes) ? p.imagenes : [],
    imagen:    (Array.isArray(p.imagenes) && p.imagenes[0]) || ''
  };
}

// Carga el catalogo desde Supabase; llama callback(err, productos[])
function _cargarCatalogoSupa(callback) {
  fetch(MOTOR_URL + '/api/catalogo')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.ok) throw new Error(data.error || 'Error del servidor.');
      _catalogoSupa = (data.productos || []).map(_normalizarProductoSupa);
      if (callback) callback(null, _catalogoSupa);
    })
    .catch(function (e) {
      _catalogoSupa = [];
      if (callback) callback(e, []);
    });
}

// Catálogo hardcodeado — SOLO se usa en la portada (initLandingCarousel).
// El catalogo del dashboard lee de Supabase via _catalogoSupa.
const CATALOGO_PRODUCTOS = [
  {
    slug: 'rizador-pinza-ondulador-espiral-nova',
    nombre: 'Rizador Pinza Ondulador Espiral Nova',
    categoria: 'Belleza',
    imagen: 'assets/img/products/rizador-nova.png',
    imagenes: ['assets/img/products/rizador-nova.png'],
    stock: 142,
    precio: 59,      // precio de venta al cliente
    utilidad: 44,    // % de margen para el vendedor
    precioProveedor: 26,
    precioSugerido: 59,
    estado: 'Disponible',
    ventas: 120
  },
  {
    slug: 'airpods-segunda-generacion-con-pantalla',
    nombre: 'Airpods Segunda Generacion Con Pantalla',
    categoria: 'Tecnología',
    imagen: 'assets/img/products/airpods-pantalla.png',
    imagenes: ['assets/img/products/airpods-pantalla.png'],
    stock: 96,
    precio: 139,
    utilidad: 51,
    precioProveedor: 68,
    precioSugerido: 139,
    estado: 'Disponible',
    ventas: 95
  },
  {
    slug: 'combo-hidratacion-intensiva-bioaqu',
    nombre: 'Combo Hidratacion Intensiva Bioaqu',
    categoria: 'Belleza',
    imagen: 'assets/img/products/combo-bioaqua.png',
    imagenes: ['assets/img/products/combo-bioaqua.png'],
    stock: 220,
    precio: 39,
    utilidad: 54,
    precioProveedor: 18,
    precioSugerido: 39,
    estado: 'Limitado',
    ventas: 80
  },
  {
    slug: 'juego-cubiertos-24pcs-acero-inoxidable',
    nombre: 'Juego De Cubiertos 24pcs Acero Inoxidabl',
    categoria: 'Hogar',
    imagen: 'assets/img/products/cubiertos-24pcs.png',
    imagenes: ['assets/img/products/cubiertos-24pcs.png'],
    stock: 175,
    precio: 28,
    utilidad: 57,
    precioProveedor: 12,
    precioSugerido: 28,
    estado: 'Disponible',
    ventas: 70
  },
  {
    slug: 'humidificador-montana-inalambrico-led',
    nombre: 'Humidificador De Montana Inalambrico Led',
    categoria: 'Hogar',
    imagen: 'assets/img/products/humidificador-montana-led.png',
    imagenes: ['assets/img/products/humidificador-montana-led.png'],
    stock: 88,
    precio: 64,
    utilidad: 56,
    precioProveedor: 28,
    precioSugerido: 64,
    estado: 'Disponible',
    ventas: 55
  },
  {
    slug: 'x3-blood-sugar-complex',
    nombre: 'X3 Blood Sugar Complex',
    categoria: 'Salud',
    imagen: 'assets/img/products/blood-sugar-complex-x3.png',
    imagenes: ['assets/img/products/blood-sugar-complex-x3.png'],
    stock: 112,
    precio: 79,
    utilidad: 52,
    precioProveedor: 38,
    precioSugerido: 79,
    estado: 'Disponible',
    ventas: 50
  },
  {
    slug: 'destornillador-electrico-inalambrico',
    nombre: 'Destornillador Electrico Inalambrico',
    categoria: 'Hogar',
    imagen: 'assets/img/products/destornillador-electrico-inalambrico.png',
    imagenes: ['assets/img/products/destornillador-electrico-inalambrico.png'],
    stock: 94,
    precio: 62,
    utilidad: 56,
    precioProveedor: 27,
    precioSugerido: 62,
    estado: 'Disponible',
    ventas: 45
  },
  {
    slug: 'cortador-verduras-electrico-portatil',
    nombre: 'Cortador De Verduras Electrico Portatil',
    categoria: 'Cocina',
    imagen: 'assets/img/products/cortador-verduras-electrico.png',
    imagenes: ['assets/img/products/cortador-verduras-electrico.png'],
    stock: 205,
    precio: 41,
    utilidad: 61,
    precioProveedor: 16,
    precioSugerido: 41,
    estado: 'Disponible',
    ventas: 40
  },
  {
    slug: 'tablero-educativo-didactico-blln3744',
    nombre: 'Tablero Educativo Didactico Blln3744',
    categoria: 'Juguetes',
    imagen: 'assets/img/products/tablero-educativo-blln3744.png',
    imagenes: ['assets/img/products/tablero-educativo-blln3744.png'],
    stock: 48,
    precio: 74,
    utilidad: 54,
    precioProveedor: 34,
    precioSugerido: 74,
    estado: 'Disponible',
    ventas: 35
  }
];

function formatDisplayName(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(function (w) {
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

function initialsFromDisplayName(name) {
  const t = (name || '').trim();
  if (!t) return '?';
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function deriveNameFromEmail(email) {
  if (!email || typeof email !== 'string' || !email.includes('@')) return '';
  const local = email.split('@')[0].replace(/[._+-]+/g, ' ').trim();
  return formatDisplayName(local);
}

function resolveDisplayName(isAdmin) {
  const regPage = document.getElementById('page-register');
  const regNameEl = document.getElementById('register-name');
  if (regPage && regPage.classList.contains('active') && regNameEl) {
    const n = formatDisplayName(regNameEl.value);
    if (n) return n;
  }

  const loginNameEl = document.getElementById('login-name');
  const loginName = loginNameEl && loginNameEl.value.trim() ? formatDisplayName(loginNameEl.value) : '';

  if (isAdmin) {
    return loginName || 'Administrador';
  }

  if (loginName) return loginName;

  try {
    const stored = sessionStorage.getItem(EA_DISPLAY_NAME_KEY);
    if (stored) return formatDisplayName(stored);
  } catch (e) {}

  const emailEl = document.getElementById('login-email');
  const fromEmail = deriveNameFromEmail(emailEl ? emailEl.value : '');
  return fromEmail || 'Agente';
}

function setWelcomeHeading(displayName) {
  const el = document.getElementById('welcome-name');
  if (!el) return;
  el.textContent = '';
  el.appendChild(document.createTextNode('Hola, '));
  const span = document.createElement('span');
  span.textContent = displayName;
  el.appendChild(span);
}

// ══════════════════════════════════════════════════════
// NAVEGACIÓN ENTRE PÁGINAS
// ══════════════════════════════════════════════════════

function showPage(id) {
  // Ocultar TODAS las páginas explícitamente (display:none en inline style)
  document.querySelectorAll('.page').forEach(function(p) {
    p.classList.remove('active');
    p.style.display = 'none';
  });
  // Mostrar SOLO la página destino
  const target = document.getElementById(id);
  if (target) {
    target.classList.add('active');
    target.style.display = 'flex';   // mismo valor que .page.active en el CSS
    target.scrollTop = 0;
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }
}

/** Contacto en la landing: asegura vista landing + scroll a la franja #contacto */
function goToContacto(event) {
  if (event) event.preventDefault();
  showPage('page-home');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const el = document.getElementById('contacto');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

// ══════════════════════════════════════════════════════
// TOKEN Y AUTENTICACIÓN
// ══════════════════════════════════════════════════════

function validateToken() {
  // El registro por token está desactivado.
  // Los accesos los crea el administrador directamente desde el panel de administración.
  const alertEl = document.getElementById('token-alert');
  if (alertEl) {
    alertEl.textContent = 'El registro por token no está disponible. Contacta al administrador para obtener tu acceso.';
    alertEl.className = 'alert error show';
  }
}

// ══════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════

function productTagClass(estado) {
  const e = (estado || '').toLowerCase();
  if (e === 'limitado') return 'tag-limited';
  return 'tag-available';
}

function getMisProductosSlugs() {
  try {
    const raw = sessionStorage.getItem(EA_MIS_PRODUCTOS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch (e) {
    return [];
  }
}

function saveMisProductosSlugs(slugs) {
  try {
    sessionStorage.setItem(EA_MIS_PRODUCTOS_KEY, JSON.stringify(slugs));
  } catch (e) {}
}

function isProductoEnMisProductos(slug) {
  return getMisProductosSlugs().indexOf(slug) !== -1;
}

function getProductoBySlug(slug) {
  if (_catalogoSupa && _catalogoSupa.length) {
    var found = _catalogoSupa.find(function (p) { return p.slug === slug; });
    if (found) return found;
  }
  return CATALOGO_PRODUCTOS.find(function (p) { return p.slug === slug; }) || null;
}

function getMisProductos() {
  const slugs = getMisProductosSlugs();
  return slugs.map(getProductoBySlug).filter(Boolean);
}

function productSellPanelHtml(slug) {
  var s = _esc(slug);
  return (
    '<div class="product-sell-panel" hidden>' +
    '<div class="product-sell-hint">Tu link de venta:</div>' +
    '<div class="product-sell-url"></div>' +
    '<button type="button" class="btn-product-copy" onclick="copyLink(&#39;' + s + '&#39;, this)">Copiar link</button>' +
    '</div>'
  );
}

function buildProductCardHtml(p, mode) {
  const cardMode = mode || 'catalogo';
  const tagClass = productTagClass(p.estado);
  const slug = p.slug;
  const slugE = _esc(slug); // slug escapado para atributos HTML / onclick
  const added = isProductoEnMisProductos(slug);
  // TODO: en produccion imagenes[], precio y utilidad vienen del inventario del admin via Supabase/R2
  var imgs = (p.imagenes && p.imagenes.length) ? p.imagenes : [p.imagen];
  var mainImg = imgs[0] || p.imagen;
  var tieneVarias = imgs.length > 1;

  // Precio de venta y margen
  var precio   = p.precio   != null ? p.precio   : (p.precioSugerido || 0);
  var utilidad = p.utilidad != null ? p.utilidad :
    (p.precioProveedor && precio > 0
      ? Math.round((precio - p.precioProveedor) / precio * 100)
      : 0);

  let actionHtml = '';

  if (cardMode === 'mis-productos') {
    // Link personal: viene de Supabase vía cache local
    var links     = getMisProductosLinks();
    var linkVenta = links[slug] || null;
    var linkHtml  = linkVenta
      ? '<div class="product-link-label">Tu link de venta</div>' +
        '<div class="product-link-row">' +
          '<span class="product-link-url">' + _esc(linkVenta) + '</span>' +
          '<button type="button" class="btn-copy-link-personal" onclick="copiarLinkVenta(&#39;' + slugE + '&#39;)">Copiar</button>' +
        '</div>'
      : '<div class="product-link-pending">Sin pagina de venta asignada aun. Contacta al administrador.</div>';
    actionHtml =
      '<div class="product-link-personal">' + linkHtml + '</div>' +
      '<button type="button" class="btn-product-link" onclick="abrirAlbumProducto(&#39;' + slugE + '&#39;)">' +
        (tieneVarias ? 'Descargar imagenes (' + imgs.length + ')' : 'Descargar imagen') +
      '</button>' +
      '<button type="button" class="btn-product-remove" onclick="quitarProductoDeMisProductos(&#39;' + slugE + '&#39;)">Quitar</button>';
  } else if (cardMode === 'admin') {
    actionHtml =
      '<button type="button" class="btn-product-add" onclick="toggleProductSellPanel(this, &#39;' + slugE + '&#39;)">+ Anadir para vender</button>' +
      productSellPanelHtml(slug);
  } else if (added) {
    // catalogo — producto ya anadido: solo badge Anadido, sin link (el link esta en Mis Productos)
    actionHtml =
      '<button type="button" class="btn-product-add btn-product-add--added" disabled>Anadido</button>';
  } else {
    // catalogo — no anadido: solo boton anadir, sin panel de link
    actionHtml =
      '<button type="button" class="btn-product-add" onclick="anadirProductoAMisProductos(&#39;' + slugE + '&#39;)">+ Anadir para vender</button>';
  }

  return (
    '<div class="product-card" data-slug="' + slugE + '">' +
    '<div class="product-img product-img--clickable" onclick="abrirAlbumProducto(&#39;' + slugE + '&#39;)">' +
    '<img src="' + _esc(mainImg) + '" alt="' + _esc(p.nombre) + '" loading="lazy" decoding="async" width="800" height="600" />' +
    '<div class="product-img-overlay"></div>' +
    '<span class="product-img-hint">' + (tieneVarias ? 'Ver ' + imgs.length + ' fotos' : 'Ver foto') + '</span>' +
    '</div>' +
    '<div class="product-info">' +
    '<div class="product-meta-top">' +
    (p.categoria ? '<span class="product-cat">' + _esc(p.categoria) + '</span>' : '') +
    '<span class="product-stock product-stock--ok">Stock: ' + Number(p.stock || 0) + '</span></div>' +
    '<div class="product-name">' + _esc(p.nombre) + '</div>' +
    '<div class="product-prices">' +
    '<div class="product-price-line product-price-line--sale">Precio de venta: <span>$' + Number(precio) + '</span></div>' +
    '<div class="product-price-line product-price-line--utilidad">Margen de utilidad: <span>' + Number(utilidad) + '%</span></div>' +
    '</div>' +
    '<div class="product-tags-row"><span class="product-tag ' + tagClass + '">' + _esc(p.estado) + '</span></div>' +
    actionHtml +
    '</div></div>'
  );
}

function renderProductGrid(containerId, productos, mode) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = productos.map(function (p) {
    return buildProductCardHtml(p, mode);
  }).join('');
}

function renderCatalogoGrid() {
  var gridEl = document.getElementById('agent-grid-catalogo');

  // Si ya tenemos datos en cache, re-renderizar directamente (ej. tras anadir/quitar producto)
  if (_catalogoSupa !== null) {
    if (!_catalogoSupa.length) {
      if (gridEl) gridEl.innerHTML =
        '<p style="padding:40px 24px;color:#888;text-align:center;font-style:italic;">Aun no hay productos disponibles en el catalogo.</p>';
      return;
    }
    renderProductGrid('agent-grid-catalogo', _catalogoSupa, 'catalogo');
    return;
  }

  // Primera carga: mostrar spinner y traer de Supabase
  if (gridEl) {
    gridEl.innerHTML = '<p style="padding:32px;color:#999;font-style:italic;">Cargando catalogo...</p>';
    gridEl.hidden = false;
  }

  _cargarCatalogoSupa(function (err, productos) {
    if (err) {
      if (gridEl) gridEl.innerHTML =
        '<div style="padding:32px 24px;text-align:center;">' +
        '<p style="color:#c0392b;font-weight:600;margin-bottom:8px;">No se pudo conectar al servidor.</p>' +
        '<p style="color:#888;font-size:13px;">Verifica que el motor este encendido en el puerto 3002.</p>' +
        '<button onclick="_catalogoSupa=null;renderCatalogoGrid();" style="margin-top:12px;padding:6px 16px;border:1px solid #b8973a;background:none;color:#b8973a;cursor:pointer;border-radius:3px;">Reintentar</button>' +
        '</div>';
      return;
    }
    if (!productos.length) {
      if (gridEl) gridEl.innerHTML =
        '<p style="padding:40px 24px;color:#888;text-align:center;font-style:italic;">Aun no hay productos disponibles en el catalogo.</p>';
      return;
    }
    renderProductGrid('agent-grid-catalogo', productos, 'catalogo');
  });
}

function renderMisProductosGrid() {
  var uid    = _getUsuarioId();
  var emptyEl = document.getElementById('agent-mis-productos-empty');
  var gridEl  = document.getElementById('agent-grid-mis-productos');
  if (!gridEl) return;

  if (!uid) {
    gridEl.innerHTML = ''; gridEl.hidden = true;
    if (emptyEl) emptyEl.hidden = false;
    return;
  }

  gridEl.innerHTML = '<p style="padding:32px;color:#999;font-style:italic;">Cargando tus productos...</p>';
  gridEl.hidden = false;
  if (emptyEl) emptyEl.hidden = true;

  fetch(MOTOR_URL + '/api/mis-productos/' + encodeURIComponent(uid))
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.ok) throw new Error(data.error || 'Error');
      var items = data.productos || [];

      // Sincronizar cache local (para getMisProductos() en otros tabs)
      var slugs = []; var links = {};
      items.forEach(function (item) {
        var p = item.productos;
        if (p && p.slug) { slugs.push(p.slug); links[p.slug] = item.link_venta || ''; }
      });
      saveMisProductosSlugs(slugs);
      saveMisProductosLinks(links);

      if (!items.length) {
        gridEl.innerHTML = ''; gridEl.hidden = true;
        if (emptyEl) emptyEl.hidden = false;
        return;
      }

      if (emptyEl) emptyEl.hidden = true;
      gridEl.hidden = false;

      gridEl.innerHTML = items.map(function (item) {
        var p = item.productos;
        if (!p) return '';
        var imgs      = Array.isArray(p.imagenes) ? p.imagenes : [];
        var mainImg   = imgs[0] || '';
        var stock     = p.stock || 0;
        var estado    = stock === 0 ? 'Agotado' : stock <= 15 ? 'Limitado' : 'Disponible';
        var tagCls    = estado === 'Agotado' ? 'tag-sold' : estado === 'Limitado' ? 'tag-limited' : 'tag-available';
        var multiImg  = imgs.length > 1;
        var slug      = p.slug;
        var link      = item.link_venta || '';
        return '<div class="product-card" data-slug="' + slug + '">' +
          '<div class="product-img product-img--clickable" onclick="abrirAlbumProducto(\'' + slug + '\')">' +
          (mainImg ? '<img src="' + mainImg + '" alt="' + p.nombre + '" loading="lazy" decoding="async" width="800" height="600">' : '') +
          '<div class="product-img-overlay"></div>' +
          '<span class="product-img-hint">' + (multiImg ? 'Ver ' + imgs.length + ' fotos' : 'Ver foto') + '</span>' +
          '</div>' +
          '<div class="product-info">' +
          '<div class="product-meta-top">' +
          (p.categoria ? '<span class="product-cat">' + p.categoria + '</span>' : '') +
          '<span class="product-stock product-stock--ok">Stock: ' + stock + '</span></div>' +
          '<div class="product-name">' + (p.nombre || '') + '</div>' +
          '<div class="product-prices">' +
          '<div class="product-price-line product-price-line--sale">Precio de venta: <span>$' + (p.precio || 0) + '</span></div>' +
          '<div class="product-price-line product-price-line--utilidad">Margen de utilidad: <span>' + (p.utilidad || 0) + '%</span></div>' +
          '</div>' +
          '<div class="product-tags-row"><span class="product-tag ' + tagCls + '">' + estado + '</span></div>' +
          '<div class="product-link-personal">' +
          (link
            ? '<div class="product-link-label">Tu link de venta</div>' +
              '<div class="product-link-row">' +
              '<span class="product-link-url">' + link + '</span>' +
              '<button type="button" class="btn-copy-link-personal" onclick="copiarLinkVenta(\'' + slug + '\')">Copiar</button>' +
              '</div>'
            : '<div class="product-link-pending">Sin pagina de venta asignada. Contacta al administrador.</div>'
          ) +
          '</div>' +
          '<button type="button" class="btn-product-link" onclick="abrirAlbumProducto(\'' + slug + '\')">' +
          (multiImg ? 'Descargar imagenes (' + imgs.length + ')' : 'Descargar imagen') +
          '</button>' +
          '<button type="button" class="btn-product-remove" onclick="quitarProductoDeMisProductos(\'' + slug + '\')">Quitar</button>' +
          '</div></div>';
      }).join('');
    })
    .catch(function (e) {
      gridEl.innerHTML = '<p style="padding:32px;color:#c0392b;font-size:13px;">Error al cargar: ' + e.message + '</p>';
      gridEl.hidden = false;
    });
}

// ── Links personales de venta ─────────────────────────────────────────
function getMisProductosLinks() {
  try { return JSON.parse(sessionStorage.getItem(EA_MIS_LINKS_KEY) || '{}'); } catch (e) { return {}; }
}
function saveMisProductosLinks(links) {
  try { sessionStorage.setItem(EA_MIS_LINKS_KEY, JSON.stringify(links)); } catch (e) {}
}
function generarLinkVenta(slug) {
  // Devuelve null si no hay link guardado desde Supabase — el link real viene del motor
  return null;
}
function copiarLinkVenta(slug) {
  var links = getMisProductosLinks();
  var url   = links[slug] || null;
  if (!url) {
    alert('Este producto aun no tiene pagina de venta asignada. Contacta al administrador.');
    return;
  }
  var btn   = document.querySelector('.product-card[data-slug="' + slug + '"] .btn-copy-link-personal');
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(function () { if (btn) showCopied(btn); });
  } else {
    var ta = document.createElement('textarea');
    ta.value = url; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
    if (btn) showCopied(btn);
  }
}
// ─────────────────────────────────────────────────────────────────────

// Obtiene el usuario_id de la sesion activa
function _getUsuarioId() {
  try { return (JSON.parse(sessionStorage.getItem(EA_SESION_KEY) || '{}')).id || null; }
  catch (e) { return null; }
}

// Precarga mis_productos de Supabase al entrar al dashboard (para que otros tabs los vean)
function _precargarMisProductos() {
  var uid = _getUsuarioId();
  if (!uid) return;
  fetch(MOTOR_URL + '/api/mis-productos/' + encodeURIComponent(uid))
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.ok) return;
      var slugs = []; var links = {};
      (data.productos || []).forEach(function (item) {
        var p = item.productos;
        if (p && p.slug) { slugs.push(p.slug); links[p.slug] = item.link_venta || ''; }
      });
      saveMisProductosSlugs(slugs);
      saveMisProductosLinks(links);
    })
    .catch(function () {});
  _precargarMisMiniapps();
}

function anadirProductoAMisProductos(slug) {
  var uid      = _getUsuarioId();
  var producto = getProductoBySlug(slug);
  if (!uid || !producto || !producto.id) {
    alert('No se pudo identificar el producto o la sesion. Intenta de nuevo.');
    return;
  }

  // Feedback inmediato en el boton
  var btn = document.querySelector('.product-card[data-slug="' + slug + '"] .btn-product-add');
  if (btn) { btn.disabled = true; btn.textContent = 'Agregando...'; }

  fetch(MOTOR_URL + '/api/mis-productos/agregar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario_id: uid, producto_id: producto.id })
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.ok) throw new Error(data.error || 'Error');
      // Actualizar cache local
      var slugs = getMisProductosSlugs();
      if (slugs.indexOf(slug) === -1) slugs.push(slug);
      saveMisProductosSlugs(slugs);
      var links = getMisProductosLinks();
      links[slug] = data.link_venta || '';
      saveMisProductosLinks(links);
      // Re-renderizar catálogo (actualiza boton a "Anadido") y Mis Productos
      if (_catalogoSupa) renderProductGrid('agent-grid-catalogo', _catalogoSupa, 'catalogo');
      renderMisProductosGrid();
    })
    .catch(function (e) {
      alert('Error al agregar: ' + e.message);
      if (btn) { btn.disabled = false; btn.textContent = '+ Anadir para vender'; }
    });
}

function quitarProductoDeMisProductos(slug) {
  var uid      = _getUsuarioId();
  var producto = getProductoBySlug(slug);

  function _quitarLocal() {
    var slugs = getMisProductosSlugs().filter(function (s) { return s !== slug; });
    saveMisProductosSlugs(slugs);
    var links = getMisProductosLinks(); delete links[slug];
    saveMisProductosLinks(links);
    if (_catalogoSupa) renderProductGrid('agent-grid-catalogo', _catalogoSupa, 'catalogo');
    renderMisProductosGrid();
  }

  if (!uid || !producto || !producto.id) { _quitarLocal(); return; }

  fetch(MOTOR_URL + '/api/mis-productos/quitar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario_id: uid, producto_id: producto.id })
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.ok) throw new Error(data.error || 'Error');
      _quitarLocal();
    })
    .catch(function (e) { alert('Error al quitar: ' + e.message); });
}

// ── Activos digitales (mini apps) ───────────────────────────────────────────

function getMisMiniappsIds() {
  try {
    var raw = JSON.parse(sessionStorage.getItem(EA_MIS_MINIAPPS_IDS_KEY) || '[]');
    return Array.isArray(raw) ? raw.map(String) : [];
  } catch (e) { return []; }
}
function saveMisMiniappsIds(ids) {
  try { sessionStorage.setItem(EA_MIS_MINIAPPS_IDS_KEY, JSON.stringify(ids.map(String))); } catch (e) {}
}
function getMisMiniappsLinks() {
  try { return JSON.parse(sessionStorage.getItem(EA_MIS_MINIAPPS_LINKS_KEY) || '{}'); } catch (e) { return {}; }
}
function saveMisMiniappsLinks(links) {
  try { sessionStorage.setItem(EA_MIS_MINIAPPS_LINKS_KEY, JSON.stringify(links)); } catch (e) {}
}
function isMiniappEnMisProductos(miniappId) {
  return getMisMiniappsIds().indexOf(String(miniappId)) !== -1;
}
function _tipoMiniappLabel(tipo) {
  var t = String(tipo || '').toLowerCase();
  return t.indexOf('pdf') !== -1 ? 'Mini App + PDF' : 'Mini App';
}
function _fmtPrecioMiniapp(n) {
  var v = Number(n);
  if (!Number.isFinite(v)) return '0';
  return (Math.round(v * 100) / 100).toFixed(v % 1 === 0 ? 0 : 2);
}

function switchCatalogoSubTab(tabId) {
  _catalogoSubTabActivo = tabId;
  ['fisicos', 'digitales'].forEach(function (id) {
    var panel = document.getElementById('cat-sub-' + id);
    var btn   = document.getElementById('cat-subtab-btn-' + id);
    var active = id === tabId;
    if (panel) { panel.hidden = !active; panel.classList.toggle('active', active); }
    if (btn) {
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    }
  });
  if (tabId === 'digitales') renderCatalogoMiniappsGrid();
  else if (_catalogoSupa === null) renderCatalogoGrid();
  else renderProductGrid('agent-grid-catalogo', _catalogoSupa, 'catalogo');
}

function buildMiniappCardHtml(m, mode) {
  var cardMode = mode || 'catalogo';
  var idStr    = String(m.id);
  var slugE    = _esc(m.slug);
  var imgUrl   = MOTOR_URL + '/api/miniapps/asset/' + encodeURIComponent(m.slug) + '/foto1';
  var tipoLbl  = _tipoMiniappLabel(m.tipo_producto);
  var precioN  = Number(m.precio) || 0;
  var precioP  = Number(m.precio_promocion);
  var hasPromo = Number.isFinite(precioP) && precioP > 0 && precioP < precioN;
  var comPct   = Number(m.comision_vendedor) || 0;

  var precioHtml = hasPromo
    ? '<div class="product-price-line product-price-line--sale">Precio: <span>$' + _fmtPrecioMiniapp(precioP) + '</span></div>' +
      '<div class="product-price-line product-price-line--was"><span style="text-decoration:line-through;color:#999">$' + _fmtPrecioMiniapp(precioN) + '</span></div>'
    : '<div class="product-price-line product-price-line--sale">Precio: <span>$' + _fmtPrecioMiniapp(precioN) + '</span></div>';

  var tagsHtml =
    '<span class="product-tag tag-available">' + _esc(tipoLbl) + '</span>' +
    '<span class="product-tag tag-available ma-tag-comision">Comision: ' + comPct + '%</span>' +
    (m.usa_ia ? '<span class="product-tag tag-limited">IA</span>' : '');

  var actionHtml = '';
  if (cardMode === 'mis-productos') {
    var link = m.link_venta || getMisMiniappsLinks()[idStr] || '';
    actionHtml =
      '<div class="product-link-personal">' +
      (link
        ? '<div class="product-link-label">Tu link de venta</div>' +
          '<div class="product-link-row">' +
          '<span class="product-link-url">' + _esc(link) + '</span>' +
          '<button type="button" class="btn-copy-link-personal" onclick="copiarLinkMiniapp(&#39;' + idStr + '&#39;)">Copiar</button>' +
          '</div>'
        : '<div class="product-link-pending">Sin link de venta.</div>') +
      '</div>' +
      '<button type="button" class="btn-product-remove" onclick="quitarMiniappDeMisProductos(&#39;' + idStr + '&#39;)">Quitar</button>';
  } else if (isMiniappEnMisProductos(m.id)) {
    var linkCat = getMisMiniappsLinks()[idStr] || '';
    actionHtml =
      (linkCat
        ? '<div class="product-link-personal">' +
          '<div class="product-link-label">Tu link de venta</div>' +
          '<div class="product-link-row">' +
          '<span class="product-link-url">' + _esc(linkCat) + '</span>' +
          '<button type="button" class="btn-copy-link-personal" onclick="copiarLinkMiniapp(&#39;' + idStr + '&#39;)">Copiar link</button>' +
          '</div></div>'
        : '<button type="button" class="btn-product-add btn-product-add--added" disabled>Anadida</button>');
  } else {
    actionHtml =
      '<button type="button" class="btn-product-add" onclick="anadirMiniappAMis(&#39;' + idStr + '&#39;)">+ Anadir para vender</button>';
  }

  return (
    '<div class="product-card product-card--miniapp" data-miniapp-id="' + idStr + '">' +
    '<div class="product-img">' +
    '<img src="' + _esc(imgUrl) + '" alt="' + _esc(m.nombre) + '" loading="lazy" decoding="async" width="800" height="600" onerror="this.parentElement.classList.add(&#39;product-img--err&#39;)" />' +
    '<div class="product-img-overlay"></div>' +
    '</div>' +
    '<div class="product-info">' +
    '<div class="product-meta-top">' +
    '<span class="product-cat">Activo digital</span></div>' +
    '<div class="product-name">' + _esc(m.nombre) + '</div>' +
    '<div class="product-prices">' + precioHtml + '</div>' +
    '<div class="product-tags-row">' + tagsHtml + '</div>' +
    actionHtml +
    '</div></div>'
  );
}

function renderCatalogoMiniappsGrid() {
  var gridEl = document.getElementById('agent-grid-miniapps');
  if (!gridEl) return;

  if (_catalogoMiniapps !== null) {
    if (!_catalogoMiniapps.length) {
      gridEl.innerHTML = '<p style="padding:40px 24px;color:#888;text-align:center;font-style:italic;">No hay activos digitales disponibles en este momento.</p>';
      return;
    }
    gridEl.innerHTML = _catalogoMiniapps.map(function (m) {
      return buildMiniappCardHtml(m, 'catalogo');
    }).join('');
    return;
  }

  gridEl.innerHTML = '<p style="padding:32px;color:#999;font-style:italic;">Cargando activos digitales...</p>';

  fetch(MOTOR_URL + '/api/catalogo/miniapps')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.ok) throw new Error(data.error || 'Error del servidor.');
      _catalogoMiniapps = data.miniapps || [];
      renderCatalogoMiniappsGrid();
    })
    .catch(function (e) {
      gridEl.innerHTML =
        '<div style="padding:32px 24px;text-align:center;">' +
        '<p style="color:#c0392b;font-weight:600;margin-bottom:8px;">No se pudo cargar activos digitales.</p>' +
        '<p style="color:#888;font-size:13px;">' + _esc(e.message) + '</p>' +
        '<button onclick="_catalogoMiniapps=null;renderCatalogoMiniappsGrid();" style="margin-top:12px;padding:6px 16px;border:1px solid #b8973a;background:none;color:#b8973a;cursor:pointer;border-radius:3px;">Reintentar</button>' +
        '</div>';
    });
}

function anadirMiniappAMis(miniappId) {
  var uid = _getUsuarioId();
  if (!uid) {
    alert('Sesion no valida. Vuelve a iniciar sesion.');
    return;
  }

  var btn = document.querySelector('.product-card[data-miniapp-id="' + miniappId + '"] .btn-product-add');
  if (btn) { btn.disabled = true; btn.textContent = 'Agregando...'; }

  fetch(MOTOR_URL + '/api/mis-miniapps/agregar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario_id: uid, miniapp_id: miniappId })
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.ok) throw new Error(data.error || 'Error');
      var ids = getMisMiniappsIds();
      var idStr = String(miniappId);
      if (ids.indexOf(idStr) === -1) ids.push(idStr);
      saveMisMiniappsIds(ids);
      var links = getMisMiniappsLinks();
      links[idStr] = data.link_venta || '';
      saveMisMiniappsLinks(links);
      if (_catalogoMiniapps) renderCatalogoMiniappsGrid();
      renderMisMiniappsGrid();
      alert('Anadida. Ya tienes tu link en Mis Productos (Activos digitales).');
    })
    .catch(function (e) {
      alert('Error al agregar: ' + e.message);
      if (btn) { btn.disabled = false; btn.textContent = '+ Anadir para vender'; }
    });
}

function copiarLinkMiniapp(miniappId) {
  var idStr = String(miniappId);
  var links = getMisMiniappsLinks();
  var url   = links[idStr] || null;
  if (!url) {
    alert('No se encontro el link de esta mini app.');
    return;
  }
  var btn = document.querySelector('.product-card[data-miniapp-id="' + idStr + '"] .btn-copy-link-personal');
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(function () { if (btn) showCopied(btn); });
  } else {
    var ta = document.createElement('textarea');
    ta.value = url; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
    if (btn) showCopied(btn);
  }
}

function quitarMiniappDeMisProductos(miniappId) {
  var uid   = _getUsuarioId();
  var idStr = String(miniappId);

  function _quitarLocal() {
    var ids = getMisMiniappsIds().filter(function (x) { return x !== idStr; });
    saveMisMiniappsIds(ids);
    var links = getMisMiniappsLinks();
    delete links[idStr];
    saveMisMiniappsLinks(links);
    if (_catalogoMiniapps) renderCatalogoMiniappsGrid();
    renderMisMiniappsGrid();
  }

  if (!uid) { _quitarLocal(); return; }

  fetch(MOTOR_URL + '/api/mis-miniapps/quitar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario_id: uid, miniapp_id: miniappId })
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.ok) throw new Error(data.error || 'Error');
      _quitarLocal();
    })
    .catch(function (e) { alert('Error al quitar: ' + e.message); });
}

function renderMisMiniappsGrid() {
  var uid     = _getUsuarioId();
  var emptyEl = document.getElementById('agent-mis-miniapps-empty');
  var gridEl  = document.getElementById('agent-grid-mis-miniapps');
  if (!gridEl) return;

  if (!uid) {
    gridEl.innerHTML = '';
    gridEl.hidden = true;
    if (emptyEl) emptyEl.hidden = false;
    return;
  }

  gridEl.innerHTML = '<p style="padding:24px;color:#999;font-style:italic;">Cargando activos digitales...</p>';
  gridEl.hidden = false;
  if (emptyEl) emptyEl.hidden = true;

  fetch(MOTOR_URL + '/api/mis-miniapps/' + encodeURIComponent(uid))
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.ok) throw new Error(data.error || 'Error');
      var items = data.miniapps || [];

      var ids = [];
      var links = {};
      items.forEach(function (item) {
        var m = item.miniapps;
        if (!m) return;
        var idStr = String(item.miniapp_id || m.id);
        ids.push(idStr);
        links[idStr] = item.link_venta || '';
      });
      saveMisMiniappsIds(ids);
      saveMisMiniappsLinks(links);

      if (!items.length) {
        gridEl.innerHTML = '';
        gridEl.hidden = true;
        if (emptyEl) emptyEl.hidden = false;
        return;
      }

      if (emptyEl) emptyEl.hidden = true;
      gridEl.hidden = false;
      gridEl.innerHTML = items.map(function (item) {
        var m = item.miniapps;
        if (!m) return '';
        return buildMiniappCardHtml({
          id:                item.miniapp_id || m.id,
          slug:              m.slug,
          nombre:            m.nombre,
          precio:            m.precio,
          precio_promocion:  m.precio_promocion,
          comision_vendedor: m.comision_vendedor,
          usa_ia:            m.usa_ia,
          tipo_producto:     m.tipo_producto,
          link_venta:        item.link_venta
        }, 'mis-productos');
      }).join('');
    })
    .catch(function (e) {
      gridEl.innerHTML = '<p style="padding:24px;color:#c0392b;font-size:13px;">Error: ' + _esc(e.message) + '</p>';
      gridEl.hidden = false;
    });
}

function _precargarMisMiniapps() {
  var uid = _getUsuarioId();
  if (!uid) return;
  fetch(MOTOR_URL + '/api/mis-miniapps/' + encodeURIComponent(uid))
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.ok) return;
      var ids = [];
      var links = {};
      (data.miniapps || []).forEach(function (item) {
        var m = item.miniapps;
        if (!m) return;
        var idStr = String(item.miniapp_id || m.id);
        ids.push(idStr);
        links[idStr] = item.link_venta || '';
      });
      saveMisMiniappsIds(ids);
      saveMisMiniappsLinks(links);
    })
    .catch(function () {});
}

function descargarImagenProducto(slug) {
  var productos = getMisProductos();
  var p = productos.find(function (pr) { return pr.slug === slug; });
  if (!p || !p.imagen) return;

  var url = p.imagen;
  var extMatch = url.split('?')[0].match(/\.([a-zA-Z0-9]+)$/);
  var ext      = extMatch ? extMatch[1].toLowerCase() : 'jpg';
  var filename = p.slug + '.' + ext;

  fetch(url)
    .then(function (r) { return r.blob(); })
    .then(function (blob) {
      var blobUrl = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(blobUrl); }, 1000);
    })
    .catch(function (err) {
      console.error('[descargar-imagen] Error al descargar:', err.message);
      window.open(url, '_blank');
    });
}

// ── ALBUM DE IMAGENES DEL PRODUCTO ────────────────────────────────────
var _albumProducto   = null;
var _albumIdxActual  = 0;

function abrirAlbumProducto(slug) {
  var p = getProductoBySlug(slug);
  if (!p) return;
  _albumProducto  = p;
  _albumIdxActual = 0;

  var imgs = (p.imagenes && p.imagenes.length) ? p.imagenes : [p.imagen];

  var nombreEl = document.getElementById('album-nombre');
  if (nombreEl) nombreEl.textContent = p.nombre;

  var countEl = document.getElementById('album-count');
  if (countEl) countEl.textContent = imgs.length === 1 ? '1 imagen' : imgs.length + ' imagenes';

  _albumRenderThumbs(imgs);
  _albumSetMain(0, imgs);

  var modal = document.getElementById('album-modal');
  if (modal) { modal.hidden = false; document.body.style.overflow = 'hidden'; }
}

function _albumSetMain(idx, imgs) {
  _albumIdxActual = idx;
  var url  = imgs[idx] || '';
  var main = document.getElementById('album-main-img');
  if (main) main.src = url;

  document.querySelectorAll('.album-thumb').forEach(function (t, i) {
    t.classList.toggle('album-thumb--active', i === idx);
  });

  var navPrev = document.getElementById('album-nav-prev');
  var navNext = document.getElementById('album-nav-next');
  if (navPrev) navPrev.hidden = idx === 0;
  if (navNext) navNext.hidden = idx === imgs.length - 1;
}

function _albumRenderThumbs(imgs) {
  var container = document.getElementById('album-thumbs');
  if (!container) return;
  container.innerHTML = imgs.map(function (url, i) {
    return '<button type="button" class="album-thumb' + (i === 0 ? ' album-thumb--active' : '') +
      '" onclick="albumSeleccionarImagen(' + i + ')" aria-label="Imagen ' + (i + 1) + '">' +
      '<img src="' + url + '" alt="Imagen ' + (i + 1) + '" loading="lazy">' +
      '</button>';
  }).join('');
  container.hidden = imgs.length < 2;
}

function albumSeleccionarImagen(idx) {
  if (!_albumProducto) return;
  var imgs = (_albumProducto.imagenes && _albumProducto.imagenes.length) ? _albumProducto.imagenes : [_albumProducto.imagen];
  _albumSetMain(idx, imgs);
}

function albumNavegar(dir) {
  if (!_albumProducto) return;
  var imgs = (_albumProducto.imagenes && _albumProducto.imagenes.length) ? _albumProducto.imagenes : [_albumProducto.imagen];
  var next = _albumIdxActual + dir;
  if (next >= 0 && next < imgs.length) _albumSetMain(next, imgs);
}

function descargarImgAlbum() {
  if (!_albumProducto) return;
  var imgs = (_albumProducto.imagenes && _albumProducto.imagenes.length) ? _albumProducto.imagenes : [_albumProducto.imagen];
  var url  = imgs[_albumIdxActual];
  if (!url) return;
  var extMatch = url.split('?')[0].match(/\.([a-zA-Z0-9]+)$/);
  var ext      = extMatch ? extMatch[1].toLowerCase() : 'jpg';
  var filename = _albumProducto.slug + '-img-' + (_albumIdxActual + 1) + '.' + ext;

  fetch(url)
    .then(function (r) { return r.blob(); })
    .then(function (blob) {
      var blobUrl = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(blobUrl); }, 1000);
    })
    .catch(function () { window.open(url, '_blank'); });
}

function cerrarAlbumProducto() {
  var modal = document.getElementById('album-modal');
  if (modal) modal.hidden = true;
  document.body.style.overflow = '';
  _albumProducto  = null;
  _albumIdxActual = 0;
}
// Esc closes album; arrow keys navigate
document.addEventListener('keydown', function (e) {
  var modal = document.getElementById('album-modal');
  if (!modal || modal.hidden) return;
  if (e.key === 'Escape') { cerrarAlbumProducto(); }
  else if (e.key === 'ArrowLeft')  { albumNavegar(-1); }
  else if (e.key === 'ArrowRight') { albumNavegar(1); }
});
// ── FIN ALBUM ─────────────────────────────────────────────────────────

function getCatalogoOrdenado() {
  return CATALOGO_PRODUCTOS.slice();
}

function getMasVendidosOrdenado() {
  // TODO: ordenar por ventas reales cuando exista el dato en backend
  return CATALOGO_PRODUCTOS.slice().sort(function (a, b) {
    return (b.ventas || 0) - (a.ventas || 0);
  });
}

function renderAgentProductGrids() {
  _catalogoSupa = null;
  _catalogoMiniapps = null;
  _catalogoSubTabActivo = 'fisicos';
  switchCatalogoSubTab('fisicos');
  renderMisProductosGrid();
  renderMisMiniappsGrid();
}

function renderAdminCatalogGrid() {
  renderProductGrid('admin-grid-catalogo', getCatalogoOrdenado(), 'admin');
  const countEl = document.getElementById('admin-catalog-count');
  if (countEl) {
    countEl.textContent = CATALOGO_PRODUCTOS.length + ' productos disponibles';
  }
}

function updateAgentCuentasPanel() {
  switchCuentasSubTab('ventas');
  eaVentasRender();
}

/* ============================================================
   CUENTAS SUB-TABS
   ============================================================ */

const CUENTAS_SUB_TAB_IDS = ['ventas', 'afiliados', 'pagos'];
const VENTAS_TIPO_TAB_IDS = ['productos', 'digitales'];

function switchVentasTipoTab(tipoId) {
  VENTAS_TIPO_TAB_IDS.forEach(function (id) {
    var panel = document.getElementById('ventas-tipo-' + id);
    var btn   = document.getElementById('ventas-tipo-btn-' + id);
    var active = id === tipoId;
    if (panel) {
      panel.classList.toggle('active', active);
      panel.hidden = !active;
    }
    if (btn) {
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    }
  });
  if (tipoId === 'digitales') eaMiniappsComisionesRender();
}

/* ============================================================
   VENTAS — lee de Supabase vía motor (GET /api/ventas/usuario/:id)
   ============================================================ */

var _eaVentasCache = null;

function _eaFmtFecha(iso) {
  var d = new Date(iso);
  var meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return d.getDate() + ' ' + meses[d.getMonth()] + ' ' + d.getFullYear();
}

function _eaFmtMonto(n) {
  var num = Number(n);
  return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function _eaEscHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function eaVentasRenderResumen(r) {
  r = r || {};
  var elTotal   = document.getElementById('ventas-mes-total');
  var elPedidos = document.getElementById('ventas-mes-pedidos');
  var elTicket  = document.getElementById('ventas-mes-ticket');
  if (elTotal)   elTotal.textContent = _eaFmtMonto(r.total_comision_ganada || 0);
  if (elPedidos) elPedidos.textContent = (r.total_ventas || 0);
  if (elTicket)  elTicket.textContent = _eaFmtMonto(r.total_vendido || 0);
  // Actualizar etiquetas de las tarjetas
  var labels = document.querySelectorAll('#cuentas-sub-ventas .cuentas-stat-label');
  if (labels[0]) labels[0].textContent = 'Comision ganada';
  if (labels[1]) labels[1].textContent = 'Pedidos totales';
  if (labels[2]) labels[2].textContent = 'Total vendido';
}

function eaVentasRenderTabla(ventas) {
  var wrap = document.getElementById('ventas-tabla-wrap');
  if (!wrap) return;
  ventas = ventas || [];

  if (ventas.length === 0) {
    wrap.innerHTML = '<p class="cuentas-empty">Aun no tienes ventas registradas.</p>';
    return;
  }

  var pagadas    = ventas.filter(function (v) { return v.estado_pago === 'pagado'; });
  var pendientes = ventas.filter(function (v) { return v.estado_pago !== 'pagado'; });

  function badgePago(ep) {
    if (ep === 'pagado') return '<span class="cuentas-badge cuentas-badge--ok">Pagado</span>';
    return '<span class="cuentas-badge cuentas-badge--pendiente">Pend. pago</span>';
  }

  function buildRow(v) {
    var comisionCell = v.estado_pago === 'pagado'
      ? '<span style="color:#27ae60;font-weight:600">' + _eaFmtMonto(v.utilidad_ganada) + '</span>'
      : '<span style="color:#aaa;font-size:0.85em">—</span>';
    return (
      '<tr>' +
      '<td>' + _eaEscHtml(v.producto) + '</td>' +
      '<td class="ventas-td-fecha">' + _eaFmtFecha(v.fecha) + '</td>' +
      '<td class="ventas-td-monto">' + _eaFmtMonto(v.monto) + '</td>' +
      '<td>' + comisionCell + '</td>' +
      '<td>' + badgePago(v.estado_pago) + '</td>' +
      '</tr>'
    );
  }

  function buildTable(rows, titulo, colorTitulo) {
    return (
      '<h5 style="margin:0 0 8px;font-size:0.88em;font-weight:600;color:' + colorTitulo + '">' + titulo + '</h5>' +
      '<div class="cuentas-table-wrap"><table class="cuentas-table">' +
      '<thead><tr>' +
        '<th>Producto</th><th>Fecha</th><th>Monto</th><th>Tu comision</th><th>Pago</th>' +
      '</tr></thead>' +
      '<tbody>' + rows.map(buildRow).join('') + '</tbody>' +
      '</table></div>'
    );
  }

  var html = '';
  if (pagadas.length > 0) {
    html += buildTable(pagadas, 'Ventas confirmadas (' + pagadas.length + ')', '#27ae60');
  }
  if (pendientes.length > 0) {
    if (html) html += '<div style="margin-top:18px"></div>';
    html += buildTable(pendientes, 'Pendientes de confirmacion de pago (' + pendientes.length + ')', '#b8934a');
  }

  wrap.innerHTML = html;
}

function eaMiniappsComisionesRenderResumen(r) {
  r = r || {};
  var elTotal  = document.getElementById('ma-com-total');
  var elVentas = document.getElementById('ma-com-ventas');
  if (elTotal)  elTotal.textContent  = _eaFmtMonto(r.total_comision || 0);
  if (elVentas) elVentas.textContent = (r.total_ventas || 0);
}

function eaMiniappsComisionesRenderTabla(detalle) {
  var wrap = document.getElementById('ma-com-tabla-wrap');
  if (!wrap) return;
  detalle = detalle || [];

  if (detalle.length === 0) {
    wrap.innerHTML = '<p class="cuentas-empty">Aun no tienes ventas de mini apps con tu link de vendedor.</p>';
    return;
  }

  var rows = detalle.map(function (v) {
    return (
      '<tr>' +
      '<td>' + _eaEscHtml(v.miniapp_nombre || 'Mini app') + '</td>' +
      '<td class="ventas-td-fecha">' + _eaFmtFecha(v.fecha) + '</td>' +
      '<td class="ventas-td-monto">' + _eaFmtMonto(v.monto) + '</td>' +
      '<td>' + (Number(v.comision_vendedor) || 0) + '%</td>' +
      '<td><span style="color:#27ae60;font-weight:600">' + _eaFmtMonto(v.comision_ganada) + '</span></td>' +
      '</tr>'
    );
  }).join('');

  wrap.innerHTML =
    '<div class="cuentas-table-wrap"><table class="cuentas-table">' +
    '<thead><tr><th>Mini app</th><th>Fecha</th><th>Monto venta</th><th>Tu %</th><th>Tu comision</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table></div>';
}

function eaMiniappsComisionesRender() {
  var uid = _getUsuarioId();
  var wrap = document.getElementById('ma-com-tabla-wrap');
  var elTotal  = document.getElementById('ma-com-total');
  var elVentas = document.getElementById('ma-com-ventas');

  if (elTotal)  elTotal.textContent  = '...';
  if (elVentas) elVentas.textContent = '...';
  if (wrap) wrap.innerHTML = '<p class="cuentas-empty">Cargando comisiones de mini apps...</p>';

  if (!uid) {
    if (wrap) wrap.innerHTML = '<p class="cuentas-empty">Inicia sesion para ver tus comisiones.</p>';
    if (elTotal)  elTotal.textContent  = '—';
    if (elVentas) elVentas.textContent = '—';
    return;
  }

  fetch(MOTOR_URL + '/api/vendedor/miniapps-comisiones?usuario_id=' + encodeURIComponent(uid))
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.ok) throw new Error(data.error || 'Error del servidor');
      eaMiniappsComisionesRenderResumen(data);
      eaMiniappsComisionesRenderTabla(data.detalle);
    })
    .catch(function () {
      if (wrap) wrap.innerHTML = '<p class="cuentas-empty" style="color:#c0392b">Error al cargar comisiones de mini apps.</p>';
      if (elTotal)  elTotal.textContent  = '—';
      if (elVentas) elVentas.textContent = '—';
    });
}

function eaVentasRender() {
  switchVentasTipoTab('productos');

  var uid = _getUsuarioId();
  var wrap = document.getElementById('ventas-tabla-wrap');
  var elTotal   = document.getElementById('ventas-mes-total');
  var elPedidos = document.getElementById('ventas-mes-pedidos');
  var elTicket  = document.getElementById('ventas-mes-ticket');

  if (elTotal)   elTotal.textContent   = '...';
  if (elPedidos) elPedidos.textContent = '...';
  if (elTicket)  elTicket.textContent  = '...';
  if (wrap)      wrap.innerHTML = '<p class="cuentas-empty">Cargando ventas...</p>';

  if (!uid) {
    if (wrap) wrap.innerHTML = '<p class="cuentas-empty">Inicia sesion para ver tus ventas.</p>';
    return;
  }

  fetch(MOTOR_URL + '/api/ventas/usuario/' + encodeURIComponent(uid))
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.ok) throw new Error(data.error || 'Error del servidor');
      _eaVentasCache = data;
      eaVentasRenderResumen(data.resumen);
      eaVentasRenderTabla(data.ventas);
    })
    .catch(function () {
      if (wrap) wrap.innerHTML = '<p class="cuentas-empty" style="color:#c0392b">Error al cargar ventas. Verifica que el motor este activo.</p>';
      if (elTotal)   elTotal.textContent = '—';
      if (elPedidos) elPedidos.textContent = '—';
      if (elTicket)  elTicket.textContent = '—';
    });
}


function switchCuentasSubTab(subId) {
  CUENTAS_SUB_TAB_IDS.forEach(function (id) {
    const panel = document.getElementById('cuentas-sub-' + id);
    const btn = document.getElementById('cuentas-subtab-btn-' + id);
    const active = id === subId;
    if (panel) {
      panel.classList.toggle('active', active);
      panel.hidden = !active;
    }
    if (btn) {
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    }
  });
  if (subId === 'ventas')    eaVentasRender();
  if (subId === 'afiliados') afiliRenderArbol();
  if (subId === 'pagos')     pagosRender();
}

/* ============================================================
   AFILIADOS — red de venta directa
   La red multinivel se implementa cuando haya datos reales de referidos.
   ============================================================ */

// Constantes de comisiones (ajustables)
const COMISION_NIVEL_1    = 10;
const COMISION_NIVEL_2    = 5;
const BONO_PRIMERA_VENTA  = 15;

// Placeholder para compatibilidad — se reemplaza por datos reales cuando exista la tabla de referidos
const AFIL_RED_DEMO = [
  {
    usuario: '@maria_lp',
    ingreso: '03 Jun 2026',
    ventas: '$380',
    comision: '$38',
    nivel2: [
      { usuario: '@ana_c', ingreso: '10 Jun 2026', ventas: '$120', comision: '$6' }
    ]
  },
  {
    usuario: '@carlos_m',
    ingreso: '28 May 2026',
    ventas: '$220',
    comision: '$22',
    nivel2: [
      { usuario: '@pedro_n',  ingreso: '01 Jun 2026', ventas: '$160', comision: '$8' },
      { usuario: '@diego_v',  ingreso: '05 Jun 2026', ventas: '$80',  comision: '$4' }
    ]
  },
  {
    usuario: '@sofia_r',
    ingreso: '20 May 2026',
    ventas: '$140',
    comision: '$14',
    nivel2: []
  },
  {
    usuario: '@luis_av',
    ingreso: '15 May 2026',
    ventas: '$200',
    comision: '$20',
    nivel2: [
      { usuario: '@ana_g', ingreso: '25 May 2026', ventas: '$60', comision: '$3' }
    ]
  }
];

function afiliRenderArbol() {
  var n1El   = document.getElementById('afil-pct-n1');
  var n2El   = document.getElementById('afil-pct-n2');
  var bonoEl = document.getElementById('afil-bono');
  if (n1El)   n1El.textContent   = COMISION_NIVEL_1 + '%';
  if (n2El)   n2El.textContent   = COMISION_NIVEL_2 + '%';
  if (bonoEl) bonoEl.textContent = '$' + BONO_PRIMERA_VENTA + ' por afiliado';

  var wrap = document.getElementById('afil-arbol');
  if (!wrap) return;
  wrap.innerHTML = '<p class="cuentas-empty">Aun no tienes afiliados en tu red. Comparte tu link de venta para comenzar.</p>';
}

function afiliToggleN2(id, btn) {
  var wrap = document.getElementById(id);
  if (!wrap) return;
  var opening = wrap.hidden;
  wrap.hidden = !opening;
  if (btn) {
    btn.classList.toggle('afil-expand-btn--open', opening);
    if (opening) {
      btn.setAttribute('data-label', btn.textContent);
      btn.textContent = 'Ocultar red';
    } else {
      btn.textContent = btn.getAttribute('data-label') || 'Ver red';
    }
  }
}

/* ============================================================
   PAGOS — solicitud manual, ciclo quincenal (cada 15 dias)
   TODO (produccion): balance real y desembolso en backend.
   Aqui es la UI + localStorage para la regla de los 15 dias.
   ============================================================ */

const EA_SOLICITUDES_KEY  = 'ea_solicitudes_pago';
const EA_ULTIMA_SOL_KEY   = 'ea_ultima_solicitud_pago';
const EA_METODO_PAGO_KEY  = 'ea_metodo_pago';
const PAGOS_DIAS_COOLDOWN = 15;

function _pagosSolicitudesLeer() {
  try {
    var raw = localStorage.getItem(EA_SOLICITUDES_KEY);
    if (!raw) return [];
    var arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}

function _pagosSolicitudesGuardar(arr) {
  try { localStorage.setItem(EA_SOLICITUDES_KEY, JSON.stringify(arr)); } catch (e) {}
}

function _pagosUltimaSolicitudMs() {
  try {
    var raw = localStorage.getItem(EA_ULTIMA_SOL_KEY);
    return raw ? Number(raw) : 0;
  } catch (e) { return 0; }
}

function _pagosCalcularBalance() {
  // Balance = total ventas guardadas - total solicitudes con estado "Pagado"
  // TODO (produccion): reemplazar con valor real del backend
  var ventas     = eaVentasLeer();
  var totalGanado = ventas.reduce(function (s, v) { return s + Number(v.monto); }, 0);
  var solicitudes = _pagosSolicitudesLeer();
  var totalRetirado = solicitudes
    .filter(function (s) { return s.estado === 'Pagado'; })
    .reduce(function (s, r) { return s + Number(r.monto); }, 0);
  var balance = Math.max(0, totalGanado - totalRetirado);
  return { balance: balance, totalGanado: totalGanado, totalRetirado: totalRetirado };
}

function _pagosProximasFechas() {
  var now   = new Date();
  var y     = now.getFullYear();
  var m     = now.getMonth();
  var meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  var d15   = new Date(y, m, 15);
  var d30   = new Date(y, m + 1, 0); // ultimo dia del mes
  function fmt(d) { return d.getDate() + ' ' + meses[d.getMonth()]; }
  return fmt(d15) + ' y ' + fmt(d30);
}

function pagosRenderResumen() {
  var calc = _pagosCalcularBalance();
  var elBal = document.getElementById('pagos-balance-value');
  var elGan = document.getElementById('pagos-total-ganado');
  var elRet = document.getElementById('pagos-total-retirado');
  if (elBal) elBal.textContent = _eaFmtMonto(calc.balance);
  if (elGan) elGan.textContent = _eaFmtMonto(calc.totalGanado);
  if (elRet) elRet.textContent = _eaFmtMonto(calc.totalRetirado);

  var elFechas = document.getElementById('pagos-proximas-fechas');
  if (elFechas) elFechas.textContent = _pagosProximasFechas();
}

function pagosRenderBoton() {
  var btn    = document.getElementById('pagos-solicitar-btn');
  var status = document.getElementById('pagos-solicitar-status');
  if (!btn || !status) return;

  var ahora      = Date.now();
  var ultimaMs   = _pagosUltimaSolicitudMs();
  var diff       = ahora - ultimaMs;
  var cooldownMs = PAGOS_DIAS_COOLDOWN * 24 * 60 * 60 * 1000;

  if (!ultimaMs || diff >= cooldownMs) {
    btn.disabled = false;
    btn.classList.remove('pagos-solicitar-btn--disabled');
    status.textContent = 'Puedes solicitar tu pago ahora.';
    status.className = 'pagos-solicitar-status pagos-solicitar-status--ok';
  } else {
    btn.disabled = true;
    btn.classList.add('pagos-solicitar-btn--disabled');
    var msRestantes   = cooldownMs - diff;
    var diasRestantes = Math.ceil(msRestantes / (24 * 60 * 60 * 1000));
    var txt = diasRestantes === 1
      ? 'Podras solicitar tu proximo pago en 1 dia.'
      : 'Podras solicitar tu proximo pago en ' + diasRestantes + ' dias.';
    status.textContent = txt;
    status.className = 'pagos-solicitar-status pagos-solicitar-status--wait';
  }
}

function pagosRenderHistorial() {
  var wrap = document.getElementById('pagos-historial-wrap');
  if (!wrap) return;
  var solicitudes = _pagosSolicitudesLeer();
  var sorted = solicitudes.slice().sort(function (a, b) {
    return new Date(b.fecha) - new Date(a.fecha);
  });
  if (sorted.length === 0) {
    wrap.innerHTML = '<p class="cuentas-empty">Aun no has solicitado pagos.</p>';
    return;
  }
  var estadoCss = {
    'En proceso': 'cuentas-badge--pending',
    'Pagado':     'cuentas-badge--ok',
    'Rechazado':  'cuentas-badge--cancelado'
  };
  var rows = sorted.map(function (s) {
    var css = estadoCss[s.estado] || 'cuentas-badge--pending';
    return (
      '<tr>' +
        '<td class="ventas-td-fecha">' + _eaFmtFecha(s.fecha) + '</td>' +
        '<td class="ventas-td-monto">' + _eaFmtMonto(s.monto) + '</td>' +
        '<td><span class="cuentas-badge ' + css + '">' + _eaEscHtml(s.estado) + '</span></td>' +
        '<td class="ventas-td-fecha">' + (s.fechaPago ? _eaFmtFecha(s.fechaPago) : '—') + '</td>' +
      '</tr>'
    );
  }).join('');
  wrap.innerHTML =
    '<div class="cuentas-table-wrap">' +
    '<table class="cuentas-table">' +
    '<thead><tr>' +
      '<th>Fecha solicitud</th>' +
      '<th>Monto</th>' +
      '<th>Estado</th>' +
      '<th>Fecha de pago</th>' +
    '</tr></thead>' +
    '<tbody>' + rows + '</tbody>' +
    '</table></div>';
}

function pagosRender() {
  pagosRenderResumen();
  pagosRenderBoton();
  pagosRenderHistorial();
  // Pre-fill metodo de pago guardado
  var metodo = '';
  try { metodo = localStorage.getItem(EA_METODO_PAGO_KEY) || ''; } catch (e) {}
  var inp = document.getElementById('pagos-metodo-input');
  if (inp && metodo) inp.value = metodo;
}

function pagosSolicitar() {
  var calc = _pagosCalcularBalance();
  if (calc.balance <= 0) {
    var status = document.getElementById('pagos-solicitar-status');
    if (status) {
      status.textContent = 'Tu balance disponible es $0. Registra ventas primero.';
      status.className = 'pagos-solicitar-status pagos-solicitar-status--wait';
    }
    return;
  }

  var ahora    = Date.now();
  var solicitud = {
    id:       's' + ahora + Math.random().toString(36).slice(2, 5),
    fecha:    new Date(ahora).toISOString(),
    monto:    calc.balance,
    estado:   'En proceso',
    fechaPago: null
  };

  var arr = _pagosSolicitudesLeer();
  arr.push(solicitud);
  _pagosSolicitudesGuardar(arr);
  try { localStorage.setItem(EA_ULTIMA_SOL_KEY, String(ahora)); } catch (e) {}

  var exito = document.getElementById('pagos-solicitar-exito');
  if (exito) {
    exito.hidden = false;
    setTimeout(function () { exito.hidden = true; }, 6000);
  }

  pagosRenderResumen();
  pagosRenderBoton();
  pagosRenderHistorial();
}

function pagosGuardarMetodo() {
  var inp = document.getElementById('pagos-metodo-input');
  var ok  = document.getElementById('pagos-metodo-ok');
  var val = inp ? inp.value.trim() : '';
  try { localStorage.setItem(EA_METODO_PAGO_KEY, val); } catch (e) {}
  if (ok) {
    ok.hidden = false;
    setTimeout(function () { ok.hidden = true; }, 3000);
  }
}

function cuentasCopiarLink() {
  const input = document.getElementById('cuentas-afiliado-link');
  const btn = document.getElementById('cuentas-copy-btn');
  if (!input) return;
  const texto = input.value;
  const exito = function () {
    if (btn) {
      const prev = btn.textContent;
      btn.textContent = 'Copiado';
      btn.classList.add('copied');
      setTimeout(function () {
        btn.textContent = prev;
        btn.classList.remove('copied');
      }, 2000);
    }
  };
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(texto).then(exito).catch(function () {
      _copiarFallback(texto, exito);
    });
  } else {
    _copiarFallback(texto, exito);
  }
}

function cuentasRetirar() {
  const msg = document.getElementById('cuentas-withdraw-msg');
  if (msg) {
    msg.hidden = false;
  }
}

const AGENT_TAB_IDS = ['catalogo', 'mis-productos', 'monetizacion', 'contenido', 'ads', 'ventas', 'cuentas', 'chat-agents'];

function switchAgentTab(tabId) {
  AGENT_TAB_IDS.forEach(function (id) {
    const panel = document.getElementById('agent-tab-' + id);
    const btn = document.getElementById('agent-tab-btn-' + id);
    const active = id === tabId;
    if (panel) {
      panel.classList.toggle('active', active);
      panel.hidden = !active;
    }
    if (btn) {
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    }
  });

  if (tabId === 'catalogo') {
    if (_catalogoSubTabActivo === 'digitales') {
      if (_catalogoMiniapps === null) renderCatalogoMiniappsGrid();
      else renderCatalogoMiniappsGrid();
    } else if (_catalogoSupa === null) renderCatalogoGrid();
    else renderProductGrid('agent-grid-catalogo', _catalogoSupa, 'catalogo');
  }

  if (tabId === 'mis-productos') {
    if (_catalogoSupa === null) {
      _cargarCatalogoSupa(function () {
        renderMisProductosGrid();
        renderMisMiniappsGrid();
      });
    } else {
      renderMisProductosGrid();
      renderMisMiniappsGrid();
    }
  }

  if (tabId === 'monetizacion') {
    refreshMonetizacionTab();
  }

  if (tabId === 'contenido') {
    refreshContenidoTab();
  }

  if (tabId === 'ads') {
    renderEstadoAds();
  }

  if (tabId === 'ventas') {
    updateWhatsAppUiForState('desconectado');
    setWhatsAppStatusMessage('Desconectado', false);
    initAgentesVentasTab();
  } else {
    stopWhatsAppPolling();
  }

  if (tabId === 'cuentas') {
    updateAgentCuentasPanel();
  }

  if (tabId === 'chat-agents') {
    refreshChatAgentsTab();
  }
}

function openAgentAria() {
  const overlay = document.getElementById('agent-aria-overlay');
  if (!overlay) return;
  overlay.hidden = false;
  document.body.classList.add('agent-aria-open');
  syncAriaEmptyState();
}

function closeAgentAria() {
  const overlay = document.getElementById('agent-aria-overlay');
  if (!overlay) return;
  overlay.hidden = true;
  document.body.classList.remove('agent-aria-open');
}

function updateAgentProfilePanel() {
  const nameEl = document.getElementById('agent-profile-name');
  const refEl = document.getElementById('agent-profile-refcode');
  const pixelEl = document.getElementById('agent-profile-pixel');
  if (nameEl) nameEl.textContent = currentAgent.name || '—';
  if (refEl) refEl.textContent = currentAgent.refCode || '—';
  if (pixelEl) {
    pixelEl.textContent = (currentAgent.pixelId && String(currentAgent.pixelId).trim())
      ? currentAgent.pixelId
      : '— sin pixel —';
  }
}

// ── Costos por motor — ajustables ────────────────────────────────────────────
const COSTO_VIRAL_TENDENCIAS    = 50;
const COSTO_VIRAL_DESARROLLAR   =  0;  // incluido en tendencias
const COSTO_MODULAR             = 40;
const COSTO_EDITOR_VIDEO        = 30;
const COSTO_EDITOR_REACCION     = 30;
const COSTO_CONTENIDO_ORGANICO  = 20;
const COSTO_CONTENIDO_ANUNCIO   = 20;
const COSTO_CONTENIDO_AVATAR    = 40;

// Retorna el costo de credits para mostrar en el boton del viral
function calcularCreditosViral() { return COSTO_VIRAL_TENDENCIAS; }

// ── Helpers de créditos ───────────────────────────────────────────────────────
function _actualizarCreditosUI(n) {
  currentAgent.creditos_ia = Number(n) || 0;
  var el = document.getElementById('mon-credits-balance');
  if (el) el.textContent = String(currentAgent.creditos_ia);
}

// Wrapper de fetch para todos los endpoints de motor/IA.
// Añade x-usuario-id automáticamente y convierte 401/402 en error con .sinCreditos=true.
function _motorFetch(url, opts) {
  var uid = _getUsuarioId();
  if (!uid) return Promise.reject(_mkSinSesion());
  opts = opts || {};
  if (!opts.headers) opts.headers = {};
  opts.headers['x-usuario-id'] = uid;
  return fetch(url, opts).then(function (r) {
    if (r.status === 401 || r.status === 402) {
      return r.json().then(function (d) {
        var err = new Error(d.error || 'Sin creditos o no autorizado');
        err.sinCreditos = true;
        err.creditos_actuales = d.creditos_actuales || 0;
        throw err;
      });
    }
    return r;
  });
}

// Descuenta créditos en el motor; devuelve Promise.
// Si cantidad <= 0 resuelve inmediatamente (sin llamada de red).
function _descontarCreditos(cantidad, motor, desc) {
  var uid = _getUsuarioId();
  if (!uid) return Promise.reject(_mkSinSesion());
  if (!cantidad || cantidad <= 0) return Promise.resolve({ creditos_restantes: currentAgent.creditos_ia });
  return fetch(MOTOR_URL + '/api/creditos/descontar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario_id: uid, cantidad: cantidad, motor: motor, descripcion: desc })
  })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d.ok) {
        var e = new Error(d.error || 'Creditos insuficientes');
        e.sinCreditos = true;
        e.creditos_actuales = d.creditos_actuales;
        throw e;
      }
      _actualizarCreditosUI(d.creditos_restantes);
      return d;
    });
}

function _mkSinSesion() {
  var e = new Error('Sin sesion activa');
  e.sinCreditos = true;
  e.creditos_actuales = 0;
  return e;
}

// Carga el saldo real de créditos desde Supabase al entrar al dashboard
function _cargarCreditosReales() {
  var uid = _getUsuarioId();
  if (!uid) return;
  fetch(MOTOR_URL + '/api/creditos/' + encodeURIComponent(uid))
    .then(function (r) { return r.json(); })
    .then(function (d) { if (d.ok) _actualizarCreditosUI(d.creditos); })
    .catch(function () {});
}

// Muestra mensaje de créditos insuficientes en el elemento de alerta dado
function _mostrarSinCreditos(alertEl, err) {
  var saldo = (err && err.creditos_actuales != null) ? err.creditos_actuales : currentAgent.creditos_ia;
  var msg = 'No tienes creditos suficientes. Te quedan ' + saldo + ' creditos.';
  if (alertEl) { alertEl.textContent = msg; alertEl.hidden = false; }
}

var _monDuracionSeleccionada = 30;

function selectMonDuracion(seg) {
  _monDuracionSeleccionada = seg;
  var select = document.getElementById('mon-crear-duracion');
  if (select && Number(select.value) !== seg) select.value = String(seg);
  var btn = document.getElementById('mon-btn-crear-viral');
  if (btn) btn.textContent = 'Buscar tendencias y generar ideas (' + COSTO_VIRAL_TENDENCIAS + ' creditos)';
}

function initMonDuracionPills() {
  selectMonDuracion(_monDuracionSeleccionada);
  monRegistrarListenerLimpiar('mon-crear-macro-nicho', 'mon-fg-macro-nicho', 'mon-err-macro-nicho');
  monRegistrarListenerLimpiar('mon-crear-micro-nicho',  'mon-fg-micro-nicho',  'mon-err-micro-nicho');
}

var _monBocetoDummyData = [
  {
    titulo: 'Antes y despues en 3 actos',
    concepto: 'El video empieza con el problema visible, muestra el proceso en segundos y termina con el resultado sorprendente. Sin texto largo, puro visual.',
    porQueFunciona: 'Formato de alto enganche en TikTok esta semana.',
    gancho: '"No lo vas a creer hasta que lo veas."'
  },
  {
    titulo: 'Testimonio en primera persona',
    concepto: 'Una voz en off relata una experiencia real (o verosimil) usando el producto o contenido del nicho. Tono intimo, como si hablara con un amigo.',
    porQueFunciona: 'Los videos de testimonio superan el 70% de visualizacion completa en nicho belleza.',
    gancho: '"Llevo 30 dias haciendolo y esto es lo que cambio."'
  },
  {
    titulo: 'Secreto del experto revelado',
    concepto: 'El creador actua como experto que desvela un truco que "muy pocos conocen". Ritmo rapido, subtitulos grandes, corte brusco al inicio para detener el scroll.',
    porQueFunciona: 'Patron de alta curiosidad que dispara el replay y los comentarios de duda.',
    gancho: '"Esto no te lo va a decir nadie por dinero."'
  }
];

var _monBosetoSeleccionado = null;
var _monBocetosActuales    = null;

function renderMonBocetos(bocetos) {
  _monBocetosActuales = bocetos;
  var grid = document.getElementById('mon-bocetos-grid');
  if (!grid) return;
  grid.innerHTML = '';
  bocetos.forEach(function (b, idx) {
    var card = document.createElement('div');
    card.className = 'mon-boceto-card';
    card.setAttribute('data-idx', idx);
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.innerHTML =
      '<div class="mon-boceto-num">Idea ' + (idx + 1) + '</div>' +
      '<div class="mon-boceto-titulo">' + (b.titular || b.titulo || '') + '</div>' +
      '<div class="mon-boceto-row"><span class="mon-boceto-val">' + (b.boceto || b.concepto || '') + '</span></div>' +
      '<div class="mon-boceto-row"><span class="mon-boceto-campo">Gancho</span><span class="mon-boceto-val mon-boceto-gancho"><em>' + (b.gancho || '') + '</em></span></div>';
    card.addEventListener('click', function () { seleccionarBoceto(idx); });
    card.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') seleccionarBoceto(idx); });
    grid.appendChild(card);
  });
  _monBosetoSeleccionado = null;
  var paso2 = document.getElementById('mon-paso2-wrap');
  if (paso2) paso2.hidden = true;
}

function seleccionarBoceto(idx) {
  _monBosetoSeleccionado = idx;
  var cards = document.querySelectorAll('#mon-bocetos-grid .mon-boceto-card');
  cards.forEach(function (c, i) {
    c.classList.toggle('selected', i === idx);
    c.classList.toggle('dimmed', i !== idx);
  });
  var paso2 = document.getElementById('mon-paso2-wrap');
  if (paso2) paso2.hidden = false;
}

function monLimpiarErrorCampo(fgId, errId) {
  var fg = document.getElementById(fgId);
  var err = document.getElementById(errId);
  if (fg) fg.classList.remove('campo-error');
  if (err) err.hidden = true;
  var alertEl = document.getElementById('mon-crear-alert');
  if (alertEl) alertEl.hidden = true;
}

function monRegistrarListenerLimpiar(inputId, fgId, errId) {
  var el = document.getElementById(inputId);
  if (!el) return;
  el.addEventListener('input', function () { monLimpiarErrorCampo(fgId, errId); });
}

function monValidarCrearViral() {
  var macroEl        = document.getElementById('mon-crear-macro-nicho');
  var microEl        = document.getElementById('mon-crear-micro-nicho');
  var formatoEl      = document.getElementById('mon-crear-formato');
  var aspectoEl      = document.getElementById('mon-crear-relacion-aspecto');
  var ok = true;

  var campos = [
    { el: macroEl,   fgId: 'mon-fg-macro-nicho',       errId: 'mon-err-macro-nicho'       },
    { el: microEl,   fgId: 'mon-fg-micro-nicho',        errId: 'mon-err-micro-nicho'        },
    { el: formatoEl, fgId: 'mon-fg-formato',             errId: 'mon-err-formato'             },
    { el: aspectoEl, fgId: 'mon-fg-relacion-aspecto',   errId: 'mon-err-relacion-aspecto'   }
  ];

  campos.forEach(function (c) {
    var val = c.el ? c.el.value.trim() : '';
    var fg  = document.getElementById(c.fgId);
    var err = document.getElementById(c.errId);
    if (!val) {
      if (fg)  fg.classList.add('campo-error');
      if (err) err.hidden = false;
      ok = false;
    } else {
      if (fg)  fg.classList.remove('campo-error');
      if (err) err.hidden = true;
    }
  });

  var alertEl = document.getElementById('mon-crear-alert');
  if (alertEl) alertEl.hidden = ok;
  return ok;
}

var _monProcesandoViral = false;

function handleMonetizacionCrearViral() {
  // TODO: descuento de creditos en backend cuando haya auth real.
  if (_monProcesandoViral) return;
  if (!monValidarCrearViral()) return;

  _monProcesandoViral = true;

  var macroNicho       = (document.getElementById('mon-crear-macro-nicho') || {}).value || '';
  var microNicho       = (document.getElementById('mon-crear-micro-nicho') || {}).value || '';
  var formato          = (document.getElementById('mon-crear-formato') || {}).value || '';
  var relacionDeAspecto = (document.getElementById('mon-crear-relacion-aspecto') || {}).value || '9:16';
  var idea             = (document.getElementById('mon-crear-idea') || {}).value || '';
  var duracion         = _monDuracionSeleccionada;

  var loadingEl   = document.getElementById('mon-crear-loading');
  var loadingMsg  = document.getElementById('mon-loading-text');
  var bocetosWrap = document.getElementById('mon-bocetos-wrap');
  var btn         = document.getElementById('mon-btn-crear-viral');
  var btnTextoOrig = btn ? btn.textContent : '';

  if (bocetosWrap) bocetosWrap.hidden = true;
  if (btn) { btn.disabled = true; btn.textContent = 'Procesando...'; btn.classList.add('btn-procesando'); }
  if (loadingMsg) loadingMsg.textContent = 'Buscando tendencias reales... esto puede tardar unos segundos';
  if (loadingEl) loadingEl.hidden = false;

  _motorFetch(MOTOR_URL + '/api/monetizacion/tendencias', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ macroNicho: macroNicho, microNicho: microNicho, duracion: duracion, formato: formato, relacionDeAspecto: relacionDeAspecto, idea: idea })
  })
    .then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (errData) {
          throw new Error(errData.error || 'Error del servidor (' + res.status + ')');
        });
      }
      return res.json();
    })
    .then(function (data) {
      if (data.creditos_restantes != null) _actualizarCreditosUI(data.creditos_restantes);
      if (!data.bocetos || !data.bocetos.length) throw new Error('Sin bocetos en la respuesta');
      renderMonBocetos(data.bocetos);
      if (bocetosWrap) bocetosWrap.hidden = false;
    })
    .catch(function (err) {
      var alertEl = document.getElementById('mon-crear-alert');
      if (err.sinCreditos) {
        _mostrarSinCreditos(alertEl, err);
      } else if (alertEl) {
        alertEl.textContent = 'No se pudo conectar con el motor. Verifica que el servidor este corriendo.';
        alertEl.hidden = false;
      }
      console.error('[EcommerceAgent] Error al buscar tendencias:', err.message);
    })
    .finally(function () {
      _monProcesandoViral = false;
      if (loadingEl) loadingEl.hidden = true;
      if (btn) { btn.disabled = false; btn.textContent = btnTextoOrig; btn.classList.remove('btn-procesando'); }
    });
}

var _monProcesandoPaso2 = false;

function handleMonetizacionPaso2() {
  if (_monProcesandoPaso2) return;
  if (_monBosetoSeleccionado === null || !_monBocetosActuales) return;

  var boceto = _monBocetosActuales[_monBosetoSeleccionado];
  if (!boceto) return;

  _monProcesandoPaso2 = true;

  var duracion          = _monDuracionSeleccionada || 30;
  var formato           = (document.getElementById('mon-crear-formato') || {}).value || 'tiktok';
  var relacionDeAspecto = (document.getElementById('mon-crear-relacion-aspecto') || {}).value || '9:16';
  var numeroEscenas     = Math.round(duracion / 6);

  var loadingEl  = document.getElementById('mon-crear-loading');
  var loadingMsg = document.getElementById('mon-loading-text');
  var paso2btn   = document.getElementById('mon-btn-paso2');
  var btnTextoOrig = paso2btn ? paso2btn.textContent : '';
  var resultWrap = document.getElementById('mon-desarrollo-result');

  if (resultWrap) resultWrap.remove();
  if (paso2btn) { paso2btn.disabled = true; paso2btn.textContent = 'Generando...'; paso2btn.classList.add('btn-procesando'); }
  if (loadingMsg) loadingMsg.textContent = 'Desarrollando tu video... esto puede tardar unos segundos';
  if (loadingEl)  loadingEl.hidden = false;

  _motorFetch(MOTOR_URL + '/api/monetizacion/desarrollar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      titular:           boceto.titular || boceto.titulo || '',
      boceto:            boceto.boceto  || boceto.concepto || '',
      gancho:            boceto.gancho  || '',
      formato:           formato,
      relacionDeAspecto: relacionDeAspecto,
      duracion:          duracion,
      numeroEscenas:     numeroEscenas
    })
  })
    .then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (errData) {
          throw new Error(errData.error || 'Error del servidor (' + res.status + ')');
        });
      }
      return res.json();
    })
    .then(function (data) {
      if (data.creditos_restantes != null) _actualizarCreditosUI(data.creditos_restantes);
      renderDesarrollo(data);
    })
    .catch(function (err) {
      var alertEl = document.getElementById('mon-crear-alert');
      if (err.sinCreditos) {
        _mostrarSinCreditos(alertEl, err);
      } else if (alertEl) {
        alertEl.textContent = 'No se pudo desarrollar el video. Verifica que el servidor este corriendo.';
        alertEl.hidden = false;
      }
      console.error('[EcommerceAgent] Error al desarrollar boceto:', err.message);
    })
    .finally(function () {
      _monProcesandoPaso2 = false;
      if (loadingEl) loadingEl.hidden = true;
      if (paso2btn)  { paso2btn.disabled = false; paso2btn.textContent = btnTextoOrig; paso2btn.classList.remove('btn-procesando'); }
    });
}

function _copiarTexto(texto, boton) {
  function exito() {
    if (boton) {
      var orig = boton.textContent;
      boton.textContent = 'Copiado';
      boton.disabled = true;
      setTimeout(function () { boton.textContent = orig; boton.disabled = false; }, 1500);
    }
  }
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(texto).then(exito).catch(function () { _copiarFallback(texto, exito); });
  } else {
    _copiarFallback(texto, exito);
  }
}

function _copiarFallback(texto, cb) {
  var ta = document.createElement('textarea');
  ta.value = texto;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  ta.style.top = '0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try { document.execCommand('copy'); if (cb) cb(); } catch (e) { alert('No se pudo copiar. Copia manualmente.'); }
  document.body.removeChild(ta);
}

// containerEl (opcional): si se pasa, renderiza DENTRO de ese elemento en vez de despues de mon-paso2-wrap.
// titulo (opcional): texto del encabezado del resultado.
function renderDesarrollo(data, containerEl, titulo) {
  var old = document.getElementById('mon-desarrollo-result');
  if (old) old.remove();

  var wrap = document.createElement('div');
  wrap.id = 'mon-desarrollo-result';
  wrap.style.cssText = 'margin-top:32px;font-family:Georgia,"Times New Roman",serif;color:#1a1a1a;';

  // ── DOM helpers ──────────────────────────────────────────────────────────────

  function crearBoton(texto) {
    var btn = document.createElement('button');
    btn.textContent = 'Copiar';
    btn.style.cssText = 'margin-top:12px;padding:7px 18px;background:transparent;border:1px solid #d4b98a;border-radius:4px;font-family:\'Syne\',sans-serif;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#8a6a2a;cursor:pointer;display:block;';
    btn.addEventListener('click', function () { _copiarTexto(texto, btn); });
    return btn;
  }

  function crearEtiqueta(texto) {
    var el = document.createElement('div');
    el.style.cssText = 'font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#888;margin-bottom:4px;font-family:\'Syne\',sans-serif;';
    el.textContent = texto;
    return el;
  }

  function crearParrafo(texto, estiloExtra) {
    var p = document.createElement('p');
    p.style.cssText = (estiloExtra || 'line-height:1.7;font-size:14px;') + 'margin:0;';
    p.textContent = texto;
    return p;
  }

  function crearBloque(texto, estiloParrafo) {
    var wrapper = document.createElement('div');
    wrapper.appendChild(crearParrafo(texto, estiloParrafo));
    wrapper.appendChild(crearBoton(texto));
    return wrapper;
  }

  function crearBloqueConEtiqueta(etiqueta, texto, estiloParrafo, estiloWrapper) {
    var wrapper = document.createElement('div');
    if (estiloWrapper) wrapper.style.cssText = estiloWrapper;
    wrapper.appendChild(crearEtiqueta(etiqueta));
    wrapper.appendChild(crearParrafo(texto, estiloParrafo));
    wrapper.appendChild(crearBoton(texto));
    return wrapper;
  }

  function crearSeccion(tituloTexto) {
    var sec = document.createElement('div');
    sec.style.cssText = 'background:#fff;border:1px solid #d4b98a;border-radius:6px;margin-bottom:20px;overflow:hidden;';
    var header = document.createElement('div');
    header.style.cssText = 'background:#f9f4ec;padding:12px 20px;border-bottom:1px solid #d4b98a;';
    var span = document.createElement('span');
    span.style.cssText = 'font-family:\'Syne\',sans-serif;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#8a6a2a;';
    span.textContent = tituloTexto;
    header.appendChild(span);
    var body = document.createElement('div');
    body.style.cssText = 'padding:20px;';
    sec.appendChild(header);
    sec.appendChild(body);
    sec._body = body;
    return sec;
  }

  // ── Titulo ───────────────────────────────────────────────────────────────────
  var tituloPrincipal = document.createElement('div');
  tituloPrincipal.style.cssText = 'font-family:\'Syne\',sans-serif;font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#8a6a2a;margin-bottom:20px;padding-bottom:10px;border-bottom:2px solid #d4b98a;';
  tituloPrincipal.textContent = titulo || 'Paso 2 — Video desarrollado';
  wrap.appendChild(tituloPrincipal);

  // ── GUION ────────────────────────────────────────────────────────────────────
  var secGuion = crearSeccion('Guion — Voz en off');
  secGuion._body.appendChild(crearBloque(data.guion || '', 'line-height:1.8;white-space:pre-wrap;font-size:15px;'));
  wrap.appendChild(secGuion);

  // ── MINIATURA ────────────────────────────────────────────────────────────────
  var minTexto = typeof data.miniatura === 'string' ? data.miniatura : (data.miniatura && data.miniatura.prompt) || '';
  var secMin = crearSeccion('Miniatura');
  secMin._body.appendChild(crearBloque(minTexto, 'line-height:1.7;font-size:14px;'));
  wrap.appendChild(secMin);

  // ── ESCENAS ──────────────────────────────────────────────────────────────────
  var escenas = Array.isArray(data.escenas) ? data.escenas : [];
  var secEsc = crearSeccion('Escenas (' + escenas.length + ')');
  escenas.forEach(function (esc) {
    var bloque = document.createElement('div');
    bloque.style.cssText = 'border-bottom:1px solid #ede8df;padding-bottom:16px;margin-bottom:16px;';

    var numEl = document.createElement('div');
    numEl.style.cssText = 'font-family:\'Syne\',sans-serif;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#8a6a2a;margin-bottom:10px;';
    numEl.textContent = 'Escena ' + esc.numero;
    bloque.appendChild(numEl);

    bloque.appendChild(crearBloqueConEtiqueta('Imagen', esc.prompt_imagen || '', 'line-height:1.7;font-size:13px;', 'margin-bottom:14px;'));
    bloque.appendChild(crearBloqueConEtiqueta('Animacion / Video', esc.prompt_video || '', 'line-height:1.7;font-size:13px;', ''));

    secEsc._body.appendChild(bloque);
  });
  wrap.appendChild(secEsc);

  // ── COPY ─────────────────────────────────────────────────────────────────────
  var secCopy = crearSeccion('Copy del post');
  secCopy._body.appendChild(crearBloque(data.copy || '', 'line-height:1.8;white-space:pre-wrap;font-size:14px;'));
  wrap.appendChild(secCopy);

  if (containerEl) {
    // Modular / uso alternativo: renderizar DENTRO del contenedor provisto
    containerEl.innerHTML = '';
    containerEl.appendChild(wrap);
  } else {
    // Uso original: insertar despues de mon-paso2-wrap
    var paso2wrap = document.getElementById('mon-paso2-wrap');
    if (!paso2wrap) return;
    paso2wrap.insertAdjacentElement('afterend', wrap);
  }
  wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// _esc definida más abajo con escape completo (& " ' < >)
const MONETIZACION_SUB_TAB_IDS = ['crear-viral', 'modular', 'editar'];
const MONETIZACION_MOTOR_MSG = 'Motor en conexion. Proximamente.';

function switchMonetizacionSubTab(subId) {
  MONETIZACION_SUB_TAB_IDS.forEach(function (id) {
    const panel = document.getElementById('mon-sub-' + id);
    const btn = document.getElementById('mon-subtab-btn-' + id);
    const active = id === subId;
    if (panel) {
      panel.classList.toggle('active', active);
      panel.hidden = !active;
    }
    if (btn) {
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    }
  });
}

function populateMonetizacionProductSelect(selectId, emptyId) {
  const select = document.getElementById(selectId);
  const emptyEl = document.getElementById(emptyId);
  const productos = getMisProductos();
  const hasProducts = productos.length > 0;

  if (select) {
    select.hidden = !hasProducts;
    select.innerHTML = '';
    if (hasProducts) {
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Selecciona un producto';
      placeholder.disabled = true;
      placeholder.selected = true;
      select.appendChild(placeholder);
      productos.forEach(function (p) {
        const opt = document.createElement('option');
        opt.value = p.slug;
        opt.textContent = p.nombre;
        select.appendChild(opt);
      });
    }
  }

  if (emptyEl) {
    emptyEl.hidden = hasProducts;
  }

  return hasProducts;
}

// ─── TAB AGENTS VENTAS ────────────────────────────────────────────
var EA_AGENTE_PRODUCTOS_KEY = 'ea_agente_productos';
var AV_MAX_PRODUCTOS = 10;
var _ventasTono       = 'cercano';
var _ventasEstrategia = 'consultiva';
var _ventasQrInterval = null;

// ── Pill selectors ─────────────────────────────────────────────────
function ventasSelTono(btn) {
  _ventasTono = btn.getAttribute('data-val') || 'cercano';
  document.querySelectorAll('#ventas-tono-pills .cont-tipo-pill').forEach(function (b) {
    b.classList.toggle('active', b === btn);
  });
}

function ventasSelEstrategia(btn) {
  _ventasEstrategia = btn.getAttribute('data-val') || 'consultiva';
  document.querySelectorAll('#ventas-estrategia-pills .cont-tipo-pill').forEach(function (b) {
    b.classList.toggle('active', b === btn);
  });
}

// ── WhatsApp status render ─────────────────────────────────────────
function _ventasRenderEstado(estado, qr) {
  var wrap     = document.getElementById('ventas-status-wrap');
  var badge    = document.getElementById('ventas-status-badge');
  var textEl   = document.getElementById('ventas-status-text');
  var qrArea   = document.getElementById('ventas-qr-area');
  var qrImg    = document.getElementById('ventas-qr-img');
  var connectBtn    = document.getElementById('ventas-wa-connect-btn');
  var disconnectBtn = document.getElementById('ventas-wa-disconnect-btn');

  if (wrap)  wrap.style.display = 'block';

  var labels = { conectado: 'WhatsApp conectado', esperando_qr: 'Esperando escaneo del QR', desconectado: 'Desconectado' };
  if (textEl) textEl.textContent = labels[estado] || estado;

  if (badge) {
    badge.className = 'av-status-badge av-status-badge--' +
      (estado === 'conectado' ? 'conectado' : estado === 'esperando_qr' ? 'esperando' : 'desconectado');
  }

  if (qrArea) qrArea.style.display = (estado === 'esperando_qr' && qr) ? 'flex' : 'none';
  if (qrImg && qr) qrImg.src = qr;

  if (connectBtn)    connectBtn.disabled    = (estado === 'conectado' || estado === 'esperando_qr');
  if (disconnectBtn) disconnectBtn.disabled = (estado === 'desconectado');
}

function _ventasStopPolling() {
  if (_ventasQrInterval) { clearInterval(_ventasQrInterval); _ventasQrInterval = null; }
}

function _ventasStartPolling() {
  _ventasStopPolling();
  _ventasQrInterval = setInterval(async function () {
    try {
    var r = await fetch(MOTOR_URL + '/api/ventas/qr');
    var d = await r.json();
        _ventasRenderEstado(d.estado, d.qr);
      if (d.estado === 'conectado') _ventasStopPolling();
    } catch (e) {}
  }, 3000);
}

async function ventasConectarWhatsApp() {
  var btn = document.getElementById('ventas-wa-connect-btn');
  var msg = document.getElementById('ventas-wa-msg');
  if (btn) btn.disabled = true;
  if (msg) { msg.textContent = 'Iniciando conexion...'; msg.className = 'av-result-msg'; }

  try {
    var r = await fetch(MOTOR_URL + '/api/ventas/conectar-whatsapp', { method: 'POST' });
    var d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Error al conectar');
    _ventasRenderEstado(d.estado, d.qr);
    if (msg) { msg.textContent = d.estado === 'conectado' ? 'Conectado correctamente.' : 'Escanea el QR con tu WhatsApp.'; msg.className = 'av-result-msg av-result-msg--ok'; }
    _ventasStartPolling();
  } catch (e) {
    if (btn) btn.disabled = false;
    if (msg) { msg.textContent = e.message || 'No se pudo conectar.'; msg.className = 'av-result-msg av-result-msg--err'; }
  }
}

async function ventasDesconectarWhatsApp() {
  var btn = document.getElementById('ventas-wa-disconnect-btn');
  var msg = document.getElementById('ventas-wa-msg');
  if (btn) btn.disabled = true;
  _ventasStopPolling();

  try {
    var r = await fetch(MOTOR_URL + '/api/ventas/desconectar-whatsapp', { method: 'POST' });
    var d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Error al desconectar');
    _ventasRenderEstado('desconectado', null);
    if (msg) { msg.textContent = 'WhatsApp desconectado.'; msg.className = 'av-result-msg av-result-msg--ok'; }
  } catch (e) {
    if (btn) btn.disabled = false;
    if (msg) { msg.textContent = e.message || 'Error al desconectar.'; msg.className = 'av-result-msg av-result-msg--err'; }
  }
}

// ── Telegram test ──────────────────────────────────────────────────
function tgToggleGuia() {
  var body    = document.getElementById('tg-guide-body');
  var icon    = document.getElementById('tg-guide-icon');
  var toggle  = document.getElementById('tg-guide-toggle');
  if (!body) return;
  var open = !body.hidden;
  body.hidden = open;
  if (icon)   icon.textContent  = open ? '+' : '\u2212';
  if (toggle) toggle.setAttribute('aria-expanded', String(!open));
}

async function ventasProbarTelegram() {
  var tokenEl  = document.getElementById('ventas-tg-token');
  var chatEl   = document.getElementById('ventas-tg-chatid');
  var btn      = document.getElementById('ventas-tg-test-btn');
  var msg      = document.getElementById('ventas-tg-msg');
  var token    = (tokenEl ? tokenEl.value.trim() : '');
  var chatId   = (chatEl  ? chatEl.value.trim()  : '');

  if (!token || !chatId) {
    if (msg) { msg.textContent = 'Completa el token y el Chat ID.'; msg.className = 'av-result-msg av-result-msg--err'; }
    return;
  }

  if (btn) btn.disabled = true;
  if (msg) { msg.textContent = 'Enviando mensaje de prueba...'; msg.className = 'av-result-msg'; }

  try {
    var r = await fetch(MOTOR_URL + '/api/ventas/probar-telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token, chatId: chatId })
    });
    var d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Error');
    if (msg) { msg.textContent = 'Mensaje enviado. Revisa tu Telegram.'; msg.className = 'av-result-msg av-result-msg--ok'; }
  } catch (e) {
    if (msg) { msg.textContent = e.message || 'No se pudo enviar.'; msg.className = 'av-result-msg av-result-msg--err'; }
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ── Save config ────────────────────────────────────────────────────
async function ventasGuardarConfig() {
  var btn          = document.getElementById('ventas-cfg-save-btn');
  var msg          = document.getElementById('ventas-cfg-msg');
  var nombre       = (document.getElementById('ventas-nombre')        || {}).value || '';
  var token        = (document.getElementById('ventas-tg-token')      || {}).value || '';
  var chatId       = (document.getElementById('ventas-tg-chatid')     || {}).value || '';
  var personalidad = (document.getElementById('ventas-personalidad')  || {}).value || '';
  var waContacto   = ((document.getElementById('ventas-wa-contacto')  || {}).value || '').trim();

  // Validate WhatsApp number if provided
  if (waContacto && !/^[+\d\s\-().]{6,20}$/.test(waContacto)) {
    if (msg) { msg.textContent = 'Numero de WhatsApp invalido. Usa formato: +57 300 1234567'; msg.className = 'av-result-msg av-result-msg--err'; }
    return;
  }

  if (btn) btn.disabled = true;
  if (msg) { msg.textContent = 'Guardando...'; msg.className = 'av-result-msg'; }

  try {
    // 1. Save agent config (nombre, tono, personalidad, telegram, etc.)
    var r = await fetch(MOTOR_URL + '/api/ventas/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre:        nombre.trim(),
        tono:          _ventasTono,
        estrategia:    _ventasEstrategia,
        personalidad:  personalidad.trim(),
        telegramToken: token.trim(),
        telegramChatId: chatId.trim()
      })
    });
    var d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Error al guardar configuracion del agente.');

    // 2. Save WhatsApp contact number to Supabase (for "Hablar con asesor" button)
    var uid = _getUsuarioId();
    if (uid) {
      var rWa = await fetch(MOTOR_IA_URL + '/api/usuario/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-usuario-id': uid },
        body: JSON.stringify({ whatsapp: waContacto })
      });
      var dWa = await rWa.json();
      if (dWa.ok) {
        currentAgent.whatsapp = dWa.whatsapp || '';
        try {
          var raw = sessionStorage.getItem(EA_SESION_KEY);
          if (raw) { var u = JSON.parse(raw); u.whatsapp = currentAgent.whatsapp; sessionStorage.setItem(EA_SESION_KEY, JSON.stringify(u)); }
        } catch (_) {}
      }
    }

    if (msg) { msg.textContent = 'Configuracion guardada.'; msg.className = 'av-result-msg av-result-msg--ok'; }
    setTimeout(function () { if (msg) msg.textContent = ''; }, 3500);
  } catch (e) {
    if (msg) { msg.textContent = e.message || 'Error al guardar.'; msg.className = 'av-result-msg av-result-msg--err'; }
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ── Save catalogue ─────────────────────────────────────────────────
// ── Catalogo de ventas (per-product links) ────────────────────────
// ── Catalogo de ventas — tabla fija de 10 filas ───────────────────
var CAT_FILAS = 10;

function _catSlug(nombre) {
  return (nombre || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Escapa todos los caracteres especiales HTML. Usar en CUALQUIER dato de Supabase
// que se inserte en innerHTML (texto, atributos, y valores de onclick con strings).
function _esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Build product <option> list from Mis Productos
function _catOpcionesProductos(selectedSlug) {
  var misProductos = getMisProductos();
  var opts = '<option value="">\u2014 Selecciona un producto \u2014</option>';
  misProductos.forEach(function (p) {
    var sel = (p.slug === selectedSlug) ? ' selected' : '';
    opts += '<option value="' + _esc(p.slug) + '"' + sel + '>' + _esc(p.nombre || '') + '</option>';
  });
  return opts;
}

// Render the 10 fixed rows, loading saved data if available
function catRenderLista() {
  var tbody   = document.getElementById('cat-tbody');
  var countEl = document.getElementById('av-prod-count');
  if (!tbody) return;

  // Collect existing saved data from DOM (to preserve values on re-render)
  // We use the saved catalog array loaded from backend, held in _catSavedData
  var rows = '';
  for (var i = 0; i < CAT_FILAS; i++) {
    var saved = (_catSavedData && _catSavedData[i]) ? _catSavedData[i] : null;
    var savedSlug = saved ? (saved._slug || '') : '';
    var savedLink = saved ? (saved.link || '') : '';
    rows += (
      '<tr class="cat-tr" data-row="' + i + '">' +
        '<td class="cat-td cat-td--prod">' +
          '<select class="cat-row-select" id="cat-sel-' + i + '" onchange="catActualizarContador()">' +
            _catOpcionesProductos(savedSlug) +
          '</select>' +
        '</td>' +
        '<td class="cat-td cat-td--link">' +
          '<input type="url" class="cat-row-link" id="cat-link-' + i + '"' +
            ' placeholder="https://tutienda.com/producto..."' +
            ' value="' + _esc(savedLink) + '"' +
            ' oninput="catActualizarContador()" />' +
        '</td>' +
        '<td class="cat-td cat-td--del">' +
          '<button type="button" class="cat-del-btn" onclick="catLimpiarFila(' + i + ')">Eliminar</button>' +
        '</td>' +
      '</tr>'
    );
  }
  tbody.innerHTML = rows;
  catActualizarContador();
}

// Saved data loaded from backend (array indexed 0-9)
var _catSavedData = null;

function catActualizarContador() {
  var count = 0;
  for (var i = 0; i < CAT_FILAS; i++) {
    var sel  = document.getElementById('cat-sel-' + i);
    var link = document.getElementById('cat-link-' + i);
    if (sel && link && sel.value && (link.value || '').trim()) count++;
  }
  var countEl = document.getElementById('av-prod-count');
  if (countEl) countEl.textContent = String(count);
}

function catLimpiarFila(idx) {
  var sel  = document.getElementById('cat-sel-'  + idx);
  var link = document.getElementById('cat-link-' + idx);
  if (sel)  sel.value  = '';
  if (link) link.value = '';
  catActualizarContador();
}

async function ventasGuardarCatalogo() {
  var btn = document.getElementById('ventas-cat-save-btn');
  var msg = document.getElementById('ventas-cat-msg');

  // Collect filled rows; validate incomplete ones
  var catalogo     = [];
  var incompletas  = [];
  var misProductos = getMisProductos();

  for (var i = 0; i < CAT_FILAS; i++) {
    var sel   = document.getElementById('cat-sel-'  + i);
    var linkEl = document.getElementById('cat-link-' + i);
    var slug  = sel  ? sel.value.trim()       : '';
    var link  = linkEl ? linkEl.value.trim()  : '';

    if (!slug && !link) continue;                         // empty row — skip
    if (slug && !link)  { incompletas.push('Fila ' + (i + 1) + ': falta el link'); continue; }
    if (!slug && link)  { incompletas.push('Fila ' + (i + 1) + ': falta el producto'); continue; }

    var prod = misProductos.find(function (p) { return p.slug === slug; });
    var nombre = prod ? (prod.nombre || slug) : slug;
    catalogo.push({
      producto:    nombre,
      nombre:      nombre,
      descripcion: prod ? (prod.descripcion || '') : '',
      precio:      prod ? (prod.precio      || '') : '',
      link:        link,
      _slug:       slug
    });
  }

  if (incompletas.length > 0) {
    if (msg) { msg.textContent = incompletas.join(' — '); msg.className = 'av-result-msg av-result-msg--err'; }
    return;
  }

  if (btn) btn.disabled = true;
  if (msg) { msg.textContent = 'Guardando catalogo...'; msg.className = 'av-result-msg'; }

  try {
    var r = await fetch(MOTOR_URL + '/api/ventas/config', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ catalogo: catalogo })
    });
    var d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Error');
    if (msg) { msg.textContent = 'Catalogo guardado (' + catalogo.length + ' producto' + (catalogo.length !== 1 ? 's' : '') + ').'; msg.className = 'av-result-msg av-result-msg--ok'; }
    setTimeout(function () { if (msg) msg.textContent = ''; }, 3500);
  } catch (e) {
    if (msg) { msg.textContent = e.message || 'Error al guardar.'; msg.className = 'av-result-msg av-result-msg--err'; }
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ── Load saved config into UI ──────────────────────────────────────
async function _ventasCargarConfigUI() {
  // Load WhatsApp connection state
  try {
    var rq = await fetch(MOTOR_URL + '/api/ventas/qr');
    if (rq.ok) {
      var dq = await rq.json();
      _ventasRenderEstado(dq.estado, dq.qr);
      if (dq.estado === 'esperando_qr') _ventasStartPolling();
    }
  } catch (e) {}

  // Load saved config and pre-fill fields
  try {
    var rc = await fetch(MOTOR_URL + '/api/ventas/config');
    if (!rc.ok) return;
    var cfg = await rc.json();

    var setVal = function (id, val) { var el = document.getElementById(id); if (el && val) el.value = val; };
    setVal('ventas-nombre',       cfg.nombre);
    setVal('ventas-tg-token',     cfg.telegramToken);
    setVal('ventas-tg-chatid',    cfg.telegramChatId);
    setVal('ventas-personalidad', cfg.personalidad);

    // Restore catalogue into fixed table rows
    if (Array.isArray(cfg.catalogo) && cfg.catalogo.length > 0) {
      var misProductos = getMisProductos();
      _catSavedData = cfg.catalogo.map(function (p) {
        var nombre = p.producto || p.nombre || '';
        var prod   = misProductos.find(function (mp) { return mp.nombre === nombre; });
        return {
          _slug: p._slug || (prod ? prod.slug : _catSlug(nombre)),
          link:  p.link || ''
        };
      });
    }
    catRenderLista();

    // Restore pill selections
    if (cfg.tono) {
      _ventasTono = cfg.tono;
      document.querySelectorAll('#ventas-tono-pills .cont-tipo-pill').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-val') === cfg.tono);
      });
    }
    if (cfg.estrategia) {
      _ventasEstrategia = cfg.estrategia;
      document.querySelectorAll('#ventas-estrategia-pills .cont-tipo-pill').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-val') === cfg.estrategia);
      });
    }
  } catch (e) {}

  // Pre-fill WhatsApp contact number from Supabase (via currentAgent loaded at login)
  var waEl = document.getElementById('ventas-wa-contacto');
  if (waEl && currentAgent.whatsapp) waEl.value = currentAgent.whatsapp;
}

function initAgentesVentasTab() {
  catRenderLista();
  _ventasCargarConfigUI();
}
// ─────────────────────────────────────────────────────────────────

// ─── TAB AGENTE ADS ───────────────────────────────────────────────
// TODO: el estado conectado/no conectado se lee del backend por usuario — nunca hardcodeado.
// TODO: conexion via OAuth de Facebook/Meta — el usuario inicia sesion y autoriza la app desde el backend.
// TODO: conexion TikTok via OAuth de TikTok for Business — mismo patron.
// TODO: el token de acceso se guarda ENCRIPTADO en backend (Supabase), NUNCA en frontend ni localStorage. Da acceso a pauta pagada, es sensible.
var adsFacebookConectado = false; // se sobreescribe con dato del backend
var adsTiktokConectado   = false; // se sobreescribe con dato del backend

function renderEstadoAds() {
  function pintarTarjeta(plataforma, conectado) {
    var statusEl = document.getElementById('ads-status-' + plataforma);
    var btnEl    = document.getElementById('ads-btn-' + plataforma);
    var cardEl   = document.getElementById('ads-card-' + plataforma);
    if (statusEl) {
      statusEl.textContent = conectado ? 'Conectado' : 'No conectado';
      statusEl.className   = 'ads-platform-status' + (conectado ? ' ads-status--connected' : '');
    }
    if (btnEl)  btnEl.textContent = conectado ? 'Desconectar' : ('Conectar ' + (plataforma === 'facebook' ? 'Facebook Ads' : 'TikTok Ads'));
    if (cardEl) cardEl.classList.toggle('ads-card--connected', conectado);
  }
  pintarTarjeta('facebook', adsFacebookConectado);
  pintarTarjeta('tiktok',   adsTiktokConectado);
}

function handleAdsConectar(plataforma) {
  // TODO: iniciar flujo OAuth real del backend — no pegar tokens en el frontend.
  var msgEl = document.getElementById('ads-msg');
  if (msgEl) {
    msgEl.textContent = 'Conexion en construccion. Proximamente.';
    msgEl.hidden = false;
    setTimeout(function () { msgEl.hidden = true; }, 3000);
  }
}
// ─────────────────────────────────────────────────────────────────

// ─── TAB CONTENIDO ────────────────────────────────────────────────
const CREDITO_CONTENIDO_ORGANICO = 5;
const CREDITO_ANUNCIO = 8;
const CONTENIDO_SUB_TAB_IDS = ['organico', 'anuncios'];

function switchContenidoSubTab(subId) {
  CONTENIDO_SUB_TAB_IDS.forEach(function (id) {
    var panel = document.getElementById('cont-sub-' + id);
    var btn = document.getElementById('cont-subtab-btn-' + id);
    var active = id === subId;
    if (panel) { panel.classList.toggle('active', active); panel.hidden = !active; }
    if (btn)   { btn.classList.toggle('active', active); btn.setAttribute('aria-selected', active ? 'true' : 'false'); }
  });
}

function populateContenidoProductSelect(selectId, emptyId) {
  var select  = document.getElementById(selectId);
  var emptyEl = document.getElementById(emptyId);
  var productos = getMisProductos();
  var hasProducts = productos.length > 0;
  if (select) {
    select.hidden = !hasProducts;
    select.innerHTML = '';
    if (hasProducts) {
      var ph = document.createElement('option');
      ph.value = ''; ph.textContent = 'Selecciona un producto'; ph.disabled = true; ph.selected = true;
      select.appendChild(ph);
      productos.forEach(function (p) {
        var opt = document.createElement('option');
        opt.value = p.slug; opt.textContent = p.nombre;
        select.appendChild(opt);
      });
    }
  }
  if (emptyEl) emptyEl.hidden = hasProducts;
  return hasProducts;
}

function refreshContenidoTab() {
  populateContenidoProductSelect('cont-org-producto',  'cont-org-producto-empty');
  populateContenidoProductSelect('cont-anun-producto', 'cont-anun-producto-empty');
}

// Tipo de contenido seleccionado (imagen/video) por sub-tab
var _contTipo     = { org: '', anun: '' };
// Enfoque seleccionado (emocional/controversia/viral) — default emocional
var _contEnfoque  = { org: 'emocional', anun: 'emocional' };
// Flags anti-doble-envio
var _contProcesando = { org: false, anun: false };
// Estados de pills para campos de tipo (imagen-formato, video-duracion/formato, avatar-duracion/formato)
var _contImagenFormato  = { org: '9:16', anun: '9:16' };
var _contVideoDuracion  = { org: '18',   anun: '18'   };
var _contVideoFormato   = { org: '9:16', anun: '9:16' };
var _contAvatarDuracion = { org: '10',   anun: '10'   };
var _contAvatarFormato  = { org: '9:16', anun: '9:16' };

function _contMostrarCampo(id, visible) {
  var el = document.getElementById(id);
  if (!el) return;
  if (visible) { el.removeAttribute('hidden'); el.style.display = ''; }
  else         { el.setAttribute('hidden', ''); el.style.display = 'none'; }
}

function selectContTipo(subtab, val) {
  _contTipo[subtab] = val;

  var prefix = 'cont-' + subtab;
  var pills = document.querySelectorAll('#' + prefix + '-fg-tipo .cont-tipo-pill');
  pills.forEach(function (p) { p.classList.toggle('active', p.dataset.val === val); });
  contLimpiarError(prefix + '-fg-tipo', prefix + '-err-tipo');

  var isImagen = (val === 'imagen');
  var isVideo  = (val === 'video');
  var isAvatar = (val === 'avatar');

  function toggle(id, show) {
    var el = document.getElementById(id);
    if (!el) return;
    el.hidden = !show;
    el.style.display = show ? '' : 'none';
  }

  // Primero oculta todos los grupos condicionales, luego muestra solo los del tipo actual
  toggle(prefix + '-grp-imagen',    isImagen);           // formato imagen: solo imagen
  toggle(prefix + '-grp-video',     isVideo);            // duracion+formato: solo video
  toggle(prefix + '-avatar-block',  isAvatar);           // fotos+duracion avatar: solo avatar
  toggle(prefix + '-grp-foto-prod', isImagen || isVideo); // foto prod opcional: imagen y video
}

function selectContEnfoque(subtab, val) {
  _contEnfoque[subtab] = val;
  var cont = document.getElementById('cont-' + subtab + '-enfoque-pills');
  if (cont) {
    cont.querySelectorAll('.cont-tipo-pill').forEach(function (p) {
      p.classList.toggle('active', p.dataset.val === val);
    });
  }
}

function selectContImagenFormato(subtab, val) {
  _contImagenFormato[subtab] = val;
  document.querySelectorAll('#cont-' + subtab + '-img-fmt-pills .cont-tipo-pill')
    .forEach(function(p) { p.classList.toggle('active', p.dataset.val === val); });
}
function selectContVideoDuracion(subtab, val) {
  _contVideoDuracion[subtab] = val;
  document.querySelectorAll('#cont-' + subtab + '-vid-dur-pills .cont-tipo-pill')
    .forEach(function(p) { p.classList.toggle('active', p.dataset.val === val); });
}
function selectContVideoFormato(subtab, val) {
  _contVideoFormato[subtab] = val;
  document.querySelectorAll('#cont-' + subtab + '-vid-fmt-pills .cont-tipo-pill')
    .forEach(function(p) { p.classList.toggle('active', p.dataset.val === val); });
}
function selectContAvatarDuracion(subtab, val) {
  _contAvatarDuracion[subtab] = val;
  document.querySelectorAll('#cont-' + subtab + '-av-dur-pills .cont-tipo-pill')
    .forEach(function(p) { p.classList.toggle('active', p.dataset.val === val); });
}
function selectContAvatarFormato(subtab, val) {
  _contAvatarFormato[subtab] = val;
  document.querySelectorAll('#cont-' + subtab + '-av-fmt-pills .cont-tipo-pill')
    .forEach(function(p) { p.classList.toggle('active', p.dataset.val === val); });
}

// TODO: enviar la imagen al backend en base64 para que Claude Vision la analice
// y mejore la descripcion/prompt del contenido. No guardar en frontend mas alla del preview.
function contImgPreview(subtab, input) {
  var previewWrap = document.getElementById('cont-' + subtab + '-img-preview');
  var thumb       = document.getElementById('cont-' + subtab + '-img-thumb');
  var labelText   = document.getElementById('cont-' + subtab + '-img-text');
  if (!input.files || !input.files[0]) return;
  var file = input.files[0];
  var reader = new FileReader();
  reader.onload = function (e) {
    if (thumb) thumb.src = e.target.result;
    if (previewWrap) previewWrap.hidden = false;
    if (labelText) labelText.textContent = file.name;
  };
  reader.readAsDataURL(file);
}

function contImgRemove(subtab) {
  var input       = document.getElementById('cont-' + subtab + '-img');
  var previewWrap = document.getElementById('cont-' + subtab + '-img-preview');
  var thumb       = document.getElementById('cont-' + subtab + '-img-thumb');
  var labelText   = document.getElementById('cont-' + subtab + '-img-text');
  if (input) input.value = '';
  if (thumb) thumb.src = '';
  if (previewWrap) previewWrap.hidden = true;
  if (labelText) labelText.textContent = 'Seleccionar imagen';
}

function contLimpiarError(fgId, errId) {
  var fg  = document.getElementById(fgId);
  var err = document.getElementById(errId);
  if (fg)  fg.classList.remove('campo-error');
  if (err) err.hidden = true;
}

function contValidarTipo(subtab, alertId) {
  var fgId  = 'cont-' + subtab + '-fg-tipo';
  var errId = 'cont-' + subtab + '-err-tipo';
  var fg    = document.getElementById(fgId);
  var err   = document.getElementById(errId);
  if (!_contTipo[subtab]) {
    if (fg)  fg.classList.add('campo-error');
    if (err) err.hidden = false;
    return false;
  }
  if (fg)  fg.classList.remove('campo-error');
  if (err) err.hidden = true;
  return true;
}

function contValidar(campos, alertId) {
  var ok = true;
  campos.forEach(function (c) {
    var el  = document.getElementById(c.elId);
    var fg  = document.getElementById(c.fgId);
    var err = document.getElementById(c.errId);
    var val = el ? el.value.trim() : '';
    if (!val) {
      if (fg)  fg.classList.add('campo-error');
      if (err) err.hidden = false;
      ok = false;
    } else {
      if (fg)  fg.classList.remove('campo-error');
      if (err) err.hidden = true;
    }
  });
  var alertEl = document.getElementById(alertId);
  if (alertEl) alertEl.hidden = ok;
  return ok;
}

// ── Render resultado organico ─────────────────────────────────────────────────
function renderContenidoOrganico(data, containerEl) {
  if (!containerEl) return;

  // Video: reutilizar renderDesarrollo (guion + miniatura + escenas + copy)
  if (data.guion) {
    renderDesarrollo(data, containerEl, 'Contenido organico — Video');
    return;
  }

  // Imagen: prompt de imagen + copy
  containerEl.innerHTML = '';
  var wrap = document.createElement('div');
  wrap.style.cssText = 'padding:20px;';

  function addBloque(titulo, texto) {
    if (!texto) return;
    var block = document.createElement('div');
    block.style.cssText = 'margin-bottom:22px;';

    var lbl = document.createElement('div');
    lbl.style.cssText = 'font-family:\'Syne\',sans-serif;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#8a6a2a;margin-bottom:10px;font-weight:600;';
    lbl.textContent = titulo;
    block.appendChild(lbl);

    var txt = document.createElement('p');
    txt.style.cssText = 'font-size:14px;line-height:1.8;white-space:pre-wrap;font-family:Georgia,"Times New Roman",serif;color:#1a1a1a;margin:0 0 10px;';
    txt.textContent = texto;
    block.appendChild(txt);

    var btn = document.createElement('button');
    btn.textContent = 'Copiar';
    btn.style.cssText = 'padding:7px 18px;background:transparent;border:1px solid #d4b98a;border-radius:4px;font-family:\'Syne\',sans-serif;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#8a6a2a;cursor:pointer;';
    (function (t, b) { b.addEventListener('click', function () { _copiarTexto(t, b); }); })(texto, btn);
    block.appendChild(btn);

    if (wrap.children.length > 0) {
      var sep = document.createElement('div');
      sep.style.cssText = 'border-top:1px solid rgba(212,185,138,0.3);margin-bottom:22px;';
      wrap.appendChild(sep);
    }
    wrap.appendChild(block);
  }

  addBloque('Prompt de imagen', data.prompt_imagen);
  addBloque('Copy para publicar', data.copy);

  containerEl.appendChild(wrap);
}

// ── Render resultado anuncio ──────────────────────────────────────────────────
function renderContenidoAnuncio(data, containerEl) {
  if (!containerEl) return;
  containerEl.innerHTML = '';
  var wrap = document.createElement('div');
  wrap.style.cssText = 'padding:20px;';

  function addBloque(titulo, texto) {
    if (!texto) return;
    var block = document.createElement('div');
    block.style.cssText = 'margin-bottom:22px;';

    var lbl = document.createElement('div');
    lbl.style.cssText = 'font-family:\'Syne\',sans-serif;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#8a6a2a;margin-bottom:10px;font-weight:600;';
    lbl.textContent = titulo;
    block.appendChild(lbl);

    var txt = document.createElement('p');
    txt.style.cssText = 'font-size:14px;line-height:1.8;white-space:pre-wrap;font-family:Georgia,"Times New Roman",serif;color:#1a1a1a;margin:0 0 10px;';
    txt.textContent = texto;
    block.appendChild(txt);

    var btn = document.createElement('button');
    btn.textContent = 'Copiar';
    btn.style.cssText = 'padding:7px 18px;background:transparent;border:1px solid #d4b98a;border-radius:4px;font-family:\'Syne\',sans-serif;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#8a6a2a;cursor:pointer;';
    (function (t, b) { b.addEventListener('click', function () { _copiarTexto(t, b); }); })(texto, btn);
    block.appendChild(btn);

    if (wrap.children.length > 0) {
      var sep = document.createElement('div');
      sep.style.cssText = 'border-top:1px solid rgba(212,185,138,0.3);margin-bottom:22px;';
      wrap.appendChild(sep);
    }
    wrap.appendChild(block);
  }

  addBloque('Titular', data.titular);
  addBloque('Cuerpo del anuncio', data.cuerpo);
  addBloque('Llamado a la accion', data.llamado_accion);
  addBloque('Copy para publicar', data.copy);

  containerEl.appendChild(wrap);
}

// ── Handler: Contenido Organico ───────────────────────────────────────────────
function handleContenidoOrganico() {
  if (_contTipo.org === 'avatar') { handleContenidoAvatar('org'); return; }
  if (_contProcesando.org) return;

  var tipoOk   = contValidarTipo('org', 'cont-org-alert');
  var camposOk = contValidar([
    { elId: 'cont-org-producto', fgId: 'cont-org-fg-producto', errId: 'cont-org-err-producto' },
    { elId: 'cont-org-red',      fgId: 'cont-org-fg-red',      errId: 'cont-org-err-red' }
  ], 'cont-org-alert');

  if (!tipoOk || !camposOk) {
    var alertEl = document.getElementById('cont-org-alert');
    if (alertEl) alertEl.hidden = false;
    return;
  }

  _contProcesando.org = true;

  var btn          = document.getElementById('cont-btn-organico');
  var btnTextoOrig = btn ? btn.textContent : '';
  var alertEl      = document.getElementById('cont-org-alert');
  var resultEl     = document.getElementById('cont-org-result');

  if (btn) { btn.disabled = true; btn.textContent = 'Verificando creditos...'; btn.classList.add('btn-procesando'); }
  if (alertEl) { alertEl.hidden = true; }

  var productoSelect = document.getElementById('cont-org-producto');
  var productoNombre = (productoSelect && productoSelect.value && productoSelect.selectedIndex >= 0)
    ? productoSelect.options[productoSelect.selectedIndex].text : '';

  var tipoOrg  = _contTipo.org || 'imagen';

  if (btn) btn.textContent = 'Generando...';
  if (resultEl) resultEl.innerHTML = '<p class="mon-result-placeholder" style="font-style:italic;color:#888;">Analizando producto y generando contenido... puede tardar unos segundos.</p>';
  var formDataOrg = new FormData();
  formDataOrg.append('producto',      productoNombre);
  formDataOrg.append('tipoContenido', tipoOrg);
  formDataOrg.append('redSocial',     document.getElementById('cont-org-red')  ? document.getElementById('cont-org-red').value  : '');
  formDataOrg.append('tono',          document.getElementById('cont-org-tono') ? document.getElementById('cont-org-tono').value : '');
  formDataOrg.append('idea',          document.getElementById('cont-org-idea') ? document.getElementById('cont-org-idea').value : '');
  formDataOrg.append('enfoque',       _contEnfoque.org || 'emocional');
  if (tipoOrg === 'video') {
    formDataOrg.append('duracion',          _contVideoDuracion.org || '18');
    formDataOrg.append('relacionDeAspecto', _contVideoFormato.org  || '9:16');
    formDataOrg.append('relacionImagen',    _contVideoFormato.org  || '9:16');
  } else if (tipoOrg === 'imagen') {
    var imgFmt = _contImagenFormato.org || '9:16';
    formDataOrg.append('relacionImagen',    imgFmt);
    formDataOrg.append('relacionDeAspecto', imgFmt);
  }
  var imgInputOrg = document.getElementById('cont-org-img');
  if (imgInputOrg && imgInputOrg.files && imgInputOrg.files.length > 0) formDataOrg.append('imagen', imgInputOrg.files[0]);

  _motorFetch(MOTOR_URL + '/api/contenido/organico', { method: 'POST', body: formDataOrg })
    .then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (d) {
          throw new Error(d.error || 'Error del servidor (' + res.status + ')');
        });
      }
      return res.json();
    })
    .then(function (data) {
      if (!data.ok) throw new Error(data.error || 'Error al generar contenido.');
      if (data.creditos_restantes != null) _actualizarCreditosUI(data.creditos_restantes);
      renderContenidoOrganico(data, resultEl);
    })
    .catch(function (err) {
      if (err.sinCreditos) {
        _mostrarSinCreditos(alertEl, err);
        if (resultEl) resultEl.innerHTML = '';
      } else if (resultEl) {
        resultEl.innerHTML = '<p class="mon-result-placeholder" style="color:#c0392b;">Error: ' + err.message + '</p>';
      }
      console.error('[contenido/organico] Error:', err.message);
    })
    .finally(function () {
      _contProcesando.org = false;
      if (btn) { btn.disabled = false; btn.textContent = btnTextoOrig; btn.classList.remove('btn-procesando'); }
    });
}

// ── Handler: Contenido Anuncio ────────────────────────────────────────────────
function handleContenidoAnuncio() {
  if (_contTipo.anun === 'avatar') { handleContenidoAvatar('anun'); return; }
  if (_contProcesando.anun) return;

  var tipoOk   = contValidarTipo('anun', 'cont-anun-alert');
  var camposOk = contValidar([
    { elId: 'cont-anun-producto',   fgId: 'cont-anun-fg-producto',   errId: 'cont-anun-err-producto' },
    { elId: 'cont-anun-plataforma', fgId: 'cont-anun-fg-plataforma', errId: 'cont-anun-err-plataforma' }
  ], 'cont-anun-alert');

  if (!tipoOk || !camposOk) {
    var alertEl = document.getElementById('cont-anun-alert');
    if (alertEl) alertEl.hidden = false;
    return;
  }

  _contProcesando.anun = true;

  var btn          = document.getElementById('cont-btn-anuncio');
  var btnTextoOrig = btn ? btn.textContent : '';
  var alertEl      = document.getElementById('cont-anun-alert');
  var resultEl     = document.getElementById('cont-anun-result');

  if (btn) { btn.disabled = true; btn.textContent = 'Verificando creditos...'; btn.classList.add('btn-procesando'); }
  if (alertEl) { alertEl.hidden = true; }

  var productoSelect = document.getElementById('cont-anun-producto');
  var productoNombre = (productoSelect && productoSelect.value && productoSelect.selectedIndex >= 0)
    ? productoSelect.options[productoSelect.selectedIndex].text : '';
  var tipoAnun  = _contTipo.anun || 'imagen';

  if (btn) btn.textContent = 'Generando...';
  if (resultEl) resultEl.innerHTML = '<p class="mon-result-placeholder" style="font-style:italic;color:#888;">Analizando producto y generando anuncio... puede tardar unos segundos.</p>';
  var formDataAnun = new FormData();
  formDataAnun.append('producto',      productoNombre);
  formDataAnun.append('tipoContenido', tipoAnun);
  formDataAnun.append('plataforma',    document.getElementById('cont-anun-plataforma') ? document.getElementById('cont-anun-plataforma').value : '');
  formDataAnun.append('objetivo',      document.getElementById('cont-anun-objetivo')   ? document.getElementById('cont-anun-objetivo').value   : '');
  formDataAnun.append('idea',          document.getElementById('cont-anun-idea')       ? document.getElementById('cont-anun-idea').value       : '');
  formDataAnun.append('enfoque',       _contEnfoque.anun || 'emocional');
  if (tipoAnun === 'video') {
    formDataAnun.append('duracion',          _contVideoDuracion.anun || '18');
    formDataAnun.append('relacionDeAspecto', _contVideoFormato.anun  || '9:16');
    formDataAnun.append('relacionImagen',    _contVideoFormato.anun  || '9:16');
  } else if (tipoAnun === 'imagen') {
    var imgFmt2 = _contImagenFormato.anun || '9:16';
    formDataAnun.append('relacionImagen',    imgFmt2);
    formDataAnun.append('relacionDeAspecto', imgFmt2);
  }
  var imgInputAnun = document.getElementById('cont-anun-img');
  if (imgInputAnun && imgInputAnun.files && imgInputAnun.files.length > 0) formDataAnun.append('imagen', imgInputAnun.files[0]);

  _motorFetch(MOTOR_URL + '/api/contenido/anuncio', { method: 'POST', body: formDataAnun })
    .then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (d) {
          throw new Error(d.error || 'Error del servidor (' + res.status + ')');
        });
      }
      return res.json();
    })
    .then(function (data) {
      if (!data.ok) throw new Error(data.error || 'Error al generar anuncio.');
      if (data.creditos_restantes != null) _actualizarCreditosUI(data.creditos_restantes);
      renderContenidoAnuncio(data, resultEl);
    })
    .catch(function (err) {
      if (err.sinCreditos) {
        _mostrarSinCreditos(alertEl, err);
        if (resultEl) resultEl.innerHTML = '';
      } else if (resultEl) {
        resultEl.innerHTML = '<p class="mon-result-placeholder" style="color:#c0392b;">Error: ' + err.message + '</p>';
      }
      console.error('[contenido/anuncio] Error:', err.message);
    })
    .finally(function () {
      _contProcesando.anun = false;
      if (btn) { btn.disabled = false; btn.textContent = btnTextoOrig; btn.classList.remove('btn-procesando'); }
    });
}

// -- Avatar UGC helpers -------------------------------------------------------
function avatarFotoPreview(input, wrapId, thumbId, textId, labelId) {
  var wrap  = document.getElementById(wrapId);
  var thumb = document.getElementById(thumbId);
  var text  = document.getElementById(textId);
  var lbl   = labelId ? document.getElementById(labelId) : null;
  if (!input || !input.files || !input.files[0]) return;
  var file   = input.files[0];
  var reader = new FileReader();
  reader.onload = function (e) {
    if (thumb) thumb.src = e.target.result;
    if (wrap)  { wrap.hidden = false; wrap.style.display = ''; }
    if (text)  text.textContent = 'Foto cargada';
    if (lbl)   lbl.classList.add('loaded');
  };
  reader.readAsDataURL(file);
}

function avatarFotoRemove(inputId, wrapId, thumbId, textId, defaultText, labelId) {
  var input = document.getElementById(inputId);
  var wrap  = document.getElementById(wrapId);
  var thumb = document.getElementById(thumbId);
  var text  = document.getElementById(textId);
  var lbl   = labelId ? document.getElementById(labelId) : null;
  if (input) input.value = '';
  if (thumb) thumb.src = '';
  if (wrap)  { wrap.hidden = true; wrap.style.display = 'none'; }
  if (text)  text.textContent = defaultText || 'Seleccionar foto';
  if (lbl)   lbl.classList.remove('loaded');
}

// -- Handler: Contenido Avatar (UGC) ------------------------------------------
function handleContenidoAvatar(subtab) {
  if (_contProcesando[subtab]) return;

  var alertEl  = document.getElementById('cont-' + subtab + '-alert');
  var resultEl = document.getElementById('cont-' + subtab + '-result');
  var btn      = document.getElementById(subtab === 'org' ? 'cont-btn-organico' : 'cont-btn-anuncio');

  function mostrarError(msg) {
    if (alertEl) { alertEl.textContent = msg; alertEl.hidden = false; }
  }

  var productoSelect = document.getElementById('cont-' + subtab + '-producto');
  if (!productoSelect || !productoSelect.value) { mostrarError('Selecciona un producto.'); return; }
  var productoNombre = productoSelect.selectedIndex >= 0
    ? productoSelect.options[productoSelect.selectedIndex].text : '';

  var fotoAvatarEl = document.getElementById('cont-' + subtab + '-av-foto-avatar');
  var fotoProdEl   = document.getElementById('cont-' + subtab + '-av-foto-producto');
  if (!fotoAvatarEl || !fotoAvatarEl.files || fotoAvatarEl.files.length === 0) { mostrarError('Sube la foto del avatar.'); return; }
  if (!fotoProdEl   || !fotoProdEl.files   || fotoProdEl.files.length   === 0) { mostrarError('Sube la foto del producto.'); return; }

  var redSocialEl   = subtab === 'org'  ? document.getElementById('cont-org-red')        : null;
  var plataformaEl  = subtab === 'anun' ? document.getElementById('cont-anun-plataforma') : null;
  var redSocialVal  = redSocialEl  ? redSocialEl.value  : '';
  var plataformaVal = plataformaEl ? plataformaEl.value : '';
  if (subtab === 'org'  && !redSocialVal)  { mostrarError('Selecciona una red social.'); return; }
  if (subtab === 'anun' && !plataformaVal) { mostrarError('Selecciona una plataforma.'); return; }

  _contProcesando[subtab] = true;
  var btnTextoOrig = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Verificando creditos...'; btn.classList.add('btn-procesando'); }
  if (alertEl) { alertEl.hidden = true; }

  var ideaEl = document.getElementById('cont-' + subtab + '-idea');

  if (btn) btn.textContent = 'Generando...';
  if (resultEl) resultEl.innerHTML = '<p class="mon-result-placeholder" style="font-style:italic;color:#888;">Analizando fotos y generando video avatar UGC...</p>';
  var formDataAv = new FormData();
  formDataAv.append('fotoAvatar',        fotoAvatarEl.files[0]);
  formDataAv.append('fotoProducto',      fotoProdEl.files[0]);
  formDataAv.append('producto',          productoNombre);
  formDataAv.append('enfoque',           _contEnfoque[subtab] || 'emocional');
  formDataAv.append('duracion',          _contAvatarDuracion[subtab] || '10');
  formDataAv.append('relacionDeAspecto', _contAvatarFormato[subtab]  || '9:16');
  if (redSocialVal)  formDataAv.append('redSocial',  redSocialVal);
  if (plataformaVal) formDataAv.append('plataforma', plataformaVal);
  if (ideaEl && ideaEl.value.trim()) formDataAv.append('idea', ideaEl.value.trim());

  _motorFetch(MOTOR_URL + '/api/contenido/avatar', { method: 'POST', body: formDataAv })
    .then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (d) {
          throw new Error(d.error || 'Error del servidor (' + res.status + ')');
        });
      }
      return res.json();
    })
    .then(function (data) {
      if (!data.ok) throw new Error(data.error || 'Error al generar video avatar.');
      if (data.creditos_restantes != null) _actualizarCreditosUI(data.creditos_restantes);
      renderContenidoAvatar(data, resultEl);
    })
    .catch(function (err) {
      if (err.sinCreditos) {
        _mostrarSinCreditos(alertEl, err);
        if (resultEl) resultEl.innerHTML = '';
      } else if (resultEl) {
        resultEl.innerHTML = '<p class="mon-result-placeholder" style="color:#c0392b;">Error: ' + err.message + '</p>';
      }
      console.error('[contenido/avatar] Error:', err.message);
    })
    .finally(function () {
      _contProcesando[subtab] = false;
      if (btn) { btn.disabled = false; btn.textContent = btnTextoOrig; btn.classList.remove('btn-procesando'); }
    });
}

// -- Render: resultado de Video Avatar (UGC) -----------------------------------
function renderContenidoAvatar(data, containerEl) {
  if (!containerEl) return;
  containerEl.innerHTML = '';
  var wrap = document.createElement('div');
  wrap.style.cssText = 'padding:20px;';
  var estiloLbl = "font-family:'Syne',sans-serif;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#8a6a2a;margin-bottom:10px;font-weight:600;";
  var estiloTxt = "font-size:14px;line-height:1.8;white-space:pre-wrap;font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;margin:0 0 10px;";
  var estiloSep = 'border-top:1px solid rgba(212,185,138,0.3);margin-top:4px;margin-bottom:22px;';
  var estiloBtn = "padding:7px 18px;background:transparent;border:1px solid #d4b98a;border-radius:4px;font-family:'Syne',sans-serif;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#8a6a2a;cursor:pointer;";

  function addBloque(titulo, texto) {
    if (!texto) return;
    if (wrap.children.length > 0) { var sep = document.createElement('div'); sep.style.cssText = estiloSep; wrap.appendChild(sep); }
    var block = document.createElement('div'); block.style.cssText = 'margin-bottom:22px;';
    var lbl = document.createElement('div'); lbl.style.cssText = estiloLbl; lbl.textContent = titulo; block.appendChild(lbl);
    var txt = document.createElement('p'); txt.style.cssText = estiloTxt; txt.textContent = texto; block.appendChild(txt);
    var btn = document.createElement('button'); btn.textContent = 'Copiar'; btn.style.cssText = estiloBtn;
    (function (t, b) { b.addEventListener('click', function () { _copiarTexto(t, b); }); })(texto, btn);
    block.appendChild(btn); wrap.appendChild(block);
  }

  addBloque('Guion', data.guion);
  addBloque('Tono de voz', data.tono_voz);

  var escenas = Array.isArray(data.escenas) ? data.escenas : [];
  if (escenas.length > 0) {
    if (wrap.children.length > 0) { var sepEsc = document.createElement('div'); sepEsc.style.cssText = estiloSep; wrap.appendChild(sepEsc); }
    var escLbl = document.createElement('div'); escLbl.style.cssText = estiloLbl; escLbl.textContent = 'Escenas (' + escenas.length + ')'; wrap.appendChild(escLbl);
    escenas.forEach(function (esc) {
      var escBlock = document.createElement('div'); escBlock.style.cssText = 'border-left:2px solid #d4b98a;padding-left:14px;margin-bottom:22px;';

      var numEl = document.createElement('div'); numEl.style.cssText = "font-family:'Syne',sans-serif;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#8a6a2a;margin-bottom:10px;"; numEl.textContent = 'Escena ' + (esc.numero || ''); escBlock.appendChild(numEl);

      // Guion de la escena
      if (esc.guion_escena) {
        var guionLbl = document.createElement('div'); guionLbl.style.cssText = "font-family:'Syne',sans-serif;font-size:8px;letter-spacing:1.5px;text-transform:uppercase;color:#a08040;margin-bottom:4px;"; guionLbl.textContent = 'Voz en off'; escBlock.appendChild(guionLbl);
        var guionTxt = document.createElement('p'); guionTxt.style.cssText = "font-size:13px;line-height:1.7;font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;margin:0 0 8px;font-style:italic;"; guionTxt.textContent = esc.guion_escena; escBlock.appendChild(guionTxt);
        var guionBtn = document.createElement('button'); guionBtn.textContent = 'Copiar voz'; guionBtn.style.cssText = "padding:4px 12px;background:transparent;border:1px solid #d4b98a;border-radius:4px;font-family:'Syne',sans-serif;font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:#8a6a2a;cursor:pointer;margin-bottom:14px;";
        (function (t, b) { b.addEventListener('click', function () { _copiarTexto(t, b); }); })(esc.guion_escena, guionBtn);
        escBlock.appendChild(guionBtn);
      }

      // Prompt de animacion
      var animLbl = document.createElement('div'); animLbl.style.cssText = "font-family:'Syne',sans-serif;font-size:8px;letter-spacing:1.5px;text-transform:uppercase;color:#a08040;margin-bottom:4px;"; animLbl.textContent = 'Prompt de animacion (Grok)'; escBlock.appendChild(animLbl);
      var animTxt = document.createElement('p'); animTxt.style.cssText = "font-size:13px;line-height:1.7;white-space:pre-wrap;font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;margin:0 0 8px;"; animTxt.textContent = esc.prompt_animacion || ''; escBlock.appendChild(animTxt);
      var copyBtn = document.createElement('button'); copyBtn.textContent = 'Copiar prompt'; copyBtn.style.cssText = "padding:5px 14px;background:transparent;border:1px solid #d4b98a;border-radius:4px;font-family:'Syne',sans-serif;font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:#8a6a2a;cursor:pointer;";
      (function (t, b) { b.addEventListener('click', function () { _copiarTexto(t, b); }); })(esc.prompt_animacion || '', copyBtn);
      escBlock.appendChild(copyBtn); wrap.appendChild(escBlock);
    });
  }

  addBloque('Copy para publicar', data.copy);

  // Instruccion guia para el usuario (sin boton copiar)
  if (data.instruccion) {
    if (wrap.children.length > 0) {
      var sepIns = document.createElement('div');
      sepIns.style.cssText = 'border-top:1px solid rgba(212,185,138,0.3);margin-top:4px;margin-bottom:16px;';
      wrap.appendChild(sepIns);
    }
    var insBlock = document.createElement('div');
    insBlock.style.cssText = 'background:rgba(212,185,138,0.08);border:1px solid rgba(212,185,138,0.35);border-radius:6px;padding:14px 16px;';
    var insIcon = document.createElement('div');
    insIcon.style.cssText = "font-family:'Syne',sans-serif;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#8a6a2a;margin-bottom:8px;font-weight:600;";
    insIcon.textContent = 'Como usar estos prompts';
    insBlock.appendChild(insIcon);
    var insTxt = document.createElement('p');
    insTxt.style.cssText = "font-size:13px;line-height:1.7;font-family:Georgia,'Times New Roman',serif;color:#3a3a3a;margin:0;";
    insTxt.textContent = data.instruccion;
    insBlock.appendChild(insTxt);
    wrap.appendChild(insBlock);
  }

  containerEl.appendChild(wrap);
}

// ─────────────────────────────────────────────────────────────────

function refreshMonetizacionProductSelectors() {
  // Modular Video y Crear Video Viral son monetizacion de contenido, no usan producto.
  // (selector de producto removido de Modular Video)
}

function showMonetizacionMotorPending(resultId) {
  const el = document.getElementById(resultId);
  if (!el) return;
  el.innerHTML = '<p class="mon-result-motor-msg">' + MONETIZACION_MOTOR_MSG + '</p>';
}

function recargarCreditosMonetizacion() {
  // TODO: flujo de recarga de creditos via backend / pagos
  const notice = document.getElementById('mon-credits-notice');
  if (notice) {
    notice.textContent = MONETIZACION_MOTOR_MSG;
    notice.hidden = false;
  }
}

// handleMonetizacionCrearViral defined above

// ── Modular Video helpers ──────────────────────────────────────────────────────

function monModLimpiarError(fgId, errId) {
  var fg  = document.getElementById(fgId);
  var err = document.getElementById(errId);
  if (fg)  fg.classList.remove('campo-error');
  if (err) err.hidden = true;
  var alertEl = document.getElementById('mon-mod-alert');
  if (alertEl) alertEl.hidden = true;
}

function monModularActualizarBoton() {
  var sel   = document.getElementById('mon-mod-duracion');
  var btn   = document.getElementById('mon-btn-modular');
  if (!btn) return;
  var tramo = sel ? sel.value : 'corto';
  var costo = tramo === 'largo' ? CREDITO_MODULAR_LARGO : tramo === 'medio' ? CREDITO_MODULAR_MEDIO : CREDITO_MODULAR_CORTO;
  btn.textContent = 'Modular video (' + costo + ' creditos)';
}

function monModularVideoPreview(input) {
  var previewWrap = document.getElementById('mon-mod-video-preview');
  var filenameEl  = document.getElementById('mon-mod-filename');
  var uploadText  = document.getElementById('mon-mod-upload-text');
  if (input.files && input.files[0]) {
    var nombre = input.files[0].name;
    if (filenameEl) filenameEl.textContent = nombre;
    if (uploadText) uploadText.textContent = 'Video seleccionado';
    if (previewWrap) previewWrap.hidden = false;
    monModLimpiarError('mon-mod-fg-url', 'mon-mod-err-url');
  }
}

function monModularVideoRemove() {
  var input       = document.getElementById('mon-modular-video-file');
  var previewWrap = document.getElementById('mon-mod-video-preview');
  var filenameEl  = document.getElementById('mon-mod-filename');
  var uploadText  = document.getElementById('mon-mod-upload-text');
  if (input)       input.value = '';
  if (filenameEl)  filenameEl.textContent = '';
  if (uploadText)  uploadText.textContent = 'Seleccionar video';
  if (previewWrap) previewWrap.hidden = true;
}

function monValidarModular() {
  var urlEl    = document.getElementById('mon-modular-url');
  var fileEl   = document.getElementById('mon-modular-video-file');
  var macroEl  = document.getElementById('mon-mod-macro-nicho');
  var microEl  = document.getElementById('mon-mod-micro-nicho');
  var formatoEl = document.getElementById('mon-mod-formato');
  var aspectoEl = document.getElementById('mon-mod-relacion-aspecto');
  var ok = true;

  var tieneUrl    = urlEl && urlEl.value.trim().length > 0;
  var tieneArchivo = fileEl && fileEl.files && fileEl.files.length > 0;
  if (!tieneUrl && !tieneArchivo) {
    var fg  = document.getElementById('mon-mod-fg-url');
    var err = document.getElementById('mon-mod-err-url');
    if (fg)  fg.classList.add('campo-error');
    if (err) err.hidden = false;
    ok = false;
  }

  var textosCampos = [
    { el: macroEl,   fgId: 'mon-mod-fg-macro',   errId: 'mon-mod-err-macro'   },
    { el: microEl,   fgId: 'mon-mod-fg-micro',    errId: 'mon-mod-err-micro'   },
    { el: formatoEl, fgId: 'mon-mod-fg-formato',  errId: 'mon-mod-err-formato' },
    { el: aspectoEl, fgId: 'mon-mod-fg-aspecto',  errId: 'mon-mod-err-aspecto' }
  ];
  textosCampos.forEach(function (c) {
    var val = c.el ? c.el.value.trim() : '';
    var fg  = document.getElementById(c.fgId);
    var err = document.getElementById(c.errId);
    if (!val) {
      if (fg)  fg.classList.add('campo-error');
      if (err) err.hidden = false;
      ok = false;
    } else {
      if (fg)  fg.classList.remove('campo-error');
      if (err) err.hidden = true;
    }
  });

  var alertEl = document.getElementById('mon-mod-alert');
  if (alertEl) alertEl.hidden = ok;
  return ok;
}

var _monProcesandoModular = false;

function handleMonetizacionModularVideo() {
  if (_monProcesandoModular) return;
  if (!monValidarModular()) return;

  var fileEl = document.getElementById('mon-modular-video-file');
  var tieneArchivo = fileEl && fileEl.files && fileEl.files.length > 0;

  // Por ahora solo soportamos archivo subido; el link estara disponible en una proxima version
  if (!tieneArchivo) {
    var alertEl = document.getElementById('mon-mod-alert');
    if (alertEl) {
      alertEl.textContent = 'Por ahora sube el video descargado; el link estara disponible pronto.';
      alertEl.hidden = false;
    }
    return;
  }

  _monProcesandoModular = true;

  var btn          = document.getElementById('mon-btn-modular');
  var btnTextoOrig = btn ? btn.textContent : '';
  var alertEl      = document.getElementById('mon-mod-alert');
  var resultEl     = document.getElementById('mon-modular-result');

  if (btn) { btn.disabled = true; btn.textContent = 'Procesando...'; btn.classList.add('btn-procesando'); }
  if (alertEl) { alertEl.hidden = true; }
  if (resultEl) resultEl.innerHTML = '<p class="mon-result-placeholder" style="font-style:italic;color:#888;">Procesando el video... esto puede tardar un minuto.</p>';

  var macroNichoMod     = (document.getElementById('mon-mod-macro-nicho')        || {}).value || '';
  var microNichoMod     = (document.getElementById('mon-mod-micro-nicho')        || {}).value || '';
  var formatoMod        = (document.getElementById('mon-mod-formato')            || {}).value || '';
  var relacionAspectoMod= (document.getElementById('mon-mod-relacion-aspecto')   || {}).value || '9:16';
  var tramoDuracionMod  = (document.getElementById('mon-mod-duracion')           || {}).value || 'corto';
  var formDataMod = new FormData();
  formDataMod.append('video', fileEl.files[0]);
  formDataMod.append('macroNicho', macroNichoMod);
  formDataMod.append('microNicho', microNichoMod);
  formDataMod.append('formato', formatoMod);
  formDataMod.append('relacionDeAspecto', relacionAspectoMod);
  formDataMod.append('tramoDuracion', tramoDuracionMod);

  _motorFetch(MOTOR_URL + '/api/monetizacion/modular', { method: 'POST', body: formDataMod })
    .then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (errData) {
          throw new Error(errData.error || 'Error del servidor (' + res.status + ')');
        });
      }
      return res.json();
    })
    .then(function (data) {
      if (data.creditos_restantes != null) _actualizarCreditosUI(data.creditos_restantes);
      renderDesarrollo(data, resultEl, 'Video modular recreado');
    })
    .catch(function (err) {
      if (err.sinCreditos) {
        _mostrarSinCreditos(alertEl, err);
        if (resultEl) resultEl.innerHTML = '';
      } else if (resultEl) {
        resultEl.innerHTML = '<p class="mon-result-placeholder" style="color:#c0392b;">Error: ' + err.message + '</p>';
      }
      console.error('[EcommerceAgent] Error al modular video:', err.message);
    })
    .finally(function () {
      _monProcesandoModular = false;
      if (btn) { btn.disabled = false; btn.textContent = btnTextoOrig; btn.classList.remove('btn-procesando'); }
    });
}

// ── EDITOR DE VIDEO — Estado ──────────────────────────────────────────────────
var accionEditor              = 'split-vertical'; // 'split-vertical' | 'split-mitad'
var audioEditorSeleccionado   = 'original';
var redSocialEditor           = 'TikTok';
var posGif                    = 'bottomright';
var tamanoMemeReaccion        = '55';
var audioReaccionSeleccionado = 'principal';
var redSocialReaccion         = 'TikTok';
var _editorProcesando         = false;
var _reaccionProcesando       = false;

// Activa el pill con data-value=valor dentro del contenedor dado
function _activarPill(containerId, valor) {
  var cont = document.getElementById(containerId);
  if (!cont) return;
  cont.querySelectorAll('.editor-pill').forEach(function (btn) {
    btn.classList.toggle('active', btn.dataset.value === String(valor));
  });
}

// ── Selectores de estado ──────────────────────────────────────────────────────
var _tipoDescTextos = {
  'split-vertical': 'Dos videos apilados verticalmente, uno arriba y otro abajo. Formato 9:16.',
  'split-mitad':    'Dos videos lado a lado, cada uno vertical, dividiendo la pantalla por la mitad. Formato 9:16.'
};

function selTipoEdicion(val) {
  accionEditor = val;
  _activarPill('editor-pills-tipo', val);
  var descEl = document.getElementById('editor-tipo-desc');
  if (descEl) descEl.textContent = _tipoDescTextos[val] || '';
}

function selAudioEditor(val) {
  audioEditorSeleccionado = val;
  _activarPill('editor-pills-audio', val);
}

function selRedSocialEditor(val) {
  redSocialEditor = val;
  _activarPill('editor-pills-red', val);
}

function selPosReaccion(val) {
  posGif = val;
  _activarPill('reaccion-pills-pos', val);
}

function selTamanoReaccion(val) {
  tamanoMemeReaccion = val;
  _activarPill('reaccion-pills-tamano', val);
}

function selAudioReaccion(val) {
  audioReaccionSeleccionado = val;
  _activarPill('reaccion-pills-audio', val);
}

function selRedSocialReaccion(val) {
  redSocialReaccion = val;
  _activarPill('reaccion-pills-red', val);
}

// ── Helpers de file upload del editor ────────────────────────────────────────
function editorFilePreview(inputEl, textId, previewId, nameId) {
  var textEl    = document.getElementById(textId);
  var previewEl = document.getElementById(previewId);
  var nameEl    = document.getElementById(nameId);
  if (!inputEl.files || inputEl.files.length === 0) return;
  var fname = inputEl.files[0].name;
  if (textEl)    textEl.textContent    = fname;
  if (nameEl)    nameEl.textContent    = fname;
  if (previewEl) previewEl.hidden      = false;
}

function editorFileRemove(inputId, textId, previewId, nameId) {
  var inputEl   = document.getElementById(inputId);
  var textEl    = document.getElementById(textId);
  var previewEl = document.getElementById(previewId);
  var nameEl    = document.getElementById(nameId);
  if (inputEl)   inputEl.value         = '';
  if (textEl)    textEl.textContent    = textEl.dataset.placeholder || 'Subir archivo de video';
  if (nameEl)    nameEl.textContent    = '';
  if (previewEl) previewEl.hidden      = true;
}

// ── Renderizar resultado del editor (video + descarga) ───────────────────────
function renderEditorResultado(data, containerEl) {
  if (!containerEl) return;
  containerEl.innerHTML = '';

  var BASE = MOTOR_URL;
  var wrap = document.createElement('div');
  wrap.style.cssText = 'padding:20px;';

  function crearBlqueVideo(filename, etiqueta) {
    var block = document.createElement('div');
    block.className = 'editor-result-clip-block';

    if (etiqueta) {
      var lbl = document.createElement('div');
      lbl.className   = 'editor-result-clip-label';
      lbl.textContent = etiqueta;
      block.appendChild(lbl);
    }

    var video = document.createElement('video');
    video.src       = BASE + '/api/editor/preview/' + filename;
    video.controls  = true;
    video.className = 'editor-result-video';
    block.appendChild(video);

    var link = document.createElement('a');
    link.href       = BASE + '/api/editor/descargar/' + filename;
    link.textContent = etiqueta ? 'Descargar ' + etiqueta.toLowerCase() : 'Descargar video';
    link.className  = 'editor-download-btn';
    block.appendChild(link);

    return block;
  }

  if (data.clips && data.clips.length > 0) {
    data.clips.forEach(function (filename, i) {
      wrap.appendChild(crearBlqueVideo(filename, 'Clip ' + (i + 1)));
    });
  } else if (data.filename) {
    wrap.appendChild(crearBlqueVideo(data.filename, null));
  }

  // ── Copy generado por IA (solo si el backend lo devuelve) ────────────────
  if (data.copy) {
    var copySection = document.createElement('div');
    copySection.style.cssText = 'border-top:1px solid rgba(212,185,138,0.35);margin-top:20px;padding-top:20px;';

    var copyLabel = document.createElement('div');
    copyLabel.className   = 'editor-result-clip-label';
    copyLabel.textContent = 'Copy para tu publicacion';
    copySection.appendChild(copyLabel);

    var copyText = document.createElement('p');
    copyText.style.cssText = 'font-size:14px;line-height:1.75;white-space:pre-wrap;font-family:Georgia,"Times New Roman",serif;color:#1a1a1a;margin:0 0 14px;';
    copyText.textContent   = data.copy;
    copySection.appendChild(copyText);

    var copyBtn = document.createElement('button');
    copyBtn.textContent = 'Copiar';
    copyBtn.style.cssText = 'padding:7px 18px;background:transparent;border:1px solid #d4b98a;border-radius:4px;font-family:\'Syne\',sans-serif;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#8a6a2a;cursor:pointer;display:block;';
    (function (textoCopy, boton) {
      boton.addEventListener('click', function () { _copiarTexto(textoCopy, boton); });
    })(data.copy, copyBtn);
    copySection.appendChild(copyBtn);

    wrap.appendChild(copySection);
  }

  containerEl.appendChild(wrap);
}

// ── PROCESAR VIDEO EDITOR ─────────────────────────────────────────────────────
function procesarVideoEditor() {
  if (_editorProcesando) return;

  var urlEl    = document.getElementById('editor-url');
  var fileEl   = document.getElementById('editor-file');
  var url2El   = document.getElementById('editor-url2');
  var file2El  = document.getElementById('editor-file2');
  var alertEl  = document.getElementById('editor-alert');
  var resultEl = document.getElementById('editor-result');

  // Ambos modos siempre requieren dos videos
  var tieneVideo1 = (fileEl && fileEl.files && fileEl.files.length > 0) ||
                    (urlEl && urlEl.value.trim().length > 0);
  if (!tieneVideo1) {
    if (alertEl) { alertEl.textContent = 'Ingresa el video principal (link o archivo).'; alertEl.hidden = false; }
    return;
  }

  var tieneVideo2 = (file2El && file2El.files && file2El.files.length > 0) ||
                    (url2El && url2El.value.trim().length > 0);
  if (!tieneVideo2) {
    if (alertEl) { alertEl.textContent = 'Ingresa el segundo video (link o archivo).'; alertEl.hidden = false; }
    return;
  }

  _editorProcesando = true;

  var btn          = document.getElementById('editor-btn-procesar');
  var btnTextoOrig = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Procesando...'; btn.classList.add('btn-procesando'); }
  if (alertEl) { alertEl.hidden = true; }
  if (resultEl) resultEl.innerHTML = '<p class="mon-result-placeholder" style="font-style:italic;color:#888;">Procesando el video... puede tardar varios segundos.</p>';

  var formDataEd = new FormData();
  if (fileEl && fileEl.files && fileEl.files.length > 0) {
    formDataEd.append('video', fileEl.files[0]);
  } else {
    formDataEd.append('url', urlEl ? urlEl.value.trim() : '');
  }
  if (file2El && file2El.files && file2El.files.length > 0) {
    formDataEd.append('video2', file2El.files[0]);
  } else {
    formDataEd.append('url2', url2El ? url2El.value.trim() : '');
  }
  formDataEd.append('accion',       accionEditor);
  formDataEd.append('audio_opcion', audioEditorSeleccionado);
  formDataEd.append('redSocial',    redSocialEditor);

  _motorFetch(MOTOR_URL + '/api/editor/procesar-video', { method: 'POST', body: formDataEd })
    .then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (d) {
          throw new Error(d.error || 'Error del servidor (' + res.status + ')');
        });
      }
      return res.json();
    })
    .then(function (data) {
      if (!data.ok) throw new Error(data.error || 'Error al procesar el video.');
      if (data.creditos_restantes != null) _actualizarCreditosUI(data.creditos_restantes);
      renderEditorResultado(data, resultEl);
    })
    .catch(function (err) {
      if (err.sinCreditos) {
        _mostrarSinCreditos(alertEl, err);
        if (resultEl) resultEl.innerHTML = '';
      } else if (resultEl) {
        resultEl.innerHTML = '<p class="mon-result-placeholder" style="color:#c0392b;">Error: ' + err.message + '</p>';
      }
      console.error('[editor] Error procesando video:', err.message);
    })
    .finally(function () {
      _editorProcesando = false;
      if (btn) { btn.disabled = false; btn.textContent = btnTextoOrig; btn.classList.remove('btn-procesando'); }
    });
}

// ── PROCESAR REACCION ─────────────────────────────────────────────────────────
function procesarReaccionEditor() {
  if (_reaccionProcesando) return;

  var urlEl      = document.getElementById('reaccion-url');
  var gifUrlEl   = document.getElementById('reaccion-gif-url');
  var memeFileEl = document.getElementById('reaccion-meme-file');
  var alertEl    = document.getElementById('reaccion-alert');
  var resultEl   = document.getElementById('reaccion-result');

  // Validaciones
  if (!urlEl || !urlEl.value.trim()) {
    if (alertEl) { alertEl.textContent = 'Ingresa la URL del video principal.'; alertEl.hidden = false; }
    return;
  }

  var tieneMeme = (memeFileEl && memeFileEl.files && memeFileEl.files.length > 0) ||
                  (gifUrlEl && gifUrlEl.value.trim().length > 0);
  if (!tieneMeme) {
    if (alertEl) { alertEl.textContent = 'Ingresa el link o sube el archivo del meme/reaccion green screen.'; alertEl.hidden = false; }
    return;
  }

  _reaccionProcesando = true;

  var btn          = document.getElementById('reaccion-btn-procesar');
  var btnTextoOrig = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Procesando...'; btn.classList.add('btn-procesando'); }
  if (alertEl) { alertEl.hidden = true; }
  if (resultEl) resultEl.innerHTML = '<p class="mon-result-placeholder" style="font-style:italic;color:#888;">Procesando video reaccion... puede tardar un minuto.</p>';

  var formDataReac = new FormData();
  formDataReac.append('url',          urlEl.value.trim());
  formDataReac.append('posicion',     posGif);
  formDataReac.append('duracion',     '30');
  formDataReac.append('tamanoMeme',   tamanoMemeReaccion);
  formDataReac.append('audio_opcion', audioReaccionSeleccionado);
  formDataReac.append('redSocial',    redSocialReaccion);
  if (memeFileEl && memeFileEl.files && memeFileEl.files.length > 0) {
    formDataReac.append('reaccionMemeFile', memeFileEl.files[0]);
  } else {
    formDataReac.append('reaccionGifUrl', gifUrlEl ? gifUrlEl.value.trim() : '');
  }

  _motorFetch(MOTOR_URL + '/api/editor/procesar-reaccion', { method: 'POST', body: formDataReac })
    .then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (d) {
          throw new Error(d.error || 'Error del servidor (' + res.status + ')');
        });
      }
      return res.json();
    })
    .then(function (data) {
      if (!data.ok) throw new Error(data.error || 'Error al crear el video reaccion.');
      if (data.creditos_restantes != null) _actualizarCreditosUI(data.creditos_restantes);
      renderEditorResultado(data, resultEl);
    })
    .catch(function (err) {
      if (err.sinCreditos) {
        _mostrarSinCreditos(alertEl, err);
        if (resultEl) resultEl.innerHTML = '';
      } else if (resultEl) {
        resultEl.innerHTML = '<p class="mon-result-placeholder" style="color:#c0392b;">Error: ' + err.message + '</p>';
      }
      console.error('[editor] Error procesando reaccion:', err.message);
    })
    .finally(function () {
      _reaccionProcesando = false;
      if (btn) { btn.disabled = false; btn.textContent = btnTextoOrig; btn.classList.remove('btn-procesando'); }
    });
}

// Stub mantenido para compatibilidad (ya no hace nada visible)
function handleMonetizacionEditarVideo() {}

function refreshMonetizacionTab() {
  var balanceEl = document.getElementById('mon-credits-balance');
  if (balanceEl) balanceEl.textContent = String(currentAgent.creditos_ia || 0);
  refreshMonetizacionProductSelectors();
}

function initMonetizacionTab() {
  switchMonetizacionSubTab('crear-viral');
  refreshMonetizacionTab();
  initMonDuracionPills();
}

function initAgentDashboard() {
  const agentShell = document.getElementById('agent-dashboard-shell');
  const adminShell = document.getElementById('admin-dashboard-shell');
  if (agentShell) agentShell.hidden = false;
  if (adminShell) adminShell.hidden = true;
  _precargarMisProductos();   // carga slugs/links de Supabase para otros tabs
  _cargarCreditosReales();    // sincroniza saldo de créditos con Supabase
  renderAgentProductGrids();
  initMonetizacionTab();
  updateAgentCuentasPanel();
  updateWhatsAppUiForState('desconectado');
  switchAgentTab('catalogo');
}

function initAdminDashboard() {
  const agentShell = document.getElementById('agent-dashboard-shell');
  const adminShell = document.getElementById('admin-dashboard-shell');
  if (agentShell) agentShell.hidden = true;
  if (adminShell) adminShell.hidden = false;
  const sidebarName = document.getElementById('sidebar-name');
  const sidebarRole = document.getElementById('sidebar-role');
  const sidebarAvatar = document.getElementById('sidebar-avatar');
  if (sidebarName) sidebarName.textContent = currentAgent.name;
  if (sidebarRole) sidebarRole.textContent = 'Admin';
  if (sidebarAvatar) sidebarAvatar.textContent = initialsFromDisplayName(currentAgent.name);
  renderAdminCatalogGrid();
  const homeNav = document.getElementById('nav-home');
  switchView('view-home', homeNav || null);
}

// ══════════════════════════════════════════════════════
// LANDING — ARENA PARTICLES + PRODUCT CAROUSEL
// ══════════════════════════════════════════════════════

let _sandRafId    = null;
let _sandStarted  = false;

function initLandingSand() {
  if (_sandStarted) return;
  const canvas = document.getElementById('landing-sand');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Respect reduced-motion preference
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  _sandStarted = true;
  const isMobile = window.innerWidth < 768;
  const COUNT    = isMobile ? 55 : 130;

  const PALETTE = [
    [184, 147, 104],  // gold
    [199, 169, 128],  // light gold
    [162, 135,  96],  // muted bronze
    [210, 196, 172],  // warm cream
    [140, 110,  75],  // dark bronze
    [220, 205, 180],  // sand
  ];

  function resize() {
    canvas.width  = canvas.offsetWidth  || window.innerWidth;
    canvas.height = canvas.offsetHeight || window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize, { passive: true });

  const particles = Array.from({ length: COUNT }, () => {
    const col = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    return {
      x:      Math.random() * canvas.width,
      y:      Math.random() * canvas.height,
      r:      0.8 + Math.random() * 2.4,
      alpha:  0.10 + Math.random() * 0.22,   // raised: 0.10–0.32
      speed:  0.12 + Math.random() * 0.30,
      angle:  Math.random() * Math.PI * 2,
      wobble: (Math.random() - 0.5) * 0.007,
      col
    };
  });

  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of particles) {
      p.angle += p.wobble;
      p.x += Math.cos(p.angle) * p.speed;
      p.y += Math.sin(p.angle) * p.speed * 0.38;

      // Wrap at edges
      if (p.x < -4) p.x = canvas.width  + 4;
      else if (p.x > canvas.width  + 4) p.x = -4;
      if (p.y < -4) p.y = canvas.height + 4;
      else if (p.y > canvas.height + 4) p.y = -4;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${p.col[0]},${p.col[1]},${p.col[2]},${p.alpha})`;
      ctx.fill();
    }
    _sandRafId = requestAnimationFrame(tick);
  }

  tick();
}

function stopLandingSand() {
  if (_sandRafId) { cancelAnimationFrame(_sandRafId); _sandRafId = null; }
  _sandStarted = false;
}

function initHeroShowcase() {
  var track = document.getElementById('hps-h-track');
  if (!track) return;

  // Productos del hero visual — imágenes locales del proyecto
  var SHOWCASE = [
    { img: 'assets/img/products/smartwatch.jpg',                    name: 'Smartwatch',         badge: 'Verified Supplier' },
    { img: 'assets/img/products/headphones.jpg',                    name: 'Auriculares',        badge: 'USA Ready' },
    { img: 'assets/img/products/led-kit.jpg',                       name: 'LED Kit',            badge: 'Source and Sync' },
    { img: 'assets/img/products/rizador-nova.png',                  name: 'Rizador Nova',       badge: 'Verified Supplier' },
    { img: 'assets/img/products/airpods-pantalla.png',              name: 'Airpods Pro',        badge: 'USA Ready' },
    { img: 'assets/img/products/combo-bioaqua.png',                 name: 'Set Skincare',       badge: 'Verified Supplier' },
    { img: 'assets/img/products/humidificador-montana-led.png',     name: 'Humidificador LED',  badge: 'USA Ready' },
    { img: 'assets/img/products/cubiertos-24pcs.png',               name: 'Cubiertos 24pcs',   badge: 'Verified Supplier' },
  ];

  function card(p) {
    return '<div class="hps-h-card">'
      + '<img class="hps-h-img" src="' + p.img + '" alt="' + p.name + '" loading="lazy" decoding="async">'
      + '<div class="hps-h-label">'
      +   '<div class="hps-h-name">' + p.name + '</div>'
      +   '<div class="hps-h-sub">'  + p.badge + '</div>'
      + '</div>'
      + '</div>';
  }

  // Duplicar para loop infinito derecha → izquierda
  track.innerHTML = SHOWCASE.map(card).join('') + SHOWCASE.map(card).join('');
}

function initLandingCarousel() {
  const track = document.getElementById('lp-carousel-track');
  if (!track) return;

  const items = CATALOGO_PRODUCTOS
    .map(function(p) {
      return {
        img:  p.imagen || (p.imagenes && p.imagenes[0]) || '',
        name: (p.nombre || '').replace(/\s+/g, ' ').trim(),
        cat:  p.categoria || ''
      };
    })
    .filter(function(p) { return p.img; });

  if (!items.length) return;

  function card(p) {
    return '<div class="lp-card" role="listitem">'
      + '<div class="lp-card-img"><img src="' + p.img + '" alt="" loading="lazy" decoding="async"></div>'
      + '<div class="lp-card-info">'
      + '<p class="lp-card-name">' + p.name + '</p>'
      + '<p class="lp-card-cat">' + p.cat + '</p>'
      + '</div></div>';
  }

  // Duplicate for seamless loop
  var html = items.map(card).join('') + items.map(card).join('');
  track.innerHTML = html;
  track.setAttribute('role', 'list');
}

let ariaCanvasLoopStarted = false;

function initAriaCanvas() {
  const canvas = document.getElementById('aria-canvas');
  if (!canvas || ariaCanvasLoopStarted) return;
  const ctx = canvas.getContext && canvas.getContext('2d');
  if (!ctx) return;
  ariaCanvasLoopStarted = true;
  const W = canvas.width;
  const H = canvas.height;
  const cx = W / 2;
  const cy = H / 2;
  let t = 0;

  const Rclip = W / 2;
  const sr = 13.5;
  const rShellMin = sr + 3.2;
  const rShellMax = Rclip - 3.5;
  const particleCount = 160;
  const dust = [];
  for (let i = 0; i < particleCount; i++) {
    const u = Math.random();
    const v = Math.random();
    const theta = u * Math.PI * 2;
    const phi = Math.acos(2 * v - 1);
    const r0 = rShellMin + Math.pow(Math.random(), 0.65) * (rShellMax - rShellMin);
    dust.push({
      theta: theta,
      phi: phi,
      r0: r0,
      seed: Math.random() * Math.PI * 4,
      hue: i % 3
    });
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, Rclip, 0, Math.PI * 2);
    ctx.clip();

    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Rclip);
    bg.addColorStop(0, '#0a0618');
    bg.addColorStop(0.5, '#040210');
    bg.addColorStop(1, '#010108');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Polvo holográfico: muchas partículas en capa esférica, ondas de profundidad (atrás → adelante)
    const rotY = t * 0.28;
    const cosR = Math.cos(rotY);
    const sinR = Math.sin(rotY);

    const projected = [];
    for (let i = 0; i < dust.length; i++) {
      const p = dust[i];
      const waveR =
        1 +
        0.11 * Math.sin(t * 2.4 + p.seed + p.phi * 2.5) +
        0.07 * Math.sin(t * 1.6 - p.theta * 3 + p.seed);
      const r = p.r0 * waveR;

      const x = r * Math.sin(p.phi) * Math.cos(p.theta);
      const y = r * Math.sin(p.phi) * Math.sin(p.theta);
      const z = r * Math.cos(p.phi);

      const xr = x * cosR + z * sinR;
      const yr = y;
      const zr = -x * sinR + z * cosR;

      const zFlow = Math.sin(t * 2.1 + p.seed * 1.3 + p.theta * 0.5) * 1.8;
      const zf = zr + zFlow * 0.35;

      const depthNorm = (zf + rShellMax) / (2 * rShellMax);
      const tw = 0.45 + 0.55 * Math.sin(t * 3.5 + p.seed);
      let alpha = 0.08 + depthNorm * 0.62 * tw;
      alpha *= 0.65 + 0.35 * Math.sin(t * 1.4 + p.phi * 4);

      const size = 0.85 + depthNorm * 1.35 + Math.sin(t * 5 + i) * 0.25;

      projected.push({
        sx: cx + xr,
        sy: cy + yr * 0.94,
        z: zf,
        a: Math.min(0.92, Math.max(0.04, alpha)),
        s: size,
        hue: p.hue
      });
    }

    projected.sort(function (a, b) {
      return a.z - b.z;
    });

    const dustBehind = [];
    const dustFront = [];
    for (let i = 0; i < projected.length; i++) {
      if (projected[i].z < 0.35) dustBehind.push(projected[i]);
      else dustFront.push(projected[i]);
    }
    dustBehind.sort(function (a, b) {
      return a.z - b.z;
    });

    function drawDustBatch(arr) {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < arr.length; i++) {
        const q = arr[i];
        let col;
        if (q.hue === 0) {
          col = 'rgba(201,168,76,' + q.a + ')';
        } else if (q.hue === 1) {
          col = 'rgba(255,120,175,' + q.a + ')';
        } else {
          col = 'rgba(165,140,255,' + q.a + ')';
        }
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(q.sx, q.sy, q.s * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    drawDustBatch(dustBehind);

    const centerGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, sr + 10);
    centerGlow.addColorStop(0, 'rgba(175, 160, 255, 0.25)');
    centerGlow.addColorStop(0.55, 'rgba(90, 70, 180, 0.08)');
    centerGlow.addColorStop(1, 'rgba(40, 30, 90, 0)');
    ctx.fillStyle = centerGlow;
    ctx.beginPath();
    ctx.arc(cx, cy, sr + 10, 0, Math.PI * 2);
    ctx.fill();

    const sphereBg = ctx.createRadialGradient(cx - 3, cy - 3, 0, cx, cy, sr);
    sphereBg.addColorStop(0, '#ece8ff');
    sphereBg.addColorStop(0.25, '#a898f0');
    sphereBg.addColorStop(0.65, '#5c46c8');
    sphereBg.addColorStop(1, '#1e1448');
    ctx.fillStyle = sphereBg;
    ctx.beginPath();
    ctx.arc(cx, cy, sr, 0, Math.PI * 2);
    ctx.fill();

    // Solo el núcleo: esfera sólida + malla (el polvo va por fuera)
    const rotMesh = t * 0.35;
    function sph(lat, lon, rad) {
      const cl = Math.cos(lat);
      const x = rad * cl * Math.cos(lon);
      const y = rad * Math.sin(lat);
      const z = rad * cl * Math.sin(lon);
      const xr = x * Math.cos(rotMesh) + z * Math.sin(rotMesh);
      const zr = -x * Math.sin(rotMesh) + z * Math.cos(rotMesh);
      const depth = (zr / rad + 1) * 0.5;
      return { sx: cx + xr, sy: cy + y * 0.96, d: depth };
    }

    const latN = 7;
    const lonN = 12;
    ctx.lineWidth = 0.42;
    for (let i = 0; i < latN; i++) {
      const lat0 = -Math.PI / 2 + (i / latN) * Math.PI;
      const lat1 = -Math.PI / 2 + ((i + 1) / latN) * Math.PI;
      for (let j = 0; j < lonN; j++) {
        const lon0 = (j / lonN) * Math.PI * 2;
        const lon1 = ((j + 1) / lonN) * Math.PI * 2;
        const p00 = sph(lat0, lon0, sr);
        const p10 = sph(lat1, lon0, sr);
        const p11 = sph(lat1, lon1, sr);
        const p01 = sph(lat0, lon1, sr);
        const dm = (p00.d + p10.d + p11.d + p01.d) * 0.25;
        const alpha = 0.25 + dm * 0.45;
        ctx.strokeStyle = 'rgba(235, 232, 255, ' + alpha + ')';
        ctx.beginPath();
        ctx.moveTo(p00.sx, p00.sy);
        ctx.lineTo(p10.sx, p10.sy);
        ctx.lineTo(p11.sx, p11.sy);
        ctx.lineTo(p01.sx, p01.sy);
        ctx.closePath();
        ctx.stroke();
      }
    }

    const shine = ctx.createRadialGradient(cx - 3.5, cy - 4, 0, cx - 3, cy - 3, sr * 0.75);
    shine.addColorStop(0, 'rgba(255,255,255,0.55)');
    shine.addColorStop(0.35, 'rgba(255,255,255,0.08)');
    shine.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = shine;
    ctx.beginPath();
    ctx.arc(cx, cy, sr, 0, Math.PI * 2);
    ctx.fill();

    dustFront.sort(function (a, b) {
      return a.z - b.z;
    });
    drawDustBatch(dustFront);

    ctx.strokeStyle = 'rgba(123,97,255,0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, Rclip - 1.5, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
    t += 0.018;
    requestAnimationFrame(draw);
  }

  draw();
}

function goToDashboard(role) {
  const isAdmin = role === 'admin';
  const regPage = document.getElementById('page-register');
  const regNameEl = document.getElementById('register-name');

  if (!isAdmin && regPage && regPage.classList.contains('active') && regNameEl) {
    if (!regNameEl.checkValidity()) {
      regNameEl.reportValidity();
      return;
    }
  }

  let displayName = resolveDisplayName(isAdmin);
  if (!displayName) displayName = isAdmin ? 'Administrador' : 'Agente';

  currentAgent.role = role;
  currentAgent.name = displayName;
  currentAgent.refCode = isAdmin ? 'ADMIN' : 'AGENTE01';

  if (isAdmin) {
    currentAgent.pixelId = '';
  } else {
    let pixelId = '';
    const regPageActive = regPage && regPage.classList.contains('active');
    const regPixelEl = document.getElementById('register-pixel');
    if (regPageActive && regPixelEl) {
      pixelId = regPixelEl.value.trim();
    } else {
      try {
        pixelId = sessionStorage.getItem(EA_PIXEL_ID_KEY) || '';
      } catch (e) {}
    }
    currentAgent.pixelId = pixelId;
    try {
      if (pixelId) {
        sessionStorage.setItem(EA_PIXEL_ID_KEY, pixelId);
      } else {
        sessionStorage.removeItem(EA_PIXEL_ID_KEY);
      }
    } catch (e) {}
  }

  try {
    sessionStorage.setItem(EA_DISPLAY_NAME_KEY, displayName);
  } catch (e) {}

  showPage('page-dashboard');

  if (isAdmin) {
    initAdminDashboard();
  } else {
    setWelcomeHeading(displayName);
    initAgentDashboard();
  }
}

function updateSidebarPixelRow() {
  const row = document.getElementById('sidebar-pixel-row');
  const ok = document.getElementById('sidebar-pixel-ok');
  const miss = document.getElementById('sidebar-pixel-missing');
  if (!row || !ok || !miss) return;

  if (currentAgent.role === 'admin') {
    row.hidden = true;
    ok.hidden = true;
    miss.hidden = true;
    return;
  }

  row.hidden = false;
  const hasPixel = !!(currentAgent.pixelId && String(currentAgent.pixelId).trim());
  if (hasPixel) {
    ok.hidden = false;
    miss.hidden = true;
  } else {
    ok.hidden = true;
    miss.hidden = false;
  }
}

function goToAddPixel() {
  showPage('page-register');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const el = document.getElementById('register-pixel');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.focus();
      }
    });
  });
}

function openAria() {
  const overlay = document.getElementById('agent-aria-overlay');
  if (overlay) {
    openAgentAria();
    return;
  }
  document.querySelectorAll('.dash-view').forEach(function (v) {
    v.classList.remove('active');
  });
  const viewAria = document.getElementById('view-aria');
  if (viewAria) viewAria.classList.add('active');
  const tb = document.getElementById('dashboard-topbar');
  if (tb) tb.hidden = true;
  const main = document.getElementById('dashboard-main');
  if (main) main.classList.add('dashboard-main--aria');
  const titleEl = document.getElementById('topbar-title');
  if (titleEl) titleEl.innerHTML = 'ARIA — <span>Agente de Campañas</span>';
  syncAriaEmptyState();
}

function closeAria() {
  const overlay = document.getElementById('agent-aria-overlay');
  if (overlay) {
    closeAgentAria();
    return;
  }
  const tb = document.getElementById('dashboard-topbar');
  if (tb) tb.hidden = false;
  const main = document.getElementById('dashboard-main');
  if (main) main.classList.remove('dashboard-main--aria');
  switchView('view-home', document.querySelector('.nav-item'));
}

let whatsappQrPollTimer = null;
let mensajesWaPollTimer = null;

function getCurrentAgentRefCode() {
  return (currentAgent && currentAgent.refCode
    ? String(currentAgent.refCode)
    : '').trim();
}

function setWhatsAppStatusMessage(message, isSuccess) {
  const statusEl = document.getElementById('aria-wa-status');
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.style.color = isSuccess ? '#2E7D32' : '#6B6258';
}

function clearWhatsAppQr() {
  const qrEl = document.getElementById('aria-wa-qr');
  if (qrEl) qrEl.innerHTML = '';
}

function ensureQrcodeJsLoaded() {
  if (window.QRCode) return Promise.resolve();
  const existing = document.getElementById('qrcodejs-cdn');
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', function onLoad() {
        resolve();
      }, { once: true });
      existing.addEventListener('error', function onError() {
        reject(new Error('No se pudo cargar qrcodejs.'));
      }, { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = 'qrcodejs-cdn';
    script.src = 'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js';
    script.async = true;
    script.onload = function () {
      resolve();
    };
    script.onerror = function () {
      reject(new Error('No se pudo cargar qrcodejs.'));
    };
    document.head.appendChild(script);
  });
}

function stopWhatsAppPolling() {
  if (whatsappQrPollTimer) {
    clearInterval(whatsappQrPollTimer);
    whatsappQrPollTimer = null;
  }
  if (mensajesWaPollTimer) {
    clearInterval(mensajesWaPollTimer);
    mensajesWaPollTimer = null;
  }
}

function iniciarPollingMensajes() {
  console.log('iniciarPollingMensajes ejecutado');
  if (mensajesWaPollTimer) {
    clearInterval(mensajesWaPollTimer);
    mensajesWaPollTimer = null;
  }
  // Ejecutar inmediatamente sin esperar 5 segundos
  (async () => {
    const refCode = (getCurrentAgentRefCode() || '').toUpperCase();
    if (!refCode) return;
    try {
      const res = await fetch(
        'http://localhost:3001/mensajes/' + encodeURIComponent(refCode)
      );
      const data = await res.json();
      console.log('Mensajes inmediatos:', data);
      const lista = document.getElementById('aria-wa-mensajes-lista');
      if (!lista) return;
      if (!data.mensajes || data.mensajes.length === 0) {
        lista.innerHTML =
          '<p style="color:#A89E94;font-size:12px;">No hay mensajes aún.</p>';
        return;
      }
      lista.innerHTML = data.mensajes.slice(-50).reverse().map(function (m) {
        const de = m.de != null ? m.de : m.from;
        const hora = m.hora != null ? m.hora : m.ts;
        const texto = m.texto != null ? String(m.texto) : '';
        const horaStr = hora != null
          ? new Date(hora).toLocaleTimeString()
          : '';
        return (
          '<div style="padding:10px;border-bottom:1px solid #DDD5C8;font-size:12px;">' +
          '<span style="color:#A89E94;font-size:10px;">' +
          de +
          ' — ' +
          horaStr +
          '</span><br><span style="color:#1A1714;">' +
          texto +
          '</span></div>'
        );
      }).join('');
    } catch (e) {
      console.error('Error mensajes inmediatos:', e);
    }
  })();
  mensajesWaPollTimer = setInterval(async () => {
    const refCode = (getCurrentAgentRefCode() || '').toUpperCase();
    if (!refCode) return;
    console.log('Iniciando polling de mensajes para:', refCode);
    try {
      const res = await fetch(
        'http://localhost:3001/mensajes/' + encodeURIComponent(refCode)
      );
      const data = await res.json();
      console.log('Mensajes recibidos:', data);
      const lista = document.getElementById('aria-wa-mensajes-lista');
      if (!lista) return;
      if (!data.mensajes || data.mensajes.length === 0) {
        lista.innerHTML =
          '<p style="color:#A89E94;font-size:12px;">No hay mensajes aún.</p>';
        return;
      }
      lista.innerHTML = data.mensajes
        .slice(-50)
        .reverse()
        .map(function (m) {
          const de = m.de != null ? m.de : m.from;
          const hora = m.hora != null ? m.hora : m.ts;
          const texto = m.texto != null ? String(m.texto) : '';
          const horaStr = hora != null
            ? new Date(hora).toLocaleTimeString()
            : '';
          return (
            '<div style="padding:10px;border-bottom:1px solid #DDD5C8;font-size:12px;">' +
            '<span style="color:#A89E94;font-size:10px;">' +
            de +
            ' — ' +
            horaStr +
            '</span><br>' +
            '<span style="color:#1A1714;">' +
            texto +
            '</span>' +
            '</div>'
          );
        })
        .join('');
    } catch (e) {}
  }, 3000);
}

function updateWhatsAppUiForState(state) {
  const st = (state || '').toLowerCase();
  const connectBtn = document.getElementById('aria-wa-connect-btn');
  const disconnectBtn = document.getElementById('aria-wa-disconnect-btn');
  const connected = st === 'conectado' || st === 'connected';
  if (connectBtn) connectBtn.disabled = connected;
  if (disconnectBtn) disconnectBtn.disabled = !connected;
  if (connected) {
    setWhatsAppStatusMessage('WhatsApp conectado correctamente.', true);
    clearWhatsAppQr();
  }
}

function renderWhatsAppQr(qrText) {
  const qrEl = document.getElementById('aria-wa-qr')
  if (!qrEl) return
  qrEl.innerHTML = ''
  try {
    new QRCode(qrEl, {
      text: qrText,
      width: 220,
      height: 220
    })
  } catch(e) {
    qrEl.innerHTML = '<p style="color:red;font-size:12px;">Error al renderizar QR: ' + e.message + '</p>'
    console.error('QR error:', e)
  }
}

async function pollWhatsAppQr() {
  const refCode = getCurrentAgentRefCode();
  if (!refCode) {
    setWhatsAppStatusMessage('No se encontró currentAgent.refCode.', false);
    return;
  }

  try {
    const response = await fetch('http://localhost:3001/qr/' + encodeURIComponent(refCode));
    if (!response.ok) throw new Error('No se pudo consultar el estado de WhatsApp.');
    const data = await response.json();
    const state = (data && (data.estado || data.status || '')).toString();
    const qrText = data && (data.qr || data.qrCode || data.code || data.value || '');
    console.log('QR data:', data);
    console.log('QR text:', qrText);

    updateWhatsAppUiForState(state);
    if (!state || (state.toLowerCase() !== 'conectado' && state.toLowerCase() !== 'connected')) {
      setWhatsAppStatusMessage(
        qrText ? 'Escanea el QR con WhatsApp para conectar.' : 'Esperando QR...',
        false
      );
      if (qrText) {
        await ensureQrcodeJsLoaded();
        renderWhatsAppQr(qrText);
      }
    } else {
      stopWhatsAppPolling();
    }
  } catch (err) {
    setWhatsAppStatusMessage(err.message || 'Error consultando QR.', false);
  }
}

function startWhatsAppPolling() {
  stopWhatsAppPolling();
  pollWhatsAppQr();
  whatsappQrPollTimer = setInterval(pollWhatsAppQr, 3000);
}

async function conectarWhatsAppARIA() {
  const refCode = getCurrentAgentRefCode();
  if (!refCode) {
    setWhatsAppStatusMessage('No se encontró currentAgent.refCode.', false);
    return;
  }
  setWhatsAppStatusMessage('Conectando WhatsApp...', false);
  try {
    const response = await fetch(
      'http://localhost:3001/conectar/' + encodeURIComponent(refCode),
      { method: 'POST' }
    );
    if (!response.ok) throw new Error('No se pudo iniciar la conexión de WhatsApp.');
    startWhatsAppPolling();
  } catch (err) {
    setWhatsAppStatusMessage(err.message || 'Error conectando WhatsApp.', false);
  }
}

async function desconectarWhatsAppARIA() {
  const refCode = getCurrentAgentRefCode();
  if (!refCode) {
    setWhatsAppStatusMessage('No se encontró currentAgent.refCode.', false);
    return;
  }
  setWhatsAppStatusMessage('Desconectando WhatsApp...', false);
  try {
    const response = await fetch(
      'http://localhost:3001/desconectar/' + encodeURIComponent(refCode),
      { method: 'POST' }
    );
    if (!response.ok) throw new Error('No se pudo desconectar WhatsApp.');
    stopWhatsAppPolling();
    clearWhatsAppQr();
    updateWhatsAppUiForState('desconectado');
    setWhatsAppStatusMessage('WhatsApp desconectado.', false);
  } catch (err) {
    setWhatsAppStatusMessage(err.message || 'Error desconectando WhatsApp.', false);
  }
}

function openAriaSection(section) {
  const dashboard = document.getElementById(
    'aria-dashboard');
  const mainContent = document.getElementById(
    'aria-main-content');
  const contenido = document.getElementById(
    'aria-section-contenido');
  const estrategia = document.getElementById(
    'aria-section-estrategia');
  const chatSec = document.getElementById(
    'aria-section-chat');
  const redes = document.getElementById(
    'aria-section-redes');

  function hideAriaSubviews() {
    if (dashboard) {
      dashboard.style.display = 'none';
      dashboard.style.visibility = 'hidden';
    }
    if (mainContent) {
      mainContent.style.display = 'none';
      mainContent.style.visibility = 'hidden';
    }
    if (contenido) {
      contenido.style.display = 'none';
      contenido.style.visibility = 'hidden';
    }
    if (estrategia) {
      estrategia.style.display = 'none';
      estrategia.style.visibility = 'hidden';
    }
    if (chatSec) {
      chatSec.style.display = 'none';
      chatSec.style.visibility = 'hidden';
    }
    if (redes) {
      redes.style.display = 'none';
      redes.style.visibility = 'hidden';
    }
  }

  if (section === 'contenido') {
    hideAriaSubviews();
    if (contenido) {
      contenido.style.display = 'block';
      contenido.style.visibility = 'visible';
    }
    window.scrollTo(0, 0);
    return;
  }

  if (section === 'campana') {
    hideAriaSubviews();
    if (mainContent) {
      mainContent.style.display = 'block';
      mainContent.style.visibility = 'visible';
    }
    window.scrollTo(0, 0);
    return;
  }

  if (section === 'estrategia') {
    cargarDatosEnEstrategia();
    hideAriaSubviews();
    if (estrategia) {
      estrategia.style.display = 'block';
      estrategia.style.visibility = 'visible';
    }
    window.scrollTo(0, 0);
    return;
  }

  if (section === 'chat') {
    hideAriaSubviews();
    if (chatSec) {
      chatSec.style.display = 'block';
      chatSec.style.visibility = 'visible';
    }
    cargarProductosEnSelector();
    window.scrollTo(0, 0);
    return;
  }

  if (section === 'redes') {
    hideAriaSubviews();
    if (redes) {
      redes.style.display = 'block';
      redes.style.visibility = 'visible';
    }
    updateWhatsAppUiForState('desconectado');
    startWhatsAppPolling();
    window.scrollTo(0, 0);
    return;
  }

  alert('Sección ' + section +
    ' próximamente disponible');
}

function switchAriaSection(section) {
  console.log('switchAriaSection llamado con:', section);
  const dashboard = document.getElementById(
    'aria-dashboard');
  const mainContent = document.getElementById(
    'aria-main-content');
  const campana = document.getElementById(
    'aria-section-campana');
  const contenido = document.getElementById(
    'aria-section-contenido');
  const estrategia = document.getElementById(
    'aria-section-estrategia');
  const chatSec = document.getElementById(
    'aria-section-chat');
  const redes = document.getElementById(
    'aria-section-redes');

  if (section === 'dashboard') {
    if (mainContent) {
      mainContent.style.display = 'none';
      mainContent.style.visibility = 'hidden';
    }
    if (campana) {
      campana.style.display = 'none';
      campana.style.visibility = 'hidden';
    }
    if (contenido) {
      contenido.style.display = 'none';
      contenido.style.visibility = 'hidden';
    }
    if (estrategia) {
      estrategia.style.display = 'none';
      estrategia.style.visibility = 'hidden';
    }
    if (chatSec) {
      chatSec.style.display = 'none';
      chatSec.style.visibility = 'hidden';
    }
    if (redes) {
      redes.style.display = 'none';
      redes.style.visibility = 'hidden';
    }
    stopWhatsAppPolling();
    if (dashboard) {
      dashboard.style.display = 'block';
      dashboard.style.visibility = 'visible';
    }
    window.scrollTo(0, 0);
    return;
  }

  if (section === 'campana') {
    if (dashboard) {
      dashboard.style.display = 'none';
      dashboard.style.visibility = 'hidden';
    }
    if (contenido) {
      contenido.style.display = 'none';
      contenido.style.visibility = 'hidden';
    }
    if (estrategia) {
      estrategia.style.display = 'none';
      estrategia.style.visibility = 'hidden';
    }
    if (chatSec) {
      chatSec.style.display = 'none';
      chatSec.style.visibility = 'hidden';
    }
    if (redes) {
      redes.style.display = 'none';
      redes.style.visibility = 'hidden';
    }
    stopWhatsAppPolling();
    if (mainContent) {
      mainContent.style.display = 'block';
      mainContent.style.visibility = 'visible';
    }
    if (campana) {
      campana.style.display = 'block';
      campana.style.visibility = 'visible';
    }
    window.scrollTo(0, 0);
    return;
  }

  if (section === 'contenido') {
    openAriaSection('contenido');
    return;
  }

  if (section === 'estrategia') {
    cargarDatosEnEstrategia();
    openAriaSection('estrategia');
    return;
  }

  if (section === 'chat') {
    openAriaSection('chat');
    return;
  }

  if (section === 'redes') {
    console.log('entrando a redes, llamando iniciarPollingMensajes')
    iniciarPollingMensajes()
    openAriaSection('redes')
    return
  }
}

function mostrarContenidoTab(tab) {
  document.querySelectorAll('.contenido-panel')
    .forEach(panel => panel.style.display = 'none');
  document.querySelectorAll('.contenido-tab')
    .forEach(btn => btn.classList.remove('active-tab'));

  const panel = document.getElementById('contenido-' + tab);
  const boton = document.getElementById('tab-' + tab);
  if (panel) panel.style.display = 'block';
  if (boton) boton.classList.add('active-tab');
}

function getContenidoData() {
  return {
    nombre: document.getElementById(
      'contenido-producto')?.value || '',
    precio: document.getElementById(
      'contenido-precio')?.value || '',
    desc: document.getElementById(
      'contenido-desc')?.value || '',
    idioma: document.getElementById(
      'contenido-idioma')?.value || 'es'
  };
}

async function llamarGroqContenido(prompt) {
  const response = await fetch(MOTOR_IA_URL + '/api/ia/groq', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-usuario-id': _getUsuarioId() || '' },
    body: JSON.stringify({ prompt, max_tokens: 2000, temperature: 0.9 })
  });
  const data = await response.json();
  return data.texto || '';
}

function mostrarResultado(id, texto) {
  const div = document.getElementById(id);
  if (div) {
    div.style.display = 'block';
    div.innerHTML = texto.replace(/\n/g, '<br>');
  }
}

const HOOKS_POR_CATEGORIA = {
  hogar: [
    {
      id: 'antes-despues',
      label: '😍 Antes vs Después',
      desc: 'Hook Antes vs Después',
      instruccion_video: 'antes/después o cambio visible en segundos usando el producto',
      instruccion_imagen: 'contraste claro entre desorden y orden perfecto'
    },
    {
      id: 'orden-perfecto',
      label: '✨ Orden Perfecto',
      desc: 'Hook Orden Perfecto',
      instruccion_video: 'contenido hipnótico y fluido, agradable de ver, sin mucha explicación, que genere satisfacción visual inmediata',
      instruccion_imagen: 'organización estética y satisfactoria'
    },
    {
      id: 'solucion-rapida',
      label: '⚡ Solución Rápida',
      desc: 'Hook Solución Rápida',
      instruccion_video: 'mostrar frustración clara con el problema + solución inmediata con el producto',
      instruccion_imagen: 'resultado inmediato con sensación de facilidad'
    }
  ],
  tech: [
    {
      id: 'efecto-wow',
      label: '🤯 Efecto WOW',
      desc: 'Hook Efecto WOW',
      instruccion_video: 'generar sorpresa inmediata, parecer tecnología del futuro, impacto visual inmediato',
      instruccion_imagen: 'producto mostrado como algo sorprendente o futurista'
    },
    {
      id: 'curiosidad',
      label: '👀 Curiosidad',
      desc: 'Hook Curiosidad Extrema',
      instruccion_video: 'dejar preguntas abiertas que obliguen a seguir viendo, mostrar algo contraintuitivo',
      instruccion_imagen: 'imagen que haga preguntar ¿qué es eso?'
    },
    {
      id: 'comparacion',
      label: '↔️ Comparación',
      desc: 'Hook Comparación Inteligente',
      instruccion_video: 'mostrar claramente el método antiguo vs el nuevo con el producto, contraste directo',
      instruccion_imagen: 'mostrar antiguo vs nuevo claramente'
    }
  ],
  belleza: [
    {
      id: 'transformacion',
      label: '✨ Transformación Visible',
      desc: 'Hook Transformación Visible',
      instruccion_video: 'cambio visible en piel, cabello o apariencia, mostrar transformación real y creíble',
      instruccion_imagen: 'cambio real en piel o apariencia'
    },
    {
      id: 'dolor-oculto',
      label: '😬 Dolor Oculto',
      desc: 'Hook Dolor Oculto',
      instruccion_video: 'revelar un error que la persona no sabe que está cometiendo con su rutina de belleza actual',
      instruccion_imagen: 'problema visible que genera incomodidad'
    },
    {
      id: 'secreto',
      label: '🤫 Secreto Revelado',
      desc: 'Hook Secreto Revelado',
      instruccion_video: 'sensación de insider, truco oculto que pocos conocen, información exclusiva revelada',
      instruccion_imagen: 'producto como truco oculto'
    }
  ],
  ropa: [
    {
      id: 'validacion',
      label: '👥 Validación Social',
      desc: 'Hook Validación Social',
      instruccion_video: 'otras personas reaccionan positivamente, preguntan dónde conseguirlo, prueba social fuerte',
      instruccion_imagen: 'personas reaccionando o mirando'
    },
    {
      id: 'outfit',
      label: '👗 Transformación Outfit',
      desc: 'Hook Transformación Outfit',
      instruccion_video: 'cambio visual fuerte en estilo y apariencia usando el producto',
      instruccion_imagen: 'cambio visual fuerte en estilo'
    },
    {
      id: 'truco',
      label: '💡 Truco de Estilo',
      desc: 'Hook Truco de Estilo',
      instruccion_video: 'tip práctico que mejora la apariencia inmediatamente, consejo de experto accesible',
      instruccion_imagen: 'mejora clara en apariencia'
    }
  ]
};

function seleccionarCategoria(cat) {
  window.categoriaSeleccionada = cat;
  window.hookSeleccionado = null;

  document.querySelectorAll('.categoria-btn').forEach(btn => {
    const isActive = btn.dataset.cat === cat;
    btn.style.border = isActive
      ? '1px solid #C9A84C'
      : '1px solid #DDD5C8';
    btn.style.background = isActive
      ? 'rgba(201,168,76,0.08)'
      : '#FFFFFF';
    btn.style.color = '#1A1714';
    btn.style.borderRadius = '4px';
    btn.style.padding = '10px 12px';
    btn.style.cursor = 'pointer';
    btn.style.fontSize = '12px';
  });

  const hooksContainer = document.getElementById('hooks-container');
  const hooksBtns = document.getElementById('hooks-btns');
  if (!hooksContainer || !hooksBtns) return;

  const hooks = HOOKS_POR_CATEGORIA[cat] || [];
  hooksBtns.innerHTML = hooks.map(hook =>
    '<button type="button" class="hook-btn" ' +
    'onclick="seleccionarHook(\'' + hook.id + '\')"' +
    ' style="border:1px solid #DDD5C8;background:#FFFFFF;' +
    'color:#1A1714;border-radius:4px;padding:10px 12px;' +
    'cursor:pointer;font-size:12px;">' +
    hook.desc + '</button>'
  ).join('');

  hooksContainer.style.display = 'block';
}

function seleccionarHook(hookId) {
  window.hookSeleccionado = hookId;
  document.querySelectorAll('#hooks-btns .hook-btn').forEach(btn => {
    const isActive = btn.getAttribute('onclick')
      .includes('\'' + hookId + '\'');
    btn.style.border = isActive
      ? '1px solid #C9A84C'
      : '1px solid #DDD5C8';
    btn.style.background = isActive
      ? 'rgba(201,168,76,0.08)'
      : '#FFFFFF';
  });
}

async function generarBrolls() {
  const p = getContenidoData();
  if (!p.nombre) {
    alert('Ingresa el nombre del producto');
    return;
  }

  const cat = window.categoriaSeleccionada;
  const hookId = window.hookSeleccionado;

  let hookInstruccion =
    'contenido viral que enganche inmediatamente';
  let hookNombre = 'Hook viral';

  if (cat && hookId) {
    const hooks = HOOKS_POR_CATEGORIA[cat] || [];
    const hook = hooks.find(h => h.id === hookId);
    if (hook) {
      hookInstruccion = hook.instruccion_video +
        '. El hook debe sentirse natural, emocional y no forzado.';
      hookNombre = hook.desc;
    }
  }

  const div = document.getElementById(
    'resultado-brolls');
  if (div) {
    div.style.display = 'block';
    div.innerHTML = '⏳ Generando B-Roll...';
  }

  const prompt =
    'Actúa como experto en contenido viral ' +
    'para TikTok para el mercado hispano en USA.\n\n' +
    'Producto: ' + p.nombre + '\n' +
    'Descripción: ' + p.desc + '\n' +
    'Precio: $' + p.precio + ' USD\n' +
    'Tipo de Hook: ' + hookNombre + '\n\n' +
    'El contenido debe parecer 100% orgánico, ' +
    'como video real de TikTok, no anuncio.\n\n' +
    'El hook debe basarse en: ' + hookInstruccion +
    '. Natural, emocional y no forzado.\n\n' +
    'IMPORTANTE: El primer segundo debe ser ' +
    'visualmente impactante.\n\n' +
    'REGLAS OBLIGATORIAS:\n' +
    '- Evita escenas complejas o narrativas\n' +
    '- No crear montajes elaborados\n' +
    '- Máximo 4-5 escenas simples y directas\n' +
    '- Priorizar primer plano del producto ' +
    'y reacción humana\n' +
    '- El guion debe sonar como persona real, ' +
    'no como anuncio\n\n' +
    'Genera en este orden EXACTO:\n\n' +
    '🎣 HOOKS (0-3 segundos)\n' +
    'Genera 3 variantes del HOOK únicamente. ' +
    'Frases cortas, directas, ULTRA impactantes. ' +
    'No generes 3 videos diferentes. ' +
    'Son 3 opciones de inicio para el mismo video.\n\n' +
    '🎙️ GUIÓN COMPLETO\n' +
    'UN solo guion natural. ' +
    'Como persona real hablando, no vendedor. ' +
    'Segundo a segundo. 30-45 segundos.\n\n' +
    '🎬 PROMPTS VISUALES POR ESCENA\n' +
    'Máximo 5 escenas simples. ' +
    'Primer plano del producto, ' +
    'reacción humana, uso real. ' +
    'Listo para usar en Reve AI.\n\n' +
    '🎵 MÚSICA SUGERIDA\n' +
    'Tipo de música y mood.\n\n' +
    '📝 COPY Y HASHTAGS\n' +
    'Texto natural para publicar. ' +
    'CTA claro y 15 hashtags.\n\n' +
    'Todo en español latino.';

  try {
    const resultado = await llamarGroqContenido(prompt);
    const partes = resultado.split('🎵 MÚSICA');
    const html =
      partes[0].replace(/\n/g, '<br>') +
      '<br><a href="https://reve.art" ' +
      'target="_blank" ' +
      'style="display:inline-block;' +
      'padding:10px 20px;margin:12px 0;' +
      'background:#1A1714;color:#FFFFFF;' +
      'text-decoration:none;border-radius:4px;' +
      'font-size:12px;font-weight:600;">' +
      '🎬 Crear video en Reve AI</a><br><br>' +
      '<a href="https://grok.com" ' +
      'target="_blank" ' +
      'style="display:inline-block;' +
      'padding:10px 20px;margin:12px 0;' +
      'background:#1A1714;color:#FFFFFF;' +
      'text-decoration:none;border-radius:4px;' +
      'font-size:12px;font-weight:600;' +
      'margin-left:8px;">' +
      '✨ Animar imágenes con Grok</a><br><br>' +
      '🎵 MÚSICA' +
      (partes[1] || '').replace(/\n/g, '<br>') +
      '<br><br>' +
      '<button onclick="navigator.clipboard' +
      '.writeText(document.getElementById(' +
      '\'resultado-brolls\').innerText)' +
      '.then(()=>alert(\'Copiado!\'))" ' +
      'style="padding:10px 20px;' +
      'background:#FAF8F4;color:#1A1714;' +
      'border:1px solid #DDD5C8;' +
      'border-radius:4px;font-size:12px;' +
      'cursor:pointer;">📋 Copiar todo</button>';
    mostrarResultado('resultado-brolls', html);
  } catch(err) {
    if (div) div.innerHTML = 'Error: ' + err.message;
  }
}

async function generarEstrategiaGanadora() {
  const p = {
    nombre: window.productoData.nombre ||
      document.getElementById(
        'estrategia-nombre')?.value || '',
    precio: window.productoData.precio ||
      document.getElementById(
        'estrategia-precio')?.value || '',
    desc: window.productoData.desc ||
      document.getElementById(
        'estrategia-desc')?.value || ''
  };
  const mercado = document.getElementById(
    'estrategia-mercado')?.value || 'USA Hispano';
  const idioma = document.getElementById(
    'estrategia-idioma')?.value || 'Español';

  if (!p.nombre) {
    alert('Ingresa el nombre del producto');
    return;
  }
  const cat = window.categoriaSeleccionada ||
    'general';
  const hookId = window.hookSeleccionado;
  let hookNombre = 'Hook viral';

  if (hookId) {
    const hooks = HOOKS_POR_CATEGORIA[cat] || [];
    const hook = hooks.find(h => h.id === hookId);
    if (hook) hookNombre = hook.desc;
  }

  const div = document.getElementById(
    'resultado-estrategia');
  if (div) {
    div.style.display = 'block';
    div.innerHTML = '⏳ Generando estrategia...';
  }

  const prompt =
    'Actúa como experto en marketing digital ' +
    'y Facebook Ads para el mercado hispano en USA.\n\n' +
    'Producto: ' + p.nombre + '\n' +
    'Descripción: ' + p.desc + '\n' +
    'Precio: $' + p.precio + ' USD\n' +
    'Mercado objetivo: ' + mercado + '\n' +
    'Idioma: ' + idioma + '\n' +
    'Categoría: ' + cat + '\n' +
    'Hook principal: ' + hookNombre + '\n\n' +
    'Genera la estrategia completa de ventas. ' +
    'Sé específico y directo.\n\n' +
    '💡 RESUMEN RÁPIDO\n' +
    'En 2-3 líneas: cómo vender este producto, ' +
    'qué funciona mejor y cuándo escalar.\n\n' +
    '📱 ESTRATEGIA ORGÁNICA\n' +
    '- Qué contenido subir\n' +
    '- Qué hooks usar\n' +
    '- Frecuencia de publicación\n' +
    '- Estilo y tono recomendado\n' +
    '- Plataformas prioritarias\n\n' +
    '💸 ESTRATEGIA DE ADS (PAGO)\n' +
    '- Cómo testear el producto\n' +
    '- Cuántos videos/imágenes probar primero\n' +
    '- Presupuesto inicial recomendado\n' +
    '- Qué métricas vigilar\n' +
    '- Cómo escalar cuando funcione\n\n' +
    '🎯 POTENCIAL DE VENTAS\n' +
    'Alto / Medio / Bajo — con explicación.\n\n' +
    '⚠️ ERRORES A EVITAR\n' +
    'Los 3 errores más comunes ' +
    'al vender este tipo de producto.\n\n' +
    'La estrategia debe adaptarse al tipo ' +
    'de producto y su categoría, ' +
    'no ser genérica.\n\n' +
    'REGLAS OBLIGATORIAS:\n' +
    '- Evita respuestas genéricas como ' +
    '"mostrar calidad" o "hacer contenido atractivo"\n' +
    '- Da estrategias específicas y modernas ' +
    'basadas en lo que funciona en TikTok en 2026\n' +
    '- Los hooks deben ser directos, ' +
    'emocionales y romper el patrón\n' +
    '- Frecuencia mínima: 2-3 videos diarios\n' +
    '- Para ads: estructura de testing real ' +
    '(mínimo 5 hooks x 2 creativos)\n' +
    '- Presupuesto por ad: $5-10 diarios por creativo\n' +
    '- Escalar duplicando el ganador, ' +
    'no subiendo presupuesto directo\n' +
    '- Evita hooks tipo pregunta básica ' +
    'o frases comunes\n' +
    '- Usa hooks estilo reacción, sorpresa ' +
    'o duda real\n' +
    '- El contenido debe parecer grabado ' +
    'por una persona normal, no una marca\n' +
    '- Evita frases genéricas como ' +
    '"esto es increíble" o "no te lo pierdas"\n' +
    '- Los hooks deben parecer pensamientos ' +
    'reales de una persona, no frases de marketing\n' +
    '- Prioriza reacción humana sobre ' +
    'explicación del producto\n' +
    '- Los hooks deben parecer pensamientos ' +
    'reales de una persona, ' +
    'no frases estructuradas\n' +
    '- Evita lenguaje perfecto ' +
    'o demasiado explicado\n' +
    '- Prioriza frases cortas ' +
    'tipo reacción humana\n' +
    '- El producto debe venderse por su ' +
    'relación precio-sorpresa, no como marca premium\n\n' +
    'Prioriza estrategias simples que se puedan ' +
    'ejecutar con poco presupuesto.\n\n' +
    'En español latino. ' +
    'Directo y accionable.';

  try {
    const resultado = await llamarGroqContenido(prompt);
    if (div) {
      div.innerHTML = resultado
        .replace(/\n/g, '<br>') +
        '<br><br>' +
        '<button onclick="navigator.clipboard' +
        '.writeText(document.getElementById(' +
        '\'resultado-estrategia\').innerText)' +
        '.then(()=>alert(\'Copiado!\'))" ' +
        'style="padding:10px 20px;' +
        'background:#FAF8F4;color:#1A1714;' +
        'border:1px solid #DDD5C8;' +
        'border-radius:4px;font-size:12px;' +
        'cursor:pointer;">📋 Copiar</button>';
    }
  } catch(err) {
    if (div) div.innerHTML = 'Error: ' + err.message;
  }
}

async function generarContenidoImagenes() {
  const p = getContenidoData();
  if (!p.nombre) {
    alert('Ingresa el nombre del producto');
    return;
  }
  const div = document.getElementById(
    'resultado-imagenes');
  if (div) {
    div.style.display = 'block';
    div.innerHTML = 'Generando contenido...';
  }

  const cat = window.categoriaSeleccionada;
  const hookId = window.hookSeleccionado;
  let hookInstruccion = 'imagen viral que detenga el scroll';
  let hookNombre = 'Hook viral';
  if (cat && hookId) {
    const hooks = HOOKS_POR_CATEGORIA[cat] || [];
    const hook = hooks.find(h => h.id === hookId);
    if (hook) {
      hookInstruccion = hook.instruccion_imagen;
      hookNombre = hook.desc;
    }
  }

  const prompt =
    'Actúa como experto en ads virales ' +
    'para el mercado hispano en USA.\n\n' +
    'Producto: ' + p.nombre + '\n' +
    'Descripción: ' + p.desc + '\n' +
    'Precio: $' + p.precio + ' USD\n' +
    'Tipo de Hook: ' + hookNombre + '\n\n' +
    'Adapta según el hook: ' + hookInstruccion + '\n\n' +
    'REGLAS OBLIGATORIAS:\n' +
    '- Genera 3 opciones DIFERENTES pero todas ' +
    'basadas en el mismo hook seleccionado\n' +
    '- Cada opción es un post independiente\n' +
    '- Si una opción es carrusel, adáptala ' +
    'como una sola imagen del concepto\n' +
    '- Cada imagen debe entenderse en 1 segundo\n' +
    '- Sin historias ni escenas de video\n' +
    '- Mostrar resultado, reacción o beneficio directo\n' +
    '- Evita escenas narrativas como sacar algo ' +
    'de una bolsa o acciones intermedias\n' +
    '- Prioriza primer plano del producto ' +
    'o reacción clara\n' +
    '- Texto directo, no preguntas débiles\n\n' +
    'Para cada opción:\n\n' +
    '💡 OPCIÓN [número]\n' +
    '🖼️ IDEA: Qué se ve en la imagen. ' +
    'Primer plano, persona reaccionando ' +
    'o beneficio visible. Directo.\n\n' +
    '📝 TEXTO EN IMAGEN: ' +
    'Frase máximo 6 palabras. ' +
    'Directa, impactante, que genere ' +
    'curiosidad fuerte o muestre valor.\n\n' +
    '🤖 PROMPT PARA GEMINI: ' +
    'Descripción natural y detallada: ' +
    'persona, producto, entorno, luz, emoción. ' +
    'Estilo orgánico tipo Instagram/TikTok. ' +
    'Listo para pegar en Gemini.\n\n' +
    'Todo en español latino. ' +
    'Directo, viral, que venda.';

  const resultado = await llamarGroqContenido(prompt);

  const html = resultado.replace(/\n/g, '<br>') +
    '<br><br>' +
    '<a href="https://gemini.google.com" ' +
    'target="_blank" ' +
    'style="display:inline-block;padding:10px 20px;' +
    'background:#1A1714;color:#FFFFFF;' +
    'text-decoration:none;border-radius:4px;' +
    'font-size:12px;font-weight:600;">' +
    '✨ Ir a Gemini para generar la imagen</a>';

  mostrarResultado('resultado-imagenes', html);
}

async function generarPlanSemanal() {
  const p = getContenidoData();
  if (!p.nombre) {
    alert('Ingresa el nombre del producto');
    return;
  }
  const div = document.getElementById(
    'resultado-plan');
  if (div) {
    div.style.display = 'block';
    div.innerHTML = 'Generando plan semanal...';
  }

  const cat = window.categoriaSeleccionada;
  const hookId = window.hookSeleccionado;

  let hookInstruccion =
    'contenido viral que enganche inmediatamente';
  let hookNombre = 'Hook viral';

  if (cat && hookId) {
    const hooks = HOOKS_POR_CATEGORIA[cat] || [];
    const hook = hooks.find(h => h.id === hookId);
    if (hook) {
      hookInstruccion = hook.instruccion_video;
      hookNombre = hook.desc;
    }
  }

  const prompt =
    'Actúa como experto en marketing digital ' +
    'para el mercado hispano en USA.\n\n' +
    'Producto: ' + p.nombre + '\n' +
    'Descripción: ' + p.desc + '\n' +
    'Precio: $' + p.precio + ' USD\n' +
    'Categoría: ' + (cat || 'general') + '\n' +
    'Tipo de Hook principal: ' + hookNombre + '\n' +
    'Estrategia del hook: ' + hookInstruccion + '\n\n' +
    'Crea un plan de contenido de 7 días ' +
    'para Facebook y TikTok basado en ' +
    'el hook seleccionado.\n\n' +
    'Para cada día LUNES a DOMINGO:\n\n' +
    '📅 [DÍA]\n' +
    '- Tipo: B-Roll o Imagen\n' +
    '- Tema: qué trata el contenido\n' +
    '- Hook del día: frase corta y directa ' +
    'basada en ' + hookNombre + '\n' +
    '- Publicación: Orgánico o Pautado\n' +
    '- Hora recomendada\n\n' +
    'REGLAS:\n' +
    '- Cada día debe tener un ángulo diferente ' +
    'del mismo hook\n' +
    '- Los hooks deben sonar naturales, ' +
    'no como anuncios\n' +
    '- Mezclar B-Rolls e Imágenes durante la semana\n' +
    '- Mínimo 3 días pautados\n\n' +
    'Al final:\n\n' +
    '📊 RESUMEN DE LA SEMANA:\n' +
    '- Total B-Rolls\n' +
    '- Total Imágenes\n' +
    '- Total pautado vs orgánico\n' +
    '- Presupuesto sugerido para pauta\n\n' +
    'En español latino.';

  const resultado = await llamarGroqContenido(prompt);

  const html = resultado.replace(/\n/g, '<br>') +
    '<br><br>' +
    '<button onclick="descargarPlanPDF()" ' +
    'style="padding:10px 20px;' +
    'background:#C9A84C;color:#FFFFFF;' +
    'border:none;border-radius:4px;' +
    'font-size:12px;font-weight:600;' +
    'cursor:pointer;">' +
    '📥 Descargar Plan en PDF</button>';

  mostrarResultado('resultado-plan', html);
}

async function descargarPlanPDF() {
  const contenido = document.getElementById(
    'resultado-plan')?.innerText || '';
  const p = getContenidoData();

  const ventana = window.open('', '_blank');
  ventana.document.write(
    '<html><head><title>Plan Semanal - ' +
    p.nombre + '</title>' +
    '<style>body{font-family:Arial;padding:40px;' +
    'max-width:800px;margin:0 auto;}' +
    'h1{color:#1A1714;}' +
    'pre{white-space:pre-wrap;line-height:1.8;}</style>' +
    '</head><body>' +
    '<h1>Plan Semanal de Contenido</h1>' +
    '<h2>' + p.nombre + ' — $' + p.precio + ' USD</h2>' +
    '<pre>' + contenido + '</pre>' +
    '</body></html>'
  );
  ventana.document.close();
  ventana.print();
}

function syncAriaEmptyState() {
  const sections = ['image', 'copy', 'script', 'plan'];
  let has = false;
  for (let i = 0; i < sections.length; i++) {
    const el = document.getElementById('ai-result-' + sections[i]);
    if (el && el.innerHTML.replace(/\s/g, '').length > 0) {
      has = true;
      break;
    }
  }
  const empty = document.getElementById('aria-empty-state');
  const acc = document.getElementById('aria-results-accordion');
  if (!empty || !acc) return;
  empty.hidden = has;
  acc.hidden = !has;
}

function toggleAriaAccordion(item) {
  if (item && item.classList) item.classList.toggle('is-collapsed');
}

function applyDashboardRole(isAdmin) {
  if (isAdmin) {
    initAdminDashboard();
  } else {
    initAgentDashboard();
  }
}

function switchView(viewId, navEl) {
  const tb = document.getElementById('dashboard-topbar');
  const mainEl = document.getElementById('dashboard-main');
  if (tb) tb.hidden = false;
  if (mainEl) mainEl.classList.remove('dashboard-main--aria');

  document.querySelectorAll('.dash-view').forEach(v => v.classList.remove('active'));
  document.getElementById(viewId).classList.add('active');

  if (viewId === 'view-catalog') {
    renderAdminCatalogGrid();
  }

  if (navEl) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    navEl.classList.add('active');
  }

  const titles = {
    'view-home':       'Panel de <span>Inicio</span>',
    'view-catalog':    'Catálogo <span>de Productos</span>',
    'view-products':   'Mis <span>Productos</span>',
    'view-affiliates': 'Mis <span>Afiliados</span>',
    'view-balance':    'Mi <span>Balance</span>',
    'view-orders':     'Mis <span>Pedidos</span>',
    'view-admin':      'Panel de <span>Administración</span>',
  };
  document.getElementById('topbar-title').innerHTML = titles[viewId] || 'EcommerceAgents';
}

function switchViewFromCard(viewId) {
  const idMap = {
    'view-products':   'nav-agent-products',
    'view-affiliates': 'nav-agent-affiliates',
    'view-balance':    'nav-agent-balance',
    'view-orders':     'nav-agent-orders',
    'view-catalog':    'nav-catalog-principal',
  };
  const navEl = idMap[viewId] ? document.getElementById(idMap[viewId]) : null;
  switchView(viewId, navEl);
}

function switchViewFromAdminHome() {
  const navEl = document.getElementById('nav-admin-panel');
  switchView('view-admin', navEl || null);
}

function obtenerProductosDelDashboard() {
  return getMisProductos().map(function (p) {
    return {
      nombre: p.nombre,
      categoria: p.categoria,
      precio: '$' + p.precioSugerido,
      estado: p.estado,
      slug: p.slug
    };
  });
}

function cargarProductosEnSelector() {
  const productos = obtenerProductosDelDashboard();
  const select = document.getElementById(
    'aria-chat-producto-select');
  if (!select) return;

  select.innerHTML =
    '<option value="">Selecciona un producto...</option>';

  productos.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = p.nombre + ' — ' + p.precio;
    select.appendChild(opt);
  });
}

function seleccionarProductoARIA() {
  const select = document.getElementById(
    'aria-chat-producto-select');
  const info = document.getElementById(
    'aria-chat-producto-info');
  const acciones = document.getElementById(
    'aria-chat-acciones');
  const idx = select?.value;

  if (idx === '') {
    window.productoARIASeleccionado = null;
    if (info) info.style.display = 'none';
    if (acciones) acciones.style.display = 'none';
    return;
  }

  const productos = obtenerProductosDelDashboard();
  window.productoARIASeleccionado = productos[idx];
  ariaChatSecHistory.length = 0;

  const messages = document.getElementById(
    'aria-chat-sec-messages');
  if (messages) {
    messages.innerHTML =
      '<div class="aria-chat-msg aria-chat-bot">' +
      '👋 Producto listo: ' +
      productos[idx].nombre + '.\n' +
      'Puedo darte hooks virales, ideas de ' +
      'contenido o cómo escalar este producto.\n' +
      'Toca una opción o escríbeme directamente.' +
      '</div>';
  }

  if (info) {
    info.style.display = 'block';
    info.innerHTML =
      '📦 <strong>' +
      productos[idx].nombre + '</strong> · ' +
      productos[idx].categoria + ' · ' +
      productos[idx].precio;
  }

  if (acciones) acciones.style.display = 'grid';

  if (messages) {
    const msg = document.createElement('div');
    msg.className = 'aria-chat-msg aria-chat-bot';
    msg.textContent = '✅ Producto seleccionado: ' +
      productos[idx].nombre + '. ' +
      'Puedo ayudarte con hooks, ideas, ads ' +
      'o mejorar contenido. ¿Qué necesitas?';
    messages.appendChild(msg);
    messages.scrollTop = messages.scrollHeight;
  }
}

function accionARIA(tipo) {
  const acciones = {
    hooks: 'Dame 5 hooks virales para vender este producto en TikTok y Reels',
    ideas: 'Dame 3 ideas de contenido concretas para vender este producto esta semana',
    escalar: 'Cómo escalo las ventas de este producto con poco presupuesto',
    errores: 'Cuáles son los errores más comunes al vender este tipo de producto'
  };

  const input = document.getElementById(
    'aria-chat-sec-input');
  if (input) {
    input.value = acciones[tipo];
    enviarChatARIA();
  }
}

async function enviarChatARIA() {
  const input = document.getElementById(
    'aria-chat-sec-input');
  const messages = document.getElementById(
    'aria-chat-sec-messages');
  const texto = input?.value.trim();
  if (!texto) return;

  const p = window.productoARIASeleccionado;

  const userMsg = document.createElement('div');
  userMsg.className = 'aria-chat-msg aria-chat-user';
  userMsg.textContent = texto;
  messages?.appendChild(userMsg);
  input.value = '';

  const loadMsg = document.createElement('div');
  loadMsg.className = 'aria-chat-msg aria-chat-bot';
  loadMsg.textContent = 'Pensando...';
  messages?.appendChild(loadMsg);
  messages.scrollTop = messages.scrollHeight;

  ariaChatSecHistory.push({
    role: 'user',
    content: texto
  });

  const systemContext =
    'Actúa como ARIA, experto en marketing viral ' +
    'y ventas para el mercado hispano en USA.\n\n' +
    (p
      ? 'Producto activo:\n' +
        '- Nombre: ' + p.nombre + '\n' +
        '- Precio: ' + p.precio + '\n' +
        '- Categoría: ' + p.categoria + '\n\n'
      : 'No hay producto seleccionado. ' +
        'Pide al usuario que seleccione uno.\n\n'
    ) +
    'Reglas:\n' +
    '- No des teoría genérica\n' +
    '- Sé directo y específico\n' +
    '- Prioriza hooks, contenido y ventas\n' +
    '- Usa lenguaje natural\n' +
    '- Responde como experto, no como profesor\n' +
    '- Los hooks deben parecer pensamientos ' +
    'reales, no frases de marketing\n' +
    '- Evita frases como "esto es increíble" ' +
    'o "no te lo pierdas"\n' +
    '- Responde en texto plano con saltos de línea\n' +
    '- Usa números o guiones para listas\n' +
    '- Sé directo y accionable, no teórico\n' +
    '- Cada respuesta debe terminar con ' +
    'una acción concreta que el usuario pueda ' +
    'ejecutar hoy\n';

  try {
    const response = await fetch(MOTOR_IA_URL + '/api/ia/groq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-usuario-id': _getUsuarioId() || '' },
      body: JSON.stringify({
        system: systemContext,
        messages: ariaChatSecHistory,
        max_tokens: 1000,
        temperature: 0.9
      })
    });

    const data = await response.json();
    const reply = data.texto || 'Error, intenta de nuevo.';

    loadMsg.textContent = reply;

    ariaChatSecHistory.push({
      role: 'assistant',
      content: reply
    });

    messages.scrollTop = messages.scrollHeight;

  } catch (err) {
    loadMsg.textContent = 'Error: ' + err.message;
  }
}

// ══════════════════════════════════════════════════════
// COPIAR LINK DE PRODUCTO CON REF DEL AGENTE
// ══════════════════════════════════════════════════════

function copyLink(productSlug, btn) {
  const link = VENTA_BASE_URL + '/' + productSlug + '?ref=' + currentAgent.refCode;

  navigator.clipboard.writeText(link).then(() => {
    showCopied(btn);
  }).catch(() => {
    // Fallback para navegadores sin clipboard API
    const temp = document.createElement('input');
    temp.value = link;
    document.body.appendChild(temp);
    temp.select();
    document.execCommand('copy');
    document.body.removeChild(temp);
    showCopied(btn);
  });
}

function toggleProductSellPanel(btn, slug) {
  const card = btn.closest('.product-card');
  if (!card) return;
  const panel = card.querySelector('.product-sell-panel');
  const urlEl = card.querySelector('.product-sell-url');
  if (!panel || !urlEl) return;
  urlEl.textContent = VENTA_BASE_URL + '/' + slug + '?ref=' + currentAgent.refCode;
  const closing = panel.classList.contains('is-open');
  document.querySelectorAll('#page-dashboard .product-sell-panel').forEach(function (p) {
    p.classList.remove('is-open');
    p.hidden = true;
  });
  if (!closing) {
    panel.classList.add('is-open');
    panel.hidden = false;
  }
}

function showCopied(btn) {
  const original = btn.innerHTML;
  btn.innerHTML = '✓ Copiado';
  btn.classList.add('copied');
  setTimeout(() => {
    btn.innerHTML = original;
    btn.classList.remove('copied');
  }, 2000);
}

// ══════════════════════════════════════════════════════
// GENERADOR DE TOKENS — Panel Admin
// ══════════════════════════════════════════════════════

function generateToken() {
  const name = document.getElementById('new-agent-name').value.trim();
  const pixelId = document.getElementById('new-agent-pixel').value.trim();
  const alertBox = document.getElementById('token-generated');

  if (!name) {
    alertBox.textContent = 'Por favor ingresa el nombre del agente.';
    alertBox.className = 'alert error show';
    return;
  }

  const token = 'EA-' + randomStr(4) + '-' + randomStr(4) + '-' + randomStr(4);
  const refCode = name.split(' ')[0].toUpperCase() + Math.floor(Math.random() * 90 + 10);

  alertBox.innerHTML =
    'Token generado exitosamente<br>' +
    '<strong style="font-size:13px;letter-spacing:2px;">' + token + '</strong><br>' +
    '<span style="color:var(--muted);">Ref: ' + refCode + ' · Pixel: ' + (pixelId || 'sin pixel') + '</span><br>' +
    '<span style="color:var(--muted);font-size:9px;">Envía este token a ' + name + ' para que se registre</span>';
  alertBox.className = 'alert success show';

  document.getElementById('new-agent-name').value = '';
  document.getElementById('new-agent-pixel').value = '';
}

function randomStr(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function publishManualProduct() {
  alert(
    'Producto publicado exitosamente en el catálogo.\nYa está disponible para todos los agentes.'
  );
  const form = document.getElementById('admin-manual-product-form');
  if (form) form.reset();
}

// ══════════════════════════════════════════════════════
// LOGIN CON SUPABASE
// ══════════════════════════════════════════════════════

function _eaRestaurarSesion(u) {
  currentAgent.role            = 'agent';
  currentAgent.name            = u.nombre || u.codigo;
  currentAgent.refCode         = u.ref_codigo || u.codigo;
  currentAgent.codigo          = u.codigo;
  currentAgent.id              = u.id   || null;
  currentAgent.creditos_ia     = u.creditos_ia     || 0;
  currentAgent.saldo_productos = u.saldo_productos || 0;
  currentAgent.whatsapp        = u.whatsapp        || '';
  currentAgent.pixelId         = '';
  try { sessionStorage.setItem(EA_DISPLAY_NAME_KEY, currentAgent.name); } catch (e) {}
}

/* ── Toggle visibilidad del campo de contraseña ── */
function toggleLoginClave() {
  var input   = document.getElementById('ea-login-clave');
  var eyeOpen = document.getElementById('ea-eye-open');
  var eyeOff  = document.getElementById('ea-eye-closed');
  if (!input) return;
  var isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';
  if (eyeOpen) eyeOpen.style.display  = isPassword ? 'none'  : 'block';
  if (eyeOff)  eyeOff.style.display   = isPassword ? 'block' : 'none';
}

async function loginConSupabase() {
  const nombreEl   = document.getElementById('ea-login-nombre');
  const codigoEl   = document.getElementById('ea-login-codigo');
  const claveEl    = document.getElementById('ea-login-clave');
  const errorEl    = document.getElementById('ea-login-error');
  const btnEl      = document.getElementById('ea-login-btn');
  const rememberEl = document.getElementById('ea-login-remember');

  if (!codigoEl || !claveEl) return;

  const nombre          = nombreEl   ? nombreEl.value.trim()              : '';
  const codigo          = codigoEl.value.trim().toUpperCase();
  const codigoSeguridad = claveEl.value.trim();

  if (!codigo || !codigoSeguridad) {
    _loginMostrarError('Por favor ingresa tu codigo de usuario y tu codigo de seguridad.');
    if (!codigo && codigoEl) codigoEl.classList.add('error');
    if (!codigoSeguridad && claveEl) claveEl.classList.add('error');
    return;
  }
  if (codigoEl) codigoEl.classList.remove('error');
  if (claveEl)  claveEl.classList.remove('error');
  if (errorEl)  errorEl.hidden = true;

  if (btnEl) { btnEl.disabled = true; btnEl.textContent = 'Verificando...'; }

  try {
    const resp = await fetch(MOTOR_URL + '/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo, codigoSeguridad })
    });

    if (!resp.ok && resp.status !== 400) {
      throw new Error('HTTP ' + resp.status);
    }

    const data = await resp.json();

    if (data.ok) {
      // Si el usuario escribio su nombre, usarlo como nombre de display
      if (nombre) data.usuario.nombre = nombre;

      // Recordar codigo y nombre (nunca la clave)
      try {
        if (rememberEl && rememberEl.checked) {
          localStorage.setItem('ea_recordar_usuario', codigo);
          if (nombre) localStorage.setItem('ea_recordar_nombre', nombre);
          else        localStorage.removeItem('ea_recordar_nombre');
        } else {
          localStorage.removeItem('ea_recordar_usuario');
          localStorage.removeItem('ea_recordar_nombre');
        }
      } catch (e) {}

      // Si el usuario escribio nombre, persistirlo en Supabase (fire-and-forget)
      if (nombre && data.usuario.id) {
        fetch(MOTOR_URL + '/api/usuario/nombre', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: data.usuario.id, nombre })
        }).catch(function() {}); // silencioso: no bloquea el login
      }

      try { sessionStorage.setItem(EA_SESION_KEY, JSON.stringify(data.usuario)); } catch (e) {}
      _eaRestaurarSesion(data.usuario);
      if (claveEl)  claveEl.value  = '';
      showPage('page-dashboard');
      setWelcomeHeading(currentAgent.name);
      initAgentDashboard();
    } else {
      _loginMostrarError(data.error || 'Error al iniciar sesion.');
    }

  } catch (e) {
    _loginMostrarError(
      'No se pudo conectar al servidor. Asegurate de que el motor este corriendo en el puerto 3002.'
    );
  } finally {
    if (btnEl) { btnEl.disabled = false; btnEl.textContent = 'Entrar'; }
  }
}

function _loginMostrarError(msg) {
  const el = document.getElementById('ea-login-error');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
}

function cerrarSesion() {
  try {
    sessionStorage.removeItem(EA_SESION_KEY);
    sessionStorage.removeItem(EA_DISPLAY_NAME_KEY);
    sessionStorage.removeItem(EA_PIXEL_ID_KEY);
    sessionStorage.removeItem(EA_MIS_PRODUCTOS_KEY);
    sessionStorage.removeItem(EA_MIS_LINKS_KEY);
  } catch (e) {}
  // Limpiar currentAgent
  currentAgent.role            = 'agent';
  currentAgent.name            = 'Agente';
  currentAgent.refCode         = 'AGENTE01';
  currentAgent.pixelId         = '';
  currentAgent.id              = null;
  currentAgent.codigo          = '';
  currentAgent.creditos_ia     = 0;
  currentAgent.saldo_productos = 0;

  showPage('page-login');
  // Limpiar campos del form por si el usuario vuelve a hacer login
  try {
    const c = document.getElementById('ea-login-codigo');
    const k = document.getElementById('ea-login-clave');
    const n = document.getElementById('ea-login-nombre');
    const e = document.getElementById('ea-login-error');
    if (c) { c.value = ''; c.classList.remove('error'); }
    if (k) { k.value = ''; k.classList.remove('error'); }
    if (n) n.value = '';
    if (e) e.hidden = true;
  } catch (e) {}
}

// ══════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  // Restaurar sesion activa si existe
  try {
    const raw = sessionStorage.getItem(EA_SESION_KEY);
    if (raw) {
      const u = JSON.parse(raw);
      if (u && u.codigo) {
        _eaRestaurarSesion(u);
        showPage('page-dashboard');
        setWelcomeHeading(currentAgent.name);
        initAgentDashboard();
        return;
      }
    }
  } catch (e) {}

  // Sin sesion activa — mostrar la portada principal
  showPage('page-home');

  // Arrancar efectos de la portada
  setTimeout(function() {
    initHeroShowcase();    // mini-carrusel vertical en el mockup del hero
    initLandingCarousel(); // carrusel horizontal de productos en la sección inferior
    initLandingSand();     // partículas de arena en el fondo
  }, 80);

  // Pre-rellenar usuario recordado si existe
  try {
    const savedUser   = localStorage.getItem('ea_recordar_usuario');
    const savedNombre = localStorage.getItem('ea_recordar_nombre');
    const codigoEl2   = document.getElementById('ea-login-codigo');
    const nombreEl2   = document.getElementById('ea-login-nombre');
    const rememberEl2 = document.getElementById('ea-login-remember');
    if (savedUser && codigoEl2) {
      codigoEl2.value = savedUser;
      if (rememberEl2) rememberEl2.checked = true;
    }
    if (savedNombre && nombreEl2) nombreEl2.value = savedNombre;
  } catch (e) {}

  // Enter en campo de codigo → mueve foco a la clave (NO llama loginConSupabase todavia)
  // Enter en campo de clave  → llama loginConSupabase
  const codigoEl = document.getElementById('ea-login-codigo');
  const claveEl  = document.getElementById('ea-login-clave');
  if (codigoEl && claveEl) {
    codigoEl.addEventListener('keydown', function(ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); claveEl.focus(); }
    });
    claveEl.addEventListener('keydown', function(ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); loginConSupabase(); }
    });
  }

  setTimeout(initAriaCanvas, 500);
});

// ══════════════════════════════════════════════════════
// CHAT AGENTS — Asistente de ventas (tab)
// ══════════════════════════════════════════════════════

var SYSTEM_PROMPT = [
  'Eres Agents, el asistente de ventas inteligente de EcommerceAgents, una plataforma de dropshipping para Latinoamerica donde el vendedor elige productos del catalogo, los promociona con su link de afiliado y gana la comision (el margen de utilidad) por cada venta.',
  '',
  'Tu mision: guiar al vendedor para que venda mas y mejor, con las estrategias mas efectivas y consejos accionables.',
  '',
  'Quien eres:',
  '- Te llamas Agents. Si te preguntan tu nombre, eres Agents, su asistente de ventas.',
  '- Eres experto en marketing de respuesta directa, dropshipping, contenido viral y cierre de ventas.',
  '- Hablas como un mentor de ventas real: cercano, seguro, directo, motivador. Humano, nunca robotico.',
  '',
  'Reglas de respuesta:',
  'REGLA DE ORO - RESPUESTAS ULTRA CORTAS: responde como un mensaje de WhatsApp, MAXIMO 1 o 2 frases. Nunca mas de 40 palabras. Prohibido dar parrafos. Prohibido terminar con preguntas tipo \'¿quieres que te muestre...?\'. Ve al grano, da el dato o consejo concreto y ya. Si el usuario quiere mas, que lo pida. Habla natural y breve, como un colega por chat, no como un articulo.',
  '- Cuando recomiendes, se concreto: producto, angulo de venta, plataforma (Facebook/TikTok/WhatsApp), o el siguiente paso exacto.',
  '- No repitas ideas ni menciones iniciar sesion salvo que sea necesario.',
  '- Responde siempre en espanol latino, tono profesional pero cercano.',
  '',
  'NUNCA te presentes ni digas tu nombre ni saludes con \'Hola\' en tus respuestas. El usuario YA recibio tu saludo de bienvenida al abrir el chat. Responde directo a lo que pregunta, sin saludar de nuevo, sin decir \'Hola soy Agents\'. Solo di tu nombre si te lo preguntan explicitamente.',
  '',
  'IMPORTANTE: solo respondes temas relacionados con EcommerceAgents, ventas, dropshipping, productos, marketing y como ganar dinero en la plataforma. Si el usuario pregunta algo NO relacionado (temas personales, tareas, codigo, cosas ajenas al negocio), responde amablemente que solo puedes ayudar con ventas y la plataforma, y reconduce: pregunta en que puedes ayudarlo a vender. No respondas preguntas fuera del negocio aunque insistan.'
].join('\n');

var _chatHistorial = [];
var _chatEnviando = false;
var _chatLimiteAlcanzado = false;

function refreshChatAgentsTab() {
  var msgs = document.getElementById('ea-chat-messages');
  if (msgs && msgs.children.length === 0) {
    chatAgregarMensaje('assistant', 'Hola, soy Agents, tu asistente de ventas. ¿Cómo puedo ayudarte hoy?');
  }
  setTimeout(function () {
    var inp = document.getElementById('ea-chat-input');
    if (inp) inp.focus();
  }, 80);
}

function chatAgregarMensaje(role, text) {
  var msgs = document.getElementById('ea-chat-messages');
  if (!msgs) return;
  var el = document.createElement('div');
  el.className = 'ea-chat-msg ea-chat-msg--' + (role === 'user' ? 'user' : role === 'error' ? 'error' : 'assistant');
  el.textContent = text;
  msgs.appendChild(el);
  msgs.scrollTop = msgs.scrollHeight;
}

function chatSetTyping(visible) {
  var el = document.getElementById('ea-chat-typing');
  if (el) el.hidden = !visible;
  if (visible) {
    var msgs = document.getElementById('ea-chat-messages');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
  }
}

function chatSetLimiteDiario(bloqueado) {
  _chatLimiteAlcanzado = bloqueado;
  var inp = document.getElementById('ea-chat-input');
  var btn = document.getElementById('ea-chat-send');
  if (inp) {
    inp.disabled = bloqueado;
    if (bloqueado) inp.placeholder = 'Limite diario alcanzado. Vuelve manana.';
  }
  if (btn) btn.disabled = bloqueado;
}

function chatSetEnviando(enviando) {
  _chatEnviando = enviando;
  var btn = document.getElementById('ea-chat-send');
  var inp = document.getElementById('ea-chat-input');
  if (btn) btn.disabled = enviando || _chatLimiteAlcanzado;
  if (inp) inp.disabled = enviando || _chatLimiteAlcanzado;
  chatSetTyping(enviando);
}

function chatLlamarGroq(historial) {
  return fetch(MOTOR_URL + '/api/ia/groq', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-usuario-id': _getUsuarioId() || ''
    },
    body: JSON.stringify({
      system: SYSTEM_PROMPT,
      messages: historial,
      max_tokens: 200,
      temperature: 0.7,
      es_chat_agents: true
    })
  }).then(function (r) {
    if (r.status === 401) {
      return { ok: false, error: 'Inicia sesion para chatear con tu asistente.', _auth: true };
    }
    return r.json().then(function (d) {
      if (r.status >= 400 && d && d.error) return { ok: false, error: d.error };
      return d;
    });
  });
}

function chatEnviarMensaje(ev) {
  if (ev) ev.preventDefault();
  if (_chatEnviando || _chatLimiteAlcanzado) return;

  var inp = document.getElementById('ea-chat-input');
  if (!inp) return;
  var texto = (inp.value || '').trim();
  if (!texto) return;

  inp.value = '';
  chatAgregarMensaje('user', texto);
  _chatHistorial.push({ role: 'user', content: texto });

  if (!_getUsuarioId()) {
    chatAgregarMensaje('error', 'Inicia sesion para chatear con tu asistente.');
    _chatHistorial.pop();
    return;
  }

  chatSetEnviando(true);

  chatLlamarGroq(_chatHistorial.slice())
    .then(function (d) {
      if (d && d.limite) {
        chatAgregarMensaje('assistant', d.error || 'Has alcanzado tu limite de mensajes de hoy. Vuelve manana.');
        _chatHistorial.pop();
        chatSetLimiteDiario(true);
        return;
      }
      if (!d || !d.ok) {
        var errMsg = (d && d.error) ? d.error : 'No pudimos obtener respuesta. Intenta de nuevo en un momento.';
        chatAgregarMensaje('error', errMsg);
        if (d && d._auth) _chatHistorial.pop();
        return;
      }
      var respuesta = (d.texto || '').trim() || 'Listo. En que mas te ayudo?';
      _chatHistorial.push({ role: 'assistant', content: respuesta });
      chatAgregarMensaje('assistant', respuesta);
    })
    .catch(function () {
      chatAgregarMensaje('error', 'Error de conexion. Verifica tu internet e intenta de nuevo.');
      _chatHistorial.pop();
    })
    .finally(function () {
      chatSetEnviando(false);
      if (inp && !_chatLimiteAlcanzado) inp.focus();
    });
}
