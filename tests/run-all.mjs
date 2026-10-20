// Runs every test: the app build, the booking screen logic and the
// server logic. The server tests use a temporary in-memory database, so
// the real Supabase data is never touched.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const venvPython = join(
  root,
  'backend',
  '.venv',
  process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'
);
const python = existsSync(venvPython) ? venvPython : 'python';

const steps = [
  // Built into a temporary folder so the real dist/ is left alone
  ['1. Building the app', 'npx', [
    'vite', 'build', '--logLevel', 'error', '--emptyOutDir',
    '--outDir', `"${join(tmpdir(), 'gigezee-test-build')}"`
  ], root],
  ['2. Booking screen tests', process.execPath, ['tests/bookFor.test.mjs'], root],
  ['3. Server tests', python, ['-W', 'ignore', 'tests/test_booking_for.py'], join(root, 'backend')],
  ['4. AI diagnosis tests', python, ['-W', 'ignore', 'tests/test_diagnosis.py'], join(root, 'backend')],
  ['5. Job photo tests', python, ['-W', 'ignore', 'tests/test_photo.py'], join(root, 'backend')],
  ['6. Nearby partner tests', python, ['-W', 'ignore', 'tests/test_nearby_partners.py'], join(root, 'backend')]
];

let failed = 0;

for (const [title, command, args, cwd] of steps) {
  console.log(`\n=== ${title} ===`);

  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: command === 'npx',
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
  });

  if (result.status !== 0) {
    failed += 1;
    console.log(`FAILED: ${title}`);
  } else if (title.startsWith('1.')) {
    console.log('PASS app builds with no errors');
  }
}

console.log(failed ? `\n${failed} step(s) failed` : '\nALL TESTS PASSED');
process.exit(failed ? 1 : 0);
