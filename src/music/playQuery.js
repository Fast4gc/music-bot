/**
 * Fluxo completo de "tocar algo": valida, resolve, conecta, enfileira e inicia.
 *
 * A ideia central: o bot sempre trabalha com uma LISTA de faixas.
 * Escolher uma música numa busca não toca só aquela — ela vira a cabeça da fila.
 */
const {
  ActionRowBuilder, StringSelectMenuBuilder, ComponentType,
} = require('discord.js');
const config = require('../config');
const { getContext, shuffleArray } = require('../utils/checks');
const { resolve } = require('./resolver');
const { fmt, queueAddedEmbed } = require('../utils/embeds');

/** Valida canal de voz/permissões e conecta o bot. Retorna { music } ou { error }. */
async function setup(interaction) {
  const c = getContext(interaction, { needSession: false, allowMoveIfIdle: true });
  if (c.error) return { error: c.error };
  const { vc } = c;

  const perms = vc.permissionsFor(interaction.guild.members.me);
  if (!perms?.has(['ViewChannel', 'Connect', 'Speak'])) {
    return { error: '❌ Não tenho permissão para entrar e falar nesse canal de voz.' };
  }

  const client = interaction.client;
  const music = client.music.get(interaction.guildId) ?? client.music.create(interaction.guild);
  music.textChannel = interaction.channel;

  try {
    await music.connect(vc);
  } catch (err) {
    return { error: `❌ ${err.message}` };
  }
  return { music };
}

/**
 * Adiciona uma LISTA de faixas à fila e responde à interação.
 * @param {object[]} tracks lista de faixas
 * @param {object} [opts]
 * @param {boolean} [opts.next] coloca no início da fila (toca depois da atual)
 * @param {boolean} [opts.shuffle] embaralha a lista adicionada
 * @param {string}  [opts.label] nome da lista (álbum, playlist, artista...)
 * @param {object[]} [opts.buttons] componentes extras na resposta
 */
async function enqueue(interaction, tracks, { next = false, shuffle = false, label = null, buttons = [] } = {}) {
  if (!tracks?.length) return interaction.editReply('🔍 Não encontrei nada para essa busca.');

  const s = await setup(interaction);
  if (s.error) return interaction.editReply(s.error);
  const { music } = s;

  const space = config.maxQueue - music.queue.length;
  if (space <= 0) return interaction.editReply(`❌ A fila está cheia (máx. ${config.maxQueue}).`);

  const added = tracks.slice(0, space);
  const dropped = tracks.length - added.length;
  if (shuffle && added.length > 1) shuffleArray(added);
  for (const t of added) t.requestedBy = interaction.user.toString();

  const wasIdle = !music.current;
  const position = music.add(added, next);

  const content =
    added.length === 1
      ? `${wasIdle ? '🎶 Começando a tocar' : '➕ Adicionada à fila'} — **${added[0].title}**`
      : `📃 **${added.length}** música(s) adicionadas à fila${label ? ` de **${label}**` : ''}` +
        `${wasIdle ? ' • começando a tocar' : ` • a partir da posição #${position}`}`;

  const payload = { content, embeds: [queueAddedEmbed(added, { dropped, position })] };
  if (buttons.length) payload.components = buttons;
  await interaction.editReply(payload);

  await music.start();
  return added;
}

/** Opções do menu de escolha (limite de 25 do Discord, valor único por faixa). */
function buildSelectOptions(tracks) {
  const seen = new Set();
  return tracks.slice(0, 25).map((t, i) => {
    let value = t.spotifyUrl || t.url || `idx:${i}`;
    if (seen.has(value)) value = `idx:${i}`;
    seen.add(value);
    return {
      label: t.title.slice(0, 100),
      description: `${t.artist}${t.duration ? ` • ${fmt(t.duration)}` : ''}`.slice(0, 100),
      value: value.slice(0, 100),
    };
  });
}

/** Descobre o índice da faixa escolhida a partir do valor do menu. */
function pickIndex(tracks, value) {
  const direct = tracks.findIndex((t) => (t.spotifyUrl || t.url) === value);
  if (direct >= 0) return direct;
  const m = /^idx:(\d+)$/.exec(value);
  return m ? Number(m[1]) : -1;
}

/**
 * Mostra um menu para o usuário escolher qual música começa a fila
 * e enfileira a LISTA inteira (a escolhida primeiro).
 */
async function chooseAndEnqueue(interaction, tracks, { next = false, shuffle = false, onlyOne = false, header = '' } = {}) {
  const options = buildSelectOptions(tracks);
  if (!options.length) return interaction.editReply('🔍 Não encontrei nada para essa busca.');

  const menu = new StringSelectMenuBuilder()
    .setCustomId('fila:escolher')
    .setPlaceholder('🎵 Qual música começa a lista?')
    .addOptions(options);

  const msg = await interaction.editReply({
    content: header || `🔎 Escolha a música que começa a lista (${tracks.length} opções):`,
    components: [new ActionRowBuilder().addComponents(menu)],
  });

  let chosen;
  try {
    const sel = await msg.awaitMessageComponent({
      componentType: ComponentType.StringSelect,
      filter: (i) => i.user.id === interaction.user.id,
      time: 60_000,
    });
    await sel.update({ content: '⏳ Montando a fila...', components: [] });
    chosen = pickIndex(tracks, sel.values[0]);
  } catch {
    return interaction.editReply({ content: '⌛ Tempo esgotado — nada foi adicionado à fila.', components: [] }).catch(() => {});
  }

  if (chosen < 0 || chosen >= tracks.length) {
    return interaction.editReply('❌ Não consegui identificar a música escolhida.');
  }

  const picked = tracks[chosen];
  const list = onlyOne ? [picked] : [picked, ...tracks.filter((_, i) => i !== chosen)];
  return enqueue(interaction, list, { next, shuffle });
}

/**
 * Atalho: resolve o pedido e joga na fila.
 * @param {string} query texto ou link
 * @param {object} [opts] { next, shuffle, onlyOne }
 */
async function playQuery(interaction, query, { next = false, shuffle = false, onlyOne = false } = {}) {
  let result;
  try {
    result = await resolve(query);
  } catch (err) {
    return interaction.editReply(`❌ ${err.message}`);
  }

  const tracks = result.tracks ?? [];
  if (!tracks.length) return interaction.editReply('🔍 Não encontrei nada para essa busca.');

  // Resultado de busca vira lista: o usuário escolhe qual começa.
  if (result.type === 'search' && tracks.length > 1 && !onlyOne) {
    return chooseAndEnqueue(interaction, tracks, {
      next,
      shuffle,
      header: `🔎 **${result.name}** — ${tracks.length} resultados. Escolha qual começa a lista:`,
    });
  }

  const list = result.type === 'search' ? tracks.slice(0, 1) : tracks;
  return enqueue(interaction, list, { next, shuffle, label: result.name });
}

module.exports = { setup, enqueue, chooseAndEnqueue, playQuery, buildSelectOptions, pickIndex };
