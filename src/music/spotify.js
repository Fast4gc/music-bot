/**
 * Cliente mínimo da Web API do Spotify (Client Credentials).
 * O Spotify NÃO libera áudio via API: aqui só pegamos metadados (nome, artista,
 * duração, capa). O áudio é buscado depois no YouTube (ver ytdlp.js).
 *
 * Ajustado para as mudanças de fevereiro/2026:
 *  - busca: máximo de 10 resultados por página
 *  - playlists: /playlists/{id}/items (antes /tracks) e item vem em `item`
 *  - removidos: top-tracks de artista, endpoints em lote (GET /tracks?ids=...)
 */
const config = require('../config');

const BASE = 'https://api.spotify.com/v1';
const MAX_TRACKS = 500;

let token = null;
let tokenExpires = 0;

const enabled = () => Boolean(config.spotify.clientId && config.spotify.clientSecret);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getToken() {
  if (token && Date.now() < tokenExpires - 30_000) return token;
  const basic = Buffer.from(`${config.spotify.clientId}:${config.spotify.clientSecret}`).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw Object.assign(new Error(`Falha ao autenticar no Spotify (${res.status}). Confira CLIENT_ID/SECRET.`), { status: res.status });
  const data = await res.json();
  token = data.access_token;
  tokenExpires = Date.now() + data.expires_in * 1000;
  return token;
}

async function api(path, params = {}, retry = true) {
  const url = new URL(path.startsWith('http') ? path : `${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) url.searchParams.set(k, v);

  const res = await fetch(url, { headers: { Authorization: `Bearer ${await getToken()}` } });
  if (res.status === 429 && retry) {
    await sleep((Number(res.headers.get('retry-after')) || 1) * 1000);
    return api(path, params, false);
  }
  if (!res.ok) throw Object.assign(new Error(`Spotify API respondeu ${res.status}`), { status: res.status });
  return res.json();
}

const SPOTIFY_RE =
  /^(?:https?:\/\/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(?:embed\/)?(track|album|playlist|artist)\/([A-Za-z0-9]+)|spotify:(track|album|playlist|artist):([A-Za-z0-9]+))/i;

function parseUrl(input) {
  const m = String(input).trim().match(SPOTIFY_RE);
  if (!m) return null;
  return { type: (m[1] || m[3]).toLowerCase(), id: m[2] || m[4] };
}

function toTrack(t, fallbackImage = null) {
  const album = t.album || null;
  return {
    title: t.name,
    artist: (t.artists || []).map((a) => a.name).join(', ') || 'Desconhecido',
    duration: Math.round((t.duration_ms || 0) / 1000),
    thumbnail: album?.images?.[0]?.url || fallbackImage,
    albumId: album?.id || null, // permite montar a fila com o álbum inteiro
    albumName: album?.name || null,
    spotifyUrl: t.external_urls?.spotify || (t.id ? `https://open.spotify.com/track/${t.id}` : null),
    url: null, // resolvido sob demanda no YouTube
    source: 'spotify',
  };
}

async function searchTracks(query, limit = 10) {
  const data = await api('/search', { q: query, type: 'track', limit: Math.min(limit, 10), market: config.spotify.market });
  return (data.tracks?.items || []).filter(Boolean).map((t) => toTrack(t));
}

async function resolve({ type, id }) {
  const market = config.spotify.market;
  try {
    switch (type) {
      case 'track': {
        const t = await api(`/tracks/${id}`, { market });
        return { type: 'track', name: t.name, tracks: [toTrack(t)] };
      }

      case 'album': {
        const album = await api(`/albums/${id}`, { market });
        const img = album.images?.[0]?.url || null;
        let page = album.tracks;
        const items = [...(page?.items || [])];
        while (page?.next && items.length < MAX_TRACKS) {
          page = await api(page.next);
          items.push(...(page.items || []));
        }
        const artists = (album.artists || []).map((a) => a.name).join(', ');
        return {
          type: 'album',
          name: `${album.name}${artists ? ` — ${artists}` : ''}`,
          tracks: items.filter(Boolean).slice(0, MAX_TRACKS).map((t) => toTrack(t, img)),
        };
      }

      case 'playlist': {
        const pl = await api(`/playlists/${id}`, { market });
        let page;
        try {
          page = await api(`/playlists/${id}/items`, { market, limit: 50 });
        } catch (err) {
          if (err.status !== 404) throw err;
          page = await api(`/playlists/${id}/tracks`, { market, limit: 50 }); // compatibilidade
        }
        const out = [];
        while (page) {
          for (const it of page.items || []) {
            const t = it?.item ?? it?.track; // `item` desde fev/2026
            if (t && t.name && t.type !== 'episode' && !t.is_local) out.push(toTrack(t));
          }
          if (!page.next || out.length >= MAX_TRACKS) break;
          page = await api(page.next);
        }
        return { type: 'playlist', name: pl.name, tracks: out.slice(0, MAX_TRACKS) };
      }

      case 'artist': {
        // /artists/{id}/top-tracks foi removido; usamos a busca como alternativa.
        const artist = await api(`/artists/${id}`);
        const tracks = await searchTracks(`artist:"${artist.name}"`, 10);
        return { type: 'artist', name: `Músicas de ${artist.name}`, tracks };
      }
    }
  } catch (err) {
    if (err.status === 403 || err.status === 404) {
      throw new Error(
        type === 'playlist'
          ? 'Não consegui ler essa playlist. Playlists privadas, de outros usuários ou geradas pelo Spotify podem estar bloqueadas pela API.'
          : 'O Spotify não liberou esse conteúdo para o bot.',
      );
    }
    throw err;
  }
  throw new Error('Tipo de link do Spotify não suportado.');
}

module.exports = { enabled, parseUrl, resolve, searchTracks };
