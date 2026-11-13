/**
 * Salas de voz privadas para ouvir música.
 * - Canal oculto para @everyone (ou público, se o dono preferir)
 * - Dono + convidados + bot têm acesso
 * - Apaga sozinho quando fica vazio
 * - Estado salvo em data/rooms.json (sobrevive a reinícios)
 */
const fs = require('fs');
const path = require('path');
const { ChannelType, PermissionFlagsBits: P } = require('discord.js');
const config = require('./config');

const FILE = path.join(__dirname, '..', 'data', 'rooms.json');
const PREFIX = '🎵 ';
const CREATE_GRACE_SECONDS = 60; // tempo para o dono entrar numa sala recém-criada

const humansIn = (ch) => ch?.members?.filter((m) => !m.user.bot).size ?? 0;

function sanitizeName(name, fallback) {
  const clean = String(name ?? '').replace(/[^\p{L}\p{N} _\-.!&']/gu, '').trim().slice(0, 80);
  return `${PREFIX}${clean || fallback}`;
}

class RoomManager {
  constructor(client) {
    this.client = client;
    this.rooms = new Map(); // channelId -> { guildId, channelId, ownerId, privado, createdAt }
    this.timers = new Map();
    this._load();
  }

  // ───────── persistência ─────────
  _load() {
    try {
      for (const r of JSON.parse(fs.readFileSync(FILE, 'utf8'))) this.rooms.set(r.channelId, r);
    } catch { /* primeira execução */ }
  }
  _save() {
    try {
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      fs.writeFileSync(FILE, JSON.stringify([...this.rooms.values()], null, 2));
    } catch (err) {
      console.error('[rooms] não consegui salvar:', err.message);
    }
  }

  // ───────── consultas ─────────
  get(channelId) { return this.rooms.get(channelId); }

  getByOwner(guildId, ownerId) {
    return [...this.rooms.values()].find((r) => r.guildId === guildId && r.ownerId === ownerId);
  }

  countByOwner(guildId, ownerId) {
    return [...this.rooms.values()].filter((r) => r.guildId === guildId && r.ownerId === ownerId).length;
  }

  /** Sala que o membro gerencia: a que ele é dono; senão a sala em que está. */
  findFor(member) {
    return this.getByOwner(member.guild.id, member.id) ?? this.rooms.get(member.voice?.channelId);
  }

  canManage(member, room) {
    return room.ownerId === member.id || member.permissions.has(P.ManageChannels);
  }

  channelOf(room) {
    return this.client.channels.cache.get(room.channelId) ?? null;
  }

  // ───────── ações ─────────
  async create(guild, owner, { name, limit = 0, privado = true }) {
    if (this.countByOwner(guild.id, owner.id) >= config.rooms.maxPerUser) {
      throw new Error('Você já tem uma sala. Feche-a com `/sala fechar` antes de criar outra.');
    }
    const me = guild.members.me;
    const overwrites = [
      {
        id: owner.id,
        allow: [P.ViewChannel, P.Connect, P.Speak, P.Stream, P.UseVAD, P.MoveMembers, P.MuteMembers],
      },
      {
        id: me.id,
        allow: [P.ViewChannel, P.Connect, P.Speak, P.ManageChannels, P.MoveMembers],
      },
    ];
    if (privado) overwrites.unshift({ id: guild.roles.everyone.id, deny: [P.ViewChannel, P.Connect] });

    const channel = await guild.channels.create({
      name: sanitizeName(name, `Sala de ${owner.displayName}`),
      type: ChannelType.GuildVoice,
      parent: config.rooms.categoryId || undefined,
      userLimit: limit,
      permissionOverwrites: overwrites,
      reason: `Sala de música criada por ${owner.user.tag}`,
    });

    this.rooms.set(channel.id, { guildId: guild.id, channelId: channel.id, ownerId: owner.id, privado, createdAt: Date.now() });
    this._save();

    let moved = false;
    if (owner.voice?.channelId) moved = await owner.voice.setChannel(channel).then(() => true, () => false);
    this.scheduleDelete(channel.id, CREATE_GRACE_SECONDS);
    return { channel, moved };
  }

  async invite(room, member) {
    const ch = this._need(room);
    await ch.permissionOverwrites.edit(member.id, { ViewChannel: true, Connect: true, Speak: true });
  }

  async remove(room, member) {
    const ch = this._need(room);
    if (member.id === room.ownerId) throw new Error('Você não pode remover o dono da sala.');
    if (room.privado) await ch.permissionOverwrites.delete(member.id);
    else await ch.permissionOverwrites.edit(member.id, { Connect: false });
    if (member.voice?.channelId === ch.id) await member.voice.disconnect().catch(() => {});
  }

  async setPrivacy(room, privado) {
    const ch = this._need(room);
    await ch.permissionOverwrites.edit(ch.guild.roles.everyone, privado
      ? { ViewChannel: false, Connect: false }
      : { ViewChannel: null, Connect: null });
    room.privado = privado;
    this._save();
  }

  async rename(room, name) {
    await this._need(room).setName(sanitizeName(name, 'Sala de música'));
  }

  async setLimit(room, n) {
    await this._need(room).setUserLimit(n);
  }

  async transfer(room, member) {
    const ch = this._need(room);
    if (member.user.bot) throw new Error('Não dá para transferir a sala para um bot.');
    // antigo dono vira convidado comum
    await ch.permissionOverwrites.edit(room.ownerId, {
      ViewChannel: true, Connect: true, Speak: true, MoveMembers: null, MuteMembers: null, Stream: null, UseVAD: null,
    });
    await ch.permissionOverwrites.edit(member.id, {
      ViewChannel: true, Connect: true, Speak: true, Stream: true, UseVAD: true, MoveMembers: true, MuteMembers: true,
    });
    room.ownerId = member.id;
    this._save();
  }

  async close(room) {
    const ch = this.channelOf(room);
    this._forget(room.channelId);
    if (ch) await ch.delete('Sala de música fechada').catch(() => {});
  }

  _need(room) {
    const ch = this.channelOf(room);
    if (!ch) throw new Error('Essa sala não existe mais.');
    return ch;
  }

  // ───────── limpeza automática ─────────
  scheduleDelete(channelId, seconds) {
    this.cancelDelete(channelId);
    this.timers.set(channelId, setTimeout(async () => {
      this.timers.delete(channelId);
      const room = this.rooms.get(channelId);
      if (!room) return;
      const ch = this.channelOf(room);
      if (ch && humansIn(ch) > 0) return;
      this.client.music.destroyInChannel(room.guildId, channelId);
      this._forget(channelId);
      if (ch) await ch.delete('Sala de música vazia').catch(() => {});
    }, seconds * 1000));
  }

  cancelDelete(channelId) {
    clearTimeout(this.timers.get(channelId));
    this.timers.delete(channelId);
  }

  _forget(channelId) {
    this.cancelDelete(channelId);
    if (this.rooms.delete(channelId)) this._save();
  }

  onVoiceStateUpdate(oldS, newS) {
    if (oldS.channelId && oldS.channelId !== newS.channelId && this.rooms.has(oldS.channelId)) {
      const ch = oldS.guild.channels.cache.get(oldS.channelId);
      if (ch && humansIn(ch) === 0) this.scheduleDelete(oldS.channelId, config.rooms.emptyDeleteSeconds);
    }
    if (newS.channelId && this.rooms.has(newS.channelId) && !newS.member?.user.bot) {
      this.cancelDelete(newS.channelId);
    }
  }

  onChannelDelete(channel) {
    if (!this.rooms.has(channel.id)) return;
    this.client.music.destroyInChannel(channel.guildId, channel.id);
    this._forget(channel.id);
  }

  /** No boot: remove salas que sumiram e apaga as que ficaram vazias. */
  async sweep() {
    for (const room of [...this.rooms.values()]) {
      const ch = await this.client.channels.fetch(room.channelId).catch(() => null);
      if (!ch) { this._forget(room.channelId); continue; }
      if (humansIn(ch) === 0) this.scheduleDelete(room.channelId, config.rooms.emptyDeleteSeconds);
    }
  }
}

module.exports = { RoomManager };
