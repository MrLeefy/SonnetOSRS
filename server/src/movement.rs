//! Integer-tile pathfinding. Clients request a destination, never a position.
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Tile {
    pub x: i32,
    pub y: i32,
}
impl Tile {
    pub fn new(x: i32, y: i32) -> Self {
        Self { x, y }
    }
}
#[derive(Clone, Debug, Default)]
pub struct Collision {
    pub n: usize,
    pub block: Vec<u8>,
}
impl Collision {
    pub fn blocked(&self, x: i32, y: i32) -> bool {
        x < 0
            || y < 0
            || x as usize >= self.n
            || y as usize >= self.n
            || self
                .block
                .get(y as usize * self.n + x as usize)
                .copied()
                .unwrap_or(1)
                != 0
    }
    pub fn can_step(&self, x: i32, y: i32, dx: i32, dy: i32) -> bool {
        dx.abs() <= 1
            && dy.abs() <= 1
            && (dx != 0 || dy != 0)
            && !self.blocked(x + dx, y + dy)
            && (dx == 0 || dy == 0 || (!self.blocked(x + dx, y) && !self.blocked(x, y + dy)))
    }
    pub fn hash(&self) -> u32 {
        self.block.iter().fold(2166136261u32, |h, b| {
            (h ^ u32::from(*b)).wrapping_mul(16777619)
        })
    }
    pub fn tile(&self, x: f32, y: f32) -> Option<Tile> {
        if !x.is_finite()
            || !y.is_finite()
            || x.fract() != 0.0
            || y.fract() != 0.0
            || x < 0.0
            || y < 0.0
            || x >= self.n as f32
            || y >= self.n as f32
        {
            None
        } else {
            Some(Tile::new(x as i32, y as i32))
        }
    }
    pub fn legal_position(&self, x: f32, y: f32) -> Tile {
        self.tile(x, y)
            .filter(|p| !self.blocked(p.x, p.y))
            .unwrap_or(Tile::new(48, 42))
    }
    /// Search all reachable cells, but never silently redirect to a remote tile.
    /// A blocked destination can be approached within one adjacent tile.
    pub fn path(&self, from: Tile, to: Tile, near: bool) -> Option<VecDeque<Tile>> {
        if self.blocked(from.x, from.y)
            || to.x < 0
            || to.y < 0
            || to.x >= self.n as i32
            || to.y >= self.n as i32
        {
            return None;
        }
        let idx = |p: Tile| p.y as usize * self.n + p.x as usize;
        let mut parents = vec![usize::MAX; self.n * self.n];
        let start = idx(from);
        let mut queue = VecDeque::from([from]);
        parents[start] = start;
        let mut best: Option<(i32, usize)> = None;
        const DIRS: [(i32, i32); 8] = [
            (0, -1),
            (1, 0),
            (0, 1),
            (-1, 0),
            (1, -1),
            (1, 1),
            (-1, 1),
            (-1, -1),
        ];
        while let Some(p) = queue.pop_front() {
            let d = (p.x - to.x).pow(2) + (p.y - to.y).pow(2);
            if d == 0 {
                best = Some((0, idx(p)));
                break;
            }
            if near
                && (p.x - to.x).abs() <= 1
                && (p.y - to.y).abs() <= 1
                && best.is_none_or(|(bd, _)| d < bd)
            {
                best = Some((d, idx(p)));
            }
            for (dx, dy) in DIRS {
                if !self.can_step(p.x, p.y, dx, dy) {
                    continue;
                }
                let q = Tile::new(p.x + dx, p.y + dy);
                let i = idx(q);
                if parents[i] == usize::MAX {
                    parents[i] = idx(p);
                    queue.push_back(q);
                }
            }
        }
        let (_, mut i) = best?;
        let mut route = VecDeque::new();
        while i != start {
            route.push_front(Tile::new((i % self.n) as i32, (i / self.n) as i32));
            i = parents[i];
        }
        Some(route)
    }
    pub fn melee_clear(&self, a: Tile, b: Tile) -> bool {
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        (dx == 0 && dy == 0) || self.can_step(a.x, a.y, dx, dy)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn world() -> Collision {
        Collision {
            n: 96,
            block: vec![0; 96 * 96],
        }
    }
    #[test]
    fn kinked_two_step_route_uses_actual_intermediate_cell() {
        let mut c = world();
        c.block[10 * 96 + 11] = 1;
        let p = c.path(Tile::new(10, 10), Tile::new(12, 11), false).unwrap();
        let mut pos = Tile::new(10, 10);
        for t in &p {
            assert!(c.can_step(pos.x, pos.y, t.x - pos.x, t.y - pos.y));
            pos = *t;
        }
        assert_eq!(pos, Tile::new(12, 11));
    }
    #[test]
    fn no_corner_cut() {
        let mut c = world();
        c.block[10 * 96 + 11] = 1;
        assert!(!c.can_step(10, 10, 1, 1));
        assert!(c.can_step(10, 10, 0, 1));
    }
    #[test]
    fn idle_destination_is_an_empty_success() {
        let c = world();
        assert!(
            c.path(Tile::new(10, 10), Tile::new(10, 10), false)
                .unwrap()
                .is_empty()
        );
    }
    #[test]
    fn blocked_click_approaches_not_enters() {
        let mut c = world();
        c.block[10 * 96 + 11] = 1;
        let p = c.path(Tile::new(8, 10), Tile::new(11, 10), true).unwrap();
        assert_eq!(p.back(), Some(&Tile::new(10, 10)));
    }
    #[test]
    fn blocked_click_without_near_fails() {
        let mut c = world();
        c.block[10 * 96 + 11] = 1;
        assert!(c.path(Tile::new(8, 10), Tile::new(11, 10), false).is_none());
    }
    #[test]
    fn invalid_resume_position_recovers() {
        let c = world();
        for x in [f32::NAN, f32::INFINITY, -1.0, 999.0, 5.5] {
            assert_eq!(c.legal_position(x, 9.0), Tile::new(48, 42));
        }
    }
    #[test]
    fn enclosed_target_is_unreachable() {
        let mut c = world();
        for y in 9..=11 {
            for x in 9..=11 {
                if x != 10 || y != 10 {
                    c.block[y * 96 + x] = 1;
                }
            }
        }
        assert!(c.path(Tile::new(5, 5), Tile::new(10, 10), false).is_none());
    }
    #[test]
    fn exported_world_all_banks_and_gates_reachable() {
        let f: serde_json::Value =
            serde_json::from_str(include_str!("../data/world_collision.json")).unwrap();
        let c = Collision {
            n: 96,
            block: f["block"]
                .as_array()
                .unwrap()
                .iter()
                .map(|x| x.as_u64().unwrap() as u8)
                .collect(),
        };
        for (x, y) in [
            (42, 43),
            (53, 43),
            (42, 53),
            (53, 53),
            (48, 38),
            (58, 48),
            (48, 58),
            (38, 48),
            (64, 65),
            (29, 40),
        ] {
            let p = c
                .path(Tile::new(48, 42), Tile::new(x, y), true)
                .expect("route");
            let mut a = Tile::new(48, 42);
            for b in p {
                assert!(c.can_step(a.x, a.y, b.x - a.x, b.y - a.y));
                a = b;
            }
        }
    }
}
