// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {verifyShaderVersion, shaderProbeFlags} from './shader-version.mjs';

const configure = 'AC_PREREQ([2.69])\nAC_INIT([vkd3d],[2.1])\n';
test('shader fixture is compiled with the exact verified pinned source version', () => {
  assert.equal(verifyShaderVersion(configure, '2.1'), '2.1');
  assert.deepEqual(shaderProbeFlags(configure, '2.1'), ['-std=c11', '-Wextra', '-Werror', '-DNEXUS_VKD3D_VERSION="2.1"']);
});
test('old source version metadata fails during preparation, before the SDK build', () => {
  assert.throws(() => shaderProbeFlags(configure, '2.0'), /source version differs/);
  const prepare = fs.readFileSync(new URL('./prepare-runtime.mjs', import.meta.url), 'utf8');
  assert.match(prepare, /verifyShaderVersion\(await fs.readFile\(path.join\(source,'vkd3d\/configure.ac'\)/);
});
for (const value of ['2.10', '2', '', 'latest', '2.1" bad', undefined]) test('reject mismatched or malformed shader version ' + value, () => {
  assert.throws(() => shaderProbeFlags(configure, value));
});
test('reject missing, commented or unrelated version declarations', () => {
  for (const source of ['', '# AC_INIT([vkd3d],[2.1])', 'AC_INIT([other],[2.1])']) assert.throws(() => shaderProbeFlags(source, '2.1'));
});
test('shader identity test remains exact and has no legacy version fallback', () => {
  const probe = fs.readFileSync(new URL('./runtime-tests/hlsl-state-keywords-probe.c', import.meta.url), 'utf8');
  assert.match(probe, /#ifndef NEXUS_VKD3D_VERSION\s*#error/);
  assert.match(probe, /"vkd3d-shader " NEXUS_VKD3D_VERSION/);
  assert.match(probe, /!memcmp\(header\+offset, expected, sizeof\(expected\)\)/);
  assert.doesNotMatch(probe, /vkd3d-shader 2\.0|#define NEXUS_VKD3D_VERSION/);
});
