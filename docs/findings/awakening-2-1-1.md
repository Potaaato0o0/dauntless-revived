---
title: The 2.1.1 standalone attempt
parent: Findings
nav_order: 8
description: "Our first attempt on the final Dauntless 2.1.1 client: a full login chain against our own backend, Ramsgate rendered, and why no controllable player appeared."
lang: en
ref: findings/awakening-2-1-1
---

{% assign contract_page = site.pages | where: "path", "findings/backend-contract.md" | first %}
{% assign internals_page = site.pages | where: "path", "findings/client-internals.md" | first %}
{% assign mp_page = site.pages | where: "path", "findings/multiplayer.md" | first %}
{% assign crashes_page = site.pages | where: "path", "findings/crashes.md" | first %}
{% assign tools_page = site.pages | where: "path", "tools.md" | first %}

# The 2.1.1 standalone attempt
{: .no_toc }

Before we moved to 1.4.4 and Undaunted, we started on the final client, **2.1.1**
("Awakening", December 2024, Unreal Engine 5.1.1, IoStore). The goal was to stand in Ramsgate
alone, with no game server, by booting the client straight into the city against our own backend.

We got most of the way. The full login chain works against our server. Ramsgate renders and stays
up. The client binds its character. **We never got a controllable player.** The client's account id
stays empty, and without it no player pawn spawns.

This page records where we stopped, so that anyone working on a late build can continue from there.
Everything on it is about **2.1.1** unless a line says otherwise. Response shapes are covered in more
detail on [Backend contract]({{ contract_page.url | relative_url }}). Launch switches, logging and
the hang detector are on [Client internals]({{ internals_page.url | relative_url }}).

