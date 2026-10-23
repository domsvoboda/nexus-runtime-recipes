// SPDX-License-Identifier: MIT
import test from 'node:test';import assert from 'node:assert/strict';
import {authMetadataProbeSource} from './build-auth-metadata-probes.mjs';
const source='OUTSIDE\nstatic void auth_metadata( void ) { REAL_LOGGER; }\nstatic inline struct XUser *impl_from_IUser OUTSIDE\nstatic HRESULT user_initialize_network( void ) { REAL_INIT; }\nstruct user_network_init { REAL_WORKER; };\n/* Bounded wait for the background identity/network initialization. */ OUTSIDE';
test('diagnostic fixture extracts the actual logger, initialization and retry worker',()=>{
 const result=authMetadataProbeSource(source);
 for(const marker of ['REAL_LOGGER','REAL_INIT','REAL_WORKER'])assert.ok(result.includes(marker));
 assert.ok(!result.includes('OUTSIDE'));
});
test('diagnostic extraction refuses changed source boundaries',()=>{
 for(const marker of ['static void auth_metadata(', '\nstatic inline struct XUser *impl_from_IUser','static HRESULT user_initialize_network(', '\n/* Bounded wait for the background identity/network initialization. */'])assert.throws(()=>authMetadataProbeSource(source.replace(marker,'missing')),/boundaries/);
});
