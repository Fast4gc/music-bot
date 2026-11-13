const { SlashCommandBuilder, InteractionContextType, MessageFlags } = require('discord.js');
const { base } = require('../utils/embeds');

const limit = (o) => o.setName('quantidade').setDescription('Limite de pessoas (0 = sem limite)').setRequired(true).setMinValue(0).setMaxValue(99);
const user = (o, d) => o.setName('usuario').setDescription(d).setRequired(true);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sala')
    .setDescription('Salas de voz privadas para ouvir música')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => s.setName('criar').setDescription('Cria uma sala de voz (privada por padrão) e move você para ela')
      .addStringOption((o) => o.setName('nome').setDescription('Nome da sala').setMaxLength(50))
      .addIntegerOption((o) => o.setName('limite').setDescription('Limite de pessoas (0 = sem limite)').setMinValue(0).setMaxValue(99))
      .addBooleanOption((o) => o.setName('privada').setDescription('Só convidados veem e entram (padrão: sim)')))
    .addSubcommand((s) => s.setName('convidar').setDescription('Dá acesso à sua sala para alguém').addUserOption((o) => user(o, 'Quem convidar')))
    .addSubcommand((s) => s.setName('remover').setDescription('Remove o acesso de alguém (e desconecta da sala)').addUserOption((o) => user(o, 'Quem remover')))
    .addSubcommand((s) => s.setName('privacidade').setDescription('Torna a sala privada ou pública')
      .addStringOption((o) => o.setName('modo').setDescription('Privacidade').setRequired(true)
        .addChoices({ name: 'Privada (só convidados)', value: 'privada' }, { name: 'Pública (todos podem entrar)', value: 'publica' })))
    .addSubcommand((s) => s.setName('renomear').setDescription('Muda o nome da sala')
      .addStringOption((o) => o.setName('nome').setDescription('Novo nome').setRequired(true).setMaxLength(50)))
    .addSubcommand((s) => s.setName('limite').setDescription('Muda o limite de pessoas').addIntegerOption(limit))
    .addSubcommand((s) => s.setName('transferir').setDescription('Passa a posse da sala para outra pessoa').addUserOption((o) => user(o, 'Novo dono')))
    .addSubcommand((s) => s.setName('info').setDescription('Mostra informações da sala'))
    .addSubcommand((s) => s.setName('fechar').setDescription('Apaga a sua sala')),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const rooms = interaction.client.rooms;
    const sub = interaction.options.getSubcommand();
    const member = interaction.member;

    try {
      if (sub === 'criar') {
        const { channel, moved } = await rooms.create(interaction.guild, member, {
          name: interaction.options.getString('nome'),
          limit: interaction.options.getInteger('limite') ?? 0,
          privado: interaction.options.getBoolean('privada') ?? true,
        });
        return interaction.editReply(
          `✅ Sala criada: ${channel}\n` +
          (moved ? 'Já te movi para lá. ' : 'Entre nela em até 1 minuto, senão ela é apagada. ') +
          'Use `/tocar` dentro dela e `/sala convidar` para chamar amigos.',
        );
      }

      const room = rooms.findFor(member);
      if (!room) return interaction.editReply('❌ Você não é dono de nenhuma sala nem está em uma. Use `/sala criar`.');
      if (sub !== 'info' && !rooms.canManage(member, room)) {
        return interaction.editReply('❌ Só o dono da sala (ou quem tem *Gerenciar Canais*) pode fazer isso.');
      }

      switch (sub) {
        case 'info': {
          const ch = rooms.channelOf(room);
          if (!ch) return interaction.editReply('❌ Essa sala não existe mais.');
          const music = interaction.client.music.get(interaction.guildId);
          const playing = music?.channelId === ch.id && music.current ? music.current.title : '—';
          return interaction.editReply({
            embeds: [base().setTitle(ch.name).addFields(
              { name: 'Dono', value: `<@${room.ownerId}>`, inline: true },
              { name: 'Privacidade', value: room.privado ? '🔒 Privada' : '🌐 Pública', inline: true },
              { name: 'Limite', value: ch.userLimit ? String(ch.userLimit) : 'Sem limite', inline: true },
              { name: 'Na sala agora', value: String(ch.members.size), inline: true },
              { name: 'Criada', value: `<t:${Math.floor(room.createdAt / 1000)}:R>`, inline: true },
              { name: 'Tocando', value: playing.slice(0, 100), inline: true },
            )],
          });
        }
        case 'convidar': {
          const target = interaction.options.getMember('usuario');
          if (!target) return interaction.editReply('❌ Essa pessoa não está no servidor.');
          if (target.user.bot) return interaction.editReply('❌ Não precisa convidar bots.');
          await rooms.invite(room, target);
          return interaction.editReply(`✅ ${target} agora pode ver e entrar em <#${room.channelId}>.`);
        }
        case 'remover': {
          const target = interaction.options.getMember('usuario');
          if (!target) return interaction.editReply('❌ Essa pessoa não está no servidor.');
          await rooms.remove(room, target);
          return interaction.editReply(`✅ ${target} não tem mais acesso à sala.`);
        }
        case 'privacidade': {
          const privado = interaction.options.getString('modo', true) === 'privada';
          await rooms.setPrivacy(room, privado);
          return interaction.editReply(privado ? '🔒 Sala agora é **privada**.' : '🌐 Sala agora é **pública**.');
        }
        case 'renomear':
          await rooms.rename(room, interaction.options.getString('nome', true));
          return interaction.editReply('✅ Sala renomeada.');
        case 'limite': {
          const n = interaction.options.getInteger('quantidade', true);
          await rooms.setLimit(room, n);
          return interaction.editReply(n ? `✅ Limite: **${n}** pessoas.` : '✅ Sem limite de pessoas.');
        }
        case 'transferir': {
          const target = interaction.options.getMember('usuario');
          if (!target) return interaction.editReply('❌ Essa pessoa não está no servidor.');
          await rooms.transfer(room, target);
          return interaction.editReply(`👑 ${target} é o novo dono da sala.`);
        }
        case 'fechar': {
          interaction.client.music.destroyInChannel(interaction.guildId, room.channelId);
          await rooms.close(room);
          return interaction.editReply('🗑️ Sala fechada.');
        }
      }
    } catch (err) {
      console.error('[sala]', err);
      const msg = err.code === 50013
        ? 'Faltam permissões ao bot (precisa de *Gerenciar Canais*, *Gerenciar Cargos* e *Mover Membros*).'
        : err.message;
      await interaction.editReply(`❌ ${msg}`);
    }
  },
};
