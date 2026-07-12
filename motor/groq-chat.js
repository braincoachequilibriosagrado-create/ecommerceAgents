'use strict';

/** Modelo Groq de chat (reemplazo post-decomision Llama, jul 2026) */
const GROQ_CHAT_MODEL = 'openai/gpt-oss-120b';
const GROQ_REASONING_EFFORT = 'low';
const GROQ_REASONING_TOKEN_BOOST = 2000;

/**
 * Arma el body para POST /chat/completions con parametros de razonamiento gpt-oss.
 * @param {{ messages: object[], max_tokens?: number, temperature?: number, model?: string, reasoning_effort?: string }} opts
 */
function buildGroqChatBody(opts) {
  const o = opts || {};
  const baseMax = Number.isFinite(Number(o.max_tokens)) && Number(o.max_tokens) > 0
    ? Number(o.max_tokens)
    : 1500;
  const model = o.model || GROQ_CHAT_MODEL;
  const body = {
    model,
    messages: o.messages || [],
    max_tokens: baseMax + GROQ_REASONING_TOKEN_BOOST,
    temperature: o.temperature != null ? o.temperature : 0.8
  };
  if (String(model).indexOf('gpt-oss') >= 0) {
    body.reasoning_effort = o.reasoning_effort || GROQ_REASONING_EFFORT;
  }
  return body;
}

/** Extrae texto visible de la respuesta Groq (modelos de razonamiento incluidos). */
function extractGroqText(data) {
  const msg = data && data.choices && data.choices[0] && data.choices[0].message;
  if (!msg) return '';
  const content = msg.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .filter(function (p) { return p && p.type === 'text' && p.text; })
      .map(function (p) { return p.text; })
      .join('')
      .trim();
  }
  return String(content || '').trim();
}

module.exports = {
  GROQ_CHAT_MODEL,
  GROQ_REASONING_EFFORT,
  GROQ_REASONING_TOKEN_BOOST,
  buildGroqChatBody,
  extractGroqText
};
