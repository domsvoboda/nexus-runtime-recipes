// SPDX-License-Identifier: MIT
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
export const contractNames=Object.freeze(['appstate','appstate-source','appconstrained','appconstrained-source','hlsl-state-keywords','game-relaunch','taskqueue-teardown','taskqueue-contract','taskqueue-close','async-provider-contract','async-completion-lifetime','async-schedule','gamesave-files','gamesave-sync','gamesave-transfer','winrt-json','token-dispatch','user-privilege','store-entitlements','package-content','package-identity','package-legacy','package-chunks','package-monitors','package-progress-bytes','system-device-id','user-device-association','user-audio','playfab-folder','playfab-session','runtime-init-inline','runtime-init-retry','runtime-init-default']);
function successfulChecks(summary){
  if(!Array.isArray(summary)||summary.some(s=>typeof s!=='string'||/^FAIL(?:\s|$)/.test(s)||/\bfailures(?:=| )[1-9][0-9]*/i.test(s)))return false;
  return summary.some(s=>/\bCHECKS [1-9][0-9]*.*\bFAILURES 0(?:\D|$)/.test(s)||/\bchecks=[1-9][0-9]* failures=0(?:\D|$)/.test(s));
}
export function validateResults({contracts,http,media,graphics}){
  if(!Array.isArray(contracts?.results)||contracts.results.length!==contractNames.length)throw Error('Incomplete native contracts');
  const names=contracts.results.map(x=>x.name);
  if(new Set(names).size!==names.length||contractNames.some(n=>!names.includes(n)))throw Error('Wrong or duplicate native contracts');
  for(const result of contracts.results)if(result.code!==0||result.timedOut!==false||!successfulChecks(result.summary))throw Error('Native contract failed: '+result.name);
  if(http?.code!==0||http.timedOut!==false||!successfulChecks(http.summary))throw Error('HTTP validation failed');
  if(media?.h264!==true||media.aac!==true||media.bundledLibraries!==true)throw Error('Media validation failed');
  if(graphics?.code!==0||graphics.timeout!==false||!Array.isArray(graphics.summary)||!graphics.summary.some(s=>/^DXVK COMPUTE CHECKS [1-9][0-9]* FAILURES 0\s*$/.test(s)))throw Error('Graphics validation failed');
}
export function validateBinding(proof,{builtSha256,treeSha256,sourceLockSha256}){
  if(proof?.schema!==1||proof.channel!=='experimental'||proof.realGameTest!==false||proof.stableApproved!==false)throw Error('Wrong validation policy');
  for(const [name,value] of Object.entries({builtSha256,treeSha256,sourceLockSha256}))if(!/^[a-f0-9]{64}$/.test(value)||proof[name]!==value)throw Error('Validation binding mismatch: '+name);
  const expected={contracts:/^runtime-contract-[A-Za-z0-9]+\/results\.json$/,http:/^runtime-http2-[A-Za-z0-9]+\/results\.json$/,media:/^media-tests\/results\.json$/,graphics:/^runtime-dxvk-[A-Za-z0-9]+\/result\.json$/};
  if(!proof.results||Object.keys(proof.results).sort().join(',')!==Object.keys(expected).sort().join(','))throw Error('Missing validation result binding');
  for(const [name,pattern] of Object.entries(expected))if(!pattern.test(proof.results[name]?.path)||!/^[a-f0-9]{64}$/.test(proof.results[name]?.sha256))throw Error('Unsafe result reference: '+name);
}
export async function fileSha256(file){const hash=createHash('sha256');for await(const b of createReadStream(file))hash.update(b);return hash.digest('hex');}
export async function treeSha256(root){
  const digest=createHash('sha256');
  async function visit(dir){
    const entries=(await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
    for(const e of entries){
      const file=path.join(dir,e.name),relative=path.relative(root,file),st=await fs.lstat(file);
      if(e.isDirectory()){digest.update(JSON.stringify(['d',relative,st.mode&0o777])+'\n');await visit(file);}
      else if(e.isSymbolicLink())digest.update(JSON.stringify(['l',relative,await fs.readlink(file)])+'\n');
      else if(e.isFile())digest.update(JSON.stringify(['f',relative,st.mode&0o777,st.size,await fileSha256(file)])+'\n');
      else throw Error('Unsupported runtime tree entry: '+relative);
    }
  }
  await visit(root);return digest.digest('hex');
}
