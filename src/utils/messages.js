/**
 * Sistema de mensagens limpas e padronizadas.
 * Todos os embeds usam a mesma cor, footer e estilo visual.
 * As respostas são ephemeral por padrão (apenas quem executou vê).
 */

const { EmbedBuilder, MessageFlags } = require('discord.js');
const config = require('../config');

const COLORS = {
  success: 0x1db954,   // verde Spotify
  error: 0xed4245,     // vermelho Discord
  info: 0x5865f2,      // azul Discord
  warning: 0xfaa81a,   // amarelo
  neutral: 0x2f3136,   // cinza escuro
};

const FOOTER_TEXT = '🎵 Bot de Música • Fila inteligente';

/**
 * Cria um embed limpo com cor, footer e timestamp.
 */
function cleanEmbed({ color = COLORS.neutral, title, description, fields = [], url = null, thumbnail = null } = {}) {
  const e = new EmbedBuilder()
    .setColor(color)
    .setTimestamp()
    .setFooter({ text: FOOTER_TEXT });

  if (title) e.setTitle(title);
  if (description) e.setDescription(description);
  if (url) e.setURL(url);
  if (thumbnail) e.setThumbnail(thumbnail);
  if (fields.length) e.addFields(fields);

  return e;
}

/**
 * Responde com embed de sucesso.
 */
function success(interaction, content, options = {}) {
  const embed = cleanEmbed({
    color: COLORS.success,
    title: '✅ Sucesso',
    description: content,
    ...options,
  });
  return replyEmbed(interaction, { embeds: [embed] }, options.ephemeral ?? true);
}

/**
 * Responde com embed de erro.
 */
function error(interaction, content, options = {}) {
  const embed = cleanEmbed({
    color: COLORS.error,
    title: '❌ Erro',
    description: content,
    ...options,
  });
  return replyEmbed(interaction, { embeds: [embed] }, options.ephemeral ?? true);
}

/**
 * Responde com embed informativo.
 */
function info(interaction, content, options = {}) {
  const embed = cleanEmbed({
    color: COLORS.info,
    title: 'ℹ️ Informação',
    description: content,
    ...options,
  });
  return replyEmbed(interaction, { embeds: [embed] }, options.ephemeral ?? true);
}

/**
 * Responde com embed de aviso.
 */
function warning(interaction, content, options = {}) {
  const embed = cleanEmbed({
    color: COLORS.warning,
    title: '⚠️ Atenção',
    description: content,
    ...options,
  });
  return replyEmbed(interaction, { embeds: [embed] }, options.ephemeral ?? true);
}

/**
 * Responde com embed neutro (sem ícone específico).
 */
function neutral(interaction, content, options = {}) {
  const embed = cleanEmbed({
    color: COLORS.neutral,
    description: content,
    ...options,
  });
  return replyEmbed(interaction, { embeds: [embed] }, options.ephemeral ?? true);
}

/**
 * Envia o embed respeitando se a interação já foi respondida/adada.
 */
async function replyEmbed(interaction, payload, ephemeral = true) {
  const finalPayload = ephemeral ? { ...payload, flags: MessageFlags.Ephemeral } : payload;
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(finalPayload).catch(() => {});
  }
  return interaction.reply(finalPayload).catch(() => {});
}

/**
 * Cria uma linha de campo padronizada para embeds.
 */
function field(name, value, inline = false) {
  return { name, value: String(value).slice(0, 1024), inline };
}

/**
 * Gera um banner de texto (ASCII-style simples) para usar em embeds.
 */
function banner(text, style = 'simple') {
  const lines = String(text).split('\n');
  const width = Math.max(...lines.map((l) => l.length), 10);

  if (style === 'double') {
    const top = '┌' + '─'.repeat(width + 2) + '┐';
    const bottom = '└' + '─'.repeat(width + 2) + '┘';
    const body = lines.map((l) => '│ ' + l.padEnd(width) + ' │').join('\n');
    return `\`\`\`\n${top}\n${body}\n${bottom}\n\`\`\``;
  }

  // simple
  const border = '─'.repeat(width + 2);
  const body = lines.map((l) => '│ ' + l.padEnd(width) + ' │').join('\n');
  return `\`\`\n${border}\n${body}\n${border}\n\`\``;
}

module.exports = {
  cleanEmbed,
  success,
  error,
  info,
  warning,
  neutral,
  field,
  banner,
  COLORS,
  FOOTER_TEXT,
  replyEmbed,
};
