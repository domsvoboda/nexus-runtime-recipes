// SPDX-License-Identifier: MIT
import fs from 'node:fs/promises';
import path from 'node:path';
import {project,readJson,run,checkout,verifyRecipe,sha256} from './recipe.mjs';

const args=process.argv.slice(2),full=args.includes('--full');
const filtered=args.filter(x=>x!=='--full');
if(filtered.length!==2||filtered[0]!=='--work')throw Error('Usage: prepare-runtime.mjs --work NEW_DIRECTORY [--full]');
const work=path.resolve(filtered[1]);
const {proton,patches}=await verifyRecipe();
await fs.mkdir(work,{recursive:false});
const source=path.join(work,'proton');
await checkout(proton.proton,source);
// The canonical VKD3D mirror contains the exact same pinned Git object.
run('git',['config','submodule.vkd3d.url',patches.sources.vkd3d.url],source);
run('git',['submodule','update','--init','--depth','1',...(full?['--recursive','--jobs','4']:['wine','vkd3d'])],source);
for(const [name,expected] of Object.entries(proton.modules)){
  const entry=run('git',['ls-tree','HEAD','--',name],source,{capture:true}).trim();
  if(!entry.startsWith('160000 commit '+expected+'\t'))throw Error('Proton module mismatch: '+name);
  if(full||['wine','vkd3d'].includes(name))if(run('git',['rev-parse','HEAD'],path.join(source,name),{capture:true}).trim()!==expected)throw Error('Wrong submodule checkout: '+name);
}
await checkout(patches.sources.xgameruntime,path.join(source,'wine/dlls/xgameruntime'));
await checkout(patches.sources.nghttp2,path.join(work,'nghttp2-src'));
for(const p of patches.patches){
  const directory=p.repository==='proton'?source:path.join(source,p.repository==='vkd3d'?'vkd3d':'wine');
  const options=p.recount?['--recount']:[];
  run('git',['apply',...options,'--check',path.join(project,p.file)],directory);
  run('git',['apply',...options,path.join(project,p.file)],directory);
}
for(const [file,expected] of Object.entries(patches.expectedXgameruntimeSources))if(sha256(await fs.readFile(path.join(source,'wine',file)))!==expected)throw Error('XGameRuntime source differs: '+file);
for(const [file,expected] of Object.entries(patches.expectedWineSources??{}))if(sha256(await fs.readFile(path.join(source,'wine',file)))!==expected)throw Error('Wine source differs: '+file);
for(const [file,expected] of Object.entries(patches.expectedVkd3dSources??{}))if(sha256(await fs.readFile(path.join(source,'vkd3d',file)))!==expected)throw Error('Shader source differs: '+file);
const recipe=await fs.readFile(path.join(project,'scripts/runtime-patches.lock.json'));
const manifest={schema:1,channel:'experimental',proton,sourceLockSha256:sha256(recipe),patches:patches.patches,fullSubmodules:full};
if(full)manifest.submodules=run('git',['submodule','status','--recursive'],source,{capture:true});
await fs.writeFile(path.join(work,'prepared.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
console.log('Prepared pinned Experimental sources. No runtime installed or activated.');

