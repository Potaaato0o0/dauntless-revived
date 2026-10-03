# Hunt overflow

The main deploy server can route whole ISLAND hunt requests, including the party roster,
to a second deploy server. Accounts, progression, Ramsgate and Training stay on the main
server. Running hunts are not migrated; the next hunt is allocated to an available host.

## Operator checks and launcher access

Use one main-server launcher invite for all players. The Discord bot wraps its single-use
registration code in that full invite, including the main gateway's pinned certificate.
Players paste it into Join, register, and keep the account key saved by the launcher.
Existing accounts use `/key link` with their original account key; linking never replaces it.

The main owner dashboard's Overview shows Server #1 and Server #2 CPU, RAM and hunt counts,
followed by summed hunt/RAM totals and **Mean CPU (average across servers)**. This is an
unweighted arithmetic mean: 50% and 5% produce 27.5%, even on hosts with different CPU counts.
It is a monitoring statistic, not the overflow routing threshold. Hunt counts include tutorials
and exclude Ramsgate/Training; the main process sampler updates approximately once a minute.
Missing/stale readings produce unavailable totals rather than treating a down host as zero load.

Verify all three worker health checks (deploy, shared backend connection, player allowlist),
then confirm a real worker hunt has a UDP listener and the expected party roster. The separate
monitor tunnel going down does not itself interrupt the game backend tunnel. Keep all keys,
bot state, database backups and host-specific runbooks outside the public repository.

Set `OVERFLOW_DEPLOYSERVER_URL` to an HTTP IPv4-loopback SSH tunnel and
`OVERFLOW_AFTER_HUNTS` to the number of local hunts/tutorials before spilling over
(default 4). Capacity refusal on either host permits trying the other. A timeout or
connection reset may mean a process already started, so it does not launch a duplicate.

On the worker set `HUNT_WORKER=1`, its public `MY_IP`, the central metagame server key,
and an exclusive game-port range. The last two configured ports are reserved and unused.
All worker hunt ports must be below 8776: the native idle-shutdown exception identifies
persistent worlds by port. Retain the memory guard and limit the worker's hunt slots to
its measured CPU/RAM budget. Install the same tested DLL, game files and runtime.
Fresh Windows hosts also need the Microsoft Visual C++ x64 redistributable and the
legacy DirectX runtimes used by the game. Check a real game's UDP listener: a successful
deploy API response does not detect a missing native DLL dependency.

Keep both deploy APIs bound to loopback. A supervised SSH connection forwards the
worker deploy API and allowlist helper onto the main host, and reverse-forwards the
central metagame port onto worker loopback. Restrict the tunnel key to the main host.
Configure `ALLOWLIST_ADDITIONAL_URLS` in the main gateway with the worker helper's
loopback tunnel URL and share the helper secret securely. Each helper receives only
authenticated player addresses, with independent retry/cache state. Allow the worker's
game UDP range in the provider firewall; Windows Firewall remains address restricted.

The `/gameservers` view includes worker records with `host: "overflow"`; process IDs
belong to that worker and must not be sampled as local PIDs. If the tunnel or worker is
unavailable, its records are omitted and local routing remains available. Configure
service supervision on both hosts and check the reverse backend connection, game UDP
listeners, allowlist updates and an actual player join before calling the setup verified.

The native dedicated-server tick hook caps the game thread at 30 frames per second.
The injected replication loop runs once per game frame. `DR_SERVER_MAX_FPS` accepts 10–120, or 0 to
restore the original pacing. Restart game processes after changing it. This uses
elapsed wall time, not a fixed simulation timestep, and does not cap client rendering.
For read-only diagnostics, the DLL exports `DR_ServerTickCount` and
`DR_ServerSimulatedSeconds`. Sample their differences over a measured interval to
check actual frame pacing and simulation time. Do not use the network driver's
internal tag at offset 0x2AC as a frame counter: replication also advances it.
