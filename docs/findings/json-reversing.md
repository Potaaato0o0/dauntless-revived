---
title: Reading the JSON contract from the binary
parent: Findings
nav_order: 4
description: "How we recovered the JSON response shapes of Dauntless from the shipped 2.1.1 binary with no symbols: handlers, Serialize functions, envelopes and mistakes."
lang: en
ref: findings/json-reversing
---

{% assign contract_page = site.pages | where: "path", "findings/backend-contract.md" | first %}
{% assign crashes_page = site.pages | where: "path", "findings/crashes.md" | first %}

# Reading the JSON contract from the binary
{: .no_toc }

Phoenix's servers are gone, and nobody published their API. The one complete record of what each
response must look like is the code in the client that reads it. This page describes how we
recovered field names, JSON types and envelopes from that code. It also covers what we got wrong
along the way, because the mistakes are the best argument for doing it carefully. The results are
on [Backend contract]({{ contract_page.url | relative_url }}).

Everything here was done on the **2.1.1** client: `Dauntless-Win64-Shipping.exe`, 151 MB, UE5, no
symbols. Addresses are static virtual addresses with image base `0x140000000`. The method carries
over to **1.4.4** (UE 4.25), but its addresses are different and we have not yet repeated the work
there.

<details open markdown="block">
  <summary>Contents</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

---

## Why there is no shortcut

- **No symbols, no PDB.** Function names exist only where the game itself put them into log
  strings, plus the class and property names in Unreal's reflection data.
- **The response structs are not reflected.** As far as we have seen, the Phoenix structs are not
  UStructs filled in by `FJsonObjectConverter`. They are hand-written `FJsonSerializable` classes.
  A field name exists only as a string literal passed to a serializer call inside that struct's
  `Serialize` function. An SDK dump of the game's reflected types does not list them.
- **Wrong answers rarely produce errors.** A wrong shape usually parses "successfully" and leaves
  fields at defaults, or at garbage. You cannot find the right shape by trying things and waiting
  for an error message.

So we read the deserialisers directly.

---

## Tools

All of this is small Python scripts using `pefile` and `capstone`, run against a read-only copy of
the install.

| Tool | What it does |
|---|---|
| String xref | Finds a string in both ASCII and UTF-16LE, lists every `lea reg, [rip+disp]` that points at it, and walks back to the `int3` padding to find the enclosing function. |
| Annotated disassembly | Disassembles from an address and prints the string each `lea` points at. This is how a `Serialize` function becomes readable. |
| Serialize walker | Pairs each field-name `lea` with the next `call [rax+slot]` and prints `(name, slot)` rows. |
| Vtable dumpers, caller index | Dump vtable slots; index every `E8`/`E9` rel32 call to answer "who calls this". |
| `utocdir.py` | Parses a UE5 IoStore `.utoc` directory index. In 2.1.1, 141 of the 156 `.pak` files are 339-byte stubs and the cooked assets are in `.ucas`/`.utoc`; the other 15 hold loose files, among them the config. |
| `pak9.py` | Lists, searches and extracts files from 1.4.4's pak v9 (zlib, Oodle or stored). |
| Request recorder | Our research server stored every request it received: host, method, path, query, headers, body, and which handler answered. |

**Crash dumps are the other input.** A crashed client leaves
`%LOCALAPPDATA%\Archon\Saved\Crashes\UECC-*\CrashContext.runtime-xml`, which contains an
`<ErrorMessage>` and a `<PCallStack>` of absolute addresses. Subtract the module base listed in the
dump and add `0x140000000`, and you have static addresses to disassemble.

To keep a stalled client alive long enough to study it, we turned off Unreal's hang detector
(`[Core.System] HangsAreFatal=False`, a long `HangDuration`, and `-nothreadtimeout
-noheartbeatthread`). We also raised `PlayerStartEventTimeout`, so the game's own 120-second
failsafe did not hide the real cause.

---

## Step 1: from endpoint key to handler

The client finds each URL by looking up its **config key name** at runtime, for example the UTF-16
string `EntitlementsEndpoint`. So:

1. Search for the key name. The `lea` that loads it sits inside the function that builds the request
   (`0x14144b520` for entitlements).
