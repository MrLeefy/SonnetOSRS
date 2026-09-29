use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub const INVENTORY_SLOTS: usize = 28;
pub const BANK_CAPACITY: usize = 400;
pub const GE_SLOTS: u8 = 6;
pub const ACCOUNT_VERSION: u32 = 1;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct InventoryItem {
    pub id: String,
    /// Stack count for stackable items, potion doses for dose items, otherwise 1.
    pub amount: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct BankItem {
    pub id: String,
    /// Count of banked instances, or total stack size for stackable items.
    pub quantity: u32,
    /// Dose/variant value for non-stackable variants. Zero for ordinary items.
    #[serde(default)]
    pub variant: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Appearance {
    pub skin: u32,
    pub hair: u32,
    pub shirt: u32,
    pub pants: u32,
    pub boots: u32,
    pub hair_style: u8,
}

impl Default for Appearance {
    fn default() -> Self {
        Self {
            skin: 0xe8b088,
            hair: 0x6b4a20,
            shirt: 0x2c4a9a,
            pants: 0x3a3a2a,
            boots: 0x3a2a1a,
            hair_style: 1,
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub struct ItemInfo {
    pub stackable: bool,
    pub doses: u32,
    pub tradable: bool,
    pub slot: Option<&'static str>,
    pub two_handed: bool,
    pub guide_price: u32,
}

pub fn item_info(id: &str) -> Option<ItemInfo> {
    let i = match id {
        "whip" => ItemInfo {
            stackable: false,
            doses: 0,
            tradable: true,
            slot: Some("weapon"),
            two_handed: false,
            guide_price: 120_000,
        },
        "dds" => ItemInfo {
            stackable: false,
            doses: 0,
            tradable: true,
            slot: Some("weapon"),
            two_handed: false,
            guide_price: 40_000,
        },
        "dscim" => ItemInfo {
            stackable: false,
            doses: 0,
            tradable: true,
            slot: Some("weapon"),
            two_handed: false,
            guide_price: 100_000,
        },
        "rscim" => ItemInfo {
            stackable: false,
            doses: 0,
            tradable: true,
            slot: Some("weapon"),
            two_handed: false,
            guide_price: 15_000,
        },
        "gmaul" => ItemInfo {
            stackable: false,
            doses: 0,
            tradable: true,
            slot: Some("weapon"),
            two_handed: true,
            guide_price: 55_000,
        },
        "ags" => ItemInfo {
            stackable: false,
            doses: 0,
            tradable: true,
            slot: Some("weapon"),
            two_handed: true,
            guide_price: 8_000_000,
        },
        "rcb" => ItemInfo {
            stackable: false,
            doses: 0,
            tradable: true,
            slot: Some("weapon"),
            two_handed: false,
            guide_price: 30_000,
        },
        "msb" => ItemInfo {
            stackable: false,
            doses: 0,
            tradable: true,
            slot: Some("weapon"),
            two_handed: true,
            guide_price: 1_000,
        },
        "ancstaff" => ItemInfo {
            stackable: false,
            doses: 0,
            tradable: true,
            slot: Some("weapon"),
            two_handed: false,
            guide_price: 80_000,
        },
        "dbolts" => ItemInfo {
            stackable: true,
            doses: 0,
            tradable: true,
            slot: Some("ammo"),
            two_handed: false,
            guide_price: 200,
        },
        "rarrows" => ItemInfo {
            stackable: true,
            doses: 0,
            tradable: true,
            slot: Some("ammo"),
            two_handed: false,
            guide_price: 30,
        },
        "rhelm" => ItemInfo {
            stackable: false,
            doses: 0,
            tradable: true,
            slot: Some("head"),
            two_handed: false,
            guide_price: 20_000,
        },
        "rbody" => ItemInfo {
            stackable: false,
            doses: 0,
            tradable: true,
            slot: Some("body"),
            two_handed: false,
            guide_price: 38_000,
        },
        "rlegs" => ItemInfo {
            stackable: false,
            doses: 0,
            tradable: true,
            slot: Some("legs"),
            two_handed: false,
            guide_price: 38_000,
        },
        "rkite" => ItemInfo {
            stackable: false,
            doses: 0,
            tradable: true,
            slot: Some("shield"),
            two_handed: false,
            guide_price: 20_000,
        },
        "rboots" => ItemInfo {
            stackable: false,
            doses: 0,
            tradable: true,
            slot: Some("feet"),
            two_handed: false,
            guide_price: 8_000,
        },
        "bgloves" => ItemInfo {
            stackable: false,
            doses: 0,
            tradable: false,
            slot: Some("hands"),
            two_handed: false,
            guide_price: 130_000,
        },
        "firecape" => ItemInfo {
            stackable: false,
            doses: 0,
            tradable: false,
            slot: Some("cape"),
            two_handed: false,
            guide_price: 1_000,
        },
        "glory" => ItemInfo {
            stackable: false,
            doses: 0,
            tradable: true,
            slot: Some("neck"),
            two_handed: false,
            guide_price: 25_000,
        },
        "bdbody" => ItemInfo {
            stackable: false,
            doses: 0,
            tradable: true,
            slot: Some("body"),
            two_handed: false,
            guide_price: 6_000,
        },
        "bdchaps" => ItemInfo {
            stackable: false,
            doses: 0,
            tradable: true,
            slot: Some("legs"),
            two_handed: false,
            guide_price: 4_000,
        },
        "coif" => ItemInfo {
            stackable: false,
            doses: 0,
            tradable: true,
            slot: Some("head"),
            two_handed: false,
            guide_price: 500,
        },
        "mtop" => ItemInfo {
            stackable: false,
            doses: 0,
            tradable: true,
            slot: Some("body"),
            two_handed: false,
            guide_price: 60_000,
        },
        "mbottom" => ItemInfo {
            stackable: false,
            doses: 0,
            tradable: true,
            slot: Some("legs"),
            two_handed: false,
            guide_price: 50_000,
        },
        "mhat" => ItemInfo {
            stackable: false,
            doses: 0,
            tradable: true,
            slot: Some("head"),
            two_handed: false,
            guide_price: 20_000,
        },
        "mboots" => ItemInfo {
            stackable: false,
            doses: 0,
            tradable: true,
            slot: Some("feet"),
            two_handed: false,
            guide_price: 12_000,
        },
        "shark" => ItemInfo {
            stackable: false,
            doses: 0,
            tradable: true,
            slot: None,
            two_handed: false,
            guide_price: 800,
        },
        "supatk" | "supstr" | "supdef" | "ranging" | "prayer" | "restore" | "brew" => ItemInfo {
            stackable: false,
            doses: 4,
            tradable: false,
            slot: None,
            two_handed: false,
            guide_price: 500,
        },
        "death" => ItemInfo {
            stackable: true,
            doses: 0,
            tradable: true,
            slot: None,
            two_handed: false,
            guide_price: 200,
        },
        "blood" => ItemInfo {
            stackable: true,
            doses: 0,
            tradable: true,
            slot: None,
            two_handed: false,
            guide_price: 300,
        },
        "water" => ItemInfo {
            stackable: true,
            doses: 0,
            tradable: true,
            slot: None,
            two_handed: false,
            guide_price: 5,
        },
        "coins" => ItemInfo {
            stackable: true,
            doses: 0,
            tradable: false,
            slot: None,
            two_handed: false,
            guide_price: 1,
        },
        "bones" => ItemInfo {
            stackable: false,
            doses: 0,
            tradable: true,
            slot: None,
            two_handed: false,
            guide_price: 1,
        },
        _ => return None,
    };
    Some(i)
}

pub fn trade_catalog() -> Vec<TradeItemView> {
    const IDS: &[&str] = &[
        "whip", "dds", "dscim", "rscim", "gmaul", "ags", "rcb", "msb", "ancstaff", "dbolts",
        "rarrows", "rhelm", "rbody", "rlegs", "rkite", "rboots", "glory", "bdbody", "bdchaps",
        "coif", "mtop", "mbottom", "mhat", "mboots", "shark", "death", "blood", "water", "bones",
    ];
    IDS.iter()
        .filter_map(|id| {
            let i = item_info(id)?;
            i.tradable.then(|| TradeItemView {
                id: (*id).into(),
                guide_price: i.guide_price,
            })
        })
        .collect()
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct TradeItemView {
    pub id: String,
    pub guide_price: u32,
}

pub fn starter_inventory() -> Vec<Option<InventoryItem>> {
    let mut inv = vec![None; INVENTORY_SLOTS];
    let raw = [
        ("dscim", 1),
        ("dds", 1),
        ("gmaul", 1),
        ("ags", 1),
        ("ancstaff", 1),
        ("rcb", 1),
        ("death", 400),
        ("blood", 300),
        ("water", 800),
        ("prayer", 4),
        ("prayer", 4),
        ("restore", 4),
        ("brew", 4),
        ("brew", 4),
        ("supstr", 4),
    ];
    for (idx, (id, amount)) in raw.into_iter().enumerate() {
        inv[idx] = Some(InventoryItem {
            id: id.into(),
            amount,
        });
    }
    for slot in inv.iter_mut().skip(15) {
        *slot = Some(InventoryItem {
            id: "shark".into(),
            amount: 1,
        });
    }
    inv
}

pub fn starter_equipment() -> HashMap<String, InventoryItem> {
    [
        ("head", "rhelm", 1),
        ("cape", "firecape", 1),
        ("neck", "glory", 1),
        ("ammo", "dbolts", 150),
        ("weapon", "whip", 1),
        ("body", "rbody", 1),
        ("shield", "rkite", 1),
        ("legs", "rlegs", 1),
        ("hands", "bgloves", 1),
        ("feet", "rboots", 1),
    ]
    .into_iter()
    .map(|(slot, id, amount)| {
        (
            slot.into(),
            InventoryItem {
                id: id.into(),
                amount,
            },
        )
    })
    .collect()
}

pub fn starter_bank() -> Vec<BankItem> {
    vec![BankItem {
        id: "coins".into(),
        quantity: 250_000,
        variant: 0,
    }]
}

pub fn appearance_for(seed: &str) -> Appearance {
    const SKIN: &[u32] = &[0xe8b088, 0xd49a70, 0xc0825a, 0xa66a44, 0xf0c8a0, 0x8a5a3a];
    const HAIR: &[u32] = &[
        0x3a2410, 0x6b4a20, 0xc8a040, 0x1a1a1a, 0x9a3a1a, 0xdedede, 0x8a6a30,
    ];
    const SHIRT: &[u32] = &[
        0x2c4a9a, 0x9a2c2c, 0x2c8a4a, 0x8a7a2c, 0x5a2c8a, 0x2c7a8a, 0x8a4a2c, 0x6a6a6a, 0x1c1c1c,
        0xcfcfc0,
    ];
    let mut h = 2166136261u32;
    for b in seed.bytes() {
        h = (h ^ u32::from(b)).wrapping_mul(16777619);
    }
    Appearance {
        skin: SKIN[(h as usize) % SKIN.len()],
        hair: HAIR[((h >> 4) as usize) % HAIR.len()],
        shirt: SHIRT[((h >> 8) as usize) % SHIRT.len()],
        pants: [0x3a3a2a, 0x2a3a5a, 0x5a3a2a, 0x2a2a2a, 0x4a4a5a][((h >> 12) as usize) % 5],
        boots: [0x3a2a1a, 0x1a1a1a, 0x5a4a3a][((h >> 15) as usize) % 3],
        hair_style: ((h >> 18) % 3) as u8,
    }
}

pub fn normalize_inventory(inv: &mut Vec<Option<InventoryItem>>) {
    inv.truncate(INVENTORY_SLOTS);
    while inv.len() < INVENTORY_SLOTS {
        inv.push(None);
    }
    for slot in inv.iter_mut() {
        let Some(item) = slot else { continue };
        let Some(info) = item_info(&item.id) else {
            *slot = None;
            continue;
        };
        if info.stackable {
            if item.amount == 0 {
                *slot = None;
            }
        } else if info.doses > 0 {
            if item.amount == 0 || item.amount > info.doses {
                *slot = None;
            }
        } else {
            item.amount = 1;
        }
    }
}

pub fn inventory_count(inv: &[Option<InventoryItem>], id: &str) -> u32 {
    let Some(info) = item_info(id) else { return 0 };
    inv.iter()
        .flatten()
        .filter(|s| s.id == id)
        .map(|s| if info.stackable { s.amount } else { 1 })
        .sum()
}

pub fn inventory_remove(inv: &mut Vec<Option<InventoryItem>>, id: &str, mut qty: u32) -> bool {
    let Some(info) = item_info(id) else {
        return false;
    };
    if qty == 0 || inventory_count(inv, id) < qty {
        return false;
    }
    for slot in inv.iter_mut() {
        let Some(item) = slot else { continue };
        if item.id != id {
            continue;
        }
        if info.stackable {
            let take = qty.min(item.amount);
            item.amount -= take;
            qty -= take;
            if item.amount == 0 {
                *slot = None;
            }
        } else {
            *slot = None;
            qty -= 1;
        }
        if qty == 0 {
            break;
        }
    }
    true
}

pub fn inventory_add(
    inv: &mut Vec<Option<InventoryItem>>,
    id: &str,
    qty: u32,
    variant: u32,
) -> bool {
    let Some(info) = item_info(id) else {
        return false;
    };
    if qty == 0 {
        return false;
    }
    let mut copy = inv.clone();
    if info.stackable {
        if let Some(existing) = copy.iter_mut().flatten().find(|s| s.id == id) {
            let Some(n) = existing.amount.checked_add(qty) else {
                return false;
            };
            existing.amount = n;
        } else if let Some(slot) = copy.iter_mut().find(|s| s.is_none()) {
            *slot = Some(InventoryItem {
                id: id.into(),
                amount: qty,
            });
        } else {
            return false;
        }
    } else {
        let amount = if info.doses > 0 {
            if variant == 0 || variant > info.doses {
                return false;
            } else {
                variant
            }
        } else {
            1
        };
        if copy.iter().filter(|s| s.is_none()).count() < qty as usize {
            return false;
        }
        let mut left = qty;
        for slot in copy.iter_mut() {
            if slot.is_none() && left > 0 {
                *slot = Some(InventoryItem {
                    id: id.into(),
                    amount,
                });
                left -= 1;
            }
        }
    }
    *inv = copy;
    true
}

fn bank_key(id: &str, variant: u32) -> (String, u32) {
    (id.into(), variant)
}

pub fn bank_deposit(
    inv: &mut Vec<Option<InventoryItem>>,
    bank: &mut Vec<BankItem>,
    index: usize,
    requested: u32,
) -> Result<(), String> {
    let Some(item) = inv.get(index).cloned().flatten() else {
        return Err("Nothing is in that inventory slot.".into());
    };
    let Some(info) = item_info(&item.id) else {
        return Err("That item is unknown.".into());
    };
    let variant = if info.doses > 0 { item.amount } else { 0 };
    let qty = if info.stackable {
        requested.max(1).min(item.amount)
    } else {
        let available = inv
            .iter()
            .flatten()
            .filter(|s| s.id == item.id && (info.doses == 0 || s.amount == variant))
            .count()
            .min(u32::MAX as usize) as u32;
        requested.max(1).min(available)
    };
    let key = bank_key(&item.id, variant);
    let mut next = bank.clone();
    if let Some(entry) = next.iter_mut().find(|b| bank_key(&b.id, b.variant) == key) {
        entry.quantity = entry
            .quantity
            .checked_add(qty)
            .ok_or("That bank stack is too large.")?;
    } else {
        if next.len() >= BANK_CAPACITY {
            return Err("Your bank is full.".into());
        }
        next.push(BankItem {
            id: item.id.clone(),
            quantity: qty,
            variant,
        });
    }
    if info.stackable {
        let slot = inv[index].as_mut().unwrap();
        slot.amount -= qty;
        if slot.amount == 0 {
            inv[index] = None;
        }
    } else {
        let mut left = qty;
        for slot in inv.iter_mut() {
            if left == 0 {
                break;
            }
            if slot
                .as_ref()
                .is_some_and(|s| s.id == item.id && (info.doses == 0 || s.amount == variant))
            {
                *slot = None;
                left -= 1;
            }
        }
    }
    *bank = next;
    Ok(())
}

pub fn bank_deposit_all(
    inv: &mut Vec<Option<InventoryItem>>,
    bank: &mut Vec<BankItem>,
) -> Result<(), String> {
    let mut next_inv = inv.clone();
    let mut next_bank = bank.clone();
    for i in 0..INVENTORY_SLOTS {
        if let Some(item) = next_inv[i].clone() {
            let info = item_info(&item.id).ok_or("Unknown inventory item.")?;
            let qty = if info.stackable { item.amount } else { 1 };
            bank_deposit(&mut next_inv, &mut next_bank, i, qty)?;
        }
    }
    *inv = next_inv;
    *bank = next_bank;
    Ok(())
}

pub fn bank_deposit_equipment(
    eq: &mut HashMap<String, InventoryItem>,
    bank: &mut Vec<BankItem>,
) -> Result<(), String> {
    let mut next_bank = bank.clone();
    for item in eq.values() {
        let info = item_info(&item.id).ok_or("Unknown equipped item.")?;
        let quantity = if info.stackable { item.amount } else { 1 };
        let variant = if info.doses > 0 { item.amount } else { 0 };
        bank_add(&mut next_bank, &item.id, quantity, variant)?;
    }
    eq.clear();
    *bank = next_bank;
    Ok(())
}

pub fn bank_withdraw(
    inv: &mut Vec<Option<InventoryItem>>,
    bank: &mut Vec<BankItem>,
    index: usize,
    requested: u32,
) -> Result<(), String> {
    let Some(entry) = bank.get(index).cloned() else {
        return Err("That bank item no longer exists.".into());
    };
    let qty = requested.max(1).min(entry.quantity);
    let mut next_inv = inv.clone();
    if !inventory_add(&mut next_inv, &entry.id, qty, entry.variant) {
        return Err("You do not have enough inventory space.".into());
    }
    let left = entry.quantity - qty;
    if left == 0 {
        bank.remove(index);
    } else {
        bank[index].quantity = left;
    }
    *inv = next_inv;
    Ok(())
}

pub fn equipment_weapon(eq: &HashMap<String, InventoryItem>) -> String {
    eq.get("weapon")
        .map(|i| i.id.clone())
        .unwrap_or_else(|| "unarmed".into())
}

pub fn owns_item(
    inv: &[Option<InventoryItem>],
    eq: &HashMap<String, InventoryItem>,
    id: &str,
) -> bool {
    inv.iter().flatten().any(|s| s.id == id) || eq.values().any(|s| s.id == id)
}

pub fn equip(
    inv: &mut Vec<Option<InventoryItem>>,
    eq: &mut HashMap<String, InventoryItem>,
    index: usize,
) -> Result<String, String> {
    let Some(item) = inv.get(index).cloned().flatten() else {
        return Err("Nothing is in that slot.".into());
    };
    let info = item_info(&item.id).ok_or("That item is unknown.")?;
    let slot = info
        .slot
        .ok_or("That item cannot be equipped.")?
        .to_string();
    let mut ni = inv.clone();
    let mut ne = eq.clone();
    ni[index] = None;
    let mut displaced = Vec::new();
    if let Some(old) = ne.remove(&slot) {
        displaced.push(old)
    }
    if info.two_handed {
        if let Some(shield) = ne.remove("shield") {
            displaced.push(shield)
        }
    } else if slot == "shield" {
        if ne
            .get("weapon")
            .and_then(|w| item_info(&w.id))
            .is_some_and(|w| w.two_handed)
        {
            if let Some(w) = ne.remove("weapon") {
                displaced.push(w)
            }
        }
    }
    for d in displaced {
        let di = item_info(&d.id).ok_or("Unknown equipped item.")?;
        if !inventory_add(
            &mut ni,
            &d.id,
            if di.stackable { d.amount } else { 1 },
            if di.doses > 0 { d.amount } else { 0 },
        ) {
            return Err("You need more free inventory space.".into());
        }
    }
    if slot == "ammo" {
        if let Some(old) = ne.get_mut("ammo").filter(|x| x.id == item.id) {
            old.amount = old
                .amount
                .checked_add(item.amount)
                .ok_or("That ammo stack is too large.")?;
        } else {
            ne.insert(slot, item);
        }
    } else {
        ne.insert(slot, item);
    }
    *inv = ni;
    *eq = ne;
    Ok(equipment_weapon(eq))
}

pub fn unequip(
    inv: &mut Vec<Option<InventoryItem>>,
    eq: &mut HashMap<String, InventoryItem>,
    slot: &str,
) -> Result<String, String> {
    let Some(item) = eq.get(slot).cloned() else {
        return Err("Nothing is equipped there.".into());
    };
    let info = item_info(&item.id).ok_or("Unknown equipped item.")?;
    let mut ni = inv.clone();
    if !inventory_add(
        &mut ni,
        &item.id,
        if info.stackable { item.amount } else { 1 },
        if info.doses > 0 { item.amount } else { 0 },
    ) {
        return Err("You do not have enough inventory space.".into());
    }
    eq.remove(slot);
    *inv = ni;
    Ok(equipment_weapon(eq))
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum OfferState {
    Registered,
    Completed,
    Aborted,
    Removed,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct GeOffer {
    pub offer_id: u64,
    pub owner_token: String,
    pub slot: u8,
    pub sell: bool,
    pub item: String,
    pub quantity: u32,
    pub remaining: u32,
    pub price: u32,
    pub created: u64,
    pub state: OfferState,
    #[serde(default)]
    pub collected_items: u32,
    #[serde(default)]
    pub collected_coins: u64,
}

impl GeOffer {
    pub fn active(&self) -> bool {
        self.state == OfferState::Registered && self.remaining > 0
    }
}

pub fn place_offer(
    offers: &mut Vec<GeOffer>,
    next_id: &mut u64,
    owner: &str,
    slot: u8,
    sell: bool,
    item: &str,
    quantity: u32,
    price: u32,
    created: u64,
    inv: &mut Vec<Option<InventoryItem>>,
) -> Result<u64, String> {
    if slot >= GE_SLOTS {
        return Err("Choose one of the six Grand Exchange slots.".into());
    }
    if quantity == 0 || price == 0 {
        return Err("Quantity and price must be at least one.".into());
    }
    let info = item_info(item).ok_or("That item is unknown.")?;
    if !info.tradable {
        return Err("That item cannot be traded on the Grand Exchange.".into());
    }
    if offers
        .iter()
        .any(|o| o.owner_token == owner && o.slot == slot && o.state != OfferState::Removed)
    {
        return Err("That offer slot is already in use.".into());
    }
    if sell {
        if !inventory_remove(inv, item, quantity) {
            return Err("You do not have enough of that item in your inventory.".into());
        }
    } else {
        let total = (quantity as u64)
            .checked_mul(price as u64)
            .ok_or("Offer value is too large.")?;
        if total > u32::MAX as u64 {
            return Err("Offer value is too large.".into());
        }
        if !inventory_remove(inv, "coins", total as u32) {
            return Err("You do not have enough coins in your inventory.".into());
        }
    }
    *next_id = next_id.saturating_add(1).max(1);
    let id = *next_id;
    offers.push(GeOffer {
        offer_id: id,
        owner_token: owner.into(),
        slot,
        sell,
        item: item.into(),
        quantity,
        remaining: quantity,
        price,
        created,
        state: OfferState::Registered,
        collected_items: 0,
        collected_coins: 0,
    });
    match_offer(offers, id);
    Ok(id)
}

pub fn match_offer(offers: &mut [GeOffer], new_id: u64) {
    loop {
        let Some(ni) = offers
            .iter()
            .position(|o| o.offer_id == new_id && o.active())
        else {
            break;
        };
        let new_sell = offers[ni].sell;
        let item = offers[ni].item.clone();
        let price = offers[ni].price;
        let owner = offers[ni].owner_token.clone();
        let mut candidates = offers
            .iter()
            .enumerate()
            .filter(|(_, o)| {
                o.active()
                    && o.item == item
                    && o.sell != new_sell
                    && o.owner_token != owner
                    && if new_sell {
                        o.price >= price
                    } else {
                        o.price <= price
                    }
            })
            .map(|(i, o)| (i, o.created, o.offer_id))
            .collect::<Vec<_>>();
        candidates.sort_by_key(|x| (x.1, x.2));
        let Some((oi, _, _)) = candidates.first().copied() else {
            break;
        };
        let (seller_i, buyer_i) = if offers[ni].sell { (ni, oi) } else { (oi, ni) };
        let amount = offers[seller_i].remaining.min(offers[buyer_i].remaining);
        if amount == 0 {
            break;
        }
        let trade_price = if (offers[seller_i].created, offers[seller_i].offer_id)
            <= (offers[buyer_i].created, offers[buyer_i].offer_id)
        {
            offers[seller_i].price
        } else {
            offers[buyer_i].price
        };
        let coins = (trade_price as u64) * (amount as u64);
        let refund = ((offers[buyer_i].price - trade_price) as u64) * (amount as u64);
        offers[seller_i].remaining -= amount;
        offers[buyer_i].remaining -= amount;
        offers[seller_i].collected_coins = offers[seller_i].collected_coins.saturating_add(coins);
        offers[buyer_i].collected_items = offers[buyer_i].collected_items.saturating_add(amount);
        offers[buyer_i].collected_coins = offers[buyer_i].collected_coins.saturating_add(refund);
        if offers[seller_i].remaining == 0 {
            offers[seller_i].state = OfferState::Completed
        }
        if offers[buyer_i].remaining == 0 {
            offers[buyer_i].state = OfferState::Completed
        }
    }
}

pub fn cancel_offer(offers: &mut [GeOffer], owner: &str, slot: u8) -> Result<(), String> {
    let Some(o) = offers
        .iter_mut()
        .find(|o| o.owner_token == owner && o.slot == slot && o.state != OfferState::Removed)
    else {
        return Err("That offer slot is empty.".into());
    };
    if o.state == OfferState::Registered {
        if o.sell {
            o.collected_items = o.collected_items.saturating_add(o.remaining)
        } else {
            o.collected_coins = o
                .collected_coins
                .saturating_add((o.remaining as u64) * (o.price as u64))
        }
        o.remaining = 0;
        o.state = OfferState::Aborted;
    }
    Ok(())
}

pub fn collect_offer(
    offers: &mut [GeOffer],
    owner: &str,
    slot: u8,
    inv: &mut Vec<Option<InventoryItem>>,
) -> Result<(), String> {
    let Some(i) = offers
        .iter()
        .position(|o| o.owner_token == owner && o.slot == slot && o.state != OfferState::Removed)
    else {
        return Err("That offer slot is empty.".into());
    };
    let o = offers[i].clone();
    let mut next = inv.clone();
    if o.collected_items > 0 && !inventory_add(&mut next, &o.item, o.collected_items, 0) {
        return Err("You need more inventory space to collect those items.".into());
    }
    if o.collected_coins > 0 {
        if o.collected_coins > u32::MAX as u64 {
            return Err("That coin collection is too large.".into());
        }
        if !inventory_add(&mut next, "coins", o.collected_coins as u32, 0) {
            return Err("You need inventory space to collect those coins.".into());
        }
    }
    *inv = next;
    offers[i].collected_items = 0;
    offers[i].collected_coins = 0;
    if matches!(offers[i].state, OfferState::Completed | OfferState::Aborted) {
        offers[i].state = OfferState::Removed
    }
    Ok(())
}

fn bank_add(bank: &mut Vec<BankItem>, id: &str, quantity: u32, variant: u32) -> Result<(), String> {
    if quantity == 0 {
        return Ok(());
    }
    let key = bank_key(id, variant);
    if let Some(entry) = bank.iter_mut().find(|b| bank_key(&b.id, b.variant) == key) {
        entry.quantity = entry
            .quantity
            .checked_add(quantity)
            .ok_or("That bank stack is too large.")?;
    } else {
        if bank.len() >= BANK_CAPACITY {
            return Err("Your bank is full.".into());
        }
        bank.push(BankItem {
            id: id.into(),
            quantity,
            variant,
        });
    }
    Ok(())
}

pub fn collect_offer_to_bank(
    offers: &mut [GeOffer],
    owner: &str,
    slot: u8,
    bank: &mut Vec<BankItem>,
) -> Result<(), String> {
    let Some(i) = offers
        .iter()
        .position(|o| o.owner_token == owner && o.slot == slot && o.state != OfferState::Removed)
    else {
        return Err("That offer slot is empty.".into());
    };
    let o = offers[i].clone();
    let mut next = bank.clone();
    if o.collected_items > 0 {
        bank_add(&mut next, &o.item, o.collected_items, 0)?;
    }
    if o.collected_coins > 0 {
        if o.collected_coins > u32::MAX as u64 {
            return Err("That coin collection is too large.".into());
        }
        bank_add(&mut next, "coins", o.collected_coins as u32, 0)?;
    }
    *bank = next;
    offers[i].collected_items = 0;
    offers[i].collected_coins = 0;
    if matches!(offers[i].state, OfferState::Completed | OfferState::Aborted) {
        offers[i].state = OfferState::Removed;
    }
    Ok(())
}

pub fn owner_offers(offers: &[GeOffer], owner: &str) -> Vec<GeOffer> {
    let mut out = offers
        .iter()
        .filter(|o| o.owner_token == owner && o.state != OfferState::Removed)
        .cloned()
        .collect::<Vec<_>>();
    out.sort_by_key(|o| o.slot);
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn starter_inventory_is_exactly_28_slots() {
        assert_eq!(starter_inventory().len(), 28);
    }
    #[test]
    fn bank_round_trip_preserves_potion_dose() {
        let mut inv = vec![None; 28];
        inv[0] = Some(InventoryItem {
            id: "brew".into(),
            amount: 2,
        });
        let mut bank = vec![];
        bank_deposit(&mut inv, &mut bank, 0, 1).unwrap();
        assert_eq!(bank[0].variant, 2);
        bank_withdraw(&mut inv, &mut bank, 0, 1).unwrap();
        assert_eq!(inv[0].as_ref().unwrap().amount, 2);
    }
    #[test]
    fn deposit_quantity_moves_matching_nonstack_items_together() {
        let mut inv = vec![None; 28];
        for i in 0..4 {
            inv[i] = Some(InventoryItem {
                id: "shark".into(),
                amount: 1,
            });
        }
        let mut bank = vec![];
        bank_deposit(&mut inv, &mut bank, 0, 3).unwrap();
        assert_eq!(bank[0].quantity, 3);
        assert_eq!(inventory_count(&inv, "shark"), 1);
    }
    #[test]
    fn potion_deposit_all_keeps_dose_variants_separate() {
        let mut inv = vec![None; 28];
        inv[0] = Some(InventoryItem {
            id: "brew".into(),
            amount: 2,
        });
        inv[1] = Some(InventoryItem {
            id: "brew".into(),
            amount: 4,
        });
        inv[2] = Some(InventoryItem {
            id: "brew".into(),
            amount: 2,
        });
        let mut bank = vec![];
        bank_deposit(&mut inv, &mut bank, 0, u32::MAX).unwrap();
        assert_eq!(bank.iter().find(|b| b.variant == 2).unwrap().quantity, 2);
        assert!(inv[0].is_none() && inv[2].is_none());
        assert_eq!(inv[1].as_ref().unwrap().amount, 4);
    }
    #[test]
    fn two_handed_equip_is_atomic() {
        let mut inv = vec![None; 28];
        inv[0] = Some(InventoryItem {
            id: "ags".into(),
            amount: 1,
        });
        let mut eq = HashMap::from([
            (
                "weapon".into(),
                InventoryItem {
                    id: "whip".into(),
                    amount: 1,
                },
            ),
            (
                "shield".into(),
                InventoryItem {
                    id: "rkite".into(),
                    amount: 1,
                },
            ),
        ]);
        equip(&mut inv, &mut eq, 0).unwrap();
        assert_eq!(eq["weapon"].id, "ags");
        assert!(!eq.contains_key("shield"));
        assert!(inventory_count(&inv, "whip") == 1 && inventory_count(&inv, "rkite") == 1);
    }
    #[test]
    fn ge_matches_at_older_offer_price_and_refunds_buyer() {
        let mut offers = vec![];
        let mut next = 0;
        let mut seller = vec![None; 28];
        inventory_add(&mut seller, "whip", 1, 0);
        let mut buyer = vec![None; 28];
        inventory_add(&mut buyer, "coins", 200_000, 0);
        place_offer(
            &mut offers,
            &mut next,
            "sell",
            0,
            true,
            "whip",
            1,
            100_000,
            10,
            &mut seller,
        )
        .unwrap();
        place_offer(
            &mut offers,
            &mut next,
            "buy",
            0,
            false,
            "whip",
            1,
            120_000,
            20,
            &mut buyer,
        )
        .unwrap();
        let s = offers.iter().find(|o| o.owner_token == "sell").unwrap();
        let b = offers.iter().find(|o| o.owner_token == "buy").unwrap();
        assert_eq!(s.collected_coins, 100_000);
        assert_eq!(b.collected_items, 1);
        assert_eq!(b.collected_coins, 20_000);
    }
    #[test]
    fn ge_collection_can_go_to_bank_when_inventory_is_full() {
        let mut offers = vec![GeOffer {
            offer_id: 1,
            owner_token: "p".into(),
            slot: 0,
            sell: false,
            item: "whip".into(),
            quantity: 1,
            remaining: 0,
            price: 100_000,
            created: 1,
            state: OfferState::Completed,
            collected_items: 1,
            collected_coins: 500,
        }];
        let mut bank = vec![];
        collect_offer_to_bank(&mut offers, "p", 0, &mut bank).unwrap();
        assert_eq!(bank.iter().find(|b| b.id == "whip").unwrap().quantity, 1);
        assert_eq!(bank.iter().find(|b| b.id == "coins").unwrap().quantity, 500);
        assert_eq!(offers[0].state, OfferState::Removed);
    }

    #[test]
    fn deposit_equipment_is_atomic_and_preserves_ammo_stack() {
        let mut eq = starter_equipment();
        let mut bank = Vec::new();
        bank_deposit_equipment(&mut eq, &mut bank).unwrap();
        assert!(eq.is_empty());
        assert!(bank.iter().any(|x| x.id == "whip" && x.quantity == 1));
        assert!(bank.iter().any(|x| x.id == "dbolts" && x.quantity == 150));
    }

    #[test]
    fn ge_never_self_matches() {
        let mut offers = vec![];
        let mut next = 0;
        let mut inv = vec![None; 28];
        inventory_add(&mut inv, "whip", 1, 0);
        inventory_add(&mut inv, "coins", 200_000, 0);
        place_offer(
            &mut offers,
            &mut next,
            "same",
            0,
            true,
            "whip",
            1,
            100_000,
            10,
            &mut inv,
        )
        .unwrap();
        place_offer(
            &mut offers,
            &mut next,
            "same",
            1,
            false,
            "whip",
            1,
            120_000,
            20,
            &mut inv,
        )
        .unwrap();
        assert_eq!(offers.iter().map(|o| o.remaining).sum::<u32>(), 2);
    }
}
