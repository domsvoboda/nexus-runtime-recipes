// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {windowsTarget} from './runtime-compat/build.mjs';
test('auxiliary MinGW Windows API declarations do not depend on toolchain defaults',()=>{
  assert.deepEqual(windowsTarget,['-D_WIN32_WINNT=0x0601','-DWINVER=0x0601']);
  const source=fs.readFileSync(new URL('./runtime-compat/build.mjs',import.meta.url),'utf8');
  assert.equal((source.match(/run\('x86_64-w64-mingw32-gcc', \[\.\.\.windowsTarget/g)??[]).length,2);
  assert.match(source,/'-Werror'/);assert.doesNotMatch(source,/-Wno-error/);
});
