---
title: Game assets and config
parent: Findings
nav_order: 2
description: "How the Dauntless 1.4.4 and 2.1.1 builds store content: pak v9 and IoStore containers, Oodle, the cooked config, key map paths and the user config folder."
lang: en
ref: findings/assets
---

{% assign ci_page = site.pages | where: "path", "findings/client-internals.md" | first %}
{% assign mp_page = site.pages | where: "path", "findings/multiplayer.md" | first %}
{% assign verify_page = site.pages | where: "path", "findings/verification.md" | first %}
{% assign contract_page = site.pages | where: "path", "findings/backend-contract.md" | first %}

# Game assets and config
{: .no_toc }

This page covers how the two Dauntless builds we studied store their content, where the cooked
configuration lives, how to read it without the game's own tools, which map paths matter, and what a
user config file can override. We never modify the files the game shipped with. Everything described
here is read out of those files, or done through the per-user config folder or a loose file placed
beside them (such as the CA bundle described below).

This site and the repository contain no game files, and this page reproduces only short excerpts needed to explain a point.
Both builds' cooked config contains credentials that should never have shipped. See
[Secrets in the cooked config](#secrets-in-the-cooked-config).

<details open markdown="block">
  <summary>Contents</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

---

## The two builds at a glance

| | **2.1.1** (Dec 2024, final) | **1.4.4** (Oct 2020) |
|:--|:--|:--|
| Engine | Unreal Engine 5 | Unreal Engine 4 |
| Package storage | IoStore: `.utoc` + `.ucas` pairs, with a `.pak` beside each (except `global`) | Classic `.pak` only |
| Pak version | 11 (path-hash and full-directory index) | 9 (legacy index) |
| Index encryption | None | None |
| Compression | Oodle (the config blocks we inspected are Kraken), statically linked into the exe | zlib (85 of 86 paks) |
| Containers in `Archon/Content/Paks` | 157 `.utoc`/`.ucas` pairs: 156 containers plus `global`. 141 of the 156 `.pak` files are 339-byte stubs | 86 `.pak` files, 112,396 entries |
| Cooked config | `Archon_50-WindowsClient.pak` (90 KB, 30 `.ini` files) | `Archon_35-WindowsClient.pak` |
| CA bundle | `Archon_0-WindowsClient.pak` → `Archon/Content/Certificates/cacert.pem` | `Archon_0-WindowsClient.pak` → `Archon/Content/Certificates/cacert.pem` |
| Maps | IoStore containers `Archon_Maps_0..2` | Paks `Archon_Maps_0..2` |

Both builds use the same container naming: `Archon_N`, then `Archon_Architecture_N`,
`Archon_ArmourA/B/C_N`, `Archon_Atmospheres`, `Archon_Audio_N`, `Archon_Effects_N`, `Archon_Engine`,
`Archon_Intl`, `Archon_Landscape`, `Archon_Maps_N`, `Archon_NPCs_N`, `Archon_Player_N`, `Archon_Rock_N`,
`Archon_UI_N` and `Archon_Water`. 2.1.1 adds `Archon_MoviesHP`. Mount points are relative to the
install root and vary per container (for example `../../../Archon/` for the 2.1.1 config pak, or
`../../../Archon/Content/Maps/` for a maps container), but the rule is the same everywhere: an engine
package path `/Game/X` is the file `Archon/Content/X` inside a container.

---

## 2.1.1: pak v11 and IoStore

### Most `.pak` files are empty stubs

In 2.1.1 the cooked packages (`.uasset`, `.umap` and so on) live in IoStore containers: a `.utoc`
table of contents and a `.ucas` data file. Each container also has a `.pak` beside it. For 141 of the
156 containers in `Archon/Content/Paks` that `.pak` is a **339-byte stub**: a valid pak v11 footer
(221 bytes), a tiny index and no file data. Tools that only read `.pak` files therefore see nothing
of the maps. The Ramsgate packages are in `Archon_Maps_2-WindowsClient.ucas` (71 MB), not in the
339-byte `.pak` next to it.

The other 15 paks hold files that are not Unreal packages, which IoStore does not store:

| Pak | Contents |
|:----|:---------|
| `Archon_Audio_0..4` | Wwise sound banks and media: 864 `.bnk` + 10,123 `.wem` in total, about 1.2 GB |
| `Archon_21`, `22`, `24`, `25`, `46` | `.mp4` movies: the opening cinematic in several resolutions, plus weapon overview and ability videos. Stored uncompressed |
| `Archon_Intl_0` | ICU data and localisation (`.res`, `.locres`, `.ufont`) |
| `Archon_Engine_0` | Engine Slate images, plugin descriptors, engine `.ini` files |
| `Archon_0` | `Archon.uproject`, plugin descriptors, Oodle dictionaries, the CA bundle `cacert.pem` |
| `Archon_44` | The shader pipeline cache (`.upipelinecache`) |
| `Archon_50` | The 30 cooked `.ini` files |

**Correction:** one of our intermediate notes said that every `Archon_N` pak except `Archon_0` was a
stub. That was wrong. Fifteen are not, and `Archon_50` is the most useful file in the install.

### Container flags

All 157 `.utoc` files are TOC version 5. No container is encrypted or signed. 152 have flags `0x9`
(compressed and indexed), 4 have `0x8` (indexed, stored uncompressed; these are four of the audio
containers) and one, `global.utoc`, has `0x0`. The game's own log agrees that nothing is signed: at
startup it prints `LogIoDispatcher: Display: Toc signature hash: 0000…` for each container.

### Reading the IoStore directory index

A `.utoc` begins with the magic `-==--==--==--==-` and a version byte. It has no file names of its
own for chunks, but indexed containers carry a **directory index** that maps paths to TOC entries. We
wrote `utocdir.py` to walk it. The layout that works for these TOC v5 files:

1. **Header.** At offset 20 come nine `uint32` fields: header size, entry count, compressed-block
   count, compressed-block entry size, compression-method count, method-name length, compression
   block size, directory-index size and partition count. The flags byte is at offset 80.
2. **Skip the fixed tables** that follow the header: chunk IDs (12 bytes per entry), offset and
   length (10 bytes per entry), perfect-hash seeds, then the list of chunks without a perfect hash.
   Then come the compressed-block entries and the compression-method names. There is also a
   signature block, but only when the Signed flag `0x04` is set.
3. **The directory index** comes next, `dir_index_size` bytes long. It holds:
   - a mount-point `FString`;
   - directory entries of four `uint32` values each: name, first child, next sibling, first file;
   - file entries of three `uint32` values each: name, next file, TOC entry index;
   - a string table.

   `0xFFFFFFFF` means "none". Walk from directory 0, joining names as you go.

```python
def walk(di, prefix):
    while di != NONE:
        name, child, sibling, first_file = dirs[di]
        here = prefix if name == NONE else f"{prefix}{strings[name]}/"
        fi = first_file
        while fi != NONE:
            fname, next_file, toc_index = files[fi]
            out.append(here + strings[fname])
            fi = next_file
        if child != NONE:
            walk(child, here)
        di = sibling
```

That is how we pinned down the exact Ramsgate package path and the container that holds it. The
executable's strings do not contain it, and the stub `.pak` indexes do not list it. (The cooked
config does name it, as `ServerDefaultMap`, which we noticed only later.)

