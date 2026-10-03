---
title: OpenBSD server
parent: Setup
nav_order: 8
description: "Run the Dauntless Revived control plane natively on OpenBSD 7.9 with PF and rc.d, using a separate Linux Proton/Wine game worker."
lang: en
ref: setup/openbsd-server
---

{% assign linux_server = site.pages | where: "path", "setup/linux-server.md" | first %}
{% assign trouble_page = site.pages | where: "path", "setup/troubleshooting.md" | first %}

# OpenBSD server
{: .no_toc }

The OpenBSD port runs the **control plane natively on OpenBSD** and sends the actual Dauntless game
processes to a separate Linux Proton/Wine worker.

This is a separate port. It does not modify or depend on `deploy/windows-server/`.

<details open markdown="block">
  <summary>Contents</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

## Why two machines?

The metagame, deploy server, content server, TLS gateway and SQLite database are portable Node.js
services and run on OpenBSD.

The Ramsgate/hunt server is not a native server binary: it is the original **Windows x86_64
Dauntless 1.4.4 client executable** started with `-server -nullrhi` and the pinned server DLL.
This OpenBSD port therefore treats game execution as a Linux-worker responsibility instead of trying
to make the Windows process part of the OpenBSD base system.

## Architecture

```text
Internet players
      |
      | TCP 443
      v
OpenBSD
+ PF
|  + TCP rdr 443 -> 127.0.0.1:61443
|  + dynamic player table
|  + UDP rdr/NAT -> Linux worker
|
+ Native Node services
   + Gateway
   + Metagame / SQLite
   + Content
   + Deploy
          |
          | restricted SSH command
          v
Linux worker
+ dr-game-worker
+ Proton / Wine
+ Dauntless 1.4.4 Ramsgate / hunts
```

PF source-NATs the forwarded game UDP toward the worker, which keeps the return path symmetric
through the OpenBSD host.

## OpenBSD requirements

- OpenBSD/amd64 7.9
- Node.js 20.19+ and npm
- git
- PF
- one external interface
- one interface/path that reaches the Linux worker
- a dedicated SSH private key for the game worker
- your own exact 1.4.4 game tree on OpenBSD for the content server

The Linux worker also needs its own copy of the game tree.

## 1. Prepare the Linux worker

Follow the worker section of [Linux server]({{ linux_server.url | relative_url }}), or run:

```bash
sudo ./deploy/linux-server/install-worker.sh \
  --game-dir /srv/dauntless/BaseGame144/Dauntless \
  --proton /home/dauntless/.local/share/Steam/compatibilitytools.d/GE-Proton10-1/proton
```

Create a dedicated SSH key on OpenBSD:

```sh
ssh-keygen -t ed25519 -f /root/.ssh/dauntless_worker
```

Add its public key to the Linux worker's `dauntless` account using the
`restrict,command=".../ssh-worker-command.sh"` prefix printed by the worker installer.

The restricted key receives only a bounded base64url JSON argv payload. It does not get a general
remote shell.

## 2. Install OpenBSD prerequisites

```sh
doas pkg_add node git
```

Clone the repo and place the local 1.4.4 game tree somewhere readable by the future `_dauntless`
service account.

## 3. Install the control plane

Example public setup:

```sh
doas ./deploy/openbsd-server/install.ksh \
  --game-dir /srv/dauntless/BaseGame144/Dauntless \
  --my-ip 203.0.113.10 \
  --worker-host 10.0.0.2 \
  --worker-ip 10.0.0.2 \
  --worker-key /root/.ssh/dauntless_worker \
  --interface vio0 \
  --worker-interface vether0 \
  --mode public \
  --configure-pf
```

Replace:

- `vio0` with the public-facing PF interface;
- `vether0` with the interface/path used to reach the Linux worker;
- `10.0.0.2` with the worker address;
- the example public IP with your server's address.

A live install refuses to edit PF unless you explicitly pass `--configure-pf`.

## PF rules

Public mode creates a dedicated `dauntless-revived` PF anchor containing:

- a persistent `<dauntless_revived_players>` table;
- TCP 443 redirect to the unprivileged gateway on `127.0.0.1:61443`;
- UDP 8770-8777 redirect only for addresses in the player table;
- source NAT toward the Linux worker;
- a fail-closed block for all other game UDP.

The gateway reports authenticated player addresses to a loopback-only allowlist helper. The helper
updates only the anchor table through `pfctl`; it does not rebuild your entire PF ruleset on every
login.

The installer validates `/etc/pf.conf` before reloading it. If your existing rules have an earlier
`quick` rule that bypasses the anchor, place the Dauntless anchor appropriately in your own ruleset.

## Gateway privileges

The OpenBSD gateway binds to **127.0.0.1:61443**, not privileged port 443. PF performs the public
443 redirect. The `_dauntless` process therefore does not need privilege merely to accept TLS.

## Service control

The installer creates separate rc.d services:

- `dauntless_metagame`
- `dauntless_deploy`
- `dauntless_content`
- public mode: `dauntless_allowlist`, `dauntless_gateway`

Use:

```sh
doas ./deploy/openbsd-server/stack.ksh status
doas ./deploy/openbsd-server/stack.ksh restart
doas ./deploy/openbsd-server/stack.ksh restart deploy
```

## Create an invite

```sh
doas -u _dauntless node /opt/dauntless-revived/deploy/unix-common/new-invite.mjs \
  --config /etc/dauntless-revived \
  --name FriendName
```

## Validation status

The repository CI boots a real **OpenBSD 7.9** virtual machine for this port. It builds the native
Node services, runs their portable test suites, checks the ksh/rc.d files, migrates a fresh SQLite
database and validates generated PF syntax.

The full two-machine live game test is still the final integration milestone: OpenBSD gateway/PF on
one machine, real Proton/Wine game processes on the Linux worker, and a player completing Ramsgate
plus one hunt.

## Troubleshooting

**Worker SSH starts then immediately exits:** test the dedicated key manually and verify its
`authorized_keys` forced-command prefix. The OpenBSD deploy env uses the fixed
`dr-game-worker` command.

**Gateway works but game UDP never reaches the worker:** check both PF interfaces, IPv4 forwarding,
the worker route, and the generated source-NAT rule.

**PF refuses the generated anchor:** run `pfctl -nf /etc/pf.conf` and inspect any earlier
`quick` rules or naming conflicts before enabling services.

**Content downloads work but game launch fails:** the OpenBSD control plane is healthy; troubleshoot
the Linux worker's Proton/Wine runtime and pinned game tree.

See [Troubleshooting]({{ trouble_page.url | relative_url }}) for shared issues.
