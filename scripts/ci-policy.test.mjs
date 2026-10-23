// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const load=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
test('PR source checks do not compile or package distribution binaries',()=>{
  const source=load('.github/workflows/source.yml');
  assert.match(source,/pull_request:/);assert.match(source,/npm test/);assert.match(source,/npm run check/);
  assert.doesNotMatch(source,/build-(?:proton|auxiliary)|package-candidate|prepare-runtime[^\n]+--full/);
});
test('full SDK and native validation are main-only with immutable SDK input',()=>{
  const build=load('.github/workflows/build.yml');
  assert.doesNotMatch(build,/pull_request:/);assert.match(build,/branches: \[main\]/);
  assert.equal((build.match(/if: github.ref == 'refs\/heads\/main'/g)??[]).length,2);
  assert.match(build,/prepare-runtime[^\n]+--full/);assert.match(build,/validate-candidate\.mjs/);
  const recipe=JSON.parse(load('scripts/proton.lock.json'));
  assert.match(recipe.sdk,/@sha256:[0-9a-f]{64}$/);
});
test('candidate packaging requires exact validation, never infers stable or game approval',()=>{
  const pack=load('scripts/package-candidate.mjs');
  assert.match(pack,/validateBinding\(validation/);assert.match(pack,/validateResults\(values\)/);
  assert.match(pack,/Validation results changed/);assert.match(pack,/realGameTest:false,stableApproved:false/);
  assert.doesNotMatch(pack,/\.sort\(\)\.at\(-1\)/);
});
test('coherent SDK output is copied, never host-built Wine probe DLLs',()=>{
  const script=load('scripts/build-proton.mjs');
  assert.match(script,/path\.join\(build,'redist'\)/);assert.doesNotMatch(script,/probe-build/);
  const probe=load('scripts/build-probes.mjs');assert.match(probe,/Host-built executables are test fixtures only/);
});
