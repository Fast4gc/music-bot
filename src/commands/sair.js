const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const { getContext, say } = require('../utils/checks');
const { success, error } = require('../utils/messages');

module.exports = {
  data: new SlashCommandBuilder().setName('sair').setDescription('Faz o bot sair do canal de voz').setContexts(InteractionContextType.Guild),
  async execute(interaction) {
    const c = getContext(interaction);
    if (c.error) return say(interaction, c.error);
    c.music.destroy();
    await success(interaction, '👋 Até a próxima!', { ephemeral: false });
  },
};
