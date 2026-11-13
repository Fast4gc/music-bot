/**
 * Agente de IA (Gemini 2.5 Pro) para o bot de música.
 * Funções:
 *  - recomendar músicas semelhantes (auto-refill da fila)
 *  - gerar banners de texto personalizados por música
 *  - analisar/verificar usuários (perfil, confiança)
 *  - responder dúvidas de ajuda sobre o bot
 *
 * Proteções contra sobrecarga:
 *  - Retry com backoff exponencial para 503/429 (alta demanda)
 *  - Cache de banners por música (não regenera sempre)
 *  - Timeout nas requisições (não trava o bot)
 *  - Rate limit simples (máximo 1 requisição por segundo por guild)
 */

const config = require('../config');

const GEMINI_MODEL = config.gemini.model || 'gemini-2.5-pro';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const headers = {
  'Content-Type': 'application/json',
  'x-goog-api-key': config.gemini.apiKey,
};

const schema = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      query: { type: 'STRING' },
      reason: { type: 'STRING' },
    },
    required: ['query'],
  },
};

// ── Cache de banners (chave: "titulo - artista") ──
const bannerCache = new Map();
const BANNER_CACHE_TTL = 1000 * 60 * 60 * 24; // 24 horas

// ── Rate limit simples (timestamp da última requisição por guild) ──
const lastRequestByGuild = new Map();
const RATE_LIMIT_MS = 1500; // mínimo 1,5s entre requisições da mesma guild

function rateLimitKey(guildId) {
  return guildId || 'global';
}

async function waitForRateLimit(guildId) {
  const key = rateLimitKey(guildId);
  const last = lastRequestByGuild.get(key) ?? 0;
  const now = Date.now();
  const wait = RATE_LIMIT_MS - (now - last);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestByGuild.set(key, Date.now());
}

/**
 * Chama o Gemini com retry automático para 503/429 e timeout.
 */
async function geminiGenerate(systemInstruction, userPrompt, { temperature = 0.7, responseMimeType = 'text/plain', responseSchema = null, guildId = null, maxRetries = 3 } = {}) {
  if (!config.gemini.apiKey) {
    throw new Error('GEMINI_API_KEY não configurada no .env.');
  }

  await waitForRateLimit(guildId);

  const body = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ parts: [{ text: userPrompt }] }],
    generationConfig: { temperature, responseMimeType },
  };
  if (responseSchema) body.generationConfig.responseSchema = responseSchema;

  let lastError = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30_000); // 30s timeout

      const res = await fetch(GEMINI_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.status === 429 || res.status === 503) {
        const detail = await res.text().catch(() => '');
        const retryAfter = Number(res.headers.get('retry-after')) || 0;
        const waitMs = retryAfter > 0 ? retryAfter * 1000 : Math.pow(2, attempt) * 3000; // backoff: 3s, 6s, 12s
        lastError = new Error(`Google AI Studio respondeu ${res.status} (alta demanda). Tentando novamente em ${Math.round(waitMs / 1000)}s...`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        let message = '';
        try { message = JSON.parse(detail).error?.message || ''; } catch { /* não-JSON */ }
        throw new Error(`Google AI Studio respondeu ${res.status}${message ? `: ${message}` : '.'}`);
      }

      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch (err) {
      lastError = err;
      // Se não é erro de rede/timeout e não é 429/503, não tenta de novo
      if (err.name === 'AbortError') {
        throw new Error('A requisição ao Gemini excedeu o tempo limite (30s).');
      }
      if (attempt < maxRetries - 1 && (err.message.includes('429') || err.message.includes('503'))) {
        continue;
      }
      break;
    }
  }

  throw lastError || new Error('Falha ao contatar o Google AI Studio após várias tentativas.');
}

/**
 * Recomenda músicas reais e existentes para encher a fila.
 * Retorna [{ query: "artista - título", reason: "por que combina" }]
 */
async function recommend(prompt, limit = 30, guildId = null) {
  const text = await geminiGenerate(
    `Você é um DJ experiente. Recomende exatamente ${limit} músicas reais e existentes que combinem com o pedido.`,
    `Pedido: "${prompt}"\nGere no máximo ${limit} recomendações. query deve ser "artista - título". reason explica brevemente por que combina.`,
    { temperature: 0.8, responseMimeType: 'application/json', responseSchema: schema, guildId },
  );

  let list;
  try { list = JSON.parse(text); } catch { throw new Error('A resposta da IA veio em formato inválido.'); }
  return list
    .filter((x) => typeof x?.query === 'string' && x.query.trim())
    .slice(0, limit);
}

/**
 * Gera um banner de texto estilizado para embeds do Discord.
 * Estilos: 'spotify', 'neon', 'retro', 'minimal'
 */
