const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const agent = require('../music/djAgent');
const yt = require('../music/ytdlp');
const { enqueue } = require('../music/playQuery');
const { info, error, success } = require('../utils/messages');

module.exports = {
  data: new SlashCommandBuilder().setName('dj').setDescription('DJ Agent: cria uma fila a partir de um pedido')
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) => o.setName('pedido').setDescription('Ex.: músicas parecidas com Daft Punk para treinar').setRequired(true).setMaxLength(300))
    .addIntegerOption((o) => o.setName('quantidade').setDescription('Número de recomendações (1 a 30)').setMinValue(1).setMaxValue(30)),
  async execute(interaction) {
    await interaction.deferReply();
    const pedido = interaction.options.getString('pedido', true);
    const quantidade = interaction.options.getInteger('quantidade') ?? 8;
    try {
      const recommendations = await agent.recommend(pedido, quantidade);
      const tracks = [];
      for (const item of recommendations) {
        try {
          const [track] = await yt.search(item.query, 1);
          if (track?.url) tracks.push(track);
        } catch { /* ignora faixa indisponível */ }
      }
      if (!tracks.length) return error(interaction, 'Não consegui encontrar as recomendações no YouTube.');
      await info(interaction, `🤖 Encontrei **${tracks.length}** recomendações. Montando a fila...`);
      await enqueue(interaction, tracks, { label: pedido });
    } catch (err) { await error(interaction, `DJ Agent: ${err.message}`); }
  },
};
