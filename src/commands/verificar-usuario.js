const { SlashCommandBuilder, InteractionContextType, MessageFlags } = require('discord.js');
const { info, error, field } = require('../utils/messages');
const dj = require('../music/djAgent');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verificar-usuario')
    .setDescription('Analisa o perfil de um usuário com a IA (confiança e recomendação)')
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) =>
      o.setName('usuario')
        .setDescription('Usuário para verificar')
        .setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply();
    const alvo = interaction.options.getUser('usuario') ?? interaction.user;

    try {
      const analise = await dj.verifyUser(alvo);
      const riscoEmoji = { baixo: '✅', medio: '⚠️', alto: '❌' }[analise.risco] ?? '⚠️';

      await info(interaction, `Perfil de **${alvo.username}**${alvo.discriminator ? `#${alvo.discriminator}` : ''}`, {
        ephemeral: false,
        fields: [
          field('👤 Usuário', `${alvo.tag} (\`${alvo.id}\`)`, true),
          field('🤖 É bot?', alvo.bot ? 'Sim' : 'Não', true),
          field('📊 Nível de confiança', `${analise.nivelConfianca}/10`, true),
          field('🎯 Perfil', analise.perfil, true),
          field(`${riscoEmoji} Risco`, analise.risco.charAt(0).toUpperCase() + analise.risco.slice(1), true),
          field('💡 Recomendação', analise.recomendacao, false),
        ],
      });
    } catch (err) {
      await error(interaction, `❌ ${err.message}`);
    }
  },
};
