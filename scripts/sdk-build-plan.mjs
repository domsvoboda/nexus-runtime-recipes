// SPDX-License-Identifier: MIT
import path from 'node:path';

export function sdkContainerOption(engine = 'docker') {
  if (!['docker', 'podman'].includes(engine)) throw Error('Unsupported SDK container engine');
  return `--container-engine=${engine}`;
}

export function sdkBuildJobs(value = 4) {
  if (!/^(?:[1-9]|[12][0-9]|3[0-2])$/.test(String(value))) throw Error('Invalid SDK job count');
  return Number(value);
}

export function sdkBuildPlan(build, epoch, jobs = 4) {
  if (!path.isAbsolute(build) || !/^[0-9]+$/.test(epoch)) throw Error('Invalid SDK build inputs');
  const count = sdkBuildJobs(jobs);
  const common = [`-j${count}`, `J=${count}`, `SOURCE_DATE_EPOCH=${epoch}`];
  return [
    // Proton module64 does not depend on its host-tools stamp. A clean parallel
    // module build can otherwise launch a second WIDL make in the same tree.
    {name: 'Build shared Wine host tools before module submakes', args: [...common, path.join(build, '.wine-x86_64-tools')], timeout: 60*60*1000},
    {name: 'Check xgameruntime in both SDK architectures', args: [...common, 'module=xgameruntime', 'module'], timeout: 60*60*1000},
    {name: 'Build complete coherent Proton redistribution', args: [...common, 'redist'], timeout: 5*60*60*1000},
  ];
}
