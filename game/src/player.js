// The player body: acceleration, friction, gravity, crouch, sprint and a jump. Horizontal
// movement is solved against the map's boxes; the eye is separate from the feet so a
// crouch reads as a camera dip, and recoil is a real kick the view recovers from.
import { boxOverlap, slideMove, makeHitbox, setHitbox } from './collision.js';

const RADIUS = 0.34;
const STAND_HEIGHT = 1.74;
const CROUCH_HEIGHT = 1.16;
const STAND_EYE = 1.62;
const CROUCH_EYE = 1.06;
const WALK_SPEED = 5.0;
const SPRINT_SPEED = 7.1;
const CROUCH_SPEED = 2.2;
const GROUND_ACCEL = 48;
const AIR_ACCEL = 9;
const FRICTION = 10;
const GRAVITY = 22;
const JUMP_SPEED = 6.4;
const MAX_HEALTH = 100;

export function createPlayer(world) {
  const state = {
    x: world.playerSpawn.x,
    y: 0,
    z: world.playerSpawn.z,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: world.playerSpawn.yaw,
    pitch: 0,
    eye: STAND_EYE,
    height: STAND_HEIGHT,
    crouching: false,
    sprinting: false,
    onGround: true,
    alive: true,
    hp: MAX_HEALTH,
    armor: 0,
    speed: 0,
    bob: 0,
    stepDistance: 0,
    recoilPitch: 0,
    deadTilt: 0,
    headHitbox: makeHitbox(),
    torso: makeHitbox(),
    legs: makeHitbox(),
  };

  function refreshHitboxes() {
    const h = state.crouching ? CROUCH_HEIGHT : STAND_HEIGHT;
    setHitbox(state.headHitbox, state.x, state.y, state.z, 0.21, h * 0.82, h + 0.06);
    setHitbox(state.torso, state.x, state.y, state.z, 0.3, h * 0.42, h * 0.84);
    setHitbox(state.legs, state.x, state.y, state.z, 0.3, 0, h * 0.42);
  }
  // The head box is created after the literal so the shape stays one object per body part.
  refreshHitboxes();

  // Look: mouse deltas only while pointer-locked; pitch is clamped short of straight up.
  function look(dx, dy, sensitivity) {
    if (!state.alive) return;
    state.yaw -= dx * sensitivity;
    state.pitch = Math.max(-1.45, Math.min(1.45, state.pitch - dy * sensitivity));
  }

  // The weapon pushes the view; part of the kick is recovered over the next few ticks.
  function kick(pitchKick, yawKick) {
    state.pitch = Math.min(1.45, state.pitch + pitchKick);
    state.yaw += yawKick;
    state.recoilPitch = Math.min(0.16, state.recoilPitch + pitchKick);
  }

  function damage(amount, game) {
    if (!state.alive) return false;
    let left = amount;
    if (state.armor > 0) {
      const soaked = Math.min(state.armor, amount * 0.5);
      state.armor -= soaked;
      left -= soaked;
    }
    state.hp -= left;
    if (state.hp <= 0) {
      state.hp = 0;
      state.alive = false;
      state.sprinting = false;
      if (game !== undefined) game.audio.playerDown();
      return true;
    }
    return false;
  }

  function respawn() {
    state.x = world.playerSpawn.x;
    state.y = 0;
    state.z = world.playerSpawn.z;
    state.vx = 0;
    state.vy = 0;
    state.vz = 0;
    state.yaw = world.playerSpawn.yaw;
    state.pitch = 0;
    state.hp = MAX_HEALTH;
    state.alive = true;
    state.crouching = false;
    state.height = STAND_HEIGHT;
    state.eye = STAND_EYE;
    state.recoilPitch = 0;
    state.deadTilt = 0;
    state.onGround = true;
    refreshHitboxes();
  }

  function step(dt, keys, game) {
    if (!state.alive) {
      state.deadTilt = Math.min(1, state.deadTilt + dt * 1.9);
      refreshHitboxes();
      return;
    }

    // Stance. Standing up is refused under a low ceiling.
    const wantsCrouch = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (wantsCrouch) {
      state.crouching = true;
      state.height = CROUCH_HEIGHT;
    } else if (state.crouching) {
      if (!boxOverlap(world.colliders, state.x - RADIUS, state.y + 0.06, state.z - RADIUS, state.x + RADIUS, state.y + STAND_HEIGHT, state.z + RADIUS)) {
        state.crouching = false;
        state.height = STAND_HEIGHT;
      }
    }
    state.eye += ((state.crouching ? CROUCH_EYE : STAND_EYE) - state.eye) * Math.min(1, dt * 14);

    // Wish direction, right-handed from yaw.
    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const sin = Math.sin(state.yaw);
    const cos = Math.cos(state.yaw);
    let wx = -sin * forward + cos * strafe;
    let wz = -cos * forward - sin * strafe;
    const wishLen = Math.hypot(wx, wz);
    if (wishLen > 0) {
      wx /= wishLen;
      wz /= wishLen;
    }

    const sprinting = (keys.has('ShiftLeft') || keys.has('ShiftRight')) && forward > 0 && !state.crouching;
    state.sprinting = sprinting;
    const top = state.crouching ? CROUCH_SPEED : sprinting ? SPRINT_SPEED : WALK_SPEED;
    const accel = state.onGround ? GROUND_ACCEL : AIR_ACCEL;
    const blend = Math.min(1, (accel * dt) / Math.max(1, top));
    state.vx += (wx * top - state.vx) * blend;
    state.vz += (wz * top - state.vz) * blend;
    if (state.onGround && wishLen === 0) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      state.vx *= damp;
      state.vz *= damp;
    }

    if (keys.has('Space') && state.onGround) {
      state.vy = JUMP_SPEED;
      state.onGround = false;
      game.audio.jump();
    }
    state.vy -= GRAVITY * dt;

    const slide = slideMove(world.colliders, state, state.vx * dt, state.vz * dt, RADIUS, state.height);
    if (slide.hitX) state.vx = 0;
    if (slide.hitZ) state.vz = 0;

    // Vertical: land on a box top when falling onto it, stop when rising into one.
    const nextY = state.y + state.vy * dt;
    const bonk = boxOverlap(world.colliders, state.x - RADIUS, nextY + 0.02, state.z - RADIUS, state.x + RADIUS, nextY + state.height, state.z + RADIUS);
    state.onGround = false;
    if (bonk) {
      if (state.vy <= 0 && state.y >= bonk.max.y - 0.4) {
        state.y = bonk.max.y;
        state.vy = 0;
        state.onGround = true;
      } else {
        state.vy = Math.min(0, state.vy);
      }
    } else {
      state.y = nextY;
    }
    if (state.y <= 0) {
      state.y = 0;
      state.vy = 0;
      state.onGround = true;
    }

    // Never leave the depot, even if a collider is tunnelled in a bad frame.
    const b = world.bounds;
    state.x = Math.max(b.minX + 0.6, Math.min(b.maxX - 0.6, state.x));
    state.z = Math.max(b.minZ + 0.6, Math.min(b.maxZ - 0.6, state.z));

    state.speed = Math.hypot(state.vx, state.vz);

    // Footsteps are distance-based, not timer-based, so the cadence follows the speed.
    if (state.onGround && state.speed > 1.2) {
      state.stepDistance += state.speed * dt;
      const stride = sprinting ? 2.35 : state.crouching ? 3.2 : 2.0;
      if (state.stepDistance > stride) {
        state.stepDistance = 0;
        game.audio.footstep(game, sprinting ? 0.85 : state.crouching ? 0.3 : 0.55);
      }
    }
    state.bob += dt * (4 + state.speed * 1.2);

    // Recoil recovery: the view climbs partway back on its own, the rest is on the player.
    if (state.recoilPitch > 0) {
      const back = Math.min(state.recoilPitch, dt * 0.42);
      state.pitch -= back;
      state.recoilPitch -= back;
    }
    refreshHitboxes();
  }

  return { state, step, look, kick, damage, respawn, refreshHitboxes, maxHealth: MAX_HEALTH };
}
