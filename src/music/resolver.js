/** Converte o texto digitado pelo usuário em uma LISTA de faixas. */
const config = require('../config');
const spotify = require('./spotify');
const yt = require('./ytdlp');

const isUrl = (s) => /^https?:\/\//i.test(s);
const isPlaylistUrl = (s) =>
  /(?:youtube\.com|music\.youtube\.com)\/playlist\?/i.test(s) || /soundcloud\.com\/[^/]+\/sets\//i.test(s);

/**
 * Resolve um pedido em uma lista de faixas.
 *
 * - link de playlist/álbum/artista  → todas as faixas
 * - link de música                  → 1 faixa
 * - texto livre                     → até `limit` resultados (viram a "lista" do /tocar)
 *
 * @returns {Promise<{type: string, name: string, tracks: object[], source?: string}>}
 */
async function resolve(query, { limit = config.searchResults } = {}) {
  query = String(query ?? '').trim();
  if (!query) throw new Error('Diga o que você quer ouvir.');

  const sp = spotify.parseUrl(query);
  if (sp) {
    if (!spotify.enabled()) throw new Error('Links do Spotify precisam de SPOTIFY_CLIENT_ID e SPOTIFY_CLIENT_SECRET no .env.');
    return spotify.resolve(sp);
  }

  if (isUrl(query)) {
    if (isPlaylistUrl(query)) {
      const tracks = await yt.playlist(query);
      return { type: 'playlist', name: 'Playlist', tracks };
    }
    const t = await yt.info(query);
    return { type: 'track', name: t.title, tracks: [t] };
  }

  // Texto livre → uma LISTA de resultados. O usuário escolhe qual começa a fila.
  if (spotify.enabled()) {
    const tracks = await spotify.searchTracks(query, limit);
    if (tracks.length) return { type: 'search', name: query, tracks, source: 'spotify' };
  }
  const tracks = await yt.search(query, limit);
  return { type: 'search', name: query, tracks, source: 'youtube' };
}

module.exports = { resolve };