async function generateBanner(text, style = 'spotify', guildId = null) {
  const styleInstructions = {
    neon: 'Estilo neon cyberpunk, símbolos brilhantes, cores vibrantes, vibe synthwave.',
    retro: 'Estilo retrô anos 80, caracteres blocos, vibe arcade/fita cassete.',
    minimal: 'Estilo minimalista, limpo, apenas o essencial.',
    spotify: 'Estilo Spotify: verde, preto, branco, moderno, elegante, relacionado à música.',
  };

  return geminiGenerate(
    'Você é um designer gráfico especializado em banners de texto para Discord. Crie um banner visual usando apenas caracteres ASCII/Unicode dentro de um bloco de código. Retorne APENAS o bloco de código, sem texto extra.',
    `Crie um banner de texto com o conteúdo: "${text}"\nEstilo: ${styleInstructions[style] || styleInstructions.spotify}\nLargura máxima: ~40 caracteres por linha. Use caracteres como █, ▓, ▒, ░, ▄, ▀, │, ┌, ┐, └, ┘, ─, ★, ☆, ♫, ♪, 🎵, 🎶, 🎧, 🎼, 🎹, 🎸, 🎤, 💿, 📀.\nO banner deve ser atraente e caber em um embed do Discord.`,
    { temperature: 0.6, guildId },
  );
}

/**
 * Gera um banner específico para uma música (título + artista).
 * Usa cache para não gerar o mesmo banner várias vezes (economiza requisições).
 */
async function generateMusicBanner(title, artist, guildId = null) {
  const cacheKey = `${String(title || '').trim()} - ${String(artist || '').trim()}`;
  const now = Date.now();

  const cached = bannerCache.get(cacheKey);
  if (cached && now - cached.timestamp < BANNER_CACHE_TTL) {
    return cached.banner;
  }

  const banner = await geminiGenerate(
    'Você é um designer gráfico especializado em capas de álbum e banners musicais para Discord. Crie um banner visual em ASCII/Unicode dentro de um bloco de código. Retorne APENAS o bloco de código.',
    `Crie um banner de música para tocar agora no Discord:\nMúsica: "${title}"\nArtista: "${artist}"\nEstilo: moderno, elegante, relacionado ao gênero da música.\nLargura máxima: ~40 caracteres por linha. Use símbolos musicais ♫ ♪ 🎵 🎶 🎧 🎸 🎹 🎤 💿.\nO banner deve conter o nome da música e do artista de forma estilizada.\nRetorne APENAS o bloco de código com o banner.`,
    { temperature: 0.7, guildId },
  );

  bannerCache.set(cacheKey, { banner, timestamp: now });

  // Limpa o cache se ficar muito grande (máximo 500 entradas)
  if (bannerCache.size > 500) {
    const firstKey = bannerCache.keys().next().value;
    bannerCache.delete(firstKey);
  }

  return banner;
}

/**
 * Analisa um usuário do Discord e retorna um perfil de confiança.
 */
async function verifyUser(user, guildId = null) {
  const text = await geminiGenerate(
    'Você é um analista de perfis de Discord. Avalie o usuário com base apenas nos dados públicos disponíveis e retorne um perfil de confiança em JSON.',
    `Dados do usuário:\n- Nome: ${user.username}\n- Tag: ${user.discriminator ?? 'sem tag'}\n- ID: ${user.id}\n- É bot: ${user.bot}\n- Nome global: ${user.globalName ?? 'não definido'}\n\nRetorne JSON com: nivelConfianca (1-10), perfil (string curta), recomendacao (string curta), risco (baixo/medio/alto).`,
    { temperature: 0.3, responseMimeType: 'application/json', responseSchema: {
      type: 'OBJECT',
      properties: {
        nivelConfianca: { type: 'NUMBER' },
        perfil: { type: 'STRING' },
        recomendacao: { type: 'STRING' },
        risco: { type: 'STRING' },
      },
      required: ['nivelConfianca', 'perfil', 'recomendacao', 'risco'],
    }, guildId },
  );

  try { return JSON.parse(text); } catch { return { nivelConfianca: 5, perfil: 'Não foi possível analisar', recomendacao: 'Use com cautela', risco: 'medio' }; }
}

/**
 * Responde dúvidas de ajuda sobre o bot de música.
 */
async function helpAnswer(question, guildId = null) {
  const text = await geminiGenerate(
    'Você é um assistente especializado no bot de música para Discord. Responda em português de forma clara, objetiva e amigável.',
    `Pergunta do usuário: "${question}"\n\nComandos disponíveis:\n/tocar, /buscar, /fila, /pular, /remover, /limpar, /embaralhar, /repetir, /voltar, /parar, /pausar, /continuar, /volume, /tocando, /salvar, /entrar, /sair, /sala, /ping, /ajuda, /banner, /banner-musica, /verificar-usuario, /ia-ajuda, /dj.\n\nResponda apenas sobre o funcionamento deste bot.`,
    { temperature: 0.5, guildId },
  );
  return text;
}

/**
 * Limpa o cache de banners (útil para testes ou liberação de memória).
 */
function clearBannerCache() {
  bannerCache.clear();
}

module.exports = { recommend, generateBanner, generateMusicBanner, verifyUser, helpAnswer, GEMINI_MODEL, clearBannerCache };
