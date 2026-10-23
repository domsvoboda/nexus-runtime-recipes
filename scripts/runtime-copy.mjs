// SPDX-License-Identifier: MIT
import fs from 'node:fs/promises';
// Preserve Proton's relative prefix links, not references to mutable SDK output.
export function copySdkRedistribution(source,target) {
  return fs.cp(source,target,{recursive:true,errorOnExist:true,force:false,dereference:false,verbatimSymlinks:true});
}
