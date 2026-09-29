use std::{
    collections::HashMap,
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
    sync::{RwLock, broadcast},
    time,
};
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing::{error, info, warn};
use uuid::Uuid;

const VERSION: &str = env!("CARGO_PKG_VERSION");
const TICK_MS: u64 = 600;
const MAP_MIN: f32 = 0.5;
const MAP_MAX: f32 = 95.5;
const GE_CENTER: f32 = 48.0;
const SAFE_APOTHEM: f32 = 9.0;
const MAX_HP: i32 = 99;
const MAX_CHAT: usize = 120;
const ATTACK_RANGE: f32 = 1.85;
const ATTACK_SPEED_TICKS: u64 = 4;

#[derive(Clone)]
struct AppState {
    world: Arc<RwLock<World>>,
    tx: broadcast::Sender<String>,
    state_file: Arc<PathBuf>,
    collision: Arc<Collision>,
    allowed_origins: Arc<Vec<String>>,
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
    last_move: Instant,
    last_attack_tick: Option<u64>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
struct PersistedProfile {
    name: String,
    x: f32,
    y: f32,
    kills: u32,
    deaths: u32,
}

#[derive(Clone, Debug, Default, Deserialize)]
struct CollisionFile {
    n: usize,
    block: Vec<u8>,
}

#[derive(Clone, Debug, Default)]
struct Collision {
    n: usize,
    block: Vec<u8>,
}

impl Collision {
    fn blocked(&self, x: i32, y: i32) -> bool {
        if x < 0 || y < 0 || x as usize >= self.n || y as usize >= self.n {
            return true;
        }
        self.block
            .get(y as usize * self.n + x as usize)
            .copied()
            .unwrap_or(1)
            != 0
    }
    fn can_step(&self, x: i32, y: i32, dx: i32, dy: i32) -> bool {
        if dx.abs() > 1 || dy.abs() > 1 || (dx == 0 && dy == 0) {
            return false;
        }
        if self.blocked(x + dx, y + dy) {
            return false;
        }
        if dx != 0 && dy != 0 && (self.blocked(x + dx, y) || self.blocked(x, y + dy)) {
            return false;
        }
        true
    }
    fn valid_move(&self, from_x: f32, from_y: f32, to_x: f32, to_y: f32) -> bool {
        let sx = from_x.round() as i32;
        let sy = from_y.round() as i32;
        let tx = to_x.round() as i32;
        let ty = to_y.round() as i32;
        if (to_x - tx as f32).abs() > 0.01 || (to_y - ty as f32).abs() > 0.01 {
            return false;
        }
        let dx = tx - sx;
        let dy = ty - sy;
        let steps = dx.abs().max(dy.abs());
        if steps == 0 || steps > 2 {
            return false;
        }
        let mut x = sx;
        let mut y = sy;
        for i in 1..=steps {
            let nx = sx + ((dx as f32) * (i as f32 / steps as f32)).round() as i32;
            let ny = sy + ((dy as f32) * (i as f32 / steps as f32)).round() as i32;
            let stepx = nx - x;
            let stepy = ny - y;
            if !self.can_step(x, y, stepx, stepy) {
                return false;
            }
            x = nx;
            y = ny;
        }
        x == tx && y == ty
    }
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ClientMessage {
    Hello {
        name: String,
        #[serde(default)]
        resume_token: Option<String>,
    },
    Move {
        x: f32,
        y: f32,
        #[serde(default)]
        seq: u64,
    },
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
        safe_zone: SafeZone,
        server_time_ms: u64,
    },
    Snapshot {
        tick: u64,
        players: Vec<PlayerView>,
    },
    ZoneTransition {
        zone: Zone,
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
    if poly8(x - GE_CENTER, y - GE_CENTER) <= SAFE_APOTHEM {
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
        Ok(ClientMessage::Hello { name, resume_token }) => {
            ClientMessage::Hello { name, resume_token }
        }
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

    let ClientMessage::Hello { name, resume_token } = hello else {
        unreachable!()
    };
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
    let (token, view, tick) = {
        let mut world = state.world.write().await;
        let requested = resume_token
            .filter(|t| valid_token(t))
            .filter(|t| world.profiles.contains_key(t));
        let token = requested.unwrap_or_else(|| Uuid::new_v4().to_string());

        if world.players.values().any(|p| p.token == token) {
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
            });

        let player = Player {
            id,
            token: token.clone(),
            name,
            x: if profile.x.is_finite() {
                profile.x.clamp(MAP_MIN, MAP_MAX)
            } else {
                GE_CENTER
            },
            y: if profile.y.is_finite() {
                profile.y.clamp(MAP_MIN, MAP_MAX)
            } else {
                34.0
            },
            hp: MAX_HP,
            kills: profile.kills,
            deaths: profile.deaths,
            last_move: Instant::now(),
            last_attack_tick: None,
        };
        let view = player_view(&player);
        let tick = world.tick;
        world.players.insert(id, player);
        (token, view, tick)
    };

    info!(%id, name=%view.name, "player connected");

    let welcome = ServerMessage::Welcome {
        id,
        resume_token: &token,
        tick_ms: TICK_MS,
        version: VERSION,
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

    let initial = {
        let world = state.world.read().await;
        ServerMessage::Snapshot {
            tick,
            players: world.players.values().map(player_view).collect(),
        }
    };
    let _ = sink.send(Message::Text(serialize(&initial).into())).await;

    let mut rx = state.tx.subscribe();
    let mut window_start = Instant::now();
    let mut command_count = 0u32;

    loop {
        tokio::select! {
            incoming = stream.next() => {
                let Some(result) = incoming else { break };
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
        ClientMessage::Move { x, y, seq: _seq } => {
            if !x.is_finite()
                || !y.is_finite()
                || !(MAP_MIN..=MAP_MAX).contains(&x)
                || !(MAP_MIN..=MAP_MAX).contains(&y)
            {
                return Some(serialize(&ServerMessage::Error {
                    code: "bad_move",
                    message: "Movement target is outside the world.",
                }));
            }

            let transition = {
                let mut world = state.world.write().await;
                let Some(player) = world.players.get_mut(&id) else {
                    return None;
                };
                let elapsed = player.last_move.elapsed();
                if elapsed < Duration::from_millis(180)
                    || !state.collision.valid_move(player.x, player.y, x, y)
                {
                    return Some(serialize(&ServerMessage::Error {
                        code: "move_rejected",
                        message: "Movement was not a legal world step.",
                    }));
                }

                let before = zone_at(player.x, player.y);
                player.x = x;
                player.y = y;
                player.last_move = Instant::now();
                let after = zone_at(x, y);
                (before != after).then_some(after)
            };

            transition.map(|zone| serialize(&ServerMessage::ZoneTransition { zone }))
        }
        ClientMessage::Attack { target_id } => {
            let event = {
                let mut world = state.world.write().await;
                let tick = world.tick;

                let Some(attacker) = world.players.get(&id) else {
                    return None;
                };
                let Some(target) = world.players.get(&target_id) else {
                    return Some(serialize(&ServerMessage::Error {
                        code: "target_missing",
                        message: "That player is no longer online.",
                    }));
                };

                if id == target_id {
                    return Some(serialize(&ServerMessage::Error {
                        code: "bad_target",
                        message: "You cannot attack yourself.",
                    }));
                }
                if zone_at(attacker.x, attacker.y) == Zone::Safe
                    || zone_at(target.x, target.y) == Zone::Safe
                {
                    return Some(serialize(&ServerMessage::Error {
                        code: "safe_zone",
                        message: "PvP is disabled inside the Grand Exchange stone boundary.",
                    }));
                }
                if ((attacker.x - target.x).powi(2) + (attacker.y - target.y).powi(2)).sqrt()
                    > ATTACK_RANGE
                {
                    return Some(serialize(&ServerMessage::Error {
                        code: "out_of_range",
                        message: "Move closer to attack.",
                    }));
                }
                if attacker
                    .last_attack_tick
                    .is_some_and(|last| tick.saturating_sub(last) < ATTACK_SPEED_TICKS)
                {
                    return Some(serialize(&ServerMessage::Error {
                        code: "attack_cooldown",
                        message: "Your attack is still on cooldown.",
                    }));
                }

                let seed = tick ^ (id.as_u128() as u64) ^ ((target_id.as_u128() >> 64) as u64);
                let damage = (seed % 13) as i32;

                if let Some(attacker) = world.players.get_mut(&id) {
                    attacker.last_attack_tick = Some(tick);
                }

                let mut killed = false;
                let mut target_hp = MAX_HP;
                if let Some(target) = world.players.get_mut(&target_id) {
                    target.hp = (target.hp - damage).max(0);
                    target_hp = target.hp;
                    if target.hp == 0 {
                        target.deaths = target.deaths.saturating_add(1);
                        target.hp = MAX_HP;
                        target.x = GE_CENTER;
                        target.y = 42.0;
                        target.last_move = Instant::now();
                        killed = true;
                    }
                }
                if killed {
                    if let Some(attacker) = world.players.get_mut(&id) {
                        attacker.kills = attacker.kills.saturating_add(1);
                    }
                }

                ServerMessage::Combat {
                    attacker_id: id,
                    target_id,
                    damage,
                    target_hp,
                    killed,
                }
            };
            let text = serialize(&event);
            let _ = state.tx.send(text.clone());
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
            };
            world.profiles.insert(player.token.clone(), profile.clone());
            (player.token, profile, player.name)
        })
    };

    if let Some((_token, _profile, name)) = profile {
        info!(%id, %name, "player disconnected");
        persist(state).await;
    }
}

async fn tick_loop(state: AppState) {
    let mut interval = time::interval(Duration::from_millis(TICK_MS));
    interval.set_missed_tick_behavior(time::MissedTickBehavior::Skip);
    loop {
        interval.tick().await;
        {
            let mut world = state.world.write().await;
            world.tick = world.tick.saturating_add(1);
        }
        let snapshot = snapshot_message(&state).await;
        let _ = state.tx.send(snapshot);

        let tick = state.world.read().await.tick;
        if tick % 50 == 0 {
            persist(&state).await;
        }
    }
}

async fn persist(state: &AppState) {
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
    if let Err(err) = fs::rename(&tmp, &path).await {
        error!(?err, "failed to atomically replace profile file");
    }
}

async fn load_profiles(path: &Path) -> HashMap<String, PersistedProfile> {
    match fs::read(path).await {
        Ok(bytes) => match serde_json::from_slice::<HashMap<String, PersistedProfile>>(&bytes) {
            Ok(data) => data,
            Err(err) => {
                warn!(
                    ?err,
                    ?path,
                    "profile file is invalid; starting with no loaded profiles"
                );
                HashMap::new()
            }
        },
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => HashMap::new(),
        Err(err) => {
            warn!(?err, ?path, "profile file could not be read");
            HashMap::new()
        }
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
            "https://oldskool.vercel.app,http://127.0.0.1:8000,http://localhost:8000".into()
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
        assert!(!c.valid_move(10.0, 10.0, 11.0, 10.0));
        assert!(!c.valid_move(10.0, 10.0, 11.0, 11.0));
        assert!(c.valid_move(10.0, 10.0, 10.0, 11.0));
    }
}
