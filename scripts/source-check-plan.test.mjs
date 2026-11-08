// SPDX-License-Identifier: MIT
// Focused regression for the auditable recipe source-check plan. It only
// builds and inspects plans; it never executes the full plan or a native
// fixture.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {
  MODES, SOURCE_ONLY_MARKER, TEST_GROUPS, NATIVE_TEST_FILES, assertTestPath,
  enumerateTestFiles, resolveMode, readEventContext, buildPlan,
  assertNoUnreviewedCompilers, planSummary,
} from './source-check-plan.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modulePath = path.join(repository, 'scripts/source-check-plan.mjs');
const workflowPath = path.join(repository, '.github/workflows/source.yml');

async function independentTestFiles() {
  const files = [];
  for (const group of TEST_GROUPS) {
    for (const entry of await fs.readdir(path.join(repository, ...group.split('/')), {withFileTypes: true})) {
      if (!entry.isFile() || !entry.name.endsWith('.test.mjs')) continue;
      if (group === 'scripts/runtime-tests' && !entry.name.startsWith('build-')) continue;
      files.push(group + '/' + entry.name);
    }
  }
  return files.sort();
}

async function eventFile(payload) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nexus-source-plan-'));
  const file = path.join(directory, 'event.json');
  await fs.writeFile(file, JSON.stringify(payload));
  return file;
}

function detectMode(eventName, eventPath) {
  return spawnSync(process.execPath, [modulePath, '--detect-mode'], {
    cwd: repository,
    encoding: 'utf8',
    env: {...process.env, GITHUB_EVENT_NAME: eventName, GITHUB_EVENT_PATH: eventPath, GITHUB_STEP_SUMMARY: ''},
  });
}

test('the default full plan selects every existing test file and omits nothing', async () => {
  const expected = await independentTestFiles();
  const plan = await buildPlan({mode: 'full', root: repository});
  assert.equal(plan.mode, 'full');
  assert.deepEqual([...plan.allFiles], expected);
  assert.deepEqual([...plan.selected], expected);
  assert.deepEqual([...plan.omittedNative], []);
  for (const file of NATIVE_TEST_FILES) assert.ok(plan.selected.includes(file), file);
});

test('explicit source-only mode excludes exactly the reviewed native fixture files', async () => {
  const expected = (await independentTestFiles()).filter(file => !NATIVE_TEST_FILES.includes(file));
  const plan = await buildPlan({mode: 'source-only', root: repository});
  await assertNoUnreviewedCompilers(plan.selected, repository);
  assert.deepEqual([...NATIVE_TEST_FILES], [
    'scripts/sdk-build-plan.test.mjs',
    'scripts/sdk-nls.test.mjs',
  ]);
  assert.deepEqual([...plan.selected], expected);
  assert.deepEqual([...plan.omittedNative], [...NATIVE_TEST_FILES]);
  for (const file of NATIVE_TEST_FILES) {
    assert.ok(plan.allFiles.includes(file), file + ' must still be enumerated');
    assert.ok(!plan.selected.includes(file), file + ' must not run in source-only mode');
  }
});

test('a missing reviewed native fixture fails closed instead of silently widening source-only', async () => {
  const all = await independentTestFiles();
  for (const missing of NATIVE_TEST_FILES) {
    const remaining = all.filter(file => file !== missing);
    for (const mode of ['full', 'source-only']) {
      await assert.rejects(buildPlan({mode, files: remaining, root: repository}), /stale; missing expected file/);
    }
  }
});

test('unknown, empty and injected modes are rejected before any test runs', async () => {
  for (const mode of ['FULL', 'source-only ', 'full; echo pwned', 'source_only', 'all', '', null, undefined]) {
    await assert.rejects(buildPlan({mode, root: repository}), /Unsupported source-check mode/);
  }
  for (const mode of ['FULL', 'full; echo pwned', 'source_only', '']) {
    const result = spawnSync(process.execPath, [modulePath, '--mode', mode], {cwd: repository, encoding: 'utf8'});
    assert.notEqual(result.status, 0, mode);
    assert.match(result.stderr, /Unsupported source-check mode/, mode);
    assert.ok(!result.stdout.includes('Source-check mode: full'), 'a rejected mode must not start a full run');
  }
});

