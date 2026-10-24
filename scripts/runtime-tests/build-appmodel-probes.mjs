// SPDX-License-Identifier: MIT
import path from 'node:path';
export function appmodelProbeBuilds({tests,project}){
 return [64,32].map(bits=>({command:bits===64?'x86_64-w64-mingw32-gcc':'i686-w64-mingw32-gcc',args:['-O2','-Wall','-Wextra','-Werror','-municode',path.join(project,'scripts/runtime-tests/appmodel-probe.c'),'-o',path.join(tests,'appmodel-'+bits+'-probe.exe')]}));
}
export function buildAppmodelProbes(options,run){for(const p of appmodelProbeBuilds(options))run(p.command,p.args,options.project);}
