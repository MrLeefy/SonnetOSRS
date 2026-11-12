/* Offline story quests: explicitly accepted at an NPC, then completed at that NPC.
   Quest data only is persisted; all progress is derived from the current inventory
   or the counters captured when a quest begins. */
import { countItem } from './items.js';

export const QUESTS = [
  { id: 'smith', name: "The Smith's Commission", giver: 'smith', points: 1,
    story: 'The town smith needs iron and timber to reinforce the old gates.',
    items: { ore: 8, logs: 4 }, counts: {},
    reward: { coins: 175, items: [{ id: 'blade1', n: 1 }] } },
  { id: 'hearth', name: 'The Hearthkeeper', giver: 'merchant', requires: 'smith', points: 1,
    story: 'The market needs a supply of cooked trout and woodland herbs for passing travellers.',
    items: { trout: 3, herbs: 2 }, counts: {},
    reward: { coins: 240, items: [{ id: 'tonic', n: 3 }] } },
  { id: 'barrow', name: 'Restless in the Barrow', giver: 'banker', requires: 'hearth', points: 2,
    story: 'The vault keeper offers a bounty to anyone who drives the undead back to their graves.',
    items: {}, counts: { undead: 5, bossKills: 1 },
    reward: { coins: 650, items: [{ id: 'robe2', n: 1 }, { id: 'roast', n: 3 }] } }
];
const counter = (save, key) => key === 'bossKills' ? (save.bossKills || 0) : ((save.count || {})[key] || 0);
export function questStatus(q, save, inv) {
  const quests = save.quests || {}, state = quests[q.id];
  if (state && state.done) return { state: 'done', progress: 'Completed' };
  if (!state) return { state: q.requires && !quests[q.requires]?.done ? 'locked' : 'available', progress: q.story };
  const lines = [], base = state.start || {};
  let ready = true;
  for (const [id, needed] of Object.entries(q.items)) {
    const have = countItem(inv || [], id);
    lines.push(id + ': ' + Math.min(have, needed) + '/' + needed);
    if (have < needed) ready = false;
  }
  for (const [key, needed] of Object.entries(q.counts)) {
    const have = Math.max(0, counter(save, key) - (base[key] || 0));
    lines.push((key === 'bossKills' ? 'Wardens' : 'Undead') + ': ' + Math.min(have, needed) + '/' + needed);
    if (have < needed) ready = false;
  }
  return { state: ready ? 'ready' : 'active', progress: lines.join(' · ') };
}
