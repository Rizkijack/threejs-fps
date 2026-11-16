// Procedural audio: no files, no loading. Every sound is a short noise burst through a
// filter plus a sine body, built when it plays. The context only starts on a user gesture,
// which is why unlock() exists; before that every call is a no-op.
const SHOTS = {
  pistol: { freq: 1900, q: 0.9, dur: 0.11, gain: 0.5, body: 132, bodyGain: 0.28 },
  heavy: { freq: 1350, q: 0.8, dur: 0.19, gain: 0.62, body: 104, bodyGain: 0.36 },
  smg: { freq: 2350, q: 1.2, dur: 0.075, gain: 0.36, body: 158, bodyGain: 0.2 },
  rifle: { freq: 1700, q: 0.7, dur: 0.14, gain: 0.56, body: 96, bodyGain: 0.34 },
};

export function createAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let lastStep = 0;
  let lastBeep = 0;
  let voices = 0;

  function unlock() {
    if (!AC) return;
    if (!ctx) {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
      const frames = Math.floor(ctx.sampleRate * 0.7);
      noiseBuffer = ctx.createBuffer(1, frames, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < frames; i += 1) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  function budget() {
    if (!ctx || voices > 26) return false;
    voices += 1;
    setTimeout(() => { voices -= 1; }, 260);
    return true;
  }

  function nz(freq, q, dur, gain, at, type) {
    if (!budget()) return;
    const now = ctx.currentTime + (at || 0);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.playbackRate.value = 0.85 + Math.random() * 0.3;
    const filter = ctx.createBiquadFilter();
    filter.type = type || 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = q;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, now);
    amp.gain.exponentialRampToValueAtTime(0.0008, now + dur);
    src.connect(filter).connect(amp).connect(master);
    src.start(now);
    src.stop(now + dur + 0.02);
  }

  function tone(freq, to, dur, gain, at, type) {
    if (!budget()) return;
    const now = ctx.currentTime + (at || 0);
    const osc = ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, now);
    if (to !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), now + dur);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.exponentialRampToValueAtTime(gain, now + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0008, now + dur);
    osc.connect(amp).connect(master);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  function atten(game, x, z) {
    const state = game && game.player ? game.player.state : null;
    if (!state) return 1;
    const d = Math.hypot(state.x - x, state.z - z);
    return Math.max(0.04, 1 / (1 + d * 0.1));
  }

  return {
    unlock,
    shot(kind) {
      if (!ctx) return;
      const s = SHOTS[kind] || SHOTS.rifle;
      nz(s.freq, s.q, s.dur, s.gain, 0);
      tone(s.body, s.body * 0.55, s.dur * 1.3, s.bodyGain, 0, 'triangle');
    },
    botShot(game, x, z) {
      if (!ctx) return;
      const v = atten(game, x, z);
      if (v < 0.06) return;
      const s = SHOTS.rifle;
      nz(s.freq, s.q, s.dur, s.gain * v, 0);
      tone(s.body, s.body * 0.55, s.dur * 1.3, s.bodyGain * v, 0, 'triangle');
    },
    hit(headshot) {
      if (!ctx) return;
      nz(headshot ? 3200 : 2500, 3, 0.05, 0.28, 0);
      tone(headshot ? 2100 : 1500, headshot ? 1500 : 1100, 0.07, 0.16, 0, 'square');
    },
    kill() {
      if (!ctx) return;
      tone(320, 120, 0.22, 0.2, 0, 'triangle');
      nz(900, 1.2, 0.12, 0.22, 0);
    },
    reload() {
      if (!ctx) return;
      nz(1500, 2, 0.05, 0.2, 0);
      nz(700, 1.5, 0.07, 0.2, 0.28);
    },
    empty() {
      if (!ctx) return;
      nz(2400, 3, 0.03, 0.16, 0);
    },
    footstep(game, volume) {
      if (!ctx) return;
      const now = performance.now();
      if (now - lastStep < 90) return;
      lastStep = now;
      nz(420, 0.9, 0.09, 0.16 * (volume || 0.5), 0, 'lowpass');
    },
    jump() {
      if (!ctx) return;
      nz(500, 0.8, 0.1, 0.12, 0, 'lowpass');
    },
    hurt() {
      if (!ctx) return;
      tone(160, 70, 0.2, 0.24, 0, 'triangle');
      nz(600, 0.8, 0.14, 0.18, 0, 'lowpass');
    },
    playerDown() {
      if (!ctx) return;
      tone(220, 60, 0.7, 0.26, 0, 'sawtooth');
      nz(300, 0.7, 0.5, 0.2, 0, 'lowpass');
    },
    botDown(game, x, z) {
      if (!ctx) return;
      const v = atten(game, x, z);
      if (v < 0.05) return;
      tone(210, 66, 0.4, 0.2 * v, 0, 'sawtooth');
      nz(430, 0.8, 0.26, 0.18 * v, 0, 'lowpass');
    },
    planted(game, x, z) {
      if (!ctx) return;
      const v = atten(game, x, z);
      tone(880, 880, 0.09, 0.2 * v, 0, 'square');
      tone(1320, 1320, 0.14, 0.18 * v, 0.16, 'square');
      nz(900, 1, 0.3, 0.18 * v, 0, 'lowpass');
    },
    defuseStart(game, x, z) {
      if (!ctx) return;
      const v = atten(game, x, z);
      nz(1800, 2, 0.4, 0.14 * v, 0, 'bandpass');
    },
    defuseDone(game, x, z) {
      if (!ctx) return;
      const v = atten(game, x, z);
      tone(520, 720, 0.3, 0.2 * v, 0, 'triangle');
    },
    beep(hot) {
      if (!ctx) return;
      const now = performance.now();
      if (now - lastBeep < 110) return;
      lastBeep = now;
      tone(hot ? 1760 : 1320, hot ? 1760 : 1320, 0.055, 0.13, 0, 'square');
    },
    explosion(game, x, z) {
      if (!ctx) return;
      const v = Math.max(0.3, atten(game, x, z));
      nz(240, 0.6, 0.9, 0.7 * v, 0, 'lowpass');
      tone(90, 28, 0.8, 0.5 * v, 0, 'sine');
      nz(1600, 0.8, 0.25, 0.3 * v, 0.02, 'bandpass');
    },
    buy() {
      if (!ctx) return;
      tone(760, 760, 0.07, 0.16, 0, 'square');
      tone(1140, 1140, 0.1, 0.14, 0.08, 'square');
    },
    denied() {
      if (!ctx) return;
      tone(180, 140, 0.18, 0.16, 0, 'sawtooth');
    },
    swap() {
      if (!ctx) return;
      nz(1200, 2.5, 0.05, 0.18, 0);
    },
    roundLive() {
      if (!ctx) return;
      tone(520, 520, 0.09, 0.16, 0, 'square');
      tone(780, 780, 0.14, 0.16, 0.1, 'square');
    },
    win() {
      if (!ctx) return;
      tone(523, 523, 0.14, 0.2, 0, 'triangle');
      tone(659, 659, 0.14, 0.2, 0.13, 'triangle');
      tone(784, 784, 0.32, 0.22, 0.26, 'triangle');
    },
    lose() {
      if (!ctx) return;
      tone(392, 392, 0.16, 0.2, 0, 'triangle');
      tone(311, 311, 0.2, 0.2, 0.15, 'triangle');
      tone(233, 233, 0.4, 0.22, 0.33, 'triangle');
    },
  };
}
