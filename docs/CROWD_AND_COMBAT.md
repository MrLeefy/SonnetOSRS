# World 1 residents and combat presentation

World 1 includes simulated residents so the Grand Exchange and PvP perimeter feel occupied even when few humans are online. They are game-controlled characters, not claims of real connected people. Examine identifies them as simulated residents, chat history prefixes their messages with `[Sim]`, and server snapshots expose `simulated: true`.

Ten social residents stay in the protected Grand Exchange area. They wander short distances around bank-standing spots, rotate setups and chat. Ten PvP residents spawn beyond the safe ring and can pursue available PvP targets, eat, change melee/ranged/magic setups, use protection prayers, fire specials and retreat/respawn.

The chat is deterministic/procedural in this release, not an external LLM call. That keeps latency, cost and moderation predictable while still providing varied short GE/PvP conversation.

## Movement presentation

Rust remains authoritative for the tile route. A walking tick contains one legal tile segment and a running tick up to two. The client buffers those exact segments. Position, movement animation and facing are sampled from the same segment in the same render frame. Facing is quantized to the eight legal tile directions and changes at the segment boundary before the avatar translates down the new segment. No client-side catch-up diagonal is synthesized across a turn.

## Combat presentation

Snapshots carry the actor's visible loadout, weapon, style, spell, overhead prayer and special energy. Server attack events include weapon/style/spell/special metadata. The renderer starts the matching melee/cast/shoot animation at attack time and spawns bolts or spell projectiles before the server-owned hit result. Damage, safe-zone legality, attack speed, line-of-sight/range, protection reduction, ice freeze state and resident eating remain server decisions.

This is an improvement to the existing OLDSKOOL combat foundation, not a claim of exact official RuneScape formulas or assets. Full online inventory/equipment authority and every special/spell remain future work.
