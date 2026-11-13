const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const { getContext, say } = require('../utils/checks');
const { success, error } = require('../utils/messages');

module.exports = {
  data: new SlashCommandBuilder().setName('limpar').setDescription('Limpa a fila (mantém a música atual)').setContexts(InteractionContextType.Guild),
  async execute(interaction) {
    const c = getContext(interaction);
    if (c.error) return say(interaction, c.error);
    const n = c.music.clear();
    await success(interaction, `🧹 ${n} faixa(s) removida(s) da fila.`, { ephemeral: false });
  },
};
