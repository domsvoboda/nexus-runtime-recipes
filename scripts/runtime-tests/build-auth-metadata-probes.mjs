// SPDX-License-Identifier: MIT
import fs from 'node:fs/promises';
import path from 'node:path';
export function authMetadataProbeSource(text) {
  const section=(start,end)=>{
    const a=text.indexOf(start),b=text.indexOf(end,a+start.length);
    if(a<0||b<=a)throw Error('Unknown authentication diagnostic source boundaries');
    return text.slice(a,b);
  };
  return section('static void auth_metadata(', '\nstatic inline struct XUser *impl_from_IUser')+'\n'+
    section('static HRESULT user_initialize_network(', '\n/* Bounded wait for the background identity/network initialization. */');
}
export async function buildAuthMetadataProbes({source,tests,project},run) {
  const text=await fs.readFile(path.join(source,'dlls/xgameruntime/xuser.c'),'utf8');
  await fs.writeFile(path.join(tests,'auth-metadata-adapter.inc'),authMetadataProbeSource(text));
  for(const bits of [64,32])run(bits===64?'x86_64-w64-mingw32-gcc':'i686-w64-mingw32-gcc',[
    '-O2','-Wall','-Wextra','-Werror','-I',tests,path.join(project,'scripts/runtime-tests/auth-metadata-probe.c'),
    '-o',path.join(tests,`auth-metadata-${bits}-probe.exe`),'-lole32'],project);
}
