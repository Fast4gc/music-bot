const {
  SlashCommandBuilder, InteractionContextType, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const { say } = require('../utils/checks');
const { error } = require('../utils/messages');
const { queueEmbed } = require('../utils/embeds');

const PER_PAGE = 10;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fila')
    .setDescription('Mostra a fila de músicas')
    .setContexts(InteractionContextType.Guild)
    .addIntegerOption((o) => o.setName('pagina').setDescription('Número da página').setMinValue(1)),
  async execute(interaction) {
    const music = interaction.client.music.get(interaction.guildId);
    if (!music || (!music.current && !music.queue.length)) return error(interaction, 'A fila está vazia.');

    const page = Math.max(1, interaction.options.getInteger('pagina') ?? 1);
    const pages = Math.max(1, Math.ceil(music.queue.length / PER_PAGE));

    const embed = queueEmbed(music, page);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`queue:page:${page - 1}`)
        .setLabel('Anterior')
        .setEmoji('⬅️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page <= 1),
      new ButtonBuilder()
        .setCustomId(`queue:page:${page + 1}`)
        .setLabel('Próxima')
        .setEmoji('➡️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= pages),
    );

    await interaction.reply({ embeds: [embed], components: [row] });
  },
};
