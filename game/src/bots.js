// Warden, the defenders: four bots that patrol a waypoint graph, hold angles, hear gunfire,
// see the player through line of sight, and fire real rays back. Each bot is one body, one
// hitbox set, one path buffer and a small state machine, stepped on the fixed clock.
import * as THREE from 'three';
import { COLORS } from './palette.js';
import { setHitbox, slideMove, lineBlocked, makeHitbox } from './collision.js';
import { botShot } from './combat.js';

const MAX_NODES = 64;
const HEALTH = 100;
const RADIUS = 0.34;
const HEIGHT = 1.74;

const prevNode = new Int16Array(MAX_NODES);
const queue = new Int16Array(MAX_NODES * 4);
const seenStamp = new Int32Array(MAX_NODES);
let stamp = 0;

// BFS from the goal, then walk `prev` from the start: shortest hop count, no allocations.
function buildPath(waypoints, startIdx, goalIdx, out) {
  if (startIdx === goalIdx) {
    out[0] = goalIdx;
    return 1;
  }
  stamp += 1;
  let head = 0;
  let tail = 0;
  queue[tail] = goalIdx;
  tail += 1;
  seenStamp[goalIdx] = stamp;
  prevNode[goalIdx] = -1;
  while (head < tail) {
    const node = queue[head];
    head += 1;
    const links = waypoints[node].links;
    for (let i = 0; i < links.length; i += 1) {
      const next = links[i];
      if (seenStamp[next] === stamp) continue;
      seenStamp[next] = stamp;
      prevNode[next] = node;
      if (next === startIdx) {
        let count = 0;
        let cursor = startIdx;
        while (cursor !== -1 && count < out.length) {
          out[count] = cursor;
          count += 1;
          cursor = prevNode[cursor];
        }
        return count;
      }
      queue[tail] = next;
      tail += 1;
    }
  }
  out[0] = startIdx;
  return 1;
}

function nearestNode(waypoints, x, z) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < waypoints.length; i += 1) {
    const d = (waypoints[i].x - x) ** 2 + (waypoints[i].z - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function buildBody(materials) {
  const group = new THREE.Group();
  const add = (w, h, d, x, y, z, mat) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  const legL = add(0.19, 0.82, 0.22, -0.14, 0.41, 0, materials.pants);
  const legR = add(0.19, 0.82, 0.22, 0.14, 0.41, 0, materials.pants);
  add(0.56, 0.68, 0.34, 0, 1.16, 0, materials.jacket);
  add(0.585, 0.14, 0.36, 0, 1.3, 0, materials.team); // chest stripe reads at range
  add(0.3, 0.3, 0.16, 0, 1.02, 0.2, materials.rig); // pouches
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 12, 10), materials.skin);
  head.position.set(0, 1.68, 0);
  head.castShadow = true;
  group.add(head);
  add(0.36, 0.14, 0.36, 0, 1.8, 0, materials.helmet);
  const gun = add(0.07, 0.09, 0.62, 0.2, 1.2, -0.26, materials.gun);
  add(0.05, 0.12, 0.1, 0.2, 1.08, 0.02, materials.gun);
  return { group, legL, legR, head, gun };
}

