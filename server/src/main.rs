mod movement;
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
const ATTACK_SPEED_TICKS: u64 = 4;

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
}

struct Player {
    id: Uuid,
    token: String,
    name: String,
    x: f32,
    y: f32,
    hp: i32,
    kills: u32,
    deaths: u32,
    path: VecDeque<Tile>,
    motion: Vec<Tile>,
    motion_tick: u64,
    command_seq: u64,
    run_on: bool,
    run_energy: f32,
    attack_target: Option<Uuid>,
    follow_target: Option<Uuid>,
    protect_until: u64,
    last_attack_tick: Option<u64>,
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
}
fn default_hp() -> i32 {
    MAX_HP
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
    Follow {
        target_id: Uuid,
        seq: u64,
    },
    Resync {},
    Move {},
    Attack {
        target_id: Uuid,
    },
    Chat {
        text: String,
    },
    Ping {
        #[serde(default)]
        nonce: u64,
    },
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
    Combat {
        attacker_id: Uuid,
        target_id: Uuid,
        damage: i32,
        target_hp: i32,
        killed: bool,
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
    command_seq: u64,
    destination: Option<Tile>,
    moving: bool,
    run: f32,
    attack_target: Option<Uuid>,
}

#[derive(Serialize)]
struct Health {
    status: &'static str,
    version: &'static str,
    tick_ms: u64,
    players: usize,
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
        command_seq: p.command_seq,
        destination: p.path.back().copied(),
        moving: !p.path.is_empty(),
        run: p.run_energy,
        attack_target: p.attack_target,
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
        players: world.players.len(),
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
    if protocol != 2 {
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

        if world.players.len() >= 128 || world.players.values().any(|p| p.token == token) {
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

        let profile = world
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
            });

        let pos = state.collision.legal_position(profile.x, profile.y);
        let player = Player {
            id,
            token: token.clone(),
            name,
            x: pos.x as f32,
            y: pos.y as f32,
            hp: profile.hp.clamp(1, MAX_HP),
            kills: profile.kills,
            deaths: profile.deaths,
            path: VecDeque::new(),
            motion: vec![pos],
            motion_tick: world.tick,
            command_seq: 0,
            run_on: true,
            run_energy: 100.0,
            attack_target: None,
            follow_target: None,
            protect_until: 0,
            last_attack_tick: None,
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
        protocol: 2,
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
                        if let Some(reply) = handle_command(id, command, &state).await {
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
        ClientMessage::Attack { target_id } => {
            let mut w = state.world.write().await;
            let a = w.players.get(&id)?;
            let Some(t) = w.players.get(&target_id) else {
                return Some(serialize(&ServerMessage::Error {
                    code: "target_missing",
                    message: "That player is no longer online.",
                }));
            };
            if target_id == id {
                return None;
            }
            if zone_at(a.x, a.y) == Zone::Safe || zone_at(t.x, t.y) == Zone::Safe {
                return Some(serialize(&ServerMessage::Error {
                    code: "safe_zone",
                    message: "PvP is disabled inside the Grand Exchange stone boundary.",
                }));
            }
            if let Some(a) = w.players.get_mut(&id) {
                a.attack_target = Some(target_id);
                a.follow_target = None;
                a.protect_until = 0;
            }
            None
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
            let profile = PersistedProfile {
                name: player.name.clone(),
                x: player.x,
                y: player.y,
                kills: player.kills,
                deaths: player.deaths,
                hp: player.hp,
            };
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
                } else if c.melee_clear(from, *target) && from != *target {
                    p.path.clear();
                } else {
                    p.path = c.path(from, *target, false).unwrap_or_default();
                    if p.path.back() == Some(target) {
                        p.path.pop_back();
                    }
                }
            } else {
                p.attack_target = None;
                p.follow_target = None;
                p.path.clear();
            }
        }
        let steps = if p.run_on && p.run_energy >= 1.0 {
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
            p.x = to.x as f32;
            p.y = to.y as f32;
            p.motion.push(to);
        }
        if p.motion.len() > 2 {
            p.run_energy = (p.run_energy - 0.67).max(0.0);
        } else {
            p.run_energy = (p.run_energy + 0.3).min(100.0);
        }
        if tick % 100 == 0 {
            p.hp = (p.hp + 1).min(MAX_HP);
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
            || a.last_attack_tick
                .is_some_and(|last| tick.saturating_sub(last) < ATTACK_SPEED_TICKS)
        {
            continue;
        }
        if !c.melee_clear(
            Tile::new(a.x as i32, a.y as i32),
            Tile::new(t.x as i32, t.y as i32),
        ) {
            continue;
        }
        let seed = tick ^ (id.as_u128() as u64) ^ ((tid.as_u128() >> 64) as u64);
        let dmg = (seed % 13) as i32;
        w.players.get_mut(&id).unwrap().last_attack_tick = Some(tick);
        let t = w.players.get_mut(&tid).unwrap();
        t.hp = (t.hp - dmg).max(0);
        let hp = t.hp;
        let killed = hp == 0;
        if killed {
            t.deaths = t.deaths.saturating_add(1);
            t.hp = MAX_HP;
            t.x = 48.0;
            t.y = 42.0;
            t.path.clear();
            t.motion = vec![Tile::new(48, 42)];
            t.attack_target = None;
            t.follow_target = None;
            t.protect_until = tick + 10;
        }
        if killed {
            w.players.get_mut(&id).unwrap().kills = w.players[&id].kills.saturating_add(1);
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
            damage: dmg,
            target_hp: hp,
            killed,
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
            if state.world.read().await.tick%50==0{let clone=state.clone();tokio::spawn(async move{persist(&clone).await;});}
        }}
    }
}