2. That function either binds a completion lambda, whose address you can follow, or hands off to a
   named handler. Named handlers are easy to find because the game logs their names as ASCII
   strings, such as `"FOnlineLoadoutPhoenix::OnGetAllLoadoutsComplete"` at `0x1464abb88`. Search for
   the name and you land inside the handler.
3. **If the key name is not in the executable at all, the client never makes that request,** even
   when the ini still defines the URL. 2.1.1's `GetBountiesConfigEndpoint` is like that.

The Phoenix interfaces are called through vtables, so a rel32 caller index finds nothing for most
of them. Always work forward from the handler to the struct, not backwards from the struct.

---

## Step 2: find the response struct

The handler builds its response object on the stack and stamps a vtable into it:

```
lea  rax, [rip+...]        ; -> 0x1464ab5c8, the payload struct's vtable
mov  [rbp-0x38], rax
```

In the `FJsonSerializable` vtables we catalogued, slot `+0x28` is the shared
`FJsonSerializable::FromJson(const FString&)` at `0x140c2fbe0`, and slot `+0x38` is the struct's
own `Serialize`. That gives a mechanical way to list them all: every vtable whose `+0x28` points at
`0x140c2fbe0` is a JSON-serialisable type. 2.1.1 has **422** of them.

`FromJson` parses the body into an `FJsonObject` and then calls `Serialize` with the reader
(vtable `0x14623f9e0`). That is why a top-level JSON array fails for these endpoints: there is no
object to hand over.

Watch out for **folded functions**. The linker merges functions whose code is identical, so one
`Serialize` can belong to many types. The common envelope `Serialize` at `0x1414552f0` is referenced
by about 30 vtables. From a `Serialize` function you cannot tell which endpoint uses it; from the
handler you can.

---

## Step 3: read `Serialize`

Each field is one serializer call, and the call's vtable slot tells you the C++ type. It has the
shape Unreal's `JSON_SERIALIZE` macros produce:

```
; FOnlineLoadoutsPhoenix::Serialize (0x141457f20), abridged
0x1414583bf  lea   r8,  [r15+0x108]         ; destination member
0x1414583c6  lea   rdx, [rip+...]           ; w"num_account_slots"
             ...
0x1414583d0  call  qword ptr [rax+0x80]     ; slot +0x80 = int32
```

So each field gives you a name (the UTF-16 literal in `rdx`), an offset (`r8`) and a type (the slot).

### The slot table

These are the reader's slots in 2.1.1 (vtable `0x14623f9e0`). We built the table by reading each
slot's function, not by guessing from usage.

| Slot | Function | C++ type | Send |
|---|---|---|---|
| `+0x18` / `+0x20` | — | start / end object | — |
| `+0x40` | `0x140c3abd0` | `FDateTime` | an ISO-8601 string with a `T`. The reader requires a JSON string and passes it to what we take to be `FDateTime::ParseIso8601` (`0x142f75790`); a number is skipped |
| `+0x50` | `0x140c3aa10` | `float` | a number |
| `+0x60` | `0x140c3acd0` | `FString` | a string |
| `+0x68` | `0x140c3b010` | `bool` | `true` / `false`; nothing else is accepted |
| `+0x70`, `+0x78` | `0x140c3af40`, `0x140c3a940` | integers of a width other than int32 (not resolved) | a number |
| `+0x80` | `0x140c3a870` | `int32` | a number; a quoted number is ignored |
| `+0xa0` | `0x140c3c030` | `TArray<FString>` | an array of strings |
| `+0xc8` | — | a map (seen on `playerHuntIDs`) | an object |
| `+0xe0` | `0x140c321a0` | raw access to the JSON object | used for nested objects and arrays |
| `+0x90`, `+0xa8`, `+0xe8`, `+0xf0` | — | no-ops on the reader | — |

**Correction:** our first version of this table had `+0x50` as a 64-bit integer. Reading the
function shows `cvtsd2ss` followed by a 4-byte `movss`, so it is a float. Fields such as
`createdTimeMillis` and `pingFrequency` use this slot.

### Nested objects and arrays

Arrays of structs and nested objects are not read through a typed slot. The code takes the raw
object (`+0xe0`), looks the key up (`TryGetField`, `0x140c2f760`), and checks the JSON type byte:

