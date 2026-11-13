const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const { info } = require('../utils/messages');

module.exports = {
  data: new SlashCommandBuilder().setName('ping').setDescription('Mostra a latência do bot').setContexts(InteractionContextType.Guild),
  async execute(interaction) {
    await info(interaction, `🏓 Pong! Latência: **${Math.round(interaction.client.ws.ping)}ms**`, { ephemeral: false });
  },
};
