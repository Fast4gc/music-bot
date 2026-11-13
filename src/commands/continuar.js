const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const { getContext, say } = require('../utils/checks');
const { info, success, error } = require('../utils/messages');

module.exports = {
  data: new SlashCommandBuilder().setName('continuar').setDescription('Continua a música pausada').setContexts(InteractionContextType.Guild),
  async execute(interaction) {
    const c = getContext(interaction);
    if (c.error) return say(interaction, c.error);
    if (!c.music.isPaused) return info(interaction, 'A música não está pausada.', { ephemeral: false });
    c.music.resume();
    await success(interaction, 'Continuando.', { ephemeral: false });
    c.music.refreshNowPlaying();
  },
};
