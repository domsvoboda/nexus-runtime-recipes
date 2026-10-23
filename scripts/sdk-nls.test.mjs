// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const patch = fs.readFileSync(new URL('../assets/proton-host-tools-nls.patch', import.meta.url), 'utf8');
test('NLS patch only adds pinned host-tool data dependencies', () => {
  const removed = patch.split('\n').filter(line => line.startsWith('-') && !line.startsWith('---'));
  const added = patch.split('\n').filter(line => line.startsWith('+') && !line.startsWith('+++'));
  assert.deepEqual(removed, ['-\t$$(MAKE) __tooldeps__']);
  assert.deepEqual(added, ['+\t$$(MAKE) __tooldeps__ nls/all']);
  const lock = JSON.parse(fs.readFileSync(new URL('./runtime-patches.lock.json', import.meta.url)));
  assert.ok(lock.patches.some(item => item.file === 'assets/proton-host-tools-nls.patch' && item.repository === 'proton'));
  assert.match(lock.expectedProtonSources['make/rules-wine-tools.mk'], /^[a-f0-9]{64}$/);
});
test('cross-architecture resource fixture needs NLS beside the shared host tool, not just in the client tree', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-sdk-nls-'));
  try {
    for (const name of ['source', 'host', 'client', 'host/nls', 'client/nls']) fs.mkdirSync(path.join(root, name));
    fs.writeFileSync(path.join(root, 'source/locale.nls'), 'synthetic locale fixture');
    fs.symlinkSync('../../source/locale.nls', path.join(root, 'client/nls/locale.nls'));
    fs.writeFileSync(path.join(root, 'host/Makefile'), '.PHONY: __tooldeps__ nls/all\n__tooldeps__:\n\tprintf host-tool > wrc\nnls/all: nls/locale.nls\nnls/locale.nls:\n\tln -s ../../source/locale.nls $@\n');
    fs.writeFileSync(path.join(root, 'client/Makefile'), '.PHONY: resources\nresources:\n\ttest -r ../host/wrc\n\ttest -r nls/locale.nls\n\ttest -r ../host/nls/locale.nls\n');
    const run = (name, args) => spawnSync('make', ['-j4', ...args], {cwd: path.join(root, name), encoding: 'utf8', timeout: 10000});
    assert.equal(run('host', ['__tooldeps__']).status, 0);
    assert.notEqual(run('client', ['resources']).status, 0, 'client NLS alone cannot satisfy the shared host tool lookup');
    const targets = patch.match(/^\+\t\$\$\(MAKE\) (.+)$/m)[1].split(' ');
    const fixed = run('host', targets);
    assert.equal(fixed.status, 0, fixed.stderr);
    assert.equal(run('client', ['resources']).status, 0);
    assert.equal(fs.readFileSync(path.join(root, 'host/nls/locale.nls'), 'utf8'), 'synthetic locale fixture');
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});
