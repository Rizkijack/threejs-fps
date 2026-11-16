// The HUD, built in JS so index.html stays untouched: clock and score, vitals, ammo, the
// objective line, the buy menu, a killfeed and the one modal overlay. Nothing here mutates
// the simulation; main pushes state in and the HUD writes the smallest DOM change it can.
import { COLORS } from './palette.js';
import { BUY_ITEMS } from './weapons.js';

const STYLE = `
#bp-root, #bp-root * { font-family: ui-monospace, 'SF Mono', Menlo, monospace; }
#bp-root { position:fixed; inset:0; pointer-events:none; color:${COLORS.bone}; }
#ammo, #score { display:none !important; }

#bp-top { position:fixed; top:12px; left:50%; transform:translateX(-50%); display:flex; align-items:center; gap:18px;
  padding:8px 16px; background:rgba(6,11,14,.62); border:1px solid rgba(139,161,166,.22); border-radius:3px; }
#bp-top .side { display:flex; flex-direction:column; align-items:center; gap:2px; min-width:64px; }
#bp-top .name { font-size:10px; letter-spacing:.16em; opacity:.8; }
#bp-top .pts { font-size:22px; font-weight:600; line-height:1; }
#bp-top .vanguard .pts { color:${COLORS.vanguard}; }
#bp-top .warden .pts { color:${COLORS.warden}; }
#bp-clock { text-align:center; min-width:84px; }
#bp-time { font-size:26px; font-weight:600; letter-spacing:.02em; line-height:1; }
#bp-phase { margin-top:4px; font-size:9px; letter-spacing:.18em; color:${COLORS.muted}; }
#bp-round { font-size:9px; letter-spacing:.18em; color:${COLORS.muted}; }
#bp-time.hot { color:${COLORS.charge}; }

#bp-objective { position:fixed; top:16px; left:18px; max-width:250px; font-size:11px; letter-spacing:.08em;
  line-height:1.5; color:${COLORS.muted}; border-left:2px solid ${COLORS.vanguard}; padding-left:10px; }
#bp-objective b { color:${COLORS.bone}; font-weight:600; }
#bp-objective .armed { color:${COLORS.charge}; }

#bp-vitals { position:fixed; left:18px; bottom:16px; width:230px; }
#bp-hp-row { display:flex; align-items:baseline; gap:8px; }
#bp-hp { font-size:30px; font-weight:600; line-height:1; }
#bp-hp-label { font-size:9px; letter-spacing:.18em; color:${COLORS.muted}; }
#bp-armor { margin-left:auto; font-size:11px; color:${COLORS.warden}; }
#bp-hp-bar { margin-top:6px; height:4px; background:rgba(139,161,166,.2); border-radius:1px; overflow:hidden; }
#bp-hp-fill { height:100%; width:100%; background:${COLORS.vanguard}; transition:width 120ms linear; }
#bp-money { margin-top:8px; font-size:12px; letter-spacing:.1em; color:${COLORS.money}; }
#bp-money span { color:${COLORS.muted}; font-size:9px; }

#bp-arm { position:fixed; right:18px; bottom:16px; text-align:right; }
#bp-weapon { font-size:11px; letter-spacing:.16em; color:${COLORS.muted}; }
#bp-ammo { font-size:40px; font-weight:600; line-height:1; letter-spacing:-.02em; }
#bp-ammo small { font-size:14px; font-weight:400; color:${COLORS.muted}; letter-spacing:0; }
#bp-ammo.low { color:${COLORS.charge}; }
#bp-reload { margin-top:6px; font-size:10px; letter-spacing:.18em; color:${COLORS.charge}; min-height:12px; }
#bp-frags { margin-top:6px; font-size:10px; letter-spacing:.14em; color:${COLORS.muted}; }
#bp-frags b { color:${COLORS.bone}; }

#bp-feed { position:fixed; top:16px; right:18px; display:flex; flex-direction:column; gap:5px; align-items:flex-end; }
#bp-feed div { font-size:11px; letter-spacing:.06em; padding:3px 8px; background:rgba(6,11,14,.7);
  border-right:2px solid ${COLORS.vanguard}; color:${COLORS.bone}; animation:bp-feed-in 140ms ease-out; }
#bp-feed div.head { border-right-color:${COLORS.charge}; }
@keyframes bp-feed-in { from { opacity:0; transform:translateX(8px); } to { opacity:1; transform:none; } }

#bp-banner { position:fixed; left:50%; top:60%; transform:translateX(-50%); font-size:13px; letter-spacing:.2em;
  padding:6px 14px; background:rgba(6,11,14,.72); border-top:1px solid ${COLORS.vanguard}; color:${COLORS.bone}; }
#bp-banner[hidden] { display:none; }

#bp-vignette { position:fixed; inset:0; opacity:0; transition:opacity 240ms ease-out;
  background:radial-gradient(ellipse at center, transparent 42%, rgba(255,82,56,.55) 100%); }

#bp-buy { position:fixed; left:50%; bottom:96px; transform:translateX(-50%); width:390px; padding:12px 14px;
  background:rgba(6,11,14,.86); border:1px solid rgba(139,161,166,.3); border-radius:3px; pointer-events:auto; }
#bp-buy[hidden] { display:none; }
#bp-buy h2 { margin:0 0 2px; font-size:12px; letter-spacing:.22em; font-weight:600; color:${COLORS.bone}; }
#bp-buy p { margin:0 0 9px; font-size:9px; letter-spacing:.14em; color:${COLORS.muted}; }
#bp-buy .row { display:grid; grid-template-columns:18px 1fr auto; gap:8px; align-items:center; padding:5px 6px;
  border-top:1px solid rgba(139,161,166,.14); cursor:pointer; }
#bp-buy .row:hover { background:rgba(242,137,46,.1); }
#bp-buy .row .k { display:grid; place-items:center; width:18px; height:18px; border:1px solid rgba(139,161,166,.4);
  font-size:10px; color:${COLORS.bone}; }
#bp-buy .row .n { font-size:11px; color:${COLORS.bone}; letter-spacing:.05em; }
#bp-buy .row .n em { display:block; font-style:normal; font-size:9px; color:${COLORS.muted}; letter-spacing:.06em; margin-top:1px; }
#bp-buy .row .p { font-size:11px; color:${COLORS.money}; }
#bp-buy .row.owned .p { color:${COLORS.ok}; }
#bp-buy .row.poor { opacity:.42; }

/* A 26 px reticle: four ticks with a hard dark edge so it survives both the sodium lamps
   and the white site floor, plus one hot centre dot for the aim point. */
#crosshair { width:26px; height:26px; }
#crosshair i { background:${COLORS.bone}; opacity:1; box-shadow:0 0 0 1px rgba(0,0,0,.7); }
#crosshair i:nth-child(1) { left:12px; top:0; width:2px; height:9px; }
#crosshair i:nth-child(2) { left:12px; bottom:0; width:2px; height:9px; }
#crosshair i:nth-child(3) { top:12px; left:0; height:2px; width:9px; }
#crosshair i:nth-child(4) { top:12px; right:0; height:2px; width:9px; }
#crosshair::after { content:''; position:absolute; left:12px; top:12px; width:2px; height:2px;
  background:${COLORS.charge}; box-shadow:0 0 0 1px rgba(0,0,0,.7); }
#hitmarker { transition:opacity 90ms linear; }
#hitmarker.bp-head i { background:${COLORS.charge}; }

/* The modal keeps the depot visible behind it instead of flooding the frame with black,
   and sits left of centre so the room stays in the frame. */
.overlay { pointer-events:none; place-items:center start; padding-left:clamp(28px, 7vw, 104px);
  background:radial-gradient(ellipse at 62% 58%, rgba(6,11,14,.18) 0%, rgba(6,11,14,.82) 88%); }
.overlay.bp-click { pointer-events:auto; }
.overlay .panel { border-top:2px solid ${COLORS.vanguard}; background:linear-gradient(180deg, rgba(24,38,44,.97), rgba(9,17,21,.97));
  box-shadow:0 26px 70px rgba(0,0,0,.6); }
.overlay .panel h1 { letter-spacing:-.02em; }
.overlay .keys[hidden] { display:none; }
`;

