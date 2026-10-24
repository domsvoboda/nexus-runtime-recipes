// SPDX-License-Identifier: MIT
import path from 'node:path';
import fs from 'node:fs/promises';
export function windowsAccountMetadataTicketSource(text) {
 const slice=(start,end)=>{const a=text.indexOf(start),b=text.indexOf(end,a+start.length);if(a<0||b<=a)throw Error('Unknown account metadata ticket boundaries');return text.slice(a,b);};
 return slice('static char *xml_child_content(', '\nHRESULT xodus_store_package_updates_xml(')+'\n'+slice('static HRESULT get_rps_tickets(', '\nstatic HRESULT device_auth(');
}
export function windowsAccountMetadataProbeBuilds({source,tests,project}) {
 return [64,32].map(bits=>({command:bits===64?'x86_64-w64-mingw32-gcc':'i686-w64-mingw32-gcc',args:[
  '-O2','-Wall','-Wextra','-Werror','-Werror=declaration-after-statement',
  '-I',path.join(source,'dlls/xgameruntime'),'-I',tests,path.join(project,'scripts/runtime-tests/windows-account-metadata-probe.c'),
  '-o',path.join(tests,'windows-account-metadata-'+bits+'-probe.exe'),'-ladvapi32']}));
}
export async function buildWindowsAccountMetadataProbes(options,run) {
 const source=await fs.readFile(path.join(options.source,'dlls/xgameruntime/xuser.c'),'utf8');
 await fs.writeFile(path.join(options.tests,'windows-account-ticket-adapter.inc'),windowsAccountMetadataTicketSource(source));
 for(const p of windowsAccountMetadataProbeBuilds(options))run(p.command,p.args,options.project);
}
