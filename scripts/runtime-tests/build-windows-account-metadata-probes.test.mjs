// SPDX-License-Identifier: MIT
import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {windowsAccountMetadataProbeBuilds,windowsAccountMetadataTicketSource} from './build-windows-account-metadata-probes.mjs';
test('both ABI identity fixtures compile the actual prepared header with strict warnings',()=>{
 const options={source:'/prepared/wine',tests:'/private/tests',project:'/project'},plans=windowsAccountMetadataProbeBuilds(options);
 assert.deepEqual(plans.map(p=>p.command),['x86_64-w64-mingw32-gcc','i686-w64-mingw32-gcc']);
 for(const [i,p] of plans.entries()){
  for(const arg of ['-Werror','-Werror=declaration-after-statement','/prepared/wine/dlls/xgameruntime','-ladvapi32'])assert.ok(p.args.includes(arg));
  assert.ok(p.args.includes('/private/tests/windows-account-metadata-'+[64,32][i]+'-probe.exe'));
 }

});
test('fixture remains account-free and checks process, failure and real mismatch behavior',async()=>{
 const text=await fs.readFile(new URL('./windows-account-metadata-probe.c',import.meta.url),'utf8');
 for(const required of ['live foreign account cannot replace metadata','dead producer replaced','actual mismatch still published honestly','unmanaged keys preserved','manual change not overwritten','fault does not publish incomplete Xuid','--leave-volatile','--empty-only'])assert.ok(text.includes(required),required);
 assert.ok(!/https?:|XUserAddAsync|XboxLiveAuthorization|WinHttpSendRequest|connect\(/.test(text));
 assert.ok(text.includes('static HRESULT xodus_request(') && text.includes('fixture-response'));
});

test('ticket fixture extracts actual production boundaries without extra code',()=>{
 const source='static char *xml_child_content( REAL_CONTENT\nHRESULT xodus_store_package_updates_xml( OUTSIDE\nstatic HRESULT get_rps_tickets( REAL_TICKETS\nstatic HRESULT device_auth( OUTSIDE';
 const result=windowsAccountMetadataTicketSource(source);assert.ok(result.includes('REAL_CONTENT'));assert.ok(result.includes('REAL_TICKETS'));assert.ok(!result.includes('OUTSIDE'));
 assert.throws(()=>windowsAccountMetadataTicketSource(source.replace('static HRESULT device_auth(','missing')),/boundaries/);
});
