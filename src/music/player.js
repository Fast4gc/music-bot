const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  StreamType,
  NoSubscriberBehavior,
} = require('@discordjs/voice');
const config = require('../config');
const yt = require('./ytdlp');
const dj = require('./djAgent');
const { nowPlayingEmbed, nowPlayingControls } = require('../utils/embeds');
const { shuffleArray } = require('../utils/checks');

/** Sessão de música de um servidor (fila, conexão de voz, player). */
class GuildMusic {
  constructor(manager, guild) {
    this.manager = manager;
    this.guild = guild;

    this.queue = [];
    this.history = [];
    this.current = null;
    this.loop = 'off'; // off | track | queue
    this.volume = config.defaultVolume;

    this.connection = null;
    this.connecting = false;
    this.textChannel = null;
    this.nowMessage = null;
    this.nowMessageChannelId = null;
    this.progressTimer = null;
    this.stream = null;
    this.gen = 0; // invalida carregamentos antigos quando o usuário pula
    this.idleTimer = null;
    this.aloneTimer = null;
    this.destroyed = false;
    this.refilling = false; // evita refills concorrentes
    this.banner = null; // banner de IA gerado para a música atual
    this.bannerGenerated = false; // evita regenerar para a mesma música
    this.bannerFailCount = 0; // contador de falhas consecutivas do banner
    this.bannerCooldownUntil = 0; // timestamp até quando pular a geração de banner

    this.player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
    this.player.on('stateChange', (oldS, newS) => {
      if (oldS.status !== AudioPlayerStatus.Idle && newS.status === AudioPlayerStatus.Idle) this._onTrackEnd();
    });
    this.player.on('error', (err) => {
      console.error(`[player:${guild.id}]`, err.message);
      this._say(`⚠️ Erro de áudio em **${this.current?.title ?? 'faixa'}**. Passando para a próxima...`);
    });
  }

  // ───────── estado ─────────
  get channelId() {
    return this.guild.members.me?.voice?.channelId ?? this.connection?.joinConfig?.channelId ?? null;
  }
  get isPaused() {
    return [AudioPlayerStatus.Paused, AudioPlayerStatus.AutoPaused].includes(this.player.state.status);
  }
  get position() {
    const r = this.player.state.resource;
    return r ? Math.floor(r.playbackDuration / 1000) : 0;
  }

  _say(content) {
    return this.textChannel?.send(content).catch(() => {});
  }

