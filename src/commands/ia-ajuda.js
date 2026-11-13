const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const { info, error } = require('../utils/messages');
const dj = require('../music/djAgent');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ia-ajuda')
    .setDescription('Pergunte à IA sobre o bot de música e obtenha ajuda personalizada')
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) =>
      o.setName('pergunta')
        .setDescription('Sua dúvida sobre o bot')
        .setRequired(true)
        .setAutocomplete(true)),

  async autocomplete(interaction) {
    const q = interaction.options.getFocused().trim();
    const suggestions = [
      'Como adicionar músicas à fila?',
      'Como funciona o auto-refill da fila?',
      'Como usar o Spotify com o bot?',
      'O que faz o modo repetir?',
      'Como criar salas de voz privadas?',
      'Como gerar um banner?',
      'Como verificar um usuário?',
    ];
    const filtered = suggestions.filter((s) => s.toLowerCase().includes(q.toLowerCase())).slice(0, 10);
    await interaction.respond(filtered.map((s) => ({ name: s, value: s }))).catch(() => {});
  },

  async execute(interaction) {
    await interaction.deferReply();
    const pergunta = interaction.options.getString('pergunta', true);

    try {
      const resposta = await dj.helpAnswer(pergunta);
      await info(interaction, resposta, { ephemeral: false });
    } catch (err) {
      await error(interaction, `❌ ${err.message}`);
    }
  },
};
