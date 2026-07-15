// taxonomy default-v1 — the fixed scaffold the tree grows on.
//
// Additive-only per docs/04 §versioning: sectors may be *added* (from the
// reserved azimuth space) freely; a rename/merge needs a migration note and a
// new taxonomy id (default-v2). The renderer receives az/hue/limb through
// tree.json, so it never imports this file — this is generator-only config.
//
// az    — compass azimuth (degrees) the sector's bough grows toward.
// hue   — base color (0xRRGGBB) for limb/leaves/fireflies of this sector.
// limb  — the CREATE / AUTOMATE / DISTRIBUTE / BUILD arc it belongs to.
// label — short human name (build.pro-code -> pro-code) carried into tree.json.

export const TAXONOMY_VERSION = 'default-v1';

// order is authoritative: the array index is the sector's aSector value in the
// renderer (0..N-1, currently 0..9). Never reorder — append only.
export const SECTORS = [
  { id: 'create.copy',        label: 'copy',      limb: 'CREATE',     az: 15,  hue: 0xffb454 },
  { id: 'create.images',      label: 'images',    limb: 'CREATE',     az: 55,  hue: 0xff6ec7 },
  { id: 'create.video',       label: 'video',     limb: 'CREATE',     az: 95,  hue: 0xff5d73 },
  { id: 'automate.workflows', label: 'workflows', limb: 'AUTOMATE',   az: 140, hue: 0x7ce65a },
  { id: 'distribute.seo',     label: 'seo',       limb: 'DISTRIBUTE', az: 185, hue: 0x35d0ba },
  { id: 'distribute.geo',     label: 'geo',       limb: 'DISTRIBUTE', az: 225, hue: 0x4aa8ff },
  { id: 'build.no-code',      label: 'no-code',   limb: 'BUILD',      az: 270, hue: 0xb59aff },
  { id: 'build.low-code',     label: 'low-code',  limb: 'BUILD',      az: 310, hue: 0x8f7bff },
  { id: 'build.pro-code',     label: 'pro-code',  limb: 'BUILD',      az: 350, hue: 0x6a8dff },
  // Appended index 9 (append-only rule above). CREATE limb, so az sits inside the
  // CREATE arc (< 117.5, the CREATE/AUTOMATE minimap edge) even though it's last in
  // the array — az is a growth direction, independent of array index.
  { id: 'create.3d',          label: '3d',        limb: 'CREATE',     az: 115, hue: 0xff8f4d },
];

// the four strata (Section levels x forest stratification). y-bands gate height;
// a sector may only grow into a band once a milestone raises its level.
export const STRATA = [
  { name: 'Forest floor', level: 'Novice',       y0: 0,    y1: 3.0,  tint: 0x5aa66a },
  { name: 'Understory',   level: 'Experimenter', y0: 3.0,  y1: 7.0,  tint: 0x4fd8c4 },
  { name: 'Canopy',       level: 'Practitioner', y0: 7.0,  y1: 12.0, tint: 0xffcf6e },
  { name: 'Emergent',     level: 'Expert',       y0: 12.0, y1: 16.5, tint: 0xe8ecff },
];

export const TAXONOMIES = { 'default-v1': { version: 'default-v1', sectors: SECTORS, strata: STRATA } };

export function getTaxonomy(name = 'default-v1') {
  const t = TAXONOMIES[name];
  if (!t) throw new Error(`unknown taxonomy "${name}" (have: ${Object.keys(TAXONOMIES).join(', ')})`);
  return t;
}
