// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateLocks,verifyRecipe,sourceEnvironment} from './recipe.mjs';
const proton=JSON.parse(fs.readFileSync(new URL('./proton.lock.json',import.meta.url)));
const patches=JSON.parse(fs.readFileSync(new URL('./runtime-patches.lock.json',import.meta.url)));
test('exact Experimental source and patch checksums',async()=>{await verifyRecipe();});
for(const [name,mutate] of [
  ['moving Proton reference',p=>p.proton.commit='experimental_11.0'],
  ['moving SDK tag',p=>p.sdk='registry.gitlab.steamos.cloud/proton/steamrt4/sdk/x86_64:latest'],
  ['mismatched Wine',p=>p.modules.wine='a'.repeat(40)],
  ['nonexperimental channel',p=>p.channel='stable'],
])test('reject '+name,()=>{const p=structuredClone(proton);mutate(p);assert.throws(()=>validateLocks(p,patches));});
for(const file of ['../secret.patch','assets/../../secret.patch','/tmp/a.patch'])test('reject unsafe patch '+file,()=>{const p=structuredClone(patches);p.patches[0].file=file;assert.throws(()=>validateLocks(proton,p));});
test('reject duplicate patch',()=>{const p=structuredClone(patches);p.patches.push(p.patches[0]);assert.throws(()=>validateLocks(proton,p));});
test('source builds cannot inherit account/prefix/library environment',()=>{
  const env=sourceEnvironment({PATH:'/usr/bin',WINEPREFIX:'/real',WINEDLLPATH:'/old',XODUS_SOCKET:'private',XODUS_BRIDGE_KEY:'private',SteamGameId:'1',LD_PRELOAD:'bad'});
  assert.deepEqual(env,{PATH:'/usr/bin',GIT_TERMINAL_PROMPT:'0'});
});