function h(tag, id, cls) {
  const el = document.createElement(tag);
  if (id) el.id = id;
  if (cls) el.className = cls;
  return el;
}

function clock(seconds) {
  const t = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

export function createHud() {
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  const root = h('div', 'bp-root');
  document.getElementById('hud').appendChild(root);

  const top = h('div', 'bp-top');
  top.innerHTML = `
    <div class="side vanguard"><span class="name">VANGUARD</span><span class="pts" id="bp-pts-v">0</span></div>
    <div id="bp-clock"><div id="bp-time">1:00</div><div id="bp-phase">BUY PHASE</div><div id="bp-round">ROUND 1</div></div>
    <div class="side warden"><span class="name">WARDEN</span><span class="pts" id="bp-pts-w">0</span></div>`;
  root.appendChild(top);

  const objective = h('div', 'bp-objective');
  objective.innerHTML = '<b>ATTACK</b><br><span id="bp-obj-line">Plant the charge at A or B</span>';
  root.appendChild(objective);

  const vitals = h('div', 'bp-vitals');
  vitals.innerHTML = `
    <div id="bp-hp-row"><span id="bp-hp">100</span><span id="bp-hp-label">HEALTH</span><span id="bp-armor"></span></div>
    <div id="bp-hp-bar"><div id="bp-hp-fill"></div></div>
    <div id="bp-money"><span>CREDITS</span> <b id="bp-credits">3200</b></div>`;
  root.appendChild(vitals);

  const arm = h('div', 'bp-arm');
  arm.innerHTML = `
    <div id="bp-weapon">SPARROW P9</div>
    <div id="bp-ammo"><b id="bp-mag">13</b><small id="bp-reserve"> / 52</small></div>
    <div id="bp-reload"></div>
    <div id="bp-frags">FRAG <b id="bp-grenades">1</b></div>`;
  root.appendChild(arm);

  const feed = h('div', 'bp-feed');
  root.appendChild(feed);

  const banner = h('div', 'bp-banner');
  banner.hidden = true;
  root.appendChild(banner);

  const vignette = h('div', 'bp-vignette');
  root.appendChild(vignette);

  const buy = h('div', 'bp-buy');
  buy.hidden = true;
  root.appendChild(buy);

  const crosshair = document.getElementById('crosshair');
  const hitmarker = document.getElementById('hitmarker');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayCopy = document.getElementById('overlay-copy');
  const play = document.getElementById('play');
  const keyList = document.querySelector('#overlay .keys');

  document.title = 'BREACHPOINT';

  const keys = document.querySelector('.keys');
  if (keys) {
    keys.innerHTML = `
      <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Move · <kbd>Shift</kbd> sprint · <kbd>Ctrl</kbd> crouch</li>
      <li><kbd>Click</kbd> Fire · <kbd>R</kbd> Reload · <kbd>Q</kbd> Swap</li>
      <li><kbd>1</kbd>–<kbd>5</kbd> Buy in the freeze window</li>
      <li><kbd>E</kbd> Hold to plant at A or B · <kbd>G</kbd> Frag</li>`;
  }

  const nodes = {
    time: document.getElementById('bp-time'),
    phase: document.getElementById('bp-phase'),
    round: document.getElementById('bp-round'),
    ptsV: document.getElementById('bp-pts-v'),
    ptsW: document.getElementById('bp-pts-w'),
    obj: document.getElementById('bp-obj-line'),
    hp: document.getElementById('bp-hp'),
    hpFill: document.getElementById('bp-hp-fill'),
    armor: document.getElementById('bp-armor'),
    credits: document.getElementById('bp-credits'),
    weapon: document.getElementById('bp-weapon'),
    mag: document.getElementById('bp-mag'),
    reserve: document.getElementById('bp-reserve'),
    ammo: document.getElementById('bp-ammo'),
    reload: document.getElementById('bp-reload'),
    grenades: document.getElementById('bp-grenades'),
  };

  let last = {};
  let hitTimer = 0;
  let buySignature = '';
  let onBuy = null;
  let onPlay = null;

  function set(node, key, text) {
    if (last[key] === text) return;
    last[key] = text;
    node.textContent = text;
  }

  function showOverlay(mode, data) {
    const score = data && data.score ? data.score : { vanguard: 0, warden: 0 };
    if (mode === 'start') {
      overlayTitle.textContent = 'BREACHPOINT';
      overlayCopy.textContent = 'Kessler Cold Store. Your team is gone; the Warden still holds both charge sites. Plant at A or B, or take them all down.';
      play.textContent = 'Deploy';
    } else if (mode === 'paused') {
      overlayTitle.textContent = 'HOLD';
      overlayCopy.textContent = 'Simulation paused. Click to get back in.';
      play.textContent = 'Resume';
    } else if (mode === 'match') {
      const won = data && data.winner === 'vanguard';
      overlayTitle.textContent = won ? 'DEPOT SECURED' : 'WARDEN HOLDS';
      overlayCopy.textContent = `Match ${won ? 'won' : 'lost'} ${score.vanguard}–${score.warden}. New match in a moment.`;
      play.textContent = 'Redeploy';
    } else {
      const won = data && data.winner === 'vanguard';
      overlayTitle.textContent = won ? 'ROUND WON' : 'ROUND LOST';
      overlayCopy.textContent = `${(data && data.reason) || 'Round over'}. Vanguard ${score.vanguard} — ${score.warden} Warden.`;
      play.textContent = 'Deploy';
    }
    // Round and match panels resolve themselves on a timer, so offering a button that does
    // nothing (and a control list) would only invite a dead click.
    const auto = mode === 'round' || mode === 'match';
    play.hidden = auto;
    keyList.hidden = auto;
    overlay.hidden = false;
    overlay.classList.toggle('bp-click', mode === 'start' || mode === 'paused');
    overlay.dataset.mode = mode;
  }

  function hideOverlay() {
    overlay.hidden = true;
  }

  function paintMoney(state) {
    set(nodes.credits, 'credits', String(state.money));
  }

  function paintBuy(state, weapons) {
    const open = state.phase === 'freeze' && state.buyOpen && overlay.hidden;
    buy.hidden = !open;
    if (!open) {
      buySignature = '';
      return;
    }
    let signature = `${state.money}|${weapons.state.grenades}|`;
    for (const item of BUY_ITEMS) signature += `${item.id}:${state.owned[item.id] ? 1 : 0},`;
    if (signature === buySignature) return;
    buySignature = signature;
    const rows = BUY_ITEMS.map((item) => {
      const owned = item.kind === 'weapon' && state.owned[item.id];
      const poor = !owned && state.money < item.price;
      const price = owned ? 'OWNED' : `$${item.price}`;
      return `<div class="row${owned ? ' owned' : ''}${poor ? ' poor' : ''}" data-code="${item.code}">
        <span class="k">${item.key}</span>
        <span class="n">${item.label}<em>${item.note}</em></span>
        <span class="p">${price}</span></div>`;
    }).join('');
    buy.innerHTML = `<h2>REQUISITION</h2><p>FREEZE WINDOW · KEYS 1–5 · G TO THROW</p>${rows}`;
    const buttons = buy.querySelectorAll('.row');
    for (let i = 0; i < buttons.length; i += 1) {
      buttons[i].addEventListener('click', () => {
        if (onBuy) onBuy(buttons[i].dataset.code);
      });
    }
  }

  function paintRound(state, weapons, game) {
    set(nodes.time, 'time', clock(state.timer));
    const phaseText = state.phase === 'freeze' ? 'BUY PHASE'
      : state.phase === 'live' ? 'LIVE'
        : state.phase === 'planted' ? 'CHARGE ARMED' : 'ROUND OVER';
    set(nodes.phase, 'phase', phaseText);
    set(nodes.round, 'round', state.matchOver ? 'MATCH POINT' : `ROUND ${state.round}`);
    set(nodes.ptsV, 'ptsV', String(state.wins.vanguard));
    set(nodes.ptsW, 'ptsW', String(state.wins.warden));
    nodes.time.classList.toggle('hot', state.phase === 'planted' || (state.phase === 'live' && state.timer < 10));

    let line = 'Plant the charge at A or B';
    if (state.phase === 'freeze') line = 'Buy now — the charge sites unlock when the round goes live';
    else if (state.phase === 'planted') {
      const left = Math.max(0, Math.ceil(state.fuse));
      line = `CHARGE AT ${state.siteLabel} · ${left}s`;
      if (state.defuse > 0.05) line += ` · DEFUSE ${Math.min(99, Math.round((state.defuse / 5) * 100))}%`;
    } else if (state.phase === 'live' && state.plant > 0.05) {
      line = `PLANTING ${Math.min(99, Math.round((state.plant / 2.8) * 100))}%`;
    } else if (state.phase === 'over') line = state.result;
    if (last.obj !== line) {
      last.obj = line;
      nodes.obj.textContent = line;
      nodes.obj.className = state.phase === 'planted' ? 'armed' : '';
    }

    const p = game.player.state;
    set(nodes.hp, 'hp', String(Math.max(0, Math.ceil(p.hp))));
    nodes.hpFill.style.width = `${Math.max(0, Math.min(100, p.hp))}%`;
    nodes.hpFill.style.background = p.hp < 35 ? COLORS.charge : COLORS.vanguard;
    set(nodes.armor, 'armor', p.armor > 0 ? `ARMOR ${Math.ceil(p.armor)}` : '');
    paintMoney(state);

    const def = weapons.def();
    set(nodes.weapon, 'weapon', def.name.toUpperCase());
    set(nodes.mag, 'mag', String(weapons.state.mag));
    set(nodes.reserve, 'reserve', ` / ${weapons.state.reserve}`);
    nodes.ammo.classList.toggle('low', weapons.state.mag <= Math.max(2, Math.ceil(def.mag * 0.2)));
    set(nodes.reload, 'reload', weapons.state.reloadLeft > 0 ? 'RELOADING' : (weapons.state.mag === 0 ? 'EMPTY · R' : ''));
    set(nodes.grenades, 'frags', String(weapons.state.grenades));

    const note = state.phase === 'over' ? '' : state.note;
    set(banner, 'banner', note);
    banner.hidden = !note;

    const spread = game.weapons.spreadFor(p);
    const scale = Math.max(0.75, Math.min(2.6, 0.8 + spread * 18));
    if (last.scale !== scale.toFixed(2)) {
      last.scale = scale.toFixed(2);
      crosshair.style.transform = `translate(-50%, -50%) scale(${last.scale})`;
    }

    paintBuy(state, weapons);
  }

  function hitMarker(headshot, kill) {
    hitmarker.classList.add('on');
    hitmarker.classList.toggle('bp-head', Boolean(headshot));
    hitmarker.style.transform = `translate(-50%, -50%) rotate(45deg) scale(${kill ? 1.35 : 1})`;
    clearTimeout(hitTimer);
    hitTimer = setTimeout(() => {
      hitmarker.classList.remove('on');
      hitmarker.style.transform = 'translate(-50%, -50%) rotate(45deg)';
    }, kill ? 160 : 80);
  }

  function killfeed(text, headshot) {
    const row = document.createElement('div');
    if (headshot) row.className = 'head';
    row.textContent = text;
    feed.appendChild(row);
    while (feed.children.length > 4) feed.removeChild(feed.firstChild);
    setTimeout(() => {
      if (row.parentNode === feed) feed.removeChild(row);
    }, 4200);
  }

  function damageFlash(amount) {
    const strength = Math.min(1, 0.35 + amount / 60);
    vignette.style.transition = 'none';
    vignette.style.opacity = String(strength);
    requestAnimationFrame(() => {
      vignette.style.transition = 'opacity 240ms ease-out';
      vignette.style.opacity = '0';
    });
  }

  play.addEventListener('click', () => {
    if (onPlay) onPlay();
  });

  return {
    paintRound,
    paintBuy,
    paintMoney,
    hitMarker,
    killfeed,
    damageFlash,
    showOverlay,
    hideOverlay,
    onPlay(handler) {
      onPlay = handler;
    },
    onBuy(handler) {
      onBuy = handler;
    },
  };
}
