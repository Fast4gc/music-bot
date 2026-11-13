const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const { getContext, say } = require('../utils/checks');
const { info, success, error } = require('../utils/messages');

module.exports = {
  data: new SlashCommandBuilder().setName('pausar').setDescription('Pausa a música').setContexts(InteractionContextType.Guild),
  async execute(interaction) {
    const c = getContext(interaction);
    if (c.error) return say(interaction, c.error);
    if (c.music.isPaused) return info(interaction, 'A música já está pausada.', { ephemeral: false });
    c.music.pause();
    await success(interaction, 'Música pausada.', { ephemeral: false });
    c.music.refreshNowPlaying();
  },
};
