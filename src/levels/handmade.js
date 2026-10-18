import {
  UP, box, seg, poly, circ, B, pegGrid, bumper, spinner, crossSpinner, slider,
  sand, water, lava, conveyor, boost, portal,
} from './build.js';

const CYAN = '#36E0FF', AMBER = '#FFB020';

// ---------- World 1: Breezy Park ----------
const park = [
  { w: 4.4, h: 8.2, rt: 2.2, rb: 0.6, hole: [0, -2.5], ball: [0, 2.9], coins: [[0, 0.2]],
    hint: 'Drag back anywhere, aim, and let go' },
  { w: 4.4, h: 8.6, rt: 0.7, rb: 0.7, hole: [0, -2.9], ball: [0, 3.0], hint: 'Bounce it off the walls',
    bodies: [B({ parts: [box(0, -0.9, 1.6, 0.34)] })] },
  { w: 4.8, h: 9, rt: 2.4, rb: 0.6, hole: [0.3, -3.0], ball: [0, 3.2], hint: 'Time your shot past the spinner',
    bodies: spinner(-0.7, -0.4, 2.4, 1.4, { hub: 0.24 }) },
  { w: 4.6, h: 9, rt: 2.3, rb: 2.3, hole: [0.375, -3.0], ball: [0.375, 3.0], hint: 'Thread the needle',
    bodies: [B({ color: 'pink', h: 0.45, parts: pegGrid([-1.5, -0.75, 0, 0.75, 1.5], [-1.5, -0.9, -0.3, 0.3, 0.9, 1.5], 0.09) })] },
  { w: 4.6, h: 9, rt: 0.6, rb: 0.6, hole: [0, -3.0], ball: [0, 3.1],
    bodies: [B({ parts: [box(-1.5, -0.3, 1.8, 0.34), box(1.5, -0.3, 1.8, 0.34)] }), slider(0, -1.4, 1.1, 1.4, 1.7)] },
  { w: 4.8, h: 9.2, rt: 2.4, rb: 2.4, hole: [1.0, -3.1], ball: [1.0, 3.1],
    bodies: crossSpinner(0, -0.3, 3.0, 1.0, { hub: 0.5, thick: 0.3 }) },
  { w: 4.6, h: 9.4, rt: 0.6, rb: 2.3, hole: [0, -3.2], ball: [0, 3.3],
    bodies: [B({ parts: [seg(-2.4, 0.9, -0.5, -0.4), seg(2.4, 0.9, 0.5, -0.4)] }), slider(0, -1.5, 1.0, 1.3, 2.0)] },
  { w: 4.6, h: 8.8, rt: 0.5, rb: 0.5, hole: [-1.0, -3.0], ball: [0.8, 3.2],
    bodies: [B({ color: 'pink', parts: [poly([[-2.4, 0.0], [-2.4, 1.5], [-0.6, 0.75]]), poly([[2.4, -2.0], [2.4, -0.5], [0.6, -1.25]])] })] },
  { w: 4.8, h: 9.6, rt: 2.4, rb: 0.6, hole: [0, -3.3], ball: [0, 3.5],
    bodies: [...spinner(-0.85, 1.0, 2.1, 1.6, { hub: 0.2, thick: 0.28 }), ...spinner(0.85, -1.1, 2.1, -1.6, { hub: 0.2, thick: 0.28 })] },
  { w: 4.4, h: 9, rt: 2.2, rb: 0.6, hole: [0, -2.9], ball: [0, 3.2],
    bodies: [B({ parts: [circ(-1.4, 0.6, 0.2), circ(-0.55, 0.6, 0.2), circ(0.55, 0.6, 0.2), circ(1.4, 0.6, 0.2)] }), slider(0, -2.0, 0.9, 1.1, 2.2)] },
  { w: 4.6, h: 9, rt: 2.3, rb: 0.6, hole: [0, -1.9], ball: [0, 3.2], hint: 'Bank it in off the side wall',
    bodies: [B({ parts: [box(0.2, -1.15, 1.1, 0.26), box(0.62, -1.75, 0.26, 1.0)] })] },
];
const parkBoss = {
  name: 'The Gauntlet', boss: true, lockHole: true,
  w: 5.0, h: 10, rt: 2.5, rb: 0.6, hole: [0, -3.6], ball: [0, 4.0],
  keys: [[-1.6, -1.2], [1.6, 0.9]],
  hint: 'Boss hole: grab both keys to open the cup. Keys stay collected',
  bodies: [...spinner(0, -1.6, 2.2, 1.3), slider(0, 1.9, 1.1, 1.5, 1.6), B({ parts: [circ(-0.8, 0.2, 0.2), circ(0.8, 0.2, 0.2)] })],
};