> **Correction.** We tried a standalone boot at all because we had concluded that multiplayer was
> impossible with a client-only build. That conclusion was wrong. The executable cannot host
> *by itself*, but its network layer is intact, and an injected DLL can drive it. That is how
> Undaunted hosts Ramsgate and hunts on 1.4.4. See
> [How multiplayer works]({{ mp_page.url | relative_url }}). With hindsight, the route for 2.1.1 is
> the one under [Where to continue](#where-to-continue), not a standalone boot.

<details open markdown="block">
  <summary>Contents</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

---

## Where we stopped

| Step | State on 2.1.1 |
|---|---|
| Client starts without EasyAntiCheat, install unmodified and signature-valid | Works |
| Epic sign-in through EOS (account portal in a browser) | Works, as of September 2026 |
| Phoenix login chain against our backend, including character creation | Works |
| Boot straight into Ramsgate | Works (`GameDefaultMap`) |
| Stay up | Works, with memory caps and correct response shapes. No crash in several five-minute runs. |
| Character bound to the session | Works (`?CharacterId=` on the boot URL) |
| Account id bound | **No. This is the blocker.** |
| Player pawn in Ramsgate | Never spawned |

---

## The build

| | |
|---|---|
| Version | 2.1.1, build 682486, changelist 682875 |
| Engine string in crash reports | `5.1.1-682875+//phx-archon/release/2.1.1` |
| Signed | Phoenix Labs, timestamp December 2024 |
| Content | IoStore. 157 `.utoc`/`.ucas` pairs. 141 of the 156 `.pak` files are 339-byte stubs. The other 15 hold loose files, among them the cooked config in `Archon_50-WindowsClient.pak` (Oodle-compressed). |
| Target | Client only (`WITH_SERVER_CODE=0`). See [Client internals]({{ internals_page.url | relative_url }}). |
| Backend | `OnlineSubsystemPhoenix`, Phoenix's own REST API on `*.steelyard.ca`. It is not PlayFab. |

We verified our copy against Phoenix's manifest (352 of 352 files) and every binary's Authenticode
signature (75 of 75) before we ran anything. We never modified the install. Everything below was
done through the user config, the command line and the backend.

---

## Pointing the client at our backend

- **Hosts file.** Every `steelyard.ca` service host in the cooked config (23 by our count), plus
  `steelyard.online`, `cdn.playdauntless.com` and `store.playdauntless.com`, points to `127.0.0.1`
  **and** `::1`.
- **TLS.** Our server presents a wildcard certificate for `*.steelyard.ca`, signed by our own
  private CA. 2.1.1 reads its CA bundle from a loose file,
  `<game folder>\Engine\Content\Certificates\cacert.pem`. We added our CA there. Never add it to the
  Windows trust store.
- **Both address families.** The client uses both the IPv4 and the IPv6 entry. Our test backend
  (Python, FastAPI) runs four listeners: 443 for HTTPS and 80 for plain HTTP and the presence
  WebSocket, each on IPv4 and IPv6. Uvicorn sets `IPV6_V6ONLY` on a `::` bind, so a single dual-stack
  listener does not work.
- **Launch.** Start `Archon\Binaries\Win64\Dauntless-Win64-Shipping.exe` directly with
  `-EpicPortal -AUTH_TYPE=accountportal -AUTH_LOGIN=unused -AUTH_PASSWORD=unused`. All three `AUTH`
  switches are needed. EOS opens Epic's account portal, and the player signs in there themselves.
  Never start `start_protected_game.exe`, the EasyAntiCheat bootstrapper.
- **Stale overlay processes.** A crashed run can leave `EOSOverlayRenderer-Win64-Shipping`
  processes behind, and they block the sign-in overlay on the next launch. End them before you
  relaunch.

This depends on Epic's EOS service still accepting sign-ins for the Dauntless deployment. It did in
September 2026. If Epic retires the deployment, the 2.1.1 login stops at the first step, whatever
the backend does. 1.4.4 has no such dependency.

---

## The login chain

After the EOS sign-in, the client walks this chain. With these answers it completes, and
`FOnlineIdentityPhoenix` reports login complete with a real account id. All of it was seen live.

| Call | What we answer |
|---|---|
| `POST login-queue-prod/login` | Flat, exactly five fields: `{"state": "OPEN", "error_code": "", "title": "", "message": "", "timeout": 5000}` |
| `GET gamesession-prod/features/platform/win` | `crossplay` and `crossprogression`, both `true`. We send them flat and wrapped in one body, because our readings disagreed. |
| `GET login-queue-prod/maintenance/status` | Accepted. We did not work out which fields it reads. |
| `GET gamesession-prod/account/link/epic/{id}` | Wrapped: `{"code": "OK", "message": "", "payload": {"isLinked": true}}` |
| `PUT gamesession-prod/gamesession/epiceos` | Wrapped. The payload holds `sessiontoken` and `sessionid`. From here on `sessiontoken` is the bearer for every other service. |
| `GET auth-prod/accountinfo` | Flat: `{"username": "...", "accountId": "..."}` |
| `GET auth-prod/tags`, `GET auth-prod/isbanned` | Answered. We did not work out which fields they read. |
| `GET dauntless-prod/character` | A **bare array** of `{"id", "name", "updateVersion", "data"}` |
| `PUT dauntless-prod/character` with `{"name": "..."}` | Creates a character. Bare `{"id", "name"}`. |
| `POST dauntless-prod/character` | Saves the character's data blob. Bare `{"data": "<string>"}`. Only `data` is read. |

Then come `inventory`, `mm2/candidate/player/register`, `game_tuning`, `accountinfo/public` and
`account/mapping`.

The rules that took longest to find:

- **Wrapped or flat depends on the host.** `gamesession-*` wraps everything in
  `{"code", "message", "payload"}`. A flat body parses, but the payload is never read. That is why
  `isLinked: true` and `isLinked: false` first behaved the same. `auth-*` and `dauntless-*` are
  flat.
- **The login queue has exactly five fields.** Only `state` equal to `OPEN` lets the player through.
  Anything else makes the client poll again after `max(timeout × 0.001, 5.0)` seconds.
- **Two subsystems read `GET /character`.** The character list needs `id` and `name`. The data store
  finds the element with its id and needs `updateVersion` (a number) and `data` (a *string* holding a
  JSON object, or `null`). Without the last two, the client sent the request six times in a row and
  then failed the login.
- **Store `updateVersion` exactly as sent.** The client increments it *before* it sends a save. If
  the server adds 1 again, the next read looks like a conflict.
- **Key the player on the Epic JWT's `sub` claim, not on the bearer.** The session request carries
  the EOS token (a JWT) as its bearer, and Epic re-issues that token. Keying on the raw bearer gave
  the player a new character on every login. We derive stable Phoenix ids from `sub`. We only use it
  as a lookup key on a private test server and do not verify the signature, so do not treat it as
  authentication.

### What the normal flow does next

The character data blob decides where "Play" goes. `ULoginScreen::AdvanceToPlay` (`0x142d128f0`)
reads the key `PlayerAccountProgressStep` from the blob through `GetPlayerAccountProgressState`
(`0x1429d0160`):

| Value | Ordinal | "Play" leads to |
|---|---|---|
| `New` | 0 | Tutorial cinematic and character creator |
| `SavedCharacter` | 1 | Training grounds |
| `TrainingGroundsComplete` | 2 | Hunting grounds |
| `DefeatedGnasher` and above | 3+ | "Progression is Entered Ramsgate : So...entering Ramsgate..." |

Every one of these destinations is matchmade, the tutorial island included. With no game server to
travel to, the normal flow ended in "You have been signed out". That is what pushed us to try a
standalone boot.

Two traps in the blob:

- **Every value must be a JSON string.** Each value goes through `FJsonValue::TryGetString`
  (`0x14142ba4a`). The first failure clears the success flag and resets the whole store, so a single
  JSON boolean silently throws away every other key. The client itself writes `"true"` as a quoted
  string. We seed new characters with `{"PlayerAccountProgressStep": "EnteredRamsgate"}`.
- **Do not add `HasFinishedTutorial`.** If the key is present at all, whatever its value, the state
  is raised to at least 6. At 6 and above, `AArchonHUD::CanDisplayMOTDScreen` passes its progress
  check, and the client opens a full-screen message of the day and tries to download its texture
  from a backend that has none. `EnteredRamsgate` (4) already clears every gate we found.

---

## Booting straight into Ramsgate

### The user config

Unreal lays a writable user config over the cooked defaults:

```text
%LOCALAPPDATA%\Archon\Saved\Config\WindowsClient\Engine.ini
%LOCALAPPDATA%\Archon\Saved\Config\WindowsClient\Game.ini
%LOCALAPPDATA%\Archon\Saved\Config\WindowsClient\Input.ini
%LOCALAPPDATA%\Archon\Saved\Config\WindowsClient\RuntimeOptions.ini
```

`Game.ini`, `Input.ini` and `RuntimeOptions.ini` ship empty. The game writes `Engine.ini` itself.
Copy the files somewhere safe before you edit them. A bad `GameDefaultMap` stops the game from booting
at all. Our early notes said this build ignores loose config. That was wrong; the correction is on
[Client internals]({{ internals_page.url | relative_url }}).

**1.4.4 reads the same folder.** If you have both builds, move the 2.1.1 files aside before you run
1.4.4. A leftover `GameDefaultMap` or `LocalMapOptions` breaks the 1.4.4 login flow.

### The map override

The cooked `GameDefaultMap` is `/Game/Maps/Map_LoginMenu`. Overriding it in the user `Engine.ini`
boots the client straight into the city:

```ini
[/Script/EngineSettings.GameMapsSettings]
GameDefaultMap=/Game/Maps/ramsgate/ramsgate_01_persistent
```

- **The package path.** `ramsgate_01_persistent` is the persistent level. The other `ramsgate_01_*`
  packages are streaming sublevels. We found the path by listing the IoStore directory indexes with
  `utocdir.py` (see [Tools]({{ tools_page.url | relative_url }})). It is in
  `Archon_Maps_2-WindowsClient.utoc` as
  `../../../Archon/Content/Maps/ramsgate/ramsgate_01_persistent.umap`, and `Archon/Content/` maps to
  `/Game/`. The cooked config already names the same map as `ServerDefaultMap` and as
  `[RamsgateRework] CityMap`.
- **How it is used.** `UGameInstance::StartGameInstance` (`0x144dba330`) builds the boot URL from
  `GameDefaultMap` plus `LocalMapOptions` and browses to it. By our static reading, this shipping
  build ignores a map named on the command line. The command-line pointer is replaced with an empty
  string first (`0x144dba3ad`).
- **`?listen` fails.** `LocalMapOptions=?listen` makes the boot fail with "The default map ... could
  not be found. Exiting." `LoadMap` calls the stubbed `UWorld::Listen`, which always returns false.
  The dialog appears whenever `Browse()` fails, not only when a map is missing.

### The game mode

By our reading, `ramsgate_01_persistent` has no game-mode override in its world settings: its name
table contains no `BPGM_*` class and no `/Game/Blueprints/GameMode/` path. (A second, independent
check was inconclusive, so treat this as **likely**.) `CreateGameModeForURL` (`0x144da42c0`) tries,
in order: the world settings, a `?game=` option on the URL, the `GameModeMapPrefixes` table,
`GlobalDefaultGameMode`, and finally the engine's base class. So our first boots most likely ran the
global default, `BPGM_Archon_Prototype_C`. We set the city game mode instead:

```ini
[/Script/EngineSettings.GameMapsSettings]
GlobalDefaultGameMode=/Game/blueprints/gamemode/BPGM_City.BPGM_City_C
```

We did **not** find out how the city player controller (`player_controller_city_bp_C`) gets
chosen. No game-mode blueprint and no ini sets it, and the exe has no string for it. Do not assume
that switching to `BPGM_City` gives you the city controller.

### Keeping it up

The first boots rendered Ramsgate and then died, in three different ways. All three are covered on
[Crash forensics]({{ crashes_page.url | relative_url }}):

- **Memory.** Uncapped, the client grew to about 9 GB. Streaming-pool and scalability caps in the
  user `Engine.ini` hold it to about 2.8 GB. Our launcher also kills the process above 6.5 GB.
- **Hangs.** Unreal's hang detector closed the client a few minutes in. For investigation, set
  `HangsAreFatal=False` in `[Core.System]`, and raise `PlayerStartEventTimeout` in `Game.ini` so the
  120-second failsafe does not hide the real cause.
- **Wrong shapes.** Our backend's "discovery" placeholders crashed the client. Unknown routes must
  return a body-less 404, and known routes must return the exact shape.

With all of that in place, Ramsgate loads in about 20 seconds, and it stayed up with no crash in
several five-minute runs. The city renders with its shops, lanterns and NPCs, but no player of our
own. Without a console or a log
file, the telemetry heartbeat's `map` field (`tracking-prod/heartbeat`, every second) was how we
confirmed where the client really was.

Our final launch script did this. `<character id>` is the id our `GET /character` returns for the
player:

```powershell
param([int]$CapMB = 6500, [int]$MaxSeconds = 240)
$cfg = "$env:LOCALAPPDATA\Archon\Saved\Config\WindowsClient"
Copy-Item "$cfg\Engine.ini.bak" "$cfg\Engine.ini" -Force        # start from a known-good copy

Add-Content -Path "$cfg\Engine.ini" -Encoding ASCII -Value @"

[/Script/EngineSettings.GameMapsSettings]
GameDefaultMap=/Game/Maps/ramsgate/ramsgate_01_persistent
LocalMapOptions=?CharacterId=<character id>
GlobalDefaultGameMode=/Game/blueprints/gamemode/BPGM_City.BPGM_City_C

[Core.System]
HangsAreFatal=False
HangDuration=600.0

[SystemSettings]
r.Streaming.PoolSize=400
r.Streaming.LimitPoolSizeToVRAM=1
; ... the rest of the caps listed on the Crash forensics page
"@

Set-Content -Path "$cfg\Game.ini" -Encoding ASCII -Value @"
[/Script/Archon.ArchonPlayerController]
PlayerStartEventTimeout=600.0
"@

$exe = "<game folder>\Archon\Binaries\Win64\Dauntless-Win64-Shipping.exe"
$p = Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe) -PassThru -ArgumentList @(
  "-EpicPortal", "-AUTH_LOGIN=unused", "-AUTH_PASSWORD=unused", "-AUTH_TYPE=accountportal",
  "-windowed", "-ResX=1280", "-ResY=720", "-nosplash",
  "-nothreadtimeout", "-noheartbeatthread", "-nocheckpointhangdetector")
# ...then the memory watchdog loop from the Crash forensics page
```

We used `HangDuration=600` and `-nothreadtimeout` at the time. With hindsight, keep `HangDuration`
at 60 and leave out `-nothreadtimeout`. `HangsAreFatal=False` alone stops the kill and still reports
which thread hung. [Client internals]({{ internals_page.url | relative_url }}) explains why.

---

## Why no player appears: the player-data loaders

The city loads, but the pawn only spawns after the client has loaded the player's data from the
backend:

1. `AArchonPlayerController::OnPostLogin` (`0x1429d6ea0`) calls `UArchonLoadManager::Begin`
   (`0x14299b670`).
2. `Begin` starts every registered `IArchonPlayerDataLoader`, each after the loaders it depends on.
3. `UArchonLoadManager::Complete` (`0x14299d860`) passes only when **every** loader has reported
   done. Otherwise it goes round again.
4. Then `AArchonPlayerController::OnPlayerDataLoadComplete` (`0x1429d6900`) runs. It is the only
   path to `CanRestartPlayer()` and `ServerRestartPlayer()`, and so the only path to a pawn.
5. If the loaders time out, `UArchonLoadManager::LoadFailed` (`0x1429ad0f0`) sends the telemetry
   event `playerdata_load_failed` and returns the player to the menu with "Loading timeout while
   receiving Player data".

### The eleven loaders

`AArchonPlayerController::PostInitializeComponents` (`0x1429dbb60`) registers them, but only when
the controller has authority. In a standalone boot it always does. In registration order:

| # | Loader | Backend call | Notes |
|---|---|---|---|
| 1 | `UProgressionComponent` | `progression-prod/progression/config`, `/progression/{accountid}`, `/progression/objectives/{accountid}` | Waits on Entitlements. See the open risk below. |
| 2 | `UQuestSystemComponent` | none of its own | Waits on HuntPass |
| 3 | `AArchonLoadout` | `loadout-prod/loadout/{account_id}/{character_id}/all` | The only loader that holds back "done" when its request fails. Waits on the inventory loader. |
| 4 | `EntitlementsComponent` | `auth-prod/entitlementsv2` | Root of the longest chain |
| 5 | `CohortsComponent` | `cohort-prod/playertreatments/{id}` | Fails open: falls back to treatment `E1000` and reports done |
| 6 | `HuntPassComponent` | `/huntpass/{id}` | Only registered when a feature flag is on. Reports done at once if the progression interface is missing. |
| 7 | `UArchonInventoryDataLoader` | `dauntless-prod/inventory/{a}/{c}` | A failure sends the player back to the menu |
| 8 | `UCooldownComponent` | `progression-prod/cooldown/{accountid}` | |
| 9–11 | `UBountyComponent`, `_Daily`, `_Weekly` | `progression-prod/bounty/...` | |

The dependency chains:

```text
Entitlements -> Progression -> HuntPass -> QuestSystem -> Bounty -> Bounty_Weekly -> Bounty_Daily
Entitlements -> HuntPass
Cooldown, Progression, QuestSystem -> Bounty
InventoryDataLoader -> Loadout
```

One stuck loader near the root stops everything behind it. That is what happened with
entitlements. We first answered `GET /entitlementsv2` with a bare `[]`. That cannot parse (the
reader needs a top-level object), so the Entitlements loader never finished, and six loaders behind
it never even started. The client re-requested `entitlementsv2` on every load cycle and never asked
for `/progression/*` at all. The right answer is `{"entitlements": []}`, with element fields
`name`, `duration` and `activatedDate`.

### The work list

With the backend in strict mode (unknown routes get a body-less 404), the client's retries made the
work list exact. These thirteen requests each failed about 70 times before the client gave up. The
empty path segments are the missing account id (and, before `?CharacterId=`, the character id):

| Request | What we answer | How we know the shape |
|---|---|---|
| `progression-prod/pjm/` | `{"nodes": {...}}`, an object keyed by node id | The client's own `POST /pjm` body |
| `progression-prod/cooldown/` | `{"cooldowns": [...]}` | The client's own `PUT /cooldown/batch` body |
| `progression-prod/escalation/ESC_SEASON_1/` to `ESC_SEASON_6/` (six requests) | Wrapped: `escalation_level`, `next_level_xp`, `talents_progress` (array), `unlock_progress` (array), `update_version` | Read from the deserialiser |
| `mailbox-prod/survey/config` | Wrapped, empty list | **Unverified.** We found no deserialiser for it. |
| `mailbox-prod/eventstats/` | Wrapped | Read from the deserialiser |
| `gauntlet-prod/config` | Wrapped; `each_level_rewards` and `milestone_rewards` must be arrays | Read from the deserialiser |
| `dauntless-prod/inventory//` | Flat `{"stackedItems": [...], "instancedItems": [...]}` | Read from the deserialiser |
| `cohort-prod/playertreatments/` | Wrapped, `{"treatments": []}` | Read from the deserialiser |

The routes must accept empty path segments and fall back to the bearer token to find the player.
Full shapes are on [Backend contract]({{ contract_page.url | relative_url }}).

### The weapon and lantern

Once the loaders are satisfied, `AArchonPlayerController::CheckForPlayerStart` blocks the player start
while `ArchonCharacter->Weapon` or `->Lantern` is null. `[DefaultLoadout]` in `DefaultGame.ini` names
`WP_EB_TRAINING` and `LT_BASIC`. The client's own starter grant (a `POST /inventory` it sends
itself) covers armour, banner, flare and a weapon part, but not those two. On the retail servers the
tutorial we skip handed them out. Our backend gives every player both items, and returns them in the
`createdInstancedItems` of the inventory transaction reply as well.

