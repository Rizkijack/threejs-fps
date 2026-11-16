// Box collision, ray casts and line of sight, written with plain numbers.
// The simulation calls these every tick, so nothing here allocates: the collider list is
// an array of THREE.Box3 built once by world.js, and the results are numbers or the
// collider itself.

// Reused by slideMove so a caller can read which axes were blocked without a new object.
const SLIDE = { hitX: false, hitZ: false };

/** The first collider an axis-aligned box overlaps, or null. */
export function boxOverlap(colliders, minX, minY, minZ, maxX, maxY, maxZ) {
  for (let i = 0; i < colliders.length; i += 1) {
    const b = colliders[i];
    if (minX < b.max.x && maxX > b.min.x && minY < b.max.y && maxY > b.min.y && minZ < b.max.z && maxZ > b.min.z) return b;
  }
  return null;
}

/**
 * Move a body of `radius`/`height` by (dx, dz), solving one axis at a time so a wall stops
 * the body instead of swallowing it. Mutates pos.x/pos.z and returns the shared flags.
 */
export function slideMove(colliders, pos, dx, dz, radius, height) {
  SLIDE.hitX = false;
  SLIDE.hitZ = false;
  const lift = 0.06;
  if (dx !== 0) {
    const nx = pos.x + dx;
    if (!boxOverlap(colliders, nx - radius, pos.y + lift, pos.z - radius, nx + radius, pos.y + height - lift, pos.z + radius)) pos.x = nx;
    else SLIDE.hitX = true;
  }
  if (dz !== 0) {
    const nz = pos.z + dz;
    if (!boxOverlap(colliders, pos.x - radius, pos.y + lift, nz - radius, pos.x + radius, pos.y + height - lift, nz + radius)) pos.z = nz;
    else SLIDE.hitZ = true;
  }
  return SLIDE;
}

/**
 * Slab test of a ray against one box. Returns the entry distance, 0 when the origin is
 * inside, or -1 when the ray misses before maxT.
 */
export function rayBox(box, ox, oy, oz, dx, dy, dz, maxT) {
  let tmin = 0;
  let tmax = maxT;
  if (Math.abs(dx) < 1e-9) {
    if (ox < box.min.x || ox > box.max.x) return -1;
  } else {
    let t1 = (box.min.x - ox) / dx;
    let t2 = (box.max.x - ox) / dx;
    if (t1 > t2) {
      const s = t1;
      t1 = t2;
      t2 = s;
    }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  if (Math.abs(dy) < 1e-9) {
    if (oy < box.min.y || oy > box.max.y) return -1;
  } else {
    let t1 = (box.min.y - oy) / dy;
    let t2 = (box.max.y - oy) / dy;
    if (t1 > t2) {
      const s = t1;
      t1 = t2;
      t2 = s;
    }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  if (Math.abs(dz) < 1e-9) {
    if (oz < box.min.z || oz > box.max.z) return -1;
  } else {
    let t1 = (box.min.z - oz) / dz;
    let t2 = (box.max.z - oz) / dz;
    if (t1 > t2) {
      const s = t1;
      t1 = t2;
      t2 = s;
    }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  return tmin;
}

/** Nearest distance from a ray to the world's solid boxes; Infinity when nothing is hit. */
export function rayColliders(colliders, ox, oy, oz, dx, dy, dz, maxT) {
  let best = maxT;
  let found = false;
  for (let i = 0; i < colliders.length; i += 1) {
    const t = rayBox(colliders[i], ox, oy, oz, dx, dy, dz, best);
    if (t >= 0 && t < best) {
      best = t;
      found = true;
    }
  }
  return found ? best : Infinity;
}

/** Whether a segment from a to b is cut by any solid box. Eyes at 1.55 never hit the floor. */
export function lineBlocked(colliders, ax, ay, az, bx, by, bz) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return false;
  const inv = 1 / len;
  return rayColliders(colliders, ax, ay, az, dx * inv, dy * inv, dz * inv, len - 0.05) < Infinity;
}

/** A body's hitbox, shaped like a THREE.Box3 so one ray routine serves every target. */
export function makeHitbox() {
  return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
}

/** Point a numeric hitbox at (x, y) with a half width and a bottom/top. */
export function setHitbox(box, x, y, z, halfW, bottom, top) {
  box.min.x = x - halfW;
  box.max.x = x + halfW;
  box.min.y = y + bottom;
  box.max.y = y + top;
  box.min.z = z - halfW;
  box.max.z = z + halfW;
}