// ---------- World 2: Dune Drive ----------
const dunes = [
  { w: 4.6, h: 9, rt: 2.3, rb: 0.6, hole: [0, -3.0], ball: [0, 3.1], hint: 'Sand slows the ball. Hit it harder',
    zones: [sand(0, -0.3, 3.4, 1.8)] },
  { w: 4.6, h: 9, rt: 0.6, rb: 0.6, hole: [-1.2, -3.0], ball: [0.9, 3.2], hint: 'Bumpers kick the ball back hard',
    bodies: [bumper(0, -0.6), bumper(-1.1, 0.5), bumper(1.1, 0.5)], zones: [sand(1.2, -2.6, 1.6, 1.2)] },
  { w: 4.8, h: 9.4, rt: 2.4, rb: 0.6, hole: [0, -3.2], ball: [0, 3.3], hint: 'Stay out of the water',
    zones: [water(-1.3, 0, 2.4, 1.6), water(1.5, -1.4, 1.8, 1.2), sand(0, -2.4, 2.0, 0.9)],
    bodies: [slider(0, 1.6, 1.0, 1.4, 1.5)] },
];
const dunesBoss = {
  name: 'Sandstorm', boss: true, lockHole: true,
  w: 5.0, h: 10, rt: 2.5, rb: 2.5, hole: [0, -3.7], ball: [0, 3.9],
  keys: [[-1.7, -0.4], [1.7, -2.2]],
  hint: 'Boss hole: collect both keys, then sink it',
  zones: [sand(0, 0.9, 4.6, 1.0), water(1.1, -0.6, 1.2, 1.0)],
  bodies: [bumper(-0.6, -1.6), bumper(0.6, -1.6), bumper(0, -0.6, 0.26), ...spinner(-1.5, 2.4, 1.3, 1.4)],
};

// ---------- World 3: Frostbite (low friction) ----------
const frost = [
  { w: 4.4, h: 9, rt: 2.2, rb: 0.6, hole: [0.8, -2.9], ball: [0, 3.1], hint: 'Ice is slippery. A soft touch goes a long way',
    bodies: [B({ parts: [circ(-1.3, 0, 0.22), circ(1.5, 0.4, 0.22)] })] },
  { w: 4.6, h: 10, rt: 2.3, rb: 0.6, hole: [0, -3.8], ball: [0, 4.0], hint: 'Boost pads fire the ball forward',
    zones: [boost(0, 0.6, 1.2, 1.0, UP)],
    bodies: [B({ parts: [box(-1.5, -0.8, 1.8, 0.34), box(1.5, -0.8, 1.8, 0.34)] })] },
  { w: 4.8, h: 9.4, rt: 0.6, rb: 0.6, hole: [-1.2, -3.1], ball: [0.8, 3.3], hint: 'Belts drag the ball sideways. Aim upstream',
    zones: [conveyor(0, 0, 4.9, 1.3, 0, 7)] },
];
const frostBoss = {
  name: 'Glacier', boss: true, lockHole: true,
  w: 5.0, h: 10.4, rt: 2.5, rb: 0.6, hole: [0, -3.9], ball: [0, 4.2],
  keys: [[-1.8, 1.2], [1.8, -1.6]],
  hint: 'Boss hole: two keys, two belts, one cup',
  zones: [conveyor(0, 0.2, 5.1, 1.0, 0, 6), conveyor(0, -2.4, 5.1, 0.9, Math.PI, 6), boost(-1.6, 2.6, 1.0, 0.9, UP)],
  bodies: [bumper(0, -1.1), bumper(1.2, 2.0, 0.24)],
};

