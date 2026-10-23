// SPDX-License-Identifier: MIT
import fs from 'node:fs/promises';
import path from 'node:path';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {project,run,readJson,verifyRecipe} from './recipe.mjs';
import {validateResults,validateBinding,fileSha256,treeSha256} from './validation-policy.mjs';
const [outputArg]=process.argv.slice(2);
if(!outputArg||process.argv.length!==3)throw Error('Usage: package-candidate.mjs BUILD_OUTPUT');
const output=await fs.realpath(outputArg),built=await readJson(path.join(output,'built.json'));
const recipe=await verifyRecipe();
if(built.metadata.status!=='experimental'||!/^nexus-runtime-11\.0-experimental-g[a-f0-9]{8}$/.test(built.name))throw Error('Unexpected candidate');
if(path.dirname(built.runtime)!==output||path.basename(built.runtime)!==built.name||JSON.stringify(built.proton)!==JSON.stringify(recipe.proton))throw Error('Candidate source or output mismatch');
const validation=await readJson(path.join(output,'validation.json'));
validateBinding(validation,{builtSha256:await fileSha256(path.join(output,'built.json')),treeSha256:await treeSha256(built.runtime),sourceLockSha256:await fileSha256(path.join(project,'scripts/runtime-patches.lock.json'))});
const values={};
for(const [name,item] of Object.entries(validation.results)){
  const file=path.join(built.prepared,item.path);
  if(await fileSha256(file)!==item.sha256)throw Error('Validation results changed: '+name);
  values[name]=await readJson(file);
}
validateResults(values);
const binary=`${built.name}-x86_64.tar.xz`,source=`${built.name}-source.tar.xz`;
run('tar',['-cJf',path.join(output,binary),'-C',output,built.name],project);
run('tar',['--exclude=.git','-cJf',path.join(output,source),'-C',built.prepared,'proton','nghttp2-src','prepared.json','-C',built.aux,'auxiliary.json','media/ffmpeg-4.4.8.tar.xz','media/media-manifest.json','-C',project,'LICENSE','NOTICE','README.md','package.json','assets','scripts','.github'],project);
async function digest(file,algorithm){const hash=createHash(algorithm);for await(const bytes of createReadStream(file))hash.update(bytes);return hash.digest('hex');}
const assets={};for(const name of [binary,source]){
  const file=path.join(output,name),stat=await fs.stat(file);
  assets[name]={size:stat.size,sha256:await digest(file,'sha256'),sha512:await digest(file,'sha512')};
  await fs.writeFile(file+'.sha512sum',assets[name].sha512+'  '+name+'\n',{flag:'wx'});
}
if(await treeSha256(built.runtime)!==validation.treeSha256)throw Error('Runtime changed during packaging');
const manifest={schema:1,component:'runtime',channel:'experimental',version:built.name.replace(/^nexus-runtime-/,''),sourceCommit:built.metadata.patchState,proton:built.proton,components:built.metadata.components,assets,validation:{contracts:33,http2:true,media:true,graphics:true,treeSha256:validation.treeSha256,realGameTest:false,stableApproved:false}};
await fs.writeFile(path.join(output,'candidate.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
console.log('Packaged exact validated Experimental candidate, not a stable approval.');

