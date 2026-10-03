import { Client, Events, GatewayIntentBits, MessageFlags, REST } from 'discord.js';
import { resolve } from 'node:path';
import { backend, Keys, loadState, saveState } from './keys.mjs';
import { loadInviteConfig, inviteMessage } from './invite.mjs';
import { syncKeyCommands } from './commands.mjs';
import { keyInstructions } from './link-input.mjs';

const token = process.env.DISCORD_BOT_TOKEN;
const adminKey = process.env.METAGAME_ADMIN_KEY;
if (!token || !adminKey) throw new Error('Configure DISCORD_BOT_TOKEN and METAGAME_ADMIN_KEY');
const stateFile = resolve(process.env.KEY_STATE_FILE || './data/keys.json');
const inviteConfig = await loadInviteConfig(process.env.SERVER_CONFIG_FILE);
const keys = new Keys(await loadState(stateFile), state => saveState(stateFile, state), backend(process.env.METAGAME_URL || 'http://127.0.0.1:61000', adminKey));
await keys.migrateLinks();

const client = new Client({intents: [GatewayIntentBits.Guilds]});
const rest = new REST({version: '10'}).setToken(token);

client.once(Events.ClientReady, async () => {
  try {
    const guilds = process.env.DISCORD_GUILD_ID ? [process.env.DISCORD_GUILD_ID] : [...client.guilds.cache.keys()];
    const changed = await syncKeyCommands(rest, client.application.id, guilds);
    console.log(`Key command registration: ${changed} scopes updated`);
    console.log('Revived key bot ready');
  } catch { console.error('Could not register /key'); await client.destroy(); process.exitCode = 1; }
});
const active = new Set();
const cooldown = new Map();
setInterval(() => { const now = Date.now(); for (const [id, until] of cooldown) if (until <= now) cooldown.delete(id); }, 60000).unref();
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'key') return;
  const id = interaction.user.id;
  try {
    await interaction.deferReply({flags: MessageFlags.Ephemeral});
    if (process.env.DISCORD_GUILD_ID && interaction.guildId && interaction.guildId !== process.env.DISCORD_GUILD_ID) {
      await interaction.editReply('Use this command in the Revived server or in a DM with me.'); return;
    }
    if (active.has(id) || Date.now() < (cooldown.get(id) || 0)) {
      await interaction.editReply('Your key request is being handled. Try again in a few seconds.'); return;
    }
    active.add(id); cooldown.set(id, Date.now() + 10000);
    try {
      const subcommand = interaction.options.getSubcommand();
      const claim = subcommand === 'claim';
      const result = subcommand === 'link'
        ? await keys.link(id, interaction.options.getString('key', true).trim())
        : await keys.run(id, claim);
      if (result.status === 'ready' && claim) {
        try {
          await interaction.user.send({content: inviteMessage(inviteConfig, result.code), allowedMentions: {parse: []}});
          await interaction.editReply('🔑 **Invite Sent**\nCheck your DMs. Paste the complete invite into the launcher’s Join box.\n**Clear skies, Slayer.**');
        } catch { await interaction.editReply('I could not DM you. Enable direct messages, then run `/key claim` again. Your code is saved.'); }
      } else {
        const messages = {
          linked: '🔑 **Key Accepted**\nYour Discord has been linked to your existing Revived account. Keep using the same launcher key—nothing to replace.\n**Clear skies, Slayer.**',
          invite_not_key: `🔑 **Use Your Saved Account Key**\nThat is a Join invite or registration code. It cannot identify your existing account.\n\n${keyInstructions}\n\nIf you have not registered yet, paste the complete invite into the launcher’s Join screen first.`,
          invalid_key_format: `🔑 **Copy Your Saved Account Key**\n${keyInstructions}`,
          invalid_key: `🔑 **Account Key Not Recognized**\nThis server did not recognize that account key.\n\n${keyInstructions}\n\nIf the saved key still fails, contact the server team with your launcher username and this message, not your key.`,
          discord_already_linked: 'Your Discord is already linked to another account. Contact the server team to change it.',
          account_already_linked: 'This account is already linked to another Discord. Contact the server team to change it.',
          ready: '🔑 **Key Ready**\nYour code has not been redeemed. Run `/key claim` to receive it by DM.',
          redeemed: '🔑 **Key Accepted**\nYour Revived code has been redeemed successfully.\n**Clear skies, Slayer.**',
          none: '🔑 **No Key Yet**\nRun `/key claim` and I will send your code by DM.',
          pending: 'Your code is being prepared. Try `/key claim` again shortly.',
          revoked: 'Your code is unavailable. Contact the server team.',
        };
        await interaction.editReply(messages[result.status]);
      }
    } finally { active.delete(id); }
  } catch {
    console.error('Key interaction failed'); // Never log tokens, codes or Discord payloads.
    if (interaction.deferred) await interaction.editReply('The key service is unavailable. Please try again shortly.').catch(() => {});
  }
});
client.on(Events.Error, () => console.error('Discord connection error'));
process.on('SIGINT', () => client.destroy());
process.on('SIGTERM', () => client.destroy());
await client.login(token).catch(() => { console.error('Discord login failed'); process.exitCode = 1; });
