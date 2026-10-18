// Game name lives here so a rename is a one-line change (also update index.html <title> and the manifest).
export const GAME_NAME = 'Holeshot';

export const R = 0.17;          // ball radius (world units)
export const HOLE_R = 0.34;
export const RIM_T = 0.26;      // course rim thickness
export const RIM_H = 0.42;
export const WALL_E = 0.78;     // restitution
export const BODY_E = 0.72;
export const BUMPER_KICK = 4.2;
export const MAX_SPEED = 18;
export const PICKUP_R = 0.32;
export const PORTAL_R = 0.3;

export const PHYS_H = 1 / 480;  // fixed physics step, so a shot plays out the same at any refresh rate

// Graphics tiers, best first. Auto starts at the remembered tier and steps down while frames run slow.
export const QUALITY = [
  { dpr: 2, shadow: 2048, blur: true },
  { dpr: 1.5, shadow: 2048, blur: true },
  { dpr: 1.25, shadow: 1024, blur: false },
  { dpr: 1, shadow: 1024, blur: false },
];

export const HOLES_PER_WORLD = 12; // the last hole of each world is the boss
export const COIN_VALUE = 5;
export const STAR_VALUE = 10;
export const DAILY_REWARD = 100;
export const ENDLESS_BALLS = 5;
export const SKIP_AFTER = 4;

export const WORLDS = [
  {
    id: 'park', name: 'Breezy Park', blurb: 'Spinners, sliders and pegs', floorStyle: 'lawn', friction: 1,
    palettes: [
      { bg: '#2B7FC4', floor: '#5AAEE8', lip: '#3F8FCB' },
      { bg: '#1F9446', floor: '#43C268', lip: '#2EA352' },
    ],
    pool: ['spinner', 'cross', 'twin', 'sweeper', 'gate', 'pegs', 'tris'],
  },
  {
    id: 'dunes', name: 'Dune Drive', blurb: 'Sand traps, bumpers and oases', floorStyle: 'dunes', friction: 1,
    palettes: [
      { bg: '#D86A0C', floor: '#F59633', lip: '#DE7C1C' },
      { bg: '#C2530F', floor: '#F2A54E', lip: '#D27420' },
    ],
    pool: ['sand', 'bumpers', 'water', 'spinner', 'sweeper', 'gate', 'tris', 'bumpers', 'sand'],
  },
  {
    id: 'frost', name: 'Frostbite', blurb: 'Slippery ice, boost pads and belts', floorStyle: 'ice', friction: 0.45,
    palettes: [
      { bg: '#1C6FA8', floor: '#9AD8F2', lip: '#62B0DA' },
      { bg: '#2A5FBF', floor: '#B4E2F8', lip: '#78BDE6' },
    ],
    pool: ['boost', 'conveyor', 'bumpers', 'spinner', 'gate', 'sweeper', 'conveyor', 'pegs'],
  },
  {
    id: 'neon', name: 'Neon Night', blurb: 'Portals and moving holes', floorStyle: 'grid', friction: 1, movingHole: 0.45,
    palettes: [
      { bg: '#22164F', floor: '#4429A0', lip: '#B26BFF' },
      { bg: '#1A1245', floor: '#3A2794', lip: '#FF5FD2' },
    ],
    pool: ['portal', 'bumpers', 'conveyor', 'spinner', 'cross', 'sweeper', 'portal', 'twin'],
  },
  {
    id: 'lava', name: 'Lava Works', blurb: 'Lava, plus everything else', floorStyle: 'basalt', friction: 1, movingHole: 0.25,
    palettes: [
      { bg: '#36121C', floor: '#5E3440', lip: '#FF7A2E' },
      { bg: '#2B0F17', floor: '#563040', lip: '#FF9A3C' },
    ],
    pool: ['lava', 'portal', 'boost', 'bumpers', 'sweeper', 'spinner', 'conveyor', 'lava', 'gate'],
  },
];

export const BALLS = [
  { id: 'classic', name: 'Sunny', price: 0 },
  { id: 'snow', name: 'Snowball', price: 60 },
  { id: 'eight', name: 'Eight Ball', price: 120 },
  { id: 'beach', name: 'Beach Ball', price: 180 },
  { id: 'melon', name: 'Watermelon', price: 240 },
  { id: 'soccer', name: 'Striker', price: 300 },
  { id: 'mars', name: 'Red Planet', price: 380 },
  { id: 'disco', name: 'Disco', price: 460 },
  { id: 'eye', name: 'Eyeball', price: 550 },
  { id: 'magma', name: 'Magma', price: 650 },
  { id: 'rainbow', name: 'Prism', price: 800 },
  { id: 'galaxy', name: 'Galaxy', price: 1000 },
];

export const TRAILS = [
  { id: 'none', name: 'None', price: 0 },
  { id: 'ribbon', name: 'Ribbon', price: 80 },
  { id: 'sparkle', name: 'Sparkle', price: 160 },
  { id: 'bubbles', name: 'Bubbles', price: 240 },
  { id: 'rainbow', name: 'Rainbow', price: 360 },
  { id: 'fire', name: 'Fire', price: 500 },
];
