// Networking: Trystero full mesh. Devices that find each other share a room,
// and inside the room there can be several cities. Each city has one host.
//
// A device first only listens: every host announces its city along with its
// state. To enter a city a device asks that host, who lets it in (at once if it
// holds the city's key from an earlier visit, otherwise when a person there
// says yes). Inside a city everything goes through the host, positions and
// profiles included: two members then see each other even when their own
// devices cannot reach one another directly, as long as both reach the host. When the host leaves,
// the next member in the host's join order takes over.
import { joinRoom } from '../vendor/trystero.js';

const APP_ID = 'qwertyquest.github.io/v1';

async function sha(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].slice(0, 10).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Public IPv4 address. IPv4 on purpose: every device behind one router shares it. */
async function publicIp() {
  const sources = ['https://api.ipify.org?format=json', 'https://ipv4.icanhazip.com', 'https://checkip.amazonaws.com'];
  for (const url of sources) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(4000), cache: 'no-store' });
      const t = (await r.text()).trim();
      const ip = t.startsWith('{') ? JSON.parse(t).ip : t;
      if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return ip;
    } catch { /* try the next one */ }
  }
  return null;
}

/** Room for this network, or for a shared code word. The IP is hashed before it leaves the page. */
export async function findRoom(code, fakeNet) {
  if (code) return { id: 'code-' + await sha('code:' + code.toLowerCase().trim()), label: `room "${code}"`, lan: false };
  const ip = fakeNet ? 'test:' + fakeNet : await publicIp(); // fakeNet: a private same-network room for testing
  if (!ip) return { id: null, label: 'offline', lan: true };
  return { id: 'lan-' + await sha('lan:' + ip), label: 'your network', lan: true };
}

/** Is this address one that only a device on the same local network can reach? */
function isLocal(addr) {
  if (!addr) return true; // some browsers hide it; a public address is never hidden
  const a = addr.toLowerCase().replace(/^\[|\]$/g, '');
  if (a.endsWith('.local')) return true; // an mDNS name only resolves on this network
  if (/^(10\.|192\.168\.|169\.254\.|127\.)/.test(a)) return true;
  const m = /^172\.(\d+)\./.exec(a);
  if (m) return +m[1] >= 16 && +m[1] <= 31;
  return a === '::1' || /^fe[89ab]/.test(a) || /^f[cd]/.test(a);
}
/**
 * How this browser actually reaches a peer. Returns true when the working
 * route goes straight to a local address, false when it goes over the
 * internet, and null when the connection has not settled yet. The answer comes
 * from our own browser's connection statistics, not from anything the peer says.
 */
async function reachedLocally(pc) {
  if (!pc || pc.connectionState === 'closed' || pc.connectionState === 'failed') return null;
  const stats = await pc.getStats();
  let pair = null;
  for (const r of stats.values()) if (r.type === 'transport' && r.selectedCandidatePairId) pair = stats.get(r.selectedCandidatePairId);
  if (!pair) for (const r of stats.values()) if (r.type === 'candidate-pair' && (r.selected || (r.nominated && r.state === 'succeeded'))) pair = r;
  const remote = pair && stats.get(pair.remoteCandidateId);
  if (!remote) return null;
  const addr = remote.address ?? remote.ip;
  if (remote.candidateType === 'host') return isLocal(addr);
  // A local peer can also turn up as "peer reflexive": its address was learned
  // from the first packets instead of from signalling. That only counts when
  // the address is visible and private.
  return remote.candidateType === 'prflx' && !!addr && isLocal(addr);
}

export class Net {
  /**
   * handlers: getState(), onState(state), onBecomeHost(), onPeers(id, joined), onMsg(kind, data, from),
   *   onAsk(id, name), onWelcome(world), onDenied(), onWorlds()
   */
  constructor(handlers) {
    this.h = handlers;
    this.selfId = 'solo';
    this.peers = new Set();   // everyone reachable in the room, in any city or none
    this.order = [];          // members of this device's city: host first, then join order
    this.hostId = null;
    this.acts = {};
    this.room = null;
    this.ready = false;
    this.heard = 0;           // when the host last sent state
    this.world = null;        // { id, key, name } once this device is in a city
    this.worlds = new Map();  // host id -> { id, name, host, n, d, at }: cities announced in the room
    this.asking = null;       // { host, key, name, timer } while waiting to be let in
    this.lanOnly = false;     // only accept peers reached directly over the local network
    this.okPeers = new Set();
    this.badPeers = new Set();
    this.checking = new Set();
  }
  get isHost() { return !!this.world && this.hostId === this.selfId; }

