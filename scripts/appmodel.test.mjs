// SPDX-License-Identifier: MIT
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import{createHash}from'node:crypto';
import fsPromises from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import{appmodelProbeBuilds}from'./runtime-tests/build-appmodel-probes.mjs';
const patch=fs.readFileSync(new URL('../assets/wine-appmodel-identity.patch',import.meta.url),'utf8');
const lock=JSON.parse(fs.readFileSync(new URL('./runtime-patches.lock.json',import.meta.url)));
test('AppModel source patch is pinned and confined to core package queries',()=>{
 assert.equal(lock.patches.find(p=>p.file==='assets/wine-appmodel-identity.patch').sha256,createHash('sha256').update(patch).digest('hex'));
 assert.deepEqual([...patch.matchAll(/^diff --git a\/(\S+)/gm)].map(m=>m[1]),['dlls/kernelbase/version.c','dlls/kernelbase/Makefile.in','dlls/kernelbase/appmodel-identity.h']);
 for(const name of ['version.c','Makefile.in','appmodel-identity.h'])assert.match(lock.expectedWineSources['dlls/kernelbase/'+name],/^[a-f0-9]{64}$/);
});

test('Unix alias fixtures exercise foreign and internal file/directory cases for both ABIs',async()=>{
 const {runAppmodelAliases}=await import('./runtime-tests/run-appmodel-alias-controls.mjs');
 const root=await fsPromises.mkdtemp(path.join(os.tmpdir(),'nexus-alias-fixture-'));
 try{
  for(const bits of[64,32]){
   await fsPromises.writeFile(path.join(root,'appmodel-'+bits+'-probe.exe'),'fixture');
   const modes=[];
   const result=await runAppmodelAliases({wine:'unused',tests:root,root,bits,run:async(command,args)=>{
    assert.equal(command,'unused');assert.equal(args[1],'--child');modes.push(args[2]);
    const real=await fsPromises.realpath(args[0]);
    assert.equal(real.includes('/outside/'),args[2]==='none');
    return{code:0,timedOut:false,output:''};
   }});
   assert.deepEqual(modes,['none','none','valid','valid']);assert.equal(result.code,0);
   assert.match(result.output,/checks=4 failures=0/);
  }
 }finally{await fsPromises.rm(root,{recursive:true,force:true});}
});
test('Unix alias runtime failures cannot be hidden by a passing parent suite',async()=>{
 const {runAppmodelAliases}=await import('./runtime-tests/run-appmodel-alias-controls.mjs');
 const root=await fsPromises.mkdtemp(path.join(os.tmpdir(),'nexus-alias-failure-'));
 try{
  await fsPromises.writeFile(path.join(root,'appmodel-64-probe.exe'),'fixture');
  const result=await runAppmodelAliases({wine:'unused',tests:root,root,bits:64,run:async()=>({code:1,timedOut:true,output:'failure'})});
  assert.equal(result.code,1);assert.equal(result.timedOut,true);assert.match(result.output,/checks=4 failures=4/);
 }finally{await fsPromises.rm(root,{recursive:true,force:true});}
});
test('AppModel discovery uses bounded executable metadata, never accounts or CWD',()=>{
 for(const value of ['GetModuleFileNameW','GetFinalPathNameByHandleW','PACKAGE_XML_LIMIT','PACKAGE_XML_DEPTH','FILE_SHARE_READ','package_parse_manifest','sha256_process','ERROR_NOT_SUPPORTED'])assert.ok(patch.includes(value),value);
 assert.doesNotMatch(patch,/^\+.*(?:GetEnvironmentVariable|GetCurrentDirectory|XUser|XStore|Halo|CampaignS1|WriteProcessMemory)/m);
 assert.match(patch,/Do not invent a dependency graph/);
});
test('AppModel probes compile strict both-ABI real API and process fixtures',()=>{
 const plans=appmodelProbeBuilds({tests:'/tmp/tests',project:'/tmp/project'});
 assert.deepEqual(plans.map(p=>p.command),['x86_64-w64-mingw32-gcc','i686-w64-mingw32-gcc']);
 for(const p of plans)for(const flag of ['-Wall','-Wextra','-Werror','-municode'])assert.ok(p.args.includes(flag));
 const probe=fs.readFileSync(new URL('./runtime-tests/appmodel-probe.c',import.meta.url),'utf8');
 for(const value of ['GetProcAddress','CreateProcessW','PACKAGE_FILTER_HEAD','PACKAGE_FILTER_DIRECT','GetLastError()==0x1234abcd','8wekyb3d8bbwe','DOCTYPE','outside.exe','worker','L"cache"'])assert.ok(probe.includes(value),value);
 assert.doesNotMatch(probe,/#include.*appmodel-identity.h|XUserAdd|XGameSave/);
});
