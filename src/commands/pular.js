const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const { getContext, say } = require('../utils/checks');
const { success, error } = require('../utils/messages');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pular')
    .setDescription('Pula a música atual (ou vai direto para uma posição da fila)')
    .setContexts(InteractionContextType.Guild)
    .addIntegerOption((o) => o.setName('para').setDescription('Posição da fila para onde pular').setMinValue(1)),
  async execute(interaction) {
    const c = getContext(interaction);
    if (c.error) return say(interaction, c.error);
    const { music } = c;
    if (!music.current) return error(interaction, 'Não tem nada tocando agora.');

    const to = interaction.options.getInteger('para');
    if (to && to > music.queue.length) {
      return error(interaction, `A fila só tem ${music.queue.length} faixa(s).`);
    }

    await interaction.deferReply();
    if (to) await music.skipTo(to);
    else await music.skip();
    await success(interaction, to ? `Pulando para a posição #${to}.` : 'Música pulada.', { ephemeral: false });
  },
};
