/** Camada fina sobre o yt-dlp: busca, metadados e stream de áudio. */
const { spawn } = require('child_process');
const config = require('../config');

function baseArgs() {
  const args = ['--no-warnings', ...config.ytdlp.extraArgs];
  if (config.ytdlp.cookies) args.push('--cookies', config.ytdlp.cookies);
  return args;
}

function cleanError(stderr) {
  const lines = stderr.split('\n').map((l) => l.trim()).filter(Boolean);
  const line = [...lines].reverse().find((l) => l.startsWith('ERROR')) || lines.at(-1) || '';
  return line.replace(/^ERROR:\s*/, '').slice(0, 300);
}

function run(args, timeoutMs = 45_000) {
  return new Promise((resolve, reject) => {
    const proc = spawn(config.ytdlp.path, [...baseArgs(), ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error('O yt-dlp demorou demais para responder.'));
    }, timeoutMs);

    proc.stdout.on('data', (d) => (out += d));
    proc.stderr.on('data', (d) => (err += d));
    proc.on('error', (e) => {
      clearTimeout(timer);
      reject(e.code === 'ENOENT' ? new Error('yt-dlp não encontrado. Instale-o ou ajuste YTDLP_PATH no .env.') : e);
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      // Em playlists, algumas entradas podem falhar mas ainda gerar saída útil.
      if (code === 0 || out.trim()) resolve(out);
      else reject(new Error(cleanError(err) || `yt-dlp terminou com código ${code}`));
    });
  });
}

function toEntry(j) {
  const url =
    j.webpage_url ||
    (j.url && /^https?:\/\//.test(j.url) ? j.url : j.id ? `https://www.youtube.com/watch?v=${j.id}` : null);
  return {
    title: j.title || 'Sem título',
    artist: String(j.artist || j.channel || j.uploader || 'Desconhecido').replace(/ - Topic$/, ''),
    duration: j.duration ? Math.round(j.duration) : 0,
    thumbnail: j.thumbnail || j.thumbnails?.at(-1)?.url || null,
    album: j.album || null,
    url,
    source: 'youtube',
  };
}

const parseLines = (out) =>
  out.split('\n').filter((l) => l.trim().startsWith('{')).map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);

/** Busca no YouTube. */
async function search(query, n = 5) {
  const out = await run(['--flat-playlist', '-j', `ytsearch${n}:${query}`]);
  return parseLines(out).map(toEntry).filter((e) => e.url);
}

/** Metadados de uma URL única (YouTube, SoundCloud, etc.). */
async function info(url) {
  const out = await run(['-j', '--no-playlist', url]);
  const [first] = parseLines(out);
  if (!first) throw new Error('Não consegui ler esse link.');
  return toEntry(first);
}

/** Playlist (YouTube/SoundCloud). */
async function playlist(url, max = 100) {
  const out = await run(['--flat-playlist', '-j', '--playlist-end', String(max), url], 90_000);
  return parseLines(out).map(toEntry).filter((e) => e.url);
}

/** Acha no YouTube o equivalente de uma faixa do Spotify (compara a duração). */
async function matchSpotifyTrack(track) {
  const results = await search(`${track.artist} - ${track.title}`, 5);
  if (!results.length) throw new Error('Não encontrei essa música no YouTube.');
  if (track.duration) {
    const close = results.find((r) => r.duration && Math.abs(r.duration - track.duration) <= 10);
    if (close) return close;
  }
  return results[0];
}

/** Inicia o yt-dlp escrevendo o áudio no stdout. */
function createStream(url) {
  const args = [
    '-f', 'bestaudio/best', '-o', '-', '--no-playlist', '--quiet', '--retries', '3', url,
  ];
  const proc = spawn(config.ytdlp.path, [...baseArgs(), ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  const handle = { proc, stream: proc.stdout, killed: false, stderr: '', spawnError: null };
  proc.stderr.on('data', (d) => { handle.stderr = (handle.stderr + d).slice(-1500); });
  proc.stdout.on('error', () => {});
  proc.on('error', (e) => { handle.spawnError = e; });
  return handle;
}

module.exports = { search, info, playlist, matchSpotifyTrack, createStream, cleanError };
