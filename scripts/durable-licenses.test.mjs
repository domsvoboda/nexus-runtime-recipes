// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const lock=JSON.parse(read('scripts/runtime-patches.lock.json'));
const licenses=read('assets/xgameruntime-durable-licenses.patch');
const hints=read('assets/xgameruntime-related-discovery.patch');

test('DLC runtime patches are independent, ordered and limited to Store implementation, not ABI or transport',()=>{
  const index=lock.patches.findIndex(row=>row.file==='assets/xgameruntime-durable-licenses.patch');
  assert.ok(index>=0);
  assert.deepEqual(lock.patches.slice(index,index+2).map(row=>row.file),['assets/xgameruntime-durable-licenses.patch','assets/xgameruntime-related-discovery.patch']);
  for(const later of lock.patches.slice(index+2)) {
    const text=read(later.file);
    if(later.file==='assets/xgameruntime-store-identity-diagnostics.patch') {
      const store=text.split('diff --git a/dlls/xgameruntime/xstore.c')[1].split('diff --git ')[0];
      const changed=prefix=>store.split('\n').filter(line=>line.startsWith(prefix)&&!line.startsWith(prefix.repeat(3))).map(line=>line.slice(1)).join('\n');
      const normalize=s=>s.replace(/^.*NEXUS_STORE_META\(.*$/gm,'').replace(/HRESULT hr = entitled_store_create\(user, storeContextHandle\);\s*return hr;/,'return entitled_store_create(user, storeContextHandle);').replace(/\s+/g,'');
      assert.equal(normalize(changed('+')),normalize(changed('-')),'diagnostics must preserve exact Store operations and return values');
      assert.doesNotMatch(text,/^diff --git a\/dlls\/xgameruntime\/xstore_/m,'no entitlement/provider changes');
    } else assert.doesNotMatch(text,/^diff --git a\/dlls\/xgameruntime\/xstore/m,later.file);
  }
  assert.deepEqual([...licenses.matchAll(/^diff --git a\/(\S+)/gm)].map(match=>match[1]).sort(),
    ['dlls/xgameruntime/xstore.c','dlls/xgameruntime/xstore_addon_license.h','dlls/xgameruntime/xstore_package_license.h']);
  assert.deepEqual([...hints.matchAll(/^diff --git a\/(\S+)/gm)].map(match=>match[1]),['dlls/xgameruntime/xstore_entitled.h']);
  assert.match(lock.expectedXgameruntimeSources['dlls/xgameruntime/xstore_addon_license.h'],/^[a-f0-9]{64}$/);
});

test('existing package acquisition retains stricter package requirement and new paths share receipt verification',()=>{
  assert.match(licenses,/store_license_from_snapshot\(snapshot, store, threading, TRUE, out\)/);
  assert.match(licenses,/store_license_from_snapshot\(snapshot, store, threading, FALSE, out\)/);
  assert.match(licenses,/entitled_fetch\(context->request, &context->canceled, &snapshot\)/);
  assert.match(licenses,/proof_until <= now/);
  assert.match(licenses,/min\(min\(snapshot->proof_until, game_until\)/);
});

test('native executable covers buffers, expiry, cancellation, real ABI and malformed hint boundaries',()=>{
  const probe=read('scripts/runtime-tests/store-entitlements-probe.c');
  for(const assertion of ['runtime-durable-invalid-context','runtime-addon-invalid-context','addon-count-repeat-not-consumed',
    'addon-short-buffer-retry','addon-long-token-not-truncated','addon-base-expiry','addon-worker-drained','related-hint-invalid-atomic','related-hint-limit-atomic'])
    assert.ok(probe.includes('"'+assertion+'"'),assertion);
  const build=read('scripts/build-proton.mjs');
  for(const capability of ['xstore-durable-license-v1','xstore-related-discovery-v1'])assert.ok(build.includes("'"+capability+"'"));
});
