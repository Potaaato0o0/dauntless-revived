---
title: Findings
nav_order: 4
has_children: true
has_toc: false
description: "What we learned about how the online side of Dauntless worked, from the 1.4.4 and 2.1.1 clients: backend contract, client internals, multiplayer and crashes."
lang: en
ref: findings/index
---

{% assign verification_page = site.pages | where: "path", "findings/verification.md" | first %}
{% assign assets_page = site.pages | where: "path", "findings/assets.md" | first %}
{% assign contract_page = site.pages | where: "path", "findings/backend-contract.md" | first %}
{% assign rev_page = site.pages | where: "path", "findings/json-reversing.md" | first %}
{% assign internals_page = site.pages | where: "path", "findings/client-internals.md" | first %}
{% assign mp_page = site.pages | where: "path", "findings/multiplayer.md" | first %}
{% assign crashes_page = site.pages | where: "path", "findings/crashes.md" | first %}
{% assign awakening_page = site.pages | where: "path", "findings/awakening-2-1-1.md" | first %}
{% assign social_page = site.pages | where: "path", "findings/social.md" | first %}
{% assign chat_page = site.pages | where: "path", "findings/chat.md" | first %}
{% assign store_page = site.pages | where: "path", "findings/store.md" | first %}
{% assign escalation_page = site.pages | where: "path", "findings/escalation.md" | first %}
{% assign harmonic_page = site.pages | where: "path", "findings/harmonic-fork.md" | first %}
{% assign tools_page = site.pages | where: "path", "tools.md" | first %}

# Findings

This section records what we learned about how Dauntless's online side worked, from two client
builds. We started on the final client and later moved to an older one that Undaunted supports.
Every page says which build a fact is about, and marks anything we have not verified.

| Build | Released | Engine and packaging | Our use |
|---|---|---|---|
| **2.1.1** ("Awakening") | December 2024, the final release | UE5, IoStore containers | Where most of the reverse engineering was done: the backend contract, the login chain, crash forensics |
| **1.4.4** | October 2020 | UE4, pak v9 | The build we run, with Undaunted |

This site and the repository contain no game files. The pages quote endpoint URL templates, field names, function names,
addresses and short snippets, and only as much as each explanation needs.

## Pages

| Page | Build | What it covers |
|---|---|---|
| [Verifying game files]({{ verification_page.url | relative_url }}) | Both | How we checked that community-archived copies are genuine, complete and clean before running anything. |
| [Game assets and config]({{ assets_page.url | relative_url }}) | Both | How each build stores content and cooked config, how to read it, which map paths matter, and what a user config file can override. |
| [Backend contract]({{ contract_page.url | relative_url }}) | Mostly 2.1.1 | Phoenix Labs' REST services on `steelyard.ca` hosts (not PlayFab): hosts, envelope rules and the response shapes we pinned down. |
| [Reading the JSON contract from the binary]({{ rev_page.url | relative_url }}) | 2.1.1 | The method for recovering field names, types and envelopes from the client's code, including the mistakes we made. |
| [Client internals]({{ internals_page.url | relative_url }}) | 2.1.1, checked on 1.4.4 where it matters | What the shipped executable can and cannot do: launch switches, logging, the hang detector, and why it is a client-only build. |
| [How multiplayer works]({{ mp_page.url | relative_url }}) | 1.4.4 | How Undaunted turns extra copies of the client into game servers by driving the intact network layer from an injected DLL. |
| [Crash forensics]({{ crashes_page.url | relative_url }}) | Mostly 2.1.1 | Turning crash reports into instruction addresses, and what each crash we hit turned out to be. |
| [The 2.1.1 standalone attempt]({{ awakening_page.url | relative_url }}) | 2.1.1 | How far a solo boot into Ramsgate got, where it stopped (no controllable player), and where to continue. |
| [Friends, parties and guilds]({{ social_page.url | relative_url }}) | 1.4.4 | How the client finds other players, the exact replies friends, parties and guilds need, why the first two-player test showed nothing, and what is still unconfirmed. |
| [Text chat]({{ chat_page.url | relative_url }}) | 1.4.4 | How the client's text chat works on our server, why the first chat server showed UID-... instead of names, the nickname check, the rooms and who may join them. |
| [The in-game store]({{ store_page.url | relative_url }}) | 1.4.4 | How the store screen lists and buys an offer, and the free store built from Harmonic's fork: the purchase token, the catalogue and its tabs, stacked and instanced grants, and which character gets the item. |
| [Escalation]({{ escalation_page.url | relative_url }}) | 1.4.4 | How Escalation progress is saved, the season registry read from the client, the rules every save must pass, and what players see when real saves are switched on. |
| [The Harmonic port]({{ harmonic_page.url | relative_url }}) | 1.4.4 | What we took from Harmonic's 1.4.4 fork and what we kept of our own, feature by feature, with the reason for every choice. |

The scripts used for most of the static analysis are described on
[Tools]({{ tools_page.url | relative_url }}).

## A correction

We once concluded that multiplayer was impossible, because both retail builds are client-only: the
server entry points are compiled out. That conclusion was wrong. The network layer beneath those
entry points is intact, and an injected DLL can drive it, which is how Undaunted hosts Ramsgate and
hunts on 1.4.4. [How multiplayer works]({{ mp_page.url | relative_url }}) explains the details.
