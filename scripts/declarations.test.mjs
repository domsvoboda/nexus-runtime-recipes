// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const patch = fs.readFileSync(new URL('../assets/wine-sdk-c-declarations.patch', import.meta.url), 'utf8');
const declarations = /\b(?:NTSTATUS status|DWORD attrs|int n, m|BOOL exists|WCHAR folderW\[FILES_PATH\]|BOOL view_existed|BOOL own_callback);/g;
const initialized = /\b(?:NTSTATUS|DWORD|int|BOOL) (status|attrs|n|m|exists|view_existed|own_callback) =/g;
const normalize = text => text.replace(declarations, '').replace(/DWORD read, attrs;/g, 'DWORD read;')
    .replace(initialized, '$1 =').replace(/\s+/g, '');

test('strict C patch only relocates declarations, preserving statement order and expressions', () => {
    const files = patch.split(/^diff --git /m).slice(1);
    assert.equal(files.length, 3);
    for (const file of files) {
        const before = [], after = [];
        for (const line of file.split('\n')) {
            if (/^(?:---|\+\+\+|@@|a\/)/.test(line)) continue;
            if (line.startsWith('-')) before.push(line.slice(1));
            else if (line.startsWith('+')) after.push(line.slice(1));
            else if (line.startsWith(' ')) { before.push(line.slice(1)); after.push(line.slice(1)); }
        }
        assert.equal(normalize(after.join('\n')), normalize(before.join('\n')), file.split('\n')[0]);
    }
});

test('strict C source patch is last and locked for all three changed source files', () => {
    const lock = JSON.parse(fs.readFileSync(new URL('./runtime-patches.lock.json', import.meta.url)));
    assert.equal(lock.patches.at(-1).file, 'assets/wine-sdk-c-declarations.patch');
    for (const name of ['xgamesave.c', 'xgamesavefiles.h', 'xthreading.c']) {
        assert.match(lock.expectedXgameruntimeSources['dlls/xgameruntime/' + name], /^[a-f0-9]{64}$/);
        assert.ok(patch.includes('diff --git a/dlls/xgameruntime/' + name));
    }
});
