# OpenBSD server port

This is a separate OpenBSD deployment port for Dauntless Revived. It does not modify or replace the
Windows Server kit.

## What runs on OpenBSD

The control plane runs natively on OpenBSD:

- UndauntedMetagame
- UndauntedDeployServer
- UndauntedContent
- UndauntedGateway
- SQLite progression/account database
- TLS certificate and invites
- PF-backed dynamic game-port allowlist
- rc.d service supervision

The actual Dauntless 1.4.4 game server process cannot currently run natively on OpenBSD. The game is
a proprietary Windows x86_64 UE4 executable, and OpenBSD 7.9 does not ship Wine. The OpenBSD port
therefore uses a **separate Linux/Proton-or-Wine game worker**.

## Network layout

```text
Players
   |
   | TCP 443
   v
OpenBSD control plane
   |  PF rdr -> 127.0.0.1:61443 -> UndauntedGateway
   |
   | authenticated player IP added to PF table
   |
   | UDP 8770-8777
   v
PF rdr + source NAT
   |
   v
Linux game worker
   |
   +-- Ramsgate / Dojo / hunts under Proton or Wine
```

The OpenBSD deploy server starts each game process through a long-running batch SSH command. The
local SSH process remains the deploy server's process handle, so its lifetime tracks the remote game
worker command.

Only one encoded argv payload crosses the SSH boundary. The Linux worker validates it and runs the
pinned game executable; no server argument is evaluated by a shell.

## Requirements

OpenBSD control plane:

- OpenBSD/amd64 7.9
- Node.js 20.19+ (OpenBSD 7.9 packages provide Node 22)
- npm
- git for source/update workflows
- PF enabled
- an external/public interface and an interface that reaches the Linux worker
- an SSH private key dedicated to the game worker

Linux worker:

- x86_64 Linux
- the exact Dauntless 1.4.4 game tree
- Proton/GE-Proton or 64-bit Wine
- Node.js 20.19+
- `xvfb-run` for headless operation unless a display is supplied
- a dedicated unprivileged `dauntless` user

## Prepare the Linux worker

Copy/clone this repository to the worker, then:

```sh
sudo ./deploy/linux-server/install-worker.sh \
  --game-dir /srv/dauntless/BaseGame144/Dauntless \
  --proton /home/dauntless/.local/share/Steam/compatibilitytools.d/GE-Proton10-1/proton
```

Create a dedicated SSH key on the OpenBSD host. Put the public key in the worker user's
`~/.ssh/authorized_keys` with the forced-command prefix printed by `install-worker.sh`. Do not
give this key sudo access.

The OpenBSD host must be able to reach the worker IP, and the worker's response path for game UDP
must go back through the OpenBSD host. The generated PF rule applies source NAT on the worker-facing
interface to enforce that symmetric path.

## Install the OpenBSD control plane

Example public deployment:

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

`--configure-pf` is deliberately explicit. A live service install refuses to modify PF unless you
ask for it. The installer writes a dedicated `dauntless-revived` PF anchor and validates
`/etc/pf.conf` before reloading it.

For a custom firewall with earlier `quick` rules, inspect/move the anchor so Dauntless traffic
reaches it.

The OpenBSD gateway itself binds unprivileged on loopback TCP 61443. PF redirects external TCP 443
to it, so the `_dauntless` account never needs privilege to bind a low port.

## PF behavior

Public mode creates:

- table `<dauntless_revived_players>`;
- TCP 443 redirect to loopback 61443;
- UDP 8770-8777 redirect only for IPs in the dynamic player table;
- source NAT toward the Linux worker;
- a fail-closed block for all other game UDP.

The gateway reports authenticated player IPs to the loopback-only allowlist helper. That helper
updates only the anchor's table with `pfctl`; it never rewrites the whole PF ruleset per login.

## Service control

```sh
doas ./deploy/openbsd-server/stack.ksh status
doas ./deploy/openbsd-server/stack.ksh restart
doas ./deploy/openbsd-server/stack.ksh restart deploy
```

The install creates separate rc.d services for metagame, deploy, content, allowlist and gateway.

## Create an invite

```sh
doas -u _dauntless node /opt/dauntless-revived/deploy/unix-common/new-invite.mjs \
  --config /etc/dauntless-revived \
  --name FriendName
```

## Validation status

The port has Linux-side unit/config tests for the SSH payload and PF generation, and CI boots a real
OpenBSD 7.9 VM to build/test the native Node packages, parse the rc.d/ksh scripts, migrate a fresh
SQLite database and parse the generated PF rules.

A full two-machine live game session is still the final integration milestone: OpenBSD gateway and
PF on one machine, real Proton/Wine Ramsgate/hunt processes on the Linux worker, and a player joining
from the internet.
