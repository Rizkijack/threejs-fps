// Frag charges: a small pooled projectile with gravity, a floor bounce and a fuse. The blast
// itself belongs to combat.js; this module only carries the can until it goes off.
import * as THREE from 'three';
import { COLORS } from './palette.js';
import { boxOverlap } from './collision.js';
import { explode } from './combat.js';

const FUSE = 2.5;
const THROW_SPEED = 15;
const GRAVITY = 18;

export function createGrenades(scene) {
  const items = [];
  for (let i = 0; i < 4; i += 1) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 8, 6),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(COLORS.steelLift), roughness: 0.5, metalness: 0.4, emissive: new THREE.Color(COLORS.charge), emissiveIntensity: 0.7 }),
    );
    mesh.visible = false;
    scene.add(mesh);
    items.push({ mesh, active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, fuse: 0 });
  }
  let cursor = 0;

  function throwFrom(x, y, z, yaw, pitch) {
    const cosP = Math.cos(pitch);
    const g = items[cursor];
    cursor = (cursor + 1) % items.length;
    g.active = true;
    g.x = x;
    g.y = y;
    g.z = z;
    g.vx = -Math.sin(yaw) * cosP * THROW_SPEED;
    g.vz = -Math.cos(yaw) * cosP * THROW_SPEED;
    g.vy = Math.sin(pitch) * THROW_SPEED + 3.2;
    g.fuse = FUSE;
    g.mesh.visible = true;
    g.mesh.position.set(x, y, z);
    return true;
  }

  function step(dt, game) {
    for (let i = 0; i < items.length; i += 1) {
      const g = items[i];
      if (!g.active) continue;
      g.fuse -= dt;
      g.vy -= GRAVITY * dt;

      const nx = g.x + g.vx * dt;
      if (boxOverlap(game.world.colliders, nx - 0.11, g.y - 0.11, g.z - 0.11, nx + 0.11, g.y + 0.11, g.z + 0.11)) g.vx *= -0.35;
      else g.x = nx;

      const nz = g.z + g.vz * dt;
      if (boxOverlap(game.world.colliders, g.x - 0.11, g.y - 0.11, nz - 0.11, g.x + 0.11, g.y + 0.11, nz + 0.11)) g.vz *= -0.35;
      else g.z = nz;

      g.y += g.vy * dt;
      if (g.y < 0.11) {
        g.y = 0.11;
        g.vy = Math.abs(g.vy) * 0.38;
        g.vx *= 0.7;
        g.vz *= 0.7;
        if (g.vy < 0.7) g.vy = 0;
      }
      const b = game.world.bounds;
      g.x = Math.max(b.minX + 0.4, Math.min(b.maxX - 0.4, g.x));
      g.z = Math.max(b.minZ + 0.4, Math.min(b.maxZ - 0.4, g.z));

      g.mesh.position.set(g.x, g.y, g.z);
      g.mesh.rotation.x += dt * 6;
      g.mesh.rotation.z += dt * 4;

      if (g.fuse <= 0) {
        g.active = false;
        g.mesh.visible = false;
        explode(game, g.x, g.y, g.z);
      }
    }
  }

  return {
    items,
    throwFrom,
    step,
    clear() {
      for (let i = 0; i < items.length; i += 1) {
        items[i].active = false;
        items[i].mesh.visible = false;
      }
    },
  };
}