test('only an explicit source-only marker selects the noncompiling plan', async () => {
  assert.equal(resolveMode({eventName: 'push', headCommitMessage: 'ordinary source change'}), 'full');
  assert.equal(resolveMode({eventName: 'push', headCommitMessage: '[source-only] source sync'}), 'source-only');
  assert.equal(resolveMode({eventName: 'pull_request', pullRequestTitle: '[source-only] source sync'}), 'source-only');
  assert.equal(resolveMode({eventName: 'pull_request', pullRequestTitle: 'ordinary source change'}), 'full');
  assert.equal(resolveMode({eventName: 'workflow_dispatch'}), 'full');
  assert.equal(resolveMode({}), 'full');
  assert.equal(SOURCE_ONLY_MARKER, '[source-only]');
  assert.deepEqual(MODES, ['full', 'source-only']);

  const sourceOnly = await eventFile({head_commit: {message: '[source-only] Integrate verified source'}});
  const full = await eventFile({head_commit: {message: 'ordinary integration'}});
  const injected = await eventFile({head_commit: {message: 'mode=full\n[source-only]'}});
  try {
    assert.equal(detectMode('push', sourceOnly).stdout, 'mode=source-only\n');
    assert.equal(detectMode('push', full).stdout, 'mode=full\n');
    assert.equal(detectMode('push', injected).stdout, 'mode=source-only\n');
    assert.equal(detectMode('workflow_dispatch', sourceOnly).stdout, 'mode=full\n');
  } finally {
    await fs.rm(path.dirname(sourceOnly), {recursive: true, force: true});
    await fs.rm(path.dirname(full), {recursive: true, force: true});
    await fs.rm(path.dirname(injected), {recursive: true, force: true});
  }
});

test('source-only selection refuses unreviewed compiler invocations', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nexus-source-plan-'));
  try {
    await fs.mkdir(path.join(directory, 'scripts'), {recursive: true});
    const command = ['execFile', 'Sync'].join('');
    await fs.writeFile(path.join(directory, 'scripts/compile.test.mjs'),
      "import {spawnSync} from 'node:child_process';\n" + command + '(' + JSON.stringify('gcc') + ", ['-c', 'x.c']);\n");
    await assert.rejects(assertNoUnreviewedCompilers(['scripts/compile.test.mjs'], directory), /unreviewed compiler invocations/);
  } finally {
    await fs.rm(directory, {recursive: true, force: true});
  }
});

test('the omission summary is honest and only appears in source-only mode', async () => {
  const sourceOnly = planSummary(await buildPlan({mode: 'source-only', root: repository}));
  const text = sourceOnly.join('\n');
  assert.match(text, /Native fixture tests omitted \(NOT run, NOT passed, no native coverage\)/);
  assert.match(text, /remain unverified/);
  for (const file of NATIVE_TEST_FILES) assert.match(text, new RegExp('omitted ' + file.replaceAll('.', '\\.')));
  const full = planSummary(await buildPlan({mode: 'full', root: repository})).join('\n');
  assert.doesNotMatch(full, /omitted/);
  assert.match(full, /including native build fixtures/);
});

test('unsafe, foreign and non-test paths are rejected', async () => {
  const unsafe = [
    '../scripts/sdk-build-plan.test.mjs',
    '/scripts/sdk-build-plan.test.mjs',
    'scripts/../scripts/sdk-build-plan.test.mjs',
    'scripts\\sdk-build-plan.test.mjs',
    'scripts//sdk-build-plan.test.mjs',
    'scripts/nested/sdk-build-plan.test.mjs',
    'scripts/sdk-build-plan.mjs',
    'scripts/sdk-build-plan.test.mjs ',
    'scripts/runtime-tests/run-media-suite.mjs',
  ];
  for (const file of unsafe) assert.throws(() => assertTestPath(file), /Unsafe test path|outside the reviewed source-check groups/, file);
});

test('the workflow keeps full checks by default and gates only explicit source-only runs', async () => {
  const source = await fs.readFile(workflowPath, 'utf8');
  assert.match(source, /node scripts\/source-check-plan\.mjs --detect-mode/);
  assert.match(source, /steps\.mode\.outputs\.mode == 'full'/);
  assert.match(source, /steps\.mode\.outputs\.mode == 'source-only'/);
  assert.match(source, /node scripts\/source-check-plan\.mjs --mode source-only/);
  assert.match(source, /npm test/);
  assert.match(source, /npm run check/);
  assert.match(source, /prepare-runtime\.mjs/);
  assert.doesNotMatch(source, /\[skip ci\]/);
  assert.ok(source.indexOf('--detect-mode') < source.indexOf('npm test'));
  const build = await fs.readFile(path.join(repository, '.github/workflows/build.yml'), 'utf8');
  assert.equal((build.match(/'\[source-only\]'/g) ?? []).length, 2);
  assert.doesNotMatch(build, /\[skip ci\]/);
});
