// Plays the pre-recorded voice clips in audio/. The list of clips that exist
// comes from js/voice-data.js, written by tools/build_voices.py.
import CLIPS from './voice-data.js';

const chans = {}; // channel name -> { a: Audio, q: [keys], vol }

function next(c) {
  const k = c.q.shift();
  if (!k) { c.on = false; return; }
  c.on = true;
  c.a.src = `audio/${k}.mp3`;
  c.a.volume = c.vol;
  c.a.play().catch(() => { c.on = false; });
}

export const has = key => CLIPS.has(key);
export const busy = ch => !!chans[ch]?.on;

/** Play one clip or several in a row on a channel. Returns false if any clip is missing. */
export function play(keys, vol = 1, ch = 'npc') {
  keys = [].concat(keys);
  if (!keys.length || !keys.every(has)) return false;
  let c = chans[ch];
  if (!c) {
    c = chans[ch] = { a: new Audio(), q: [], vol, on: false };
    c.a.addEventListener('ended', () => next(c));
    c.a.addEventListener('error', () => next(c));
  }
  c.a.pause();
  c.q = keys; c.vol = Math.max(0, Math.min(1, vol));
  next(c);
  return true;
}
export function stop() {
  for (const c of Object.values(chans)) { c.q = []; c.a.pause(); c.on = false; }
}
