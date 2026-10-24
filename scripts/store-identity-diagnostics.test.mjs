// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const patch = fs.readFileSync(new URL('../assets/xgameruntime-store-identity-diagnostics.patch', import.meta.url), 'utf8');
const header = patch.split('+++ b/dlls/xgameruntime/store-identity-diagnostics.h\n')[1]
    .split('\n').filter(line => line.startsWith('+')).map(line => line.slice(1)).join('\n');

test('Store diagnostics stay opt-in, existing-file-only and bounded', () => {
    assert.match(header, /GetEnvironmentVariableA\( "NEXUS_STORE_METADATA_LOG"/);
    assert.match(header, /OPEN_EXISTING/);
    assert.match(header, /size.QuadPart \+ length <= 65536/);
    assert.match(header, /FILE_TYPE_DISK/);
    assert.match(header, /FILE_ATTRIBUTE_DIRECTORY \| FILE_ATTRIBUTE_REPARSE_POINT/);
    assert.doesNotMatch(header, /CREATE_ALWAYS|OPEN_ALWAYS|CREATE_NEW/);
});

test('Store diagnostics preserve caller error and never wait for a log lock', () => {
    assert.match(header, /saved_error = GetLastError\(\)/);
    assert.match(header, /SetLastError\( saved_error \)/);
    assert.match(header, /if \(!TryAcquireSRWLockExclusive\( &lock \)\) goto done/);
    assert.match(header, /LOCKFILE_EXCLUSIVE_LOCK \| LOCKFILE_FAIL_IMMEDIATELY/);
    assert.doesNotMatch(header, /Sleep\(|WaitFor|AcquireSRWLockExclusive\( &lock \);/);
});

test('Store diagnostic schema accepts only numeric status, public IID and module-relative caller', () => {
    assert.match(header, /unsigned int api, HRESULT hr, unsigned int flags,/);
    assert.match(header, /const GUID \*iid, const void \*caller/);
    assert.match(header, /api < 1 \|\| api > 33 \|\| flags > 15/);
    assert.match(header, /rva = \(ULONG_PTR\)caller - \(ULONG_PTR\)module/);
    assert.match(header, /module_name\[81\] = "unknown"/);
    assert.doesNotMatch(header, /XUserHandle|XStoreContextHandle|serviceTicket|publisherUserId|xuid|msaAppId/);
    assert.doesNotMatch(header, /https?:\/\/|debugstr|TRACE\(|FIXME\(/);
});

test('Store API hooks do not replace existing unsupported or user results', () => {
    const before = [], after = [];
    for (const file of patch.split(/^diff --git /m).slice(1, 4)) {
        for (const line of file.split('\n')) {
            if (/^(?:---|\+\+\+|@@|a\/)/.test(line)) continue;
            if (line.startsWith('-')) before.push(line.slice(1));
            else if (line.startsWith('+')) after.push(line.slice(1));
            else if (line.startsWith(' ')) { before.push(line.slice(1)); after.push(line.slice(1)); }
        }
    }
    const normalize = lines => lines.join('\n')
        .replace(/^.*NEXUS_STORE_META\(.*$/gm, '')
        .replace(/^#include "store-identity-diagnostics.h"$/gm, '')
        .replace(/HRESULT hr = entitled_store_create\(user, storeContextHandle\);\s*return hr;/, 'return entitled_store_create(user, storeContextHandle);')
        .replace(/\s+/g, '');
    assert.equal(normalize(after), normalize(before));
});
