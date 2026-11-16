// Guns: the numbers, the buy list, the first-person models and the one runtime that holds a
// magazine, a reload and the spread penalty for moving. Hit resolution lives in combat.js;
// this module only says whether a round left the barrel and how far it drifted.
import * as THREE from 'three';
import { COLORS } from './palette.js';

export const WEAPONS = {
  sparrow: {
    id: 'sparrow', name: 'Sparrow P9', slot: 'sidearm', sound: 'pistol',
    damage: 23, headMult: 2.2, rpm: 340, mag: 13, reserve: 52, reload: 1.45, range: 55, auto: false,
    spreadBase: 0.0042, spreadMove: 0.055, spreadShot: 0.007, kick: 0.011, yawKick: 0.0045,
    price: 0, note: 'issued sidearm',
  },
  vesper: {
    id: 'vesper', name: 'Vesper Match', slot: 'sidearm', sound: 'heavy',
    damage: 41, headMult: 2.4, rpm: 235, mag: 10, reserve: 40, reload: 1.7, range: 62, auto: false,
    spreadBase: 0.0034, spreadMove: 0.05, spreadShot: 0.009, kick: 0.022, yawKick: 0.008,
    price: 520, note: 'match pistol · two-shot body',
  },
  kestrel: {
    id: 'kestrel', name: 'Kestrel SMG', slot: 'primary', sound: 'smg',
    damage: 21, headMult: 2.2, rpm: 820, mag: 32, reserve: 128, reload: 2.0, range: 45, auto: true,
    spreadBase: 0.0072, spreadMove: 0.045, spreadShot: 0.0035, kick: 0.0085, yawKick: 0.0038,
    price: 1450, note: 'close range · 820 rpm',
  },
  vantage: {
    id: 'vantage', name: 'Vantage AR', slot: 'primary', sound: 'rifle',
    damage: 35, headMult: 2.9, rpm: 620, mag: 30, reserve: 90, reload: 2.3, range: 70, auto: true,
    spreadBase: 0.0032, spreadMove: 0.062, spreadShot: 0.0055, kick: 0.017, yawKick: 0.006,
    price: 2750, note: 'hard-hitting rifle · lethal headshot',
  },
};

// Keys 1-3 are the guns, 4 the charge, 5 the plate. Prices are the whole economy.
export const BUY_ITEMS = [
  { key: '1', code: 'Digit1', kind: 'weapon', id: 'vesper', label: 'Vesper Match', price: 520, note: 'sidearm · two-shot body' },
  { key: '2', code: 'Digit2', kind: 'weapon', id: 'kestrel', label: 'Kestrel SMG', price: 1450, note: 'primary · 820 rpm' },
  { key: '3', code: 'Digit3', kind: 'weapon', id: 'vantage', label: 'Vantage AR', price: 2750, note: 'primary · lethal headshot' },
  { key: '4', code: 'Digit4', kind: 'grenade', id: 'grenade', label: 'Frag charge', price: 550, note: 'G to lob · 2 max' },
  { key: '5', code: 'Digit5', kind: 'armor', id: 'armor', label: 'Plate carrier', price: 800, note: 'absorbs half of every hit' },
];

function viewmodelMaterials() {
  return {
    shell: new THREE.MeshStandardMaterial({ color: new THREE.Color(COLORS.steelLift), roughness: 0.6, metalness: 0.12, flatShading: true,
      emissive: new THREE.Color(COLORS.steel), emissiveIntensity: 0.5 }),
    metal: new THREE.MeshStandardMaterial({ color: new THREE.Color(COLORS.muted), roughness: 0.45, metalness: 0.15, flatShading: true,
      emissive: new THREE.Color(COLORS.hair), emissiveIntensity: 0.35 }),
    grip: new THREE.MeshStandardMaterial({ color: new THREE.Color(COLORS.night), roughness: 0.92, metalness: 0.02, flatShading: true }),
    accent: new THREE.MeshStandardMaterial({ color: new THREE.Color(COLORS.vanguard), roughness: 0.45, metalness: 0.2, emissive: new THREE.Color(COLORS.vanguard), emissiveIntensity: 0.45 }),
  };
}

