---
title: Client internals
parent: Findings
nav_order: 5
description: "What the shipped Dauntless client can and cannot do on its own: a client-only build, launch and login switches, logging, the hang detector and ini overrides."
lang: en
ref: findings/client-internals
---

{% assign mp_page = site.pages | where: "path", "findings/multiplayer.md" | first %}

# Client internals
{: .no_toc }

This page covers what the shipped Dauntless executable can and cannot do by itself, and the few
ways we found to see inside it. Most of it comes from disassembling the **2.1.1** client. Where it
matters for how we run the game today, we checked the same thing in **1.4.4**. Every section says
which build it is about.

<details open markdown="block">
  <summary>Contents</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

---

## The two builds

| | 2.1.1 "Awakening" | 1.4.4 |
|---|---|---|
| Released | December 2024, the final release | October 2020 |
| Engine | Unreal Engine 5 | Unreal Engine 4.25.3, changelist 239827 |
| Content | IoStore (`.utoc`/`.ucas`). Most `.pak` files are small stubs. Config sits in an Oodle-compressed pak. | pak v9 with an unencrypted index, zlib |
| `Dauntless-Win64-Shipping.exe` | 151,448,856 bytes | 103,673,520 bytes |
| Online identity | Epic Online Services (EOS SDK 1.16) plus the Phoenix backend | Phoenix backend plus Epic's older MCP subsystem. No EOS. |
| Our use | Research only | What we run |

**Addresses.** For 2.1.1 we give virtual addresses, with image base `0x140000000`. For 1.4.4 we give
RVAs, as Undaunted's source does. Add `0x140000000` to an RVA to get the VA.

---

## A client-only build

Both executables are Unreal `TargetType.Client` builds, compiled with `WITH_SERVER_CODE=0`. Unreal
compiles the server entry points out of that kind of build. The evidence:

| Evidence | 2.1.1 | 1.4.4 |
|---|---|---|
| Body of `UWorld::Listen` | `0x140bfde50`: `xor al, al` / `ret` | RVA `0x789370`: `xor al, al` / `ret` |
| Its call site in `UEngine::LoadMap` | `0x14537140e` | RVA `0x372E746` |
| `"Failed to listen: %s"` (inside `#if WITH_SERVER_CODE`) | absent | absent |
| `"LoadMap: failed to Listen(%s)"` (outside it) | present | present |
| `UWorld::GetNetMode` | `0x1453e4ef0`: returns `NM_Client` (3) whenever a net driver exists | `InternalGetNetMode`, RVA `0x378BDA0`: the same |
| `"WindowsClient"` / `"WindowsServer"` in the exe | 1 / 0 | 1 / 0 |
| `GIsClient` forced to 1 in `FEngineLoop::PreInit` | write at `0x140c0f683` | writes at RVA `0x79A67A` and `0x79A81B` |

What each row means:

- **`UWorld::Listen` is a stub.** In stock Unreal this function creates the game net driver and
  starts listening, all inside `#if WITH_SERVER_CODE`. Here the whole body is gone. The linker
  folded what was left into a shared two-instruction "return false" function. `LoadMap` calls it
  whenever the URL has `?listen`, sees false, and gives up.
- **`GetNetMode` always answers "client".** The Unreal source is
  `IsRunningClientOnly() ? NM_Client : NetDriver->GetNetMode()`. In both builds the compiler kept
  only the `NM_Client` side. That only happens when "client only" is a compile-time constant.
- **The platform name.** `FPlatformProperties::PlatformName()` returns `WindowsServer`,
  `WindowsEditor`, `WindowsClient` or `Windows`, chosen by template argument when the engine is
  compiled. Each exe contains `"WindowsClient"` once and never contains `"WindowsServer"`. In 2.1.1
  that one string has 21 code references, which is `PlatformName()` inlined at each call site. The
  same name is why the user config folder is `...\Saved\Config\WindowsClient`.
- **`GIsClient` is forced on.** In 2.1.1 the normal start-up path writes `GIsClient = 1`
  (`0x140c0f683`) and `GIsServer = 0` (`0x140c0f68a`). The other writes to `GIsClient` are on the
  commandlet path (`-run=`), which this build rejects with
  `"Tried to run commandlet in non-editor build"`. Our reviews disagreed on whether that path could
  leave `GIsClient` at 0. It makes no difference to hosting: with `GIsClient` at 0, `LoadMap` calls
  the `Listen` stub on every map load and fails.

### What that means for the stock client

With no injected code:

