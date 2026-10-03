import { Routes, SlashCommandBuilder } from 'discord.js';

export const keyCommand = new SlashCommandBuilder().setName('key').setDescription('Your Dauntless Revived access code')
  .setContexts(0, 1)
  .addSubcommand(option => option.setName('claim').setDescription('Receive a complete launcher invite by direct message'))
  .addSubcommand(option => option.setName('status').setDescription('Check your account link or code redemption'))
  .addSubcommand(option => option.setName('link').setDescription('Link your existing account using its saved account key, not a Join invite')
    .addStringOption(value => value.setName('key').setDescription('Settings > Save a backup of your key > copy the Key: value (not your Join invite)').setRequired(true).setMinLength(8).setMaxLength(2048)))
  .toJSON();

function optionShape(option) {
  return {type:option.type, name:option.name, description:option.description,
    required:option.required ?? false, min_length:option.min_length ?? null, max_length:option.max_length ?? null,
    options:(option.options ?? []).map(optionShape)};
}
function shape(command, guild) {
  return {...optionShape(command), type:command.type ?? 1,
    contexts:guild ? [] : [...(command.contexts ?? [])].sort()};
}

// Preserve command IDs and other commands. Avoid POST on every restart: clients cache versions.
export async function syncKeyCommands(rest, applicationId, guildIds = []) {
  const scopes = [{route:Routes.applicationCommands(applicationId), guild:false},
    ...[...new Set(guildIds)].map(id=>({route:Routes.applicationGuildCommands(applicationId,id),guild:true}))];
  let changed = 0;
  for (const {route,guild} of scopes) {
    const body = {...keyCommand};
    if (guild) delete body.contexts;
    const existing = (await rest.get(route)).find(command=>command.name==='key' && command.type===1);
    if (existing && JSON.stringify(shape(existing,guild))===JSON.stringify(shape(body,guild))) continue;
    if (existing) await rest.patch(`${route}/${existing.id}`,{body});
    else await rest.post(route,{body});
    changed++;
  }
  return changed;
}
