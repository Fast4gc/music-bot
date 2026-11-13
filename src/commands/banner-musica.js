const { SlashCommandBuilder, InteractionContextType, MessageFlags } = require('discord.js');
const { info, error } = require('../utils/messages');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('banner-musica')
    .setDescription('Regenera o banner de IA da música atual')
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    const music = interaction.client.music.get(interaction.guildId);
    if (!music?.current) return error(interaction, 'Não tem nada tocando agora.');

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      // Força regeneração do banner
      music.banner = null;
      music.bannerGenerated = false;
      await music._generateBannerForCurrent();
      if (music.banner) {
        await info(interaction, '🎨 Banner regenerado com sucesso! Veja na mensagem "Tocando agora".', { ephemeral: false });
      } else {
        await error(interaction, 'Não consegui gerar o banner desta vez. Tente novamente.');
      }
    } catch (err) {
      await error(interaction, `❌ ${err.message}`);
    }
  },
};
