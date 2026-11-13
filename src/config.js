require('dotenv').config();

const missing = ['DISCORD_TOKEN', 'CLIENT_ID'].filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`❌ Faltando no .env: ${missing.join(', ')}`);
  process.exit(1);
}

const tokenApplicationId = Buffer.from(process.env.DISCORD_TOKEN.split('.')[0], 'base64url').toString();
if (/^\d+$/.test(tokenApplicationId) && tokenApplicationId !== process.env.CLIENT_ID) {
  console.error(`❌ CLIENT_ID (${process.env.CLIENT_ID}) não corresponde ao bot do DISCORD_TOKEN (${tokenApplicationId}).`);
  process.exit(1);
}

const num = (v, d) => {
  if (v === undefined || v === '') return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

module.exports = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID || null,
  color: 0x1db954,
  spotify: {
    clientId: process.env.SPOTIFY_CLIENT_ID || '',
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET || '',
    market: process.env.SPOTIFY_MARKET || 'BR',
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite',
  },
  ytdlp: {
    path: process.env.YTDLP_PATH || 'yt-dlp',
    extraArgs: (process.env.YTDLP_EXTRA_ARGS || '').split(/\s+/).filter(Boolean),
    cookies: process.env.YTDLP_COOKIES || null,
  },
  defaultVolume: num(process.env.DEFAULT_VOLUME, 50),
  maxQueue: num(process.env.MAX_QUEUE, 500),
  /** Quantas faixas uma busca livre vira (a "lista" montada pelo /tocar). */
  searchResults: Math.min(25, Math.max(1, num(process.env.SEARCH_RESULTS, 10))),
  /** Auto-refill da fila: quando ativado, adiciona músicas automaticamente ao chegar no final. */
  autoRefill: process.env.AUTO_REFILL !== 'false',
  /** Quantas músicas restam na fila para disparar o auto-refill. */
  refillThreshold: num(process.env.REFILL_THRESHOLD, 5),
  /** Quantas músicas adicionar no auto-refill (máximo 30). */
  refillSize: Math.min(30, Math.max(1, num(process.env.REFILL_SIZE, 30))),
  idleLeaveSeconds: num(process.env.IDLE_LEAVE_SECONDS, 120),
  aloneLeaveSeconds: num(process.env.ALONE_LEAVE_SECONDS, 60),
  rooms: {
    categoryId: process.env.ROOMS_CATEGORY_ID || null,
    emptyDeleteSeconds: num(process.env.ROOM_EMPTY_DELETE_SECONDS, 30),
    maxPerUser: num(process.env.MAX_ROOMS_PER_USER, 1),
  },
};
