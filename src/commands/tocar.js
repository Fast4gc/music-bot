const {
  SlashCommandBuilder, InteractionContextType, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const spotify = require('../music/spotify');
const searchCache = require('../music/searchCache');
const { resolve } = require('../music/resolver');
const { enqueue, chooseAndEnqueue } = require('../music/playQuery');

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

/** Botões que transformam uma faixa solta em lista (álbum inteiro / mais do artista). */
function extraButtons(track) {
  if (!track) return [];
  const row = new ActionRowBuilder();

  if (track.albumId) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`queue:album:${track.albumId}`)
        .setLabel('Tocar o álbum inteiro')
        .setEmoji('📀')
        .setStyle(ButtonStyle.Secondary),
    );
  }

  if (track.artist) {
    const id = `queue:artist:${encodeURIComponent(track.artist)}`.slice(0, 100);
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(id)
        .setLabel(`Mais de ${track.artist}`.slice(0, 80))
        .setEmoji('🎤')
        .setStyle(ButtonStyle.Secondary),
    );
  }

  return row.components.length ? [row] : [];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tocar')
    .setDescription('Toca música ou monta uma fila: nome, link do YouTube ou do Spotify')
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) => o.setName('busca').setDescription('Nome da música ou link').setRequired(true).setAutocomplete(true))
    .addBooleanOption((o) => o.setName('proxima').setDescription('Colocar para tocar logo depois da atual'))
    .addBooleanOption((o) => o.setName('embaralhar').setDescription('Embaralhar (para álbuns e playlists)'))
    .addBooleanOption((o) => o.setName('somente_esta').setDescription('Tocar só a música escolhida, sem montar a lista')),

  async autocomplete(interaction) {
    const q = interaction.options.getFocused().trim();
    let choices = [];
    if (q.length >= 2 && !/^(https?:|spotify:)/i.test(q) && spotify.enabled()) {
      try {
        const res = await withTimeout(spotify.searchTracks(q, 10), 2500);
        const usable = res.filter((t) => t.spotifyUrl);
        searchCache.put(interaction.guildId, interaction.user.id, q, usable);
        choices = usable.map((t, i) => ({
          name: `${t.artist} - ${t.title}`.slice(0, 100),
          value: `sr:${i}|${q}`.slice(0, 100),
        }));
      } catch { /* sem sugestões */ }
    }
    await interaction.respond(choices).catch(() => {});
  },

  async execute(interaction) {
    await interaction.deferReply();

    const raw = interaction.options.getString('busca', true);
    const next = interaction.options.getBoolean('proxima') ?? false;
    const shuffle = interaction.options.getBoolean('embaralhar') ?? false;
    const onlyOne = interaction.options.getBoolean('somente_esta') ?? false;

    // ── música escolhida no autocomplete: a busca vira lista, com a escolhida na frente ──
    if (raw.startsWith('sr:')) {
      const rest = raw.slice(3);
      const sep = rest.indexOf('|');
      const idx = Number(sep >= 0 ? rest.slice(0, sep) : rest);
      const query = sep >= 0 ? rest.slice(sep + 1) : '';

      const cached = searchCache.get(interaction.guildId, interaction.user.id);
      let tracks = cached && cached.query === query ? cached.tracks : null;
      if (!tracks?.length) {
        if (!query) return interaction.editReply('🔍 Não encontrei nada para essa busca.');
        try {
          tracks = (await resolve(query)).tracks;
        } catch (err) {
          return interaction.editReply(`❌ ${err.message}`);
        }
      }
      if (!tracks?.length) return interaction.editReply('🔍 Não encontrei nada para essa busca.');

      const safeIdx = idx >= 0 && idx < tracks.length ? idx : 0;
      const picked = tracks[safeIdx];
      const list = onlyOne ? [picked] : [picked, ...tracks.filter((_, i) => i !== safeIdx)];
      return enqueue(interaction, list, { next, shuffle, label: query });
    }

    // ── texto livre ou link ──
    let result;
    try {
      result = await resolve(raw);
    } catch (err) {
      return interaction.editReply(`❌ ${err.message}`);
    }

    const tracks = result.tracks ?? [];
    if (!tracks.length) return interaction.editReply('🔍 Não encontrei nada para essa busca.');

    // Busca livre: mostra o menu e a escolhida vira a cabeça da LISTA.
    if (result.type === 'search' && tracks.length > 1 && !onlyOne) {
      return chooseAndEnqueue(interaction, tracks, {
        next,
        shuffle,
        header: `🔎 **${result.name}** — ${tracks.length} resultados. Escolha qual começa a lista:`,
      });
    }

    // Álbum/playlist já vêm como lista; faixa única ganha botões para montar a fila.
    const list = result.type === 'search' ? tracks.slice(0, 1) : tracks;
    const buttons = list.length === 1 ? extraButtons(list[0]) : [];
    return enqueue(interaction, list, { next, shuffle, label: result.name, buttons });
  },
};
