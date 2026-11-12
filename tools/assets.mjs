// Rebuilds assets/*.glb from the upstream CC0 KayKit packs (https://github.com/KayKit-Game-Assets).
//   node tools/assets.mjs <dir containing the cloned pack repos>
// Needed packs: Character-Pack-Adventures-1.0, Character-Pack-Skeletons-1.0, Dungeon-Remastered-1.0,
// Medieval-Hexagon-Pack-1.0, Halloween-Bits-1.0. The trimmed outputs are committed, so this is only
// needed when changing which models or animations the game uses.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, quantize, resample, mergeDocuments, unpartition } from '@gltf-transform/functions';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = process.argv[2]; if (!src) { console.error('usage: node tools/assets.mjs <packs dir>'); process.exit(1); }
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets'); mkdirSync(out, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const P = {
  ch: join(src, 'KayKit-Character-Pack-Adventures-1.0/addons/kaykit_character_pack_adventures'),
  sk: join(src, 'KayKit-Character-Pack-Skeletons-1.0/addons/kaykit_character_pack_skeletons'),
  dg: join(src, 'KayKit-Dungeon-Remastered-1.0/addons/kaykit_dungeon_remastered/Assets/gltf'),
  hx: join(src, 'KayKit-Medieval-Hexagon-Pack-1.0/addons/kaykit_medieval_hexagon_pack/Assets/gltf'),
  hw: join(src, 'KayKit-Halloween-Bits-1.0/addons/kaykit_halloween_bits/Assets/gltf')
};
const ANIMS = ['Idle', 'Running_A', '1H_Melee_Attack_Chop', '1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Slice_Horizontal', '2H_Melee_Attack_Spinning',
  '2H_Ranged_Shoot', 'Spellcast_Shoot', 'Spellcast_Raise', 'Hit_A', 'Hit_B', 'Block_Hit', 'Death_A', 'Death_B', 'Use_Item', 'Cheer', 'PickUp'];
const drop = a => { for (const c of a.listChannels()) c.dispose(); for (const s of a.listSamplers()) s.dispose(); a.dispose(); };
const kb = f => (statSync(f).size / 1024).toFixed(0) + ' KB';

// ---- characters: the knight carries the shared animation set, everyone else is mesh + skeleton only ----
const CHARS = { knight: [P.ch, 'Knight'], mage: [P.ch, 'Mage'], rogue: [P.ch, 'Rogue_Hooded'], barbarian: [P.ch, 'Barbarian'],
  sk_warrior: [P.sk, 'Skeleton_Warrior'], sk_mage: [P.sk, 'Skeleton_Mage'], sk_rogue: [P.sk, 'Skeleton_Rogue'], sk_minion: [P.sk, 'Skeleton_Minion'] };
for (const [name, [dir, file]] of Object.entries(CHARS)) {
  const doc = await io.read(join(dir, 'Characters/gltf', file + '.glb'));
  for (const a of doc.getRoot().listAnimations()) if (name !== 'knight' || !ANIMS.includes(a.getName())) drop(a);
  await doc.transform(resample(), prune(), dedup(), quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeTexcoord: 12 }));
  const f = join(out, name + '.glb'); await io.write(f, doc); console.log(name, kb(f));
}