- `-server` does nothing. The exe starts a normal windowed client (2.1.1, tested).
- Adding `?listen` to the boot URL makes `Browse()` fail. The client then says the default map
  "could not be found" and exits. That dialog appears whenever `Browse()` fails, not only when a
  map is missing (2.1.1, tested).
- `-UseStandaloneDedicatedServer`, `-GAMESERVER_STATUS_FILE=`, `-GAMESERVER_INSTRUCTION_FILE=` and
  `-PLAYFAB_GAMEMODE=` have parsers in the exe, but none of them makes the process host.
  `-UseStandaloneDedicatedServer` only changes the build version the client asks the matchmaker for
  (`LOCAL_<computer name>`), which was Phoenix's local-server development mode (2.1.1, from
  disassembly). These switches may not even reach their parsers: see
  [the command-line allow list](#the-command-line-allow-list-211) below.
- `GlobalDefaultServerGameMode` is never read. The function that returns the default game mode has
  no dedicated-server branch (2.1.1, from disassembly).

### What is still there

Only the entry points were removed. The layer beneath them is intact:

- `UIpNetDriver::InitListen` is real, working code (2.1.1 `0x140c6d200`, 1.4.4 RVA `0x806F80`). It
  lives in a plugin module that `WITH_SERVER_CODE` does not touch. In 2.1.1 its only remaining
  caller is the online beacon host, which is not a game server.
- The server half of `UWorld::NotifyControlMessage` is compiled in, with a full jump table over
  the `NMT_*` control messages (2.1.1 `0x1453e5d40`). So are `"PreLogin failure: %s"`,
  `"Join succeeded: %s"` and `AArchonGameMode::PostLogin`.
- The client's outbound connect path is complete.

At first we read this as "compiled in but unreachable, so hosting is impossible". **That was wrong.**
The stock code path never reaches these functions, but injected code can.
[How multiplayer works]({{ mp_page.url | relative_url }}) explains how Undaunted does it on 1.4.4.

---

## Starting the client: `LauncherCheck` and `-EpicPortal`

- Both builds include Unreal's `LauncherCheck` module. In 2.1.1 it reads no configuration, only the
  command line. Its test (`WasRanFromLauncher`, `0x14543f100`) passes if `-EpicPortal`,
  `-NoEpicPortal` or `-q` is present. The other two are not on the command-line allow list below,
  so if that list works as disassembled, only `-EpicPortal` can pass the check. That fits what we
  saw: launched with plain `-NoEpicPortal` instead, 2.1.1 still exited at `LauncherCheck` within six
  log lines. Without `-EpicPortal`, 2.1.1 exits almost at once. We
  always pass `-EpicPortal` to 1.4.4 as well and have not tested it without the switch.
- 2.1.1 also has EOS's own `bShouldEnforceBeingLaunchedByEGS` setting, which relaunches the game
  through the Epic store. It is already `False` in the shipped config, and `FOnlineSubsystemEOS::Init`
  only consults it when `-EpicPortal` is absent. It is not what `LauncherCheck` tests.
- Start `Dauntless-Win64-Shipping.exe` directly. `start_protected_game.exe` is the EasyAntiCheat
  bootstrapper. When you start the shipping exe directly, EasyAntiCheat never runs. On 2.1.1 the
  install then stays unmodified and signature-valid. On 1.4.4, Undaunted adds two DLLs to
  `Archon\Binaries\Win64` but leaves the exe itself byte-identical (its launcher checks the hash).
- On 1.4.4, Undaunted's launcher passes `-EpicPortal` together with placeholder values for the other
  Epic switches. The game runs with the placeholders, so nothing on this path checks them:

```text
Dauntless-Win64-Shipping.exe <metagame host:port> -AUTH_PASSWORD=<account key> -AUTH_LOGIN=unused
  -AUTH_TYPE=exchangecode -epicapp=<any> -epicenv=Prod -EpicPortal -epicusername=<any>
  -epicuserid=<any> -epiclocale=en-US -epicsandboxid=<any> -epicdeploymentid=<any>
```

### The command-line allow list (2.1.1)

Disassembly shows that 2.1.1 passes its command line through Unreal's command-line allow list.
`FCommandLine::Set` (`0x142f582e0`) always calls the filter (`0x142f42c10`), which deletes every
switch that does not start with one of these entries (UTF-16 string at `0x146f22170`):

```text
-fullscreen /windowed -noautosettings -AUTH_LOGIN= -AUTH_PASSWORD= -AUTH_TYPE= -epicapp= -epicenv=
-EpicPortal -epicusername= -epicuserid= -epiclocale= -networkversionoverride= -environment=
```

The same string is in the 1.4.4 exe. We have **not confirmed the filter directly at run time** on
either build. One 2.1.1 observation fits it: plain `-NoEpicPortal`, which `LauncherCheck` would
accept, did not get the client past `LauncherCheck`. If the filter works as disassembled, switches such as `-server`, `-nothreadtimeout`,
`-noheartbeatthread`, `-UseStandaloneDedicatedServer`, `-NoEpicPortal`, `-q` and `-EngineINI=`
are removed before any code reads them. So treat any 2.1.1 finding that depends on such a switch
as unverified, and prefer ini settings where one exists. Undaunted's server DLL on
1.4.4 reads its own arguments with the Win32 `GetCommandLineW` and gives the engine a fixed command
line through a hook on `FCommandLine::Get` (see
[How multiplayer works]({{ mp_page.url | relative_url }})).

---

## Login switches per build

### 2.1.1: Epic Online Services

The command-line login passes two gates:

1. **The game's own gate** (`0x142924b3f`) reads only `-AUTH_PASSWORD=` and `-AUTH_TYPE=`. If either
   is empty, it fails at once with `"Failed to login to Epic with no given Auth info"` and shows the
   login-failed dialog. EOS is never contacted.
2. **EOS auto-login** (`FUserManagerEOS::AutoLogin`, `0x141c89680`) then needs all three switches
   to be non-empty, including `-AUTH_LOGIN=`. If one is missing it logs, for example,
   `"AutoLogin missing AUTH_LOGIN=<login id>."`.

Pass all three. With only some of them, we saw the client quietly reuse an expired cached token and
fail. `-AUTH_TYPE=` accepts exactly five values, compared in `FUserManagerEOS::Login`:

| `-AUTH_TYPE=` | EOS credential type | Uses |
|---|---|---|
| `password` | 0 | `AUTH_LOGIN` as id, `AUTH_PASSWORD` as token |
| `exchangecode` | 1 | `AUTH_PASSWORD` as the exchange code |
| `persistentauth` | 2 | nothing. Reached Epic and returned `EOS_InvalidAuth` for us. |
| `developer` | 4 | `AUTH_LOGIN` and `AUTH_PASSWORD` |
| `accountportal` | 6 | nothing. EOS opens Epic's account portal in a browser. |

Any other value fails with `"Unable to Login() user (%d) due to missing auth parameters"`.

- **What works is `accountportal`.** The player signs in to Epic in a browser. The login and
  password values are ignored but must not be empty:
  `-AUTH_TYPE=accountportal -AUTH_LOGIN=unused -AUTH_PASSWORD=unused`. In September 2026 Epic's EOS
  service still accepted this for Dauntless.
- **No anonymous device login.** The exe looks up EOS SDK functions by name, so every API it uses
  appears as a string. `EOS_Connect_CreateDeviceId` is not among them.
- **Every failure shows the dialog**, with one exception. The async failure handler (`0x142925e80`)
  checks for the Epic error code
  `errors.com.epicgames.account.no_account_found_for_external_auth`. On that code it takes a
  different branch and shows no dialog.
- After EOS, the client gets its Phoenix session with
  `PUT gamesession-prod.steelyard.ca/gamesession/epiceos`, sending the EOS token as the bearer. It
  then uses the session token from the reply as the bearer for later calls. The
  email-and-password route `POST auth-prod.steelyard.ca/game/login` is only used when the credential
  type is not `"epic"`.

### 1.4.4: no EOS at all

- 1.4.4 predates EOS. The exe has no reference to `EOSSDK-Win64-Shipping.dll` and no
  `OnlineSubsystemEOS` strings. The cooked config sets `DefaultPlatformService=Phoenix`. Epic
  account traffic goes through the older `OnlineSubsystemMcp`, whose `[OnlineSubsystemMcp.*]`
  sections name hosts on `epicgames.com`.
- `accountportal` and `persistentauth` do not exist in this build. It knows `exchangecode`,
  `password` and `developer`.
- **We use Undaunted's approach:**
  `-AUTH_TYPE=exchangecode -AUTH_LOGIN=unused -AUTH_PASSWORD=<account key>`. Undaunted's client DLL
  points every MCP section's `Domain` and `Protocol` at the metagame. The metagame's
  `POST /account/api/oauth/token` treats the exchange code as the player's account key and returns
  a signed token. The client then sends that token as the bearer on every request. No Epic account
  is involved. Treat the account key like a password.
- `-AUTH_TYPE=password` should send an email and password to Phoenix's `/game/login`. We have **not
  tested** this, because we use the exchange-code path. Undaunted's metagame has no `/game/login`
  handler, so this route would need backend work first.

---

## No console

- **2.1.1:** `ALLOW_CONSOLE` is compiled out. We tried Tilde, and extra `+ConsoleKeys=F8` and `F9`
  lines in the user `Input.ini`. Nothing opens. The cooked `DefaultInput.ini` still contains
  `ConsoleKeys` and 898 `ManualAutoCompleteList` cheat entries. That is leftover data. Nothing
  reads it.
- **Neither build** contains `-ExecCmds`, so console commands cannot be passed on the command line
  either.
- **1.4.4:** Undaunted's client DLL creates a `UConsole` object itself and binds it to **F2**. That
  suggests the stock build creates none. We have not checked which commands it accepts.

---

## Logging

### File logging is stripped (2.1.1)

- The shipping build writes no log file. `-abslog=` produces nothing. The `UE_LOG` format strings
  are still in the binary, which is how we find functions.
- Standard output is the exception. In our early 2.1.1 runs we started the exe with `-log` and
  redirected its standard output to a file, and it printed between one and four thousand log lines
  per boot there (we saw `Display`, `Warning` and `Error` lines). We did not work out which switch
  or setting that depends on.
- `[Core.Log]` in the user `Engine.ini` is read (`0x142f22e80`). `-LogCmds=` is **not** parsed. It
  appears only in help text.
- On 1.4.4 we have not checked the binary for a file sink. Undaunted's DLL prints its own messages
  to a console window.

### HTTPEventLog ships only Warning and above (2.1.1)

Both builds' `DefaultGame.ini` has an `[HTTPEventLog]` section with `bEnabled=True`,
`EventLogEndPoint="https://telemetry.steelyard.ca/log"` and `Sample1InX=1` (no sampling). It looks
like a way to get the log stream back. In 2.1.1 it is not:

- `FHttpEventLog` is an `FOutputDevice`. It is constructed unconditionally (`0x14265dd5d`).
  `bEnabled` is never read.
- Its `Serialize` (`0x142947830`) starts with `cmp r8b, 3` / `ja` → return. Any line more verbose
  than **Warning** is dropped before the payload is built. That cut-off is a hard-coded constant,
  not a setting.
- The format is a Splunk HTTP Event Collector envelope: `host`, `source` (`WindowsClient`),
  `sourcetype` (`game-log`), `index` (`dauntless`), `time`, `event`, `game-id` and `severity`. It is
  sent with an `Authorization: Splunk <token>` header. The token is hard-coded in the exe. We do not
  reproduce it. The expected reply is `{"text":"Success","code":0}`.
- We pointed `telemetry.steelyard.ca` at our server and answered `/log`. The client never shipped a
  single line. We also never found where the device attaches itself to the global log. It may never
  be attached at all (**unverified**).

The practical upshot: raising log verbosity cannot help this channel, because it never ships a
line below Warning. In principle the lever works the other way round. The cooked `[Core.Log]` pins
`LogHttp` at `Error` in both builds, so HTTP warnings are currently discarded. Raising that category
to `Warning` would let them through. We have **not tested** this.

---

## The telemetry heartbeat as an instrument

With no log file and no console, the client's own telemetry was our most reliable view of what it
was doing.

- **Heartbeat.** The client POSTs a heartbeat to `TrackingEndpoint` + `/heartbeat` about once a
  second. The cooked endpoint in both builds is `https://tracking-{environment}.steelyard.ca`
  (2.1.1, observed live). The JSON body we recorded has `build`, `platform`, `state`, `region`,
  `server`, `session`, `map`, `ping` and `playtime`. In our standalone runs `server` held the local
  computer name, so treat recorded heartbeats as personal data.
  - **`map`** is the most useful field. It shows which map the client is actually on. That is how
    we confirmed a boot had really reached Ramsgate.
  - **`state`**: we recorded `menu` on the login map and `city` in Ramsgate. The strings `menu`,
    `city`, `island` and `lobby` sit right after the field names in the string table. We read these
    as the four possible values (**likely, not proven**).
  - On 1.4.4, Undaunted's metagame (`POST /heartbeat`) uses `map` to record player activity.
- **Analytics events** (2.1.1) are batched to `telemetry-ingest-prod.steelyard.ca/event?id=prod`,
  up to 100 events per request and up to 30 seconds late (`MaximumSecondsBeforeTelemetrySent=30`).
  Two are worth watching:
  - `playerdata_load_failed` (`UArchonLoadManager::LoadFailed`, `0x1429ad0f0`). Its `loaders` array
    names the player-data loaders that never finished. That is the quickest way to find a missing
    backend endpoint.
  - `client_login_failed` names the login step that failed, for example `LoginToEpicProxy`.
- **Crash reports.**
  `%LOCALAPPDATA%\Archon\Saved\Crashes\UECC-*\CrashContext.runtime-xml` holds `<ErrorMessage>` and
  `<PCallStack>`. Take the module base from the same report. The static address is then
  RVA + `0x140000000` (2.1.1).

---

## The hang detector

When the game thread stops sending heartbeats, Unreal's `FThreadHeartBeat` shows "Application Hang
Detected" ("The application has hung and will now close.") and exits. During investigation that
kills the evidence.

In 2.1.1, `FThreadHeartBeat::InitSettings` (`0x142ec08c0`) reads four keys from `[Core.System]` in
the engine ini: `StuckDuration`, `HangDuration`, `PresentHangDuration` and `HangsAreFatal`. They are
read again at run time, so the user `Engine.ini` overrides them. The built-in `HangDuration` is 25
seconds, and the cooked `DefaultEngine.ini` raises it to 60 in both builds. `HangsAreFatal` defaults
to `True`.

| Switch | Where | Effect (2.1.1) |
|---|---|---|
| `HangsAreFatal=False` | `[Core.System]` in the user `Engine.ini` | No dialog and no exit (`0x142ec4c8c` jumps past both). The detector still logs `"Hang detected on %s (thread hasn't sent a heartbeat for %.2f seconds):"` at Error, with that thread's call stack. **This is the one we recommend.** |
| `HangDuration=<seconds>` | same section | The threshold. Leave it at 60 when `HangsAreFatal=False`. Raising it only delays the report. |
| `-nothreadtimeout` | command line | Returns before any hang processing (`0x142ec2f99`). The process is not killed, but you also get no report. `-debughangdetection` cancels it. Not on the command-line allow list, so it may never reach this code (**unverified**). |
| `-noheartbeatthread` | command line | Present in both exes. We passed it together with `-nothreadtimeout` in our 2.1.1 standalone launches. We did not disassemble its effect, and it is not on the allow list either (**unverified**). |

Two more notes:

- The hang dialog is a blocking modal. The process stays alive, with every thread intact, until
  someone dismisses it. That is the moment to take a full memory dump, for example with Task
  Manager → Create dump file.
- Not every "loading timeout" is a hang. `PlayerStartEventTimeout=120.0` under
  `[/Script/Archon.ArchonPlayerController]` in `Game.ini` is a gameplay failsafe in both builds. It
  sends the player back to the menu with "Loading timeout while joining the server".

---

## Configuration: the user ini layer, and quoting URLs

- Unreal lays a writable user config over the cooked defaults:
  `%LOCALAPPDATA%\Archon\Saved\Config\WindowsClient\{Engine,Game,Input,...}.ini`. This works in both
  builds. On 2.1.1, a `GameDefaultMap` override booted the client straight into Ramsgate. On 1.4.4,
  our game servers read their endpoint overrides from `Game.ini`.
- **Put each key in the right file.** The Phoenix endpoints (`[OnlineSubsystemPhoenix]`) live in
  `DefaultGame.ini`, so overrides for them go in `Game.ini`. The same section in `Engine.ini` is
  ignored.
- **Correction.** We once concluded that loose config files were ignored. That test was flawed in
  three ways. It put Game keys in `Engine.ini`. It "changed" a setting that was already set. And it
  measured `LauncherCheck`, which reads no config at all. Its `-EngineINI=` variant was probably
  also deleted by the command-line allow list before the engine saw it.
- **Quote every URL.** On 2.1.1 we wrote 163 endpoint URLs, unquoted, into a user `Engine.ini`. The
  game read the file and wrote it back with every value cut to `https:`. The engine's ini parser
  drops everything from `//` onward in an unquoted value. The cooked config quotes all of its
  URLs, and so do we:

```ini
; in the user Game.ini
[OnlineSubsystemPhoenix]
; wrong: comes back as AuthEndpoint=https:
AuthEndpoint=https://auth-prod.steelyard.ca/game/login
; right
AuthEndpoint="http://127.0.0.1:61000/game/login"
```

- The game rewrites the user ini files itself. Back them up before you edit them. A bad
  `GameDefaultMap` stops the game from booting at all.
