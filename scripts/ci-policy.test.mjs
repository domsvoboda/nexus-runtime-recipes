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
test('the official SDK module preflight precedes redist without relaxing compiler flags',()=>{
  const script=load('scripts/build-proton.mjs');
  const preflight=script.indexOf("'module=xgameruntime','module'");
  assert.ok(preflight>0&&preflight<script.indexOf("'redist'],build"));
  assert.doesNotMatch(script,/-Wno-|--disable-werror|CFLAGS=/);
  assert.match(script,/proton-sdk-image=\$\{proton.sdk\}/);
});
test('main SDK compiler cache survives failure but never bypasses validation',()=>{
  const build=load('.github/workflows/build.yml');
  assert.match(build,/actions\/cache\/restore@v4/);
  assert.match(build,/actions\/cache\/save@v4/);
  assert.match(build,/if: always\(\) && !cancelled\(\) && steps\.ccache-restore\.outcome == 'success'/);
  assert.match(build,/CCACHE_MAXSIZE: 3G/);
  assert.match(build,/CCACHE_COMPILERCHECK: content/);
  assert.doesNotMatch(build,/CCACHE_SLOPPINESS|continue-on-error|if:.*cache-hit.*validate/);
  assert.match(build,/restore-keys: proton-sdk-\$\{\{ hashFiles\('scripts\/proton.lock.json'\) \}\}-/);
  const native=build.indexOf('node scripts/validate-candidate.mjs');
  assert.ok(native>build.indexOf('node scripts/build-proton.mjs'));
  assert.ok(build.indexOf('node scripts/package-candidate.mjs')>native);
});
