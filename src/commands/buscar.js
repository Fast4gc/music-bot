const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const config = require('../config');
const spotify = require('../music/spotify');
const yt = require('../music/ytdlp');
const { chooseAndEnqueue } = require('../music/playQuery');
const { error } = require('../utils/messages');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('buscar')
    .setDescription('Pesquisa músicas (Spotify, ou YouTube se o Spotify não estiver configurado) e monta a fila')
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) => o.setName('termo').setDescription('O que você quer ouvir?').setRequired(true))
    .addBooleanOption((o) => o.setName('proxima').setDescription('Colocar para tocar logo depois da atual'))
    .addBooleanOption((o) => o.setName('embaralhar').setDescription('Embaralhar a lista')),

  async execute(interaction) {
    await interaction.deferReply();
    const termo = interaction.options.getString('termo', true);

    let tracks;
    try {
      if (spotify.enabled()) {
        tracks = await spotify.searchTracks(termo, config.searchResults);
      } else {
        tracks = await yt.search(termo, config.searchResults);
      }
    } catch (err) {
      return error(interaction, err.message);
    }
    if (!tracks.length) return error(interaction, 'Não encontrei nada para esse termo.');

    // Escolhe a música que começa a lista; a lista inteira entra na fila.
    return chooseAndEnqueue(interaction, tracks, {
      next: interaction.options.getBoolean('proxima') ?? false,
      shuffle: interaction.options.getBoolean('embaralhar') ?? false,
      header: `🔎 Resultados para **${termo}** — escolha a música que começa a lista:`,
    });
  },
};
