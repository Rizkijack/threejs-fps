// BREACHPOINT's look plan, one place. A cold-store depot at blue hour: wet steel, sodium
// lamps, one warm accent. Vanguard (you) carries amber; Warden (the bots) carries cyan.
// Every mesh material and every HUD colour comes from these names, so the game never
// invents a shade outside its own palette.
export const COLORS = {
  night: '#0a151a',
  fog: '#0f1e24',
  deck: '#18272e',
  steel: '#22363f',
  steelLift: '#2d4751',
  steelHigh: '#5b7d89',
  hair: '#3d5d68',
  bone: '#e7e2d4',
  muted: '#8ba1a6',
  vanguard: '#f2892e',
  warden: '#41c9cd',
  charge: '#ff5238',
  money: '#f2c14b',
  ok: '#63d98d',
};

// A short label for each team, used by the HUD and the round logic.
export const TEAM = {
  vanguard: { name: 'VANGUARD', color: COLORS.vanguard },
  warden: { name: 'WARDEN', color: COLORS.warden },
};
