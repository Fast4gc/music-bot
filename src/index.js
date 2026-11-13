const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, Events, ActivityType, MessageFlags } = require('discord.js');
const config = require('./config');
const { MusicManager } = require('./music/player');
const { RoomManager } = require('./rooms');
const handleMusicButton = require('./handlers/musicButtons');
const handleQueueButton = require('./handlers/queueButtons');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });

// ───────── comandos ─────────
client.commands = new Collection();
const dir = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
  const cmd = require(path.join(dir, file));
  client.commands.set(cmd.data.name, cmd);
}

client.music = new MusicManager(client);
client.rooms = new RoomManager(client);

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Online como ${c.user.tag} em ${c.guilds.cache.size} servidor(es) • ${client.commands.size} comandos`);
  c.user.setActivity('/tocar', { type: ActivityType.Listening });
  await client.rooms.sweep();
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await client.commands.get(interaction.commandName)?.execute(interaction);
    } else if (interaction.isAutocomplete()) {
      await client.commands.get(interaction.commandName)?.autocomplete?.(interaction);
    } else if (interaction.isButton() && interaction.customId.startsWith('music:')) {
      await handleMusicButton(interaction);
    } else if (interaction.isButton() && interaction.customId.startsWith('queue:')) {
      await handleQueueButton(interaction);
    }
  } catch (err) {
    console.error(`[interaction] ${interaction.commandName ?? interaction.customId}:`, err);
    if (!interaction.isRepliable()) return;
    const payload = { content: '❌ Ocorreu um erro ao executar isso.', flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => {});
    else await interaction.reply(payload).catch(() => {});
  }
});

client.on(Events.VoiceStateUpdate, (oldS, newS) => {
  client.music.onVoiceStateUpdate(oldS, newS);
  client.rooms.onVoiceStateUpdate(oldS, newS);
});

client.on(Events.ChannelDelete, (channel) => client.rooms.onChannelDelete(channel));

process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));
process.on('SIGINT', () => { client.music.sessions.forEach((s) => s.destroy()); client.destroy(); process.exit(0); });

client.login(config.token);
