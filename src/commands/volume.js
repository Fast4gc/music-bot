const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const { getContext, say } = require('../utils/checks');
const { info, success, error } = require('../utils/messages');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Mostra ou altera o volume (1 a 150)')
    .setContexts(InteractionContextType.Guild)
    .addIntegerOption((o) => o.setName('valor').setDescription('Novo volume').setMinValue(1).setMaxValue(150)),
  async execute(interaction) {
    const c = getContext(interaction);
    if (c.error) return say(interaction, c.error);
    const v = interaction.options.getInteger('valor');
    if (v === null) return info(interaction, `🔊 Volume atual: **${c.music.volume}%**`, { ephemeral: false });
    c.music.setVolume(v);
    await success(interaction, `🔊 Volume ajustado para **${v}%**${v > 100 ? ' (acima de 100% pode distorcer)' : ''}.`, { ephemeral: false });
    c.music.refreshNowPlaying();
  },
};
