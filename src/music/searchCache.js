/**
 * Cache curto das buscas do autocomplete.
 * Serve para o /tocar montar EXATAMENTE a mesma lista que o usuário viu no menu.
 */
const TTL = 5 * 60 * 1000;
const cache = new Map();

const key = (guildId, userId) => `${guildId}:${userId}`;

function put(guildId, userId, query, tracks) {
  cache.set(key(guildId, userId), { query, tracks, at: Date.now() });
}

function get(guildId, userId) {
  const hit = cache.get(key(guildId, userId));
  if (!hit) return null;
  if (Date.now() - hit.at > TTL) {
    cache.delete(key(guildId, userId));
    return null;
  }
  return hit;
}

module.exports = { put, get };
