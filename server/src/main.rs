mod economy;
mod movement;
use economy::*;
use movement::{Collision, Tile};
use std::{
    collections::{HashMap, VecDeque},
    env,
    net::SocketAddr,
    path::{Path, PathBuf},
    sync::Arc,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use axum::{
    Json, Router,
    extract::{
        State,
        ws::{CloseFrame, Message, WebSocket, WebSocketUpgrade, close_code},
    },
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::get,
};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::{
    fs,
    net::TcpListener,
    sync::{Mutex, RwLock, broadcast, watch},
    time,
};
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing::{error, info, warn};
use uuid::Uuid;

const VERSION: &str = env!("CARGO_PKG_VERSION");
const TICK_MS: u64 = 600;
const GE_CENTER: f32 = 48.0;
const SAFE_APOTHEM: f32 = 9.0;
const MAX_HP: i32 = 99;
const MAX_CHAT: usize = 120;

#[derive(Clone)]
struct AppState {
    world: Arc<RwLock<World>>,
    tx: broadcast::Sender<String>,
    state_file: Arc<PathBuf>,
    collision: Arc<Collision>,
    allowed_origins: Arc<Vec<String>>,
    persist_lock: Arc<Mutex<()>>,
    shutdown: watch::Sender<bool>,
}

struct World {
    tick: u64,
    players: HashMap<Uuid, Player>,
    profiles: HashMap<String, PersistedProfile>,
    ge_offers: Vec<GeOffer>,
    next_offer_id: u64,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
enum CombatStyle {
    Melee,
    Ranged,
    Magic,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ResidentRole {
    Social,
    Pker,
}

#[derive(Clone, Debug)]
struct ResidentAi {
    role: ResidentRole,
    home: Tile,
    next_action: u64,
    next_chat: u64,
    personality: u8,
}

struct Player {
    id: Uuid,
    token: String,
    name: String,
    x: f32,
    y: f32,
    hp: i32,
    attack_current: i32,
    strength_current: i32,
    defence_current: i32,
    ranged_current: i32,
    magic_current: i32,
    prayer_points: f32,
    kills: u32,
    deaths: u32,
    path: VecDeque<Tile>,
    motion: Vec<Tile>,
    motion_tick: u64,
    // Changes only for intentional discontinuities such as death/respawn.
    // Walking and safe-zone transitions never increment this value.
    position_epoch: u64,
    command_seq: u64,
    run_on: bool,
    run_energy: f32,
    attack_target: Option<Uuid>,
    follow_target: Option<Uuid>,
    protect_until: u64,
    last_attack_tick: Option<u64>,
    simulated: bool,
    loadout: String,
    weapon: String,
    combat_style: CombatStyle,
    spell: Option<String>,
    overhead: Option<String>,
    active_prayers: Vec<String>,
    prayer_block_until: u64,
    spec_energy: f32,
    special_pending: bool,
    food: u8,
    last_eat_tick: u64,
    last_pot_tick: u64,
    frozen_until: u64,
    inventory: Vec<Option<InventoryItem>>,
    bank: Vec<BankItem>,
    equipment: HashMap<String, InventoryItem>,
    appearance: Appearance,
    resident: Option<ResidentAi>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
struct PersistedProfile {
    name: String,
    x: f32,
    y: f32,
    kills: u32,
    deaths: u32,
    #[serde(default = "default_hp")]
    hp: i32,
    #[serde(default = "default_prayer")]
    prayer_points: f32,
    #[serde(default)]
    account_version: u32,
    #[serde(default)]
    inventory: Vec<Option<InventoryItem>>,
    #[serde(default)]
    bank: Vec<BankItem>,
    #[serde(default)]
    equipment: HashMap<String, InventoryItem>,
    #[serde(default)]
    appearance: Appearance,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct PersistedState {
    #[serde(default)]
    version: u32,
    #[serde(default)]
    profiles: HashMap<String, PersistedProfile>,
    #[serde(default)]
    ge_offers: Vec<GeOffer>,
    #[serde(default)]
    next_offer_id: u64,
}
fn default_hp() -> i32 {
    MAX_HP
}
fn default_prayer() -> f32 {
    99.0
}

#[derive(Clone, Debug, Default, Deserialize)]
struct CollisionFile {
    n: usize,
    block: Vec<u8>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ClientMessage {
    Hello {
        name: String,
        #[serde(default)]
        resume_token: Option<String>,
        #[serde(default)]
        protocol: u32,
    },
    Walk {
        x: f32,
        y: f32,
        seq: u64,
        #[serde(default)]
        run_on: bool,
    },
    Stop {
        seq: u64,
    },
    Run {
        enabled: bool,
    },
    Prayer {
        id: String,
        enabled: bool,
    },
    InventoryMove {
        from: u8,
        to: u8,
    },
    Follow {
        target_id: Uuid,
        seq: u64,
    },
    Resync {},
    Move {},
    Attack {
        target_id: Uuid,
        #[serde(default)]
        weapon: Option<String>,
        #[serde(default)]
        style: Option<CombatStyle>,
        #[serde(default)]
        spell: Option<String>,
        #[serde(default)]
        special: bool,
        #[serde(default, rename = "overhead")]
        _overhead: Option<String>,
    },
    CombatState {
        weapon: String,
        style: CombatStyle,
        #[serde(default)]
        spell: Option<String>,
        #[serde(default)]
        special: bool,
        #[serde(default, rename = "overhead")]
        _overhead: Option<String>,
    },
    Eat {
        #[serde(default)]
        index: Option<u8>,
    },
    Drink {
        index: u8,
    },
    BankOpen {},
    BankDeposit {
        index: u8,
        amount: u32,
    },
    BankDepositAll {},
    BankDepositEquipment {},
    BankWithdraw {
        index: u16,
        amount: u32,
    },
    Equip {
        index: u8,
    },
    Unequip {
        slot: String,
    },
    GeOpen {},
    GePlace {
        slot: u8,
        sell: bool,
        item: String,
        quantity: u32,
        price: u32,
    },
    GeCancel {
        slot: u8,
    },
    GeCollect {
        slot: u8,
        #[serde(default)]
        to_bank: bool,
    },
    Appearance {
        skin: u32,
        hair: u32,
        shirt: u32,
        pants: u32,
        boots: u32,
        hair_style: u8,
    },
    Chat {
        text: String,
    },
    Ping {
        #[serde(default)]
        nonce: u64,
    },
}

impl ClientMessage {
    fn durable(&self) -> bool {
        matches!(
            self,
            ClientMessage::Eat { .. }
                | ClientMessage::Drink { .. }
                | ClientMessage::InventoryMove { .. }
                | ClientMessage::BankDeposit { .. }
                | ClientMessage::BankDepositAll {}
                | ClientMessage::BankDepositEquipment {}
                | ClientMessage::BankWithdraw { .. }
                | ClientMessage::Equip { .. }
                | ClientMessage::Unequip { .. }
                | ClientMessage::GePlace { .. }
                | ClientMessage::GeCancel { .. }
                | ClientMessage::GeCollect { .. }
                | ClientMessage::Appearance { .. }
        )
    }
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ServerMessage<'a> {
    Welcome {
        id: Uuid,
        resume_token: &'a str,
        tick_ms: u64,
        version: &'a str,
        protocol: u32,
        world_hash: u32,
        safe_zone: SafeZone,
        server_time_ms: u64,
    },
    Snapshot {
        tick: u64,
        players: Vec<PlayerView>,
    },
    Route {
        seq: u64,
        tick: u64,
        path: Vec<Tile>,
        player: PlayerView,
    },
    AttackVisual {
        attacker_id: Uuid,
        target_id: Uuid,
        style: CombatStyle,
        weapon: String,
        spell: Option<String>,
        special: bool,
        hits: u8,
        delay_ticks: u64,
    },
    Combat {
        attacker_id: Uuid,
        target_id: Uuid,
        damage: i32,
        target_hp: i32,
        killed: bool,
        style: CombatStyle,
        special: bool,
    },
    ResidentChat {
        player_id: Uuid,
        name: String,
        text: String,
    },
    Chat {
        player_id: Uuid,
        name: &'a str,
        text: &'a str,
    },
    Pong {
        nonce: u64,
        tick: u64,
    },
    AccountState {
        inventory: Vec<Option<InventoryItem>>,
        bank: Vec<BankItem>,
        equipment: HashMap<String, InventoryItem>,
        offers: Vec<GeOffer>,
        catalog: Vec<TradeItemView>,
        appearance: Appearance,
    },
    Error {
        code: &'a str,
        message: &'a str,
    },
}

#[derive(Clone, Copy, Debug, Serialize)]
struct SafeZone {
    center_x: f32,
    center_y: f32,
    apothem: f32,
    shape: &'static str,
    rule: &'static str,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
enum Zone {
    Safe,
    Pvp,
}

#[derive(Clone, Debug, Serialize)]
struct PlayerView {
    id: Uuid,
    name: String,
    x: f32,
    y: f32,
    hp: i32,
    kills: u32,
    deaths: u32,
    zone: Zone,
    motion: Vec<Tile>,
    motion_tick: u64,
    position_epoch: u64,
    command_seq: u64,
    destination: Option<Tile>,
    moving: bool,
    run: f32,
    run_on: bool,
    attack_target: Option<Uuid>,
    simulated: bool,
    loadout: String,
    weapon: String,
    combat_style: CombatStyle,
    spell: Option<String>,
    overhead: Option<String>,
    active_prayers: Vec<String>,
    spec: f32,
    level: u8,
    attack_current: i32,
    strength_current: i32,
    defence_current: i32,
    ranged_current: i32,
    magic_current: i32,
    prayer_points: f32,
    equipment: HashMap<String, InventoryItem>,
    appearance: Appearance,
}

#[derive(Serialize)]
struct Health {
    status: &'static str,
    version: &'static str,
    tick_ms: u64,
    players: usize,
    residents: usize,
    tick: u64,
}

#[derive(Serialize)]
struct WorldInfo {
    map_size: u32,
    tick_ms: u64,
    safe_zone: SafeZone,
}

fn safe_zone() -> SafeZone {
    SafeZone {
        center_x: GE_CENTER,
        center_y: GE_CENTER,
        apothem: SAFE_APOTHEM,
        shape: "octagon",
        rule: "PvP is disabled while either player is inside the Grand Exchange stone boundary.",
    }
}

fn poly8(dx: f32, dy: f32) -> f32 {
    let inv = std::f32::consts::FRAC_1_SQRT_2;
    [
        dx.abs(),
        dy.abs(),
        (dx * inv + dy * inv).abs(),
        (dx * inv - dy * inv).abs(),
    ]
    .into_iter()
    .fold(0.0, f32::max)
}

fn zone_at(x: f32, y: f32) -> Zone {
    if poly8(x + 0.5 - GE_CENTER, y + 0.5 - GE_CENTER) <= SAFE_APOTHEM {
        Zone::Safe
    } else {
        Zone::Pvp
    }
}

fn near_bank(p: &Player) -> bool {
    const BOOTHS: [(i32, i32); 4] = [(43, 43), (53, 43), (43, 53), (53, 53)];
    BOOTHS
        .iter()
        .any(|(x, y)| (p.x as i32 - *x).abs().max((p.y as i32 - *y).abs()) <= 2)
        && zone_at(p.x, p.y) == Zone::Safe
}

fn near_ge(p: &Player) -> bool {
    zone_at(p.x, p.y) == Zone::Safe
        && ((p.x + 0.5 - GE_CENTER).powi(2) + (p.y + 0.5 - GE_CENTER).powi(2)).sqrt() <= 6.5
}

fn migrate_profile(mut profile: PersistedProfile, seed: &str) -> PersistedProfile {
    if profile.account_version < ACCOUNT_VERSION {
        profile.inventory = starter_inventory();
        profile.bank = starter_bank();
        profile.equipment = starter_equipment();
        profile.appearance = appearance_for(seed);
        profile.prayer_points = 99.0;
        profile.account_version = ACCOUNT_VERSION;
    } else {
        normalize_inventory(&mut profile.inventory);
        profile.bank.retain(|b| {
            item_info(&b.id).is_some()
                && b.quantity > 0
                && b.variant <= item_info(&b.id).map(|i| i.doses).unwrap_or(0)
        });
        if profile.appearance.hair_style > 2 {
            profile.appearance.hair_style = 1;
        }
    }
    profile
}

fn profile_from_player(player: &Player) -> PersistedProfile {
    PersistedProfile {
        name: player.name.clone(),
        x: player.x,
        y: player.y,
        kills: player.kills,
        deaths: player.deaths,
        hp: player.hp,
        prayer_points: player.prayer_points,
        account_version: ACCOUNT_VERSION,
        inventory: player.inventory.clone(),
        bank: player.bank.clone(),
        equipment: player.equipment.clone(),
        appearance: player.appearance.clone(),
    }
}

fn account_message(player: &Player, offers: &[GeOffer]) -> String {
    serialize(&ServerMessage::AccountState {
        inventory: player.inventory.clone(),
        bank: player.bank.clone(),
        equipment: player.equipment.clone(),
        offers: owner_offers(offers, &player.token),
        catalog: trade_catalog(),
        appearance: player.appearance.clone(),
    })
}

fn account_error(code: &'static str, message: &'static str) -> String {
    serialize(&ServerMessage::Error { code, message })
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(u64::MAX as u128) as u64
}

fn clean_name(input: &str) -> String {
    input
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, ' ' | '_' | '-'))
        .take(12)
        .collect::<String>()
        .trim()
        .to_string()
}

fn clean_chat(input: &str) -> String {
    input
        .chars()
        .filter(|c| !c.is_control())
        .take(MAX_CHAT)
        .collect::<String>()
        .trim()
        .to_string()
}

fn valid_token(token: &str) -> bool {
    token.len() == 36 && Uuid::parse_str(token).is_ok()
}

fn combat_level_for(p: &Player) -> u8 {
    match p.loadout.as_str() {
        "pure" => 88,
        "zerker" => 99,
        "ranger" => 106,
        "mage" => 101,
        "hybrid" => 118,
        _ => 126,
    }
}

#[derive(Clone, Copy)]
struct BaseLevels {
    attack: i32,
    strength: i32,
    defence: i32,
    ranged: i32,
    magic: i32,
    prayer: i32,
    hp: i32,
}

fn base_levels(loadout: &str) -> BaseLevels {
    match loadout {
        "melee" => BaseLevels {
            attack: 99,
            strength: 99,
            defence: 92,
            ranged: 80,
            magic: 85,
            prayer: 77,
            hp: 99,
        },
        "zerker" => BaseLevels {
            attack: 60,
            strength: 99,
            defence: 45,
            ranged: 99,
            magic: 94,
            prayer: 52,
            hp: 99,
        },
        "pure" => BaseLevels {
            attack: 60,
            strength: 99,
            defence: 1,
            ranged: 99,
            magic: 94,
            prayer: 52,
            hp: 92,
        },
        "ranger" => BaseLevels {
            attack: 70,
            strength: 70,
            defence: 70,
            ranged: 99,
            magic: 94,
            prayer: 70,
            hp: 94,
        },
        "mage" => BaseLevels {
            attack: 60,
            strength: 70,
            defence: 40,
            ranged: 70,
            magic: 99,
            prayer: 70,
            hp: 90,
        },
        "hybrid" => BaseLevels {
            attack: 75,
            strength: 99,
            defence: 75,
            ranged: 99,
            magic: 99,
            prayer: 75,
            hp: 99,
        },
        _ => BaseLevels {
            attack: 99,
            strength: 99,
            defence: 99,
            ranged: 99,
            magic: 99,
            prayer: 99,
            hp: 99,
        },
    }
}

fn restore_stat(current: &mut i32, base: i32) {
    if *current > base {
        *current -= 1;
    } else if *current < base {
        *current += 1;
    }
}

fn spell_runes(spell: &str) -> &'static [(&'static str, u32)] {
    match spell {
        "iceRush" => &[("death", 2), ("water", 2)],
        "bloodRush" => &[("death", 2), ("blood", 2)],
        "iceBurst" => &[("death", 4), ("water", 4)],
        "bloodBurst" => &[("death", 2), ("blood", 4)],
        "iceBlitz" => &[("death", 2), ("blood", 2), ("water", 3)],
        "bloodBlitz" => &[("death", 2), ("blood", 4)],
        "iceBarrage" => &[("death", 4), ("blood", 2), ("water", 6)],
        "bloodBarrage" => &[("death", 4), ("blood", 4)],
        _ => &[],
    }
}

fn has_spell_runes(p: &Player, spell: &str) -> bool {
    spell_runes(spell)
        .iter()
        .all(|(id, qty)| inventory_count(&p.inventory, id) >= *qty)
}

fn consume_spell_runes(p: &mut Player, spell: &str) -> bool {
    if !has_spell_runes(p, spell) {
        return false;
    }
    let mut inv = p.inventory.clone();
    for (id, qty) in spell_runes(spell) {
        if !inventory_remove(&mut inv, id, *qty) {
            return false;
        }
    }
    p.inventory = inv;
    true
}

fn ranged_ammo(p: &Player) -> Option<(&str, u32)> {
    let ammo = p.equipment.get("ammo")?;
    match (p.weapon.as_str(), ammo.id.as_str()) {
        ("rcb", "dbolts") => Some(("dbolts", ammo.amount)),
        ("msb", "rarrows") => Some(("rarrows", ammo.amount)),
        _ => None,
    }
}

fn consume_ammo(p: &mut Player, amount: u32) -> bool {
    let Some((_, available)) = ranged_ammo(p) else {
        return false;
    };
    if available < amount {
        return false;
    }
    if let Some(ammo) = p.equipment.get_mut("ammo") {
        ammo.amount -= amount;
        if ammo.amount == 0 {
            p.equipment.remove("ammo");
        }
        true
    } else {
        false
    }
}

fn sync_consumable_counters(p: &mut Player) {
    p.food = inventory_count(&p.inventory, "shark").min(u8::MAX as u32) as u8;
}

fn drink_potion(p: &mut Player, index: usize) -> Result<(), String> {
    let item = p
        .inventory
        .get(index)
        .and_then(|s| s.as_ref())
        .cloned()
        .ok_or("Nothing is in that inventory slot.")?;
    let info = item_info(&item.id).ok_or("That potion is unknown.")?;
    if info.doses == 0 || item.amount == 0 || item.amount > info.doses {
        return Err("That item is not a drinkable potion.".into());
    }
    let base = base_levels(&p.loadout);
    match item.id.as_str() {
        "supatk" => {
            p.attack_current = p
                .attack_current
                .max(base.attack + 5 + (base.attack * 15) / 100);
        }
        "supstr" => {
            p.strength_current = p
                .strength_current
                .max(base.strength + 5 + (base.strength * 15) / 100);
        }
        "supdef" => {
            p.defence_current = p
                .defence_current
                .max(base.defence + 5 + (base.defence * 15) / 100);
        }
        "ranging" => {
            p.ranged_current = p
                .ranged_current
                .max(base.ranged + 4 + (base.ranged * 10) / 100);
        }
        "prayer" => {
            p.prayer_points =
                (p.prayer_points + (base.prayer / 4 + 7) as f32).min(base.prayer as f32);
        }
        "restore" => {
            p.prayer_points =
                (p.prayer_points + (base.prayer / 4 + 8) as f32).min(base.prayer as f32);
            p.attack_current = p.attack_current.max(base.attack);
            p.strength_current = p.strength_current.max(base.strength);
            p.defence_current = p.defence_current.max(base.defence);
            p.ranged_current = p.ranged_current.max(base.ranged);
            p.magic_current = p.magic_current.max(base.magic);
        }
        "brew" => {
            let heal = (base.hp * 15) / 100 + 2;
            p.hp = (p.hp + heal).min(base.hp + heal);
            p.defence_current = p
                .defence_current
                .max(base.defence + (base.defence * 20) / 100 + 2);
            p.attack_current = (p.attack_current - ((base.attack * 10) / 100 + 2)).max(1);
            p.strength_current = (p.strength_current - ((base.strength * 10) / 100 + 2)).max(1);
            p.ranged_current = (p.ranged_current - ((base.ranged * 10) / 100 + 2)).max(1);
            p.magic_current = (p.magic_current - ((base.magic * 10) / 100 + 2)).max(1);
        }
        _ => return Err("That item is not a supported combat potion.".into()),
    }
    if let Some(slot) = p.inventory.get_mut(index) {
        if let Some(s) = slot.as_mut() {
            s.amount -= 1;
            if s.amount == 0 {
                *slot = None;
            }
        }
    }
    sync_consumable_counters(p);
    Ok(())
}

#[derive(Clone, Copy)]
struct PrayerInfo {
    level: i32,
    drain_seconds: f32,
    group: &'static str,
    overhead: Option<&'static str>,
}

fn prayer_info(id: &str) -> Option<PrayerInfo> {
    let p = match id {
        "thick" => PrayerInfo {
            level: 1,
            drain_seconds: 12.0,
            group: "def",
            overhead: None,
        },
        "burst" => PrayerInfo {
            level: 4,
            drain_seconds: 12.0,
            group: "str",
            overhead: None,
        },
        "clarity" => PrayerInfo {
            level: 7,
            drain_seconds: 12.0,
            group: "atk",
            overhead: None,
        },
        "rock" => PrayerInfo {
            level: 10,
            drain_seconds: 6.0,
            group: "def",
            overhead: None,
        },
        "super" => PrayerInfo {
            level: 13,
            drain_seconds: 6.0,
            group: "str",
            overhead: None,
        },
        "improved" => PrayerInfo {
            level: 16,
            drain_seconds: 6.0,
            group: "atk",
            overhead: None,
        },
        "rapidrestore" => PrayerInfo {
            level: 19,
            drain_seconds: 26.0,
            group: "rapidrestore",
            overhead: None,
        },
        "rapidheal" => PrayerInfo {
            level: 22,
            drain_seconds: 18.0,
            group: "rapidheal",
            overhead: None,
        },
        "protitem" => PrayerInfo {
            level: 25,
            drain_seconds: 18.0,
            group: "protitem",
            overhead: None,
        },
        "steel" => PrayerInfo {
            level: 28,
            drain_seconds: 3.0,
            group: "def",
            overhead: None,
        },
        "ultimate" => PrayerInfo {
            level: 31,
            drain_seconds: 3.0,
            group: "str",
            overhead: None,
        },
        "incredible" => PrayerInfo {
            level: 34,
            drain_seconds: 3.0,
            group: "atk",
            overhead: None,
        },
        "pmagic" => PrayerInfo {
            level: 37,
            drain_seconds: 3.0,
            group: "overhead",
            overhead: Some("pmagic"),
        },
        "pmissiles" => PrayerInfo {
            level: 40,
            drain_seconds: 3.0,
            group: "overhead",
            overhead: Some("pmissiles"),
        },
        "pmelee" => PrayerInfo {
            level: 43,
            drain_seconds: 4.0,
            group: "overhead",
            overhead: Some("pmelee"),
        },
        "retribution" => PrayerInfo {
            level: 46,
            drain_seconds: 12.0,
            group: "overhead",
            overhead: Some("retribution"),
        },
        "redemption" => PrayerInfo {
            level: 49,
            drain_seconds: 6.0,
            group: "overhead",
            overhead: Some("redemption"),
        },
        "smite" => PrayerInfo {
            level: 52,
            drain_seconds: 2.0,
            group: "overhead",
            overhead: Some("smite"),
        },
        _ => return None,
    };
    Some(p)
}

fn active_overhead(p: &Player) -> Option<String> {
    p.active_prayers
        .iter()
        .rev()
        .find_map(|id| prayer_info(id).and_then(|info| info.overhead.map(str::to_string)))
}

fn set_prayer(p: &mut Player, id: &str, enabled: bool, tick: u64) -> Result<(), String> {
    let info = prayer_info(id).ok_or("Unknown prayer.")?;
    let base = base_levels(&p.loadout);
    if enabled {
        if p.prayer_points <= 0.0 {
            return Err("You have run out of Prayer points.".into());
        }
        if base.prayer < info.level {
            return Err("Your Prayer level is too low.".into());
        }
        if info.overhead.is_some() && tick < p.prayer_block_until {
            return Err("Your protection prayers are temporarily disabled.".into());
        }
        p.active_prayers
            .retain(|other| prayer_info(other).is_none_or(|old| old.group != info.group));
        if !p.active_prayers.iter().any(|x| x == id) {
            p.active_prayers.push(id.to_string());
        }
    } else {
        p.active_prayers.retain(|x| x != id);
    }
    p.overhead = active_overhead(p);
    Ok(())
}

fn drain_prayers(p: &mut Player, tick: u64) {
    if p.active_prayers.is_empty() || tick % 2 != 0 {
        return;
    }
    let drain = p
        .active_prayers
        .iter()
        .filter_map(|id| prayer_info(id))
        .map(|info| 0.6f32 / info.drain_seconds)
        .sum::<f32>();
    p.prayer_points = (p.prayer_points - drain).max(0.0);
    if p.prayer_points <= 0.0 {
        p.active_prayers.clear();
        p.overhead = None;
    }
}

fn valid_spell(value: Option<String>) -> Option<String> {
    value.filter(|v| {
        matches!(
            v.as_str(),
            "iceRush"
                | "bloodRush"
                | "iceBurst"
                | "bloodBurst"
                | "iceBlitz"
                | "bloodBlitz"
                | "iceBarrage"
                | "bloodBarrage"
        )
    })
}

fn valid_weapon(value: &str) -> bool {
    matches!(
        value,
        "whip"
            | "dds"
            | "dscim"
            | "rscim"
            | "gmaul"
            | "ags"
            | "rcb"
            | "msb"
            | "ancstaff"
            | "unarmed"
    )
}

fn weapon_style(weapon: &str, requested: CombatStyle, spell: &Option<String>) -> CombatStyle {
    if weapon == "ancstaff" && spell.is_some() {
        CombatStyle::Magic
    } else if matches!(weapon, "rcb" | "msb") {
        CombatStyle::Ranged
    } else if requested == CombatStyle::Magic && spell.is_some() {
        CombatStyle::Magic
    } else {
        CombatStyle::Melee
    }
}

fn attack_range_for(p: &Player) -> i32 {
    match p.combat_style {
        CombatStyle::Melee => 1,
        CombatStyle::Ranged => {
            if p.weapon == "rcb" {
                8
            } else {
                7
            }
        }
        CombatStyle::Magic => 10,
    }
}

fn attack_speed_for(p: &Player) -> u64 {
    match p.weapon.as_str() {
        "gmaul" => 7,
        "ags" | "rcb" => 6,
        "ancstaff" => 5,
        _ => 4,
    }
}

fn spell_max(spell: Option<&str>) -> i32 {
    match spell {
        Some("iceRush") => 16,
        Some("bloodRush") => 15,
        Some("iceBurst") => 22,
        Some("bloodBurst") => 21,
        Some("iceBlitz") => 26,
        Some("bloodBlitz") => 25,
        Some("iceBarrage") => 30,
        Some("bloodBarrage") => 29,
        _ => 20,
    }
}

fn spell_freeze_ticks(spell: Option<&str>) -> u64 {
    match spell {
        Some("iceRush") => 8,
        Some("iceBurst") => 16,
        Some("iceBlitz") => 25,
        Some("iceBarrage") => 33,
        _ => 0,
    }
}

fn scaled_max_hit(p: &Player) -> i32 {
    let base = base_levels(&p.loadout);
    let raw = base_max_hit(p) as f32;
    match p.combat_style {
        CombatStyle::Melee => {
            (raw * (p.strength_current.max(1) as f32 / base.strength.max(1) as f32)).floor() as i32
        }
        CombatStyle::Ranged => {
            (raw * (p.ranged_current.max(1) as f32 / base.ranged.max(1) as f32)).floor() as i32
        }
        CombatStyle::Magic => raw as i32,
    }
}

fn accuracy_percent(a: &Player, t: &Player, special: bool) -> u64 {
    let ab = base_levels(&a.loadout);
    let tb = base_levels(&t.loadout);
    let (attack_cur, attack_base) = match a.combat_style {
        CombatStyle::Melee => (a.attack_current, ab.attack),
        CombatStyle::Ranged => (a.ranged_current, ab.ranged),
        CombatStyle::Magic => (a.magic_current, ab.magic),
    };
    let defence_cur = match a.combat_style {
        CombatStyle::Magic => ((t.magic_current * 7 + t.defence_current * 3) / 10).max(1),
        _ => t.defence_current.max(1),
    };
    let defence_base = match a.combat_style {
        CombatStyle::Magic => ((tb.magic * 7 + tb.defence * 3) / 10).max(1),
        _ => tb.defence.max(1),
    };
    let base_acc = match a.combat_style {
        CombatStyle::Melee => 72.0,
        CombatStyle::Ranged => 68.0,
        CombatStyle::Magic => 70.0,
    };
    let mut acc = base_acc * (attack_cur.max(1) as f32 / attack_base.max(1) as f32)
        / (defence_cur as f32 / defence_base as f32);
    if special {
        acc += 12.0;
    }
    acc.clamp(5.0, 95.0).round() as u64
}

fn base_max_hit(p: &Player) -> i32 {
    match p.combat_style {
        CombatStyle::Magic => spell_max(p.spell.as_deref()),
        CombatStyle::Ranged => {
            if p.weapon == "rcb" {
                31
            } else {
                20
            }
        }
        CombatStyle::Melee => match p.weapon.as_str() {
            "ags" => 45,
            "gmaul" => 32,
            "dds" => 31,
            "whip" => 30,
            "dscim" => 30,
            "rscim" => 24,
            _ => 12,
        },
    }
}

fn spec_cost(weapon: &str) -> Option<f32> {
    match weapon {
        "dds" => Some(25.0),
        "dscim" | "msb" => Some(55.0),
        "gmaul" | "ags" => Some(50.0),
        _ => None,
    }
}

fn in_attack_range(c: &Collision, a: &Player, t: &Player) -> bool {
    let from = Tile::new(a.x as i32, a.y as i32);
    let to = Tile::new(t.x as i32, t.y as i32);
    let range = attack_range_for(a);
    if range <= 1 {
        c.melee_clear(from, to) && from != to
    } else {
        let d = (from.x - to.x).abs().max((from.y - to.y).abs());
        d >= 1 && d <= range && c.has_los(from, to)
    }
}

fn deterministic_roll(seed: u64) -> u64 {
    let mut x = seed.wrapping_add(0x9E3779B97F4A7C15);
    x = (x ^ (x >> 30)).wrapping_mul(0xBF58476D1CE4E5B9);
    x = (x ^ (x >> 27)).wrapping_mul(0x94D049BB133111EB);
    x ^ (x >> 31)
}

fn resident_chat(p: &Player, tick: u64, target_name: Option<&str>) -> String {
    const SOCIAL: &[&str] = &[
        "one sec banking",
        "who took my spot lol",
        "ge fashion is serious business",
        "brb changing setup",
        "that cape is doing a lot",
        "nahhh the helm stays",
        "buying confidence 10k",
        "why is everyone skulled out there",
        "clean setup tbh",
        "im not going out there yet",
        "bro brought the whole bank",
        "let me cook",
        "that spec was criminal",
        "sit respectfully",
        "you really ran back to ge lol",
        "gf though",
        "not the protect prayer",
        "im changing gear chill",
    ];
    const PK: &[&str] = &[
        "gf",
        "sit lol",
        "nice prayer switch",
        "bro ate at 70",
        "come back out",
        "that freeze was clean",
        "you had spec and did THAT",
        "respect the risk",
        "no way that hit zero",
        "okay that combo was nasty",
        "dont run now",
        "one more",
        "clean switch",
        "my rng is cooked",
        "you got saved by that eat",
        "fair fight? probably not",
    ];
    let mut seed = tick ^ (p.id.as_u128() as u64).rotate_left(17);
    seed ^= seed >> 13;
    let pker = p
        .resident
        .as_ref()
        .is_some_and(|r| r.role == ResidentRole::Pker);
    if pker {
        if let Some(name) = target_name {
            let lines = [
                format!("{name} come back out"),
                format!("{name} that prayer switch lol"),
                format!("gf {name}"),
                format!("{name} you eating already?"),
                format!("{name} clean switch tbh"),
            ];
            if tick % 3 == 0 {
                return lines[(seed as usize) % lines.len()].clone();
            }
        }
        return PK[(seed as usize) % PK.len()].into();
    }
    SOCIAL[(seed as usize) % SOCIAL.len()].into()
}
fn make_resident(name: &str, role: ResidentRole, home: Tile, personality: u8) -> Player {
    let id = Uuid::new_v4();
    let pker = role == ResidentRole::Pker;
    let (loadout, weapon, style, spell) = match personality % 4 {
        0 => ("main", "whip", CombatStyle::Melee, None),
        1 => ("ranger", "rcb", CombatStyle::Ranged, None),
        2 => (
            "mage",
            "ancstaff",
            CombatStyle::Magic,
            Some("iceBarrage".to_string()),
        ),
        _ => ("main", "ags", CombatStyle::Melee, None),
    };
    let levels = base_levels(loadout);
    Player {
        id,
        token: format!("resident-{id}"),
        name: name.into(),
        x: home.x as f32,
        y: home.y as f32,
        hp: levels.hp,
        attack_current: levels.attack,
        strength_current: levels.strength,
        defence_current: levels.defence,
        ranged_current: levels.ranged,
        magic_current: levels.magic,
        prayer_points: levels.prayer as f32,
        kills: 0,
        deaths: 0,
        path: VecDeque::new(),
        motion: vec![home],
        motion_tick: 0,
        position_epoch: 0,
        command_seq: 0,
        run_on: pker,
        run_energy: 100.,
        attack_target: None,
        follow_target: None,
        protect_until: 0,
        last_attack_tick: None,
        simulated: true,
        loadout: loadout.into(),
        weapon: weapon.into(),
        combat_style: style,
        spell,
        overhead: None,
        active_prayers: Vec::new(),
        prayer_block_until: 0,
        spec_energy: 100.,
        special_pending: false,
        food: 18,
        last_eat_tick: u64::MAX,
        last_pot_tick: u64::MAX,
        frozen_until: 0,
        inventory: vec![None; INVENTORY_SLOTS],
        bank: Vec::new(),
        equipment: starter_equipment(),
        appearance: appearance_for(name),
        resident: Some(ResidentAi {
            role,
            home,
            next_action: 2 + (personality as u64 % 5),
            next_chat: 10 + (personality as u64 % 17),
            personality,
        }),
    }
}
fn seed_residents(world: &mut World, c: &Collision, count: usize) {
    let social = [
        ("bankstanding", 46, 42),
        ("RuneRicky", 50, 42),
        ("xLilMagex", 42, 46),
        ("WhipEnjoyer", 53, 46),
        ("NoXpWaste", 43, 48),
        ("CapeCheck", 52, 48),
        ("PrayerPot", 48, 41),
        ("BankPls", 48, 53),
        ("SirLagALot", 44, 51),
        ("IronMaybe", 51, 51),
    ];
    let pk = [
        ("SpecNRun", 48, 36),
        ("IceYouOut", 60, 48),
        ("RangeTank", 48, 60),
        ("DdsEnjoyer", 36, 48),
        ("AgsMaybe", 57, 40),
        ("EatAt71", 39, 57),
        ("VengSoon", 57, 57),
        ("ZeroHit", 39, 39),
        ("ClickBetter", 62, 52),
        ("RiskIt", 34, 44),
    ];
    for (i, (name, x, y)) in social.into_iter().take(count.min(10)).enumerate() {
        let t = Tile::new(x, y);
        if !c.blocked(x, y) {
            let p = make_resident(name, ResidentRole::Social, t, i as u8);
            world.players.insert(p.id, p);
        }
    }
    for (i, (name, x, y)) in pk
        .into_iter()
        .take(count.saturating_sub(10).min(10))
        .enumerate()
    {
        let t = Tile::new(x, y);
        if !c.blocked(x, y) {
            let p = make_resident(name, ResidentRole::Pker, t, (i + 20) as u8);
            world.players.insert(p.id, p);
        }
    }
}
fn resident_think(w: &mut World, c: &Collision, events: &mut Vec<String>) {
    let tick = w.tick;
    let ids = w
        .players
        .iter()
        .filter_map(|(id, p)| p.simulated.then_some(*id))
        .collect::<Vec<_>>();
    for id in ids {
        let (role, home, next_action, next_chat, personality, hp, food) = {
            let p = &w.players[&id];
            let r = p.resident.as_ref().unwrap();
            (
                r.role,
                r.home,
                r.next_action,
                r.next_chat,
                r.personality,
                p.hp,
                p.food,
            )
        };
        if tick >= next_chat {
            let target_name = w.players[&id]
                .attack_target
                .and_then(|tid| w.players.get(&tid))
                .map(|p| p.name.as_str());
            let text = resident_chat(&w.players[&id], tick, target_name);
            let name = w.players[&id].name.clone();
            events.push(serialize(&ServerMessage::ResidentChat {
                player_id: id,
                name,
                text,
            }));
            if let Some(r) = w.players.get_mut(&id).and_then(|p| p.resident.as_mut()) {
                r.next_chat = tick + 18 + ((personality as u64 * 7 + tick) % 35);
            }
        }
        if tick < next_action {
            continue;
        }
        let target = if role == ResidentRole::Pker {
            w.players
                .iter()
                .filter(|(tid, p)| **tid != id && zone_at(p.x, p.y) == Zone::Pvp)
                .min_by_key(|(_, q)| {
                    let p = &w.players[&id];
                    ((q.x - p.x).abs() + (q.y - p.y).abs()) as i32
                })
                .map(|(tid, _)| *tid)
        } else {
            None
        };
        let target_style = target.and_then(|tid| w.players.get(&tid).map(|p| p.combat_style));
        let p = w.players.get_mut(&id).unwrap();
        if let Some(r) = p.resident.as_mut() {
            r.next_action = tick + 2 + ((tick + personality as u64) % 5);
        }
        if hp < 55 && food > 0 && tick.saturating_sub(p.last_eat_tick) >= 3 {
            p.hp = (p.hp + 20).min(MAX_HP);
            p.food -= 1;
            p.last_eat_tick = tick;
            p.attack_target = None;
            p.path.clear();
        }
        match role {
            ResidentRole::Social => {
                p.attack_target = None;
                p.overhead = None;
                let dx = ((tick as i32 + personality as i32 * 3) % 5) - 2;
                let dy = (((tick / 3) as i32 + personality as i32 * 5) % 5) - 2;
                let to = Tile::new(home.x + dx, home.y + dy);
                if zone_at(to.x as f32, to.y as f32) == Zone::Safe {
                    if let Some(path) = c.path(Tile::new(p.x as i32, p.y as i32), to, true) {
                        p.path = path;
                    }
                }
            }
            ResidentRole::Pker => {
                let here = zone_at(p.x, p.y);
                if p.hp < 35 {
                    p.attack_target = None;
                    p.overhead = None;
                    if let Some(path) =
                        c.path(Tile::new(p.x as i32, p.y as i32), Tile::new(48, 42), true)
                    {
                        p.path = path;
                    }
                } else if here == Zone::Safe {
                    p.attack_target = None;
                    p.overhead = None;
                    if let Some(path) = c.path(Tile::new(p.x as i32, p.y as i32), home, true) {
                        p.path = path;
                    }
                } else {
                    p.attack_target = target;
                    let phase = ((tick / 10) + personality as u64) % 3;
                    match phase {
                        0 => {
                            p.weapon = "ancstaff".into();
                            p.combat_style = CombatStyle::Magic;
                            p.spell = Some(
                                if personality % 2 == 0 {
                                    "iceBarrage"
                                } else {
                                    "bloodBarrage"
                                }
                                .into(),
                            );
                        }
                        1 => {
                            p.weapon = "rcb".into();
                            p.combat_style = CombatStyle::Ranged;
                            p.spell = None;
                        }
                        _ => {
                            p.weapon = if p.spec_energy >= 50. && personality % 3 == 0 {
                                "ags"
                            } else if p.spec_energy >= 25. && personality % 3 == 1 {
                                "dds"
                            } else {
                                "whip"
                            }
                            .into();
                            p.combat_style = CombatStyle::Melee;
                            p.spell = None;
                            p.special_pending = spec_cost(&p.weapon)
                                .is_some_and(|cost| p.spec_energy >= cost)
                                && tick % 7 == personality as u64 % 7;
                        }
                    }
                    p.overhead = target_style.map(|s| {
                        match s {
                            CombatStyle::Melee => "pmelee",
                            CombatStyle::Ranged => "pmissiles",
                            CombatStyle::Magic => "pmagic",
                        }
                        .into()
                    });
                }
            }
        }
    }
}

fn player_view(p: &Player) -> PlayerView {
    PlayerView {
        id: p.id,
        name: p.name.clone(),
        x: p.x,
        y: p.y,
        hp: p.hp,
        kills: p.kills,
        deaths: p.deaths,
        zone: zone_at(p.x, p.y),
        motion: p.motion.clone(),
        motion_tick: p.motion_tick,
        position_epoch: p.position_epoch,
        command_seq: p.command_seq,
        destination: p.path.back().copied(),
        moving: !p.path.is_empty(),
        run: p.run_energy,
        run_on: p.run_on,
        attack_target: p.attack_target,
        simulated: p.simulated,
        loadout: p.loadout.clone(),
        weapon: p.weapon.clone(),
        combat_style: p.combat_style,
        spell: p.spell.clone(),
        overhead: p.overhead.clone(),
        active_prayers: p.active_prayers.clone(),
        spec: p.spec_energy,
        level: combat_level_for(p),
        attack_current: p.attack_current,
        strength_current: p.strength_current,
        defence_current: p.defence_current,
        ranged_current: p.ranged_current,
        magic_current: p.magic_current,
        prayer_points: p.prayer_points,
        equipment: {
            let mut eq = p.equipment.clone();
            if p.simulated && valid_weapon(&p.weapon) && p.weapon != "unarmed" {
                eq.insert(
                    "weapon".into(),
                    InventoryItem {
                        id: p.weapon.clone(),
                        amount: 1,
                    },
                );
                if item_info(&p.weapon).is_some_and(|i| i.two_handed) {
                    eq.remove("shield");
                }
            }
            eq
        },
        appearance: p.appearance.clone(),
    }
}

fn serialize<T: Serialize>(value: &T) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| {
        r#"{"type":"error","code":"serialization","message":"Server serialization failed."}"#.into()
    })
}

async fn health(State(state): State<AppState>) -> impl IntoResponse {
    let world = state.world.read().await;
    Json(Health {
        status: "ok",
        version: VERSION,
        tick_ms: TICK_MS,
        players: world.players.values().filter(|p| !p.simulated).count(),
        residents: world.players.values().filter(|p| p.simulated).count(),
        tick: world.tick,
    })
}

async fn world_info() -> Json<WorldInfo> {
    Json(WorldInfo {
        map_size: 96,
        tick_ms: TICK_MS,
        safe_zone: safe_zone(),
    })
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    headers: HeaderMap,
    State(state): State<AppState>,
) -> impl IntoResponse {
    let origin = headers
        .get("origin")
        .and_then(|value| value.to_str().ok())
        .unwrap_or("");
    let allowed = origin.is_empty() || state.allowed_origins.iter().any(|value| value == origin);
    if !allowed {
        warn!(%origin, "rejected websocket origin");
        return (StatusCode::FORBIDDEN, "origin not allowed").into_response();
    }
    ws.max_message_size(16 * 1024)
        .max_frame_size(16 * 1024)
        .on_upgrade(move |socket| connection(socket, state))
        .into_response()
}

async fn connection(socket: WebSocket, state: AppState) {
    let (mut sink, mut stream) = socket.split();

    let first = match time::timeout(Duration::from_secs(10), stream.next()).await {
        Ok(Some(Ok(Message::Text(text)))) => text,
        _ => {
            let _ = sink
                .send(Message::Close(Some(CloseFrame {
                    code: close_code::POLICY,
                    reason: "hello required within 10 seconds".into(),
                })))
                .await;
            return;
        }
    };

    let hello: ClientMessage = match serde_json::from_str(first.as_str()) {
        Ok(ClientMessage::Hello {
            name,
            resume_token,
            protocol,
        }) => ClientMessage::Hello {
            name,
            resume_token,
            protocol,
        },
        _ => {
            let _ = sink
                .send(Message::Text(
                    serialize(&ServerMessage::Error {
                        code: "bad_hello",
                        message: "First message must be a valid hello.",
                    })
                    .into(),
                ))
                .await;
            return;
        }
    };

    let ClientMessage::Hello {
        name,
        resume_token,
        protocol,
    } = hello
    else {
        unreachable!()
    };
    if protocol != 3 {
        let _ = sink
            .send(Message::Text(
                serialize(&ServerMessage::Error {
                    code: "client_update_required",
                    message: "Movement update available. Refresh OLDSKOOL to join.",
                })
                .into(),
            ))
            .await;
        let _ = sink
            .send(Message::Close(Some(CloseFrame {
                code: close_code::POLICY,
                reason: "client update required".into(),
            })))
            .await;
        return;
    }
    let name = clean_name(&name);
    if name.is_empty() {
        let _ = sink
            .send(Message::Text(
                serialize(&ServerMessage::Error {
                    code: "bad_name",
                    message: "Name must contain letters or numbers.",
                })
                .into(),
            ))
            .await;
        return;
    }

    let id = Uuid::new_v4();
    let (token, view) = {
        let mut world = state.world.write().await;
        let requested = resume_token
            .filter(|t| valid_token(t))
            .filter(|t| world.profiles.contains_key(t));
        let token = requested.unwrap_or_else(|| Uuid::new_v4().to_string());

        if world.players.values().filter(|p| !p.simulated).count() >= 128
            || world.players.values().any(|p| p.token == token)
        {
            drop(world);
            let _ = sink
                .send(Message::Text(
                    serialize(&ServerMessage::Error {
                        code: "profile_in_use",
                        message: "That local profile is already connected.",
                    })
                    .into(),
                ))
                .await;
            return;
        }

        let profile = migrate_profile(
            world
                .profiles
                .get(&token)
                .cloned()
                .unwrap_or_else(|| PersistedProfile {
                    name: name.clone(),
                    x: GE_CENTER,
                    y: 42.0,
                    kills: 0,
                    deaths: 0,
                    hp: MAX_HP,
                    prayer_points: 99.0,
                    account_version: 0,
                    inventory: Vec::new(),
                    bank: Vec::new(),
                    equipment: HashMap::new(),
                    appearance: Appearance::default(),
                }),
            &name,
        );

        let pos = state.collision.legal_position(profile.x, profile.y);
        let weapon = equipment_weapon(&profile.equipment);
        let food = inventory_count(&profile.inventory, "shark").min(u8::MAX as u32) as u8;
        let levels = base_levels("main");
        let player = Player {
            id,
            token: token.clone(),
            name,
            x: pos.x as f32,
            y: pos.y as f32,
            hp: profile.hp.clamp(1, levels.hp),
            attack_current: levels.attack,
            strength_current: levels.strength,
            defence_current: levels.defence,
            ranged_current: levels.ranged,
            magic_current: levels.magic,
            prayer_points: profile.prayer_points.clamp(0.0, levels.prayer as f32),
            kills: profile.kills,
            deaths: profile.deaths,
            path: VecDeque::new(),
            motion: vec![pos],
            motion_tick: world.tick,
            position_epoch: 0,
            command_seq: 0,
            run_on: true,
            run_energy: 100.0,
            attack_target: None,
            follow_target: None,
            protect_until: 0,
            last_attack_tick: None,
            simulated: false,
            loadout: "main".into(),
            weapon,
            combat_style: CombatStyle::Melee,
            spell: None,
            overhead: None,
            active_prayers: Vec::new(),
            prayer_block_until: 0,
            spec_energy: 100.0,
            special_pending: false,
            food,
            last_eat_tick: u64::MAX,
            last_pot_tick: u64::MAX,
            frozen_until: 0,
            inventory: profile.inventory.clone(),
            bank: profile.bank.clone(),
            equipment: profile.equipment.clone(),
            appearance: profile.appearance.clone(),
            resident: None,
        };
        let view = player_view(&player);
        world.profiles.insert(token.clone(), profile);
        world.players.insert(id, player);
        (token, view)
    };

    info!(%id, name=%view.name, "player connected");

    // Subscribe before initial sync so no join/tick event is lost between sends.
    let mut rx = state.tx.subscribe();
    let welcome = ServerMessage::Welcome {
        id,
        resume_token: &token,
        tick_ms: TICK_MS,
        version: VERSION,
        protocol: 3,
        world_hash: state.collision.hash(),
        safe_zone: safe_zone(),
        server_time_ms: now_ms(),
    };
    if sink
        .send(Message::Text(serialize(&welcome).into()))
        .await
        .is_err()
    {
        disconnect(id, &state).await;
        return;
    }

    let account = {
        let world = state.world.read().await;
        let player = world.players.get(&id).expect("connected player");
        account_message(player, &world.ge_offers)
    };
    if sink.send(Message::Text(account.into())).await.is_err() {
        disconnect(id, &state).await;
        return;
    }

    let initial = snapshot_message(&state).await;
    if sink
        .send(Message::Text(initial.clone().into()))
        .await
        .is_err()
    {
        disconnect(id, &state).await;
        return;
    }
    // Presence changes need not wait for the next 600 ms movement tick.
    let _ = state.tx.send(initial);

    let mut stopping = state.shutdown.subscribe();
    let mut idle = time::interval(Duration::from_secs(20));
    let mut last_seen = Instant::now();
    let mut window_start = Instant::now();
    let mut command_count = 0u32;

    loop {
        tokio::select! {
            _=stopping.changed()=>{let _=sink.send(Message::Close(Some(CloseFrame{code:1012,reason:"server restart".into()}))).await;break;},
            _=idle.tick()=>{if last_seen.elapsed()>Duration::from_secs(90){break;}if sink.send(Message::Ping(Vec::new().into())).await.is_err(){break;}},
            incoming = stream.next() => {
                let Some(result) = incoming else { break };
                last_seen=Instant::now();
                let message = match result {
                    Ok(m) => m,
                    Err(err) => {
                        warn!(%id, ?err, "websocket read error");
                        break;
                    }
                };

                match message {
                    Message::Text(text) => {
                        if window_start.elapsed() >= Duration::from_secs(10) {
                            window_start = Instant::now();
                            command_count = 0;
                        }
                        command_count += 1;
                        if command_count > 100 {
                            if command_count>120 {break;}
                            if command_count!=101 {continue;}
                            let msg = serialize(&ServerMessage::Error {
                                code: "rate_limited",
                                message: "Too many commands.",
                            });
                            let _ = sink.send(Message::Text(msg.into())).await;
                            continue;
                        }

                        let command: ClientMessage = match serde_json::from_str(text.as_str()) {
                            Ok(c) => c,
                            Err(_) => {
                                let msg = serialize(&ServerMessage::Error {
                                    code: "bad_message",
                                    message: "Invalid command.",
                                });
                                let _ = sink.send(Message::Text(msg.into())).await;
                                continue;
                            }
                        };
                        let durable = command.durable();
                        let reply = handle_command(id, command, &state).await;
                        if durable {
                            persist(&state).await;
                        }
                        if let Some(reply) = reply {
                            if sink.send(Message::Text(reply.into())).await.is_err() {
                                break;
                            }
                        }
                    }
                    Message::Ping(data) => {
                        if sink.send(Message::Pong(data)).await.is_err() { break; }
                    }
                    Message::Close(_) => break,
                    Message::Binary(_) | Message::Pong(_) => {}
                }
            }
            outbound = rx.recv() => {
                match outbound {
                    Ok(text) => {
                        if sink.send(Message::Text(text.into())).await.is_err() { break; }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => {
                        let snapshot = snapshot_message(&state).await;
                        if sink.send(Message::Text(snapshot.into())).await.is_err() { break; }
                    }
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
        }
    }

    disconnect(id, &state).await;
}

async fn handle_command(id: Uuid, command: ClientMessage, state: &AppState) -> Option<String> {
    match command {
        ClientMessage::Hello { .. } => Some(serialize(&ServerMessage::Error {
            code: "already_hello",
            message: "Connection is already initialized.",
        })),
        ClientMessage::Walk { x, y, seq, run_on } => {
            let Some(to) = state.collision.tile(x, y) else {
                return Some(serialize(&ServerMessage::Error {
                    code: "bad_move",
                    message: "Choose a tile inside the world.",
                }));
            };
            let mut w = state.world.write().await;
            let tick = w.tick;
            let p = w.players.get_mut(&id)?;
            if seq <= p.command_seq {
                return Some(serialize(&ServerMessage::Route {
                    seq: p.command_seq,
                    tick,
                    path: p.path.iter().copied().collect(),
                    player: player_view(p),
                }));
            }
            p.command_seq = seq;
            p.attack_target = None;
            p.follow_target = None;
            p.run_on = run_on;
            let from = Tile::new(p.x as i32, p.y as i32);
            match state.collision.path(from, to, true) {
                Some(path) => {
                    p.path = path;
                    Some(serialize(&ServerMessage::Route {
                        seq,
                        tick,
                        path: p.path.iter().copied().collect(),
                        player: player_view(p),
                    }))
                }
                None => {
                    p.path.clear();
                    Some(serialize(&ServerMessage::Error {
                        code: "unreachable",
                        message: "You cannot reach that tile.",
                    }))
                }
            }
        }
        ClientMessage::Stop { seq } => {
            let mut w = state.world.write().await;
            let tick = w.tick;
            let p = w.players.get_mut(&id)?;
            if seq > p.command_seq {
                p.command_seq = seq;
                p.path.clear();
                p.attack_target = None;
                p.follow_target = None;
            }
            Some(serialize(&ServerMessage::Route {
                seq: p.command_seq,
                tick,
                path: p.path.iter().copied().collect(),
                player: player_view(p),
            }))
        }
        ClientMessage::Run { enabled } => {
            let mut w = state.world.write().await;
            if let Some(p) = w.players.get_mut(&id) {
                p.run_on = enabled;
            }
            None
        }
        ClientMessage::Prayer {
            id: prayer_id,
            enabled,
        } => {
            let mut w = state.world.write().await;
            let tick = w.tick;
            let Some(p) = w.players.get_mut(&id) else {
                return None;
            };
            if p.simulated {
                return None;
            }
            match set_prayer(p, &prayer_id, enabled, tick) {
                Ok(()) => None,
                Err(_) => Some(account_error(
                    "prayer",
                    "That prayer cannot be changed right now.",
                )),
            }
        }
        ClientMessage::InventoryMove { from, to } => {
            let mut w = state.world.write().await;
            let World {
                players, ge_offers, ..
            } = &mut *w;
            let Some(p) = players.get_mut(&id) else {
                return None;
            };
            let (from, to) = (from as usize, to as usize);
            if from >= INVENTORY_SLOTS || to >= INVENTORY_SLOTS {
                return Some(account_error(
                    "inventory_move",
                    "That inventory move is invalid.",
                ));
            }
            p.inventory.swap(from, to);
            Some(account_message(p, ge_offers))
        }
        ClientMessage::Follow { target_id, seq } => {
            let mut w = state.world.write().await;
            if target_id == id || !w.players.contains_key(&target_id) {
                return None;
            }
            if let Some(p) = w.players.get_mut(&id) {
                if seq > p.command_seq {
                    p.command_seq = seq;
                    p.follow_target = Some(target_id);
                    p.attack_target = None;
                    p.path.clear();
                }
            }
            None
        }
        ClientMessage::Resync {} => Some(snapshot_message(state).await),
        // Absolute position writes were the source of desync loops. Never accept them.
        ClientMessage::Move {} => Some(serialize(&ServerMessage::Error {
            code: "move_rejected",
            message: "Absolute movement is not accepted; request a destination.",
        })),
        ClientMessage::Attack {
            target_id,
            weapon,
            style,
            spell,
            special,
            _overhead: _,
        } => {
            let mut w = state.world.write().await;
            let Some(target) = w.players.get(&target_id) else {
                return Some(serialize(&ServerMessage::Error {
                    code: "target_missing",
                    message: "That player is no longer online.",
                }));
            };
            if target_id == id {
                return None;
            }
            let (tx, ty) = (target.x, target.y);
            let Some(attacker) = w.players.get_mut(&id) else {
                return None;
            };
            if attacker.simulated {
                return None;
            }
            if zone_at(attacker.x, attacker.y) == Zone::Safe || zone_at(tx, ty) == Zone::Safe {
                return Some(serialize(&ServerMessage::Error {
                    code: "safe_zone",
                    message: "PvP is disabled inside the Grand Exchange stone boundary.",
                }));
            }
            let equipped = equipment_weapon(&attacker.equipment);
            if weapon.as_deref().is_some_and(|value| value != equipped) {
                return Some(account_error(
                    "equipment_mismatch",
                    "Equip that weapon before attacking.",
                ));
            }
            attacker.weapon = equipped;
            attacker.spell = valid_spell(spell);
            attacker.combat_style = weapon_style(
                &attacker.weapon,
                style.unwrap_or(attacker.combat_style),
                &attacker.spell,
            );
            if attacker.combat_style == CombatStyle::Ranged {
                let needed = if special && attacker.weapon == "msb" {
                    2
                } else {
                    1
                };
                if ranged_ammo(attacker).is_none_or(|(_, amount)| amount < needed) {
                    return Some(account_error(
                        "ammo",
                        "You do not have enough compatible ammunition equipped.",
                    ));
                }
            }
            if attacker.combat_style == CombatStyle::Magic {
                let Some(spell) = attacker.spell.as_deref() else {
                    return Some(account_error(
                        "runes",
                        "Choose a spell before attacking with magic.",
                    ));
                };
                if !has_spell_runes(attacker, spell) {
                    return Some(account_error(
                        "runes",
                        "You do not have enough runes to cast that spell.",
                    ));
                }
            }
            attacker.overhead = active_overhead(attacker);
            attacker.special_pending = special
                && spec_cost(&attacker.weapon).is_some_and(|cost| attacker.spec_energy >= cost);
            attacker.attack_target = Some(target_id);
            attacker.follow_target = None;
            attacker.protect_until = 0;
            None
        }
        ClientMessage::CombatState {
            weapon,
            style,
            spell,
            special,
            _overhead: _,
        } => {
            let mut w = state.world.write().await;
            let Some(p) = w.players.get_mut(&id) else {
                return None;
            };
            if p.simulated {
                return None;
            }
            let equipped = equipment_weapon(&p.equipment);
            if weapon != equipped {
                return Some(account_error(
                    "equipment_mismatch",
                    "Equip that weapon before using it.",
                ));
            }
            p.weapon = equipped;
            p.spell = valid_spell(spell);
            p.combat_style = weapon_style(&p.weapon, style, &p.spell);
            p.overhead = active_overhead(p);
            p.special_pending =
                special && spec_cost(&p.weapon).is_some_and(|cost| p.spec_energy >= cost);
            None
        }
        ClientMessage::Eat { index } => {
            let mut w = state.world.write().await;
            let tick = w.tick;
            let World {
                players, ge_offers, ..
            } = &mut *w;
            let Some(p) = players.get_mut(&id) else {
                return None;
            };
            let base_hp = base_levels(&p.loadout).hp;
            if p.hp < base_hp
                && (p.last_eat_tick == u64::MAX || tick.saturating_sub(p.last_eat_tick) >= 3)
            {
                let slot = index
                    .map(usize::from)
                    .filter(|i| {
                        p.inventory
                            .get(*i)
                            .and_then(|s| s.as_ref())
                            .is_some_and(|s| s.id == "shark")
                    })
                    .or_else(|| {
                        p.inventory
                            .iter()
                            .position(|s| s.as_ref().is_some_and(|s| s.id == "shark"))
                    });
                if let Some(slot) = slot {
                    p.inventory[slot] = None;
                    p.hp = (p.hp + 20).min(base_hp);
                    p.last_eat_tick = tick;
                }
            }
            sync_consumable_counters(p);
            Some(account_message(p, ge_offers))
        }
        ClientMessage::Drink { index } => {
            let mut w = state.world.write().await;
            let tick = w.tick;
            let World {
                players, ge_offers, ..
            } = &mut *w;
            let p = players.get_mut(&id)?;
            if p.last_pot_tick != u64::MAX && tick.saturating_sub(p.last_pot_tick) < 3 {
                return Some(account_error(
                    "potion_delay",
                    "You need to wait before drinking another potion.",
                ));
            }
            match drink_potion(p, index as usize) {
                Ok(()) => {
                    p.last_pot_tick = tick;
                    Some(account_message(p, ge_offers))
                }
                Err(_) => Some(account_error("potion", "That potion could not be drunk.")),
            }
        }
        ClientMessage::BankOpen {} => {
            let w = state.world.read().await;
            let p = w.players.get(&id)?;
            if !near_bank(p) {
                return Some(account_error(
                    "bank_range",
                    "Stand beside a Grand Exchange bank booth first.",
                ));
            }
            Some(account_message(p, &w.ge_offers))
        }
        ClientMessage::BankDeposit { index, amount } => {
            let mut w = state.world.write().await;
            let World {
                players, ge_offers, ..
            } = &mut *w;
            let p = players.get_mut(&id)?;
            if !near_bank(p) {
                return Some(account_error(
                    "bank_range",
                    "Stand beside a Grand Exchange bank booth first.",
                ));
            }
            if bank_deposit(&mut p.inventory, &mut p.bank, index as usize, amount).is_err() {
                return Some(account_error(
                    "bank_action",
                    "That deposit could not be completed.",
                ));
            }
            p.food = inventory_count(&p.inventory, "shark").min(u8::MAX as u32) as u8;
            Some(account_message(p, ge_offers))
        }
        ClientMessage::BankDepositAll {} => {
            let mut w = state.world.write().await;
            let World {
                players, ge_offers, ..
            } = &mut *w;
            let p = players.get_mut(&id)?;
            if !near_bank(p) {
                return Some(account_error(
                    "bank_range",
                    "Stand beside a Grand Exchange bank booth first.",
                ));
            }
            if bank_deposit_all(&mut p.inventory, &mut p.bank).is_err() {
                return Some(account_error(
                    "bank_action",
                    "Your bank could not accept every item.",
                ));
            }
            p.food = inventory_count(&p.inventory, "shark").min(u8::MAX as u32) as u8;
            Some(account_message(p, ge_offers))
        }
        ClientMessage::BankDepositEquipment {} => {
            let mut w = state.world.write().await;
            let World {
                players, ge_offers, ..
            } = &mut *w;
            let p = players.get_mut(&id)?;
            if !near_bank(p) {
                return Some(account_error(
                    "bank_range",
                    "Stand beside a Grand Exchange bank booth first.",
                ));
            }
            if bank_deposit_equipment(&mut p.equipment, &mut p.bank).is_err() {
                return Some(account_error(
                    "bank_action",
                    "Your bank could not accept your worn equipment.",
                ));
            }
            p.weapon = equipment_weapon(&p.equipment);
            p.spell = None;
            p.special_pending = false;
            Some(account_message(p, ge_offers))
        }
        ClientMessage::BankWithdraw { index, amount } => {
            let mut w = state.world.write().await;
            let World {
                players, ge_offers, ..
            } = &mut *w;
            let p = players.get_mut(&id)?;
            if !near_bank(p) {
                return Some(account_error(
                    "bank_range",
                    "Stand beside a Grand Exchange bank booth first.",
                ));
            }
            if bank_withdraw(&mut p.inventory, &mut p.bank, index as usize, amount).is_err() {
                return Some(account_error(
                    "bank_action",
                    "You do not have enough inventory space.",
                ));
            }
            p.food = inventory_count(&p.inventory, "shark").min(u8::MAX as u32) as u8;
            Some(account_message(p, ge_offers))
        }
        ClientMessage::Equip { index } => {
            let mut w = state.world.write().await;
            let World {
                players, ge_offers, ..
            } = &mut *w;
            let p = players.get_mut(&id)?;
            match equip(&mut p.inventory, &mut p.equipment, index as usize) {
                Ok(weapon) => p.weapon = weapon,
                Err(_) => return Some(account_error("equip", "That item could not be equipped.")),
            }
            Some(account_message(p, ge_offers))
        }
        ClientMessage::Unequip { slot } => {
            let slot = slot.chars().take(10).collect::<String>();
            let mut w = state.world.write().await;
            let World {
                players, ge_offers, ..
            } = &mut *w;
            let p = players.get_mut(&id)?;
            match unequip(&mut p.inventory, &mut p.equipment, &slot) {
                Ok(weapon) => p.weapon = weapon,
                Err(_) => {
                    return Some(account_error("equip", "That item could not be unequipped."));
                }
            }
            Some(account_message(p, ge_offers))
        }
        ClientMessage::GeOpen {} => {
            let w = state.world.read().await;
            let p = w.players.get(&id)?;
            if !near_ge(p) {
                return Some(account_error(
                    "ge_range",
                    "Speak to a Grand Exchange clerk first.",
                ));
            }
            Some(account_message(p, &w.ge_offers))
        }
        ClientMessage::GePlace {
            slot,
            sell,
            item,
            quantity,
            price,
        } => {
            let mut w = state.world.write().await;
            let tick = w.tick;
            let World {
                players,
                ge_offers,
                next_offer_id,
                ..
            } = &mut *w;
            let p = players.get_mut(&id)?;
            if !near_ge(p) {
                return Some(account_error(
                    "ge_range",
                    "Speak to a Grand Exchange clerk first.",
                ));
            }
            let owner = p.token.clone();
            if place_offer(
                ge_offers,
                next_offer_id,
                &owner,
                slot,
                sell,
                &item,
                quantity,
                price,
                tick,
                &mut p.inventory,
            )
            .is_err()
            {
                return Some(account_error(
                    "ge_offer",
                    "That Grand Exchange offer could not be placed.",
                ));
            }
            Some(account_message(p, ge_offers))
        }
        ClientMessage::GeCancel { slot } => {
            let mut w = state.world.write().await;
            let World {
                players, ge_offers, ..
            } = &mut *w;
            let p = players.get_mut(&id)?;
            if !near_ge(p) {
                return Some(account_error(
                    "ge_range",
                    "Speak to a Grand Exchange clerk first.",
                ));
            }
            if cancel_offer(ge_offers, &p.token, slot).is_err() {
                return Some(account_error(
                    "ge_offer",
                    "That offer could not be cancelled.",
                ));
            }
            Some(account_message(p, ge_offers))
        }
        ClientMessage::GeCollect { slot, to_bank } => {
            let mut w = state.world.write().await;
            let World {
                players, ge_offers, ..
            } = &mut *w;
            let p = players.get_mut(&id)?;
            if !near_ge(p) {
                return Some(account_error(
                    "ge_range",
                    "Speak to a Grand Exchange clerk first.",
                ));
            }
            let result = if to_bank {
                collect_offer_to_bank(ge_offers, &p.token, slot, &mut p.bank)
            } else {
                collect_offer(ge_offers, &p.token, slot, &mut p.inventory)
            };
            if result.is_err() {
                return Some(account_error(
                    "ge_collect",
                    if to_bank {
                        "Your bank could not accept that collection."
                    } else {
                        "Make room in your inventory before collecting."
                    },
                ));
            }
            Some(account_message(p, ge_offers))
        }
        ClientMessage::Appearance {
            skin,
            hair,
            shirt,
            pants,
            boots,
            hair_style,
        } => {
            if hair_style > 2
                || [skin, hair, shirt, pants, boots]
                    .into_iter()
                    .any(|c| c > 0x00ff_ffff)
            {
                return Some(account_error("appearance", "That appearance is invalid."));
            }
            let mut w = state.world.write().await;
            let World {
                players, ge_offers, ..
            } = &mut *w;
            let p = players.get_mut(&id)?;
            if zone_at(p.x, p.y) != Zone::Safe || p.attack_target.is_some() {
                return Some(account_error(
                    "appearance",
                    "Change appearance while safe and out of combat.",
                ));
            }
            p.appearance = Appearance {
                skin,
                hair,
                shirt,
                pants,
                boots,
                hair_style,
            };
            Some(account_message(p, ge_offers))
        }
        ClientMessage::Chat { text } => {
            let text = clean_chat(&text);
            if text.is_empty() {
                return None;
            }
            let (name, player_id) = {
                let world = state.world.read().await;
                let player = world.players.get(&id)?;
                (player.name.clone(), player.id)
            };
            let msg = serialize(&ServerMessage::Chat {
                player_id,
                name: &name,
                text: &text,
            });
            let _ = state.tx.send(msg);
            None
        }
        ClientMessage::Ping { nonce } => {
            let tick = state.world.read().await.tick;
            Some(serialize(&ServerMessage::Pong { nonce, tick }))
        }
    }
}

async fn snapshot_message(state: &AppState) -> String {
    let world = state.world.read().await;
    serialize(&ServerMessage::Snapshot {
        tick: world.tick,
        players: world.players.values().map(player_view).collect(),
    })
}

async fn disconnect(id: Uuid, state: &AppState) {
    let profile = {
        let mut world = state.world.write().await;
        world.players.remove(&id).map(|player| {
            let profile = profile_from_player(&player);
            world.profiles.insert(player.token.clone(), profile.clone());
            (player.token, profile, player.name)
        })
    };

    if let Some((_token, _profile, name)) = profile {
        info!(%id, %name, "player disconnected");
        let _ = state.tx.send(snapshot_message(state).await);
        persist(state).await;
    }
}

fn advance_world(w: &mut World, c: &Collision) -> Vec<String> {
    w.tick = w.tick.saturating_add(1);
    let tick = w.tick;
    let mut events = Vec::new();
    resident_think(w, c, &mut events);
    let mut ids = w.players.keys().copied().collect::<Vec<_>>();
    ids.sort();
    // Capture everybody before stepping, so UUID iteration order can't speed pursuit.
    let positions = w
        .players
        .iter()
        .map(|(id, p)| (*id, (Tile::new(p.x as i32, p.y as i32), zone_at(p.x, p.y))))
        .collect::<HashMap<_, _>>();
    for id in &ids {
        let p = w.players.get_mut(id).unwrap();
        let from = Tile::new(p.x as i32, p.y as i32);
        p.motion = vec![from];
        p.motion_tick = tick;
        if let Some(target_id) = p.attack_target.or(p.follow_target) {
            if let Some((target, z)) = positions.get(&target_id) {
                if p.attack_target.is_some()
                    && (zone_at(p.x, p.y) == Zone::Safe || *z == Zone::Safe)
                {
                    p.attack_target = None;
                    p.path.clear();
                } else {
                    let range = attack_range_for(p);
                    let d = (from.x - target.x).abs().max((from.y - target.y).abs());
                    if d >= 1 && d <= range && c.has_los(from, *target) {
                        p.path.clear();
                    } else {
                        p.path = c
                            .path_to_range_where(from, *target, range, |tile| {
                                zone_at(tile.x as f32, tile.y as f32) == Zone::Pvp
                            })
                            .unwrap_or_default();
                    }
                }
            } else {
                p.attack_target = None;
                p.follow_target = None;
                p.path.clear();
            }
        }
        let frozen = tick < p.frozen_until;
        if frozen {
            p.path.clear();
        }
        let steps = if frozen {
            0
        } else if p.run_on && p.run_energy >= 1.0 {
            2
        } else {
            1
        };
        for _ in 0..steps {
            let Some(to) = p.path.pop_front() else {
                break;
            };
            if !c.can_step(p.x as i32, p.y as i32, to.x - p.x as i32, to.y - p.y as i32) {
                p.path.clear();
                break;
            }
            // Normal clicks may enter the safe GE. A combat-generated chase may
            // not: stop on the last PvP tile instead of running one/two tiles
            // across the boundary before the next tick notices.
            if p.attack_target.is_some() && zone_at(to.x as f32, to.y as f32) == Zone::Safe {
                p.attack_target = None;
                p.path.clear();
                break;
            }
            p.x = to.x as f32;
            p.y = to.y as f32;
            p.motion.push(to);
        }
        if p.motion.len() > 2 {
            p.run_energy = (p.run_energy - 0.67).max(0.0);
        } else {
            p.run_energy = (p.run_energy + 0.3).min(100.0);
        }
        let base = base_levels(&p.loadout);
        drain_prayers(p, tick);
        if tick % 100 == 0 {
            if p.hp < base.hp {
                p.hp = (p.hp + 1).min(base.hp);
            } else if p.hp > base.hp {
                p.hp -= 1;
            }
            restore_stat(&mut p.attack_current, base.attack);
            restore_stat(&mut p.strength_current, base.strength);
            restore_stat(&mut p.defence_current, base.defence);
            restore_stat(&mut p.ranged_current, base.ranged);
            restore_stat(&mut p.magic_current, base.magic);
        }
        if tick % 50 == 0 {
            p.spec_energy = (p.spec_energy + 10.).min(100.);
        }
    }
    let zones_after_move = w
        .players
        .iter()
        .map(|(id, p)| (*id, zone_at(p.x, p.y)))
        .collect::<HashMap<_, _>>();
    for id in &ids {
        let cancel = w.players.get(id).is_some_and(|p| {
            p.attack_target.is_some_and(|tid| {
                zones_after_move.get(id) == Some(&Zone::Safe)
                    || zones_after_move.get(&tid) == Some(&Zone::Safe)
                    || !w.players.contains_key(&tid)
            })
        });
        if cancel {
            if let Some(p) = w.players.get_mut(id) {
                p.attack_target = None;
                p.path.clear();
            }
        }
    }

    for id in ids {
        let a = &w.players[&id];
        let Some(tid) = a.attack_target else {
            continue;
        };
        let Some(t) = w.players.get(&tid) else {
            continue;
        };
        if zone_at(a.x, a.y) == Zone::Safe
            || zone_at(t.x, t.y) == Zone::Safe
            || tick < t.protect_until
            || !in_attack_range(c, a, t)
        {
            continue;
        }
        let speed = attack_speed_for(a);
        if a.last_attack_tick
            .is_some_and(|last| tick.saturating_sub(last) < speed)
        {
            continue;
        }
        let style = a.combat_style;
        let weapon = a.weapon.clone();
        let spell = a.spell.clone();
        let special =
            a.special_pending && spec_cost(&weapon).is_some_and(|cost| a.spec_energy >= cost);
        let hits = if special && weapon == "dds" { 2 } else { 1 };
        let delay = if style == CombatStyle::Melee { 0 } else { 1 };

        // Consume combat resources on the authoritative tick, not when the
        // browser asks to attack. Chasing, switching or banking can therefore
        // invalidate a pending attack before it fires.
        let resources_ok = {
            let attacker = w.players.get_mut(&id).unwrap();
            match style {
                CombatStyle::Melee => true,
                CombatStyle::Ranged => consume_ammo(attacker, hits as u32),
                CombatStyle::Magic => spell
                    .as_deref()
                    .is_some_and(|spell_id| consume_spell_runes(attacker, spell_id)),
            }
        };
        if !resources_ok {
            let attacker = w.players.get_mut(&id).unwrap();
            attacker.attack_target = None;
            attacker.path.clear();
            attacker.special_pending = false;
            continue;
        }

        events.push(serialize(&ServerMessage::AttackVisual {
            attacker_id: id,
            target_id: tid,
            style,
            weapon: weapon.clone(),
            spell: spell.clone(),
            special,
            hits,
            delay_ticks: delay,
        }));
        let mut total = 0;
        for hit in 0..hits {
            let roll = deterministic_roll(
                tick ^ (id.as_u128() as u64)
                    ^ ((tid.as_u128() >> 64) as u64)
                    ^ ((hit as u64) << 32),
            );
            let attacker = &w.players[&id];
            let defender = &w.players[&tid];
            let mut max = scaled_max_hit(attacker);
            if special && weapon == "ags" {
                max = ((max as f32) * 1.1) as i32 + 8;
            }
            if special && weapon == "dds" {
                max = ((max as f32) * 1.15) as i32;
            }
            let acc = accuracy_percent(attacker, defender, special);
            let mut dmg = if (roll >> 32) % 100 < acc {
                (roll % (max.max(1) as u64 + 1)) as i32
            } else {
                0
            };
            let protect = defender.overhead.as_deref()
                == Some(match style {
                    CombatStyle::Melee => "pmelee",
                    CombatStyle::Ranged => "pmissiles",
                    CombatStyle::Magic => "pmagic",
                });
            if protect {
                dmg = (dmg * 3) / 5;
            }
            total += dmg;
        }
        {
            let a = w.players.get_mut(&id).unwrap();
            a.last_attack_tick = Some(tick);
            a.special_pending = false;
            if special {
                if let Some(cost) = spec_cost(&weapon) {
                    a.spec_energy = (a.spec_energy - cost).max(0.);
                }
            }
            if style == CombatStyle::Magic
                && spell.as_deref().is_some_and(|x| x.starts_with("blood"))
                && total > 0
            {
                let base = base_levels(&a.loadout);
                a.hp = (a.hp + total / 4).min(base.hp);
            }
        }
        let smiting = w.players[&id].active_prayers.iter().any(|x| x == "smite");
        let t = w.players.get_mut(&tid).unwrap();
        t.hp = (t.hp - total).max(0);
        if style == CombatStyle::Magic
            && spell.as_deref().is_some_and(|x| x.starts_with("ice"))
            && total > 0
        {
            t.frozen_until = tick + spell_freeze_ticks(spell.as_deref());
        }
        if special && weapon == "dscim" {
            t.active_prayers
                .retain(|id| prayer_info(id).is_none_or(|info| info.overhead.is_none()));
            t.overhead = active_overhead(t);
            t.prayer_block_until = tick + 8;
        }
        if total > 0 && smiting {
            t.prayer_points = (t.prayer_points - total as f32 / 4.0).max(0.0);
            if t.prayer_points <= 0.0 {
                t.active_prayers.clear();
                t.overhead = None;
            }
        }
        let tbase = base_levels(&t.loadout);
        if t.hp > 0
            && t.hp < (tbase.hp as f32 * 0.10).ceil() as i32
            && t.active_prayers.iter().any(|x| x == "redemption")
        {
            t.hp = (t.hp + tbase.prayer / 4).min(tbase.hp);
            t.prayer_points = 0.0;
            t.active_prayers.clear();
            t.overhead = None;
        }
        let hp = t.hp;
        let killed = hp == 0;
        if killed {
            t.deaths = t.deaths.saturating_add(1);
            let base = base_levels(&t.loadout);
            t.hp = base.hp;
            t.attack_current = base.attack;
            t.strength_current = base.strength;
            t.defence_current = base.defence;
            t.ranged_current = base.ranged;
            t.magic_current = base.magic;
            t.prayer_points = base.prayer as f32;
            t.active_prayers.clear();
            t.overhead = None;
            t.prayer_block_until = 0;
            t.path.clear();
            t.attack_target = None;
            t.follow_target = None;
            t.frozen_until = 0;
            t.protect_until = tick + 10;
            let respawn = if t.simulated
                && t.resident
                    .as_ref()
                    .is_some_and(|r| r.role == ResidentRole::Pker)
            {
                t.resident.as_ref().unwrap().home
            } else {
                Tile::new(48, 42)
            };
            t.x = respawn.x as f32;
            t.y = respawn.y as f32;
            t.motion = vec![respawn];
            t.position_epoch = t.position_epoch.saturating_add(1);
        }
        if killed {
            let a = w.players.get_mut(&id).unwrap();
            a.kills = a.kills.saturating_add(1);
            for p in w.players.values_mut() {
                if p.attack_target == Some(tid) {
                    p.attack_target = None;
                    p.path.clear();
                }
            }
        }
        events.push(serialize(&ServerMessage::Combat {
            attacker_id: id,
            target_id: tid,
            damage: total,
            target_hp: hp,
            killed,
            style,
            special,
        }));
    }
    events
}
async fn tick_loop(state: AppState) {
    let mut interval = time::interval(Duration::from_millis(TICK_MS));
    interval.set_missed_tick_behavior(time::MissedTickBehavior::Skip);
    let mut stop = state.shutdown.subscribe();
    loop {
        tokio::select! {_=stop.changed()=>break,_=interval.tick()=>{
            let events={let mut w=state.world.write().await;advance_world(&mut w,&state.collision)};
            for msg in events{let _=state.tx.send(msg);}let _=state.tx.send(snapshot_message(&state).await);
            if state.world.read().await.tick%5==0{let clone=state.clone();tokio::spawn(async move{persist(&clone).await;});}
        }}
    }
}

async fn persist(state: &AppState) {
    // Serialize the entire capture/write transaction: concurrent disconnects must not overwrite newer state.
    let _save = state.persist_lock.lock().await;
    let (path, data) = {
        let world = state.world.read().await;
        let mut profiles = world.profiles.clone();
        for player in world.players.values().filter(|p| !p.simulated) {
            profiles.insert(player.token.clone(), profile_from_player(player));
        }
        let stored = PersistedState {
            version: 1,
            profiles,
            ge_offers: world.ge_offers.clone(),
            next_offer_id: world.next_offer_id,
        };
        let data = match serde_json::to_vec_pretty(&stored) {
            Ok(v) => v,
            Err(err) => {
                error!(?err, "failed to serialize server state");
                return;
            }
        };
        ((*state.state_file).clone(), data)
    };

    if let Some(parent) = path.parent() {
        if let Err(err) = fs::create_dir_all(parent).await {
            error!(?err, "failed to create state directory");
            return;
        }
    }
    let tmp = path.with_extension("json.tmp");
    if let Err(err) = fs::write(&tmp, data).await {
        error!(?err, "failed to write profile temp file");
        return;
    }
    if let Ok(bytes) = fs::read(&path).await {
        let valid = serde_json::from_slice::<PersistedState>(&bytes).is_ok()
            || serde_json::from_slice::<HashMap<String, PersistedProfile>>(&bytes).is_ok();
        if valid {
            if let Err(err) = fs::write(path.with_extension("json.backup"), bytes).await {
                error!(?err, "profile backup failed");
                return;
            }
        }
    }
    if let Err(err) = fs::rename(&tmp, &path).await {
        error!(?err, "failed to atomically replace profile file");
    }
}

async fn load_state(path: &Path) -> PersistedState {
    async fn parse(bytes: &[u8]) -> Option<PersistedState> {
        if let Ok(state) = serde_json::from_slice::<PersistedState>(bytes) {
            return Some(state);
        }
        // v0.6 and earlier persisted only the profile map. Upgrade it without
        // discarding existing position/score data.
        serde_json::from_slice::<HashMap<String, PersistedProfile>>(bytes)
            .ok()
            .map(|profiles| PersistedState {
                version: 1,
                profiles,
                ge_offers: Vec::new(),
                next_offer_id: 0,
            })
    }

    match fs::read(path).await {
        Ok(bytes) => {
            if let Some(state) = parse(&bytes).await {
                return state;
            }
            if let Ok(backup) = fs::read(path.with_extension("json.backup")).await {
                if let Some(state) = parse(&backup).await {
                    warn!("using previous valid server-state backup");
                    return state;
                }
            }
            panic!(
                "Server state is unreadable; refusing to overwrite {}",
                path.display()
            );
        }
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => PersistedState {
            version: 1,
            ..Default::default()
        },
        Err(err) => panic!("Cannot read server state at {}: {err}", path.display()),
    }
}

async fn load_profiles(path: &Path) -> HashMap<String, PersistedProfile> {
    load_state(path).await.profiles
}

async fn load_collision(path: &Path) -> Collision {
    match fs::read(path).await {
        Ok(bytes) => match serde_json::from_slice::<CollisionFile>(&bytes) {
            Ok(file) if file.n == 96 && file.block.len() == file.n * file.n => Collision {
                n: file.n,
                block: file.block,
            },
            Ok(_) => panic!("collision file dimensions are invalid: {}", path.display()),
            Err(err) => panic!("collision file parse failed at {}: {err}", path.display()),
        },
        Err(err) => panic!("collision file missing at {}: {err}", path.display()),
    }
}

async fn shutdown_signal() {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{SignalKind, signal};
        let mut term = signal(SignalKind::terminate()).expect("SIGTERM handler");
        tokio::select! { _ = tokio::signal::ctrl_c() => {}, _ = term.recv() => {} }
    }
    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "oldskool_server=info,tower_http=info".into()),
        )
        .init();

    let bind: SocketAddr = env::var("SONNET_BIND")
        .unwrap_or_else(|_| "127.0.0.1:8788".into())
        .parse()
        .expect("SONNET_BIND must be an IP:port");

    let state_file = PathBuf::from(
        env::var("SONNET_STATE").unwrap_or_else(|_| "/var/lib/sonnetosrs/profiles.json".into()),
    );
    let stored = load_state(&state_file).await;
    let profile_count = stored.profiles.len();
    let offer_count = stored
        .ge_offers
        .iter()
        .filter(|o| o.state != OfferState::Removed)
        .count();
    info!(
        count = profile_count,
        offers = offer_count,
        ?state_file,
        "loaded server state"
    );
    let collision_file = PathBuf::from(
        env::var("OLDSKOOL_COLLISION")
            .unwrap_or_else(|_| "/opt/oldskool/world_collision.json".into()),
    );
    let collision = load_collision(&collision_file).await;
    let allowed_origins = env::var("OLDSKOOL_ALLOWED_ORIGINS")
        .unwrap_or_else(|_| {
            "https://oldskool-phi.vercel.app,http://127.0.0.1:8000,http://localhost:8000".into()
        })
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .collect::<Vec<_>>();
    info!(?collision_file, origins=?allowed_origins, "loaded collision and origin policy");

    let (tx, _) = broadcast::channel::<String>(256);
    let state = AppState {
        world: Arc::new(RwLock::new(World {
            tick: 0,
            players: HashMap::new(),
            profiles: stored.profiles,
            ge_offers: stored.ge_offers,
            next_offer_id: stored.next_offer_id,
        })),
        tx,
        state_file: Arc::new(state_file),
        collision: Arc::new(collision),
        allowed_origins: Arc::new(allowed_origins),
        persist_lock: Arc::new(Mutex::new(())),
        shutdown: watch::channel(false).0,
    };
    let resident_count = env::var("OLDSKOOL_RESIDENTS")
        .ok()
        .and_then(|v| v.parse::<usize>().ok())
        .unwrap_or(0)
        .min(20);
    if resident_count > 0 {
        let mut world = state.world.write().await;
        seed_residents(&mut world, &state.collision, resident_count);
        info!(
            residents = world.players.values().filter(|p| p.simulated).count(),
            "seeded simulated World 1 residents"
        );
    }
    tokio::spawn(tick_loop(state.clone()));

    let app = Router::new()
        .route("/health", get(health))
        .route("/world", get(world_info))
        .route("/ws", get(ws_handler))
        .fallback(|| async { (StatusCode::NOT_FOUND, "not found") })
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state.clone());

    let listener = TcpListener::bind(bind)
        .await
        .unwrap_or_else(|err| panic!("failed to bind {bind}: {err}"));

    info!(%bind, version=VERSION, tick_ms=TICK_MS, "OLDSKOOL server listening");

    let shutdown_state = state.clone();
    let shutdown = async move {
        shutdown_signal().await;
        info!("shutdown signal received");
        let _ = shutdown_state.shutdown.send(true);
        persist(&shutdown_state).await;
    };

    if let Err(err) = axum::serve(listener, app)
        .with_graceful_shutdown(shutdown)
        .await
    {
        error!(?err, "server terminated");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ge_center_is_safe() {
        assert_eq!(zone_at(48.0, 48.0), Zone::Safe);
    }

    #[test]
    fn bank_booths_are_safe() {
        for (x, y) in [(43.0, 43.0), (53.0, 43.0), (43.0, 53.0), (53.0, 53.0)] {
            assert_eq!(zone_at(x, y), Zone::Safe, "{x},{y}");
        }
    }

    #[test]
    fn outside_visible_ring_is_pvp() {
        for (x, y) in [(48.0, 58.0), (58.0, 48.0), (38.0, 48.0), (48.0, 38.0)] {
            assert_eq!(zone_at(x, y), Zone::Pvp, "{x},{y}");
        }
    }

    #[test]
    fn name_and_chat_sanitization_are_bounded() {
        assert_eq!(clean_name("  Leefy<script> "), "Leefyscrip");
        assert!(clean_chat(&"x".repeat(400)).len() <= MAX_CHAT);
    }

    #[test]
    fn collision_step_rejects_blocked_and_corner_cutting() {
        let mut block = vec![0; 96 * 96];
        block[10 * 96 + 11] = 1;
        let c = Collision { n: 96, block };
        assert!(!c.can_step(10, 10, 1, 0));
        assert!(!c.can_step(10, 10, 1, 1));
        assert!(c.can_step(10, 10, 0, 1));
    }
}

#[cfg(test)]
mod regression {
    use super::*;
    fn player(id: Uuid) -> Player {
        Player {
            id,
            token: Uuid::new_v4().to_string(),
            name: "Tester".into(),
            x: 10.,
            y: 10.,
            hp: 99,
            attack_current: 99,
            strength_current: 99,
            defence_current: 99,
            ranged_current: 99,
            magic_current: 99,
            prayer_points: 99.0,
            kills: 0,
            deaths: 0,
            path: VecDeque::new(),
            motion: vec![Tile::new(10, 10)],
            motion_tick: 0,
            position_epoch: 0,
            command_seq: 0,
            run_on: true,
            run_energy: 100.,
            attack_target: None,
            follow_target: None,
            protect_until: 0,
            last_attack_tick: None,
            simulated: false,
            loadout: "main".into(),
            weapon: "whip".into(),
            combat_style: CombatStyle::Melee,
            spell: None,
            overhead: None,
            active_prayers: Vec::new(),
            prayer_block_until: 0,
            spec_energy: 100.0,
            special_pending: false,
            food: 16,
            last_eat_tick: u64::MAX,
            last_pot_tick: u64::MAX,
            frozen_until: 0,
            inventory: starter_inventory(),
            bank: starter_bank(),
            equipment: starter_equipment(),
            appearance: appearance_for("Tester"),
            resident: None,
        }
    }
    fn state() -> AppState {
        let (tx, _) = broadcast::channel(32);
        AppState {
            world: Arc::new(RwLock::new(World {
                tick: 0,
                players: HashMap::new(),
                profiles: HashMap::new(),
                ge_offers: Vec::new(),
                next_offer_id: 0,
            })),
            tx,
            state_file: Arc::new(
                std::env::temp_dir().join(format!("oldskool-unit-{}.json", Uuid::new_v4())),
            ),
            collision: Arc::new(Collision {
                n: 96,
                block: vec![0; 9216],
            }),
            allowed_origins: Arc::new(vec![]),
            persist_lock: Arc::new(Mutex::new(())),
            shutdown: watch::channel(false).0,
        }
    }
    #[tokio::test]
    async fn walk_accepts_intent_without_changing_position() {
        let s = state();
        let id = Uuid::new_v4();
        s.world.write().await.players.insert(id, player(id));
        handle_command(
            id,
            ClientMessage::Walk {
                x: 20.,
                y: 10.,
                seq: 1,
                run_on: true,
            },
            &s,
        )
        .await;
        let w = s.world.read().await;
        assert_eq!(w.players[&id].x, 10.);
        assert_eq!(w.players[&id].path.len(), 10);
    }
    #[tokio::test]
    async fn repeated_packets_cannot_add_steps_between_ticks() {
        let s = state();
        let id = Uuid::new_v4();
        s.world.write().await.players.insert(id, player(id));
        for seq in 1..20 {
            handle_command(
                id,
                ClientMessage::Walk {
                    x: 30.,
                    y: 10.,
                    seq,
                    run_on: true,
                },
                &s,
            )
            .await;
        }
        let mut w = s.world.write().await;
        assert_eq!(w.players[&id].x, 10.);
        advance_world(&mut w, &s.collision);
        assert_eq!(w.players[&id].x, 12.);
    }
    #[tokio::test]
    async fn older_sequence_cannot_replace_new_target() {
        let s = state();
        let id = Uuid::new_v4();
        s.world.write().await.players.insert(id, player(id));
        for (x, seq) in [(20., 4), (30., 2), (40., 4)] {
            handle_command(
                id,
                ClientMessage::Walk {
                    x,
                    y: 10.,
                    seq,
                    run_on: true,
                },
                &s,
            )
            .await;
        }
        assert_eq!(
            s.world.read().await.players[&id].path.back(),
            Some(&Tile::new(20, 10))
        );
    }
    #[tokio::test]
    async fn combat_state_cannot_use_weapon_that_is_only_in_inventory() {
        let s = state();
        let id = Uuid::new_v4();
        let mut p = player(id);
        p.inventory[0] = Some(InventoryItem {
            id: "ags".into(),
            amount: 1,
        });
        p.weapon = "whip".into();
        p.equipment.insert(
            "weapon".into(),
            InventoryItem {
                id: "whip".into(),
                amount: 1,
            },
        );
        s.world.write().await.players.insert(id, p);
        let response = handle_command(
            id,
            ClientMessage::CombatState {
                weapon: "ags".into(),
                style: CombatStyle::Melee,
                spell: None,
                special: true,
                _overhead: None,
            },
            &s,
        )
        .await
        .unwrap();
        assert!(response.contains("equipment_mismatch"));
        assert_eq!(s.world.read().await.players[&id].weapon, "whip");
    }

    #[tokio::test]
    async fn client_cannot_spoof_protection_prayer_through_combat_state() {
        let s = state();
        let id = Uuid::new_v4();
        s.world.write().await.players.insert(id, player(id));
        handle_command(
            id,
            ClientMessage::CombatState {
                weapon: "whip".into(),
                style: CombatStyle::Melee,
                spell: None,
                special: false,
                _overhead: Some("pmelee".into()),
            },
            &s,
        )
        .await;
        let w = s.world.read().await;
        assert!(w.players[&id].overhead.is_none());
        assert!(w.players[&id].active_prayers.is_empty());
    }

    #[tokio::test]
    async fn prayer_toggle_is_server_authoritative_and_group_exclusive() {
        let s = state();
        let id = Uuid::new_v4();
        s.world.write().await.players.insert(id, player(id));
        handle_command(
            id,
            ClientMessage::Prayer {
                id: "pmagic".into(),
                enabled: true,
            },
            &s,
        )
        .await;
        handle_command(
            id,
            ClientMessage::Prayer {
                id: "pmelee".into(),
                enabled: true,
            },
            &s,
        )
        .await;
        let mut w = s.world.write().await;
        assert_eq!(w.players[&id].active_prayers, vec!["pmelee".to_string()]);
        assert_eq!(w.players[&id].overhead.as_deref(), Some("pmelee"));
        let before = w.players[&id].prayer_points;
        advance_world(&mut w, &s.collision);
        advance_world(&mut w, &s.collision);
        assert!(w.players[&id].prayer_points < before);
    }

    #[tokio::test]
    async fn potion_dose_and_boost_change_only_on_server_command() {
        let s = state();
        let id = Uuid::new_v4();
        let mut p = player(id);
        p.inventory[0] = Some(InventoryItem {
            id: "supstr".into(),
            amount: 2,
        });
        s.world.write().await.players.insert(id, p);
        handle_command(id, ClientMessage::Drink { index: 0 }, &s).await;
        let w = s.world.read().await;
        assert_eq!(w.players[&id].inventory[0].as_ref().unwrap().amount, 1);
        assert!(w.players[&id].strength_current > 99);
    }

    #[tokio::test]
    async fn inventory_reorder_is_applied_by_server() {
        let s = state();
        let id = Uuid::new_v4();
        let mut p = player(id);
        p.inventory[0] = Some(InventoryItem {
            id: "whip".into(),
            amount: 1,
        });
        p.inventory[1] = Some(InventoryItem {
            id: "shark".into(),
            amount: 1,
        });
        s.world.write().await.players.insert(id, p);
        handle_command(id, ClientMessage::InventoryMove { from: 0, to: 1 }, &s).await;
        let w = s.world.read().await;
        assert_eq!(w.players[&id].inventory[0].as_ref().unwrap().id, "shark");
        assert_eq!(w.players[&id].inventory[1].as_ref().unwrap().id, "whip");
    }

    #[tokio::test]
    async fn ranged_attack_consumes_authoritative_ammunition() {
        let s = state();
        let aid = Uuid::from_u128(100);
        let tid = Uuid::from_u128(101);
        let mut a = player(aid);
        let mut t = player(tid);
        a.x = 10.;
        a.y = 10.;
        t.x = 12.;
        t.y = 10.;
        a.equipment.insert(
            "weapon".into(),
            InventoryItem {
                id: "rcb".into(),
                amount: 1,
            },
        );
        a.equipment.insert(
            "ammo".into(),
            InventoryItem {
                id: "dbolts".into(),
                amount: 3,
            },
        );
        a.weapon = "rcb".into();
        a.combat_style = CombatStyle::Ranged;
        a.attack_target = Some(tid);
        let mut w = s.world.write().await;
        w.players.insert(aid, a);
        w.players.insert(tid, t);
        advance_world(&mut w, &s.collision);
        assert_eq!(w.players[&aid].equipment["ammo"].amount, 2);
    }

    #[tokio::test]
    async fn magic_attack_consumes_authoritative_runes() {
        let s = state();
        let aid = Uuid::from_u128(110);
        let tid = Uuid::from_u128(111);
        let mut a = player(aid);
        let mut t = player(tid);
        a.x = 10.;
        a.y = 10.;
        t.x = 12.;
        t.y = 10.;
        a.equipment.insert(
            "weapon".into(),
            InventoryItem {
                id: "ancstaff".into(),
                amount: 1,
            },
        );
        a.weapon = "ancstaff".into();
        a.combat_style = CombatStyle::Magic;
        a.spell = Some("iceRush".into());
        a.inventory = vec![None; INVENTORY_SLOTS];
        assert!(inventory_add(&mut a.inventory, "death", 2, 0));
        assert!(inventory_add(&mut a.inventory, "water", 2, 0));
        a.attack_target = Some(tid);
        let mut w = s.world.write().await;
        w.players.insert(aid, a);
        w.players.insert(tid, t);
        advance_world(&mut w, &s.collision);
        assert_eq!(inventory_count(&w.players[&aid].inventory, "death"), 0);
        assert_eq!(inventory_count(&w.players[&aid].inventory, "water"), 0);
    }

    #[tokio::test]
    async fn dscim_special_blocks_immediate_overhead_reactivation() {
        let s = state();
        let aid = Uuid::from_u128(120);
        let tid = Uuid::from_u128(121);
        let mut a = player(aid);
        let mut t = player(tid);
        a.x = 10.;
        a.y = 10.;
        t.x = 11.;
        t.y = 10.;
        a.equipment.insert(
            "weapon".into(),
            InventoryItem {
                id: "dscim".into(),
                amount: 1,
            },
        );
        a.weapon = "dscim".into();
        a.special_pending = true;
        a.attack_target = Some(tid);
        t.active_prayers = vec!["pmelee".into()];
        t.overhead = Some("pmelee".into());
        let mut w = s.world.write().await;
        w.players.insert(aid, a);
        w.players.insert(tid, t);
        advance_world(&mut w, &s.collision);
        let block_until = w.players[&tid].prayer_block_until;
        assert!(block_until > w.tick);
        drop(w);
        let response = handle_command(
            tid,
            ClientMessage::Prayer {
                id: "pmelee".into(),
                enabled: true,
            },
            &s,
        )
        .await
        .unwrap();
        assert!(response.contains("prayer"));
        assert!(s.world.read().await.players[&tid].overhead.is_none());
    }

    #[tokio::test]
    async fn stop_cancels_route_and_combat() {
        let s = state();
        let id = Uuid::new_v4();
        s.world.write().await.players.insert(id, player(id));
        handle_command(
            id,
            ClientMessage::Walk {
                x: 20.,
                y: 10.,
                seq: 1,
                run_on: true,
            },
            &s,
        )
        .await;
        handle_command(id, ClientMessage::Stop { seq: 2 }, &s).await;
        let mut w = s.world.write().await;
        advance_world(&mut w, &s.collision);
        assert_eq!(w.players[&id].x, 10.);
        assert!(w.players[&id].path.is_empty());
    }
    #[tokio::test]
    async fn walking_advances_one_and_running_two_tiles() {
        let s = state();
        let id = Uuid::new_v4();
        s.world.write().await.players.insert(id, player(id));
        handle_command(
            id,
            ClientMessage::Walk {
                x: 20.,
                y: 10.,
                seq: 1,
                run_on: false,
            },
            &s,
        )
        .await;
        {
            let mut w = s.world.write().await;
            advance_world(&mut w, &s.collision);
            assert_eq!(w.players[&id].x, 11.);
        }
        handle_command(id, ClientMessage::Run { enabled: true }, &s).await;
        let mut w = s.world.write().await;
        advance_world(&mut w, &s.collision);
        assert_eq!(w.players[&id].x, 13.);
    }
    #[test]
    fn pvp_combat_path_routes_around_ge_instead_of_through_safe_tiles() {
        let c = Collision {
            n: 96,
            block: vec![0; 96 * 96],
        };
        let from = Tile::new(38, 48);
        let target = Tile::new(58, 48);
        assert_eq!(zone_at(from.x as f32, from.y as f32), Zone::Pvp);
        assert_eq!(zone_at(target.x as f32, target.y as f32), Zone::Pvp);
        let path = c
            .path_to_range_where(from, target, 1, |tile| {
                zone_at(tile.x as f32, tile.y as f32) == Zone::Pvp
            })
            .expect("a route around the GE should exist in an empty test map");
        assert!(!path.is_empty());
        assert!(
            path.iter()
                .all(|tile| zone_at(tile.x as f32, tile.y as f32) == Zone::Pvp)
        );
    }

    #[test]
    fn combat_chase_cannot_run_across_safe_boundary() {
        let c = Collision {
            n: 96,
            block: vec![0; 96 * 96],
        };
        let attacker_id = Uuid::from_u128(1);
        let target_id = Uuid::from_u128(2);
        let mut attacker = player(attacker_id);
        attacker.x = 57.;
        attacker.y = 48.;
        attacker.attack_target = Some(target_id);
        attacker.path = VecDeque::from([Tile::new(56, 48), Tile::new(55, 48)]);
        attacker.run_on = true;
        let mut target = player(target_id);
        target.x = 58.;
        target.y = 48.;
        let mut w = World {
            tick: 0,
            players: HashMap::new(),
            profiles: HashMap::new(),
            ge_offers: Vec::new(),
            next_offer_id: 0,
        };
        w.players.insert(attacker_id, attacker);
        w.players.insert(target_id, target);
        advance_world(&mut w, &c);
        let a = &w.players[&attacker_id];
        assert_eq!((a.x, a.y), (57., 48.));
        assert_eq!(zone_at(a.x, a.y), Zone::Pvp);
        assert!(a.path.is_empty());
        assert!(
            a.motion
                .iter()
                .all(|t| zone_at(t.x as f32, t.y as f32) == Zone::Pvp)
        );
    }

    #[test]
    fn target_entering_safe_zone_cancels_combat_in_same_tick() {
        let c = Collision {
            n: 96,
            block: vec![0; 96 * 96],
        };
        let attacker_id = Uuid::from_u128(1);
        let target_id = Uuid::from_u128(2);
        let mut attacker = player(attacker_id);
        attacker.x = 58.;
        attacker.y = 48.;
        attacker.attack_target = Some(target_id);
        attacker.run_on = false;
        let mut target = player(target_id);
        target.x = 57.;
        target.y = 48.;
        target.path = VecDeque::from([Tile::new(56, 48)]);
        target.run_on = false;
        let mut w = World {
            tick: 0,
            players: HashMap::new(),
            profiles: HashMap::new(),
            ge_offers: Vec::new(),
            next_offer_id: 0,
        };
        w.players.insert(attacker_id, attacker);
        w.players.insert(target_id, target);
        advance_world(&mut w, &c);
        assert_eq!(
            zone_at(w.players[&target_id].x, w.players[&target_id].y),
            Zone::Safe
        );
        let a = &w.players[&attacker_id];
        assert!(a.attack_target.is_none());
        assert!(a.path.is_empty());
    }

    #[test]
    fn manual_walk_still_enters_ge_safe_zone() {
        let c = Collision {
            n: 96,
            block: vec![0; 96 * 96],
        };
        let id = Uuid::new_v4();
        let mut p = player(id);
        p.x = 57.;
        p.y = 48.;
        p.attack_target = None;
        p.path = VecDeque::from([Tile::new(56, 48)]);
        p.run_on = false;
        let mut w = World {
            tick: 0,
            players: HashMap::from([(id, p)]),
            profiles: HashMap::new(),
            ge_offers: Vec::new(),
            next_offer_id: 0,
        };
        advance_world(&mut w, &c);
        assert_eq!((w.players[&id].x, w.players[&id].y), (56., 48.));
        assert_eq!(zone_at(56., 48.), Zone::Safe);
    }

    #[test]
    fn position_epoch_marks_only_explicit_discontinuities() {
        let id = Uuid::new_v4();
        let mut p = player(id);
        assert_eq!(p.position_epoch, 0);
        p.x = 11.;
        p.y = 10.;
        p.motion = vec![Tile::new(10, 10), Tile::new(11, 10)];
        assert_eq!(
            p.position_epoch, 0,
            "ordinary movement must not become a teleport"
        );
        p.position_epoch = p.position_epoch.saturating_add(1);
        p.x = 48.;
        p.y = 42.;
        p.motion = vec![Tile::new(48, 42)];
        assert_eq!(player_view(&p).position_epoch, 1);
    }

    #[tokio::test]
    async fn concurrent_persistence_is_serialized_and_valid() {
        let s = state();
        let id = Uuid::new_v4();
        s.world.write().await.players.insert(id, player(id));
        let (a, b, c) = (s.clone(), s.clone(), s.clone());
        tokio::join!(persist(&a), persist(&b), persist(&c));
        let profiles = load_profiles(&s.state_file).await;
        assert_eq!(profiles.len(), 1);
        let _ = fs::remove_file(&*s.state_file).await;
        let _ = fs::remove_file(s.state_file.with_extension("json.backup")).await;
    }
    #[test]
    fn legacy_profiles_keep_scores_and_default_hp() {
        let p: PersistedProfile =
            serde_json::from_str(r#"{"name":"Legacy","x":48.0,"y":42.0,"kills":4,"deaths":2}"#)
                .unwrap();
        assert_eq!(p.kills, 4);
        assert_eq!(p.hp, 99);
    }

    #[tokio::test]
    async fn legacy_profile_map_is_not_mistaken_for_empty_new_state() {
        let path = std::env::temp_dir().join(format!("oldskool-legacy-{}.json", Uuid::new_v4()));
        let token = Uuid::new_v4().to_string();
        let legacy = serde_json::json!({
            token.clone(): {"name":"Legacy","x":43.0,"y":42.0,"kills":7,"deaths":3}
        });
        fs::write(&path, serde_json::to_vec(&legacy).unwrap())
            .await
            .unwrap();
        let state = load_state(&path).await;
        assert_eq!(state.profiles.len(), 1);
        let migrated = migrate_profile(state.profiles.get(&token).unwrap().clone(), "Legacy");
        assert_eq!(migrated.kills, 7);
        assert_eq!(migrated.account_version, ACCOUNT_VERSION);
        assert_eq!(migrated.inventory.len(), INVENTORY_SLOTS);
        assert_eq!(
            migrated
                .bank
                .iter()
                .find(|b| b.id == "coins")
                .unwrap()
                .quantity,
            250_000
        );
        let _ = fs::remove_file(path).await;
    }
    #[test]
    fn safe_zone_matches_rendered_tile_centres() {
        assert_eq!(zone_at(57., 48.), Zone::Pvp);
        assert_eq!(zone_at(56., 48.), Zone::Safe);
        assert_eq!(zone_at(38., 48.), Zone::Pvp);
        assert_eq!(zone_at(39., 48.), Zone::Safe);
    }
    #[test]
    fn resident_population_is_split_between_safe_ge_and_pvp() {
        let c = Collision {
            n: 96,
            block: vec![0; 96 * 96],
        };
        let mut w = World {
            tick: 0,
            players: HashMap::new(),
            profiles: HashMap::new(),
            ge_offers: Vec::new(),
            next_offer_id: 0,
        };
        seed_residents(&mut w, &c, 20);
        assert_eq!(w.players.values().filter(|p| p.simulated).count(), 20);
        assert_eq!(
            w.players
                .values()
                .filter(|p| p.simulated && zone_at(p.x, p.y) == Zone::Safe)
                .count(),
            10
        );
        assert_eq!(
            w.players
                .values()
                .filter(|p| p.simulated && zone_at(p.x, p.y) == Zone::Pvp)
                .count(),
            10
        );
    }
    #[test]
    fn simulated_residents_are_identifiable_in_snapshots() {
        let p = make_resident("Tester", ResidentRole::Social, Tile::new(48, 48), 1);
        let v = player_view(&p);
        assert!(v.simulated);
        assert!(!v.loadout.is_empty());
    }
}
