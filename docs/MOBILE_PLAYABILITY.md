# Mobile playability pass — 2026-10-02

## Changes

- A persistent touch dock: Eat, Potion, Prayers, Special, Run, large Bag, and More. Food counts, potion doses, prayer points, and energy stay visible
- Touch-specific space allocation gives the world more room while retaining the classic minimap, right-side panels, chat, and all 28 original inventory slots
- An additional large-button inventory, equipment, prayer, spell, and combat sheet. Inventory has explicit Item options, including guarded Drop, instead of requiring a precise long press
- Quick prayer opens selection if none have been configured. Empty food/potion actions explain the missing supply. Special attack explains missing weapon/energy
- Visible disconnected/terminal-error status, retry when reconnection stopped, and return to mode selection
- Online eating no longer calls an out-of-scope function. Food/potion actions remain intentions; item quantities and stats change only after server messages
- Stale online Drop cannot act on a replacement item. Changed authoritative inventory cancels old menus and pointer drags
- Online sandbox commands cannot produce fake local gear/stats. Expedition-only spells cannot silently turn into online melee
- Appearance editing uses a separate persistent draft; later snapshots do not discard earlier palette choices, and Cancel does not mutate authoritative appearance
- Arena bank title identifies its free kits. Enlarged close controls and a large-controls menu shortcut remain available

## Verification

Run `npm run check`, `npm test`, and `npm run build`. The JavaScript test command includes the original 65 runtime checks, a separate network-adapter/mobile-helper suite, and nine phone/tablet geometry configurations. Network tests use a fake transport and assert outgoing intentions, not real socket integration or physical touch events.

The Rust backend unit suite passed 63 tests in an isolated target directory. No Rust server source was changed in this pass.

The existing Chromium suite now also covers the touch dock size, one-dose potion taps and cooldown, empty supplies, and the large inventory actions. Old hard-coded source hashes were replaced with running API assertions: legitimate later gameplay fixes had already invalidated the hashes.

Browser execution in the current workspace was blocked: the connected cloud browser reported WebGL unavailable, and isolated Chromium could not create its required local process socket. Browser suites, rendered visual QA, full playthrough, real phone testing, and real client-to-server integration are therefore **not certified by this pass**. A WebGL-capable, sandbox-supported test environment must run `npm run verify:full` before release. No security restrictions were disabled to run these checks.

Production and backend were not deployed or changed. The latest source baseline was `oldskool-online` at `62d2cc8`; the verified production deployment at the start was the earlier `c455d2b`.