```
; progression config payload Serialize (0x1414c4e80), abridged
0x1414c4ef1  lea  rdx, [rip+...]          ; a"paths"
             call 0x140c2f760             ; look the key up
             ...
0x1414c4f4c  cmp  dword ptr [rcx+8], 5    ; EJson::Array?
0x1414c4f50  jne  <skip>
```

The type values are Unreal's `EJson` enum: `None 0`, `Null 1`, `String 2`, `Number 3`, `Boolean 4`,
`Array 5`, `Object 6`. Most of the raw lookups we read used **ASCII** key literals (`a"payload"`,
`a"loadouts"`, `a"paths"`, `a"entitlements"`), while the typed slot calls used **UTF-16**. There
are exceptions (the mailbox `/all/` wrapper looks up a UTF-16 `"payload"`), so search for both
encodings.

---

## Step 4: recognise the envelope

Many services wrap their payload as `{"code", "message", "payload"}`. In memory that is vtable
`+0x00`, `code` `+0x08`, `message` `+0x18`, payload `+0x28`. The sign in a handler is **two vtables
stored 0x28 bytes apart** on the stack, for example the wrapper at `[rbp-0x60]` and the payload
struct at `[rbp-0x38]`, with `FromJson` called on the wrapper.

We found these wrapper variants in 2.1.1:

| Serialize | `code` | `payload` | Used by |
|---|---|---|---|
| `0x1414552f0` | string | object | about 30 types, among them loadout, cohort, event stats, escalation, progression config, most of Gauntlet, and `/pjm` |
| `0x1414555b0` | string | array | Gauntlet leaderboard |
| `0x141455c50` | string | int32 | Gauntlet guild rewards |
| `0x14145a2f0` | string | object | mailbox `/all/` |
| `0x1414be3a0`, `0x1414be050` | **int32** | array | `/progression/{accountid}`, `/progression/objectives/{accountid}` |
| `0x1414bffe0` | `statusCode` (int32) | — | in the matchmaker code; we could not tie it to an endpoint |

The wrapper checks `payload`'s type (`cmp dword ptr [rcx+8], 6` at `0x1414553d3`). If it is missing
or the wrong type, **`Serialize` returns normally, the parse reports success, and the payload struct
is never touched.**

A **flat** endpoint looks different. Either the struct's own vtable is stamped alone and `FromJson`
is called on it (migration status), or the handler parses the body into a plain `FJsonObject` and
calls `TryGetArrayField` by name (both inventory handlers).

---

## Step 5: read the gates around the parse

The code around the parse decides how much a wrong answer costs.

- **The status gate:** `call [rax+0x40]` (response code), then
  `add eax, 0xffffff38 / cmp eax, 6 / ja <fail>`. Only 200–206 get through.
- **The parse result:** `test bl, bl / je <fail>` after `FromJson`.
- **What the consumer does on failure.** This is what separates a harmless endpoint from a blocking
  one. `AArchonLoadout` never reports done when the read fails. The cohorts component falls back to
  a default treatment and carries on. A failed inventory query throws the player back to the main
  menu. A migration reply that never says "finished" is polled forever.

---

## Why types are load-bearing

The typed readers do not convert and do not complain. Here is the int32 reader, slot `+0x80`:

```
; 0x140c3a870, abridged
0x140c3a8b2  cmp  eax, -1                  ; key not found?
             je   0x140c3a8e6              ;   -> result = false
0x140c3a8dc  cmp  dword ptr [rax+8], 3     ; EJson::Number?
             jne  0x140c3a8e6              ;   -> result = false
             ...
0x140c3a8f7  test bl, bl
             je   0x140c3a92b              ; false: the destination is never written
```

A missing key and a wrong type get the same treatment: **the C++ member keeps whatever it held
before.** The bool reader does the same with `cmp dword ptr [rax+8], 4`. Several response structs
(all three loadout replies, for example) are stack locals whose constructors zero only some
members. For those, "whatever it held before" is leftover stack memory.

Cases we hit or read in 2.1.1:

