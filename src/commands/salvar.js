const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const { say } = require('../utils/checks');
const { nowPlayingEmbed } = require('../utils/embeds');
const { success, error } = require('../utils/messages');

module.exports = {
  data: new SlashCommandBuilder().setName('salvar').setDescription('Envia a música atual para o seu privado').setContexts(InteractionContextType.Guild),
  async execute(interaction) {
    const music = interaction.client.music.get(interaction.guildId);
    if (!music?.current) return error(interaction, 'Não tem nada tocando agora.');
    try {
      await interaction.user.send({ content: '💾 Música salva:', embeds: [nowPlayingEmbed(music)] });
      await success(interaction, '📬 Enviei no seu privado!');
    } catch {
      await error(interaction, 'Não consegui enviar DM. Habilite mensagens diretas deste servidor.');
    }
  },
};
