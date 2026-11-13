/** Registra os comandos slash. Rode com: npm run deploy */
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');
const config = require('./config');

const dir = path.join(__dirname, 'commands');
const body = fs.readdirSync(dir)
  .filter((f) => f.endsWith('.js'))
  .map((f) => require(path.join(dir, f)).data.toJSON());

const rest = new REST({ version: '10' }).setToken(config.token);

(async () => {
  const route = config.guildId
    ? Routes.applicationGuildCommands(config.clientId, config.guildId)
    : Routes.applicationCommands(config.clientId);
  await rest.put(route, { body });
  console.log(`✅ ${body.length} comandos registrados ${config.guildId ? `no servidor ${config.guildId}` : 'globalmente'}.`);
})().catch((err) => {
  console.error('❌ Falha ao registrar comandos:', err);
  process.exit(1);
});
