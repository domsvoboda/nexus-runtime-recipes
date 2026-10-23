// SPDX-License-Identifier: MIT
export function verifyShaderVersion(configure, expected) {
  if (!/^[0-9]+\.[0-9]+(?:\.[0-9]+)?$/.test(expected ?? '')) throw Error('Invalid pinned shader version');
  const match = configure.match(/^AC_INIT\(\[vkd3d\],\[([0-9]+\.[0-9]+(?:\.[0-9]+)?)\]\)\s*$/m);
  if (!match || match[1] !== expected) throw Error('Pinned shader source version differs from recipe');
  return expected;
}
export function shaderProbeFlags(configure, expected) {
  return ['-std=c11', '-Wextra', '-Werror', '-DNEXUS_VKD3D_VERSION=' + JSON.stringify(verifyShaderVersion(configure, expected))];
}