// ---- environment + loose weapons: every model becomes one named root node in a single file ----
const ENV = {
  dg: ['wall', 'wall_broken', 'wall_cracked', 'wall_half', 'wall_endcap', 'pillar', 'pillar_decorated', 'column', 'barrier', 'rubble_half', 'rubble_large',
    'floor_tile_large', 'floor_tile_small', 'floor_tile_small_broken_A', 'floor_tile_small_broken_B', 'floor_tile_small_weeds_A', 'floor_tile_small_weeds_B', 'floor_tile_small_decorated',
    'floor_foundation_allsides', 'torch_mounted', 'barrel_large', 'barrel_small_stack', 'box_large', 'box_small', 'crates_stacked', 'keg', 'trunk_large_A', 'chest_gold', 'coin_stack_small',
    'plate_food_A', 'plate_food_B', 'bottle_A_labeled_green', 'table_long_decorated_A', 'chest', 'coin_stack_medium', 'wall_arched', 'banner_patternA_red', 'banner_patternB_blue', 'banner_patternC_yellow', 'banner_shield_green', 'sword_shield_gold', 'stairs_wide'],
  hw: ['pillar', 'arch', 'post_lantern', 'lantern_standing', 'shrine_candles', 'tree_dead_large', 'tree_pine_orange_large', 'tree_pine_yellow_medium', 'gravestone', 'fence', 'crypt', 'skull_candle'],
  'hx/decoration/nature': ['tree_single_A', 'tree_single_B', 'tree_single_A_cut', 'trees_A_large', 'trees_B_large', 'rock_single_A', 'rock_single_C', 'rock_single_E', 'mountain_A', 'mountain_A_grass_trees', 'mountain_B', 'mountain_C_grass',
    'hills_A_trees', 'hills_B_trees', 'cloud_big', 'cloud_small', 'waterplant_A', 'waterlily_A', 'waterlily_B'],
  'hx/decoration/props': ['tent', 'flag_red', 'flag_blue', 'weaponrack', 'target', 'sack', 'bucket_arrows', 'resource_stone', 'resource_lumber', 'crate_A_big', 'barrel', 'wheelbarrow'],
  'hx/buildings/blue': ['building_castle_blue', 'building_tower_A_blue', 'building_home_A_blue', 'building_home_B_blue', 'building_tavern_blue', 'building_blacksmith_blue', 'building_market_blue', 'building_church_blue', 'building_well_blue', 'building_windmill_blue', 'building_mine_blue', 'building_lumbermill_blue'],
  'hx/buildings/red': ['building_home_A_red', 'building_home_B_red'], 'hx/buildings/neutral': ['wall_straight', 'wall_straight_gate', 'fence_stone_straight', 'building_destroyed'],
  'ch/Assets/gltf': ['arrow'], 'sk/Assets/gltf': ['Skeleton_Blade', 'Skeleton_Axe', 'Skeleton_Crossbow', 'Skeleton_Staff', 'Skeleton_Shield_Large_A', 'Skeleton_Shield_Small_B']
};
let env = null;
for (const [group, names] of Object.entries(ENV)) {
  const [pk, ...rest] = group.split('/'), dir = join(P[pk], ...rest), prefix = pk === 'hw' ? 'hw_' : '';
  for (const n of names) {
    const f = [join(dir, n + '.gltf.glb'), join(dir, n + '.glb'), join(dir, n + '.gltf')].find(existsSync); if (!f) { console.warn('missing', group, n); continue; }
    const doc = await io.read(f), root = doc.getRoot(), scene = root.listScenes()[0], tops = scene.listChildren();
    for (const a of root.listAnimations()) drop(a);
    let top = tops[0];
    if (tops.length !== 1) { top = doc.createNode(); for (const t of tops) top.addChild(t); scene.addChild(top); }
    top.setName(prefix + n);
    if (!env) env = doc; else mergeDocuments(env, doc);
  }
}
// collapse to one scene and one buffer
const root = env.getRoot(), main = root.listScenes()[0];
for (const s of root.listScenes().slice(1)) { for (const c of s.listChildren()) main.addChild(c); s.dispose(); }
await env.transform(unpartition(), dedup(), prune({ keepLeaves: false }), quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeTexcoord: 12 }));
const f = join(out, 'env.glb'); await io.write(f, env);
console.log('env', kb(f), 'nodes', main.listChildren().length, 'textures', root.listTextures().map(t => t.getName() + ':' + (t.getImage().length / 1024).toFixed(0) + 'KB').join(' '), 'materials', root.listMaterials().length);
