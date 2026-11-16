// Hit resolution. One job: turn a shot or a blast into damage and the effects that sell it.
// Player shots start at the eye and drift inside the weapon's spread cone; bot shots start
// at the bot's muzzle and drift by a distance-scaled aim error. Both stop on the map first.
import { rayBox, rayColliders, lineBlocked } from './collision.js';
import { COLORS } from './palette.js';

const PART_HEAD = 'head';
const PART_TORSO = 'torso';
const PART_LEGS = 'legs';
const MAX_RANGE = 90;

// Scratch for spread math, reused across every shot.
let dx = 0;
let dy = 0;
let dz = 0;

function falloff(distance, range) {
  if (distance <= range * 0.45) return 1;
  return Math.max(0.55, 1 - ((distance - range * 0.45) / (range * 0.55)) * 0.45);
}

function killBot(game, bot, headshot) {
  bot.alive = false;
  bot.fall = 0;
  bot.hp = 0;
  bot.defusing = false;
  game.events.push({ type: 'kill', botId: bot.id, headshot });
  game.audio.botDown(game, bot.x, bot.z);
  game.effects.puff(bot.x, 1.5, bot.z, COLORS.charge);
}

export function playerShot(game, spread) {
  const player = game.player.state;
  const def = game.weapons.def();
  const rng = game.rng;

  const cosP = Math.cos(player.pitch);
  const sinP = Math.sin(player.pitch);
  const sinY = Math.sin(player.yaw);
  const cosY = Math.cos(player.yaw);
  // Forward, right and up for a YXZ view; reads the same as the camera's basis.
  const fx = -sinY * cosP;
  const fy = sinP;
  const fz = -cosY * cosP;
  const rx = cosY;
  const rz = -sinY;
  const ux = sinY * sinP;
  const uy = cosP;
  const uz = cosY * sinP;

  // Uniform sample of the spread disk, so the cone is not centre-heavy.
  const theta = rng() * Math.PI * 2;
  const radius = Math.sqrt(rng()) * spread;
  const offR = Math.cos(theta) * radius;
  const offU = Math.sin(theta) * radius;
  dx = fx + rx * offR + ux * offU;
  dy = fy + uy * offU;
  dz = fz + rz * offR + uz * offU;
  const len = Math.hypot(dx, dy, dz);
  dx /= len;
  dy /= len;
  dz /= len;

  const ox = player.x;
  const oy = player.y + player.eye;
  const oz = player.z;

  const worldT = rayColliders(game.world.colliders, ox, oy, oz, dx, dy, dz, MAX_RANGE);
  let bestT = worldT === Infinity ? MAX_RANGE : worldT;
  let hitBot = null;
  let hitPart = '';

  const bots = game.bots.list;
  for (let i = 0; i < bots.length; i += 1) {
    const bot = bots[i];
    if (!bot.alive) continue;
    const headT = rayBox(bot.headBox, ox, oy, oz, dx, dy, dz, bestT);
    if (headT >= 0 && headT < bestT) {
      bestT = headT;
      hitBot = bot;
      hitPart = PART_HEAD;
      continue;
    }
    const torsoT = rayBox(bot.torsoBox, ox, oy, oz, dx, dy, dz, bestT);
    if (torsoT >= 0 && torsoT < bestT) {
      bestT = torsoT;
      hitBot = bot;
      hitPart = PART_TORSO;
      continue;
    }
    const legsT = rayBox(bot.legsBox, ox, oy, oz, dx, dy, dz, bestT);
    if (legsT >= 0 && legsT < bestT) {
      bestT = legsT;
      hitBot = bot;
      hitPart = PART_LEGS;
    }
  }

  const hx = ox + dx * bestT;
  const hy = oy + dy * bestT;
  const hz = oz + dz * bestT;

  // Muzzle in world space, offset from the eye so the tracer reads as coming off the barrel.
  const mx = ox + fx * 0.5 + rx * 0.16 - ux * 0.1;
  const my = oy + fy * 0.5 - uy * 0.09;
  const mz = oz + fz * 0.5 + rz * 0.16 - uz * 0.1;
  // Start the tracer a metre out: a line that begins at the camera reads as a plank.
  const skip = Math.min(1.3, Math.max(0, (bestT - 0.7) * 0.35));
  game.effects.tracer(mx + dx * skip, my + dy * skip, mz + dz * skip, hx, hy, hz, COLORS.vanguard);

  if (hitBot === null) {
    if (worldT !== Infinity) game.effects.puff(hx, hy, hz, COLORS.bone);
    return;
  }

  const distance = bestT;
  let damage = def.damage * falloff(distance, def.range);
  if (hitPart === PART_HEAD) damage *= def.headMult;
  else if (hitPart === PART_LEGS) damage *= 0.72;

  game.effects.puff(hx, hy, hz, hitPart === PART_HEAD ? COLORS.charge : COLORS.vanguard);
  const headshot = hitPart === PART_HEAD;
  hitBot.hp -= damage;
  hitBot.alert = Math.max(hitBot.alert, 3.5);
  hitBot.suppress = 0.5;
  if (hitBot.hp <= 0) {
    killBot(game, hitBot, headshot);
    game.hud.hitMarker(headshot, true);
    game.events.push({ type: 'hit', headshot, kill: true });
  } else {
    hitBot.lastX = ox;
    hitBot.lastZ = oz;
    game.hud.hitMarker(headshot, false);
    game.events.push({ type: 'hit', headshot, kill: false });
  }
}

