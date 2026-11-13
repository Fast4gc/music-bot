const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const { getContext, say } = require('../utils/checks');
const { success, error } = require('../utils/messages');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remover')
    .setDescription('Remove uma música da fila')
    .setContexts(InteractionContextType.Guild)
    .addIntegerOption((o) => o.setName('posicao').setDescription('Posição na fila (veja em /fila)').setRequired(true).setMinValue(1)),
  async execute(interaction) {
    const c = getContext(interaction);
    if (c.error) return say(interaction, c.error);
    const pos = interaction.options.getInteger('posicao', true);
    const t = c.music.remove(pos);
    if (!t) return error(interaction, 'Posição inválida.');
    await success(interaction, `Removida: **${t.title}**`, { ephemeral: false });
  },
};
