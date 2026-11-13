const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const { getContext, say } = require('../utils/checks');
const { success, error } = require('../utils/messages');

module.exports = {
  data: new SlashCommandBuilder().setName('parar').setDescription('Para a música e limpa a fila (o bot continua no canal)').setContexts(InteractionContextType.Guild),
  async execute(interaction) {
    const c = getContext(interaction);
    if (c.error) return say(interaction, c.error);
    c.music.stop();
    await success(interaction, 'Reprodução parada e fila limpa.', { ephemeral: false });
  },
};
