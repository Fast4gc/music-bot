const { MessageFlags } = require('discord.js');

const EPHEMERAL = { flags: MessageFlags.Ephemeral };

/** Responde corretamente mesmo se a interação já foi adiada/respondida. */
function say(interaction, content, ephemeral = true) {
  const payload = typeof content === 'string' ? { content } : content;
  if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
  return interaction.reply(ephemeral ? { ...payload, ...EPHEMERAL } : payload);
}

/**
 * Valida se o usuário está em um canal de voz e se ele está no mesmo canal do bot.
 * @returns {{error: string} | {vc: import('discord.js').VoiceBasedChannel, music: object|undefined}}
 */
function getContext(interaction, { needSession = true, allowMoveIfIdle = false } = {}) {
  const vc = interaction.member?.voice?.channel;
  if (!vc) return { error: '🎧 Entre em um canal de voz primeiro.' };

  const music = interaction.client.music.get(interaction.guildId);
  if (needSession && !music) return { error: '❌ Não tem nada tocando agora.' };

  const botChannelId = interaction.guild.members.me?.voice?.channelId;
  if (music && botChannelId && botChannelId !== vc.id) {
    const idle = !music.current && music.queue.length === 0;
    if (!(allowMoveIfIdle && idle)) {
      return { error: `⚠️ Você precisa estar no mesmo canal que eu (<#${botChannelId}>).` };
    }
  }
  return { vc, music };
}

const shuffleArray = (arr) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

module.exports = { EPHEMERAL, say, getContext, shuffleArray };