### An open risk in progression

On the authority path, `UProgressionComponent` reports done only when four readiness flags are set
(checked at `0x1427cd0d0`). We found writers for three of them: the config reply, the progression
reply and the objectives reply. We found none for the fourth (`+0x3f3`). If it really has no writer,
progression can never finish in a standalone boot, whatever the backend sends. We could not test
this, because the account id blocked us first. If you solve the account id and the pawn still does
not appear, look here first.

---

## Binding a character: `?CharacterId=`

Before this, every request went out with `"characterId": ""` and `"accountId": ""`, and paths
collapsed to `/inventory//` and `/loadout///all`.

The exe's local-player and login code contains the literals `?CharacterId=%s`, `?PlatformPool=%s`
and `AuthToken=%s`. They look like URL options. We tried the first one on our boot URL:

```ini
[/Script/EngineSettings.GameMapsSettings]
LocalMapOptions=?CharacterId=<character id>
```

**It is consumed.** After this, requests carried the character id and paths became
`/inventory//<character id>`. The id must be one that `GET /character` returns for this player. The
direct boot only lists characters and never creates one. So our backend creates a character when the
list is empty, because an empty list leaves every later id empty as well.

The account id stayed empty.

---

## The blocker: an empty account id

### The symptom

- Every request carries `"accountId": ""`, and every `{accountid}` segment is empty
  (`/progression//`, `/loadout//<character id>/all`).
