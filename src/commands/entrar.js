const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const { getContext, say } = require('../utils/checks');
const { error, success } = require('../utils/messages');

module.exports = {
  data: new SlashCommandBuilder().setName('entrar').setDescription('Faz o bot entrar no seu canal de voz').setContexts(InteractionContextType.Guild),
  async execute(interaction) {
    const c = getContext(interaction, { needSession: false, allowMoveIfIdle: true });
    if (c.error) return say(interaction, c.error);
    if (!c.vc.joinable) return error(interaction, 'Não tenho permissão para entrar nesse canal.');

    await interaction.deferReply();
    const music = c.music ?? interaction.client.music.create(interaction.guild);
    music.textChannel = interaction.channel;
    try {
      await music.connect(c.vc);
    } catch (err) {
      return error(interaction, err.message);
    }
    if (!music.current) music.scheduleIdle();
    await success(interaction, `Entrei em ${c.vc}. Use \`/tocar\` para começar!`, { ephemeral: false });
  },
};
