// SPDX-License-Identifier: MIT
import fs from 'node:fs/promises';
import path from 'node:path';
import {project,run,readJson,verifyRecipe,sha256} from './recipe.mjs';
const [preparedArg,auxArg,outputArg]=process.argv.slice(2);
if(!preparedArg||!auxArg||!outputArg||process.argv.length!==5)throw Error('Usage: build-proton.mjs PREPARED AUXILIARY NEW_OUTPUT');
const prepared=await fs.realpath(preparedArg),aux=await fs.realpath(auxArg),output=path.resolve(outputArg);
const {proton,patches}=await verifyRecipe(),proof=await readJson(path.join(prepared,'prepared.json'));
if(JSON.stringify(proof.proton)!==JSON.stringify(proton)||!proof.fullSubmodules||proof.sourceLockSha256!==sha256(await fs.readFile(path.join(project,'scripts/runtime-patches.lock.json'))))throw Error('Full pinned preparation required');
const auxiliary=await readJson(path.join(aux,'auxiliary.json'));
if(auxiliary.source.commit!==patches.sources.nghttp2.commit)throw Error('Wrong nghttp2 auxiliary');
const source=path.join(prepared,'proton'),wine=path.join(source,'wine');
const include=path.join(wine,'include/nghttp2');await fs.mkdir(include);
for(const [name,hash] of Object.entries(auxiliary.headers)){
  if(!['nghttp2.h','nghttp2ver.h'].includes(name))throw Error('Unexpected header');
  const bytes=await fs.readFile(path.join(aux,'components/nghttp2',name));
  if(sha256(bytes)!==hash)throw Error('Header checksum mismatch');
  await fs.writeFile(path.join(include,name),bytes,{flag:'wx'});
}
const build=path.join(prepared,'sdk-build');await fs.mkdir(build);
const revision=run('git',['rev-parse','--short=8','HEAD'],project,{capture:true}).trim();
const epoch=run('git',['log','-1','--format=%ct'],project,{capture:true}).trim();
const name=`nexus-runtime-11.0-experimental-g${revision}`;
run(path.join(source,'configure.sh'),[`--build-name=${name}`,'--container-engine=docker',`--proton-sdk-image=${proton.sdk}`,'--enable-ccache'],build);
run('make',['-j4','J=4',`SOURCE_DATE_EPOCH=${epoch}`,'redist'],build,{timeout:5*60*60*1000});
await fs.mkdir(output,{recursive:false});
const runtime=path.join(output,name);
await fs.cp(path.join(build,'redist'),runtime,{recursive:true,errorOnExist:true,force:false,dereference:false});
const files=path.join(runtime,'files'),components={};
for(const [arch,hash] of Object.entries(auxiliary.libraries)){
  if(!['x86_64','i386'].includes(arch))throw Error('Unexpected architecture');
  const bytes=await fs.readFile(path.join(aux,'components',arch,'libnghttp2.dll'));
  if(sha256(bytes)!==hash)throw Error('nghttp2 checksum mismatch');
  await fs.writeFile(path.join(files,'lib/wine',arch+'-windows/libnghttp2.dll'),bytes,{flag:'wx'});
}
const compat=path.join(files,'share/xodus-nexus/compat');await fs.mkdir(compat,{recursive:true});
for(const name of ['PlayFabGameSave.dll','gaming-services-version.exe','wine-launcher']){
  const bytes=await fs.readFile(path.join(aux,'components',name));
  if(sha256(bytes)!==auxiliary.compatibility[name])throw Error('Compatibility checksum mismatch');
  if(name==='wine-launcher'){
    await fs.rename(path.join(files,'bin/wine'),path.join(files,'bin/wine.nexus-original'));
    await fs.writeFile(path.join(files,'bin/wine'),bytes,{flag:'wx',mode:0o755});
  }else await fs.writeFile(path.join(compat,name),bytes,{flag:'wx'});
}
for(const name of ['xgameruntime.dll','winhttp.dll','mscoree.dll','windows.web.dll','twinapi.appcore.dll','libnghttp2.dll','libvkd3d-shader-1.dll','d3d8.dll','d3d9.dll','d3d10core.dll','d3d11.dll','dxgi.dll']){
  const sub=name==='libvkd3d-shader-1.dll'?'vkd3d':['d3d8.dll','d3d9.dll','d3d10core.dll','d3d11.dll','dxgi.dll'].includes(name)?'wine/dxvk':'wine';
  const file=path.join(files,'lib',sub,'x86_64-windows',name),bytes=await fs.readFile(file);
  components[name]=sha256(bytes);
  const dest=path.join(files,'share/default_pfx/drive_c/windows/system32',name);
  const temporary=dest+'.nexus-runtime';await fs.writeFile(temporary,bytes,{flag:'wx'});await fs.rename(temporary,dest);
}
// Keep portable media separate from the SDK-built Wine. Existing libraries are
// never silently replaced by the auxiliary bundle.
const media=await readJson(path.join(aux,'media/media-manifest.json'));
const libdir=path.join(files,'lib/x86_64-linux-gnu');
for(const [soname,item] of Object.entries(media.libraries)){
  try{await fs.access(path.join(libdir,soname));continue;}catch(e){if(e.code!=='ENOENT')throw e;}
  const bytes=await fs.readFile(path.join(aux,'media/stage/usr/lib/x86_64-linux-gnu',item.filename));
  if(sha256(bytes)!==item.sha256)throw Error('Media checksum mismatch');
  await fs.writeFile(path.join(libdir,item.filename),bytes,{flag:'wx'});
  if(soname!==item.filename)await fs.symlink(item.filename,path.join(libdir,soname));
}
const notices=path.join(files,'share/doc/nexus-runtime');await fs.mkdir(notices,{recursive:true});
for(const [name,sourceFile] of [['runtime-compat-LICENSE',path.join(project,'LICENSE')],['NOTICE',path.join(project,'NOTICE')],['nghttp2-LICENSE',path.join(aux,'components/nghttp2-LICENSE')],['Wine-LICENSE',path.join(wine,'COPYING.LIB')],['xgameruntime-LICENSE',path.join(wine,'dlls/xgameruntime/LICENSE')],['DXVK-LICENSE',path.join(source,'dxvk/LICENSE')],['VKD3D-LICENSE',path.join(source,'vkd3d/COPYING')],['FFmpeg-COPYING.LGPLv2.1',path.join(aux,'media/ffmpeg-'+media.version+'/COPYING.LGPLv2.1')]])await fs.copyFile(sourceFile,path.join(notices,name));
const metadata={schema:1,status:'experimental',description:'Independent Nexus runtime built from pinned official Proton Experimental sources.',baseProtonCommit:proton.proton.commit,patchState:run('git',['rev-parse','HEAD'],project,{capture:true}).trim(),sourceLockSha256:proof.sourceLockSha256,requiresBackendVersion:proton.requiresBackendVersion,components,runtimeCompatibility:auxiliary.compatibility,features:['cloud-saves-pr28','xodus-tcp-bridge-v1','package-locale','xuser-contract-v1','wine-winhttp-http2-v1','nghttp2-v1','winrt-json-v1','xasync-provider-contract-v1','xtaskqueue-lifecycle-v1','playfab-package-save-folder-v1','xstore-entitlements-v1','xpackage-content-v1','xstore-package-license-v1','hlsl-state-keywords-v1','appstate-registration-v1','appconstrained-registration-v1','xtaskqueue-repeat-termination-v1','xgame-relaunch-current-user-v1','dxvk-constant-compare-v1']};
metadata.baseWineSha256=sha256(await fs.readFile(path.join(files,'bin/wine.nexus-original')));
await fs.writeFile(path.join(runtime,'XODUS_NEXUS_PATCH.json'),JSON.stringify(metadata,null,2)+'\n',{flag:'wx'});
await fs.writeFile(path.join(output,'built.json'),JSON.stringify({schema:1,name,runtime,metadata,proton,prepared,aux},null,2)+'\n',{flag:'wx'});
console.log('Built an isolated Experimental candidate. Native validation is still required.');

