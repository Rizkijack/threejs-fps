// The match clock: freeze window, live round, armed charge, round result, next round. One
// object owns every number the rest of the game asks about — phase, timer, money, score —
// so the bots, the HUD and the buy menu never disagree about what is happening.
import * as THREE from 'three';
import { COLORS } from './palette.js';
import { BUY_ITEMS, WEAPONS } from './weapons.js';

export const RULES = {
  freeze: 8,
  live: 55,
  fuse: 30,
  over: 6,
  matchOver: 8,
  plant: 2.8,
  defuse: 5,
  firstTo: 5,
  startMoney: 3200,
  maxMoney: 9000,
  winMoney: 3000,
  lossMoney: 1900,
  killMoney: 300,
  plantMoney: 300,
  defuseMoney: 500,
};

function buildBomb() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.22, 0.26),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(COLORS.steelLift), roughness: 0.6, metalness: 0.35 }),
  );
  body.position.y = 0.11;
  body.castShadow = true;
  group.add(body);
  const lightMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS.charge) });
  for (let i = 0; i < 3; i += 1) {
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.055, 0.02), lightMat);
    led.position.set(-0.09 + i * 0.09, 0.14, 0.14);
    group.add(led);
  }
  const wire = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.008, 0.24, 4),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS.charge) }),
  );
  wire.position.set(0.1, 0.25, 0);
  wire.rotation.z = 0.7;
  group.add(wire);
  const lamp = new THREE.PointLight(new THREE.Color(COLORS.charge), 2.4, 4, 2);
  lamp.position.set(0, 0.3, 0);
  group.add(lamp);
  group.visible = false;
  return { group, lamp };
}

