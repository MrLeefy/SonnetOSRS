# QA report — v0.2.0

The checks below were executed on the Oracle development VM with Node 20 and headless Chromium through Playwright 1.63.0. Code was exercised in an isolated worktree; no existing game server or production web service was replaced.

## Executed

| Suite | Result | Scope |
|---|---:|---|
| Source syntax | Pass | `src`, `tools` and `tests` JavaScript |
| Runtime regressions | 65 passed | Actual engine modules in a deterministic Node VM |
| Browser checks | 30 passed | Chromium desktop, emulated Pixel 7 touch, portrait/landscape and a 320 px viewport |
| Standalone build | Pass | Twenty required modules; deterministic output |
| Arena stress simulation | 1,200 ticks | Fourteen bots plus player/clerks; inventory, actor and queue bounds |
| Expedition stress simulation | 900 ticks | Enemy/node counts, lifecycles, local-save validation |

The accelerated tick tests advance simulated time; they are not 12-/9-minute wall-clock tests, an FPS benchmark, a network test, or a multiplayer capacity claim. Pixel 7 is a browser emulation profile, not a handset connected to the VM. Recorded software-rendered FPS is not evidence of performance on the user's phone.

## Browser coverage

The suite boots the full generated game, uses native profile/mode buttons, pauses/resumes modal menus, gathers via the normal world-click path, deposits/withdraws through the bank interface, crafts a recipe, claims a contract once, reloads a saved character, switches modes without mixing saves, tests legacy mouse/orbit controls, releases held keys on blur, and changes render resolution.

Touch tests include real Chromium touch and multi-touch injection, inventory tap and drag, cancelled pointer sequences, long-press menus, pinch zoom, world-camera dragging, second-finger interference, reduced added motion, layout bounds and graphics-context-loss recovery. A discovered long-press release bug was reproduced with native touch events and fixed before rerunning the passing suite.

## Logic coverage

Atomic insertion/removal/equipment, full-bag displacement, safe stack bounds, dose-aware bank entries, invalid item IDs, stale menu callbacks, dead-character actions, spawn protection, delayed-hit lifetimes, ranged ammunition, diagonal movement/line-of-sight, resource depletion/recovery, crafting transactions, duplicate contract claims, boss warnings, forgiving expedition respawn, XP thresholds, save corruption/version/mode validation, previous-save recovery and allocation-buffer reuse.

## Remaining limitations

- Physical phone, Safari, Firefox, WebGL-driver-specific and assistive-technology verification remain outstanding.
- The native modal UI has keyboard controls, but the original canvas gameplay is not a fully screen-reader-accessible game.
- No multiplayer, real accounts, cloud sync, economy security or anti-cheat certification is claimed. Local saves are user-editable.
- A lost WebGL context is paused and offers reload; transparent in-place GPU restoration is not implemented.
- Expedition balance is a starting point. No long-term progression or drop-rate economy study has been done.
- Ground loot, effects and projectiles have explicit caps; unusually crowded long-running sandbox sessions can age out excess effects/loot.
- GitHub Actions execution is reported separately from these locally executed tests; configuring a workflow does not by itself mean hosted CI passed.

Machine-readable browser results: `qa/browser-results.json`. Text logs: `qa/runtime-test-output.txt` and `qa/browser-test-output.txt`. Screenshots are captured by the browser suite for desktop, touch portrait/landscape, and the journal.