- No request carries an `Authorization` header at all.
- The client's own telemetry reports `client_login_failed` at step `LoginToEpicProxy`, with
  "Failed to login to Epic with no given Auth info".

### Where the account id comes from

- `{accountid}` is filled from `FUniqueNetId::ToString()` of the local player's Phoenix id. The id
  comes from `IOnlineIdentity::GetUniquePlayerId()` and is cached on the local player
  (`UArchonLocalPlayer + 0x930`). It is not a string the client stores anywhere else.
- The only backend reply that carries an account id is `GET auth-prod/accountinfo`. The client only
  asks for it from the login path.
- The URL builders do not skip a request when the id is empty. They substitute an empty string, for
  example `FOnlineLoadoutPhoenix::GetAllLoadouts` at `0x141420b24`. That is why the requests keep
  coming with `//` in them.

### Why the direct boot never gets one

The whole login and character-selection flow lives inside a map. `Map_LoginMenu` runs Blueprint and
UMG screens (`LoginScreen_bps`, `PressStartScreen_bps` and others), and they drive the Phoenix
identity interface. As far as we can tell there is no C++ auto-login on the client: the function
that reads `AuthEndpoint` has no direct callers. Overriding `GameDefaultMap` does not delay that
flow. **It removes it.**

### What we ruled out

