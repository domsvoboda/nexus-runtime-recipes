// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {concrtProbeBuilds,buildConcrtProbes} from './build-concrt-probes.mjs';
test('CONCRT fixture builds strict real-export probes for both Windows ABIs',()=>{
  const options={tests:'/tmp/tests with spaces',project:'/tmp/project'},plans=concrtProbeBuilds(options),calls=[];
  assert.deepEqual(plans.map(p=>p.command),['vector','queue','yield'].flatMap(()=>['x86_64-w64-mingw32-gcc','i686-w64-mingw32-gcc']));
  assert.deepEqual(plans.map(p=>p.args.at(-1)),['vector','queue','yield'].flatMap(kind=>[64,32].map(n=>`/tmp/tests with spaces/concrt-${kind}-${n}-probe.exe`)));
  for(const p of plans)for(const flag of ['-Wall','-Wextra','-Werror'])assert.ok(p.args.includes(flag));
  buildConcrtProbes(options,(...args)=>calls.push(args));assert.equal(calls.length,6);
  const source=fs.readFileSync(new URL('./concrt-vector-probe.c',import.meta.url),'utf8');
  for(const text of ['LoadLibraryA("concrt140.dll")','GetProcAddress','allocation_race(0)','allocation_race(8)','allocation_race(64)','layout_and_callbacks(12)','layout_and_callbacks(88)','layout_and_callbacks(256)','stress();','index is not duplicated'])assert.ok(source.includes(text),text);
  assert.doesNotMatch(source,/#include\s+".*details\.c"|XUser|XGameSave|https?:\/\//);
});
test('queue probe uses real exports for lifecycle and page-boundary traversal',()=>{
  const source=fs.readFileSync(new URL('./concrt-queue-probe.c',import.meta.url),'utf8');
  for(const text of ['GetProcAddress','iter_ctor','iter_dtor','iter_assign','iter_advance','empty_lifecycle();','refill();','queue_size(&f.q) == count','popped + i','iterator has exactly two pointer-sized ABI fields','all callback pages released'])assert.ok(source.includes(text),text);
  assert.doesNotMatch(source,/#include\s+".*details\.c"|XUser|XGameSave|https?:\/\//);
  assert.match(source,/BOOLEAN \(__thiscall \*queue_pop\)/);
  assert.match(source,/BOOLEAN \(__thiscall \*queue_empty\)/);
});