export function createRounds(scene, world, weapons) {
  const bombView = buildBomb();
  scene.add(bombView.group);

  const state = {
    phase: 'freeze',
    timer: RULES.freeze,
    round: 1,
    wins: { vanguard: 0, warden: 0 },
    money: RULES.startMoney,
    loadout: { primary: null, sidearm: 'sparrow' },
    owned: { sparrow: true },
    bombPlanted: false,
    bombSite: -1,
    siteLabel: '—',
    fuse: 0,
    defuse: 0,
    bomb: { x: 0, z: 0 },
    plant: 0,
    beepTimer: 0,
    matchOver: false,
    result: '',
    note: '',
    noteTimer: 0,
    buyOpen: false,
    started: false,
    pulse: 0,
  };

  function siteName(index) {
    return index >= 0 ? world.sites[index].name : '—';
  }

  function aliveBots(game) {
    let count = 0;
    const list = game.bots.list;
    for (let i = 0; i < list.length; i += 1) if (list[i].alive) count += 1;
    return count;
  }

  function announce(text, seconds) {
    state.note = text;
    state.noteTimer = seconds === undefined ? 2.6 : seconds;
  }

  function beginRound(game, keepMoney) {
    if (!keepMoney) state.money = Math.min(RULES.maxMoney, state.money);
    state.phase = 'freeze';
    state.timer = RULES.freeze;
    state.bombPlanted = false;
    state.bombSite = -1;
    state.siteLabel = '—';
    state.fuse = 0;
    state.defuse = 0;
    state.plant = 0;
    state.plantHeld = false;
    state.result = '';
    state.buyOpen = true;
    state.plantedBy = null;
    state.roundBanner = '';
    bombView.group.visible = false;
    bombView.lamp.intensity = 0;
    state.bomb.x = 0;
    state.bomb.z = 0;

    game.grenades.clear();
    game.player.state.armor = 0;
    game.player.respawn();
    game.bots.respawn();
    weapons.state.grenades = 1;
    const carry = state.loadout.primary || state.loadout.sidearm;
    weapons.refill(carry);
    if (game.hud) game.hud.paintBuy(state, weapons);
    announce(`ROUND ${state.round} · BUY PHASE`, RULES.freeze);
  }

  function endRound(game, winner, reason) {
    if (state.phase === 'over') return;
    state.phase = 'over';
    state.timer = state.wins[winner] + 1 >= RULES.firstTo ? RULES.matchOver : RULES.over;
    state.result = reason;
    state.buyOpen = false;
    state.wins[winner] += 1;
    if (state.wins[winner] >= RULES.firstTo) state.matchOver = true;

    const won = winner === 'vanguard';
    state.money = Math.min(RULES.maxMoney, state.money + (won ? RULES.winMoney : RULES.lossMoney));
    if (state.bombPlanted && won) state.money = Math.min(RULES.maxMoney, state.money + RULES.defuseMoney);

    game.events.push({
      type: 'round',
      winner,
      reason,
      score: { vanguard: state.wins.vanguard, warden: state.wins.warden },
      matchOver: state.matchOver,
    });
    state.plant = 0;
    state.defuse = 0;
  }

  function plantBomb(game, siteIndex) {
    state.bombPlanted = true;
    state.bombSite = siteIndex;
    state.siteLabel = world.sites[siteIndex].name;
    state.fuse = RULES.fuse;
    state.defuse = 0;
    state.beepTimer = 0;
    state.phase = 'planted';
    state.plantHeld = false;
    state.bomb.x = world.sites[siteIndex].x;
    state.bomb.z = world.sites[siteIndex].z;
    bombView.group.position.set(state.bomb.x, 0, state.bomb.z);
    bombView.group.visible = true;
    state.money = Math.min(RULES.maxMoney, state.money + RULES.plantMoney);
    state.plantedBy = 'VANGUARD';
    announce(`CHARGE ARMED · SITE ${siteName(siteIndex)}`, 3.2);
    game.events.push({ type: 'planted', site: siteIndex });
    game.audio.planted(game, state.bomb.x, state.bomb.z);
    game.effects.puff(state.bomb.x, 0.6, state.bomb.z, COLORS.charge);
  }

  function detonate(game) {
    const bombs = bombView.group.position;
    game.effects.explosion(bombs.x, 0.9, bombs.z);
    game.audio.explosion(game, bombs.x, bombs.z);
    bombView.group.visible = false;
    bombView.lamp.intensity = 0;
    endRound(game, 'vanguard', 'CHARGE DETONATED');
  }

  function defused(game) {
    bombView.group.visible = false;
    bombView.lamp.intensity = 0;
    game.audio.defuseDone(game, state.bomb.x, state.bomb.z);
    endRound(game, 'warden', 'CHARGE DEFUSED');
  }

  function killReward(game) {
    state.money = Math.min(RULES.maxMoney, state.money + RULES.killMoney);
    if (game) game.hud.paintMoney(state);
  }

  function step(dt, game, planting) {
    if (!state.started) return;
    state.pulse += dt;
    if (state.noteTimer > 0) {
      state.noteTimer -= dt;
      if (state.noteTimer <= 0) state.note = '';
    }

    const player = game.player.state;
    const site = world.isOnSite(player.x, player.z);
    const canPlant = state.phase === 'live' && player.alive && site >= 0;
    if (planting && canPlant) {
      state.plant += dt;
      if (state.plant >= RULES.plant) plantBomb(game, site);
    } else if (state.plant > 0) {
      state.plant = Math.max(0, state.plant - dt * 2.4);
    }

    if (state.bombPlanted) {
      // The armed charge blinks faster as the fuse burns down.
      const rate = 0.3 + (state.fuse / RULES.fuse) * 1.4;
      const blink = 0.5 + 0.5 * Math.sin(state.pulse * 9 / rate);
      bombView.lamp.intensity = 1.2 + blink * 3.2;
      bombView.group.rotation.y = state.pulse * 0.6;
    }

    switch (state.phase) {
      case 'freeze': {
        state.timer = Math.max(0, state.timer - dt);
        if (state.timer === 0) {
          state.phase = 'live';
          state.timer = RULES.live;
          state.buyOpen = false;
          announce('LIVE · PLANT THE CHARGE', 2.2);
          game.audio.roundLive();
        }
        break;
      }
      case 'live': {
        state.timer = Math.max(0, state.timer - dt);
        if (aliveBots(game) === 0) {
          endRound(game, 'vanguard', 'WARDEN ELIMINATED');
        } else if (!player.alive) {
          endRound(game, 'warden', 'VANGUARD DOWN');
        } else if (state.timer === 0) {
          endRound(game, 'warden', 'TIME EXPIRED');
        }
        break;
      }
      case 'planted': {
        state.fuse = Math.max(0, state.fuse - dt);
        state.beepTimer -= dt;
        if (state.beepTimer <= 0) {
          const hot = state.fuse < 8;
          state.beepTimer = hot ? 0.24 : 0.45 + (state.fuse / RULES.fuse) * 0.75;
          game.audio.beep(hot);
        }
        let defusers = 0;
        const list = game.bots.list;
        for (let i = 0; i < list.length; i += 1) {
          const bot = list[i];
          if (!bot.alive || !bot.defusing) continue;
          if (Math.hypot(bot.x - state.bomb.x, bot.z - state.bomb.z) < 1.9) defusers += 1;
        }
        if (defusers > 0) {
          if (state.defuse === 0) game.audio.defuseStart(game, state.bomb.x, state.bomb.z);
          state.defuse = Math.min(RULES.defuse, state.defuse + dt);
          if (state.defuse >= RULES.defuse) defused(game);
        } else {
          state.defuse = Math.max(0, state.defuse - dt * 1.6);
        }
        if (state.phase === 'planted' && state.fuse === 0) detonate(game);
        if (state.phase === 'planted' && aliveBots(game) === 0) {
          endRound(game, 'vanguard', 'SITE SECURED');
        }
        break;
      }
      case 'over': {
        state.timer = Math.max(0, state.timer - dt);
        if (state.timer === 0) {
          if (state.matchOver) resetMatch(game);
          else {
            state.round += 1;
            beginRound(game, true);
          }
        }
        break;
      }
      default:
        break;
    }

    if (game.hud) game.hud.paintRound(state, weapons, game);
  }

  function resetMatch(game) {
    state.wins.vanguard = 0;
    state.wins.warden = 0;
    state.round = 1;
    state.money = RULES.startMoney;
    state.matchOver = false;
    state.owned = { sparrow: true };
    state.loadout = { primary: null, sidearm: 'sparrow' };
    beginRound(game, true);
  }

  /** Buy from the freeze menu. Returns the item bought, or null. */
  function buy(code, game) {
    if (state.phase !== 'freeze' || !state.buyOpen) return null;
    let item = null;
    for (let i = 0; i < BUY_ITEMS.length; i += 1) if (BUY_ITEMS[i].code === code) item = BUY_ITEMS[i];
    if (!item) return null;
    if (state.money < item.price) {
      game.audio.denied();
      announce('NOT ENOUGH CREDITS', 1.4);
      return null;
    }

    if (item.kind === 'weapon') {
      const def = WEAPONS[item.id];
      if (state.owned[item.id]) {
        weapons.equip(item.id);
        if (def.slot === 'primary') state.loadout.primary = item.id;
        else state.loadout.sidearm = item.id;
        return item;
      }
      state.owned[item.id] = true;
      state.money -= item.price;
      if (def.slot === 'primary') state.loadout.primary = item.id;
      else state.loadout.sidearm = item.id;
      weapons.equip(item.id);
      announce(`${def.name.toUpperCase()} ISSUED`, 1.8);
    } else if (item.kind === 'grenade') {
      if (weapons.state.grenades >= 2) {
        game.audio.denied();
        return null;
      }
      state.money -= item.price;
      weapons.state.grenades += 1;
      announce('FRAG CHARGE ISSUED', 1.6);
    } else if (item.kind === 'armor') {
      if (game.player.state.armor >= 100) {
        game.audio.denied();
        return null;
      }
      state.money -= item.price;
      game.player.state.armor = 100;
      announce('PLATE CARRIER ON', 1.6);
    }

    game.audio.buy();
    if (game.hud) game.hud.paintBuy(state, weapons);
    return item;
  }

  /** Q swaps between the bought primary and the sidearm. */
  function swap(game) {
    const primary = state.loadout.primary;
    const sidearm = state.loadout.sidearm;
    if (weapons.state.current === primary || !primary) {
      weapons.equip(sidearm);
    } else {
      weapons.equip(primary);
    }
    game.audio.swap();
  }

  return {
    state,
    beginRound,
    resetMatch,
    step,
    buy,
    swap,
    killReward,
    siteName,
    /** Kept for callers that want the armed site's label without reaching into state. */
    armedSite() {
      return state.bombSite;
    },
  };
}
