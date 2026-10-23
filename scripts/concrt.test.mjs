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
  assert.equal(lock.expectedWineSources['dlls/concrt140/details.c'],'e1c92f2fe15b679a6690e6f110d3d89b4cdd5343c79773bb3c5bb89f070b861d');
});
test('CONCRT backport includes marker wait, element-count ABI and byte arithmetic together',()=>{
  assert.match(patch,/\+\s+if\(!this->segment\[i\] \|\| this->segment\[i\] == SEGMENT_ALLOC_MARKER\)/);
  assert.match(patch,/\+\s+this->segment\[seg\] = this->allocator\(this, 1 << this->first_block\)/);
  assert.match(patch,/\+\s+this->segment\[seg\] = this->allocator\(this, 1 << seg\)/);
  assert.doesNotMatch(patch,/^\+.*\(BYTE\*\*\)/m);
});
