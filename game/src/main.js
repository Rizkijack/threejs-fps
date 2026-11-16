// BREACHPOINT boot: one scene, one shared game object, a fixed 60 Hz simulation and a
// render at display rate. Every module is handed the same `game` so nothing reaches around
// another module's back. ?shot=start|play|end with &seed=N poses a deterministic frame,
// paints it twice and sets window.__shotReady for the screenshot pass.
import * as THREE from 'three';
import { COLORS } from './palette.js';
import { createRng } from './rng.js';
import { createWorld } from './world.js';
import { createEffects } from './effects.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapons, BUY_ITEMS } from './weapons.js';
import { createBots } from './bots.js';
import { createGrenades } from './grenade.js';
import { createRounds } from './rounds.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { playerShot } from './combat.js';

const FIXED_STEP = 1 / 60;
const SENSITIVITY = 0.0022;
const params = new URLSearchParams(window.location.search);
const shotMode = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(COLORS.night);
scene.fog = new THREE.Fog(new THREE.Color(COLORS.fog), 20, 58);
const camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const rng = createRng(seed);
const world = createWorld(scene);
const effects = createEffects(scene);
const weapons = createWeapons(camera);
const player = createPlayer(world);
const bots = createBots(scene, world);
const grenades = createGrenades(scene);
const rounds = createRounds(scene, world, weapons);
const hud = createHud();
const audio = createAudio();
const input = createInput(renderer.domElement, onLockChange);

const game = {
  scene,
  camera,
  renderer,
  world,
  effects,
  weapons,
  player,
  bots,
  grenades,
  rounds,
  round: rounds.state,
  hud,
  audio,
  rng,
  input,
  events: [],
  started: false,
  damagePlayer,
};

let accumulator = 0;
let lastTime = performance.now();
let started = false;
let paused = false;
let fireHeld = false;
let overlayKind = null;

function damagePlayer(amount) {
  const body = player.state;
  if (!body.alive) return;
  const died = player.damage(amount, game);
  hud.damageFlash(amount);
  if (amount > 3) audio.hurt();
  if (died) {
    game.events.push({ type: 'death' });
    hud.killfeed('WARDEN ▼ VANGUARD', true);
  }
}

function resolveFire() {
  const body = player.state;
  const live = rounds.state.phase === 'live' || rounds.state.phase === 'planted';
  if (!body.alive || !live) {
    fireHeld = input.state.firing;
    return;
  }
  const def = weapons.def();
  const fresh = input.state.firing && !fireHeld;
  if (input.state.firing && (def.auto || fresh)) {
    const fired = weapons.tryFire();
    if (fired) {
      playerShot(game, weapons.spreadFor(body));
      player.kick(fired.kick, (rng() * 2 - 1) * fired.yawKick);
      audio.shot(fired.sound);
      bots.alertAt(body.x, body.z, 26);
    } else {
      if (weapons.state.mag === 0 && weapons.state.reloadLeft === 0) {
        if (weapons.startReload()) audio.reload();
        else audio.empty();
      }
    }
  }
  fireHeld = input.state.firing;
}

function throwGrenade() {
  const body = player.state;
  if (!body.alive || weapons.state.grenades <= 0) return;
  if (rounds.state.phase !== 'live' && rounds.state.phase !== 'planted') return;
  weapons.state.grenades -= 1;
  grenades.throwFrom(body.x, body.y + body.eye - 0.06, body.z, body.yaw, body.pitch);
  audio.swap();
  hud.paintBuy(rounds.state, weapons);
}

function drainEvents() {
  const events = game.events;
  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    if (event.type === 'hit') {
      audio.hit(event.headshot);
    } else if (event.type === 'kill') {
      rounds.killReward(game);
      hud.killfeed(`VANGUARD ▶ WARDEN-${event.botId + 1}${event.headshot ? ' · HEAD' : ''}`, event.headshot);
      audio.kill();
    } else if (event.type === 'round') {
      overlayKind = event.matchOver ? 'match' : 'round';
      hud.showOverlay(overlayKind, event);
      if (event.winner === 'vanguard') audio.win();
      else audio.lose();
    }
  }
  events.length = 0;
}

function tick(dt) {
  rounds.step(dt, game, rounds.state.phase === 'live' && input.state.keys.has('KeyE'));
  player.step(dt, input.state.keys, game);
  bots.step(dt, game);
  weapons.step(dt, player.state);
  grenades.step(dt, game);
  effects.step(dt);
  world.step(dt);
  resolveFire();
  drainEvents();
}