export function createBots(scene, world) {
  const materials = {
    pants: new THREE.MeshStandardMaterial({ color: new THREE.Color(COLORS.steel), roughness: 0.9, flatShading: true }),
    jacket: new THREE.MeshStandardMaterial({ color: new THREE.Color(COLORS.steelLift), roughness: 0.85, flatShading: true }),
    rig: new THREE.MeshStandardMaterial({ color: new THREE.Color(COLORS.hair), roughness: 0.8, flatShading: true }),
    skin: new THREE.MeshStandardMaterial({ color: new THREE.Color(COLORS.bone), roughness: 0.7, flatShading: true }),
    helmet: new THREE.MeshStandardMaterial({ color: new THREE.Color(COLORS.hair), roughness: 0.5, metalness: 0.4, flatShading: true }),
    gun: new THREE.MeshStandardMaterial({ color: new THREE.Color(COLORS.night), roughness: 0.5, metalness: 0.5, flatShading: true }),
    team: new THREE.MeshStandardMaterial({ color: new THREE.Color(COLORS.warden), emissive: new THREE.Color(COLORS.warden), emissiveIntensity: 0.5, roughness: 0.6, flatShading: true }),
  };

  // Patrol loops: two defenders sit on the sites, two work the middle.
  const ROLES = [
    { role: 'anchor-A', patrol: [16, 17, 16, 14], damage: 12, error: 0.004 },
    { role: 'anchor-B', patrol: [18, 19, 18, 15], damage: 12, error: 0.004 },
    { role: 'roamer', patrol: [20, 21, 3, 8, 20], damage: 9, error: 0.009 },
    { role: 'roamer', patrol: [11, 13, 15, 7, 11], damage: 9, error: 0.009 },
  ];

  const list = [];
  for (let i = 0; i < 4; i += 1) {
    const body = buildBody(materials);
    scene.add(body.group);
    const bot = {
      id: i,
      group: body.group,
      legL: body.legL,
      legR: body.legR,
      gun: body.gun,
      role: ROLES[i].role,
      patrol: ROLES[i].patrol,
      patrolIndex: 0,
      damage: ROLES[i].damage,
      error: ROLES[i].error,
      hp: HEALTH,
      alive: true,
      x: 0, y: 0, z: 0, vx: 0, vz: 0,
      yaw: Math.PI,
      speed: 0,
      path: new Int16Array(24),
      pathLen: 0,
      pathIdx: 0,
      repath: 0,
      stuck: 0,
      stepPhase: 0,
      alert: 0,
      see: false,
      eyeTimer: 0,
      lastX: 0,
      lastZ: 0,
      noSee: 9,
      fireCd: 0,
      burst: 3,
      burstGap: 0,
      reaction: 0,
      reloading: 0,
      ammo: 30,
      defusing: false,
      fall: 0,
      holdTimer: 0,
      strafeDir: 1,
      headBox: makeHitbox(),
      torsoBox: makeHitbox(),
      legsBox: makeHitbox(),
    };
    list.push(bot);
  }

  function place(bot, spawn) {
    bot.x = spawn.x;
    bot.z = spawn.z;
    bot.y = 0;
    bot.vx = 0;
    bot.vz = 0;
    bot.yaw = spawn.yaw;
    bot.lookPhase = spawn.x * 0.5;
    bot.hp = HEALTH;
    bot.alive = true;
    bot.alert = 0;
    bot.see = false;
    bot.noSee = 9;
    bot.fireCd = 0.4 + bot.id * 0.17;
    bot.burst = 3;
    bot.reaction = 0;
    bot.reloading = 0;
    bot.ammo = 30;
    bot.defusing = false;
    bot.fall = 0;
    bot.pathLen = 0;
    bot.pathIdx = 0;
    bot.repath = 0;
    bot.stuck = 0;
    bot.patrolIndex = 0;
    bot.holdTimer = 0;
    bot.group.position.set(bot.x, 0, bot.z);
    bot.group.rotation.set(0, bot.yaw, 0);
    bot.group.visible = true;
    refreshBoxes(bot);
  }

  function refreshBoxes(bot) {
    setHitbox(bot.headBox, bot.x, bot.y, bot.z, 0.19, 1.5, 1.88);
    setHitbox(bot.torsoBox, bot.x, bot.y, bot.z, 0.31, 0.72, 1.52);
    setHitbox(bot.legsBox, bot.x, bot.y, bot.z, 0.3, 0, 0.72);
  }

  function respawn() {
    for (let i = 0; i < list.length; i += 1) place(list[i], world.botSpawns[i]);
  }

  // Nearest waypoint first, then BFS to the goal's waypoint, then the exact goal.
  function planPath(bot, goalX, goalZ) {
    const from = nearestNode(world.waypoints, bot.x, bot.z);
    const to = nearestNode(world.waypoints, goalX, goalZ);
    bot.pathLen = buildPath(world.waypoints, from, to, bot.path);
    bot.pathIdx = 0;
    bot.repath = 2.5 + Math.random();
  }

  /** Gunfire and footsteps pull nearby defenders toward the noise. */
  function alertAt(x, z, radius) {
    for (let i = 0; i < list.length; i += 1) {
      const bot = list[i];
      if (!bot.alive || bot.see) continue;
      if (Math.hypot(bot.x - x, bot.z - z) > radius) continue;
      bot.alert = Math.max(bot.alert, 4.5);
      bot.lastX = x;
      bot.lastZ = z;
      bot.holdTimer = 0;
      bot.repath = 0;
    }
  }

  // ---- perception and the state machine -------------------------------------------
  function sense(bot, game) {
    const p = game.player.state;
    bot.see = false;
    if (!p.alive) return;
    const dx = p.x - bot.x;
    const dz = p.z - bot.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 42 || dist < 0.01) return;
    const facing = (-Math.sin(bot.yaw) * dx - Math.cos(bot.yaw) * dz) / dist;
    const cone = bot.alert > 0 ? -0.45 : 0.2;
    if (dist > 3.5 && facing < cone) return;
    const eyeY = 1.55;
    const chest = p.y + (p.crouching ? 0.78 : 1.15);
    if (lineBlocked(world.colliders, bot.x, eyeY, bot.z, p.x, chest, p.z)) return;
    bot.see = true;
  }

  function faceToward(bot, targetYaw, dt, rate) {
    let delta = targetYaw - bot.yaw;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const step = Math.min(Math.abs(delta), rate * dt);
    bot.yaw += Math.sign(delta) * step;
  }

  function steer(bot, tx, tz, speed, dt) {
    const dx = tx - bot.x;
    const dz = tz - bot.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.001) return;
    const blend = Math.min(1, dt * 9);
    bot.vx += ((dx / d) * speed - bot.vx) * blend;
    bot.vz += ((dz / d) * speed - bot.vz) * blend;
  }

  function step(dt, game) {
    const player = game.player.state;
    const phase = game.round.phase;
    const frozen = phase === 'freeze';

    for (let i = 0; i < list.length; i += 1) {
      const bot = list[i];

      if (!bot.alive) {
        bot.fall = Math.min(1, bot.fall + dt * 2.6);
        bot.group.rotation.x = -bot.fall * 1.52;
        bot.group.position.y = -bot.fall * 0.04;
        continue;
      }

      if (bot.group.rotation.x !== 0) {
        bot.group.rotation.x = 0;
        bot.group.position.y = 0;
      }

      // Perception runs on a stagger, not every tick: four bots cannot see the same frame.
      bot.eyeTimer -= dt;
      const hadSight = bot.see;
      if (bot.eyeTimer <= 0) {
        bot.eyeTimer = 0.06 + i * 0.011;
        sense(bot, game);
      }
      if (bot.see && !hadSight) {
        bot.reaction = 0.3 + game.rng() * 0.26;
        bot.holdTimer = 0;
        bot.repath = 0;
      }
      if (bot.see) {
        bot.lastX = player.x;
        bot.lastZ = player.z;
        bot.noSee = 0;
        bot.alert = Math.max(bot.alert, 6);
      } else {
        bot.noSee += dt;
        bot.alert = Math.max(0, bot.alert - dt);
      }

      // Fire control: bursts with a breathing gap, a reload that costs the bot the angle.
      bot.fireCd -= dt;
      bot.reaction -= dt;
      if (bot.reloading > 0) {
        bot.reloading -= dt;
        bot.gun.rotation.x = -0.5 * Math.sin((1 - Math.max(0, bot.reloading) / 1.9) * Math.PI);
      } else {
        bot.gun.rotation.x += (0 - bot.gun.rotation.x) * Math.min(1, dt * 8);
        if (bot.see && bot.reaction <= 0 && bot.fireCd <= 0 && !frozen) {
          botShot(game, bot);
          bot.ammo -= 1;
          bot.burst -= 1;
          if (bot.burst <= 0) {
            bot.burst = 3 + (i % 2);
            bot.fireCd = 0.42 + game.rng() * 0.32;
          } else {
            bot.fireCd = bot.damage > 10 ? 0.15 : 0.11;
          }
          if (bot.ammo <= 0) {
            bot.reloading = 1.9;
            bot.ammo = 30;
            bot.fireCd = 0.24;
          }
        }
      }

      if (frozen) {
        bot.vx = 0;
        bot.vz = 0;
        bot.speed = 0;
        bot.group.position.set(bot.x, 0, bot.z);
        bot.group.rotation.y = bot.yaw;
        refreshBoxes(bot);
        continue;
      }

      // ---- goal selection ---------------------------------------------------------
      let goalX = bot.x;
      let goalZ = bot.z;
      let wantMove = false;
      let speed = 3.25;
      const playerDist = Math.hypot(player.x - bot.x, player.z - bot.z);
      bot.defusing = false;

      if (game.round.bombPlanted) {
        const bomb = game.round.bomb;
        goalX = bomb.x;
        goalZ = bomb.z;
        const d = Math.hypot(bomb.x - bot.x, bomb.z - bot.z);
        if (d < 1.65 && bot.noSee > 0.65) {
          bot.defusing = true;
          bot.vx = 0;
          bot.vz = 0;
        } else if (d > 1.4) {
          wantMove = true;
          speed = 4.0;
        }
      } else if (bot.see && player.alive) {
        // Hold an angle at mid range: close in when far, back off when rushed, strafe on line.
        if (playerDist > 15) {
          goalX = player.x;
          goalZ = player.z;
          wantMove = true;
          speed = 3.6;
        } else if (playerDist < 5) {
          goalX = bot.x + (bot.x - player.x);
          goalZ = bot.z + (bot.z - player.z);
          wantMove = true;
          speed = 3.4;
        } else {
          bot.holdTimer += dt;
          const strafeX = Math.cos(bot.yaw) * bot.strafeDir;
          const strafeZ = -Math.sin(bot.yaw) * bot.strafeDir;
          goalX = bot.x + strafeX * 2;
          goalZ = bot.z + strafeZ * 2;
          wantMove = Math.abs(bot.holdTimer % 2.4) < 0.7;
          speed = 2.1;
          if (bot.holdTimer > 2.4) {
            bot.holdTimer = 0;
            bot.strafeDir *= -1;
          }
        }
      } else if (bot.alert > 0) {
        goalX = bot.lastX;
        goalZ = bot.lastZ;
        const d = Math.hypot(goalX - bot.x, goalZ - bot.z);
        wantMove = d > 1.8;
        speed = 3.5;
        if (!wantMove) {
          // Sweep the room while the trail goes cold.
          bot.lookPhase += dt * 1.4;
          faceToward(bot, Math.atan2(-(goalX - bot.x), -(goalZ - bot.z)) + Math.sin(bot.lookPhase) * 0.9, dt, 2.4);
        }
      } else {
        const nodeIndex = bot.patrol[bot.patrolIndex % bot.patrol.length];
        const node = world.waypoints[nodeIndex];
        goalX = node.x;
        goalZ = node.z;
        const d = Math.hypot(goalX - bot.x, goalZ - bot.z);
        if (d < 1.3) {
          bot.holdTimer += dt;
          bot.lookPhase += dt;
          faceToward(bot, bot.yaw + Math.sin(bot.lookPhase * 0.6) * 0.02, dt, 0.6);
          if (bot.holdTimer > 1.8) {
            bot.holdTimer = 0;
            bot.patrolIndex = (bot.patrolIndex + 1) % bot.patrol.length;
            bot.pathLen = 0;
          }
        } else {
          wantMove = true;
          speed = bot.role === 'roamer' ? 3.5 : 2.9;
        }
      }

      // ---- path following ---------------------------------------------------------
      if (wantMove) {
        bot.repath -= dt;
        if (bot.pathLen === 0 || bot.repath <= 0) planPath(bot, goalX, goalZ);
        let nodeX = goalX;
        let nodeZ = goalZ;
        if (bot.pathIdx < bot.pathLen) {
          const node = world.waypoints[bot.path[bot.pathIdx]];
          nodeX = node.x;
          nodeZ = node.z;
          if (Math.hypot(nodeX - bot.x, nodeZ - bot.z) < 0.85) {
            bot.pathIdx += 1;
            if (bot.pathIdx < bot.pathLen) {
              const next = world.waypoints[bot.path[bot.pathIdx]];
              nodeX = next.x;
              nodeZ = next.z;
            }
          }
        }
        steer(bot, nodeX, nodeZ, speed, dt);
        // Face where we are going unless the player is the thing we are watching.
        if (!bot.see) faceToward(bot, Math.atan2(-(nodeX - bot.x), -(nodeZ - bot.z)), dt, 5.0);
      } else {
        bot.vx *= Math.max(0, 1 - dt * 9);
        bot.vz *= Math.max(0, 1 - dt * 9);
      }

      if (bot.see) {
        faceToward(bot, Math.atan2(-(player.x - bot.x), -(player.z - bot.z)), dt, 6.0);
      }

      // ---- integrate --------------------------------------------------------------
      const beforeX = bot.x;
      const beforeZ = bot.z;
      const slide = slideMove(world.colliders, bot, bot.vx * dt, bot.vz * dt, RADIUS, HEIGHT);
      if (slide.hitX) bot.vx = 0;
      if (slide.hitZ) bot.vz = 0;
      const moved = Math.hypot(bot.x - beforeX, bot.z - beforeZ);
      bot.speed = moved / Math.max(dt, 1e-4);
      if (wantMove && bot.speed < 0.55) {
        bot.stuck += dt;
        if (bot.stuck > 0.55) {
          bot.stuck = 0;
          bot.pathIdx += 1;
          if (bot.pathIdx >= bot.pathLen) {
            bot.pathLen = 0;
            bot.repath = 0;
            bot.strafeDir *= -1;
          }
        }
      } else {
        bot.stuck = 0;
      }

      const b = world.bounds;
      bot.x = Math.max(b.minX + 0.6, Math.min(b.maxX - 0.6, bot.x));
      bot.z = Math.max(b.minZ + 0.6, Math.min(b.maxZ - 0.6, bot.z));

      // Legs and body read the movement; the group carries position, the box set follows.
      bot.stepPhase += (bot.speed * 2.1 + 0.4) * dt * 3.2;
      const swing = Math.min(1, bot.speed / 3.4) * 0.55;
      bot.legL.rotation.x = Math.sin(bot.stepPhase) * swing;
      bot.legR.rotation.x = -Math.sin(bot.stepPhase) * swing;
      const crouch = bot.defusing ? 1 : 0;
      bot.group.position.set(bot.x, crouch * -0.16, bot.z);
      bot.group.rotation.y = bot.yaw;
      refreshBoxes(bot);
    }
  }

  return { list, respawn, planPath, alertAt, refreshBoxes, sense, step };
}