async fn persist(state: &AppState) {
    // Serialize the entire capture/write transaction: concurrent disconnects must not overwrite newer state.
    let _save = state.persist_lock.lock().await;
    let (path, data) = {
        let world = state.world.read().await;
        let mut profiles = world.profiles.clone();
        for player in world.players.values() {
            profiles.insert(
                player.token.clone(),
                PersistedProfile {
                    name: player.name.clone(),
                    x: player.x,
                    y: player.y,
                    kills: player.kills,
                    deaths: player.deaths,
                    hp: player.hp,
                },
            );
        }
        let data = match serde_json::to_vec_pretty(&profiles) {
            Ok(v) => v,
            Err(err) => {
                error!(?err, "failed to serialize profiles");
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
        if serde_json::from_slice::<HashMap<String, PersistedProfile>>(&bytes).is_ok() {
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

async fn load_profiles(path: &Path) -> HashMap<String, PersistedProfile> {
    match fs::read(path).await {
        Ok(bytes) => match serde_json::from_slice(&bytes) {
            Ok(data) => data,
            Err(err) => {
                if let Ok(backup) = fs::read(path.with_extension("json.backup")).await {
                    if let Ok(data) = serde_json::from_slice(&backup) {
                        warn!(?err, "using previous valid profile backup");
                        return data;
                    }
                }
                panic!(
                    "Profile data is unreadable; refusing to overwrite {}: {err}",
                    path.display()
                );
            }
        },
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => HashMap::new(),
        Err(err) => panic!("Cannot read profile data at {}: {err}", path.display()),
    }
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
    let profiles = load_profiles(&state_file).await;
    info!(count = profiles.len(), ?state_file, "loaded profiles");
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
            profiles,
        })),
        tx,
        state_file: Arc::new(state_file),
        collision: Arc::new(collision),
        allowed_origins: Arc::new(allowed_origins),
        persist_lock: Arc::new(Mutex::new(())),
        shutdown: watch::channel(false).0,
    };

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
            kills: 0,
            deaths: 0,
            path: VecDeque::new(),
            motion: vec![Tile::new(10, 10)],
            motion_tick: 0,
            command_seq: 0,
            run_on: true,
            run_energy: 100.,
            attack_target: None,
            follow_target: None,
            protect_until: 0,
            last_attack_tick: None,
        }
    }
    fn state() -> AppState {
        let (tx, _) = broadcast::channel(32);
        AppState {
            world: Arc::new(RwLock::new(World {
                tick: 0,
                players: HashMap::new(),
                profiles: HashMap::new(),
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
    #[test]
    fn safe_zone_matches_rendered_tile_centres() {
        assert_eq!(zone_at(57., 48.), Zone::Pvp);
        assert_eq!(zone_at(56., 48.), Zone::Safe);
        assert_eq!(zone_at(38., 48.), Zone::Pvp);
        assert_eq!(zone_at(39., 48.), Zone::Safe);
    }
}
