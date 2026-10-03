---
title: Crash forensics
parent: Findings
nav_order: 7
description: "Crash forensics for a Dauntless client with no symbols or log file: turning crash reports into instruction addresses, and what each crash turned out to be."
lang: en
ref: findings/crashes
---

{% assign internals_page = site.pages | where: "path", "findings/client-internals.md" | first %}
{% assign awakening_page = site.pages | where: "path", "findings/awakening-2-1-1.md" | first %}
{% assign tools_page = site.pages | where: "path", "tools.md" | first %}
{% assign contract_page = site.pages | where: "path", "findings/backend-contract.md" | first %}

# Crash forensics
{: .no_toc }

The Dauntless shipping executable has no symbols, writes no log file and opens no console of its
own. (2.1.1 does print log lines to standard output when that is redirected; see
[Client internals]({{ internals_page.url | relative_url }}#logging).) When it crashes, the crash
report is often the best evidence you get. This page shows how we turned those
reports into instruction addresses, and what each crash turned out to be.

Almost everything here comes from the **2.1.1** client, booted straight into Ramsgate against our
own test backend (see [The 2.1.1 standalone attempt]({{ awakening_page.url | relative_url }})). The
method works the same way on **1.4.4**. Where a detail has only been checked on one build, we say so.

<details open markdown="block">
  <summary>Contents</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

---

## Reading a crash report

### Where the reports are

On **2.1.1** every crash leaves a folder here:

```text
%LOCALAPPDATA%\Archon\Saved\Crashes\UECC-Windows-<32 hex digits>_0000\
    CrashContext.runtime-xml    <- the useful part
    CrashReportClient.ini
    UEMinidump.dmp
```

We have not yet checked where **1.4.4** writes its reports. Unreal 4.25 normally uses the same
`Saved\Crashes` layout, so look there first (**unverified**).

### The fields that matter

`CrashContext.runtime-xml` is plain XML. These elements are the ones we use:

| Element | What it tells you | Example (2.1.1) |
|---|---|---|
| `<ErrorMessage>` | The fatal message or the exception | `Trying to resize TArray to an invalid size of 3163556208` |
| `<CrashType>` | `Assert` for a fatal error the game raised itself, `Crash` for an exception | `Assert` |
| `<EngineVersion>` / `<BuildVersion>` | Which build crashed. Check this first if you have more than one install. | `5.1.1-682875+//phx-archon/release/2.1.1` / `//phx-archon/release/2.1.1-CL-682875` |
| `<SecondsSinceStart>` | How long the process had been running. It is sometimes `0`, so do not rely on it. | `81` |
| `<PCallStack>` | The crashing thread's stack, one frame per `module base + offset` triple | see below |
| `<Threads>` | A `<Thread>` for every thread, with `<ThreadName>`, `<IsCrashed>` and its own `<CallStack>` | `GameThread`, `true` |

The symbolic `<CallStack>` near the top of the file is useless here. Without symbols it only lists
module names.

> **Do not publish raw crash reports.** `CrashContext.runtime-xml` also contains your
> `EpicAccountId`, `LoginId` and `MachineId`, the full command line (including any `-AUTH_*`
> values) and your install path. `UEMinidump.dmp` holds process memory. Copy out the error message
> and the offsets. Do not share the files.

### Offsets to static addresses

A `<PCallStack>` frame looks like this:

```text
Dauntless-Win64-Shipping 0x00007ff7e7e30000 + 28cd7fc
```

The middle number is where Windows loaded the exe for that run. It changes every run, because the
exe is built for ASLR. The last number is the offset of the frame from that base, an RVA. Both
**2.1.1** and **1.4.4** executables have the preferred image base `0x140000000`, and the disassembler
works in that address space. So:

```text
static address = 0x140000000 + offset
0x140000000 + 0x28cd7fc = 0x1428cd7fc
```

This short script prints every game frame of a report as a static address:

```python
#!/usr/bin/env python3
"""Print static addresses for the game-module frames of a UE crash report."""
import re, sys

IMAGE_BASE = 0x140000000          # preferred base of Dauntless-Win64-Shipping.exe (2.1.1 and 1.4.4)
MODULE = "Dauntless-Win64-Shipping"

xml = open(sys.argv[1], encoding="utf-8", errors="replace").read()
print(re.search(r"<ErrorMessage>(.*?)</ErrorMessage>", xml, re.S).group(1).strip())
stack = re.search(r"<PCallStack>(.*?)</PCallStack>", xml, re.S).group(1)
for module, base, offset in re.findall(r"(\S+) 0x([0-9a-fA-F]+) \+ ([0-9a-fA-F]+)", stack):
    if module == MODULE:
        print(f"{IMAGE_BASE + int(offset, 16):#x}")
    else:
        print(f"    ({module} +{offset})")
```

Then disassemble around each address with `xref.py func` (see [Tools]({{ tools_page.url | relative_url }})).

### What each frame means

- **For an exception** (`EXCEPTION_ACCESS_VIOLATION` and the like), the first game frame is the
  faulting instruction itself.
- **Every other frame is a return address.** It is the instruction *after* a `call`, so the call
  itself ends exactly at that address. A direct `call rel32` starts 5 bytes earlier. Indirect calls
  vary: `call qword ptr [r10 + 0x50]` is 4 bytes. Disassemble a little before the return address to
  see what was called.
- **For an assert** (`Fatal error: ...`), the top frames are Unreal's fatal-error plumbing. Walk down
  to the first frame in game code.
- The executable has no symbol names. The function names we use come from the `UE_LOG` format
  strings inside each function, for example `"FOnlineLoadoutPhoenix::OnGetAllLoadoutsComplete"`. They
  are our identifications, not symbols.

---

## Signatures we hit on 2.1.1

| Error message | Top game frames (static) | Cause | Fixed by |
|---|---|---|---|
| `Trying to resize TArray to an invalid size of <billions>` | `0x142e83135` → `0x1428cd7fc` → `0x1428b2628` → `0x1428bc067` → `0x1414356e7` | Our backend answered the loadout request with a JSON object the client could not fill in | Strict mode: unknown routes return a body-less 404. The real route returns the full envelope. |
| `EXCEPTION_ACCESS_VIOLATION reading address 0x0000000000000000` | `0x1428dfba5` → `0x1428ddbc5` → `0x1423778ff` | Not pinned down. It stopped after two backend changes (see below). | `active_index: -1`, and giving every player the two default items |
| `EXCEPTION_ACCESS_VIOLATION reading address 0x0000000000000000` | `0x1427d486f` → `0x1426a561f` → `0x143edae0f` | `UPlayerJourneyComponent::OnQueryPlayerJourneyDataComplete` reading a missing HTTP response (static reading, **unverified**) | Seen once. Not reproduced after our last fixes. |
| "Application Hang Detected" | none (a dialog, not a crash report) | Unreal's hang detector | See [memory runaway](#memory-runaway-when-booting-a-city-map-directly) |

---

## The TArray crash: our own catch-all

### Symptom

The 2.1.1 client booted into Ramsgate, then died 80 to 120 seconds later:

```text
Fatal error: [File:Unknown] [Line: 8] Trying to resize TArray to an invalid size of 3163556208
```

Other runs gave `3051757616`, `2520240048` and `3837075504`. A different "size" every time is the
first clue. A count that came from real data would be stable.

### The stack, resolved

| Static address | What it is |
|---|---|
| `0x142e83135` | Unreal's fatal-error formatter for `"Trying to resize TArray%s to an invalid size of %llu"` (function `0x142e83100`) |
| `0x1428cd7fc` | Return from `call 0x140c0a6a0` (Unreal's `OnInvalidArrayNum`) inside the loadout initialiser `InitializeFromOnlineLoadoutData` (`0x1428cd790`) |
| `0x1428b2628` | Return from `call 0x1428cd790`, inside the handler that runs when loadouts arrive (`0x1428b2560`) |
| `0x1428bc067` | A delegate thunk |
| `0x1414356e7` | The delegate broadcast inside `FOnlineLoadoutPhoenix::OnGetAllLoadoutsComplete` (`0x1414353b0`) |
| `0x1413f4835`, `0x14141c3c9` | Phoenix HTTP completion plumbing |
| `0x143edae0f` | The HTTP retry manager's tick |
| `0x1414cdb73` | More Phoenix HTTP plumbing |
| `0x1412f8a65`, `0x142e87de7` | Ticker thunks |
| `0x140bff5dc` | `FEngineLoop::Tick` |

So the crash is in the code that handles the response to `GetAllLoadoutsEndpoint`:

```text
GET https://loadout-prod.steelyard.ca/loadout/{account_id}/{character_id}/all
```

In the standalone boot both ids were empty, so the request on the wire was
`GET /loadout///all`.

### The faulting code

```text
0x1428cd7e0  mov   ebx, dword ptr [rdx + 0x108]   ; payload.num_account_slots
0x1428cd7e6  lea   r14, [rcx + 0x728]             ; the slot TArray
0x1428cd7ed  add   ebx, dword ptr [rdx + 0x110]   ; + payload.num_character_slots
0x1428cd7f3  jns   0x1428cd7fc                    ; non-negative: carry on
0x1428cd7f5  mov   ecx, ebx
0x1428cd7f7  call  0x140c0a6a0                    ; negative: fatal "invalid size"
```

The client adds two 32-bit slot counts. Only a **negative** sum reaches the fatal call. The message
then prints the sum as an unsigned 64-bit number. `3163556208` is `0xBC900970`, which is
`-1131411088` as a signed 32-bit value. Both of the numbers we looked at closely have the shape of the
low half of a 64-bit stack address. They are uninitialised stack memory, not parsed data.

### Why the counts were garbage

1. **The response struct is a stack local, and its six numbers are never zeroed.** In
   `OnGetAllLoadoutsComplete` the constructor writes only the vtable, the `loadouts` array and the
   `persistent` sub-object. `num_account_slots`, `max_account_slots`, `num_character_slots`,
   `max_character_slots`, `active_index` and `needs_migration` (offsets `+0x108` to `+0x11c`) keep
   whatever was on the stack.
2. **The JSON reader only writes a field it finds with the right type.** The `int32` reader
   (`0x140c3a870`) checks `cmp dword ptr [rax+8], 3` (JSON number). If the key is missing, or holds
   a string, it returns without touching the destination. The `bool` reader does the same for JSON
   booleans.
3. **`loadout-prod` wraps its data.** The body must be `{"code", "message", "payload": {...}}`. If
   `payload` is missing or is not an object, the client skips the whole payload and reads none of the
   six fields.
4. **It still counts as success.** The handler accepts any HTTP status from 200 to 206 and any body
   that parses as a JSON object. So a `200` with an object that has no `payload` is a "successful"
   response full of stack garbage.

### What we were sending

We found the Phoenix API by letting the client walk its boot sequence against a "discovery" mode
in our 2.1.1 test backend. Every request was recorded. Every unknown route answered `200` with a
plausible-looking placeholder, so the client would carry on and reveal its next call. For a path
containing `loadout` the placeholder was `{"loadouts": []}`. For anything unmatched it was `{}`.
We did have a real route for `/loadout/{account_id}/{character_id}/all`. But a path parameter does
not match an empty segment, so `/loadout///all` fell through to the catch-all.

Both placeholders parse as JSON objects, pass the status check and carry no `payload`. That is exactly
the input that produces the garbage counts. **The crash was our own catch-all.**

### Why a body-less 404 is safer

We switched the backend to a strict mode in which unknown routes return `404` with **no body at
all**:

- A 404 is outside 200–206, so the client takes its error branch and never reads the struct.
- The body is empty on purpose. Some handlers may parse the body whatever the status. A JSON error
  body such as `{"error": "not found"}` would then be the same hazard all over again.
- The cost is visible. A 404 usually leaves the waiting loader unfinished, and the client retries
  the request. That shows up in the request log as the next thing to implement. It does not hide as
  silent memory corruption.

Measured on the same boot: with discovery on, the crash came at about 85 seconds. With strict mode,
the client survived 220 seconds and more. After that we only turned discovery on to map new traffic,
never while trying to play.

One more trap: a **bare JSON array** at the top level also avoids the crash, but only because
`FJsonSerializable::FromJson` (`0x140c2fbe0`) needs a top-level object and fails to parse. The
loadout loader then takes its failure path, never reports done, and the pawn never spawns. It is
stable, but it is not a fix.

### The real fix

The route now returns the full envelope, with every number as an unquoted JSON number and
`needs_migration` as a real JSON boolean:

```json
{
  "code": "OK",
  "message": "",
  "payload": {
    "loadouts": [],
    "persistent": {
      "manual_emotes": [], "intro_emote": "", "banner": "", "bannerCustomization": "",
      "flare": "", "title": "", "head_accessory": "", "back_accessory": "", "pet": "",
      "glider": "", "update_version": 0, "quick_chats": [], "emojis": [],
      "quick_curiosities_items": [], "quickwheel": []
    },
    "num_account_slots": 1,
    "max_account_slots": 5,
    "num_character_slots": 0,
    "max_character_slots": 0,
    "active_index": -1,
    "needs_migration": false
  }
}
```

- The slot total must be greater than 0. With 0 the client logs "Loadout active index is invalid
  (no loadouts exist!)" and the loader never finishes.
- We send one slot, not four or eight. The client builds a default loadout for every empty slot
  from `[DefaultLoadout]` in `DefaultGame.ini`. Fewer slots give it fewer chances to fail.
- `active_index` is `-1`. The next section explains what we know, and do not know, about why.

The field-by-field layout is on [Backend contract]({{ contract_page.url | relative_url }}).

---

## The access violation after `active_index: 0` with no loadouts

### Symptom

With the envelope in place, the TArray crash was gone. About 20 seconds into the boot, a new crash
appeared:

```text
Unhandled Exception: EXCEPTION_ACCESS_VIOLATION reading address 0x0000000000000000
```

### The stack

```text
0x1428dfba5   faulting instruction
0x1428ddbc5
0x1423778ff
```

The faulting code, in the function at `0x1428dfb70`:

```text
0x1428dfb9b  call  0x1428bda70              ; returns an object pointer, can return null
0x1428dfba0  lea   rdx, [rsp + 0x20]
0x1428dfba5  mov   rcx, qword ptr [rax]     ; read the vtable of a null object -> AV at 0x0
0x1428dfba8  mov   r8, qword ptr [rcx + 0x2c0]
0x1428dfbaf  mov   rcx, rax
0x1428dfbb2  call  r8
```

A helper returns no object, and the caller makes a virtual call on it without checking. Both
functions sit in the loadout code region (`0x1428c...` to `0x1428e...`). We did not name them.

### Cause and fix

Six of our seven 2.1.1 access-violation reports, all from about 20 minutes of testing, have this
same top frame. In that window we made two backend changes. After both, the crash stopped:

1. **`active_index: -1` instead of `0`.** We had sent `"active_index": 0` together with
   `"loadouts": []`. In a live A/B test the boot died about 20 seconds in with `0`. With **`-1`** it
   ran past 65 seconds and got through the loadout system. We cannot explain this from the code we
   read. The loadout initialiser checks the index at `0x1428cda4d`: an index inside the slot range
   is used as it is, and a negative or out-of-range index, when slots exist, only logs "Loadout
   active index is invalid. Falling back on the first loadout index!" and uses 0. With our one slot,
   both values should end up activating slot 0 there. Whatever made `-1` behave better happens
   somewhere we did not trace (**unexplained**).
2. **A weapon and a lantern for every player.** `CheckForPlayerStart` blocks with
   `"ArchonCharacter->Weapon is nullptr"` and `"->Lantern is nullptr"`, and we suspected that
   building the default loadout also needs an equipped weapon (**unverified**). On the retail
   servers the tutorial handed out the training weapon and the basic lantern. The standalone boot
   skips the tutorial, so the player owned neither. Our 2.1.1 backend now gives every player the two
   items that `[DefaultLoadout]` names (`WP_EB_TRAINING` and `LT_BASIC`). It reports them in the
   inventory transaction result as well as in the stored inventory. The client only learns an item
   exists from one of those two places.

The reports alone do not tell us which of the two changes fixed which crash. We did not trace
either cause to `0x1428dfba5` statically. `<SecondsSinceStart>` did not help either: it reads 0 in
three of these seven reports, so we do not trust it.

### The player-journey crash

The last access violation in our 2.1.1 reports faults at `0x1427d486f`, inside
`UPlayerJourneyComponent::OnQueryPlayerJourneyDataComplete` (`0x1427d47a0`). The call comes from
the HTTP completion path, so it is the handler for the player-journey response
(`GET progression-prod/pjm/...`). It happened once, shortly before our last round of fixes. Several
five-minute soak runs after that produced no crash of any kind, and we never reproduced it.

A short look at the handler after the fact:

```text
0x1427d47d4  mov   rsi, r8                  ; third argument: the HTTP response pointer
...
0x1427d486c  mov   rcx, qword ptr [rsi]     ; the response object
0x1427d486f  mov   rax, qword ptr [rcx]     ; read its vtable -> AV at 0x0 if there is no response
0x1427d4872  call  qword ptr [rax + 0x40]   ; the response code
0x1427d4875  add   eax, 0xffffff38          ; - 200
0x1427d487c  cmp   eax, 6                   ; the usual 200..206 check
```

The handler asks the response for its status code without checking that a response exists. A
request that ends with no HTTP response at all (refused, reset or timed out) hands it a null
response. By this reading the crash was caused by a player-journey request that got no answer,
not by a body of the wrong shape (**static reading only, untested**). The body shape is a separate
open question. We serve `{"nodes": {...}}`, an object keyed by node id, copied from the client's
own `POST /pjm` body, and we send it flat. Our static reading says `GET /pjm` is probably wrapped
in the `{code, message, payload}` envelope (see
[Backend contract]({{ contract_page.url | relative_url }})).

---

## Memory runaway when booting a city map directly

### What happened

On **2.1.1** we booted the client straight into `ramsgate_01_persistent` by overriding
`GameDefaultMap` (see [The 2.1.1 standalone attempt]({{ awakening_page.url | relative_url }})).
Uncapped, the client grew to about **9 GB** and pushed a 32 GB PC to 98% RAM (31.3 of 31.9 GB in
use). We did not find out why it grew that far. Our guess is that the path was never tuned, because
the normal login flow never loads the city this way (**unverified**).

### The caps

These lines in the user `Engine.ini`
(`%LOCALAPPDATA%\Archon\Saved\Config\WindowsClient\Engine.ini`) brought the same boot down to a
**peak of about 2.8 GB**. With them, Ramsgate loaded in about 20 seconds:

```ini
[SystemSettings]
r.TextureStreaming=1
r.Streaming.PoolSize=400
r.Streaming.LimitPoolSizeToVRAM=1
r.Streaming.FullyLoadUsedTextures=0
r.MipMapLODBias=2
gc.TimeBetweenPurgingPendingKillObjects=10
s.ForceGCAfterLevelStreamedOut=1
s.ContinuouslyIncrementalGCWhileLevelsPendingPurge=1
r.ScreenPercentage=70
sg.ViewDistanceQuality=0
sg.ShadowQuality=0
sg.PostProcessQuality=0
sg.TextureQuality=0
sg.EffectsQuality=0
sg.FoliageQuality=0
sg.AntiAliasingQuality=0
```

We applied these together and did not measure each one on its own. We expect the texture streaming
pool size (`r.Streaming.PoolSize`, in MB) to matter most (**unverified**). The rest trade looks for
headroom.

### The watchdog

Caps are not enough while you experiment. Our launch scripts start the game and then poll its
working set every few seconds. Past a fixed cap they kill the process before the PC starts swapping.
A minimal PowerShell version:

```powershell
param([int]$CapMB = 6500, [int]$MaxSeconds = 240)
$exe = "<game folder>\Archon\Binaries\Win64\Dauntless-Win64-Shipping.exe"
$p = Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe) -PassThru -ArgumentList @(
  "-EpicPortal", "-windowed", "-ResX=1280", "-ResY=720")
$t = 0; $peak = 0
while ($t -lt $MaxSeconds) {
  Start-Sleep -Seconds 5; $t += 5
  $pp = Get-Process -Id $p.Id -ErrorAction SilentlyContinue
  if (-not $pp) { "exited at ${t}s (peak ${peak} MB)"; return }
  $mb = [int]($pp.WorkingSet64 / 1MB); if ($mb -gt $peak) { $peak = $mb }
  if ($mb -gt $CapMB) { "cap hit: ${mb} MB at ${t}s - killing"; Stop-Process -Id $p.Id -Force; return }
}
"alive at ${t}s, peak ${peak} MB"
```

Add your build's login switches to `-ArgumentList`. When `$MaxSeconds` runs out, the script stops
watching but leaves the game running, so the cap no longer applies. Our 2.1.1 script used a 6.5 GB
cap. On
**1.4.4** the numbers are much smaller. We measured the client at 1.5–1.8 GB, a Ramsgate game-server
process at about 1.1 GB and a tutorial server at about 0.9 GB. Our 1.4.4 launch scripts still use
a watchdog: 12 GB for the client, 5 GB for a manually started server.

### The hang detector

The other way a direct city boot ended on 2.1.1 was Unreal's "Application Hang Detected" dialog,
a few minutes after Ramsgate rendered. We never found out which thread hung or why. The login flow
had never run in this boot, which makes it the obvious suspect, but that is not proven. For
investigation, set `HangsAreFatal=False` under `[Core.System]` in the
user `Engine.ini`. The hang is then still reported, but the process is not killed. Also raise
`PlayerStartEventTimeout` under `[/Script/Archon.ArchonPlayerController]` in `Game.ini`, so the
120-second failsafe does not hide the real cause. Each switch and its trade-offs are covered under
"The hang detector" in [Client internals]({{ internals_page.url | relative_url }}).

---

## The general lesson

- **A placeholder is not neutral.** This client deserialises into structs it never zeroes. A
  "plausible" response it cannot fully fill in gives it garbage, and the garbage surfaces later,
  somewhere else. A body-less 404 fails loudly, safely and in the right place. Send exactly what the
  client reads, or nothing.
- **Types are part of the contract.** Numbers must be unquoted, booleans must be real JSON booleans,
  and arrays must be arrays. A value of the wrong type is silently skipped, which on this client
  leaves the field uninitialised rather than 0.
- **A crash in game code is often caused by a response that arrived just before it.** Follow the
  return addresses back to the HTTP completion handler, and from there to the endpoint. Check
  whether the handler copes with no response at all, too.
- **Get shapes from the client, not from guesses.** Read the deserialiser, or record the client's
  own request bodies for the same resource. This API is largely symmetric, and several shapes, such
  as `pjm` and `cooldown`, came straight from what the client itself sent.
- **Treat a changing number as a clue.** A different "invalid size" on every run meant uninitialised
  memory, not bad data.
- **Cap resources before you experiment,** and treat crash reports as private data.
