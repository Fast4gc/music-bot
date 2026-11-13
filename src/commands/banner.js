const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const { info, error } = require('../utils/messages');
const dj = require('../music/djAgent');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('banner')
    .setDescription('Gera um banner de texto estilizado para o seu servidor')
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) =>
      o.setName('texto')
        .setDescription('Texto do banner')
        .setRequired(true)
        .setMaxLength(60))
    .addStringOption((o) =>
      o.setName('estilo')
        .setDescription('Estilo do banner')
        .addChoices(
          { name: 'Spotify', value: 'spotify' },
          { name: 'Neon', value: 'neon' },
          { name: 'Retrô', value: 'retro' },
          { name: 'Minimal', value: 'minimal' },
        )
        .setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply();
    const texto = interaction.options.getString('texto', true);
    const estilo = interaction.options.getString('estilo') ?? 'spotify';

    try {
      const banner = await dj.generateBanner(texto, estilo);
      await info(interaction, banner, { ephemeral: false });
    } catch (err) {
      await error(interaction, `❌ ${err.message}`);
    }
  },
};
