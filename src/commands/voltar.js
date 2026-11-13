const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const { getContext, say } = require('../utils/checks');
const { success, error } = require('../utils/messages');

module.exports = {
  data: new SlashCommandBuilder().setName('voltar').setDescription('Volta para a música anterior').setContexts(InteractionContextType.Guild),
  async execute(interaction) {
    const c = getContext(interaction);
    if (c.error) return say(interaction, c.error);
    await interaction.deferReply();
    const ok = c.music.previous();
    if (ok) await success(interaction, 'Voltando para a anterior.', { ephemeral: false });
    else await error(interaction, 'Não há música anterior.', { ephemeral: false });
  },
};
