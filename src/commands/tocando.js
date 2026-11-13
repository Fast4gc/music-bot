const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const { say } = require('../utils/checks');
const { nowPlayingEmbed } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder().setName('tocando').setDescription('Mostra a música atual com a barra de progresso').setContexts(InteractionContextType.Guild),
  async execute(interaction) {
    const music = interaction.client.music.get(interaction.guildId);
    if (!music?.current) return say(interaction, '❌ Não tem nada tocando agora.');
    await interaction.reply({ embeds: [nowPlayingEmbed(music, { withProgress: true })] });
  },
};