| Field | Wrong value | Result |
|---|---|---|
| `serverInfo.port` | `"7777"` (string) | Stays 0. The status check passes (it only checks `host`), then the connect-string builder rejects the session with a log line that never reaches a log file (file logging is stripped). The client just doesn't travel. |
| Loadout slot counts | missing or quoted | Stack garbage, then a fatal `TArray` resize (see the next section) |
| `needs_migration` | `0` or `"false"` | Not written; stack garbage decides which code path runs |
| `active_index` | `0` with an empty `loadouts` | In our tests the boot crashed with an access violation at `0x0` about 20 seconds in; `-1` avoided it. Why is unexplained (see [Crash forensics]({{ crashes_page.url | relative_url }})) |
| `migration_finished` | missing | Stays false, and the client polls forever |
| `entitlementsv2` body | `[]` | `FromJson` fails; the entitlements loader never finishes, and six loaders behind it never start |
| Character `data` values | a JSON `true` | `TryGetString` fails and the whole character data store is reset |
| Character `updateVersion` | missing | "Failed To Parse All Required Fields", six retries, failed login |
| `treatments` elements | objects | Read as `TArray<FString>`, so they must be strings |
| `confirmed_fremium_rank` | spelled correctly | Not found, stays 0. The client's spelling is `fremium`. |
| `code` in `/progression/{id}` | a string | Harmless: this variant reads an int32, but nothing reads `code` back |

Letter case is a different matter. `FJsonObject` stores its fields in a `TMap<FString, ...>`, and
Unreal normally compares `FString` keys without regard to case, so `sessionToken` and
`sessiontoken` should be the same key. That is standard engine behaviour; we did not test it
separately.

---

## A wrong shape crashes; it does not fail

This is the story that taught us the rules above. Here we tell it from the JSON side. The
crash-report side, frame by frame, is on [Crash forensics]({{ crashes_page.url | relative_url }}).

**Discovery mode.** Early on, our research server answered every *unknown* route with `200` and a
guessed body: `{}`, or a stub chosen by keywords in the path. Every request was recorded. It worked
well for mapping traffic. The client kept going through its boot sequence and showed us the next
call each time.

**The crash.** Once the client could boot straight into Ramsgate, it died about **85 seconds** in:

```
Fatal error: Trying to resize TArray to an invalid size of 3163556208
```

Another run gave `3051757616`. We turned the call stack into static addresses and followed it back:

```
0x142e83135  fatal log: "Trying to resize TArray%s to an invalid size of %llu"
0x1428cd7fc  InitializeFromOnlineLoadoutData (0x1428cd790)
0x1428b2628  loadout-loaded handler (0x1428b2560)
0x1428bc067  delegate thunk (0x1428bc050)
0x1414356e7  FOnlineLoadoutPhoenix::OnGetAllLoadoutsComplete (0x1414353b0), delegate broadcast
  ...        Phoenix HTTP completion, HTTP retry manager, ticker, FEngineLoop::Tick
```

The faulting code adds two fields of the loadout payload and checks only the sign:

```
0x1428cd7e0  mov  ebx, dword ptr [rdx+0x108]   ; num_account_slots
0x1428cd7ed  add  ebx, dword ptr [rdx+0x110]   ; + num_character_slots
0x1428cd7f3  jns  0x1428cd7fc                  ; only a negative sum reaches the fatal
0x1428cd7f7  call 0x140c0a6a0                  ; OnInvalidArrayNum
```

**Why.** The response struct is a 0x120-byte stack local in `OnGetAllLoadoutsComplete`. Its
constructor writes the vtable, the `loadouts` array and the `persistent` sub-object, and **never
touches the six scalars at `+0x108`..`+0x11c`**. They are filled only if the JSON supplies them.
Our discovery stub for anything with "loadout" in the path was `{"loadouts": []}`. That is a valid
object, but it has no `payload` and no counts, so the counts were leftover stack memory.
`3163556208` is `0xBC900970`, which is negative as an int32 and shaped like the low half of a
pointer. It was never a number we sent.

**The proof.** With discovery on, the crash came at 85 seconds. With discovery off (unknown routes
answered `404`), the client ran for more than 220 seconds.

**The fix, in three parts:**

1. **Strict mode.** Unknown routes return `404` with **no body at all**. A JSON error body has the
   same risk if a handler parses regardless of status. Discovery stays available for mapping new
   traffic but is never on while playing.
