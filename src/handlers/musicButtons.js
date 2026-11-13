const {
  MessageFlags, ComponentType, StringSelectMenuBuilder, ActionRowBuilder,
} = require('discord.js');
const dj = require('../music/djAgent');
const yt = require('../music/ytdlp');
const { enqueue } = require('../music/playQuery');
const { nowPlayingEmbed, nowPlayingControls, queueEmbed } = require('../utils/embeds');
const { error, info, success, warning } = require('../utils/messages');

const EPHEMERAL = { flags: MessageFlags.Ephemeral };

module.exports = async function handleMusicButton(interaction) {
  const reply = (content) => interaction.reply({ content, ...EPHEMERAL });

  const music = interaction.client.music.get(interaction.guildId);
  if (!music) return reply('❌ Não tem nada tocando agora.');

  const vc = interaction.member.voice?.channel;
  if (!vc || vc.id !== music.channelId) return reply('⚠️ Entre no mesmo canal de voz que eu para usar os controles.');

  const refresh = () => interaction.update({ embeds: [nowPlayingEmbed(music)], components: nowPlayingControls(music) });

  // ── Select menu de ações rápidas ──
  if (interaction.customId.startsWith('music:quick')) {
    const value = interaction.values?.[0];
    await interaction.deferUpdate();

    switch (value) {
      case 'banner':
        return handleBanner(interaction, music);
      case 'similar':
        return handleSimilar(interaction, music);
      case 'queue':
        return interaction.followUp({ embeds: [queueEmbed(music)], ...EPHEMERAL });
      case 'clear': {
        const n = music.clear();
        await refresh();
        return interaction.followUp(successPayload(`🗑️ ${n} faixa(s) removida(s) da fila.`));
      }
      case 'save': {
        if (!music.current) return interaction.followUp(errorPayload('Não tem nada tocando agora.'));
        try {
          await interaction.user.send({ content: '💾 Música salva:', embeds: [nowPlayingEmbed(music)] });
          await interaction.followUp(successPayload('📬 Enviei no seu privado!'));
        } catch {
          await interaction.followUp(errorPayload('Não consegui enviar DM. Habilite mensagens diretas deste servidor.'));
        }
        return;
      }
      default:
        return interaction.followUp(errorPayload('Ação desconhecida.'));
    }
  }

  const action = interaction.customId.split(':')[1];

  switch (action) {
    case 'pause':
      music.isPaused ? music.resume() : music.pause();
      return refresh();

    case 'loop':
      music.setLoop({ off: 'track', track: 'queue', queue: 'off' }[music.loop]);
      return refresh();

    case 'volup':
      music.setVolume(Math.min(150, music.volume + 10));
      return refresh();

    case 'voldown':
      music.setVolume(Math.max(5, music.volume - 10));
      return refresh();

    case 'shuffle':
      music.shuffle();
      return reply('🔀 Fila embaralhada.');

    case 'queue':
      return interaction.reply({ embeds: [queueEmbed(music)], ...EPHEMERAL });

    case 'banner':
      return handleBanner(interaction, music);

    case 'skip': {
      if (!music.current) return reply('❌ Não tem nada tocando.');
      await interaction.deferReply(EPHEMERAL);
      await music.skip();
      return interaction.editReply('⏭️ Música pulada.');
    }

    case 'prev': {
      await interaction.deferReply(EPHEMERAL);
      return interaction.editReply(music.previous() ? '⏮️ Voltando para a anterior.' : '❌ Não há música anterior.');
    }

    case 'stop':
      music.stop();
      return reply('⏹️ Reprodução parada e fila limpa.');
  }
};

/** Regenera o banner IA da música atual. */
async function handleBanner(interaction, music) {
  if (!dj.GEMINI_MODEL || !interaction.client.music) {
    return interaction.reply({ content: '❌ O Gemini não está configurado para gerar banners.', ...EPHEMERAL });
  }
  const t = music.current;
  if (!t) return interaction.reply({ content: '❌ Não tem música tocando.', ...EPHEMERAL });

  await interaction.deferReply(EPHEMERAL);
  try {
    // Força regeneração do banner
    music.banner = null;
    music.bannerGenerated = false;
    await music._generateBannerForCurrent();
    if (music.banner) {
      await interaction.editReply({ content: '🎨 Banner regenerado com sucesso!', ...EPHEMERAL });
    } else {
      await interaction.editReply({ content: '⚠️ Não consegui gerar o banner desta vez. Tente novamente.', ...EPHEMERAL });
    }
  } catch (err) {
    await interaction.editReply({ content: `❌ Erro ao gerar banner: ${err.message}`, ...EPHEMERAL });
  }
}

/** Sugere músicas similares usando IA e adiciona à fila. */
async function handleSimilar(interaction, music) {
  const t = music.current;
  if (!t) return interaction.reply({ content: '❌ Não tem música tocando.', ...EPHEMERAL });

  await interaction.deferReply(EPHEMERAL);
  try {
    const recommendations = await dj.recommend(`Músicas parecidas com "${t.artist} - ${t.title}"`, 10);
    const tracks = [];
    for (const item of recommendations) {
      try {
        const [track] = await yt.search(item.query, 1);
        if (track?.url) tracks.push(track);
      } catch { /* ignora faixa indisponível */ }
    }
    if (!tracks.length) {
      return interaction.editReply({ content: '❌ Não encontrei músicas similares no YouTube.', ...EPHEMERAL });
    }
    await enqueue(interaction, tracks, { label: `Similar a ${t.title}` });
  } catch (err) {
    await interaction.editReply({ content: `❌ ${err.message}`, ...EPHEMERAL });
  }
}

function successPayload(content) {
  return { content, ...EPHEMERAL };
}
function errorPayload(content) {
  return { content, ...EPHEMERAL };
}
