---
title: Backend contract
parent: Findings
nav_order: 3
description: "The Dauntless backend API recovered from the client: steelyard.ca hosts (not PlayFab), the response envelope, login, characters, inventory and matchmaking."
lang: en
ref: findings/backend-contract
---

{% assign rev_page = site.pages | where: "path", "findings/json-reversing.md" | first %}
{% assign awakening_page = site.pages | where: "path", "findings/awakening-2-1-1.md" | first %}
{% assign mp_page = site.pages | where: "path", "findings/multiplayer.md" | first %}
{% assign crashes_page = site.pages | where: "path", "findings/crashes.md" | first %}
{% assign escalation_page = site.pages | where: "path", "findings/escalation.md" | first %}
{% assign store_page = site.pages | where: "path", "findings/store.md" | first %}
{% assign config_page = site.pages | where: "path", "reference/configuration.md" | first %}
{% assign game_page = site.pages | where: "path", "reference/game-settings.md" | first %}

# Backend contract
{: .no_toc }

Dauntless talks to a set of Phoenix Labs web services over HTTPS. Those services shut down with
the game, so the only full description of them left is the code in the client that calls them and
reads their answers. This page is that description: the hosts, the envelope rules, and the
endpoints whose exact response shapes we have pinned down.

Most of it was read out of the **2.1.1** client (the final release, UE5). Where we know how
**1.4.4** (October 2020, UE4, the build we run) behaves, we say so. How we read shapes out of the
binary is on [Reading the JSON contract from the binary]({{ rev_page.url | relative_url }}).

<details open markdown="block">
  <summary>Contents</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

---

## How sure we are

Every shape on this page carries one of these labels.

