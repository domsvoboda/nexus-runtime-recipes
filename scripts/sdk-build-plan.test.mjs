// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {sdkBuildPlan} from './sdk-build-plan.mjs';

test('SDK stages enforce the host-tools barrier while retaining parallel compilation and fatal failures', () => {
  const stages = sdkBuildPlan('/isolated/build', '123');
  assert.equal(stages.length, 3);
  for (const stage of stages) assert.deepEqual(stage.args.slice(0, 3), ['-j4', 'J=4', 'SOURCE_DATE_EPOCH=123']);
  assert.equal(stages[0].args.at(-1), '/isolated/build/.wine-x86_64-tools');
  assert.deepEqual(stages[1].args.slice(-2), ['module=xgameruntime', 'module']);
  assert.equal(stages[2].args.at(-1), 'redist');
});
test('SDK plan rejects relative directories and invalid epochs', () => {
  for (const [directory, epoch] of [['relative','1'],['/build',''],['/build','now'],['/build','1 other=bad']])
    assert.throws(() => sdkBuildPlan(directory, epoch));
});
test('actual parallel make reader/writer race fails before the barrier and passes with the ordered plan', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-sdk-order-'));
  const fixture = directory => {
    fs.mkdirSync(directory);
    // Model the pinned Proton module graph: module depends on both host tools
    // and recursive readers, but the readers have no host-tool dependency edge.
    fs.writeFileSync(path.join(directory, 'Makefile'), `.PHONY: module module32 module64 redist\nmodule: ${directory}/.wine-x86_64-tools module32 module64\n${directory}/.wine-x86_64-tools:\n\tprintf partial > parser\n\tsleep 0.2\n\tprintf complete > parser\n\ttouch $@\nmodule32 module64:\n\twhile ! test -f parser; do sleep 0.01; done\n\ttest "$$(cat parser)" = complete\nredist: module\n\ttest -f ${directory}/.wine-x86_64-tools\n`);
  };
  try {
    const before = path.join(root, 'before'), after = path.join(root, 'after');
    fixture(before); fixture(after);
    const old = spawnSync('make', ['-j4','module'], {cwd: before, encoding: 'utf8', timeout: 10000});
    assert.equal(old.error, undefined);
    assert.notEqual(old.status, 0, 'unordered readers must see the unfinished generated file');
    for (const stage of sdkBuildPlan(after, '123')) {
      const result = spawnSync('make', stage.args, {cwd: after, encoding: 'utf8', timeout: 10000});
      assert.equal(result.error, undefined);
      assert.equal(result.status, 0, result.stdout + result.stderr);
    }
    assert.equal(fs.readFileSync(path.join(after, 'parser'), 'utf8'), 'complete');
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});