// A first-person model per weapon, built from a handful of boxes. The silhouette is what
// matters at 60 fps: long rifle, stubby SMG, short pistols with an exposed slide.
function buildModel(id, m) {
  const g = new THREE.Group();
  const add = (w, h, d, x, y, z, mat) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };
  if (id === 'vantage') {
    add(0.10, 0.13, 0.52, 0, 0, -0.06, m.shell);
    add(0.045, 0.045, 0.52, 0, 0.035, -0.52, m.metal); // barrel
    add(0.07, 0.05, 0.20, 0, 0.09, -0.02, m.metal); // rail
    add(0.06, 0.20, 0.10, 0, -0.14, 0.02, m.grip); // magazine
    add(0.07, 0.16, 0.10, 0, -0.11, 0.20, m.grip); // grip
    add(0.075, 0.10, 0.26, 0, -0.005, 0.32, m.shell); // stock
    add(0.02, 0.03, 0.30, -0.055, 0.02, -0.10, m.accent);
    add(0.02, 0.03, 0.30, 0.055, 0.02, -0.10, m.accent);
  } else if (id === 'kestrel') {
    add(0.09, 0.12, 0.34, 0, 0, -0.04, m.shell);
    add(0.04, 0.04, 0.24, 0, 0.03, -0.34, m.metal);
    add(0.055, 0.19, 0.09, 0, -0.14, 0.02, m.grip);
    add(0.06, 0.14, 0.09, 0, -0.10, 0.16, m.grip);
    add(0.05, 0.06, 0.16, 0, 0.09, 0.02, m.metal);
    add(0.02, 0.028, 0.22, 0, 0.005, -0.04, m.accent);
  } else if (id === 'vesper') {
    add(0.075, 0.10, 0.30, 0, 0, -0.02, m.shell);
    add(0.038, 0.05, 0.26, 0, 0.055, -0.06, m.metal); // slide
    add(0.03, 0.03, 0.10, 0, 0.015, -0.24, m.metal);
    add(0.06, 0.16, 0.085, 0, -0.11, 0.06, m.grip);
    add(0.018, 0.026, 0.20, 0, 0.02, 0.02, m.accent);
  } else {
    add(0.07, 0.09, 0.26, 0, 0, -0.02, m.shell);
    add(0.032, 0.042, 0.22, 0, 0.05, -0.05, m.metal);
    add(0.03, 0.028, 0.08, 0, 0.01, -0.20, m.metal);
    add(0.055, 0.15, 0.08, 0, -0.10, 0.06, m.grip);
    add(0.016, 0.024, 0.18, 0, 0.018, 0.02, m.accent);
  }
  return g;
}

