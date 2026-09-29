# OLDSKOOL v0.5 repair

## Diagnosed movement failure

v0.4 advanced a browser-predicted position while its independent Rust tick broadcast older positions. Receiving an older position cleared a valid route. A rejection nulled `lastX`/`lastY`, causing the same or a zero-distance position to be submitted again and rejected again. Running two steps around an obstacle was also checked by reconstructing a straight line between endpoints, rather than validating the route's actual intermediate tile. These mechanisms explain the repeated `Movement was not a legal world step` messages.

Protocol 2 sends `walk {x,y,seq,run_on}`, `stop`, `run` and `follow` intents. The server calculates a collision-valid BFS path and steps it on its own tick. Sequencing makes duplicate requests harmless and prevents old requests replacing newer targets. A clicked blocked object can be approached from a reachable adjacent tile, but cannot be entered. Absolute position writes are rejected and never automatically retried by the client.

The client interpolates server motion with a monotonic clock; local and server ticks no longer compete to own the character's position. Scene animations continue in online menus. Disconnects clear routes/ghost actors; duplicate active tokens are refused. Minimap input and rendering use the same interpolated centre. Bounds/collision mismatches request a page refresh rather than repeatedly submitting invalid movement.

## Scene and interaction work

Bank booths no longer have opaque blue slabs masquerading as glass. Their revised one-tile models have timber frames, open transaction slots, grilles, brass plaques, drawer panels, counter objects and handles. Their interaction height matches their rendered height. The chest now has a closed faceted lid, straps, hinges and a latch. Buildings have framed/mullioned windows and doorstep/handle details; the GE tower has a cornice and parapet.

Humanoids have tapered torso/limbs, knee details, a proper kite-shield outline, faceted helmets, a pointed wizard-hat crown and a shaped double-sided cloak. Dropped coins, bones, fish, potion bottles, weapons and shields use recognizable meshes. The camera stays above terrain, and ground clicks use a bounded ray search instead of an unstable four-step height guess. The safe-zone badge has separate label and world-status lines, sized to avoid text overlap.

The collision grid is intentionally unchanged by these visual improvements, and a rendered-world/export comparison guards that invariant. Offline combat and progression are not replaced.

## Save and server hardening

Online/offline transitions preserve the original offline inventory instead of overwriting it with the network session. Online settings cannot reset/import an offline profile. Server persistence serializes the entire capture/write transaction, retains a valid backup, refuses to clobber unreadable state, and validates saved positions. Reconnecting retains HP instead of providing free healing. Shutdown closes sockets and saves before exiting. No service credentials, resume tokens or production profile data are committed or packaged.

## Verification

The added Rust tests cover legal kinked routes, corner blocking, repeated destinations, blocked/unreachable targets, corrupt positions, exported-world gate/bank reachability, command ordering, authoritative per-tick speed, stopping, walking/running, concurrent persistence and legacy profile compatibility.

The new browser suite runs actual WebGL clients against an isolated Rust process. It walks around all four bank booths and the counter, enters/exits the ring, approaches a blocked booth, banks after a multi-turn route, retargets rapidly, repeats a destination, submits one bad absolute-move packet and verifies there is no echo flood, injects a stale snapshot, buffers real incoming messages with variable delays, moves while menus are open, reconnects, checks remote idle animations, rejects a duplicate tab token, checks offline inventory isolation, checks finite geometry/badge bounds and rotates a phone viewport.

This does not certify all possible bugs or all OSRS mechanics. Mobile checks emulate Chromium, not physical Android/iPhone hardware. The complete online inventory/economy, authentic magic/ranged formulas, trading and authenticated accounts remain separate work. No measured FPS multiplier or large-concurrency capacity claim is made.

## Final visual review

Actual renderer screenshots revealed a solid prism cap overlapping the hollow central counter and foreground arch/pillar batches hiding the player. The counter now has only the intended outer/inner walls and ring top. Tall GE arches, pillars and the tower are grouped for sightline-based fading; only an obstructing group fades, with opacity and depth-write state restored after drawing. Collision remains unchanged. Added explicit uneven-terrain picking and foreground-visibility regression checks.
