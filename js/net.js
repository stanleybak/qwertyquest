// Networking: Trystero full mesh with one peer acting as host.
//
// Game state goes client -> host -> everyone. Positions and profiles go
// straight peer to peer because the mesh is already there. When the host
// leaves, the next peer in the host's join order takes over from the last
// state it received.
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
export async function findRoom(code) {
  if (code) return { id: 'code-' + await sha('code:' + code.toLowerCase().trim()), label: `room "${code}"` };
  const ip = await publicIp();
  if (!ip) return { id: null, label: 'offline' };
  return { id: 'lan-' + await sha('lan:' + ip), label: 'your network' };
}

export class Net {
  /**
   * handlers: onState(state), onBecomeHost(), onPeers(), onMsg(kind, data, from)
   * getState(): the current state when this peer is host
   */
  constructor(handlers) {
    this.h = handlers;
    this.selfId = 'solo';
    this.peers = new Set();
    this.order = [];      // host first, then join order as the host saw it
    this.hostId = null;   // null until we know
    this.acts = {};
    this.room = null;
    this.ready = false;
    this.heard = 0;       // when the host last sent state
  }
  get isHost() { return this.hostId === this.selfId; }

  async join(roomId) {
    if (!roomId) { this._claim(); return; }
    try {
      this.room = joinRoom({ appId: APP_ID, identity: 'none' }, roomId);
      this.selfId = (await this.room.getSelf()).userId;
    } catch (e) {
      console.warn('network unavailable, playing solo', e);
      this.room = null; this._claim(); return;
    }
    for (const kind of ['state', 'done', 'pos', 'me', 'grab', 'grant', 'offer']) {
      const a = this.acts[kind] = this.room.makeAction(kind);
      a.onMessage((data, ctx) => this._recv(kind, data, ctx.userId));
    }
    this.room.onUserJoin(({ userId }) => {
      this.peers.add(userId);
      if (this.isHost && !this.order.includes(userId)) this.order.push(userId);
      this.h.onPeers(userId, true);
    }, { replay: true });
    this.room.onUserLeave(({ userId }) => {
      this.peers.delete(userId);
      this.order = this.order.filter(id => id !== userId);
      this.h.onPeers(userId, false);
      if (this.hostId === userId) this._elect();
    });
    // Give an existing host a moment to speak before claiming the room.
    setTimeout(() => { if (!this.hostId) this._elect(); }, 3500);
    // A host that closes its laptop does not say goodbye, and WebRTC can take
    // half a minute to notice. The state heartbeat is the faster signal.
    setInterval(() => {
      if (this.isHost || !this.hostId || performance.now() - this.heard < 3500) return;
      const gone = this.hostId;
      this.peers.delete(gone);
      this.order = this.order.filter(id => id !== gone);
      this.h.onPeers(gone, false);
      this._elect();
    }, 1000);
  }

  /** Pick the host: first surviving entry of the known order, else lowest id. */
  _elect() {
    const alive = id => id === this.selfId || this.peers.has(id);
    const known = this.order.filter(alive);
    const next = known.length ? known[0] : [this.selfId, ...this.peers].sort()[0];
    this.heard = performance.now();
    if (next === this.selfId) this._claim();
    else this.hostId = next; // wait for their state; if they vanish, onUserLeave elects again
  }
  _claim() {
    this.hostId = this.selfId;
    this.order = [this.selfId, ...this.order.filter(id => id !== this.selfId && this.peers.has(id))];
    for (const id of this.peers) if (!this.order.includes(id)) this.order.push(id);
    this.ready = true;
    this.h.onBecomeHost();
  }

  _recv(kind, data, from) {
    if (!this.peers.has(from)) { // someone we had given up on is back
      this.peers.add(from);
      if (this.isHost && !this.order.includes(from)) this.order.push(from);
      this.h.onPeers(from, true);
    }
    if (kind === 'state') {
      if (this.isHost) {
        // Two hosts met (both started alone). The bigger city wins, then the lower id.
        const mine = this.h.getState();
        const theirs = data.total > mine.total || (data.total === mine.total && from < this.selfId);
        if (!theirs) return;
      }
      this.hostId = from;
      this.heard = performance.now();
      this.order = data.order || [from];
      this.ready = true;
      this.h.onState(data);
      return;
    }
    if ((kind === 'done' || kind === 'grab' || kind === 'offer') && !this.isHost) return;
    this.h.onMsg(kind, data, from);
  }

  _send(kind, data, target) {
    const a = this.acts[kind];
    if (!a || !this.peers.size) return;
    try { Promise.resolve(a.send(data, target ? { target } : undefined)).catch(() => {}); } catch { /* peer went away */ }
  }
  /** To every peer. */
  broadcast(kind, data) { this._send(kind, data); }
  /** To one peer. */
  sendTo(id, kind, data) { if (this.peers.has(id)) this._send(kind, data, id); }
  /** To the host; runs locally when this peer is the host. */
  toHost(kind, data) {
    if (this.isHost || !this.hostId) this.h.onMsg(kind, data, this.selfId);
    else this.sendTo(this.hostId, kind, data);
  }
}