export function createWeapons(camera) {
  const materials = viewmodelMaterials();
  const models = {};
  const restZ = -1.12;
  const restX = 0.26;
  const restY = -0.26;
  // No viewmodel should point dead down the camera axis: a few degrees of yaw shows the
  // side of the receiver and kills the "floating box" silhouette.
  const restYaw = 0.16;
  const muzzlePoint = (depth) => ({
    x: restX - depth * Math.sin(restYaw),
    y: restY + 0.03,
    z: restZ - depth * Math.cos(restYaw),
  });
  for (const id of Object.keys(WEAPONS)) {
    const model = buildModel(id, materials);
    model.position.set(restX, restY, restZ);
    model.scale.setScalar(0.78);
    model.visible = false;
    model.traverse((part) => {
      if (part.isMesh) part.frustumCulled = false;
    });
    camera.add(model);
    models[id] = model;
  }

  // Muzzle flash: a four-point star of two crossed quads plus one light, both moved to
  // whatever gun is out. Crossed quads read as a flash from any angle, unlike a flat card.
  const flashMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS.vanguard), transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const flash = new THREE.Group();
  for (let i = 0; i < 2; i += 1) {
    const card = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.05), flashMat);
    card.rotation.z = i * Math.PI * 0.5;
    flash.add(card);
  }
  flash.visible = false;
  flash.frustumCulled = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(COLORS.vanguard), 0, 6, 2);
  camera.add(flashLight);

  // A short fill sitting in front of the camera so the gun never reads as a black slab.
  // Distance is deliberately tiny: it lights the viewmodel, not the room.
  const fill = new THREE.PointLight(new THREE.Color(COLORS.bone), 1.3, 1.5, 2);
  fill.position.set(0.18, 0.3, -0.7);
  camera.add(fill);

  const state = {
    current: 'sparrow',
    mag: WEAPONS.sparrow.mag,
    reserve: WEAPONS.sparrow.reserve,
    cooldown: 0,
    reloadLeft: 0,
    reloadTotal: 0,
    streak: 0,
    streakIdle: 0,
    flash: 0,
    kick: 0,
    grenades: 1,
    switchAnim: 0,
  };

  function equip(id) {
    const def = WEAPONS[id];
    if (!def) return;
    if (models[state.current]) models[state.current].visible = false;
    state.current = id;
    state.mag = def.mag;
    state.reserve = def.reserve;
    state.cooldown = Math.min(state.cooldown, 0.18);
    state.reloadLeft = 0;
    state.reloadTotal = 0;
    state.streak = 0;
    state.switchAnim = 1;
    models[id].visible = true;
    // The flash sits just past the barrel; the models differ in length, so move it.
    const depth = id === 'vantage' ? 0.65 : id === 'kestrel' ? 0.46 : 0.29;
    const muzzle = muzzlePoint(depth);
    flash.position.set(muzzle.x, muzzle.y, muzzle.z);
    const glow = muzzlePoint(depth + 0.22);
    flashLight.position.set(glow.x, glow.y, glow.z);
  }

  function step(dt, playerState) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.streakIdle += dt;
    if (state.streakIdle > 0.28) state.streak = Math.max(0, state.streak - dt * 6);
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      if (state.reloadLeft === 0) {
        const def = WEAPONS[state.current];
        const need = def.mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
    state.kick += (0 - state.kick) * Math.min(1, dt * 16);
    state.switchAnim = Math.max(0, state.switchAnim - dt * 4);

    const model = models[state.current];
    const def = WEAPONS[state.current];
    // Idle sway plus a bob tied to ground speed; a reload dips the whole gun.
    const speed = playerState ? playerState.speed : 0;
    const bob = playerState ? Math.sin(playerState.bob) * (0.004 + speed * 0.0016) : 0;
    const sway = playerState ? Math.cos(playerState.bob * 0.5) * (0.003 + speed * 0.0012) : 0;
    const reloadDip = state.reloadTotal > 0 ? Math.sin((1 - state.reloadLeft / state.reloadTotal) * Math.PI) : 0;
    model.position.set(restX + sway, restY - reloadDip * 0.16 + bob - state.switchAnim * 0.1, restZ + state.kick + reloadDip * 0.05);
    model.rotation.set(state.kick * 2.4 + reloadDip * 0.7, restYaw + reloadDip * 0.35, -reloadDip * 0.3);
    flash.visible = state.flash > 0;
    if (state.flash > 0) {
      flash.rotation.z += dt * 20;
      flash.scale.setScalar(0.8 + Math.min(1, state.flash / 0.05) * 0.5);
    }
    flashLight.intensity = state.flash > 0 ? 14 : 0;
    return def;
  }

  return {
    state,
    models,
    equip,
    step,
    def() {
      return WEAPONS[state.current];
    },
    canFire() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    /** Consume a round. The view kick is the player's, applied by the caller after the shot. */
    tryFire() {
      if (!this.canFire()) return null;
      const def = WEAPONS[state.current];
      state.mag -= 1;
      state.cooldown = 60 / def.rpm;
      state.flash = 0.055;
      state.kick = def.slot === 'primary' ? 0.07 : 0.05;
      state.streak += 1;
      state.streakIdle = 0;
      return def;
    },
    startReload() {
      if (state.reloadLeft > 0 || state.mag === WEAPONS[state.current].mag || state.reserve === 0) return false;
      state.reloadTotal = WEAPONS[state.current].reload;
      state.reloadLeft = state.reloadTotal;
      return true;
    },
    spreadFor(playerState) {
      const def = WEAPONS[state.current];
      const speed = playerState ? playerState.speed : 0;
      const move = Math.min(1, speed / 7.1) * def.spreadMove;
      const air = playerState && !playerState.onGround ? 0.045 : 0;
      const crouch = playerState && playerState.crouching ? 0.72 : 1;
      return (def.spreadBase + move + air + state.streak * def.spreadShot) * crouch;
    },
    /** Ammo reset for a new round, keeping the bought gun. */
    refill(id) {
      const def = WEAPONS[id] || WEAPONS.sparrow;
      if (id) equip(id);
      state.mag = def.mag;
      state.reserve = def.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.reloadTotal = 0;
      state.flash = 0;
      state.kick = 0;
    },
  };
}