export function botShot(game, bot) {
  const player = game.player.state;
  const rng = game.rng;
  const eyeY = 1.55;
  const ox = bot.x;
  const oy = eyeY;
  const oz = bot.z;

  // Aim at the chest most of the time, occasionally at the head; the error cone widens
  // with range and with a target that is moving, which is the whole counterplay.
  const aimHead = rng() < 0.16;
  const height = player.crouching ? 0.78 : 1.2;
  const tx = player.x + (rng() * 2 - 1) * 0.16;
  const ty = player.y + (aimHead ? player.height * 0.9 : height);
  const tz = player.z + (rng() * 2 - 1) * 0.16;

  const vx = tx - ox;
  const vy = ty - oy;
  const vz = tz - oz;
  const dist = Math.hypot(vx, vy, vz) || 1;
  const react = 0.011 + dist * 0.0022 + (player.speed > 2 ? 0.018 : 0) + bot.error;
  const theta = rng() * Math.PI * 2;
  const rad = Math.sqrt(rng()) * react;
  // Two cheap perpendicular offsets: horizontal and vertical wobble.
  const nx = -vz / dist;
  const nz = vx / dist;
  dx = vx / dist + nx * Math.cos(theta) * rad;
  dy = vy / dist + Math.sin(theta) * rad;
  dz = vz / dist + nz * Math.cos(theta) * rad;
  const len = Math.hypot(dx, dy, dz);
  dx /= len;
  dy /= len;
  dz /= len;

  const worldT = rayColliders(game.world.colliders, ox, oy, oz, dx, dy, dz, MAX_RANGE);
  let bestT = worldT === Infinity ? MAX_RANGE : worldT;
  let part = '';
  const headT = rayBox(player.headHitbox, ox, oy, oz, dx, dy, dz, bestT);
  if (headT >= 0 && headT < bestT) {
    bestT = headT;
    part = PART_HEAD;
  } else {
    const torsoT = rayBox(player.torso, ox, oy, oz, dx, dy, dz, bestT);
    if (torsoT >= 0 && torsoT < bestT) {
      bestT = torsoT;
      part = PART_TORSO;
    } else {
      const legsT = rayBox(player.legs, ox, oy, oz, dx, dy, dz, bestT);
      if (legsT >= 0 && legsT < bestT) {
        bestT = legsT;
        part = PART_LEGS;
      }
    }
  }

  const hx = ox + dx * bestT;
  const hy = oy + dy * bestT;
  const hz = oz + dz * bestT;
  const mx = ox + (dx * 0.55);
  const my = oy - 0.12 + dy * 0.55;
  const mz = oz + (dz * 0.55);
  game.effects.tracer(mx, my, mz, hx, hy, hz, COLORS.warden);
  game.effects.muzzle(mx, my, mz, COLORS.warden);
  game.audio.botShot(game, ox, oz);

  if (part === '') {
    if (worldT !== Infinity) game.effects.puff(hx, hy, hz, COLORS.bone);
    return;
  }

  let damage = bot.damage * falloff(bestT, 45);
  if (part === PART_HEAD) damage *= 1.9;
  else if (part === PART_LEGS) damage *= 0.7;
  game.damagePlayer(damage);
  game.effects.puff(hx, hy, hz, COLORS.charge);
}

/** A frag charge: damage falls off with distance, and walls block the blast entirely. */
export function explode(game, x, y, z) {
  const radius = 6.0;
  game.effects.explosion(x, y, z);
  game.audio.explosion(game, x, z);

  const bots = game.bots.list;
  for (let i = 0; i < bots.length; i += 1) {
    const bot = bots[i];
    if (!bot.alive) continue;
    const d = Math.hypot(bot.x - x, bot.z - z);
    if (d > radius) continue;
    if (lineBlocked(game.world.colliders, x, y + 0.3, z, bot.x, 1.2, bot.z)) continue;
    const damage = 130 * (1 - d / radius) + 12;
    bot.hp -= damage;
    bot.alert = 8;
    if (bot.hp <= 0) killBot(game, bot, false);
  }

  const p = game.player.state;
  if (!p.alive) return;
  const d = Math.hypot(p.x - x, p.z - z);
  if (d > radius) return;
  if (lineBlocked(game.world.colliders, x, y + 0.3, z, p.x, p.y + 1.0, p.z)) return;
  game.damagePlayer(110 * (1 - d / radius) + 10);
}
