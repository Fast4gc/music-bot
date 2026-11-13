const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
} = require('discord.js');
const config = require('../config');

const LOOP_LABEL = { off: 'Desligado', track: '🔂 Música', queue: '🔁 Fila' };

function fmt(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

function progressBar(pos, dur, size = 18) {
  if (!dur) return '';
  const idx = Math.min(size - 1, Math.round((Math.min(pos, dur) / dur) * (size - 1)));
  return `${'▬'.repeat(idx)}🔘${'▬'.repeat(size - 1 - idx)}`;
}

const base = () => new EmbedBuilder().setColor(config.color);

/**
 * Embed "Tocando agora" com banner de IA gerado pelo Gemini.
 */
function nowPlayingEmbed(music, { withProgress = false } = {}) {
  const t = music.current;
  const e = base();
  if (!t) return e.setDescription('Nada tocando no momento.');

  const link = t.spotifyUrl || t.url;
  e.setAuthor({ name: music.isPaused ? '⏸️ Pausado' : '🎶 Tocando agora' })
    .setTitle(t.title.slice(0, 250))
    .setDescription(`por **${t.artist}**`);
  if (link) e.setURL(link);
  if (t.thumbnail) e.setThumbnail(t.thumbnail);

  // Banner de IA gerado pelo Gemini (se disponível)
  if (music.banner) {
    e.setDescription(`${music.banner}\n\npor **${t.artist}**`);
  }

  if (withProgress && t.duration) {
    e.setDescription(`${music.banner ? music.banner + '\n\n' : ''}por **${t.artist}**\n\n${progressBar(music.position, t.duration)}\n\`${fmt(music.position)} / ${fmt(t.duration)}\``);
  }

  e.addFields(
    { name: 'Duração', value: t.duration ? fmt(t.duration) : '—', inline: true },
    { name: 'Pedido por', value: t.requestedBy ?? '—', inline: true },
    { name: 'Volume', value: `${music.volume}%`, inline: true },
    { name: 'Repetir', value: LOOP_LABEL[music.loop], inline: true },
    { name: 'Na fila', value: String(music.queue.length), inline: true },
  );

  // Mostra o que vem a seguir: é a "lista" que o bot vai tocando.
  const next = music.upcoming ? music.upcoming(3) : music.queue.slice(0, 3);
  if (next.length) {
    e.addFields({
      name: '📃 Próximas',
      value: next.map((q, i) => `${i + 1}. ${q.title.slice(0, 60)} — ${q.artist.slice(0, 30)}`).join('\n').slice(0, 1024),
    });
  }

  e.setFooter({ text: t.source === 'spotify' ? 'Metadados: Spotify • Áudio: YouTube' : 'Fonte: YouTube' });
  return e;
}

/**
 * Controles de música atualizados e mais modernos.
 * Inclui botão de banner IA, fila, similar, e select menu de ações rápidas.
 */
function nowPlayingControls(music) {
  const b = (id, emoji, style = ButtonStyle.Secondary) =>
    new ButtonBuilder().setCustomId(`music:${id}`).setEmoji(emoji).setStyle(style);

  // Linha 1: Controles principais de reprodução
  const row1 = new ActionRowBuilder().addComponents(
    b('prev', '⏮️'),
    b('pause', music.isPaused ? '▶️' : '⏸️', ButtonStyle.Primary),
    b('skip', '⏭️'),
    b('stop', '⏹️', ButtonStyle.Danger),
    b('loop', music.loop === 'track' ? '🔂' : '🔁', music.loop === 'off' ? ButtonStyle.Secondary : ButtonStyle.Success),
  );

  // Linha 2: Fila, volume, IA
  const row2Components = [
    b('shuffle', '🔀'),
    b('voldown', '🔉'),
    b('volup', '🔊'),
    b('queue', '📜'),
    config.gemini.apiKey ? b('banner', '🎨', ButtonStyle.Secondary) : null,
  ].filter(Boolean);
  const row2 = new ActionRowBuilder().addComponents(row2Components);

  // Linha 3: Select menu de ações rápidas
  const row3 = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('music:quick')
      .setPlaceholder('⚡ Ações rápidas')
      .addOptions([
        { label: 'Regenerar banner IA', description: 'Criar um novo banner para esta música', value: 'banner', emoji: '🎨' },
        { label: 'Músicas similares', description: 'Usar IA para encontrar músicas parecidas', value: 'similar', emoji: '🔍' },
        { label: 'Ver fila completa', description: 'Abrir a fila paginada', value: 'queue', emoji: '📜' },
        { label: 'Limpar fila', description: 'Remover todas as músicas pendentes', value: 'clear', emoji: '🗑️' },
        { label: 'Enviar no privado', description: 'Salvar a música atual no seu DM', value: 'save', emoji: '💾' },
      ]),
  );

  return [row1, row2, row3];
}

const PER_PAGE = 10;

function queueEmbed(music, page = 1) {
  const pages = Math.max(1, Math.ceil(music.queue.length / PER_PAGE));
  page = Math.min(Math.max(1, page), pages);
  const start = (page - 1) * PER_PAGE;

  const lines = music.queue.slice(start, start + PER_PAGE).map(
    (t, i) => `\`${start + i + 1}.\` **${t.title.slice(0, 60)}** — ${t.artist.slice(0, 40)} \`${t.duration ? fmt(t.duration) : '?'}\``,
  );
  const total = music.queue.reduce((a, t) => a + (t.duration || 0), 0);
  const nowLine = music.current ? `**Agora:** ${music.current.title.slice(0, 80)} — ${music.current.artist.slice(0, 40)}\n\n` : '';

  return base()
    .setTitle('📜 Fila de reprodução')
    .setDescription(`${nowLine}${lines.join('\n') || '*A fila está vazia.*'}`)
    .setFooter({ text: `Página ${page}/${pages} • ${music.queue.length} faixa(s) • ${fmt(total)} • Repetir: ${LOOP_LABEL[music.loop]}` });
}

/** Embed mostrado depois que uma LISTA de músicas entra na fila. */
function queueAddedEmbed(tracks, { dropped = 0, position = 1 } = {}) {
  const shown = tracks.slice(0, 10);
  const lines = shown.map(
    (t, i) => `\`${position + i}.\` **${t.title.slice(0, 60)}** — ${t.artist.slice(0, 40)}${t.duration ? ` \`${fmt(t.duration)}\`` : ''}`,
  );
  const total = tracks.reduce((a, t) => a + (t.duration || 0), 0);

  const e = base()
    .setTitle('📃 Entrou na fila')
    .setDescription(lines.join('\n') || '*Nada foi adicionado.*');

  if (tracks.length > shown.length) {
    e.setDescription(`${e.data.description}\n*… e mais ${tracks.length - shown.length} faixa(s). Use \`/fila\` para ver tudo.*`);
  }

  e.setFooter({
    text: `${tracks.length} faixa(s) • ${fmt(total)} • pedido por ${tracks[0]?.requestedBy ?? '—'}${dropped ? ` • ${dropped} ignorada(s) (fila cheia)` : ''}`,
  });
  return e;
}

module.exports = { fmt, progressBar, nowPlayingEmbed, nowPlayingControls, queueEmbed, queueAddedEmbed, LOOP_LABEL, base };
