// SPDX-License-Identifier: MIT
import fs from 'node:fs/promises';
import path from 'node:path';
import {project,run,readJson,verifyRecipe,sha256} from './recipe.mjs';
import {validateResults,validateBinding,fileSha256,treeSha256} from './validation-policy.mjs';
const [outputArg]=process.argv.slice(2);
if(!outputArg||process.argv.length!==3)throw Error('Usage: validate-candidate.mjs BUILD_OUTPUT');
const output=await fs.realpath(outputArg),builtFile=path.join(output,'built.json'),built=await readJson(builtFile);
await verifyRecipe();
if(path.dirname(built.runtime)!==output||built.metadata.status!=='experimental')throw Error('Not an isolated Experimental candidate');
const proofFile=path.join(output,'validation.json');
try{await fs.access(proofFile);throw Error('Validation already exists');}catch(e){if(e.code!=='ENOENT')throw e;}
const binding={builtSha256:await fileSha256(builtFile),treeSha256:await treeSha256(built.runtime),sourceLockSha256:sha256(await fs.readFile(path.join(project,'scripts/runtime-patches.lock.json')))};
if(built.metadata.sourceLockSha256!==binding.sourceLockSha256)throw Error('Build recipe changed');
const results={},values={};
for(const [name,script,prefix,result,args] of [
  ['contracts','run-contract-probes.mjs','runtime-contract-','results.json',[built.runtime,path.join(built.prepared,'tests'),built.prepared]],
  ['http','run-http2-suite.mjs','runtime-http2-','results.json',[built.runtime,built.prepared]],
  ['media','run-media-suite.mjs','media-tests','results.json',[built.runtime,path.join(built.prepared,'media-tests')]],
  ['graphics','run-dxvk-suite.mjs','runtime-dxvk-','result.json',[built.runtime,built.prepared]],
]){
  const before=new Set(await fs.readdir(built.prepared));
  if(name==='media'&&before.has(prefix))throw Error('Refusing stale media results');
  run(process.execPath,[path.join(project,'scripts/runtime-tests',script),...args],project);
  const fresh=(await fs.readdir(built.prepared)).filter(n=>!before.has(n)&&n.startsWith(prefix));
  if(fresh.length!==1)throw Error('Expected exactly one new result directory: '+name);
  const relative=path.join(fresh[0],result),file=path.join(built.prepared,relative);
  results[name]={path:relative,sha256:await fileSha256(file)};values[name]=await readJson(file);
}
validateResults(values);
if(await treeSha256(built.runtime)!==binding.treeSha256||await fileSha256(builtFile)!==binding.builtSha256)throw Error('Candidate changed during native validation');
const proof={schema:1,channel:'experimental',realGameTest:false,stableApproved:false,...binding,results};
validateBinding(proof,binding);
await fs.writeFile(proofFile,JSON.stringify(proof,null,2)+'\n',{flag:'wx'});
console.log('Native validation bound to the exact Experimental runtime bytes. No game or stable approval.');
