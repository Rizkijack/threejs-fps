// Battlefield effects, pooled: tracers, impact sparks, explosions and blood puffs. Every
// mesh is built at boot and reused, so a firefight costs no allocations and no GPU uploads.
import * as THREE from 'three';
import { COLORS } from './palette.js';

const UP = new THREE.Vector3(0, 0, 1);
const dir = new THREE.Vector3();
const quat = new THREE.Quaternion();

export function createEffects(scene) {
  const tracers = [];
  for (let i = 0; i < 24; i += 1) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.014, 0.014, 1),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS.bone), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    mesh.visible = false;
    mesh.frustumCulled = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0, max: 0.075 });
  }

  const puffs = [];
  for (let i = 0; i < 18; i += 1) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 6, 5),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS.bone), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    mesh.visible = false;
    scene.add(mesh);
    puffs.push({ mesh, life: 0, max: 0.16, grow: 2.2 });
  }

  const blasts = [];
  for (let i = 0; i < 3; i += 1) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.6, 12, 10),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS.vanguard), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    mesh.visible = false;
    scene.add(mesh);
    const light = new THREE.PointLight(new THREE.Color(COLORS.charge), 0, 16, 2);
    scene.add(light);
    blasts.push({ mesh, light, life: 0, max: 0.5 });
  }

  let tracerCursor = 0;
  let puffCursor = 0;
  let blastCursor = 0;

  function tracer(ax, ay, az, bx, by, bz, color) {
    const slot = tracers[tracerCursor];
    tracerCursor = (tracerCursor + 1) % tracers.length;
    dir.set(bx - ax, by - ay, bz - az);
    const len = dir.length();
    if (len < 0.2) return;
    dir.multiplyScalar(1 / len);
    quat.setFromUnitVectors(UP, dir);
    slot.mesh.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    slot.mesh.quaternion.copy(quat);
    slot.mesh.scale.set(1, 1, len);
    slot.mesh.material.color.set(color || COLORS.bone);
    slot.mesh.visible = true;
    slot.life = slot.max;
  }

  function puff(x, y, z, color) {
    const slot = puffs[puffCursor];
    puffCursor = (puffCursor + 1) % puffs.length;
    slot.mesh.position.set(x, y, z);
    slot.mesh.scale.setScalar(0.7);
    slot.mesh.material.color.set(color || COLORS.bone);
    slot.mesh.visible = true;
    slot.life = slot.max;
  }

  function explosion(x, y, z) {
    const slot = blasts[blastCursor];
    blastCursor = (blastCursor + 1) % blasts.length;
    slot.mesh.position.set(x, y, z);
    slot.mesh.scale.setScalar(0.4);
    slot.mesh.visible = true;
    slot.life = slot.max;
    slot.light.position.set(x, y + 0.8, z);
    slot.light.intensity = 60;
  }

  function step(dt) {
    for (let i = 0; i < tracers.length; i += 1) {
      const t = tracers[i];
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) {
        t.mesh.visible = false;
        continue;
      }
      t.mesh.material.opacity = (t.life / t.max) * 0.62;
    }
    for (let i = 0; i < puffs.length; i += 1) {
      const p = puffs[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        continue;
      }
      const k = 1 - p.life / p.max;
      p.mesh.scale.setScalar(0.7 + k * p.grow);
      p.mesh.material.opacity = (1 - k) * 0.75;
    }
    for (let i = 0; i < blasts.length; i += 1) {
      const b = blasts[i];
      if (b.life <= 0) continue;
      b.life -= dt;
      if (b.life <= 0) {
        b.mesh.visible = false;
        b.light.intensity = 0;
        continue;
      }
      const k = 1 - b.life / b.max;
      b.mesh.scale.setScalar(0.4 + k * 4.4);
      b.mesh.material.opacity = (1 - k) * 0.7;
      b.light.intensity = (1 - k) * 60;
    }
  }

  return {
    tracer,
    puff,
    explosion,
    step,
    /** A shooter's flash at the muzzle, in world space. */
    muzzle(x, y, z, color) {
      puff(x, y, z, color || COLORS.vanguard);
    },
  };
}
