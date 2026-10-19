// Builds two Android test APKs from the same code: one member app, one
// partner app. The partner build sets VITE_PORTAL=partner, which is what
// /partner does on the web (see PORTAL in src/context/AppContext.jsx).
//
//   npm run apk                                  (backend on this laptop)
//   BACKEND=https://your-api.onrender.com npm run apk
//
// They land in apks/ as gigezee-member.apk and gigezee-partner.apk.
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const strings = join(root, 'android/app/src/main/res/values/strings.xml');
const builtApk = join(root, 'android/app/build/outputs/apk/debug/app-debug.apk');
const outDir = join(root, 'apks');

// This machine on the Wi-Fi, so a phone can reach the backend here
const lanIp = () => {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.family === 'IPv4' && !address.internal) return address.address;
    }
  }
  return '127.0.0.1';
};

const backend = process.env.BACKEND || `http://${lanIp()}:8001`;

const run = (command, args, env) => {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, ...env }
  });

  if (result.status !== 0) {
    console.error(`\nFAILED: ${command} ${args.join(' ')}`);
    process.exit(result.status || 1);
  }
};

const APPS = [
  { portal: 'member', name: 'GigEzee', file: 'gigezee-member.apk' },
  { portal: 'partner', name: 'GigEzee Partner', file: 'gigezee-partner.apk' }
];

const originalStrings = readFileSync(strings, 'utf8');

mkdirSync(outDir, { recursive: true });

console.log(`\nBoth apps will talk to: ${backend}`);
console.log('A phone can only reach that while it is on the same Wi-Fi.\n');

try {
  for (const app of APPS) {
    console.log(`\n=== Building the ${app.portal} app ===`);

    // The two apps share one id, so they are for separate phones; the
    // name is what tells them apart on the home screen
    writeFileSync(
      strings,
      originalStrings
        .replace(/(<string name="app_name">)[^<]*/, `$1${app.name}`)
        .replace(/(<string name="title_activity_main">)[^<]*/, `$1${app.name}`)
    );

    run('npx', ['vite', 'build', '--logLevel', 'error'], {
      VITE_PORTAL: app.portal,
      VITE_BACKEND_URL: backend
    });

    run('npx', ['cap', 'sync', 'android']);
    run(join(root, 'android/gradlew.bat'), ['-p', 'android', 'assembleDebug']);

    copyFileSync(builtApk, join(outDir, app.file));
    console.log(`BUILT ${app.file}`);
  }
} finally {
  // Never leave the project renamed
  writeFileSync(strings, originalStrings);
}

console.log('\nDone. Install these on the two phones:');
for (const app of APPS) console.log(`   ${join(outDir, app.file)}`);