| Label | Meaning |
|---|---|
| **live** | Our server sent this to a real client, and the client visibly acted on it: it made the next call in the chain, created a character, or kept running where it used to crash. |
| **static** | Read from the client's deserialiser in the binary. Our server may send it, but we have not seen proof that the client used it. |
| **Undaunted** | What [Undaunted](https://github.com/SyST3MDeV/Undaunted)'s server sends to the 1.4.4 client, which plays through it live. That shows the client *accepts* the shape. It does not show that the client parses it. Several of these loaders carry on when parsing fails. |
| **unverified** | Inferred, or our sources disagree. The text says which. |

Addresses are static virtual addresses in the 2.1.1 `Dauntless-Win64-Shipping.exe`, image base
`0x140000000`. They do not apply to 1.4.4.

---

## Not PlayFab: `OnlineSubsystemPhoenix` on steelyard.ca

Some earlier community write-ups said the Dauntless backend was PlayFab. **It is not.** The 151 MB
2.1.1 executable contains exactly two PlayFab paths (`/Client/UpdateUserTitleDisplayName` and
`/Server/WriteTitleEvent`) and no PlayFab login at all. The backend is **`OnlineSubsystemPhoenix`**:
Phoenix Labs' own REST API on the **`steelyard.ca`** domain.

The endpoint table is in the cooked config: `DefaultGame.ini`, section `[OnlineSubsystemPhoenix]`.
Each endpoint is a key whose value is a URL template, for example:

```ini
EntitlementsEndpoint = "https://auth-{environment}.steelyard.ca/entitlementsv2"
```

`{environment}` resolves to `prod`. By our count the 2.1.1 section has 198 keys whose value is an
`http(s)` URL and the 1.4.4 section has 166, plus one `ws://` key (the presence socket) in each.
Some are dev/staging entries or `_v2` duplicates.

Getting the file out:

- **2.1.1** keeps its config in `Archon_50-WindowsClient.pak`. It is Oodle-compressed and the game
  ships no `oo2core` DLL (Oodle is linked statically), so the common pak tools could not open it.
  We built the open-source `ooz` decompressor as a shared library and drove it from Python.
- **1.4.4** uses pak v9 with an unencrypted legacy index and zlib. The config is in
  `Archon_35-WindowsClient.pak`. A small pak v9 reader is enough.

> **Secrets in the shipped config.** The 2.1.1 cooked config contains a live Slack webhook URL (key
> `PhoenixEventsMessageEndpoint`) and the Epic Online Services client secret and encryption key in
> plain text. The 1.4.4 config contains a Slack webhook too. None of that is reproduced here, and a
> private server does not need any of it.

---

## Hosts

Every hostname follows the pattern `<service>-prod.steelyard.ca`, apart from a few outliers. Our
2.1.1 research server answered all of them by pointing each name at itself in the hosts file (both
`127.0.0.1` and `::1`). Undaunted does it differently on 1.4.4: its injected DLL hooks the client's
config lookup and rewrites every `[OnlineSubsystemPhoenix]` URL to plain `http://` on the
metagame's own address, so no hosts file and no TLS are involved. Game-server processes get the
same effect from quoted overrides in the user `Game.ini` (see below).

| Host | What the client uses it for | Envelope |
|---|---|---|
| `auth-prod` | Password login, account info, tags, ban check, entitlements | flat |
| `gamesession-prod` | Epic-to-Phoenix session token, account link, platform features | wrapped |
| `login-queue-prod` | Login queue, maintenance status | flat |
| `dauntless-prod` | Characters, inventory, guild | flat; `GET /character` is a bare array |
| `loadout-prod` | Loadouts | wrapped |
| `progression-prod` | Progression, player journey (`/pjm`), cooldowns, escalation, bounties, game tuning | mixed; see [Progression](#progression-progression-prod) |
| `mm2-prod` | Matchmaking, parties, voice-channel join | see [Matchmaking](#matchmaking-and-travel-mm2-prod) |
| `presence-prod` | Session WebSocket, **plain `ws://` on port 80** | — |
| `gauntlet-prod` | Gauntlet (2.1.1 only) | wrapped |
| `mailbox-prod` | Mail, event stats, patch notes, surveys | wrapped where we read it |
| `cohort-prod` | A/B test treatments | wrapped |
| `migration-prod` | Cross-platform data migration (2.1.1 only) | flat |
| `store-prod` | Store, reconcile, creator codes | flat where we read it |
| `tracking-prod`, `telemetry-ingest-prod`, `telemetry` | Heartbeat, analytics events, log upload | — |
| `breadcrumbs-prod`, `guild-prod`, `leaderboards-prod`, `motd-prod`, `profanity-filter-prod`, `social-prod`, `subscription-prod` | As named | — |
| `steelyard.online/dauntless-status` | Status banner, **plain `http://`** | flat |
| `cdn.playdauntless.com`, `store.playdauntless.com` | News images, web store | — |

---

## Rules that apply to every endpoint

These hold for 2.1.1, where we read the handlers. We have not seen 1.4.4 break any of them.

- **Status 200–206 only.** Every completion handler we read checks the status with
  `add eax, 0xffffff38 / cmp eax, 6 / ja <fail>`, which is `200 <= status <= 206`. Anything else
  takes the failure branch before the body is read. The login queue wants exactly 200.
- **A JSON object at the top level.** Almost every response goes through
  `FJsonSerializable::FromJson(const FString&)` (`0x140c2fbe0`), which needs a JSON object. A bare
  array fails to parse. That failure is safe, but in most cases the loader waiting on the answer
  never finishes. The one exception is `GET /character`, which is parsed as an array.
- **Missing or mistyped fields are not errors.** The typed readers skip a field that is missing or
  has the wrong JSON type, and leave the C++ member as it was. Some response structs live on the
  stack and are never zeroed, so "as it was" can mean uninitialised memory. A `"7777"` where the
  client expects `7777` is not a validation error: the field is silently skipped, and on a struct
  that was never zeroed that means undefined behaviour. The details are on
  [the reversing page]({{ rev_page.url | relative_url }}#why-types-are-load-bearing).
- **Unknown route: `404` with an empty body.** Never answer an unknown route with `{}`. That is what
  crashed our client (see
  [A wrong shape crashes]({{ rev_page.url | relative_url }}#a-wrong-shape-crashes-it-does-not-fail)).
- **Listen on IPv4 and IPv6.** The hosts file maps each name to both `127.0.0.1` and `::1`, so the
  client may connect over either. On our 2.1.1 server (uvicorn) we bind each address family
  separately, because a `::` bind sets `IPV6_V6ONLY`.
- **TLS against the game's own CA bundle.** The client checks server certificates against a
  `cacert.pem` it ships, not the Windows store. 2.1.1 reads a loose
  `Engine/Content/Certificates/cacert.pem` from the game folder, and that is where we put our
  private CA for 2.1.1 testing. 1.4.4 keeps its bundle inside `Archon_0-WindowsClient.pak`. We never
  touch the Windows trust store. (Undaunted avoids the question on 1.4.4 by rewriting every URL to
  `http://`, as described under [Hosts](#hosts).)
- **Quote URLs in user ini overrides.** Endpoints can be overridden in the user config,
  `%LOCALAPPDATA%\Archon\Saved\Config\WindowsClient\Game.ini`. Our 1.4.4 setup points its
  game-server processes at the metagame this way. Leave a URL unquoted and the ini parser treats the
  `//` as the start of a comment, cutting the value down to `https:`.

---

## The envelope

Many services wrap their answer:

```json
{"code": "OK", "message": "", "payload": { }}
```

`payload` is usually an object. It can also be an array (the gauntlet leaderboard) or a bare number
(gauntlet guild rewards). In memory the wrapper is laid out as vtable `+0x00`, `code` `+0x08`,
`message` `+0x18`, payload `+0x28`.

**If `payload` is missing or has the wrong JSON type, the parse still succeeds and the payload
struct is left untouched.** A flat body sent to a wrapped endpoint therefore "works": no error, no
retry, just default values. That is what happened with `GET /account/link/...`: it gave the same
result for a flat `{"isLinked": true}` and `{"isLinked": false}`, because the client never read
either one.

We first assumed only `gamesession-*` was wrapped. Reading the handlers showed the wrapper is much
more widespread:

| Shape | Where (2.1.1) |
|---|---|
| **Wrapped**, `code` is a string | `gamesession-*`, `loadout-*`, `gauntlet-*`, `cohort-*`, `mailbox-*` (`/eventstats/`, `/all/`), and on `progression-prod`: `/progression/config`, `/escalation/...`, `/progression/{a}/{p}`, and by our static reading `/pjm` |
| **Wrapped**, `code` is an **int32** and `payload` an **array** | `progression-prod` `/progression/{accountid}` and `/progression/objectives/{accountid}` |
| **Flat** object | `auth-*`, `dauntless-*` (apart from `GET /character`), `login-queue-*`, `migration-*`, `store-*`, `progression-prod` `/cooldown` and `/bounty`, `dauntless-status` |
| **Bare array** | `GET dauntless-prod/character` |

On every path we traced, nothing acts on `code`. (The loadout handler maps it to an error value, but
its listener never looks at that value.) Undaunted sends `"code": null` in almost every wrapped
reply to 1.4.4, and 1.4.4 works with it; the exception is `/candidate/regions`, which gets
`"code": 200`. Still, send a string (or a number, for the int32 variant) so that the field at least
parses.

---

## Login and session (2.1.1)

This is the 2.1.1 boot chain in the order the client calls it. With these answers the client logs
in, and `FOnlineIdentityPhoenix` reports login complete with a real account id. That makes every
row marked **live** below proven end to end.

| # | Call | Answer | Label |
|---|---|---|---|
| 1 | `POST login-queue-prod/login` | flat, exactly five fields (below) | live |
| 2 | `GET gamesession-prod/features/platform/{platform}` | `crossplay`, `crossprogression` (bools) | live, see note |
| 3 | `GET gamesession-prod/account/link/{service}/{accountid}` | wrapped, payload `{"isLinked": true}` | live |
| 4 | `PUT gamesession-prod/gamesession/{linkedaccountservice}` | wrapped, payload `{"sessiontoken", "sessionid"}` | live |
| 5 | `GET auth-prod/accountinfo` | flat `{"username", "accountId"}` | live |
| 6 | `GET auth-prod/tags`, `GET auth-prod/isbanned` | answered; shape not read | — |
| 7 | `GET dauntless-prod/character` and onwards | see [Characters](#characters-dauntless-prod) | live |

**Login queue.** The reply is read by a hand-written visitor that knows exactly five keys:

```json
{"state": "OPEN", "error_code": "", "title": "", "message": "", "timeout": 5000}
```

`UArchonLoginQueueClient` lets the player through only when `state` equals `OPEN` (not
case-sensitive). Any other state, or no `state` at all, makes it poll again after
`max(timeout * 0.001, 5.0)` seconds. Other keys are simply ignored: our early replies carried
fields like `position` and `ready` but no `state`, and the client kept polling every 5 seconds.
`timeout` must be a JSON number. Undaunted sends the same five
keys to 1.4.4 (`error_code` `"TicketRateOk"`, `timeout` 8000).

**Platform features.** Our two static readings disagreed on whether this one is wrapped, so our
2.1.1 server sends both forms in one body; unknown keys are ignored. Undaunted sends 1.4.4 only the
wrapped form.

**Session token.** The client sends its Epic token as `Authorization: BEARER <jwt>` and expects
`payload.sessiontoken` and `payload.sessionid` back. From then on, `sessiontoken` is the bearer for
every other service. The path segment is `epiceos` in 2.1.1 and `epic` in 1.4.4 (per Undaunted),
filled into the same `{linkedaccountservice}` template. Epic re-issues the JWT, so the bearer
changes between logins. Take the player's identity from the JWT's `sub` claim instead, or the
player gets a new character on every login.

**Account info.** Flat, no wrapper. The `accountId` returned here goes into every later
`{accountid}` path segment, so it must stay the same for a given player. Undaunted's 1.4.4 reply
adds `creationDate`, `email`, `preferredLanguage` and `verified`.

**Other identity endpoints (static).** `POST auth-prod/game/login` (`AuthEndpoint`, the
email/password path) is read as a flat `{"displayName", "accountId", "token"}`, and all three are
required. The 2.1.1 Epic flow never calls it, so we have not exercised it. Undaunted's 1.4.4 setup
launches with `-AUTH_TYPE=exchangecode` and answers an Epic-style token exchange itself. Its DLL
redirects `AuthEndpoint` too, but its server has no handler for `/game/login`, so we infer that
1.4.4 does not call it in that setup either (unverified). `PUT gamesession-prod/account` (create a Phoenix account) is only reached when
`isLinked` is false. Its payload is `{"id", "sessiontoken"}`.

**Presence WebSocket (static).** `ws://presence-prod.steelyard.ca/ws/{accountid}`, plain `ws://`
on port 80. The client asks for exactly one subprotocol, `json`, and the 101 response should echo
it (a WebSocket client may reject a handshake that does not). Our reading is
that the client never sends a frame and ignores what it receives, so the whole contract is "accept
and stay open". No 2.1.1 run of ours has opened it yet, so this is untested.

---

## Characters (`dauntless-prod`)

Flat, and all **live** on 2.1.1.

| Call | Request | Answer |
|---|---|---|
| `GET /character` | — | **bare array** of `{"id", "name", "updateVersion", "data"}` |
| `PUT /character` (create) | `{"name": "..."}` | bare `{"id", "name"}`; only those two are read |
| `POST /character` (data-store save) | `{"characterId", "data", "updateVersion"}` | bare object; only `data` is read |

```json
[
  {
    "id": "<character id>",
    "name": "Slayer",
    "updateVersion": 3,
    "data": "{\"PlayerAccountProgressStep\":\"EnteredRamsgate\"}"
  }
]
```

Two parts of the client read `GET /character`. The character list needs `id` and `name`.
`FPhoenixCharacterDataStore` looks for the element whose `id` matches its character, then needs
`updateVersion` as a JSON number and `data` as a JSON **string** (or `null`). If either is missing,
it logs "Failed To Parse All Required Fields", fetches again up to six times, then fails the login.
Wrapping the list as `{"characters": [...]}` gives `Failed to get all characters: ParseError`.

**`updateVersion`.** The client increments its cached version *before* it sends a save. Store the
number exactly as sent. Adding 1 on the server puts it ahead of the client, and the next read looks
like a conflict. Undaunted rejects a save with `409` when the stored version is already greater than
or equal to the incoming one. That rule is consistent with this.

**The `data` blob is a JSON string holding a JSON object, and every value in it must be a string.**
The client pushes each value through `FJsonValue::TryGetString` (called at `0x14142ba4a`). The first value
that is not a string clears the success flag and resets the whole store, so a single JSON `true`
silently throws away every other key. The client itself writes `"true"` as a quoted string.

The key that decides where a new character goes is `PlayerAccountProgressStep`. Its value is an
enum name, without a prefix:

| Value | | Value | |
|---|---|---|---|
| `New` | 0 | `EnteredRamsgate` | 4 |
| `SavedCharacter` | 1 | `FinishedFirstHunt` | 5 |
| `TrainingGroundsComplete` | 2 | `FinishedSecondHunt` | 6 |
| `DefeatedGnasher` | 3 | anything else | "Unknown" |

`ULoginScreen::AdvanceToPlay` (`0x142d128f0`) sends state 0 to the opening cinematic and character
creator, 1 to the training grounds, 2 to the hunting grounds, and 3 or higher to Ramsgate. "Has
entered Ramsgate" is `state >= 4` everywhere we looked. The `-ForceFTUEFlow` command-line switch
forces the tutorial whatever the state. A new character created with

```json
{"PlayerAccountProgressStep": "EnteredRamsgate"}
```

as its data skips the tutorial. Do **not** add `HasFinishedTutorial`. Its mere presence (the value
is never checked) raises the state to 6, which switches on the MOTD screen
(`AArchonHUD::CanDisplayMOTDScreen` needs `>= 6`). The screen then tries to fetch content a
private server doesn't have. (2.1.1, static.)

---

## Entitlements (`auth-prod`)

`GET /entitlementsv2` (2.1.1, static):

```json
{"entitlements": []}
```

This is a flat object with one key, not a bare array and not wrapped. Serialize `0x14145f960` reads
only the ASCII key `entitlements` and checks that it is an array. Each element has `name` (string),
`duration` (int32) and `activatedDate` (string). The name field is `name`, not `entitlement`.

It matters more than it looks. The entitlements loader is at the root of the 2.1.1 player-data
dependency chain (see [Loaders](#why-these-endpoints-matter-the-player-data-loaders-211)). While we
answered `[]`, the client asked for entitlements again on every load cycle and never requested
anything from `/progression/*`.

**1.4.4:** Undaunted answers `{"code": null, "message": "OK", "payload": []}`, which is a different
shape. We don't know whether 1.4.4's parser expects that or just carries on when it fails.
(unverified)

---

## Loadouts (`loadout-prod`)

All loadout replies are **wrapped**, and every number in them matters.

### `GET /loadout/{account_id}/{character_id}/all`

2.1.1. **Live:** this reply ended a crash and got the client stably past the loadout system.

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

- **The four slot counts and `active_index` must be unquoted JSON numbers, and `needs_migration` a
  real JSON `false`.** The payload struct is a stack local. Its constructor zeroes the `loadouts`
  array and `persistent`, but not the six scalars at `+0x108`..`+0x11c`. A missing or quoted value
  leaves stack garbage. `UArchonLoadout::InitializeFromOnlineLoadoutData` (`0x1428cd790`) then sizes
  an array with `num_account_slots + num_character_slots` and dies with
  `Trying to resize TArray to an invalid size of ~3 billion`.
- **Send `active_index: -1` when `loadouts` is empty.** With `0`, our 2.1.1 boot crashed with
  `EXCEPTION_ACCESS_VIOLATION reading 0x0` about 20 seconds in. Changing it to `-1` got the client
  past the loadout system. We cannot explain the difference from the code we read: the loadout
  initialiser (`0x1428cda4d`) falls back to slot 0 for either value when a slot exists
  (**unexplained**, see [Crash forensics]({{ crashes_page.url | relative_url }})).
- **The slot total must be above zero.** With zero, the load stops with "Loadout active index is
  invalid (no loadouts exist!)" and the loader never reports done. The hard ceiling is 20 slots
  (`LoadoutSlot00`..`LoadoutSlot19`).
- **`needs_migration: false`** selects the normal path, which builds the loadouts. `true` takes a
  separate migration branch instead.
- **`persistent.update_version` should be present.** The `persistent` constructor zeroes the fields
  around it but skips this one.
- **`loadouts: []` is the low-risk choice.** For every empty slot the client builds a default loadout
  from `[DefaultLoadout]` in its own config. A hand-written element (0x280 bytes of fields) risks
  "Loadout slot data could not be initialized".

Loadout elements use **snake_case**: `slot_index` (int32, the slot it lands in; out-of-range
elements are dropped), `update_version`; `weapon`, `helmet`, `chest`, `arms`, `legs`, `lantern`,
`player_role`, `subweapon` and `persistent` are each `{"instance_id", "instance_data"}`; plus
`appearance`, `flask`, `custom_name` (strings) and `quick_items`
(`[{"item_index", "item_id", "instance_id"}]`). Inventory uses camelCase for the same ideas. Mixing
the two styles silently gives you empty fields.

**1.4.4 (Undaunted):** the same wrapper and field names, with real loadouts, 1/1/1/1 slots and
`active_index: 0`.

### Other loadout calls (2.1.1, static)

| Call | Payload |
|---|---|
| `GET /loadout/{account_id}/slotcount`, `.../{character_id}/slotcount` | `{"num_account_slots", "max_account_slots", "num_character_slots", "max_character_slots"}`, all int32. The four counts live in a stack local that is never zeroed, so never leave this unwrapped. Keep the numbers consistent with `/all`. |
| `GET /loadout/{account_id}/{character_id}` (active loadout) | One loadout element's fields and the persistent fields, flattened into the payload, plus `active_slot` (int32). `active_slot` is not zeroed, so it must be sent. One of our reviews found the element's `slot_index` and `update_version` are not zeroed either, so send those too (unverified). Not yet seen in traffic. |

---

## Inventory (`dauntless-prod`)

Flat objects, no wrapper. The handlers parse the body into a plain `FJsonObject` and pull out arrays
by name. (2.1.1, static; the request bodies are **live** traffic.)

**`GET /inventory/{accountid}/{characterid}`:**

```json
{
  "stackedItems":   [{"catalogId": "QI_BASIC_FLARE_DURABLE", "quantity": 5}],
  "instancedItems": [{"catalogId": "WP_EB_TRAINING", "instanceId": "WP_EB_TRAINING", "updateVersion": 1},
                     {"catalogId": "LT_BASIC", "instanceId": "LT_BASIC", "updateVersion": 1}]
}
```

**`POST /inventory` (complete a transaction).** The client sends `characterId`, `accountId`,
`source`, `transactionId`, and the lists `addInstancedItems`, `addStackedItems`,
`removeInstancedItems`, `removeStackedItems` and `saveInstancedItems`. The reply uses **different
keys**, all optional arrays:

```json
{"createdInstancedItems": [], "updatedInstancedItems": [], "updatedStackedItems": [], "removedInstancedItems": []}
```

If you echo the request back, the client counts the transaction as successful and receives nothing.
Undaunted uses the same four result keys for 1.4.4. Our 2.1.1 server currently sends
`deletedInstancedItems`, which the client never reads. That does no harm while it is always empty,
but `removedInstancedItems` is the real name.

Item fields: `catalogId` (required, and it must exist in the client's own catalog, or you get
"Can't find catalog id"), `quantity` (number) for stacked items, `instanceId` and `updateVersion`
(number) for instanced items, and an optional `itemData` string. **The client's catalog decides
whether an item is stacked or instanced, not the array it arrives in.** Put all four fields on every
item and the right branch will find what it needs.

A failed inventory query is loud. The client shows "Failed to retrieve your character's inventory."
and returns to the main menu.

**Starter gear (2.1.1 standalone city boot).** `AArchonPlayerController::CheckForPlayerStart` will
not start the player while the character has no weapon or lantern. The client's own starter grant
(armour, banner, flare, a weapon *part*) does not include either. Retail handed them out in the
tutorial. Our server adds the two items named in `[DefaultLoadout]`, `WP_EB_TRAINING` and `LT_BASIC`.

---

## Progression (`progression-prod`)

This host mixes shapes, so check each endpoint. All 2.1.1, **static** unless noted.

| Call | Shape |
|---|---|
| `GET /progression/config` | wrapped (string `code`); payload `{"paths": [...]}`, which must be an array |
| `GET /progression/{accountid}` | wrapped, **`code` is int32**, **payload is an array** of track records |
| `GET /progression/{accountid}/{progressionid}` | wrapped (string `code`); payload is one track record (likely) |
| `GET /progression/objectives/{accountid}` | wrapped, int32 `code`, array payload (likely) |
| `GET /escalation/{season_id}/{account_id}` | wrapped; see below |
| `GET /pjm`, `GET /pjm/{accountid}` | `nodes` is an **object keyed by node id**; envelope unverified, see below |
| `GET /cooldown/{accountid}` | flat `{"cooldowns": [...]}` |
| `PUT /cooldown/batch/{accountid}` | flat; the same serializer as the request |
| `GET /bounty/{accountid}` | flat `{"bounties": [], "draft_data": {...}}` |

**`/progression/config`.** Each path has `progression_id`, `premium_gating_entitlement`,
`progression_multiplier` (float), `requirements` (`[{"rank_id", "xp_required"}]`), `free_rewards`,
`premium_rewards`, `start_date`, `end_date`, `progression_multiplier_start_date`,
`progression_multiplier_end_date` and `prestige` (`{"xp_per_level"}`). Every `rank_id` that appears
in a reward list needs a matching requirement, or the client logs "Found rewards for rank_id %d but
could not find a corresponding requirement". The track ids we found as literals in the 2.1.1
binary are `SLAYER_RANK` and `WEAPONSMITH`. Undaunted serves 1.4.4 a real 10-path config with
`season09b` and `MasteryTrack_*` ids.

**Track records** (`/progression/{accountid}` and friends): `phx_account_id`, `progression_id`,
`progress`, `confirmed_fremium_rank`, `confirmed_premium_rank` (int32s) and `confirmed_date`
(read as a date). `fremium` really is spelled that way in the client; spelling it correctly leaves
the value at 0.

**Escalation.** The client asks for `ESC_SEASON_1` to `ESC_SEASON_6` on every city load:

```json
{"code": "OK", "message": "", "payload": {
  "escalation_level": 0, "next_level_xp": 0,
  "talents_progress": [], "unlock_progress": [], "update_version": 0}}
```

Talent elements are `{"rank", "talent_id"}` and unlock elements are `{"collected", "reward_id"}`.
`update_version` is an int32 by analogy with its neighbours; we did not isolate its read. Undaunted
sends 1.4.4 the same wrapped shape. For 1.4.4, the season registry, the save route and the rules our
server applies (off by default) are on [Escalation]({{ escalation_page.url | relative_url }}).

**Player journey (`/pjm`).** The client's own write, `POST /pjm/{accountid}`, looks like this:

```json
{"nodes": {
  "Slayer_00": {"node_id": "Slayer_00", "node_status": 2, "objectives": []},
  "Slayer_01": {"node_id": "Slayer_01", "node_status": 0,
                "objectives": [{"online_objective_id": "...", "objective_amount": 0, "objective_status": 0}]}}}
```

`nodes` is an object keyed by node id, not an array. The request body shows that, and the reader
confirms it by checking for a JSON object. `node_status` goes through an integer reader.
**Unverified:** our static reading of the `GET` handler
(`UPlayerJourneyComponent::OnQueryPlayerJourneyDataComplete`, `0x1427d47a0`) finds the standard
wrapper, with `payload` holding `{"nodes": {...}, "update_version": 0}`. Our 2.1.1 server answers
unwrapped. The client stopped retrying, but that proves nothing: an unwrapped body parses without
error anyway. The journey component is checked only after the pawn exists, which our 2.1.1 boot
never reached. The wrapped form has the better evidence.

**Cooldowns.** Elements are `{"cooldown_id", "cooldown_started_date"}`. `cooldown_started_date` is
read as a **plain string**, not through the date reader, for example `"2026-09-20T00:00:00.000Z"`.
The batch `PUT` request and response share one serializer, so merging the incoming batch into what
you hold and returning it is correct. We saw the same serializer used for the `GET` only
indirectly (likely). Undaunted sends 1.4.4 a wrapped cooldown reply.

**Bounties.** `bounties` elements carry `bounty_id`, `premium_bounty`, `slot_index`, `objectives`
(`[{"objective_id", "progress"}]`), `drafted_timestamp`, `update_version` and `claimed`.
`draft_data` is `{"current_draft_choices": [], "previous_draft_selections": [], "bronze_count": 0,
"silver_count": 0, "gold_count": 0}`. **2.1.1 never requests `GET /bounty/game-data`.** Its config
key, `GetBountiesConfigEndpoint`, is still in the ini, but the key's name does not appear anywhere
in the executable, so nothing ever looks it up. Bounty configuration comes from the game-tuning
blob `bounty_game_data` instead (`GET /game_tuning/{blobid}`). Undaunted does serve
`/bounty/game-data` to 1.4.4.

### Our 1.4.4 server: rank rewards, retries and the config {#progression-on-our-server}

This part is about **1.4.4 on our server** (real progression, the default), and comes from the
executable and our in-game tests. Labels: **B** read in the 1.4.4 executable, **V** verified in game,
**S** strong inference.

- **A confirm pays nothing.** The 1.4.4 game server pays every rank's rewards itself through
  `/inventory`, by three paths (B `0x141472fa0`, `0x1414876a0`, `0x141481920`), and our in-game test saw
  each reward granted exactly once (V, roadmap 2.10). So
  `POST /progression/<account>/<track>/<rank>/confirm/<public or premium>` only raises the confirmed
  rank and grants nothing. A test guards that a confirm leaves inventories, the item log and
  entitlements unchanged. Harmonic's fork paid on confirm; on our database, whose claims ledger would
  start empty, that would pay again every rank players had already confirmed.
- **The Elite ranks' entitlements (an option).** Only the game's `GrantProgressionAction` names an
  entitlement grant (B `0x1446c84c0`, used at `0x141487aa5`). Whether the game server grants the
  permanent entitlements of the season09b ranks (premium 6, 9, 29 and 50, free 50) through
  `POST /entitlementv2` by itself is open. `PROGRESSION_CONFIRM_ENTITLEMENTS=1` makes a confirm that
  raises a rank grant that rank's permanent config entitlements (source `confirm:<track>:<rank>`), never
  items, currencies or the timed boosts (premium 16, 34, 42 and 47). Off by default, until the in-game
  test: reach Elite rank 6 by hunt XP and watch for `POST /entitlementv2`.
- **Retries.** The game server retries a failed request up to 5 times (`HTTPRetryCount=5`, B). A grant
  (`POST /progression/<account>`) whose body is byte for byte the account's last grant, less than
  `PROGRESSION_REPLAY_WINDOW_S` seconds after it (default 5) and with no other track write in between,
  gets the first grant's stored reply and adds nothing; `progression_events` gets an audit row. Any
  confirm, reset or other grant in between makes the same body a new grant. The window stays well under
  the game server's grant flush: `UProgressionComponent` sends its queued grants at most once per
  `QueuedGrantTimeout`, which is 10 seconds (`DefaultGame.ini`; a one-shot timer armed at `0x14145a4a9`,
  B), so two grants it meant are normally about 10 seconds apart and can be identical. A retry after a
  connection error comes within seconds; a lost answer is retried only after `HTTPTimeoutSeconds=600`,
  outside any window. A window of 10 or more would take the next flush for a retry and lose its XP. An objective that arrives lower than
  stored is logged ("objective went backwards") and stored as sent.
- **The config.** `GET /progression/config` and the rank math read one loader: the bundled
  `vendor/progression_config.json`, or, with `PROGRESSION_CONFIG_DIR`, a folder of season files that
  replace or add tracks, checked at startup (a bad file stops the start). `ACTIVE_HUNT_PASS` (default
  `season09b`) is the Hunt Pass an account gets when none is stored. Never edit a season in place while
  players have progress in it (S): stored progress is counted against its requirements.
- **Balances.** `GET /balance` and `POST /reconcile` answer the client's currency sheet (it reads
  `CURRENCY_PLATINUM`, B `0x14161a790`, `0x1415d16dc`). Each `CURRENCY_*` key, in both spellings, now
  reports what the account's active character holds as an inventory stack (`BALANCE_FROM_INVENTORY`,
  on). `CURRENCY_PLATINUM_UNIV` is not mapped: the executable names it only next to the Elite upsell
  screen (B `0x14477fc50`, used at `0x1417ddd68` and `0x1417dddeb`), not where balances are read (S).

Where these settings live: [Configuration]({{ config_page.url | relative_url }}#metagame-progression)
and [Game settings]({{ game_page.url | relative_url }}#hunt-pass-seasons). The store routes of 1.4.4
(`/product/...`, `/token/...`, `/notification/...`) are on [The in-game store]({{ store_page.url | relative_url }}).

---

## Cohorts and mailbox

2.1.1, static.

| Call | Shape |
|---|---|
| `GET cohort-prod/playertreatments/{account_id}` | wrapped; payload `{"treatments": ["..."]}`. The elements are **strings**. |
| `GET mailbox-prod/eventstats/` | wrapped; payload `{"stats": [{"statname": "...", "amount": 0}]}` |
| `GET mailbox-prod/all/` | wrapped; the payload's own field list is **not recovered** |
| `GET mailbox-prod/survey/config` | **not established** |

The cohorts loader fails open. When the query fails it falls back to a default treatment, `E1000`,
and still reports done. So Undaunted's unwrapped 1.4.4 reply (`{"treatments": [...]}`) tells us
nothing either way.

---

## Status, migration and Gauntlet

**`GET http://steelyard.online/dauntless-status`** (2.1.1, static; we read the function from start
to `ret`). Flat, exactly nine fields, polled about every 30 seconds for the whole session:

```json
{"show-status": false, "en": "", "fr": "", "it": "", "es": "", "de": "", "pt": "", "ru": "", "ja": ""}
```

`show-status` must be a real JSON boolean. Neither call site zeroes that byte before the parse, so
with `{}` (or `"false"`) the client branches on uninitialised memory and may draw an empty status
banner. The eight strings are zeroed beforehand, so they are safe to omit, but cost nothing to send.

**`GET /migration/status`, `POST /migration/trigger`** (2.1.1 only, static). Flat:

```json
{"migration_finished": true, "migration_failed": false}
```

This one hangs rather than crashes. With `{}`, `migration_finished` stays false and the client
polls forever.

**Gauntlet** (2.1.1 only, static). Everything is wrapped.

| Call | Payload |
|---|---|
| `GET /config` | `{"gauntlet_id", "start_at", "end_at", "each_level_rewards": [], "milestone_rewards": []}`; the dates go through the date reader |
| `GET /leaderboard/get_leaderboard/{gauntlet_id}` | an **array** of `{"guild_name", "guild_nameplate", "level", "remaining_sec"}` |
| `GET /rewards/personal/{gauntlet_id}/{account_id}` | an object used as a map; each value has a numeric `cleared` (likely). `{}` is safe. |
| `GET /rewards/guild/{gauntlet_id}/{account_id}` | a bare **number**, e.g. `"payload": 0` |
| `GET /progression/{gauntlet_id}/{account_id}` | `{"personal_progression": 0, "guild_progression": 0}` |

Every steelyard host points at one server, so two services can claim the same path:
`/progression/{a}/{b}` is both Gauntlet progression and a `progression-prod` track. Route on the
`Host` header.

**Store** (static). `POST store-prod/reconcile` sends `{"authorization"}` and we found no parse of
the reply; it looks fire-and-forget. `store-prod/creator` is a `POST` carrying `{"slug",
"authorization"}`. The nearby reply struct `{"success", "reason"}` is probably its answer, but we
could not tie them together (unverified).

---

## Matchmaking and travel (`mm2-prod`)

Ramsgate is not a map the client opens locally. `UArchonOnlineSessionClient::TravelToCity` runs a
matchmaking request for the city. When the matchmaker says the match is ready, the client connects
to a real game server over UDP. Hunts and the tutorial island work the same way.

> **A correction.** We wrote our 2.1.1 matchmaking handlers planning to host the city on a second
> copy of the client. Then we concluded that the retail client could not act as a game server at
> all, and stopped there. So the travel half was never tested on 2.1.1. That conclusion was wrong.
> The client's network layer is intact, and an injected DLL can drive it; that is how Undaunted
> hosts on 1.4.4 (see
> [How multiplayer works]({{ mp_page.url | relative_url }})). Everything below is **static** for 2.1.1. The
> 1.4.4 flow works **live** through Undaunted.

### The flow

All paths are relative to `MatchmakingEndpoint = https://mm2-{environment}.steelyard.ca`.

| Step | Call |
|---|---|
| Regions | `GET /candidate/regions` |
| Start or join | `POST /candidate/join`, or `POST /candidate/join/{candidateId}` when joining a specific candidate |
| Poll | `GET /candidate/status` |
| Cancel | `DELETE /candidate`, `DELETE /candidate/leave` |
| Other | `POST /candidate/player/ready`, `PUT /candidate/player/{playerId}/loadout`, `GET /candidate/players/loadout?playerIds=...` |

There is **no `POST /candidate`**. `DELETE /candidate` cancels. (Our 2.1.1 research server gets
this wrong. It was written before we read these handlers.)

The `/candidate/join` request body carries `buildId`, `gameMode`, `gameType`, `gameArgs`,
`regionUrlsPings` (an object), `isPrivate` and `privateMatch` (both optional and left out when
unset, so do not make them required), `playerId`, `partyId`, `hunts` (array), `playerHuntId`,
`allow_crossplay`, `session_id`, `gauntlet_level`, `hashcode` and `loadout`.

### `GET /candidate/status`

```json
{
  "candidateId": "<id>",
  "status": "IN_PROGRESS",
  "statusReason": "",
  "gameMode": "<as requested>",
  "candidateStatusPeriodMillis": 1000,
  "serverInfo": {
    "gameSessionId": "<id>",
    "instanceId": "<id>",
    "host": "127.0.0.1",
    "port": 7777,
    "gameArgs": ""
  }
}
```

Fields the client reads (2.1.1, `FCandidateStatus::Serialize` `0x1414c2a10`): `candidateId`,
`status`, `statusReason`, `message`, `gameMode`, `huntId`, `gameArgs` (strings); `serverInfo`
(object); `playerStates` (object); `playerHuntIDs` (map); `createdTimeMillis` and `lobbyDuration`
(read through the **float** reader); `idealRemainingMillis`, `forcedRemainingMillis`,
`candidateStatusPeriodMillis` (int32); `isNewMatchmaker` (bool).

- **`status`** is one of `NEW`, `MATCHING`, `MATCHED`, `QUEUED_FOR_START`, `IN_PROGRESS`,
  `CANCELED`, `FAILED`. `CANCELED` and `FAILED` stop matchmaking. Anything else polls again after
  `candidateStatusPeriodMillis`, clamped to 1–10 seconds (default 1000 ms).
- **`isNewMatchmaker`** decides which statuses trigger travel. False or absent (the default):
  `MATCHED`, `QUEUED_FOR_START` or `IN_PROGRESS`, and no player check. True: only `IN_PROGRESS`,
  and `playerStates` must contain the local player.
- **`playerStates` is an object keyed by the player's id**, not an array. Each value is
  `{"isReadyToLeaveLobby": bool, "publicLoadoutHash": "..."}`. It is only looked up when
  `isNewMatchmaker` is true. (Undaunted sends 1.4.4 the literal key `"UserId"`. That works only
  because `isNewMatchmaker` is absent, so the lookup never happens.)
- **`serverInfo`** has exactly five fields: `gameSessionId`, `instanceId`, `host` (strings),
  `port` (int32) and `gameArgs`. There is no `ticket` in it.
- **`host` must be non-empty.** An empty host leaves the client polling forever, silently.
- **`port` must be a JSON number.** `"7777"` leaves it 0. The status check passes (it only looks at
  `host`), and then `GetResolvedConnectStringInternal` rejects the session with "Invalid session
  info". File logging is stripped from shipping builds, so that message never reaches a log file.

**Wrapped or not?** For 1.4.4, Undaunted answers unwrapped and it works live. For 2.1.1 we could not
tie the status handler to a parser. Two wrapper parsers sit nearby, one reading `{code, message,
payload}` and one reading `{statusCode, message, payload}`, both with int32 codes. (unverified)

**`/candidate/regions`.** Undaunted sends 1.4.4 a wrapped reply, `code` 200, with payload
`{"maxPingingStepTime", "pingCount", "pingFrequency", "regionUrls"}` and times in seconds. In 2.1.1,
`pingFrequency` and `maxPingingStepTime` go through the float reader. The 2.1.1 envelope is
unverified.

### The travel URL (2.1.1)

The connect string is built with this format:

```
%s:%d?ticket=%s?gameSessionId=%s?EncryptionToken=%s
```

The fields are host, port, ticket, game session id and encryption token. **Every option is
separated by `?`, not `&`.** For example:

```
127.0.0.1:7777?ticket=<ticket>?gameSessionId=<id>?EncryptionToken=<a>:<b>
```

- The ticket and encryption token come from the client's session info, not from `serverInfo`.
  `EncryptionToken` is itself `"%s:%s"` of two session-info fields, and it is empty when the first
  one is empty.
- The cooked `DefaultEngine.ini` turns on `net.AllowEncryption=True` and an AES packet handler.
- `POST /key/generate` sends an `X-Session-Id` header. On the host side, the
  `-DISABLE_MATCHMAKER_AUTH` switch makes `RedeemMatchmakerTicket` skip ticket validation.
- The server-side code compiled into the client reports a joining player with
  `POST /gamesession/playerjoined`, sending an `X-SecretKey` header. It reads back `{"playerId", "gameSessionId", "statusCode" (int32),
  "message", "token", "gameId"}`.
- `-UseStandaloneDedicatedServer` makes the client ask the matchmaker for
  `BUILDVERSION=LOCAL_<ComputerName>`. It looks like Phoenix's own local-server development mode.
  We have not explored it.

---

## Telemetry you can use as instruments

These don't gate anything, but they tell you what the client is doing. File logging is stripped
from the shipping build.

- **`tracking-prod/heartbeat`** (2.1.1): the client sends `{state, map, server, session, ping,
  playtime}` every second. `map` is the most reliable way to know where the client really is.
  Undaunted's 1.4.4 server takes `POST /heartbeat` with `{map}` and replies with the plain text
  `20000`, whose meaning we don't know.
- **`telemetry-ingest-prod/event?id=prod`**: analytics events, including `client_login_failed`. In
  2.1.1, `UArchonLoadManager::LoadFailed` (`0x1429ad0f0`) sends `playerdata_load_failed` with
  `{"map", "time", "loaders": [{"name", "loaded"}]}`, which names every stuck loader. Its timer rate
  comes from a field we found no writer for. If that rate is 0, the event never fires.
- **`telemetry.steelyard.ca/log`**: the cooked config turns on `[HTTPEventLog]` with no sampling. In
  principle that streams the client log as Splunk HEC lines, and the expected reply is
  `{"text": "Success", "code": 0}`. We have not received any traffic there yet.

---

## Why these endpoints matter: the player-data loaders (2.1.1)

In 2.1.1 the player's pawn spawns only after **every** registered `IArchonPlayerDataLoader` reports
done. `AArchonPlayerController::OnPostLogin` starts `UArchonLoadManager::Begin` (`0x14299b670`).
When all loaders are done, `OnPlayerDataLoadComplete` (`0x1429d6900`) runs, and that is the only
path to `ServerRestartPlayer()`. If a loader never finishes, the player eventually sees "You have
been signed out".

There are eleven loaders:

| Loader | Endpoint | If the reply fails |
|---|---|---|
| `EntitlementsComponent` | `auth-prod/entitlementsv2` | never done; root of the chain |
| `UProgressionComponent` | `/progression/config`, `/progression/{id}`, `/progression/objectives/{id}` | waits for all three |
| `HuntPassComponent` | `/huntpass/{id}` | done at once if the progression interface is missing; only registered when a feature flag is on |
| `UQuestSystemComponent` | none of its own | local state |
| `UBountyComponent`, `_Weekly`, `_Daily` | `/bounty/{id}` | — |
| `UCooldownComponent` | `/cooldown/{id}` | — |
| `UArchonInventoryDataLoader` | `/inventory/{a}/{c}` | error dialog, back to the main menu |
| `AArchonLoadout` | `/loadout/{a}/{c}/all` | **never done**: the only loader that holds back "done" on failure |
| `CohortsComponent` | `/playertreatments/{id}` | fails open to treatment `E1000` |

Dependencies: Entitlements → Progression → HuntPass → QuestSystem → Bounty → Bounty_Weekly →
Bounty_Daily. HuntPass also waits on Entitlements, and Bounty also waits on Progression and
Cooldown. InventoryDataLoader → Loadout. One stuck loader near the root stops everything behind it.
The one surprise: `UArchonLoadManager::Add` logs a null loader but adds it anyway, and a null entry
can never report done.

A second, later gate, `AArchonPlayerController::CheckForPlayerStart`, runs once the pawn exists and
has its own timeout (`PlayerStartEventTimeout`, 120 s by default). It waits for the weapon, lantern
and armour, the player journey component, the escalation component (hence the six `ESC_SEASON_*`
requests), and loadout replication.

In our 2.1.1 standalone boot our server answers the loader endpoints, but the account id is empty.
The client never ran its login flow in that mode, so the pawn never spawned. That is why many shapes on
this page are **static** rather than **live**. Details are on
[The 2.1.1 standalone attempt]({{ awakening_page.url | relative_url }}).

---

## 2.1.1 vs 1.4.4

**Same service, almost the same URLs.** Of the 165 `http(s)` URL keys in `[OnlineSubsystemPhoenix]`
that both builds define, **162 have byte-identical URLs**. The totals depend on what you count
(which keys, dev entries, `_v2` duplicates, the `ws://` socket). Our first comparison reported 151
of 154, and we could not reproduce that exact split. Every way of counting we tried gives the same
answer, though: the only URLs that differ are the three voice-chat keys:

| Key | 2.1.1 (EOS voice) | 1.4.4 (Vivox) |
|---|---|---|
| `VoiceChatJoinPartyEndpoint` | `mm2-.../evoice/join/party` | `mm2-.../vivox/join/party/{channel_type}` |
| `VoiceChatJoinGameEndpoint` | `mm2-.../evoice/join/game` | `mm2-.../vivox/join/game/{game_id}/{channel_type}` |
| `VoiceChatJoinDebugEndpoint` | `mm2-.../evoice/join/channel` | `mm2-.../vivox/join/channel/{channel_id}/{channel_type}` |

1.4.4 also has `VoiceChatLoginEndpoint`, which 2.1.1 dropped. In 1.4.4, voice ran on Vivox, a paid
third-party service. We don't plan to bring it back.

**28 endpoints exist only in 2.1.1.** These are the `...Endpoint` keys on steelyard.ca hosts that
1.4.4 does not have, so it never calls them:

| Area | Keys |
|---|---|
| Gauntlet and trials (11) | `GauntletConfigEndpoint`, `GauntletEndedLevelEndpoint`, `GauntletGetEntryEndpoint`, `GauntletGrantGuildRewardsEndpoint`, `GauntletGuildRewardsEndpoint`, `GauntletLevelAccessEndpoint`, `GauntletLevelFinishedEndpoint`, `GauntletLevelRewardsEndpoint`, `GauntletProgressionEndpoint`, `GauntletSeasonLeaderboardEndpoint`, `GetTrialsLeaderboardsEndpoint` |
| Store and lootboxes (5) | `StoreGetSteamOffersEndpoint`, `StoreLootboxDetailsEndpoint`, `StoreLootboxDrawEndpoint`, `StoreLootboxListEndpoint`, `StoreLootboxServerDrawEndpoint` |
| Progression (4) | `SetPlayerFactionEndpoint`, `TrackedObjectivesEndpoint`, `Tracker_Endpoint`, `Tracker_Delete_Endpoint` |
| Mailbox (3) | `MailboxQueryTriggerConfigEndpoint`, `MailboxQueryTriggerSurveyEndpoint`, `PatchNotesGetDataEndpoint` |
| Migration (2) | `PlayerDataMigrationCheckStatusEndpoint`, `PlayerDataMigrationTriggerEndpoint` |
| Account and status (3) | `CloneAccountEndpoint`, `IsBannedEndpoint`, `PhoenixAlternativeStatusMessageEndpoint` |

Five more keys exist only in 2.1.1 but are named differently:
`GetPlayerFactionsEndpointClient`, `GetPlayerFactionsEndpointServer`,
`GrantProgressionPurchaseEndPoint`, and the Steam transaction keys `StoreSteamInitializeTxn` and
`StoreSteamFinalizeTxn`.

**Different login.** 1.4.4 predates Epic Online Services. It uses `DefaultPlatformService=Phoenix`
with Epic's older MCP subsystem and accepts `-AUTH_TYPE=password`, `exchangecode` or `developer`.
2.1.1 logs in through EOS (`-AUTH_TYPE=accountportal`). The session-token path segment follows
suit: `/gamesession/epic` in 1.4.4, `/gamesession/epiceos` in 2.1.1.

**Same URL does not mean same shape.** Undaunted's 1.4.4 server and our 2.1.1 reading disagree on
several endpoints:

| Endpoint | 2.1.1 (our static reading) | 1.4.4 (what Undaunted sends) |
|---|---|---|
| `/entitlementsv2` | flat `{"entitlements": []}` | wrapped, `payload: []` |
| `/cooldown/{id}` | flat `{"cooldowns": [...]}` | wrapped |
| `/bounty/{id}` | flat | wrapped, with daily and weekly draft data |
| `/eventstats/`, `/playertreatments/{id}` | wrapped | flat |
| `/progression/objectives/{id}` | payload is an array | payload is `{"objectives", "progress_tracks"}` |
| `/candidate/regions` | fields read as floats; envelope unknown | wrapped, `code` 200, times in seconds |
| Progression track ids | `SLAYER_RANK`, `WEAPONSMITH` | `season09b`, `MasteryTrack_*` |

Some of these are real changes over four years. Others may be shapes the 1.4.4 client tolerates
without parsing. We will only know by reading the 1.4.4 deserialisers, which we have not done yet.

**Letter case.** Undaunted sends 1.4.4 `sessionToken`, while the 2.1.1 reader asks for
`sessiontoken`. Unreal's `FJsonObject` keeps its fields in a `TMap<FString, ...>`, and `FString`
keys normally compare without regard to case, so case differences like this should not matter.
That is standard engine behaviour; we have not tested it on either build. Spelling does matter
(`confirmed_fremium_rank`).

---

## Open questions

- Whether `GET /candidate/status` is wrapped in 2.1.1.
- Whether `GET /pjm` is wrapped (our static reading says yes; our server says no).
- The payload fields of `mailbox-prod/all/` and anything about `/survey/config`.
- 2.1.1's `UProgressionComponent` needs four readiness flags before it reports done, and we found
  no code that ever sets one of them (`+0x3f3`). If it really has no setter, progression can never
  finish in our standalone boot, whatever the backend sends.
- Whether the load-failure telemetry timer has a non-zero rate.
- The 1.4.4 deserialisers themselves. Every 1.4.4 shape on this page comes from Undaunted's
  server, not from the 1.4.4 binary.