| Idea | Result |
|---|---|
| `?AuthToken=...` on the boot URL | Not consumed |
| `?AccountId=...` on the boot URL | Not consumed |
| A config key that forces login before the map, or injects an id | None found. `GameMapsSettings` has no such option. |
| A command-line switch | None. We listed every switch-shaped string in the exe. The only Archon-specific ones are `-DISABLE_MATCHMAKER_AUTH`, `-GAMESERVER_INSTRUCTION_FILE=` and `-GAMESERVER_STATUS_FILE=`. `-AUTH_*` is EOS's own auto-login for the Epic identity, not the Phoenix one. |
| A backend answer that sets the id | None. The direct boot never makes the one request whose reply carries it. |
| The console | `ALLOW_CONSOLE` is compiled out |

---

## Where to continue

### The route we would take now

**Let the normal login run, then travel to a real server.**

- After a completed login, the Phoenix identity and the local player live on the game instance, not
  on the world. So the identity survives a later map change (**likely**, from the object layout; not
  tested).
- The client's own way into the city is matchmaking. `UArchonOnlineSessionClient::TravelToCity` asks
  `mm2-prod` for a city session and then connects with the connect string
  `%s:%d?ticket=%s?gameSessionId=%s?EncryptionToken=%s`. That is always host and port, never a local
  package name.
