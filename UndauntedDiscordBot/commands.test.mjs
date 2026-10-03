import assert from 'node:assert/strict';
import { test } from 'node:test';
import { keyCommand, syncKeyCommands } from './commands.mjs';

test('unchanged global and guild commands preserve versions across restarts', async()=>{
  const rest={get:async route=>[{...keyCommand,id:'existing',version:'cached-version',type:1,application_id:'app',
    contexts:route.includes('/guilds/') ? undefined : [1,0],name_localizations:null}],
    post:async()=>assert.fail('unchanged command must not be posted'),patch:async()=>assert.fail('unchanged command must not be patched')};
  assert.equal(await syncKeyCommands(rest,'app',['guild','guild']),0);
  assert.equal(await syncKeyCommands(rest,'app',['guild']),0);
});

test('outdated key command is patched in place, absent guild command created, unrelated commands preserved',async()=>{
  const calls=[];
  const rest={get:async route=>route.includes('/guilds/') ? [{type:1,name:'other',id:'other'}] :
    [{...keyCommand,type:1,id:'keep-this-id',options:keyCommand.options.slice(0,2)}],
    patch:async(route,{body})=>calls.push({method:'patch',route,body}),
    post:async(route,{body})=>calls.push({method:'post',route,body})};
  assert.equal(await syncKeyCommands(rest,'app',['guild']),2);
  assert.ok(calls[0].route.endsWith('/keep-this-id'));
  assert.equal(calls[0].body.options.at(-1).name,'link');
  assert.equal(calls[1].body.contexts,undefined);
  assert.equal(calls[1].body.name,'key');
});