function oneShots() {
  if (input.pressed('KeyR')) {
    if (player.state.alive && weapons.startReload()) audio.reload();
  }
  if (input.pressed('KeyQ')) rounds.swap(game);
  if (input.pressed('KeyG')) throwGrenade();
  for (let i = 0; i < BUY_ITEMS.length; i += 1) {
    const item = BUY_ITEMS[i];
    if (input.pressed(item.code)) rounds.buy(item.code, game);
  }
}

function syncCamera() {
  const body = player.state;
  camera.position.set(body.x, body.y + body.eye - body.deadTilt * 0.45, body.z);
  camera.rotation.set(body.pitch, body.yaw, body.deadTilt * 1.05, 'YXZ');
}

function onLockChange(locked) {
  if (shotMode) return;
  if (locked) {
    audio.unlock();
    paused = false;
    hud.hideOverlay();
    overlayKind = null;
    if (!started) {
      started = true;
      game.started = true;
      rounds.state.started = true;
      rounds.beginRound(game);
      hud.paintRound(rounds.state, weapons, game);
    }
  } else if (started) {
    paused = true;
    hud.showOverlay('paused');
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  if (started && !paused) {
    const look = input.takeLook();
    player.look(look.x * SENSITIVITY, look.y * SENSITIVITY);
    oneShots();
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      tick(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (steps === 5) accumulator = 0;
    if (overlayKind && rounds.state.phase !== 'over') {
      hud.hideOverlay();
      overlayKind = null;
    }
  } else {
    input.takeLook();
  }

  syncCamera();
  renderer.render(scene, camera);
  input.endFrame();
}

// ---- deterministic screenshot poses ------------------------------------------------
function aimAt(x, y, z) {
  const body = player.state;
  const dx = x - body.x;
  const dy = y - (body.y + body.eye);
  const dz = z - body.z;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  syncCamera();
}

function settle(count) {
  for (let i = 0; i < count; i += 1) tick(FIXED_STEP);
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
    }
  }
  requestAnimationFrame(paint);
}

function runShot(mode) {
  started = true;
  game.started = true;
  rounds.state.started = true;
  rounds.beginRound(game);
  player.state.armor = 0;

  if (mode === 'start') {
    hud.showOverlay('start');
    settle(24);
    aimAt(0, 1.7, -3.2);
  } else if (mode === 'play') {
    hud.hideOverlay();
    rounds.state.phase = 'live';
    rounds.state.timer = 41;
    rounds.state.buyOpen = false;
    rounds.state.note = '';
    rounds.state.noteTimer = 0;
    const body = player.state;
    body.x = 3.8;
    body.z = 2.8;
    body.y = 0;
    body.hp = 78;
    body.armor = 40;
    rounds.state.money = 1450;
    weapons.refill('vantage');
    const target = bots.list[2];
    target.x = 0.4;
    target.z = -3.6;
    target.yaw = Math.PI;
    target.group.position.set(target.x, 0, target.z);
    target.group.rotation.y = target.yaw;
    bots.refreshBoxes(target);
    settle(4);
    aimAt(target.x, 1.66, target.z);
    weapons.tryFire();
    playerShot(game, 0);
    player.kick(0.014, 0.002);
    audio.shot('rifle');
    settle(2);
    aimAt(target.x + 0.15, 1.55, target.z);
  } else {
    hud.hideOverlay();
    rounds.state.phase = 'live';
    rounds.state.timer = 18;
    rounds.state.buyOpen = false;
    rounds.state.wins.vanguard = 2;
    rounds.state.wins.warden = 1;
    rounds.state.money = 4700;
    weapons.refill('kestrel');
    player.state.hp = 62;
    player.state.armor = 55;
    const body = player.state;
    body.x = -11.5;
    body.z = 4.1;
    aimAt(world.sites[0].x + 0.4, 1.7, world.sites[0].z + 1.6);
    settle(20);
    for (let i = 0; i < bots.list.length; i += 1) {
      const bot = bots.list[i];
      bot.alive = false;
      bot.fall = 1;
      bot.group.visible = false;
    }
    settle(1);
    settle(30);
    aimAt(world.sites[0].x + 0.4, 1.4, world.sites[0].z + 1.4);
  }

  hud.paintRound(rounds.state, weapons, game);
  paintTwiceThenReady();
}

hud.onPlay(() => {
  if (shotMode) return;
  audio.unlock();
  input.requestLock();
});
hud.onBuy((code) => {
  if (!started || paused) return;
  rounds.buy(code, game);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

rounds.beginRound(game);
hud.paintRound(rounds.state, weapons, game);
syncCamera();

if (shotMode) {
  runShot(shotMode);
} else {
  hud.showOverlay('start');
  requestAnimationFrame(frame);
}