To pull a file out of a container, we use a second tool, `iox.py`. Two field layouts matter there. Each
10-byte **offset-and-length** entry is two 5-byte **big-endian** numbers. Each 12-byte
**compressed-block entry** is little-endian: a 5-byte offset, a 3-byte compressed size, a 3-byte
uncompressed size and a 1-byte compression-method index.

### Oodle without an Oodle DLL

2.1.1 compresses its paks and containers with Oodle (every config block we inspected is Kraken), and
**no `oo2core_*.dll` ships with the game**: Oodle is linked statically into
`Dauntless-Win64-Shipping.exe`. Common pak tools (repak, FModel, ZenTools,
UnrealPak) expect an external Oodle DLL, so they cannot open these files unless you find one elsewhere.
We did not.

Instead we built [`powzix/ooz`](https://github.com/powzix/ooz), an open-source Kraken decoder, as a
Linux shared library and call it from Python through `ctypes`:

- Drop the program's `main()` and the part that loads `oo2core_7_win64.dll`.
- Add a small `stdafx.h` shim. It maps the MSVC intrinsics (`_BitScanReverse`, `_BitScanForward`,
  `_rotl`, `_byteswap_*`, `__forceinline`) onto GCC and SSE equivalents.
- Build with `g++ -O2 -fPIC -msse4.1 -shared ... -o libooz.so`.

The compressed payload of `DefaultEngine.ini` is a single Kraken block. It starts with the bytes
`8C 06`.

### Pak v11 index notes

`Archon_50-WindowsClient.pak` is a normal pak v11. It has a 221-byte footer: encryption GUID,
encrypted-index flag, magic `0x5A6F12E1`, version, index offset and size, index SHA-1, and five
32-byte compression-method names (`Oodle`, then empty). The index is unencrypted and holds a
path-hash index, a full directory index and a blob of bit-packed "encoded" entries.

One detail will silently corrupt a hand-written decoder. The low six bits of an encoded entry's flag
word give the compression block size in units of 2 KiB. When those six bits are all set (`0x3F`), the
real block size follows as a `uint32` **immediately after the flag word**, before the offset field. If
you read the fields in the order the rest of the structure suggests, you get an offset past the end of
the file and swapped sizes. For `DefaultDeviceProfiles.ini` this is exactly what happens: it has two
Oodle blocks with a 1 MiB block size.

With the `ooz` decoder and this field order, all 30 config files came out intact: each one's size
equals the uncompressed size declared in its entry, and none contains a non-printable byte.

---

## 1.4.4: pak v9 with zlib

1.4.4 predates IoStore. Everything is in 86 classic paks:

- All 86 are **pak version 9** with a legacy (non-frozen), **unencrypted** index.
- 85 use **zlib**. One declares no compression method at all.
- There are 112,396 entries in total, mostly `.uasset`/`.uexp`/`.ubulk`. The rest include 11,301 `.wem`
  and 898 `.bnk` audio files, 225 `.umap` maps, 135 `.mp4` movies and 62 `.ini` files.

We read them with `pak9.py` (`list`, `find`, `get`). A legacy index is a mount-point `FString`, an
entry count, and then for each entry a file name plus an `FPakEntry`:

- offset, size and uncompressed size (three `int64`);
- the compression method index (`uint32`);
- a SHA-1 (20 bytes);
- if compressed, a block count and `(start, end)` pairs;
- a flags byte and the compression block size (`uint32`).

The same entry is repeated as an inline header in front of the file data. The footer of a v9 pak adds
a "frozen index" byte after the index hash. It was 0 in every 1.4.4 pak.

The cooked config is in **`Archon_35-WindowsClient.pak`**: `DefaultEngine.ini` (71,981 bytes) and
`DefaultGame.ini` (50,377 bytes), both zlib. The copyright line reads 2020, as it should for this
build.

---

## What the cooked config contains

The 2.1.1 config pak holds 30 files. The main ones are `DefaultEngine.ini` (81,338 bytes),
`DefaultGame.ini` (69,668 bytes), `DefaultInput.ini`, `DefaultGameplayTags.ini`,
`DefaultScalability.ini` and `DefaultDeviceProfiles.ini` (1.17 MB). Platform and configuration layers
sit under `Windows/`, `WindowsClient/`, `Win64/`, `Shipping/` and so on. **There is no
`BinaryConfig.ini` anywhere** (the cooked packaging settings say `bMakeBinaryConfig=False`). The
executable contains a loader for one (`{PROJECT}Config/BinaryConfig.ini`), so if a binary config had
shipped, the ini layers would have been bypassed. Because none shipped, the normal ini hierarchy is
evaluated at startup, and that is why user overrides work at all.

### `[OnlineSubsystemPhoenix]`: the backend endpoint table

The most important section is `[OnlineSubsystemPhoenix]` in **`DefaultGame.ini`**, not
`DefaultEngine.ini`. It is the client's table of Phoenix backend URLs:

| | 2.1.1 | 1.4.4 |
|:--|:--|:--|
| Location | `DefaultGame.ini` lines 236–441 | `DefaultGame.ini` lines 254–426 |
| Keys | 203, of which 199 are URLs | 171, of which 167 are URLs |

The four keys that are not URLs are the same in both builds: HTTP retry count and timeout, and two
telemetry batching limits.

Values are URL templates. The retail client fills in `{environment}` as `prod`, which we saw in live
2.1.1 traffic. It fills in the other placeholders at request time:

```ini
[OnlineSubsystemPhoenix]
AuthEndpoint = "https://auth-{environment}.steelyard.ca/game/login"
CharacterEndpoint = "https://dauntless-{environment}.steelyard.ca/character"
GetActiveLoadoutEndpoint = "https://loadout-{environment}.steelyard.ca/loadout/{account_id}/{character_id}"
QueryLoginQueueEndpoint = "https://login-queue-{environment}.steelyard.ca/login"
MatchmakingEndpoint = "https://mm2-{environment}.steelyard.ca"
```

The hosts follow the pattern `<service>-{environment}.steelyard.ca`. In both builds the services are
`auth`, `gamesession`, `login-queue`, `dauntless`, `loadout`, `progression`, `mm2`, `presence`,
`social`, `guild`, `mailbox`, `store`, `subscription`, `leaderboards`, `motd`, `cohort`,
`breadcrumbs`, `tracking`, `telemetry-ingest` and `profanity-filter`. 2.1.1 adds `gauntlet` and
`migration`. A few keys point elsewhere: `cdn.playdauntless.com`, `store.playdauntless.com`,
`steelyard.online`, `game-tools.1e100.steelyard.ca`, an internal Phoenix staging store host, and the
Slack webhook described [below](#secrets-in-the-cooked-config).

Comparing the two builds key by key: they share 170 keys, and **167 of those have byte-identical
values**. The three that differ are voice chat. 1.4.4 joins Vivox channels (`mm2/vivox/join/...`, plus
a `VoiceChatLoginEndpoint`, the one key that exists only in 1.4.4). 2.1.1 uses Epic's voice service
(`mm2/evoice/join/...`). The 33 keys that exist only in 2.1.1 cover features added after 2020, such as
the Gauntlet, factions, loot boxes, Steam store purchases, Trials leaderboards, account migration,
patch notes and the ban check.

These endpoints show the backend is a bespoke Phoenix REST API. It is not PlayFab, even though some
community notes claimed it was. [Backend contract]({{ contract_page.url | relative_url }}) covers the
response shapes.

### Other sections worth knowing

- `[OnlineSubsystem] DefaultPlatformService=Phoenix` appears in both builds' `DefaultEngine.ini`.
  Phoenix's own subsystem is the primary one.
- **2.1.1** has an `[/Script/OnlineSubsystemEOS.EOSSettings]` block. `bShouldEnforceBeingLaunchedByEGS`
  is already `False` there and `bUseEAS=True`.
- **1.4.4** has no EOS section at all. It uses Epic's older `OnlineSubsystemMcp` services instead, whose
  `Domain`, `RedirectUrl` and `Protocol` keys the Undaunted DLL rewrites at run time.
- `[/Script/EngineSettings.GameMapsSettings]` in `DefaultEngine.ini` is identical in both builds:

  ```ini
  GameInstanceClass=/Game/Blueprints/MyGameInstance.MyGameInstance_C
  GameDefaultMap=/Game/Maps/Map_LoginMenu
  ServerDefaultMap=/Game/Maps/ramsgate/ramsgate_01_persistent
  GlobalDefaultGameMode=/Game/Blueprints/BPGM_Archon_Prototype.BPGM_Archon_Prototype_C
  ```

- `DefaultLoadout=` in `DefaultGame.ini` (2.1.1 line 172, 1.4.4 line 181) names the training weapon
  `WP_EB_TRAINING` and the lantern `LT_BASIC`. In our 2.1.1 direct city boot, the spawn check waited
  for a weapon and a lantern. The client's own starter grant does not include these two, presumably
  because retail handed them out in the tutorial we skipped. Our server had to supply them.
- AFK timeouts are the same in both builds: 600 s in the city (`ArchonGameMode_City`), 180 s on hunt
  islands (`ArchonGameMode_Island`), and `0` for the tutorial game mode
  (`BPGM_ArchonIslandTutorial`).
- `[RamsgateRework] CityMap=...ramsgate_01_persistent` looks like an editor or test setting
  (unverified). It sits next to `[CombatDemo]` and `[PS5AudioTestMap]`, which carry the same
  `CityMap` key, just after `bReturnToRamsgateEnabledInEditor`, and `Shipping/UserGame.ini` clears
  the `CityMap` in `[CombatDemo]`. In the 2.1.1 executable the only reference we found to the string
  `RamsgateRework` belongs to a feature class (`URamsgateReworkFeature`), not to code that reads this
  section.

### Secrets in the cooked config

Phoenix shipped credentials in plain text in the cooked config. We have not used any of them, and
none are reproduced on this site.

- **Both builds:** `PhoenixEventsMessageEndpoint` in `[OnlineSubsystemPhoenix]` points at
  `hooks.slack.com`. A live Slack webhook URL was present. It is not reproduced here.
- **2.1.1:** the EOS settings contain the Epic Online Services client credentials and an encryption
  key. They are not reproduced here.

If you extract the config yourself, keep these values out of anything you publish.

---

## Key map paths

Unreal package paths: `/Game/` corresponds to `Archon/Content/` inside the containers. Some places,
such as Undaunted's hunt table and `CityMap`, use the object-path form `path.name`, for example
`/Game/Maps/islands/1702/cora_jamima.cora_jamima`.

| Map | Package path | 2.1.1 container | 1.4.4 container | Notes |
|:----|:-------------|:----------------|:----------------|:------|
| Login menu | `/Game/Maps/Map_LoginMenu` | `Archon_Maps_2` | `Archon_Maps_2` | `GameDefaultMap`. Login and character selection run inside this map |
| Ramsgate | `/Game/Maps/ramsgate/ramsgate_01_persistent` | `Archon_Maps_2` | `Archon_Maps_2` | The persistent level. The other `ramsgate_01_*` maps (bazaar, docks, pub, crafting zone, NPCs, vistas…) are streaming sublevels |
| 1.4.4 tutorial island | `/Game/Maps/islands/1705/dia_moss_triforce` | `Archon_Maps_0` | `Archon_Maps_0` | On our 1.4.4 server, new characters are matchmade here with the tutorial Gnasher `/Game/Monsters/mcrollin/mcbeaver_tutorial_bp` |
| Training dojo | `/Game/Maps/islands/dojo/training_dojo_persistent` | `Archon_Maps_2` | `Archon_Maps_1` | Our fork starts it on demand |
| Trials arena | `/Game/Maps/islands/arenas/arena_ramsgate_00` | `Archon_Maps_2` | `Archon_Maps_1` | Undaunted uses it for Trials |
| Hunt islands | `/Game/Maps/islands/<nnnn>/<name>` | | | For example `1705/dia_snow_big`, `1803/frida_moss_falls`, `1806/gaia_moss_cave`. Undaunted's hunt table lists the ones it uses |

Both builds also contain a `/Game/Maps/tutorial/` family (`island_tutorial_00_*`,
`city_00_art_tutorial_vista`), which our 1.4.4 server does not use. 2.1.1 adds
`/Game/Maps/islands/adventure/Moss_Triforce/adventure_moss_triforce_tutorial`, which 1.4.4 does not
have. We have **not verified** which map the 2.1.1 tutorial actually uses.

The cooked config has game-mode sections for `/Game/Blueprints/GameMode/BPGM_City.BPGM_City_C` (the
city; we used it for the 2.1.1 city boot), `BPGM_ArchonIslandTutorial`, `BPGM_ArchonIslandArena` and
`BPGM_ArchonEscalation`.

---

## The user config folder

Unreal lays a writable per-user config over the cooked defaults. For Dauntless, both builds use the
same folder:

```text
%LOCALAPPDATA%\Archon\Saved\Config\WindowsClient\
    Engine.ini   Game.ini   Input.ini   RuntimeOptions.ini   GameUserSettings.ini   (and others)
```

A key set here overrides the cooked value. On our 2.1.1 machine, after the game's first runs,
`Game.ini`, `Input.ini` and `RuntimeOptions.ini` were 2-byte empty files, free to use. The game writes
`GameUserSettings.ini` from its options menu.

### Rules we learned the hard way

- **Both builds share this folder.** Because the project is called `Archon` in both, 1.4.4 and 2.1.1
  read the same files. Leftover 2.1.1 overrides (`GameDefaultMap`, `LocalMapOptions`,
  `[OnlineSubsystemPhoenix]`) would bypass or redirect the 1.4.4 login, so before the first 1.4.4 run
  we parked the 2.1.1 set as `WindowsClient.211` (we did not test the mixed state). All processes on
  the same Windows account read this folder, and that includes the 1.4.4 game servers we host.
- **Put each key in the file that matches its hierarchy.** `[OnlineSubsystemPhoenix]` is a Game
  setting, so its overrides go in `Game.ini`. In `Engine.ini` they are ignored.
- **Quote every URL.** The ini parser drops everything from `//` onward in an unquoted value. An early
  experiment of ours put 163 unquoted URLs in a 2.1.1 user `Engine.ini`. When the game re-saved the
  file, every value had been cut to `https:`. The cooked config quotes all of its URLs, and so do we.
- **Back up before editing.** A bad `GameDefaultMap` stops the game from booting with "The default map
  … could not be found. Exiting." That dialog appears whenever loading the startup map fails, not only
  when the map is missing.
- **Correction:** early on we concluded that loose ini files were ignored. That test was flawed. It
  put Game keys in `Engine.ini`, it "changed" `bShouldEnforceBeingLaunchedByEGS`, which was already
  `False`, and it measured `LauncherCheck`, which reads only command-line switches such as
  `-EpicPortal` and no config at all. The user config layer works in both builds.

### What it can change

| Setting | File | Build | Effect |
|:--------|:-----|:------|:-------|
| `[SystemSettings]`: `r.Streaming.PoolSize`, `r.Streaming.LimitPoolSizeToVRAM`, `sg.*Quality`, `r.ScreenPercentage`, `r.MipMapLODBias`, `gc.*` | `Engine.ini` | both | Overrides the options menu. On 2.1.1 a capped pool and low `sg.*` brought a standalone city boot from about 9 GB of RAM down to 2.8 GB. On 1.4.4 our client launcher uses the same section the other way, to force Cinematic quality at native resolution |
| `[Core.System] HangsAreFatal=False`, `HangDuration=600` | `Engine.ini` | 2.1.1 (tested) | Stops the hang detector from killing the process while we investigate. Used together with `-nothreadtimeout -noheartbeatthread` |
| `[/Script/EngineSettings.GameMapsSettings] GameDefaultMap=/Game/Maps/ramsgate/ramsgate_01_persistent` | `Engine.ini` | 2.1.1 | Boots straight into Ramsgate. It renders, but the login flow inside `Map_LoginMenu` never runs, so there is no account and no player pawn |
| `LocalMapOptions=?CharacterId=<id>` | `Engine.ini` | 2.1.1 | Read by the client: requests then carry that character id. `?AuthToken=` and `?AccountId=` are **not** read. `?listen` makes the boot fail |
| `GlobalDefaultGameMode=/Game/blueprints/gamemode/BPGM_City.BPGM_City_C` | `Engine.ini` | 2.1.1 | Game mode for the direct city boot |
| `[/Script/Archon.ArchonPlayerController] PlayerStartEventTimeout=600.0` | `Game.ini` | 2.1.1 | Stretches the 120 s failsafe that ends in "You have been signed out" |
| `[OnlineSubsystemPhoenix]` `*Endpoint="http://127.0.0.1:61000/..."` (167 keys, all quoted) | `Game.ini` | 1.4.4 game servers | Points our game-server processes at our metagame. In server mode the Undaunted DLL does not redirect endpoints, so this override is what makes the server's backend calls arrive at the metagame. The **client** needs none of it: the DLL hooks `FConfigCacheIni::GetString` and substitutes the URLs in memory |

### What it cannot do

- **Open the console on 2.1.1.** `DefaultInput.ini` still lists `ConsoleKeys` and nearly 900
  `ManualAutoCompleteList` cheat-command entries, but the console is compiled out of the shipping
  build. `+ConsoleKeys=` in `Input.ini` does nothing. On 1.4.4 with Undaunted, the DLL creates a
  console itself and binds it to F2.
- **Make the stock client host.** `?listen` fails on 2.1.1 because the entry point for listening
  (`UWorld::Listen`) is stubbed in this client-only build. We first read that as "multiplayer is
  impossible". **That was wrong.** The network layer underneath is intact, and an injected DLL can
  drive it, which is exactly how Undaunted hosts 1.4.4 game servers. See
  [How multiplayer works]({{ mp_page.url | relative_url }}).
- **Skip `-EpicPortal` on 2.1.1.** `LauncherCheck` reads only command-line switches.
- **Supply an account identity.** On 2.1.1, identity comes only from the real login flow in
  `Map_LoginMenu`.

### The CA bundle

Both builds keep the CA bundle the engine uses for HTTPS (`cacert.pem`) inside `Archon_0`. When
we ran 2.1.1 against our own HTTPS backend, a loose
`<game folder>\Engine\Content\Certificates\cacert.pem` holding our private CA was picked up. That
meant the pak stayed untouched and the Windows certificate store stayed untouched. On 1.4.4 this is
unnecessary. Undaunted's DLL rewrites every endpoint to plain HTTP on the metagame address.

---

## Tools

These scripts run in our Linux (WSL) analysis environment. None of them needs an Oodle DLL or any
game code:

| Tool | Build | Purpose |
|:-----|:------|:--------|
| `libooz.so` | 2.1.1 | `powzix/ooz` built as a shared library with a small MSVC shim |
| `unpak2.py` | 2.1.1 | Read and extract pak v11 (encoded entries, Oodle blocks) |
| `utocdir.py` | 2.1.1 | Print every path in a `.utoc` directory index |
| `iox.py` | 2.1.1 | Extract a file from a `.utoc`/`.ucas` pair by name |
| `pak9.py` | 1.4.4 | `list`, `find` and `get` for pak v8/v9 with a legacy index (zlib, Oodle or stored) |
| `xref.py` | 2.1.1 | Find code references to a string in the executable and disassemble around them. We used it for the config keys and log messages mentioned on these pages |

The executable-side details, such as which config keys the code actually reads and which switches it
accepts, are on [Client internals]({{ ci_page.url | relative_url }}). How we established that these
files are genuine is on [Verifying game files]({{ verify_page.url | relative_url }}).
