// SPDX-License-Identifier: MIT
// Host-built executables are test fixtures only. Their DLLs never enter a runtime.
import fs from 'node:fs/promises';
import path from 'node:path';
import {project,run as execute} from './recipe.mjs';
import {buildPlayFabSessionProbe} from './runtime-tests/build-playfab-session.mjs';
import {buildStoreProbes} from './runtime-tests/build-store-probes.mjs';
import {buildSaveSyncProbe} from './runtime-tests/build-gamesave-sync-probe.mjs';
import {buildUserAudioProbe} from './runtime-tests/build-user-audio-probe.mjs';
import {buildUserPrivilegeProbe} from './runtime-tests/build-user-privilege-probe.mjs';
const [preparedArg,auxArg]=process.argv.slice(2);
if(!preparedArg||!auxArg||process.argv.length!==4)throw Error('Usage: build-probes.mjs PREPARED AUXILIARY');
const work=await fs.realpath(preparedArg),source=path.join(work,'proton/wine');
const aux=await fs.realpath(auxArg),build=path.join(work,'probe-build'),tests=path.join(work,'tests');
const run=(command,args,cwd,capture=false)=>execute(command,args,cwd,{capture});
await fs.mkdir(build);await fs.mkdir(tests);
run('python3',['make_vulkan','-x','vk.xml','-X','video.xml'],path.join(source,'dlls/winevulkan'));
run('perl',['tools/make_specfiles'],source);
run('autoreconf',['-fiv'],source);
run(path.join(source,'configure'),['--enable-win64','--without-x','--without-wayland','--disable-tests'],build);
run('make',['-j4','dlls/xgameruntime/x86_64-windows/xgameruntime.dll','dlls/winhttp/x86_64-windows/winhttp.dll','dlls/mscoree/x86_64-windows/mscoree.dll','dlls/windows.web/x86_64-windows/windows.web.dll','dlls/twinapi.appcore/x86_64-windows/twinapi.appcore.dll'],build);
const include=['-D__WINESRC__','-I',path.join(build,'dlls/xgameruntime'),'-I',path.join(source,'dlls/xgameruntime'),'-I',path.join(build,'include'),'-I',path.join(source,'include')];
const gcc=(file,output,flags=[],headers=include)=>run('x86_64-w64-mingw32-gcc',[...headers,'-O2','-Wall',path.join(project,'scripts/runtime-tests',file),'-o',output,...flags],work);
gcc('game-relaunch-probe.c',path.join(tests,'game-relaunch-probe.exe'),['-municode']);
for(const constrained of [false,true])for(const fixture of [false,true])gcc('appstate-probe.c',path.join(tests,`${constrained?'appconstrained':'appstate'}${fixture?'-source':''}-probe.exe`),[
  ...(constrained?['-DAPPCONSTRAINED_PROBE']:[]),...(fixture?['-DAPPSTATE_SOURCE_FIXTURE','-I',path.join(source,'dlls/twinapi.appcore')]:[]),'-Wextra','-Werror','-lruntimeobject']);
gcc('hlsl-state-keywords-probe.c',path.join(tests,'hlsl-state-keywords-probe.exe'),['-std=c11','-Wextra','-Werror'],[]);
const pgs=path.join(tests,'playfab-folder');await fs.mkdir(pgs);
const definition=(await fs.readFile(path.join(project,'scripts/runtime-compat/playfab-save-folder.def'),'utf8')).replace(/^(PF\w+)(?:=\S+)? @(\d+)$/gm,(_,name,ordinal)=>`${name}${name==='PFGameSaveFilesInitialize'?'':'=probe_stub'} @${ordinal}`);
await fs.writeFile(path.join(pgs,'fixture.def'),definition,{flag:'wx'});
for(const [define,name,extra] of [['PROBE_SDK','nexus_pgs_native.dll',[path.join(pgs,'fixture.def')]],['PROBE_RUNTIME','xgameruntime.dll',[]]])gcc('playfab-folder-probe.c',path.join(pgs,name),['-shared','-Wextra','-Werror',`-D${define}`,...extra],[]);
gcc('playfab-folder-probe.c',path.join(pgs,'playfab-folder-probe.exe'),[],[]);
await fs.copyFile(path.join(aux,'components/PlayFabGameSave.dll'),path.join(pgs,'PlayFabGameSave.dll'));
await buildPlayFabSessionProbe(path.join(tests,'playfab-session'),include);
const init=path.join(tests,'runtime-init');await fs.mkdir(init);
gcc('runtime-init-probe.c',path.join(init,'runtime-init-probe.exe'),['-Wextra','-Werror'],[]);
await fs.writeFile(path.join(init,'MicrosoftGame.config'),'<Game><!-- <Identity Name="Wrong.Example" Publisher="CN=Wrong"/><TitleId>0000</TitleId> --><Identity Name="Nexus.Init.Inline" Publisher="CN=NexusProbe"/><TitleId>1234</TitleId></Game>',{flag:'wx'});
for(const name of ['taskqueue-teardown','taskqueue-contract','taskqueue-close','async-provider-contract','async-completion-lifetime','async-schedule','gamesave-files','package-identity','package-legacy','package-chunks','package-monitors','package-progress-bytes','system-device-id','user-device-association'])gcc(`${name}-probe.c`,path.join(tests,`${name}-probe.exe`));
gcc('token-dispatch-probe.c',path.join(tests,'token-dispatch-probe.exe'),['-lruntimeobject']);
await buildUserPrivilegeProbe({source,build,tests,project},run);
buildStoreProbes({source,build,tests,project},run);
buildSaveSyncProbe({source,build,tests,project},run);
buildUserAudioProbe({source,build,tests,project},run);
gcc('winrt-json-probe.c',path.join(tests,'winrt-json-probe.exe'),['-lruntimeobject'],['-I',path.join(build,'include'),'-I',path.join(source,'include')]);
console.log('Built account-free fixtures. Host probe DLLs are not distribution components.');

