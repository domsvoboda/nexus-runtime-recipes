// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {contractNames,validateResults,validateBinding,treeSha256} from './validation-policy.mjs';
const passing=()=>({contracts:{results:contractNames.map(name=>({name,code:0,timedOut:false,summary:['CHECKS 10 FAILURES 0']}))},http:{code:0,timedOut:false,summary:['SUMMARY checks=432 failures=0']},media:{h264:true,aac:true,bundledLibraries:true},graphics:{code:0,timeout:false,summary:['DXVK COMPUTE CHECKS 40 FAILURES 0']}});
test('complete native results are accepted without claiming game validation',()=>validateResults(passing()));
for(const [name,change] of [
  ['missing probe',v=>v.contracts.results.pop()],['duplicate probe',v=>v.contracts.results[1]=v.contracts.results[0]],
  ['unrelated probe',v=>v.contracts.results[0].name='unknown'],['failed probe',v=>v.contracts.results[0].code=1],
  ['probe timeout',v=>v.contracts.results[0].timedOut=true],['absent timeout status',v=>delete v.contracts.results[0].timedOut],
  ['no actual native checks',v=>v.contracts.results[0].summary=[]],['zero native checks',v=>v.contracts.results[0].summary=['CHECKS 0 FAILURES 0']],
  ['hidden failed native check',v=>v.contracts.results[0].summary.push('FAIL test')],['nonzero failure count',v=>v.contracts.results[0].summary.push('CHECKS 10 FAILURES 10')],
  ['failed HTTP',v=>v.http.code=1],['absent HTTP timeout',v=>delete v.http.timedOut],
  ['no actual HTTP checks',v=>v.http.summary=[]],['failed HTTP checks',v=>v.http.summary=['SUMMARY checks=432 failures=1']],
  ['missing bundled media',v=>v.media.bundledLibraries=false],['truthy media string',v=>v.media.aac='true'],
  ['failed graphics',v=>v.graphics.code=1],['timed out graphics',v=>v.graphics.timeout=true],
  ['no actual graphics checks',v=>v.graphics.summary=[]],['failed graphics checks',v=>v.graphics.summary=['DXVK COMPUTE CHECKS 40 FAILURES 1']],
])test('reject '+name,()=>{const v=passing();change(v);assert.throws(()=>validateResults(v));});
test('accept native app-state count format and additional SDK diagnostics',()=>{const v=passing();v.contracts.results[0].summary=['CHECKS appstate checks=190000 failures=0 callbacks=0'];v.contracts.results[1].summary=['Nexus cloud saves: synthetic failed-upload fixture','CHECKS 132 FAILURES 0'];validateResults(v);});
const hashes={builtSha256:'a'.repeat(64),treeSha256:'b'.repeat(64),sourceLockSha256:'c'.repeat(64)};
const proof=()=>({schema:1,channel:'experimental',realGameTest:false,stableApproved:false,...hashes,results:Object.fromEntries(Object.entries({contracts:'runtime-contract-abc/results.json',http:'runtime-http2-def/results.json',media:'media-tests/results.json',graphics:'runtime-dxvk-ghi/result.json'}).map(([k,p])=>[k,{path:p,sha256:'d'.repeat(64)}]))});
test('binding accepts exact candidate and bounded result references',()=>validateBinding(proof(),hashes));
for(const key of Object.keys(hashes))test('reject changed '+key,()=>assert.throws(()=>validateBinding(proof(),{...hashes,[key]:'e'.repeat(64)})));
for(const [name,change] of [
  ['path traversal',p=>p.results.http.path='../results.json'],['unbound result',p=>delete p.results.media],
  ['invented game approval',p=>p.realGameTest=true],['invented stable approval',p=>p.stableApproved=true],
])test('reject '+name,()=>{const p=proof();change(p);assert.throws(()=>validateBinding(p,hashes));});
test('runtime digest binds binary bytes, mode and links without following links',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'nexus-tree-test-'));
  try{
    await fs.mkdir(path.join(root,'files'));const file=path.join(root,'files/wine');await fs.writeFile(file,'test executable',{mode:0o700});
    await fs.symlink('wine',path.join(root,'files/link'));const first=await treeSha256(root);
    assert.equal(await treeSha256(root),first);await fs.writeFile(file,'changed executable');assert.notEqual(await treeSha256(root),first);
    await fs.writeFile(file,'test executable');assert.equal(await treeSha256(root),first);await fs.chmod(file,0o600);assert.notEqual(await treeSha256(root),first);
    await fs.chmod(file,0o700);await fs.unlink(path.join(root,'files/link'));await fs.symlink('/nonexistent-public-test-path',path.join(root,'files/link'));
    assert.notEqual(await treeSha256(root),first);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