2. **The real shape.** The loadout endpoint got its full envelope with numeric counts.
3. **The next crash.** With the envelope in place, `active_index: 0` and an empty `loadouts` array
   crashed with `EXCEPTION_ACCESS_VIOLATION reading 0x0` about 20 seconds in. Setting `-1` got the
   client past the loadout system, and after that it ran for minutes with no crash.

**A tempting non-fix.** For a while we answered that endpoint with a bare `[]`. The crash went away,
but only because a top-level array fails `FromJson`. The loadout loader then took its failure path,
never reported done, and asked again every load cycle. The client was stable and could never spawn
a player.

**Lessons:**

- In this client a wrong shape is not a validation error. It is undefined behaviour.
- `404` is a safe placeholder. `{}` is not.
- "The crash went away" and "the endpoint works" are different claims. Check that the loader
  actually finishes.
- A number that changes between runs and looks like a pointer is uninitialised memory, not data.

---

## Let the client show you: its own request bodies

The Phoenix API is largely symmetric. The client writes the same resources it reads: journey,
cooldowns, characters, inventory. In `FJsonSerializable` one `Serialize` function does both jobs: it
writes when saving and reads when loading. So whenever the client *sends* a struct, you are looking
at the field names and JSON types it will expect to read back into that same struct.

We recorded every request, then looked through the stored bodies before guessing a shape:

- **`POST /pjm/{accountid}`** showed that `nodes` is an **object keyed by node id**, not an array,
  and showed each node's fields:

  ```json
  {"nodes": {"Slayer_00": {"node_id": "Slayer_00", "node_status": 2, "objectives": []}}}
  ```

  The reader confirmed it by checking the `nodes` value for type 6 (Object).
- **`PUT /cooldown/batch/{accountid}`** gave `{"cooldowns": [{"cooldown_id",
  "cooldown_started_date"}]}` and the date format the client uses. The batch request and the reply
  use one container type, so echoing the merged batch back is correct.
- **`POST /inventory`** gave the transaction's field names and the exact catalog ids of the starter
  grant.

It has limits:

- **A transaction is not symmetric.** `POST /inventory` sends `add...`/`remove...`/`save...` lists
  and reads back `created...`/`updated...`/`removed...` lists. An echo parses fine and grants
  nothing.
- **A request body shows no envelope.** The client writes `/pjm` unwrapped. Our static reading of
  the `GET /pjm` handler finds the standard wrapper around it. Use request bodies for field names and
  types, and check the handler for the wrapper.

---

## Other ways to see inside

Shipping builds have file logging stripped out, so we watched the client through its network
traffic instead:

- **The heartbeat.** 2.1.1 posts `{state, map, server, session, ping, playtime}` to
  `tracking-prod.steelyard.ca/heartbeat` every second. `map` tells you where the client actually
  is.
- **Repeated requests.** In strict mode, an endpoint the client needs shows up as the same request
  over and over. In our 2.1.1 standalone boot, each missing endpoint was requested 70 times before
  the client gave up. A loader that is not done asks again on every load cycle.
- **Telemetry events.** `playerdata_load_failed` names each loader and whether it finished;
  `client_login_failed` names the login step that failed. Both arrive at
  `telemetry-ingest-prod.steelyard.ca/event`.

---

## Mistakes worth avoiding

- **Nearby code is not proof.** We once took the `/gamesession/playerjoined` reply parser for the
  matchmaker's `serverInfo` struct, because both mention `gameSessionId`. Tie a struct to its
  endpoint through the handler's call chain.
- **Scan for short displacements too.** One readiness flag in `UProgressionComponent` (`+0x3f3`)
  seemed to have no writer. Our scans covered only 32-bit displacements, so a store through a
  rebased pointer with an 8-bit displacement would not show up. That question is still open.
- **Read enums from the string-compare chains.** Values like the matchmaking `status` and
  `PlayerAccountProgressStep` are strings compared one by one and turned into small numbers. The
  chain gives both the valid spellings and their order.
- **Don't trust a slot table built from usage.** Read the slot's function (see `+0x50` above).
- **Check the ini against the executable.** A key defined in the ini whose name never appears in
  the exe is dead.
