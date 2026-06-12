const { mensajes } = require('./server')

/**
 * @param {string} agenteId Mismo refCode que en /qr/:refCode, etc.
 * @param {object} sock Socket Baileys (sendMessage).
 */
function messagesUpsertHandler(agenteId, sock) {
  return async ({ messages, type }) => {
    for (const msg of messages) {
      if (!msg.message) continue

      const from = msg.key?.remoteJid || ''
      const pushName = msg.pushName || ''
      console.log('[WA] Mensaje de', from, pushName, type)

      const texto =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        ''

      if (!mensajes[agenteId]) mensajes[agenteId] = []
      mensajes[agenteId].push({
        ts: Date.now(),
        type,
        from,
        pushName,
        texto,
        id: msg.key?.id
      })

      const max = 300
      if (mensajes[agenteId].length > max) {
        mensajes[agenteId].splice(0, mensajes[agenteId].length - max)
      }

      if (type !== 'notify' || msg.key?.fromMe || !texto || !sock || !from) {
        continue
      }

      const apiKey = process.env.GROQ_API_KEY
      if (!apiKey) {
        console.warn('[WA] GROQ_API_KEY no definida; se omite respuesta automática.')
        continue
      }

      try {
        const respuesta = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + apiKey
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [
              {
                role: 'system',
                content:
                  'Eres un asistente de ventas amable para una tienda online. Responde en español de forma corta y directa.'
              },
              { role: 'user', content: texto }
            ],
            max_tokens: 200
          })
        })
        const respuestaData = await respuesta.json()
        if (!respuesta.ok) {
          console.error('[WA] Groq API error:', respuesta.status, respuestaData)
          continue
        }
        const textoRespuesta = respuestaData.choices?.[0]?.message?.content
        if (!textoRespuesta) continue
        await sock.sendMessage(from, { text: textoRespuesta })
        console.log('[WA] Respuesta enviada:', textoRespuesta)
      } catch (e) {
        console.error('[WA] Error en respuesta automática Groq:', e)
      }
    }
  }
}

module.exports = { messagesUpsertHandler }