  // ───────── conexão ─────────
  async connect(voiceChannel) {
    const existing = this.connection;
    if (existing && existing.state.status !== VoiceConnectionStatus.Destroyed && existing.joinConfig.channelId === voiceChannel.id) return;

    this.connecting = true;
    this._clearTimers();
    if (existing && existing.state.status !== VoiceConnectionStatus.Destroyed) existing.destroy();

    const conn = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: true,
    });
    this.connection = conn;

    conn.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        // Se o bot foi movido de canal, ele volta a conectar sozinho.
        await Promise.race([
          entersState(conn, VoiceConnectionStatus.Signalling, 5_000),
          entersState(conn, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        if (this.connection === conn) this.destroy();
      }
    });

    try {
      await entersState(conn, VoiceConnectionStatus.Ready, 20_000);
    } catch {
      if (this.connection === conn) this.destroy();
      throw new Error('Não consegui conectar ao canal de voz (permissão ou tempo esgotado).');
    } finally {
      this.connecting = false;
    }
    conn.subscribe(this.player);
  }

  // ───────── fila ─────────
  /**
   * Coloca uma lista de faixas na fila.
   * @returns {number} posição da primeira faixa adicionada (1 = beginning)
   */
  add(tracks, next = false) {
    this._clearIdle();
    const position = next ? 1 : this.queue.length + 1;
    if (next) this.queue.unshift(...tracks);
    else this.queue.push(...tracks);
    this._prefetch();
    return position;
  }

  /** Resolve no YouTube, em segundo plano, a URL da próxima faixa (evitadelay na troca). */
  _prefetch() {
    const next = this.queue.find((t) => !t.url && t.source === 'spotify');
    if (!next || next._prefetching || this.destroyed) return;
    next._prefetching = true;
    yt.matchSpotifyTrack(next)
      .then((m) => {
        next.url = m.url;
        if (!next.duration) next.duration = m.duration;
        if (!next.thumbnail) next.thumbnail = m.thumbnail;
      })
      .catch(() => { /* o player tenta de novo na hora de tocar */ })
      .finally(() => { next._prefetching = false; });
  }

  /** Próximas faixas da fila (usado nos embeds). */
  upcoming(n = 3) {
    return this.queue.slice(0, n);
  }

  /** Garante que a fila não fique vazia: adiciona músicas recomendadas pela IA quando está chegando no final. */
  async ensureQueueFilled() {
    if (!config.autoRefill || this.refilling || this.destroyed) return;
    if (this.queue.length >= config.refillThreshold) return;

    this.refilling = true;
    try {
      // Usa a música atual (ou a última do histórico) como semente para recomendações.
      const seed = this.current || (this.history.length ? this.history[this.history.length - 1] : null);
      if (!seed) return;

      const prompt = seed.title ? `${seed.artist} - ${seed.title}` : (seed.artist || 'música popular');
      const recommendations = await dj.recommend(`Músicas parecidas com "${prompt}" para continuar a fila`, config.refillSize).catch(() => []);

      if (!recommendations.length) return;

      const resolved = [];
      for (const rec of recommendations) {
        if (this.destroyed || this.refilling === false) break;
        try {
          const found = await yt.search(rec.query, 3);
          const match = found.find((f) => f.url) || found[0];
          if (match?.url) {
            resolved.push({
              title: match.title,
              artist: match.artist,
              duration: match.duration,
              thumbnail: match.thumbnail,
              url: match.url,
              source: 'youtube',
              requestedBy: '🤖 IA (auto-refill)',
            });
          }
        } catch { /* ignora falhas individuais */ }
      }

      if (resolved.length) {
        const space = config.maxQueue - this.queue.length;
        const toAdd = resolved.slice(0, space);
        for (const t of toAdd) t.requestedBy = '🤖 IA (auto-refill)';
        this.add(toAdd);
        this._say(`🤖 **Auto-refill da fila:** ${toAdd.length} música(s) recomendada(s) pela IA adicionada(s).`);
      }
    } catch (err) {
      console.error(`[auto-refill:${this.guild.id}]`, err.message);
    } finally {
      this.refilling = false;
    }
  }

  async start() {
    if (!this.current && this.player.state.status === AudioPlayerStatus.Idle) await this.playNext();
  }

  async playNext() {
    // Se a fila está chegando no final, enche com mais músicas antes de tocar a próxima.
    await this.ensureQueueFilled();

    const gen = ++this.gen;
    this._clearIdle();

    // Garante que nada do áudio anterior continua rodando.
    this.current = null;
    if (this.player.state.status !== AudioPlayerStatus.Idle) this.player.stop(true);
    this._killStream();

    const track = this.queue.shift();
    if (!track) {
      await this._clearNow();
      this.scheduleIdle();
      return;
    }

    this.current = track;
    this.banner = null;
    this.bannerGenerated = false;
    // Reseta cooldown ao começar uma nova música (dá outra chance à IA)
    this.bannerCooldownUntil = 0;

    // Gera o banner de IA para esta música (não bloqueia a reprodução).
    this._generateBannerForCurrent();

    try {
      if (!track.url) {
        const match = await yt.matchSpotifyTrack(track);
        if (gen !== this.gen) return;
        track.url = match.url;
        if (!track.duration) track.duration = match.duration;
        if (!track.thumbnail) track.thumbnail = match.thumbnail;
      }

      const s = yt.createStream(track.url);
      this.stream = s;
      s.proc.on('error', (e) => {
        if (gen === this.gen) this._say(`❌ Não consegui iniciar o yt-dlp: ${e.code === 'ENOENT' ? 'executável não encontrado (veja YTDLP_PATH)' : e.message}`);
      });
      s.proc.on('close', (code) => {
        if (code && !s.killed && gen === this.gen && !this.destroyed) {
          this._say(`⚠️ O yt-dlp falhou em **${track.title}**: ${yt.cleanError(s.stderr) || `código ${code}`}`);
        }
      });

      const resource = createAudioResource(s.stream, { inputType: StreamType.Arbitrary, inlineVolume: true });
      resource.volume.setVolume(this.volume / 100);
      this.player.play(resource);
      await this._sendNowPlaying();
    } catch (err) {
      if (gen !== this.gen) return;
      console.error(`[play:${this.guild.id}]`, err.message);
      this._say(`❌ Não consegui tocar **${track.title}**: ${err.message}`);
      this.current = null;
      return this.playNext();
    }
  }

  _archiveCurrent(skipped) {
    const t = this.current;
    if (!t) return;
    if (this.loop === 'track' && !skipped) {
      this.queue.unshift(t);
    } else {
      this.history.push(t);
      if (this.history.length > 50) this.history.shift();
      if (this.loop === 'queue') this.queue.push(t);
    }
    this.current = null;
    this.banner = null;
    this.bannerGenerated = false;
  }

  /** Gera um banner de IA para a música atual e atualiza a mensagem "tocando agora" quando ficar pronto. */
  async _generateBannerForCurrent() {
    if (!config.gemini.apiKey || this.destroyed || this.bannerGenerated) return;

    // Cooldown: se a IA falhou muitas vezes, pula por um tempo
    if (this.bannerCooldownUntil > Date.now()) return;
    this.bannerGenerated = true;

    const t = this.current;
    if (!t || (!t.title && !t.artist)) return;

    try {
      const banner = await dj.generateMusicBanner(
        t.title || 'Sem título',
        t.artist || 'Desconhecido',
        this.guild.id, // rate limit por servidor
      ).catch(() => null);

      if (banner && !this.destroyed && this.current === t) {
        this.banner = banner;
        this.bannerFailCount = 0; // reset falhas ao sucessor
        // Atualiza a mensagem nowPlaying para incluir o banner.
        await this._sendNowPlaying();
      } else {
        this._incrementBannerFail();
      }
    } catch (err) {
      this._incrementBannerFail();
      console.error(`[banner:${this.guild.id}]`, err.message);
    }
  }

  /** Incrementa contador de falhas e ativa cooldown se houver muitas falhas seguidas. */
  _incrementBannerFail() {
    this.bannerFailCount++;
    if (this.bannerFailCount >= 3) {
      // Cooldown de 5 minutos após 3 falhas consecutivas
      this.bannerCooldownUntil = Date.now() + 5 * 60 * 1000;
      this.bannerFailCount = 0;
      console.log(`[banner:${this.guild.id}] Cooldown ativado: pulando geração de banner por 5 min (IA com alta demanda).`);
    }
  }

  _onTrackEnd() {
    if (!this.current || this.destroyed) return;
    this._archiveCurrent(false);
    this.playNext();
  }

  // ───────── controles ─────────
  pause() { return this.player.pause(); }
  resume() { return this.player.unpause(); }

  skip() {
    this._archiveCurrent(true);
    return this.playNext();
  }

  /** Pula direto para a posição `n` da fila (1 = próxima). */
  skipTo(n) {
    const skipped = this.queue.splice(0, Math.max(0, n - 1));
    this.history.push(...skipped);
    while (this.history.length > 50) this.history.shift();
    return this.skip();
  }

  previous() {
    const prev = this.history.pop();
    if (!prev) return false;
    if (this.current) this.queue.unshift(this.current);
    this.queue.unshift(prev);
    this.current = null;
    this.playNext();
    return true;
  }

  stop() {
    this.queue = [];
    this.current = null;
    this.loop = 'off';
    this.gen++;
    this.player.stop(true);
    this._killStream();
    this._clearNow();
    this.scheduleIdle();
  }

  shuffle() { shuffleArray(this.queue); }
  clear() { const n = this.queue.length; this.queue = []; return n; }
  remove(pos) { return this.queue.splice(pos - 1, 1)[0] ?? null; }
  setLoop(mode) { this.loop = mode; }

  setVolume(v) {
    this.volume = v;
    this.player.state.resource?.volume?.setVolume(v / 100);
  }

  // ───────── mensagem "tocando agora" ─────────
  async _sendNowPlaying() {
    if (!this.textChannel) return;
    const payload = { embeds: [nowPlayingEmbed(this)], components: nowPlayingControls(this) };

    // Reaproveita a mensagem anterior (não spamma uma mensagem por faixa).
    const old = this.nowMessage;
    if (old) {
      if (this.nowMessageChannelId === this.textChannel.id) {
        const ok = await old.edit(payload).then(() => true).catch(() => false);
        if (ok) {
          this._startProgressTicker();
          return;
        }
      }
      await this._clearNow();
    }

    try {
      this.nowMessage = await this.textChannel.send(payload);
      this.nowMessageChannelId = this.textChannel.id;
      this._startProgressTicker();
    } catch { /* sem permissão no canal de texto */ }
  }

  async refreshNowPlaying() {
    if (!this.nowMessage || !this.current) return;
    await this.nowMessage.edit({ embeds: [nowPlayingEmbed(this, { withProgress: true })], components: nowPlayingControls(this) }).catch(() => {});
  }

  async _clearNow() {
    this._stopProgressTicker();
    const m = this.nowMessage;
    this.nowMessage = null;
    this.nowMessageChannelId = null;
    if (m) await m.delete().catch(() => {});
  }

  /** Atualiza a barra de progresso da mensagem "tocando agora" de tempos em tempos. */
  _startProgressTicker() {
    this._stopProgressTicker();
    this.progressTimer = setInterval(() => {
      if (this.destroyed || !this.nowMessage || !this.current) return;
      this.nowMessage
        .edit({ embeds: [nowPlayingEmbed(this, { withProgress: true })], components: nowPlayingControls(this) })
        .catch(() => {});
    }, 60_000);
    this.progressTimer.unref?.();
  }

  _stopProgressTicker() {
    clearInterval(this.progressTimer);
    this.progressTimer = null;
  }

  // ───────── timers ─────────
  scheduleIdle() {
    this._clearIdle();
    this.idleTimer = setTimeout(() => {
      this._say('👋 Saí do canal por inatividade.');
      this.destroy();
    }, config.idleLeaveSeconds * 1000);
  }
  _clearIdle() { clearTimeout(this.idleTimer); this.idleTimer = null; }

  checkAlone() {
    const ch = this.guild.channels.cache.get(this.channelId);
    if (!ch?.members) return;
    const humans = ch.members.filter((m) => !m.user.bot).size;
    if (humans === 0) {
      if (!this.aloneTimer) {
        this.aloneTimer = setTimeout(() => {
          this._say('👋 Fiquei sozinho no canal, então saí.');
          this.destroy();
        }, config.aloneLeaveSeconds * 1000);
      }
    } else {
      clearTimeout(this.aloneTimer);
      this.aloneTimer = null;
    }
  }

  _clearTimers() {
    this._clearIdle();
    clearTimeout(this.aloneTimer);
    this.aloneTimer = null;
  }

  _killStream() {
    if (!this.stream) return;
    this.stream.killed = true;
    this.stream.proc.kill('SIGKILL');
    this.stream = null;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.gen++;
    this._clearTimers();
    this._stopProgressTicker();
    this.queue = [];
    this.current = null;
    try { this.player.stop(true); } catch { /* noop */ }
    this._killStream();
    this._clearNow();
    if (this.connection && this.connection.state.status !== VoiceConnectionStatus.Destroyed) {
      try { this.connection.destroy(); } catch { /* noop */ }
    }
    if (this.manager.sessions.get(this.guild.id) === this) this.manager.sessions.delete(this.guild.id);
  }
}

class MusicManager {
  constructor(client) {
    this.client = client;
    this.sessions = new Map();
  }

  get(guildId) { return this.sessions.get(guildId); }

  create(guild) {
    const s = new GuildMusic(this, guild);
    this.sessions.set(guild.id, s);
    return s;
  }

  onVoiceStateUpdate(oldS, newS) {
    const music = this.sessions.get(newS.guild.id);
    if (!music) return;

    // O bot foi desconectado (kick, canal apagado...)
    if (oldS.id === this.client.user.id && oldS.channelId && !newS.channelId && !music.connecting) {
      music.destroy();
      return;
    }
    music.checkAlone();
  }

  /** Encerra a sessão se ela estiver naquele canal (ex.: sala privada apagada). */
  destroyInChannel(guildId, channelId) {
    const music = this.sessions.get(guildId);
    if (music && music.channelId === channelId) music.destroy();
  }
}

module.exports = { MusicManager, GuildMusic };
