//! Server-owned ground items: drops, PvP death piles, pickup rights and despawn.
//!
//! Everything that matters here is decided by Rust. The browser only sends
//! `drop { index }` and `pickup { uid }` intentions and displays the list of
//! items it is allowed to see.

use crate::economy::{
    inventory_add, item_info, InventoryItem, INVENTORY_SLOTS,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Ticks (600 ms each) an item is visible/pickable only by its owner: 60 s.
pub const PRIVATE_TICKS: u32 = 100;
/// Total lifetime of a ground item, including the private window: 3 minutes.
pub const LIFETIME_TICKS: u32 = 300;
/// Hard cap on simultaneous ground items in the whole world.
pub const MAX_GROUND_ITEMS: usize = 512;
/// Cap on distinct ground stacks a single owner may have at once.
pub const MAX_PER_OWNER: usize = 100;
/// Items a player keeps on a PvP death (one more with Protect Item).
pub const KEEP_ON_DEATH: usize = 3;
/// Chebyshev tile distance a player may pick up from.
pub const PICKUP_RANGE: i32 = 1;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct GroundItem {
    pub uid: u64,
    pub id: String,
    /// Stack size, potion doses, or 1 — same meaning as `InventoryItem::amount`.
    pub amount: u32,
    pub x: i32,
    pub y: i32,
    /// Resume token of the owner. Never sent to clients. `None` = public.
    pub owner: Option<String>,
    /// Ticks left before a private item becomes public.
    pub private_left: u32,
    /// Ticks left before the item despawns.
    pub life_left: u32,
}

#[derive(Clone, Debug, Serialize)]
pub struct GroundView {
    pub uid: u64,
    pub id: String,
    pub amount: u32,
    pub x: i32,
    pub y: i32,
    /// True while only the owner can see/take it.
    pub mine: bool,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct GroundState {
    #[serde(default)]
    pub items: Vec<GroundItem>,
    #[serde(default)]
    pub next_uid: u64,
}

impl GroundItem {
    pub fn visible_to(&self, token: &str) -> bool {
        match &self.owner {
            None => true,
            Some(owner) => owner == token || self.private_left == 0,
        }
    }
}

impl GroundState {
    /// Place an item on the ground. Stackables merge with a matching stack
    /// (same item, tile, owner) and keep the older timers, so re-dropping can
    /// not keep an item alive forever.
    pub fn spawn(
        &mut self,
        id: &str,
        amount: u32,
        x: i32,
        y: i32,
        owner: Option<&str>,
    ) -> Result<(), &'static str> {
        self.spawn_with(id, amount, x, y, owner, true)
    }

    /// Death piles must never destroy items because a cap was hit, so they
    /// bypass the world/owner caps (they still despawn on the normal timer).
    pub fn spawn_death(
        &mut self,
        id: &str,
        amount: u32,
        x: i32,
        y: i32,
        owner: Option<&str>,
    ) -> Result<(), &'static str> {
        self.spawn_with(id, amount, x, y, owner, false)
    }

    fn spawn_with(
        &mut self,
        id: &str,
        amount: u32,
        x: i32,
        y: i32,
        owner: Option<&str>,
        enforce_caps: bool,
    ) -> Result<(), &'static str> {
        let Some(info) = item_info(id) else {
            return Err("That item does not exist.");
        };
        if amount == 0 {
            return Err("Nothing to drop.");
        }
        if info.stackable {
            if let Some(existing) = self.items.iter_mut().find(|g| {
                g.id == id && g.x == x && g.y == y && g.owner.as_deref() == owner
            }) {
                return match existing.amount.checked_add(amount) {
                    Some(n) => {
                        existing.amount = n;
                        Ok(())
                    }
                    None => Err("That stack is too large."),
                };
            }
        }
        if enforce_caps && self.items.len() >= MAX_GROUND_ITEMS {
            return Err("There are too many items on the ground.");
        }
        if let (true, Some(owner)) = (enforce_caps, owner) {
            let mine = self
                .items
                .iter()
                .filter(|g| g.owner.as_deref() == Some(owner))
                .count();
            if mine >= MAX_PER_OWNER {
                return Err("You have too many items on the ground.");
            }
        }
        self.next_uid = self.next_uid.saturating_add(1);
        self.items.push(GroundItem {
            uid: self.next_uid,
            id: id.to_string(),
            amount,
            x,
            y,
            owner: owner.map(str::to_string),
            private_left: if owner.is_some() { PRIVATE_TICKS } else { 0 },
            life_left: LIFETIME_TICKS,
        });
        Ok(())
    }

    /// Drop the whole inventory slot. Atomic: the slot is only cleared once
    /// the ground item exists.
    pub fn drop_slot(
        &mut self,
        inv: &mut [Option<InventoryItem>],
        index: usize,
        x: i32,
        y: i32,
        owner: &str,
    ) -> Result<(), &'static str> {
        if index >= INVENTORY_SLOTS || index >= inv.len() {
            return Err("That inventory slot is invalid.");
        }
        let Some(item) = inv[index].clone() else {
            return Err("There is nothing in that slot.");
        };
        self.spawn(&item.id, item.amount, x, y, Some(owner))?;
        inv[index] = None;
        Ok(())
    }

    /// Pick an item up. Validates visibility, range and inventory space; the
    /// ground item is removed only if the inventory accepted it.
    pub fn pickup(
        &mut self,
        inv: &mut Vec<Option<InventoryItem>>,
        uid: u64,
        token: &str,
        px: i32,
        py: i32,
    ) -> Result<(), &'static str> {
        let Some(pos) = self.items.iter().position(|g| g.uid == uid) else {
            return Err("Too late - it's gone!");
        };
        let g = &self.items[pos];
        if !g.visible_to(token) {
            return Err("Too late - it's gone!");
        }
        if (g.x - px).abs().max((g.y - py).abs()) > PICKUP_RANGE {
            return Err("You can't reach that.");
        }
        let info = item_info(&g.id).ok_or("That item does not exist.")?;
        let ok = if info.stackable {
            inventory_add(inv, &g.id, g.amount, 0)
        } else if info.doses > 0 {
            inventory_add(inv, &g.id, 1, g.amount)
        } else {
            inventory_add(inv, &g.id, 1, 0)
        };
        if !ok {
            return Err("You don't have enough inventory space.");
        }
        self.items.remove(pos);
        Ok(())
    }

    /// Advance timers one tick. Returns true when anything visible changed
    /// (an item vanished or became public), so clients should be re-synced.
    pub fn tick(&mut self) -> bool {
        let mut changed = false;
        for g in &mut self.items {
            g.life_left = g.life_left.saturating_sub(1);
            if g.private_left > 0 {
                g.private_left -= 1;
                if g.private_left == 0 {
                    // Visibility flipped from owner-only to everybody.
                    changed = true;
                }
            }
        }
        let before = self.items.len();
        self.items.retain(|g| g.life_left > 0);
        changed || self.items.len() != before
    }

    pub fn view_for(&self, token: &str) -> Vec<GroundView> {
        self.items
            .iter()
            .filter(|g| g.visible_to(token))
            .map(|g| GroundView {
                uid: g.uid,
                id: g.id.clone(),
                amount: g.amount,
                x: g.x,
                y: g.y,
                mine: g.owner.as_deref() == Some(token) && g.private_left > 0,
            })
            .collect()
    }

    /// Drop sanity after loading persisted data: unknown items are discarded.
    pub fn sanitize(&mut self) {
        self.items
            .retain(|g| item_info(&g.id).is_some() && g.amount > 0 && g.life_left > 0);
        let max = self.items.iter().map(|g| g.uid).max().unwrap_or(0);
        self.next_uid = self.next_uid.max(max);
    }
}

