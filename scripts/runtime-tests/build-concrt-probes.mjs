// SPDX-License-Identifier: MIT
import path from 'node:path';
export function concrtProbeBuilds({tests,project}) {
  return ['vector','queue'].flatMap(kind=>[64,32].map(bits=>({
    command:bits===64?'x86_64-w64-mingw32-gcc':'i686-w64-mingw32-gcc',
    args:['-O2','-Wall','-Wextra','-Werror',path.join(project,`scripts/runtime-tests/concrt-${kind}-probe.c`),
      '-o',path.join(tests,`concrt-${kind}-${bits}-probe.exe`)],
  })));
}
export function buildConcrtProbes(options,run) {
  for(const plan of concrtProbeBuilds(options))run(plan.command,plan.args,options.project);
}
