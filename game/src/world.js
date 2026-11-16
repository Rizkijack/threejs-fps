// The map: "Kessler Cold Store", an offshore cold-storage depot. Two charge sites, a
// central divider the lanes have to go around, cover crates and a waypoint graph the bots
// path along. Everything is boxes and one procedural canvas sign, so nothing is fetched.
// Solid boxes are colliders (movement, bullets, sight) and are built once at boot.
import * as THREE from 'three';
import { COLORS } from './palette.js';

const BOUNDS = { minX: -17, maxX: 17, minZ: -15, maxZ: 15 };
const SITE_HALF = 3.0;
const SITES = [
  { name: 'A', x: -11.2, z: 8.6 },
  { name: 'B', x: 11.2, z: -8.6 },
];

// Waypoint centres. The bots walk these, and defenders' patrol loops are indexes into it.
const POINTS = [
  { x: 0, z: 13 },       // 0  attacker spawn
  { x: -4, z: 11 },      // 1  south west approach
  { x: 4, z: 11 },       // 2  south east approach
  { x: 0, z: 8 },        // 3  south mouth
  { x: -8, z: 8 },       // 4  west lane
  { x: 8, z: 8 },        // 5  east lane
  { x: -8, z: 2 },       // 6  west mid
  { x: 8, z: 2 },        // 7  east mid
  { x: -3.2, z: 2 },     // 8  centre west
  { x: 3.2, z: 2 },      // 9  centre east
  { x: -8, z: -2 },      // 10 north west
  { x: 8, z: -2 },       // 11 north east
  { x: -13.5, z: 2.5 },  // 12 west flank
  { x: 13.5, z: -2.5 },  // 13 east flank
  { x: -11.2, z: 3.2 },  // 14 site A doorway
  { x: 11.2, z: -3.2 },  // 15 site B doorway
  { x: -11, z: 8.5 },    // 16 site A
  { x: -14, z: 11 },     // 17 site A deep
  { x: 11, z: -8.5 },    // 18 site B
  { x: 14, z: -11 },     // 19 site B deep
  { x: 0, z: -5.5 },     // 20 mid passage
  { x: 0, z: -8.5 },     // 21 north mid
  { x: 0, z: -13 },      // 22 warden spawn
  { x: -4.5, z: -12 },   // 23 warden west
  { x: 4.5, z: -12 },    // 24 warden east
];

// Undirected edges. Kept short on purpose: fewer links means the bots commit to a lane.
const EDGES = [
  [0, 1], [0, 2], [0, 3], [1, 3], [1, 4], [2, 3], [2, 5], [3, 8], [3, 9],
  [4, 6], [5, 7], [6, 8], [6, 10], [6, 12], [7, 9], [7, 11], [7, 13],
  [8, 10], [8, 20], [9, 11], [9, 20], [10, 11], [10, 12], [11, 13], [11, 15],
  [12, 14], [13, 15], [14, 16], [15, 18], [16, 17], [18, 19], [20, 21],
  [21, 22], [21, 23], [21, 24], [22, 23], [22, 24], [23, 24],
];

function linkPoints() {
  const waypoints = POINTS.map((p, id) => ({ id, x: p.x, z: p.z, links: [] }));
  for (const [a, b] of EDGES) {
    waypoints[a].links.push(b);
    waypoints[b].links.push(a);
  }
  return waypoints;
}