- So you need a host. The 2.1.1 executable cannot host by itself, but an injected DLL can make a
  second copy of the same exe host. [How multiplayer works]({{ mp_page.url | relative_url }})
  describes how Undaunted does this on 1.4.4. The matchmaking contract the client expects
  (`/candidate/status`, `serverInfo`, `isNewMatchmaker`, `playerStates`) is on
  [Backend contract]({{ contract_page.url | relative_url }}).
- **Do not load Undaunted's DLL into 2.1.1.** It patches fixed addresses in the 1.4.4 exe and would
  corrupt memory in any other build. Every address has to be found again for 2.1.1. Another
  community project, [Mystic Paradox](https://github.com/pranav158/Mystic-Paradox), is porting the
  approach to 1.12.0. We have not tried it.

### 2.1.1 addresses to start from

Static addresses, image base `0x140000000`. The names are ours, taken from log strings in each
function. The shipping exe has no symbols.

| What | Address |
|---|---|
| `UWorld::Listen`, a stub: `xor al, al` / `ret` | `0x140bfde50` |
| Its call in `UEngine::LoadMap` | `0x14537140e` |
| `UWorld::GetNetMode`, always `NM_Client` when a net driver exists | `0x1453e4ef0` |
| `GIsClient` / `GIsServer` | `0x1488ea0f2` / `0x1488ea0f3` |
| A `GIsClient` write in `FEngineLoop::PreInit` (from a register; 1 in a normal game run) | `0x140c0f683` |
| `UIpNetDriver::InitListen`, intact | `0x140c6d200` |
| `UGameInstance::StartGameInstance` (boot URL) | `0x144dba330` |
| `UGameInstance::CreateGameModeForURL` | `0x144da42c0` |
| `AArchonPlayerController::PostInitializeComponents` (registers the loaders) | `0x1429dbb60` |
| `AArchonPlayerController::OnPostLogin` | `0x1429d6ea0` |
| `UArchonLoadManager::Begin` / `Complete` / `LoadFailed` | `0x14299b670` / `0x14299d860` / `0x1429ad0f0` |
| `AArchonPlayerController::OnPlayerDataLoadComplete` | `0x1429d6900` |
| `GetPlayerAccountProgressState` | `0x1429d0160` |
| `ULoginScreen::AdvanceToPlay` | `0x142d128f0` |
| `FJsonSerializable::FromJson(const FString&)` | `0x140c2fbe0` |
| JSON `int32` reader (type-gated, skips on a mismatch) | `0x140c3a870` |
| `FCandidateStatus::Serialize` / `FServerInfo::Serialize` | `0x1414c2a10` / `0x1414c7bf0` |
| `FThreadHeartBeat::InitSettings` (hang detector settings) | `0x142ec08c0` |

### If you stay with a standalone boot

- The lever would be something that sets the local player's Phoenix id before the loaders start.
  Nothing in config or on the command line does. It would take injected code.
- Expect the progression readiness flag described above to be the next wall.
- Watch the `playerdata_load_failed` telemetry event. Its `loaders` array names each loader and
  whether it finished. It may never fire, though. Its timer rate comes from a field we found no
  writer for.

---

## Why we moved to 1.4.4

- **Undaunted already runs multiplayer Ramsgate, hunts and the tutorial on 1.4.4**, with the retail
  client and an injected server DLL. On 2.1.1 we would have had to build all of that ourselves.
- **1.4.4 predates EOS.** Players log in with an account on our own server. No Epic account is needed,
  and no Epic service can switch it off.
- **Our 2.1.1 work carries over.** The two builds talk to the same Phoenix service. Their endpoint
  config shares 170 keys, and 167 of those have byte-identical values; the three that differ are
  voice chat. Response shapes can still differ between the builds.
- **The cost:** everything released after October 2020 is missing from 1.4.4.
