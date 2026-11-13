/**
 * Botões que transformam uma faixa solta em LISTA e navegam pela fila:
 *  - queue:album:<id>   → enfileira o álbum inteiro
 *  - queue:artist:<nome>→ enfileira mais músicas do artista
 *  - queue:page:<n>     → muda a página da fila (/fila)
 */
const {
  MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const config = require('../config');
const spotify = require('../music/spotify');
const yt = require('../music/ytdlp');
const { getContext } = require('../utils/checks');
const { enqueue } = require('../music/playQuery');
const { queueEmbed } = require('../utils/embeds');

const PER_PAGE = 10;

function pageButtons(page, pages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`queue:page:${page - 1}`)
      .setLabel('Anterior')
      .setEmoji('⬅️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`queue:page:${page + 1}`)
      .setLabel('Próxima')
      .setEmoji('➡️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= pages),
  );
}

module.exports = async function handleQueueButton(interaction) {
  const parts = interaction.customId.split(':');
  const action = parts[1];
  const payload = parts.slice(2).join(':');

  const c = getContext(interaction, { needSession: false, allowMoveIfIdle: true });
  if (c.error) return interaction.reply({ content: c.error, flags: MessageFlags.Ephemeral });

  const music = c.music;
  if (music && c.vc.id !== music.channelId) {
    return interaction.reply({
      content: '⚠️ Entre no mesmo canal de voz que eu para usar esse botão.',
      flags: MessageFlags.Ephemeral,
    });
  }

  if (action === 'page') {
    const targetPage = Math.max(1, Number(payload) || 1);
    const pages = Math.max(1, Math.ceil(music.queue.length / PER_PAGE));
    if (targetPage > pages) return interaction.editReply('❌ Página inválida.');
    const embed = queueEmbed(music, targetPage);
    await interaction.editReply({ embeds: [embed], components: [pageButtons(targetPage, pages)] });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    if (action === 'album') {
      if (!spotify.enabled()) {
        return interaction.editReply('❌ O Spotify não está configurado, então não consigo ler o álbum.');
      }
      const res = await spotify.resolve({ type: 'album', id: payload });
      if (!res.tracks.length) return interaction.editReply('🔍 Esse álbum não tem faixas.');
      await enqueue(interaction, res.tracks, { label: res.name });
      return;
    }

    if (action === 'artist') {
      let artist = payload;
      try { artist = decodeURIComponent(payload); } catch { /* já vem decodificado */ }
      const tracks = await yt.search(artist, config.searchResults);
      if (!tracks.length) return interaction.editReply(`🔍 Não encontrei nada de **${artist}**.`);
      await enqueue(interaction, tracks, { label: artist });
      return;
    }

    await interaction.editReply('❌ Botão desconhecido.');
  } catch (err) {
    console.error('[queueButtons]', err);
    await interaction.editReply(`❌ ${err.message}`);
  }
};