  /** Decide whether a newly connected peer is really on this network, then let it in or shut it out. */
  async _vet(userId, tries = 0) {
    if (this.okPeers.has(userId) || this.badPeers.has(userId) || (tries === 0 && this.checking.has(userId))) return;
    this.checking.add(userId);
    let verdict = null, pcs = [];
    try {
      pcs = Object.values(this.room.getPeers()).filter(p => p.userId === userId && p.connection).map(p => p.connection);
      for (const pc of pcs) { const v = await reachedLocally(pc); if (v !== null) verdict = verdict === false ? false : v; }
    } catch { /* not ready yet */ }
    if (verdict === null) { // no direct, settled connection yet: look again shortly
      if (tries < 40) setTimeout(() => this._vet(userId, tries + 1), 750); else this.checking.delete(userId);
      return;
    }
    this.checking.delete(userId);
    if (verdict) { this.okPeers.add(userId); this.peers.add(userId); return; }
    this.badPeers.add(userId);
    console.info('ignored a builder who is not on this network', userId.slice(0, 6));
    for (const pc of pcs) try { pc.close(); } catch { /* already gone */ }
  }

  /**
   * lanOnly: the room was found from the network address, so only peers on the
   *   same local network are let in (see _vet), and no STUN server is used, so
   *   this browser never even offers an internet-facing address.
   * password: for a private room code; only peers that know it can connect.
   */
  async join(roomId, { password = '', lanOnly = false } = {}) {
    this.lanOnly = lanOnly;
    if (!roomId) return;
    try {
      this.room = joinRoom({ appId: APP_ID, identity: 'none', ...(password ? { password: password.toLowerCase().trim() } : {}), ...(lanOnly ? { rtcConfig: { iceServers: [] } } : {}) }, roomId);
      this.selfId = (await this.room.getSelf()).userId;
    } catch (e) {
      console.warn('network unavailable, playing solo', e);
      this.room = null; return;
    }
    for (const kind of ['state', 'done', 'pos', 'me', 'grab', 'grant', 'offer', 'hold', 'ask', 'welcome', 'deny']) {
      const a = this.acts[kind] = this.room.makeAction(kind);
      a.onMessage((data, ctx) => this._recv(kind, data, ctx.userId));
    }
    this.room.onUserJoin(({ userId }) => {
      if (this.lanOnly) this._vet(userId); else this.peers.add(userId);
    }, { replay: true });
    this.room.onUserLeave(({ userId }) => {
      this.okPeers.delete(userId); // a peer that comes back is checked again
      this.peers.delete(userId);
      this.worlds.delete(userId);
      this._drop(userId);
    });
    setInterval(() => {
      const now = performance.now();
      for (const [id, w] of this.worlds) if (now - w.at > 3000) this.worlds.delete(id); // that city stopped announcing itself
      // A host that closes its laptop does not say goodbye, and WebRTC can take
      // half a minute to notice. The state heartbeat is the faster signal.
      if (this.world && !this.isHost && this.hostId && !this.asking && now - this.heard > 3500) this._drop(this.hostId);
      // Rejoining another host of this city, and that host vanished too: carry on from here.
      if (this.world && this.asking && !this.worlds.has(this.asking.host) && now - this.heard > 6000) { this.cancelAsk(); this._elect(); }
      this.h.onWorlds();
    }, 1000);
  }

  /** A member left this city (or went silent). */
  _drop(id) {
    if (!this.order.includes(id)) return;
    this.order = this.order.filter(x => x !== id);
    this.h.onPeers(id, false);
    if (this.hostId === id) this._elect();
  }
  /** The host is gone: the next member in the known order takes over. */
  _elect() {
    // If the same city is being kept alive by another host (the network split and healed), rejoin that one.
    const other = [...this.worlds.values()].find(w => w.id === this.world.id && this.peers.has(w.host) && w.host !== this.selfId);
    if (other) { this.ask(other.host, this.world.key, this.world.name); return; }
    const next = this.order.find(id => id === this.selfId || this.peers.has(id)) ?? this.selfId;
    this.heard = performance.now();
    if (next === this.selfId) this._claim();
    else this.hostId = next; // wait for their state; if they vanish too, the watchdog elects again
  }
  _claim() {
    this.hostId = this.selfId;
    this.order = [this.selfId, ...this.order.filter(id => id !== this.selfId && this.peers.has(id))];
    this.ready = true;
    this.h.onBecomeHost();
  }
  _setOrder(order) {
    const old = this.order;
    this.order = order;
    for (const id of order) if (id !== this.selfId && !old.includes(id)) this.h.onPeers(id, true);
    for (const id of old) if (id !== this.selfId && !order.includes(id)) this.h.onPeers(id, false);
  }

  /** Start hosting a city (a new one, or one this device saved earlier). */
  open(world) {
    this.cancelAsk();
    this.world = world;
    this.order = [this.selfId];
    this._claim();
  }
  /** Ask the host of a city to let this device in. `key` gets a past member in without anyone having to say yes. */
  ask(hostId, key, name, pick = false) {
    this.cancelAsk();
    const knock = () => this._send('ask', { key: key || '', name: this.h.myName(), ver: this.h.myVer(), pick }, hostId);
    this.asking = { host: hostId, name, timer: setInterval(knock, 2000) };
    knock();
  }
  cancelAsk() { if (this.asking) clearInterval(this.asking.timer); this.asking = null; }
  /** Host: let a device into the city. */
  admit(id) {
    if (!this.isHost || !this.peers.has(id)) return;
    const fresh = !this.order.includes(id);
    if (fresh) this.order.push(id);
    this._send('welcome', this.world, id); // first, so the newcomer is listening when greetings arrive
    if (fresh) this.h.onPeers(id, true);
  }
  /** Host: turn a device away. */
  deny(id) { this._send('deny', {}, id); }

