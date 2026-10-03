# Hunt launch configuration

The deploy server selects each hunt's map, game mode, behemoth and matchmaker hunt from the 1.4.4 tables. It passes these plus the complete `accountId:playerHuntId` roster to the server DLL. The DLL builds the travel URL with `HuntId` and `PlayerHuntIds`; the launcher starts the client and connects it to the assigned world.

Training explicitly uses `?game=/Game/Blueprints/GameMode/BPGM_ArchonTrainingGrounds.BPGM_ArchonTrainingGrounds_C`, the Training matchmaker hunt ID, and the catalog's 12-player capacity. Concurrent requests share one launch. Ramsgate and Training omit a fixed expected-player roster because players join these persistent worlds over time.

`hunt-contract.test.ts` checks map, hunt ID and a two-player roster across catalog entries with valid matchmaker references, plus concurrent Training requests. These checks validate launch arguments; they do not replace in-game progression, invite, travel or respawn tests.

If pursuits fail with capacity reason `ports`, inspect the hunt port pool before changing memory admission. Two ports are reserved for persistent worlds. Keep the deploy range, firewall allowlist range and installation configuration consistent when expanding the pool. Memory admission still governs how many processes may actually start.
