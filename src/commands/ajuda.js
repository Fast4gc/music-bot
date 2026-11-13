const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { base } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder().setName('ajuda').setDescription('Lista todos os comandos'),
  async execute(interaction) {
    const lines = [];
    for (const cmd of interaction.client.commands.values()) {
      const json = cmd.data.toJSON();
      const subs = (json.options || []).filter((o) => o.type === 1);
      if (subs.length) subs.forEach((s) => lines.push(`**/${json.name} ${s.name}** — ${s.description}`));
      else lines.push(`**/${json.name}** — ${json.description}`);
    }
    await interaction.reply({
      embeds: [base().setTitle('📖 Comandos').setDescription(lines.join('\n').slice(0, 4000))
        .setFooter({ text: 'Dica: use os botões da mensagem "Tocando agora" para controlar rapidamente.' })],
      flags: MessageFlags.Ephemeral,
    });
  },
};