  _recv(kind, data, from) {
    if (this.lanOnly && !this.okPeers.has(from)) { this._vet(from); return; } // not (yet) known to be on this network
    this.peers.add(from);
    const now = performance.now();
    if (kind === 'state') {
      if (!data || typeof data.w !== 'string') return;
      this.worlds.set(from, { id: data.w, name: String(data.wn || 'A city').slice(0, 24), host: from, n: (data.order || []).length, d: data.d | 0, ver: data.ver, apart: !!data.apart, at: now });
      if (!this.world) return;
      if (data.w !== this.world.id) { // some other city
        // Two cities on one network become one, unless a player chose to keep theirs apart.
        // The one whose host has the lower id stays. A city kept apart is left alone, both ways.
        if (this.isHost && !this.world.apart && !data.apart && !this.asking && from < this.selfId) this.h.onFold(from, this.worlds.get(from));
        return;
      }
      if (this.isHost) {
        // The same city has two hosts (both carried on after losing each other).
        // The lower id keeps it; the other folds in and offers what it built.
        if (from < this.selfId && this.asking?.host !== from) this.ask(from, this.world.key, this.world.name);
        return;
      }
      if (from !== this.hostId && !this.order.includes(from)) return; // not from this city's members
      this.hostId = from;
      this.heard = now;
      this.ready = true;
      this._setOrder(Array.isArray(data.order) ? data.order : [from]);
      this.h.onState(data);
      return;
    }
    if (kind === 'ask') {
      if (!this.isHost) return;
      if (!data || data.ver !== this.h.myVer()) { this.deny(from); this.h.onClash(); return; } // a city runs one version of the game
      // Walk-ins are the normal case. Only someone who picked this city from a menu of several waits for a yes.
      if (!data.pick || (data.key && data.key === this.world.key)) this.admit(from);
      else this.h.onAsk(from, String((data && data.name) || 'Someone').slice(0, 12));
      return;
    }
    if (kind === 'welcome') {
      if (this.asking?.host !== from || !data || typeof data.id !== 'string') return;
      this.cancelAsk();
      this.world = { id: data.id, key: String(data.key || ''), name: String(data.name || 'A city').slice(0, 24), apart: false };
      this.hostId = from; this.heard = now;
      this._setOrder([from, this.selfId]);
      this.h.onWelcome(this.world);
      return;
    }
    if (kind === 'deny') {
      if (this.asking?.host === from) { this.cancelAsk(); this.h.onDenied(); }
      return;
    }
    if (kind === 'pos' || kind === 'me') { // where a member is, and who they are: passed along by the host
      if (!this.world) return;
      if (this.isHost) {
        if (!this.order.includes(from)) return;
        this._relay(kind, data, from);
        this.h.onMsg(kind, data, from);
      } else if (from === this.hostId && data && typeof data.f === 'string' && data.f !== this.selfId && this.order.includes(data.f)) {
        this.h.onMsg(kind, data.d, data.f);
      }
      return;
    }
    if (!this.world || !this.order.includes(from)) return; // only members of this city are heard
    if ((kind === 'done' || kind === 'grab' || kind === 'offer' || kind === 'hold') && !this.isHost) return;
    this.h.onMsg(kind, data, from);
  }

  _send(kind, data, target) {
    const a = this.acts[kind];
    if (!a) return;
    // State goes to the whole room, which is how cities are found. Everything else stays inside the city.
    const to = target ? [target] : kind === 'state' ? [...this.peers] : this.order.filter(id => id !== this.selfId && this.peers.has(id));
    for (const t of to) try { Promise.resolve(a.send(data, { target: t })).catch(() => {}); } catch { /* peer went away */ }
  }
  /** Host: pass one member's position or profile on to the others. */
  _relay(kind, data, from) {
    for (const id of this.order) if (id !== this.selfId && id !== from && this.peers.has(id)) this._send(kind, { f: from, d: data }, id);
  }
  /** To every member (state: to everyone in the room). */
  broadcast(kind, data) {
    if (kind !== 'pos' && kind !== 'me') return this._send(kind, data);
    if (!this.world) return;
    if (this.isHost) this._relay(kind, data, this.selfId);
    else if (this.hostId) this._send(kind, data, this.hostId);
  }
  /** To one peer. */
  sendTo(id, kind, data) { if (this.peers.has(id)) this._send(kind, data, id); }
  /** To the host; runs locally when this device is the host. */
  toHost(kind, data) {
    if (this.isHost) this.h.onMsg(kind, data, this.selfId);
    else if (this.hostId) this.sendTo(this.hostId, kind, data);
  }
}
