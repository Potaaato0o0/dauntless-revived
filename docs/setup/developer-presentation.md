# Developer presentation and monitoring

The owner dashboard searches all accounts through the backend, with paginated results.
`DEVELOPER_ACCOUNT_IDS` is a comma-separated list of immutable account IDs. It controls
only the dashboard developer badge; it never grants administrator permissions.

The initial client presentation in launcher 0.1.31 identifies TFBT and TFBTA by the
existing nameplate model or authenticated chat sender metadata. It adds a purple
`[ Server Developer ]` title and requests the existing font's Bold face. Chat lines
from those senders receive the purple prefix; message contents cannot grant a badge.
Account names, chat routing, permissions, guild membership and progression are unchanged.
This is cosmetic, not a proof of authorization. Name changes require updating the
client roster. The exact gothic font and white brackets are not implemented in-game:
retail widgets are plain TextBlocks. Native compilation is verified; an actual client
visual check is still needed before describing the appearance as visually verified.

Worker monitoring keeps a successful sample for at most 30 seconds while retrying
missed polls. A failed poll is `delayed`, not evidence the game server stopped.
Requests allow eight seconds, polls do not overlap, and stale samples never count
in fleet totals after the freshness window. Worker service probes have the same
bounded timeout. Existing private loopback SSH tunnels remain the transport; no
monitor endpoint is made public. Process telemetry has its own 150-second expiry.
