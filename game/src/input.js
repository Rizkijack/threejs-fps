// Keyboard, mouse and pointer lock. The simulation reads state.keys for held actions and
// asks pressed(code) for one-shot ones (buy slots, plant, grenade, reload). Edge presses are
// collected here and cleared once per rendered frame by main.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const justPressed = new Set();
  const state = { keys, locked: false, firing: false, lookX: 0, lookY: 0 };

  window.addEventListener('keydown', (event) => {
    if (!event.repeat) justPressed.add(event.code);
    keys.add(event.code);
    if (event.code === 'Space' || event.code === 'Tab' || event.code.startsWith('Control')) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    keys.delete(event.code);
  });
  window.addEventListener('blur', () => {
    keys.clear();
    state.firing = false;
  });
  window.addEventListener('mousemove', (event) => {
    if (!state.locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  });
  window.addEventListener('mousedown', (event) => {
    if (state.locked && event.button === 0) state.firing = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
  });
  window.addEventListener('contextmenu', (event) => event.preventDefault());
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) {
      keys.clear();
      state.firing = false;
    }
    onLockChange(state.locked);
  });

  return {
    state,
    requestLock() {
      const request = canvas.requestPointerLock?.();
      // Chrome returns a promise that rejects if the gesture was spent; a rejected lock is
      // not a game error, the overlay simply stays up for another click.
      if (request && typeof request.catch === 'function') request.catch(() => {});
    },
    exitLock() {
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    },
    takeLook() {
      const x = state.lookX;
      const y = state.lookY;
      state.lookX = 0;
      state.lookY = 0;
      return { x, y };
    },
    pressed(code) {
      if (!justPressed.has(code)) return false;
      justPressed.delete(code);
      return true;
    },
    endFrame() {
      justPressed.clear();
    },
  };
}
