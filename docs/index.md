---
title: Dauntless Revived
nav_order: 1
permalink: /
description: "Dauntless Revived is a private server revival of Dauntless: the genuine 1.4.4 client on a self-hosted fork of Undaunted. What works and how to set it up."
lang: en
ref: index
# The WebSite structured data comes from _includes/head_custom.html; this stops jekyll-seo-tag adding a second one.
seo:
  type: WebPage
---

{% assign roadmap_page = site.pages | where: "path", "roadmap.md" | first %}
{% assign legal_page = site.pages | where: "path", "legal.md" | first %}

# Dauntless Revived

**Dauntless**, the Phoenix Labs co-op monster-hunting game, lost its official servers on
**30 May 2025**, but it can still be played against a private server. Dauntless Revived is one: a
private, non-commercial preservation revival that runs the genuine **Dauntless 1.4.4** client
(October 2020) against a fork of the open-source [Undaunted](https://github.com/SyST3MDeV/Undaunted)
server by gwog and contributors (AGPL-3.0). It is not a public server: the owner runs it for a few
friends, and anyone with their own copy of the 1.4.4 client can host the same thing from
[the repository]({{ site.github.repository_url }}).

We started out studying the final client, **2.1.1** ("Awakening"). What we learned from both builds
is written up here.

> **Disclaimer.** Dauntless Revived is an unofficial fan project. It is **not affiliated with,
> endorsed by, or supported by Phoenix Labs or Epic Games**. "Dauntless" and related names are
> trademarks of their owners. This site and the repository **contain no game files**: no executables,
> no paks, no assets and no configuration from the game, and no links to downloads. To use anything
> here you need **your own copy** of the Dauntless 1.4.4 client. There is no public server to join.

[Set it up]({{ '/setup/' | relative_url }}){: .btn .btn-primary .mr-2 }
[Read the findings]({{ '/findings/' | relative_url }}){: .btn .mr-2 }
[Reference]({{ '/reference/' | relative_url }}){: .btn .mr-2 }
[Hosting partner · EU Gamehost]({{ '/setup/hosting-partner.html' | relative_url }}){: .btn .mr-2 }
[Join Discord](https://discord.gg/ZJRprHzsgu){: .btn .btn-primary .mr-2 }
[Optional Patreon support](https://patreon.com/DauntlessRevived){: .btn .mr-2 }
[Roadmap]({{ roadmap_page.url | relative_url }}){: .btn }

## Patreons

A huge thank-you to the people supporting Dauntless Revived on Patreon. Support is optional and never provides gameplay advantages.

- **nasagi** — thank you for becoming a Patreon supporter and helping support the project. ❤️

---

## Current status

As of 22 September 2026. Everything in this section is about the **1.4.4** client. The game itself
has so far been played by one person, the owner, alone: first on the host PC, then on 22 September
2026 over the internet on a server on a rented machine. A test with a second player is next.

### What works

| Feature | State | Notes |
|---|---|---|
| Log in with your own account | Works | Each player has an account on our server and logs in with a personal account key. **No Epic account is needed.** The 1.4.4 client has no Epic Online Services login; it predates that integration. It is launched in its exchange-code login mode. The injected DLL points the client's Epic-style account-service call at our metagame, which accepts the player's account key as the exchange code. |
| Tutorial | Works | A new character is matchmade into the tutorial island. That island runs on a game server the deploy server starts on demand. |
| Ramsgate | Works | A permanent Ramsgate server runs next to the backend. After the tutorial, and on every later login, the player goes straight there. |
| Hunt servers | Works (solo) | The deploy server starts one game server per hunt. On our setup, one player has played the tutorial hunt, a normal hunt (a Lesser Boreus) and a pursuit on the host PC, and the new-player pursuit over the internet on the rented server, where three game servers ran at once. Undaunted's history reports 4-player hunts on the same client, but we have **not yet tested** hunts with more than one player. |
| Saved inventory and loadouts | Works (solo); extra-slot UI test pending | Materials, Rams (most likely the `CURRENCY_NOTES` stack), crafted and granted gear, and character data (quest progress, tutorial state, flags, appearance) are stored in SQLite. The backend stores unlocks, the active selection and independent data for all six client loadout slots; only slot 0 has been exercised in the game UI. Hunt loot is saved. The data survives a client restart and a full server restart. |
| Slayer level, mastery and the Hunt Pass | Works (solo), on by default | Real progression: Slayer level, weapon and behemoth mastery and the Hunt Pass start from the beginning (Slayer level 1) and are saved. Every account owns the Elite Hunt Pass, and rank rewards are granted once. Slayer level, weapon mastery and the Hunt Pass were tested in game on a throwaway account, including a full restart. On the rented server on 22 September 2026 the owner's new account reached Slayer level 3 and gained weapon mastery and behemoth mastery (rank 2, the first time behemoth mastery was seen in game), and the game server confirmed the rank rewards. `PROGRESSION_MODE=stub` brings back upstream's fixed level 50. |
| A server on a rented machine | Running | The [Windows server kit]({{ '/setup/windows-server.html' | relative_url }}) was deployed to a rented Windows Server 2019 VPS in public mode on 21–22 September 2026. Checked there: the stack starts at boot as the kit's service account, Ramsgate runs and sends heartbeats, the gateway answers from the internet with the pinned certificate, and the hourly backup runs. Deploying to a real server found three problems the sandbox tests could not, all fixed in the kit: a 48-character limit on the service account's description, a Windows image that refuses password-less scheduled tasks ("S4U") for accounts that are not administrators, and a provider image that kept Windows Firewall off through policy values. In the first real test (22 September 2026) the tutorial island and the Training Dojo were started on demand, three game servers ran at once, and the UDP allowlist opened the game ports for the player and closed them after they left. Several save-version conflicts were refused as designed (older or duplicate full-snapshot saves), and the newest save was kept. |
| Friend launcher | Released | The first release, 0.1.0, was published on [GitHub Releases](https://github.com/mixutin/dauntless-revived/releases/latest) by CI, with `SHA256SUMS.txt` and a build provenance attestation. Installed launchers update themselves. The owner downloaded 0.1.0 from there, registered with an invite on the rented server and downloaded the game (about 11 GB) through the gateway. Version 0.1.1, published by CI the same night, stopped turning off the game's automatic exposure, which had made Ramsgate and night scenes far too dark; with 0.1.1 Ramsgate looks normal, and the dark pre-hunt airship is back ([details]({{ '/setup/troubleshooting.html' | relative_url }}#airship-dark-windows-blown-out)). It is not code-signed yet: on the owner's PC SmartScreen blocked the installer outright, and checking it against `SHA256SUMS.txt` and unblocking it worked ([how]({{ '/setup/friends.html' | relative_url }})). |

The measured cost on the host PC was about 1.1 GB of RAM and roughly 0.2 of a CPU core for the
Ramsgate server, about 0.9 GB per hunt server, and 1.5 to 2.3 GB for the player's own client (the
higher figure at Cinematic settings).

### What does not work yet

- **Playing together over the internet: works with two players.** On the rented server, friends
  join with the launcher and an invite, without Tailscale. On 22 September 2026 the owner went that
  way from the invite to the first hunt, and later that night two players saw each other in Ramsgate
  and hunted together, after queueing the same hunt within a few seconds of each other.
- **Parties, friends and guilds: built, waiting for a test with two players.** In the two-player
  test on 22 September 2026 a party invite reached the other player's game but never showed, and
  Add Friends did nothing. We traced both in the game's code: the server described the wrong player
  when the game asked who sent the invite (`POST /accountinfo/public`), and answered the account
  lookup (`POST /account/mapping`) in a shape the game does not read. Both are fixed, and guilds are
  built too (create, invite, ranks, kick, leave, disband, stored in SQLite). Everything passes our
  tests, which replay the game's own requests, and it has been running on our rented server since 22 September 2026, but nobody has tried it in the game yet. Players must
  restart their game once after the update. You don't have to be friends to invite someone to a
  party. Everyone still shows as offline: showing friends as online (presence over the chat
  connection) is built since 23 September 2026 but off until chat itself is live and two players have
  tried it (roadmap 3.10). **Slayer Links** (the My Links tab) are built and on, not yet tried in the
  game. The details are on [Friends, parties and guilds]({{ '/findings/social.html' | relative_url }}).
- **Text chat.** Built and tested without the game: Ramsgate, hunt, party and guild chat and whispers,
  with usernames, in the metagame itself. It is off by default until two players have tried it on the
  rented server. Use the [Dauntless Revived Discord](https://discord.gg/ZJRprHzsgu) meanwhile. The details are on
  [Text chat]({{ '/findings/chat.html' | relative_url }}).
- **Bounties, cooldowns and escalation.** With real progression, bounties and cooldowns are stored
  per account, but drafting and claiming a bounty in the game and cooldowns across a daily reset have
  not been tried yet. Real Escalation saves are built (from Harmonic's 1.4.4 fork) but off by default,
  because switching them on drops every player from the fake maximum to level 0; until then Escalation
  progress does not carry over between sessions ([Escalation]({{ '/findings/escalation.html' | relative_url }})).
- **The store.** A free store (every offer costs nothing, from Harmonic's fork) is built but off until
  the owner decides whether it stays free and it has been tried in the game
  ([The in-game store]({{ '/findings/store.html' | relative_url }})).
- **The multiple-loadout UI test, the welcome message and mailbox, and seasonal events.** With real
  progression, loadout slot unlocks are stored, but the extra slots have not been tried in the game
  yet.

The [roadmap]({{ roadmap_page.url | relative_url }}) has the order we plan to work in, plus the bugs
we have seen in real sessions. Some things cannot come back. Voice chat ran on Vivox, a paid
third-party service, so use the [Dauntless Revived Discord](https://discord.gg/ZJRprHzsgu) instead. Content released after November 2020 is not in the
1.4.4 build.

---

## Who this is for

- **The owner and a handful of invited friends.** This is a small private group, not a public
  service.
- **People who own the 1.4.4 client and want to run the same thing for their own group.** The
  [Setup]({{ '/setup/' | relative_url }}) section covers the host, the friends' side, and how to
  check that your copy of the game is genuine and unmodified.
- **Anyone curious how Dauntless's online side worked.** The
  [Findings]({{ '/findings/' | relative_url }}) section records the backend contract, how
  Undaunted's server-mode DLL works, and what we learned from the 2.1.1 client. We say which build
  each fact comes from, and we mark anything unverified.
- **Self-hosters and developers who need the exact facts.** The
  [Reference]({{ '/reference/' | relative_url }}) section lists every setting, port, HTTP route, file
  and script, with its default and who sets it, checked against the code.

---

## How it fits together (1.4.4)

| Part | What it is | Where it runs |
|---|---|---|
| Client | The unmodified Dauntless 1.4.4 executable plus two DLLs from Undaunted placed next to it: a `dxgi.dll` proxy that loads `UndauntedInternalServer.dll`, which redirects the client's backend calls to the metagame over plain HTTP | Each player's PC |
| Metagame | Undaunted's TypeScript backend: accounts, characters, inventory, loadouts, matchmaking | Host PC, TCP 61000 |
| Deploy server | Starts and supervises the game-server processes | Host PC, TCP 61001, loopback only (it has no authentication) |
| Game servers | More copies of the same client executable, switched into server mode by the DLL: one permanent Ramsgate server, plus one per hunt | Host PC, UDP 8770 to 8777 |

A server installed with the Windows server kit also runs a content server for the launcher's
downloads and, in public mode, a TLS gateway as its only public port. Every part is described in the
[Reference]({{ '/reference/' | relative_url }}) section.

Our changes to Undaunted started small and practical. Both services now bind to loopback by
default. A port clash is now a hard error, where it used to be a silent exit. Every request is
logged. The Training Dojo starts only when it is needed. Progression is real by default, where
upstream answered with a fixed template and saved nothing. Saves are safer: a repeated inventory
transaction is applied once, and save history can be rolled back. Since then we have added
usernames and invite codes, a permission check on every route, parties, a friends list and guilds on
the server side, the content server, the public-mode gateway, a friend launcher built on Undaunted's, and
the Windows server kit. The launcher, the in-game welcome text and the server's messages say
Dauntless Revived; folders, the server DLL's file name, API routes and headers keep the Undaunted
names for now. The
[README]({{ site.github.repository_url }}/blob/dauntless-revived/README.md#changes-from-upstream)
lists every change, and the [roadmap]({{ roadmap_page.url | relative_url }}) what comes next.

---

## How we got here

We started with the final **2.1.1** client and wrote our own backend from scratch. That work
established that the game talks to Phoenix Labs' own REST API on `steelyard.ca` hosts (not PlayFab,
as earlier community notes assumed). It solved the whole 2.1.1 login chain. By injecting user
config, it even got Ramsgate to render. It never got a controllable player in the city.

**A correction.** We first concluded that multiplayer was impossible, because both retail builds
(2.1.1 and 1.4.4) are client-only: `UWorld::Listen` is stubbed out and the net mode is forced to
"client". That conclusion
was **wrong**. Only the entry point is stripped. The network layer underneath (`UIpNetDriver::InitListen`
and the server-side join and login handlers) is intact. An injected DLL can drive it, and that is
exactly how Undaunted runs multiplayer Ramsgate and hunts on the 1.4.4 client. Once we understood
that, we switched to 1.4.4 and forked Undaunted.

---

## Credits

This project stands on **Undaunted** by gwog (Gregory Morford) and its contributors. The server-mode
DLL, the deploy server, the metagame and the launcher are theirs. The fork remains AGPL-3.0-only, and
its full source is in [this site's repository]({{ site.github.repository_url }}). See
[Credits and license]({{ legal_page.url | relative_url }}) for the full credits, what the AGPL asks
of anyone who hosts a modified version, and the notes on trademarks and game files.