// A stencilled sign, painted on a canvas: no image files, no requests.
function signTexture(label, hex, wide) {
  const canvas = document.createElement('canvas');
  canvas.width = wide ? 512 : 256;
  canvas.height = wide ? 128 : 256;
  const g = canvas.getContext('2d');
  g.fillStyle = COLORS.steel;
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.strokeStyle = hex;
  g.lineWidth = 8;
  g.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
  g.fillStyle = hex;
  g.font = `bold ${wide ? 64 : 150}px ui-monospace, monospace`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, canvas.width / 2, canvas.height / 2 + 4);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const mat = (color, rough, metal, emissive, strength) => new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: rough,
    metalness: metal,
    flatShading: true,
    emissive: emissive === undefined ? 0x000000 : new THREE.Color(emissive),
    emissiveIntensity: strength === undefined ? 1 : strength,
  });
  const materials = {
    deck: mat(COLORS.deck, 0.94, 0.08),
    steel: mat(COLORS.steel, 0.86, 0.14),
    steelLift: mat(COLORS.steelLift, 0.8, 0.2),
    hair: mat(COLORS.hair, 0.72, 0.24),
    vanguard: mat(COLORS.vanguard, 0.5, 0.1, COLORS.vanguard, 0.35),
    warden: mat(COLORS.warden, 0.5, 0.1, COLORS.warden, 0.35),
    paintVanguard: mat(COLORS.vanguard, 0.75, 0.05, COLORS.vanguard, 0.06),
    paintWarden: mat(COLORS.warden, 0.75, 0.05, COLORS.warden, 0.06),
    charge: mat(COLORS.charge, 0.4, 0.1, COLORS.charge, 1.4),
    bone: mat(COLORS.bone, 0.6, 0.1),
  };

  const colliders = [];
  const solids = [];

  // One solid box: a collider, a shadow caster and a bullet stopper.
  function solid(w, h, d, x, y, z, material, ry) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    if (ry) mesh.rotation.y = ry;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    const box = new THREE.Box3();
    box.min.set(x - w / 2, y - h / 2, z - d / 2);
    box.max.set(x + w / 2, y + h / 2, z + d / 2);
    colliders.push(box);
    solids.push(mesh);
    return mesh;
  }

  // Decoration: no collision, no shadow work.
  function trim(w, h, d, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  }

  // ---- deck and shell -------------------------------------------------------------
  solid(34.8, 0.6, 30.8, 0, -0.3, 0, materials.deck); // floor, top at y = 0
  solid(0.8, 5.2, 30.8, -17, 2.6, 0, materials.steel);
  solid(0.8, 5.2, 30.8, 17, 2.6, 0, materials.steel);
  solid(34.8, 5.2, 0.8, 0, 2.6, -15, materials.steel);
  solid(34.8, 5.2, 0.8, 0, 2.6, 15, materials.steel);

  // Floor seams: cheap detail that also makes movement readable when sprinting.
  for (let i = -3; i <= 3; i += 1) {
    trim(0.05, 0.02, 29, i * 4.6, 0.012, 0, materials.hair);
    trim(33, 0.02, 0.05, 0, 0.012, i * 4.2, materials.hair);
  }

  // ---- lanes and site rooms -------------------------------------------------------
  // A mid divider with a single central doorway: both lanes have to commit.
  solid(4.6, 3.2, 0.5, -4.5, 1.6, -3.5, materials.steelLift);
  solid(4.6, 3.2, 0.5, 4.5, 1.6, -3.5, materials.steelLift);
  solid(0.9, 3.2, 0.9, -6.9, 1.6, -3.5, materials.hair);
  solid(0.9, 3.2, 0.9, 6.9, 1.6, -3.5, materials.hair);

  // Site A room: a corner store with one doorway off the west flank.
  solid(0.5, 3.4, 8.4, -8.6, 1.7, 8.3, materials.steelLift);
  solid(3.2, 3.4, 0.5, -14, 1.7, 4.2, materials.steelLift);
  solid(2.2, 3.4, 0.5, -9.7, 1.7, 4.2, materials.steelLift);
  // Site B room, mirrored.
  solid(0.5, 3.4, 8.4, 8.6, 1.7, -8.3, materials.steelLift);
  solid(1.8, 3.4, 0.5, 9.5, 1.7, -4.2, materials.steelLift);
  solid(3.6, 3.4, 0.5, 13.8, 1.7, -4.2, materials.steelLift);

  // ---- cover ----------------------------------------------------------------------
  // Crates sit off the waypoint lines so a bot never walks into one on its way somewhere.
  solid(1.8, 1.1, 1.2, 4.8, 0.55, 6.4, materials.hair);
  solid(1.8, 1.1, 1.2, -4.8, 0.55, 6.4, materials.hair);
  solid(1.2, 1.7, 1.2, -6.8, 0.85, 3.6, materials.steel);
  solid(1.2, 1.7, 1.2, 6.8, 0.85, 3.6, materials.steel);
  solid(1.4, 1.0, 1.4, -3.4, 0.5, -0.9, materials.hair);
  solid(1.4, 1.0, 1.4, 3.4, 0.5, -0.9, materials.hair);
  solid(2.0, 0.9, 1.2, -2.8, 0.45, -8.8, materials.hair);
  solid(2.0, 0.9, 1.2, 2.8, 0.45, -8.8, materials.hair);
  solid(1.2, 3.4, 1.2, 0, 1.7, 0.5, materials.steelLift); // central pillar
  solid(1.3, 1.3, 1.3, -13.6, 0.65, 6.6, materials.steel); // site A crate
  solid(1.3, 1.1, 1.3, -14.6, 0.55, 8.0, materials.hair);
  solid(1.3, 1.3, 1.3, 13.6, 0.65, -6.6, materials.steel); // site B crate
  solid(1.3, 1.1, 1.3, 14.6, 0.55, -8.0, materials.hair);
  solid(2.0, 1.6, 1.2, -9, 0.8, -12.5, materials.hair); // warden spawn crates
  solid(2.0, 1.6, 1.2, 9, 0.8, -12.5, materials.hair);

  // Painted approach lines, purely visual.
  trim(0.18, 0.02, 6.0, 0, 0.015, 9.5, materials.paintVanguard);
  trim(6.0, 0.02, 0.18, -11.4, 0.015, 2.4, materials.paintVanguard);
  trim(6.0, 0.02, 0.18, 11.4, 0.015, -2.4, materials.paintWarden);

  // ---- charge sites ---------------------------------------------------------------
  const sites = SITES.map((site, index) => {
    const teamMat = index === 0 ? materials.vanguard : materials.warden;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(SITE_HALF * 2, 0.05, SITE_HALF * 2), teamMat);
    plate.position.set(site.x, 0.028, site.z);
    plate.receiveShadow = true;
    group.add(plate);

    // Beacon mast: a cylinder of light the bots and the player can see across the depot.
    const beamMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(index === 0 ? COLORS.vanguard : COLORS.warden),
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 5.0, 10, 1, true), beamMat);
    beam.position.set(site.x, 2.5, site.z);
    group.add(beam);

    const signMat = new THREE.MeshBasicMaterial({ map: signTexture(site.name, index === 0 ? COLORS.vanguard : COLORS.warden, false), transparent: true });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), signMat);
    sign.position.set(site.x, 2.3, site.z);
    group.add(sign);

    const lamp = new THREE.PointLight(new THREE.Color(index === 0 ? COLORS.vanguard : COLORS.warden), 26, 22, 2);
    lamp.position.set(site.x, 3.2, site.z);
    group.add(lamp);

    return { name: site.name, x: site.x, z: site.z, half: SITE_HALF, beam, sign, lamp, plate };
  });

  // ---- light ----------------------------------------------------------------------
  const sky = new THREE.HemisphereLight(new THREE.Color('#31525e'), new THREE.Color(COLORS.night), 2.5);
  scene.add(sky);

  const moon = new THREE.DirectionalLight(new THREE.Color('#bcd8e2'), 3.4);
  moon.position.set(12, 18, 9);
  moon.target.position.set(0, 0, -2);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.left = -20;
  moon.shadow.camera.right = 20;
  moon.shadow.camera.top = 20;
  moon.shadow.camera.bottom = -20;
  moon.shadow.camera.far = 60;
  moon.shadow.bias = -0.0007;
  scene.add(moon, moon.target);

  const fill = new THREE.DirectionalLight(new THREE.Color(COLORS.muted), 1.05);
  fill.position.set(-10, 8, 12);
  scene.add(fill);

  // Two sodium washes keep the room from reading as one flat blue.
  for (const [x, z] of [[-13, 13], [13, -13]]) {
    const wash = new THREE.PointLight(new THREE.Color(COLORS.vanguard), 18, 20, 2);
    wash.position.set(x, 4.2, z);
    scene.add(wash);
  }

  // One cold lamp over the middle of the floor: the divider and both doorways sit under it,
  // so the crossing is legible without lighting the corners.
  const coreLamp = new THREE.PointLight(new THREE.Color(COLORS.bone), 26, 24, 2);
  coreLamp.position.set(0, 4.6, 1.5);
  scene.add(coreLamp);

  // A cooler lamp over the Vanguard entry so the first thing the player sees is a lit room.
  const entryLamp = new THREE.PointLight(new THREE.Color(COLORS.muted), 20, 18, 2);
  entryLamp.position.set(0, 4.4, 12.4);
  scene.add(entryLamp);

  // Its twin keeps the east half of the entry from falling into one black corner.
  const entryLampEast = new THREE.PointLight(new THREE.Color(COLORS.muted), 14, 16, 2);
  entryLampEast.position.set(12, 4.4, 11.5);
  scene.add(entryLampEast);

  const waypoints = linkPoints();
  let pulse = 0;

  return {
    group,
    colliders,
    solids,
    waypoints,
    sites,
    materials,
    bounds: BOUNDS,
    playerSpawn: { x: 0, z: 13.2, yaw: 0 },
    botSpawns: [
      { x: -4.5, z: -12, yaw: Math.PI },
      { x: 4.5, z: -12, yaw: Math.PI },
      { x: 0, z: -13, yaw: Math.PI },
      { x: 11, z: -8.5, yaw: Math.PI },
    ],
    isOnSite(x, z) {
      for (let i = 0; i < sites.length; i += 1) {
        const s = sites[i];
        if (Math.abs(x - s.x) <= SITE_HALF && Math.abs(z - s.z) <= SITE_HALF) return i;
      }
      return -1;
    },
    // Beacons breathe so the eye finds them without a minimap.
    step(dt) {
      pulse += dt;
      for (let i = 0; i < sites.length; i += 1) {
        const s = sites[i];
        const wave = 0.5 + 0.5 * Math.sin(pulse * 2.4 + i * 2.1);
        s.beam.material.opacity = 0.1 + wave * 0.14;
        s.beam.scale.set(1, 0.9 + wave * 0.2, 1);
        s.lamp.intensity = 20 + wave * 12;
        s.sign.rotation.y += dt * 0.35;
      }
    },
  };
}
