const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const { getContext, say } = require('../utils/checks');
const { error, success } = require('../utils/messages');

module.exports = {
  data: new SlashCommandBuilder().setName('embaralhar').setDescription('Embaralha a fila').setContexts(InteractionContextType.Guild),
  async execute(interaction) {
    const c = getContext(interaction);
    if (c.error) return say(interaction, c.error);
    if (c.music.queue.length < 2) return error(interaction, 'Preciso de pelo menos 2 músicas na fila.');
    c.music.shuffle();
    await success(interaction, `🔀 Fila embaralhada (${c.music.queue.length} faixas).`, { ephemeral: false });
  },
};