/// Split a dying player's belongings into what they keep and what is lost.
/// The `keep` most valuable items (by unit guide price; a stack counts as one
/// item and is kept whole) stay with the player. Everything else is removed
/// from the inventory/equipment and returned as `(id, amount)` for the drop.
pub fn take_death_loot(
    inv: &mut [Option<InventoryItem>],
    equipment: &mut HashMap<String, InventoryItem>,
    keep: usize,
) -> Vec<(String, u32)> {
    #[derive(Clone)]
    enum Place {
        Inv(usize),
        Eq(String),
    }
    let mut all: Vec<(u32, Place)> = Vec::new();
    for (i, slot) in inv.iter().enumerate() {
        if let Some(item) = slot {
            let price = item_info(&item.id).map(|i| i.guide_price).unwrap_or(0);
            all.push((price, Place::Inv(i)));
        }
    }
    for (slot, item) in equipment.iter() {
        let price = item_info(&item.id).map(|i| i.guide_price).unwrap_or(0);
        all.push((price, Place::Eq(slot.clone())));
    }
    // Deterministic order: most valuable first, ties by place so tests and
    // production agree.
    all.sort_by(|a, b| {
        b.0.cmp(&a.0).then_with(|| {
            let key = |p: &Place| match p {
                Place::Inv(i) => format!("0{i:03}"),
                Place::Eq(s) => format!("1{s}"),
            };
            key(&a.1).cmp(&key(&b.1))
        })
    });
    let mut lost = Vec::new();
    for (_, place) in all.into_iter().skip(keep) {
        match place {
            Place::Inv(i) => {
                if let Some(item) = inv[i].take() {
                    lost.push((item.id, item.amount));
                }
            }
            Place::Eq(slot) => {
                if let Some(item) = equipment.remove(&slot) {
                    lost.push((item.id, item.amount));
                }
            }
        }
    }
    lost
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::economy::{inventory_count, starter_equipment, starter_inventory};

    fn empty_inv() -> Vec<Option<InventoryItem>> {
        vec![None; INVENTORY_SLOTS]
    }
    fn item(id: &str, amount: u32) -> Option<InventoryItem> {
        Some(InventoryItem {
            id: id.into(),
            amount,
        })
    }

    #[test]
    fn drop_then_owner_pickup_round_trips() {
        let mut g = GroundState::default();
        let mut inv = empty_inv();
        inv[3] = item("whip", 1);
        g.drop_slot(&mut inv, 3, 10, 10, "alice").unwrap();
        assert!(inv[3].is_none());
        assert_eq!(g.items.len(), 1);
        let uid = g.items[0].uid;
        g.pickup(&mut inv, uid, "alice", 10, 11).unwrap();
        assert_eq!(inventory_count(&inv, "whip"), 1);
        assert!(g.items.is_empty());
    }

    #[test]
    fn private_items_hidden_and_untakeable_until_public() {
        let mut g = GroundState::default();
        let mut inv = empty_inv();
        inv[0] = item("whip", 1);
        g.drop_slot(&mut inv, 0, 5, 5, "alice").unwrap();
        let uid = g.items[0].uid;
        assert!(g.view_for("bob").is_empty());
        assert_eq!(g.view_for("alice").len(), 1);
        let mut bob = empty_inv();
        assert!(g.pickup(&mut bob, uid, "bob", 5, 5).is_err());
        assert!(bob.iter().all(Option::is_none), "failed pickup must not leak");
        for _ in 0..PRIVATE_TICKS {
            g.tick();
        }
        assert_eq!(g.view_for("bob").len(), 1);
        assert!(!g.view_for("bob")[0].mine);
        g.pickup(&mut bob, uid, "bob", 5, 5).unwrap();
        assert_eq!(inventory_count(&bob, "whip"), 1);
    }

    #[test]
    fn tick_reports_visibility_flip_and_despawn() {
        let mut g = GroundState::default();
        g.spawn("whip", 1, 1, 1, Some("a")).unwrap();
        let mut flips = 0;
        let mut ticks = 0;
        while !g.items.is_empty() {
            if g.tick() {
                flips += 1;
            }
            ticks += 1;
            assert!(ticks <= LIFETIME_TICKS, "must despawn");
        }
        assert_eq!(ticks, LIFETIME_TICKS);
        assert_eq!(flips, 2, "one flip to public, one despawn");
    }

    #[test]
    fn pickup_range_and_full_inventory_are_enforced_atomically() {
        let mut g = GroundState::default();
        g.spawn("whip", 1, 20, 20, None).unwrap();
        let uid = g.items[0].uid;
        let mut inv = empty_inv();
        assert!(g.pickup(&mut inv, uid, "x", 25, 25).is_err());
        let mut full = starter_inventory();
        for slot in full.iter_mut() {
            *slot = item("whip", 1);
        }
        assert!(g.pickup(&mut full, uid, "x", 20, 20).is_err());
        assert_eq!(g.items.len(), 1, "item stays when inventory is full");
    }

    #[test]
    fn stackables_merge_and_keep_original_timers() {
        let mut g = GroundState::default();
        g.spawn("coins", 100, 3, 3, Some("a")).unwrap();
        for _ in 0..10 {
            g.tick();
        }
        g.spawn("coins", 50, 3, 3, Some("a")).unwrap();
        assert_eq!(g.items.len(), 1);
        assert_eq!(g.items[0].amount, 150);
        assert_eq!(g.items[0].life_left, LIFETIME_TICKS - 10);
        // A different owner's coins do not merge.
        g.spawn("coins", 5, 3, 3, Some("b")).unwrap();
        assert_eq!(g.items.len(), 2);
    }

    #[test]
    fn dose_items_keep_their_doses_through_drop_and_pickup() {
        let mut g = GroundState::default();
        let mut inv = empty_inv();
        inv[0] = item("supatk", 2);
        g.drop_slot(&mut inv, 0, 7, 7, "a").unwrap();
        assert_eq!(g.items[0].amount, 2);
        let uid = g.items[0].uid;
        g.pickup(&mut inv, uid, "a", 7, 7).unwrap();
        assert_eq!(inv[0].as_ref().map(|i| i.amount), Some(2));
    }

    #[test]
    fn ground_caps_are_enforced() {
        let mut g = GroundState::default();
        for i in 0..MAX_PER_OWNER {
            g.spawn("whip", 1, i as i32, 0, Some("a")).unwrap();
        }
        assert!(g.spawn("whip", 1, 0, 1, Some("a")).is_err());
        for i in 0..(MAX_GROUND_ITEMS - MAX_PER_OWNER) {
            g.spawn("whip", 1, i as i32, 9, None).unwrap();
        }
        assert!(g.spawn("whip", 1, 0, 10, None).is_err());
    }

    #[test]
    fn death_piles_bypass_caps_so_nothing_is_destroyed() {
        let mut g = GroundState::default();
        for i in 0..MAX_GROUND_ITEMS {
            g.spawn("whip", 1, i as i32, 0, None).unwrap();
        }
        assert!(g.spawn("whip", 1, 0, 1, None).is_err());
        g.spawn_death("whip", 1, 0, 1, Some("killer")).unwrap();
        assert_eq!(g.items.len(), MAX_GROUND_ITEMS + 1);
    }

    #[test]
    fn death_loot_keeps_most_valuable_and_drops_the_rest() {
        let mut inv = empty_inv();
        inv[0] = item("whip", 1);
        inv[1] = item("coins", 5000);
        let mut eq = HashMap::new();
        eq.insert("weapon".to_string(), InventoryItem { id: "dds".into(), amount: 1 });
        let before_total: usize = 3;
        let lost = take_death_loot(&mut inv, &mut eq, 1);
        assert_eq!(lost.len(), before_total - 1);
        // Exactly one item survives on the player and nothing was duplicated.
        let remaining = inv.iter().flatten().count() + eq.len();
        assert_eq!(remaining, 1);
        assert!(lost.iter().any(|(id, amt)| id == "coins" && *amt == 5000));
    }

    #[test]
    fn death_loot_conserves_every_item() {
        let mut inv = starter_inventory();
        let mut eq = starter_equipment();
        let total_before = inv.iter().flatten().count() + eq.len();
        let lost = take_death_loot(&mut inv, &mut eq, KEEP_ON_DEATH);
        let kept = inv.iter().flatten().count() + eq.len();
        assert_eq!(kept + lost.len(), total_before);
        assert!(kept <= KEEP_ON_DEATH);
    }

    #[test]
    fn sanitize_discards_unknown_items() {
        let mut g = GroundState::default();
        g.items.push(GroundItem {
            uid: 9,
            id: "definitely_not_an_item".into(),
            amount: 1,
            x: 0,
            y: 0,
            owner: None,
            private_left: 0,
            life_left: 10,
        });
        g.sanitize();
        assert!(g.items.is_empty());
    }
}
