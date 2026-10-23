// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const patch=fs.readFileSync(new URL('../assets/upstream/wine-de43f543-concrt.patch',import.meta.url),'utf8');
const lock=JSON.parse(fs.readFileSync(new URL('./runtime-patches.lock.json',import.meta.url)));
test('CONCRT backport preserves attribution and excludes unrelated threadpool edits',()=>{
  assert.ok(patch.startsWith('From de43f5434fec4fa44a1d1aad0445bae4a606a5a9 '));
  assert.match(patch,/From: Piotr Caban <piotr@codeweavers.com>/);
  assert.deepEqual([...patch.matchAll(/^diff --git a\/(\S+)/gm)].map(m=>m[1]),['dlls/concrt140/details.c']);
  const row=lock.patches.find(p=>p.file==='assets/upstream/wine-de43f543-concrt.patch');
  assert.equal(row.sha256,createHash('sha256').update(patch).digest('hex'));
  assert.deepEqual(row.upstream,{repository:'wine-mirror/wine',commit:'de43f5434fec4fa44a1d1aad0445bae4a606a5a9',paths:['dlls/concrt140/details.c']});
  assert.equal(lock.expectedWineSources['dlls/concrt140/details.c'],'257b2e8971156e8f9e06137a69e7590bbd5816ac9512cd034d255c07b55cd480');
});
test('queue patch implements all iterator operations without changing queue writers',()=>{
  const text=fs.readFileSync(new URL('../assets/concrt-queue-iterator.patch',import.meta.url),'utf8');
  const row=lock.patches.find(p=>p.file==='assets/concrt-queue-iterator.patch');
  assert.equal(row.sha256,createHash('sha256').update(text).digest('hex'));
  assert.deepEqual([...text.matchAll(/^diff --git a\/(\S+)/gm)].map(m=>m[1]),['dlls/concrt140/details.c','dlls/concrt140/concrt140.spec']);
  for(const symbol of ['ctor','dtor','_Assign','_Advance'])assert.match(text,new RegExp('\\+.*_Concurrent_queue_iterator_base_v4_'+symbol));
  assert.equal([...text.matchAll(/^\+@ (?:cdecl|thiscall).*iterator_base_v4/gm)].length,12);
  assert.doesNotMatch(text,/^[-+].*(?:InterlockedIncrementSizeT|queue_push_finally|threadsafe_queue_push|threadsafe_queue_pop)\(/m);
  assert.equal(lock.expectedWineSources['dlls/concrt140/concrt140.spec'],'17e7863be79c1fdfb8766da7569c9071a3ed527a1e787ef1f5edb75013e75369');
});
test('CONCRT backport includes marker wait, element-count ABI and byte arithmetic together',()=>{
  assert.match(patch,/\+\s+if\(!this->segment\[i\] \|\| this->segment\[i\] == SEGMENT_ALLOC_MARKER\)/);
  assert.match(patch,/\+\s+this->segment\[seg\] = this->allocator\(this, 1 << this->first_block\)/);
  assert.match(patch,/\+\s+this->segment\[seg\] = this->allocator\(this, 1 << seg\)/);
  assert.doesNotMatch(patch,/^\+.*\(BYTE\*\*\)/m);
});