// ---------- World 4: Neon Night ----------
const neon = [
  { w: 4.6, h: 9.4, rt: 2.3, rb: 0.6, hole: [0.1, -3.1], ball: [0, 3.3], hint: 'Portals teleport the ball. Speed and direction carry through',
    bodies: [B({ parts: [box(0, 0, 4.8, 0.34)] })], portals: [portal(-1.2, 1.2, 1.2, -1.2, CYAN)] },
  { w: 4.6, h: 9, rt: 2.3, rb: 0.6, hole: [0, -2.9], holeMove: { dx: 1, dz: 0, amp: 1.2, speed: 1.1 }, ball: [0, 3.1],
    hint: 'The hole moves. Lead your shot',
    bodies: [B({ parts: [circ(-1.0, 0.3, 0.2), circ(1.0, 0.3, 0.2)] })] },
  { w: 4.8, h: 10, rt: 0.6, rb: 0.6, hole: [-1.4, -3.8], ball: [1.4, 4.0],
    bodies: [B({ parts: [box(-0.9, 0.2, 3.2, 0.34)] }), B({ parts: [box(0.9, -1.6, 3.2, 0.34)] }), bumper(1.5, -0.7), bumper(-1.6, -2.6, 0.24)],
    portals: [portal(-1.6, 1.6, 1.4, -2.8, AMBER)] },
];
const neonBoss = {
  name: 'Wormhole', boss: true, lockHole: true,
  w: 5.0, h: 10.4, rt: 2.5, rb: 0.6, hole: [0, -4.0], holeMove: { dx: 1, dz: 0, amp: 0.9, speed: 0.9 }, ball: [0, 4.2],
  keys: [[-1.8, -1.4], [1.8, -1.4]],
  hint: 'Boss hole: pick a portal, grab the keys',
  bodies: [B({ parts: [box(0, 0.6, 5.2, 0.34)] }), ...spinner(0, -1.4, 2.0, 1.4)],
  portals: [portal(-1.6, 2.0, 1.6, -0.4, CYAN), portal(1.6, 2.0, -1.6, -0.4, AMBER)],
  zones: [conveyor(0, -2.6, 5.1, 0.8, Math.PI, 5)],
};

// ---------- World 5: Lava Works ----------
const lavaWorks = [
  { w: 4.6, h: 9, rt: 2.3, rb: 0.6, hole: [0, -3.0], ball: [0, 3.1], hint: 'Lava ends your shot. Go around it',
    zones: [lava(0, -0.2, 2.2, 1.8)] },
  { w: 4.8, h: 9.6, rt: 0.6, rb: 2.4, hole: [0, -3.4], ball: [0, 3.4], hint: 'Cross the bridge when the block moves',
    zones: [lava(-1.5, -0.4, 1.9, 3.0), lava(1.5, -0.4, 1.9, 3.0)],
    bodies: [slider(0, 1.55, 1.0, 1.3, 1.7)] },
  { w: 4.8, h: 10, rt: 2.4, rb: 0.6, hole: [0.9, -3.6], ball: [-0.6, 3.9], hint: 'The only way across is through',
    zones: [lava(0, 0, 4.9, 1.4), boost(-1.4, 2.2, 1.0, 0.9, UP)],
    portals: [portal(1.4, 1.6, -1.2, -1.6, AMBER)], bodies: [bumper(0.2, -2.1)] },
];
const lavaBoss = {
  name: 'The Core', boss: true, lockHole: true,
  w: 5.0, h: 10.6, rt: 2.5, rb: 2.5, hole: [0, -4.1], ball: [0, 4.3],
  keys: [[-1.8, 0.9], [1.6, -2.0]],
  hint: 'Final boss: two keys, a lot of lava',
  zones: [lava(0, -0.6, 2.0, 1.4), lava(-1.6, -2.4, 1.4, 1.0), conveyor(0, 2.0, 5.1, 0.9, Math.PI, 5)],
  bodies: [...spinner(1.3, 0.9, 1.5, 1.5, { hub: 0.18, thick: 0.26 })],
  portals: [portal(1.9, 2.9, -1.9, -1.0, CYAN)],
};

// Per world: the opening holes, then generated holes fill the gap up to the boss.
export const HANDMADE = [
  { intro: park, boss: parkBoss },
  { intro: dunes, boss: dunesBoss },
  { intro: frost, boss: frostBoss },
  { intro: neon, boss: neonBoss },
  { intro: lavaWorks, boss: lavaBoss },
];
