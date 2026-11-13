const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const { getContext, say } = require('../utils/checks');
const { LOOP_LABEL } = require('../utils/embeds');
const { success, error } = require('../utils/messages');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('repetir')
    .setDescription('Define o modo de repetição')
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) =>
      o.setName('modo').setDescription('Modo de repetição').setRequired(true).addChoices(
        { name: 'Desligado', value: 'off' },
        { name: 'Repetir a música atual', value: 'track' },
        { name: 'Repetir a fila inteira', value: 'queue' },
      )),
  async execute(interaction) {
    const c = getContext(interaction);
    if (c.error) return say(interaction, c.error);
    const mode = interaction.options.getString('modo', true);
    c.music.setLoop(mode);
    await success(interaction, `🔁 Repetição: **${LOOP_LABEL[mode]}**`, { ephemeral: false });
    c.music.refreshNowPlaying();
  },
};
