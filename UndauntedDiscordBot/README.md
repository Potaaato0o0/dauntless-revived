# Discord key distribution

Run alongside the metagame with Node 22.12 or later. Copy `.env.example` to `.env`, set the Discord bot token and a metagame admin key, then run `npm ci` and `npm start`. Keep `.env` and the state directory private and outside Git. Back up the state with the game database; a corrupt state file stops issuance rather than starting over.

The bot registers `/key claim` and `/key status` without replacing its other commands. Invite the bot with the `bot` and `applications.commands` scopes. It needs no message-content intent. Commands work in the server and in bot DMs. Codes are sent only by DM; command acknowledgements are private.

`/key claim` DMs a complete `dauntless-revived://join?...` **launcher invite** containing a single-use registration code. Paste the entire invite into **Join**, then choose a username on **Register**. The launcher receives and saves the actual account login key after registration. A bare `DR-...` code is not a server invite or an account key. A retry resends the same unused invite, including after a DM failure; redeemed or revoked codes are never replaced automatically.

Set `SERVER_CONFIG_FILE` to the installed public server's private `server.json` (normally `C:/DauntlessRevived/data/config/server.json`). The bot reads `PublicHost`, `Ports.gateway`, `CertFingerprint`, and `ServerName` to build the same v2 invite as the dashboard. Restart the bot after a host or certificate change. Always point invites at the main TLS gateway: overflow hunts are selected by the backend, not by sending users a second server invite. The current bot invite builder requires a public gateway; a Tailscale-only installation should use its kit-generated private invites.

New registration codes use hexadecimal randomness, because the launcher accepts letters, digits and hyphens only. Existing unused codes from earlier versions containing `_` need an operator repair before they can be placed in an invite. Back up the bot state and database together, pause bot issuance during repair, and never rotate an existing account's login key. Users who already received a bare code can run `/key claim` again to receive its complete invite.

The bot's admin key is sent only to loopback HTTP. Configure `KEY_STATE_FILE` outside the application directory on deployments so code updates do not erase claims. Run one instance, with filesystem permissions limited to its service account and administrators. Never paste a bot token into `.gitignore`; ignore the file containing it.
# Link an existing launcher account

Run `/key link key:<your launcher account key>`. The bot verifies that key against
the central account service and replies ephemerally, visible only to the caller.
The metagame database stores the Discord ID, account UID and link time; it never
stores or echoes the submitted launcher key. Existing keys and saves are unchanged.
Verified links from the earlier bot state migrate automatically at startup.
`/key status` reads the central database to confirm the account link.
An account and Discord ID can each have only one link; conflicting changes require
the server team. Registration invite codes cannot be used as launcher account keys.

Older `dauntless-revived://join?...` links are registration invites, not account credentials.
For an already registered account, use **Launcher → Settings → Save a backup of your key…**, open
the saved file, and copy the value after `Key:` into `/key link key:`. The bot also
accepts a labelled backup or a key wrapped in Discord backticks. It never links an
account by display name or by a shared/redeemed invite, and never replaces its key.

Registration synchronizes `/key` globally (for DMs) and in the configured guild, or
the bot's joined guilds when `DISCORD_GUILD_ID` is unset. Unchanged definitions are
not rewritten; changed definitions preserve the existing command ID. Guild commands
make updates available immediately. If Discord still shows **command is outdated**,
close the command picker, reload Discord, and select Revived Warden's `/key link`
again. This is a cached command-definition error, not an account-key rejection.
