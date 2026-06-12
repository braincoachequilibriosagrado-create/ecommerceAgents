const express = require('express')

const mensajes = {}

const app = express()
app.use(express.json())

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

app.get('/mensajes/:agenteId', (req, res) => {
  const { agenteId } = req.params
  res.json({ mensajes: mensajes[agenteId] || [] })
})

module.exports = { app, mensajes }

if (require.main === module) {
  const PORT = Number(process.env.PORT) || 3001
  app.listen(PORT, () => {
    console.log(`[ecommerce-whatsapp] HTTP http://localhost:${PORT}`)
  })
}
