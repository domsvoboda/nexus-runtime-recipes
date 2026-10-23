// SPDX-License-Identifier: MIT
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export const readJson=async file=>JSON.parse(await fs.readFile(file,'utf8'));
export function sourceEnvironment(input=process.env){
  const env={...input};
  for(const key of Object.keys(env))if(/^(?:WINE|WINEDLL|XODUS_|XUSER_|STEAM_COMPAT_|SteamAppId$|SteamGameId$|LD_LIBRARY_PATH$|LD_PRELOAD$|CPATH$|LIBRARY_PATH$)/.test(key))delete env[key];
  env.GIT_TERMINAL_PROMPT='0';
  return env;
}
export function run(command,args,cwd,{capture=false,env=sourceEnvironment(),input,timeout=30*60*1000}={}){
  return execFileSync(command,args,{cwd,env,input,encoding:'utf8',stdio:capture?['pipe','pipe','pipe']:input?['pipe','inherit','inherit']:'inherit',timeout,maxBuffer:32*1024*1024});
}
export function validateLocks(proton,patches){
  if(proton.schema!==1||proton.channel!=='experimental'||patches.schema!==1||patches.status!=='development')throw Error('Only an explicit development Experimental recipe is accepted');
  if(proton.proton?.url!=='https://github.com/ValveSoftware/Proton.git'||!/^[a-f0-9]{40}$/.test(proton.proton.commit))throw Error('Unpinned official Proton');
  if(!/^registry\.gitlab\.steamos\.cloud\/proton\/steamrt4\/sdk\/x86_64@sha256:[a-f0-9]{64}$/.test(proton.sdk))throw Error('SDK must be pinned by digest');
  for(const [name,sha] of Object.entries(proton.modules??{}))if(!/^[a-z0-9-]+$/.test(name)||!/^[a-f0-9]{40}$/.test(sha))throw Error('Invalid module pin');
  for(const [name,s] of Object.entries(patches.sources??{}))if(!/^[a-z0-9-]+$/.test(name)||!/^https:\/\//.test(s.url)||!/^[a-f0-9]{40}$/.test(s.commit))throw Error('Invalid source pin');
  if(proton.modules.wine!==patches.sources.wine.commit||proton.modules.vkd3d!==patches.sources.vkd3d.commit)throw Error('Wine or shader compiler differs from Proton');
  const seen=new Set();
  for(const p of patches.patches){
    if(!/^assets\/(?:upstream\/)?[a-z0-9-]+\.patch$/.test(p.file)||!/^[a-f0-9]{64}$/.test(p.sha256)||seen.has(p.file)||p.repository&&!['vkd3d','proton'].includes(p.repository))throw Error('Unsafe or duplicate patch');
    seen.add(p.file);
  }
}
export async function verifyRecipe(root=project){
  const proton=await readJson(path.join(root,'scripts/proton.lock.json'));
  const patches=await readJson(path.join(root,'scripts/runtime-patches.lock.json'));
  validateLocks(proton,patches);
  for(const p of patches.patches)if(sha256(await fs.readFile(path.join(root,p.file)))!==p.sha256)throw Error('Patch checksum mismatch: '+p.file);
  for(const [file,hash] of Object.entries(patches.runtimeCompatibilitySources??{}))if(!/^scripts\/runtime-compat\/[a-z0-9.-]+$/.test(file)||sha256(await fs.readFile(path.join(root,file)))!==hash)throw Error('Compatibility source mismatch: '+file);
  return {proton,patches};
}
export async function checkout(source,target){
  await fs.mkdir(target,{recursive:false});
  run('git',['init','--quiet'],target);
  run('git',['remote','add','origin',source.url],target);
  run('git',['fetch','--depth','1','--no-tags','origin',source.commit],target);
  run('git',['checkout','--quiet','--detach','FETCH_HEAD'],target);
  if(run('git',['rev-parse','HEAD'],target,{capture:true}).trim()!==source.commit||run('git',['status','--porcelain'],target,{capture:true}).trim())throw Error('Checkout does not match clean pinned source');
}

