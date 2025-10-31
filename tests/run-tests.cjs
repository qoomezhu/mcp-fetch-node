const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const testsDir = path.resolve(__dirname);
const testFiles = [];

function collectTests(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectTests(fullPath);
    } else if (entry.name.endsWith('.test.ts')) {
      testFiles.push(fullPath);
    }
  }
}

collectTests(testsDir);

if (testFiles.length === 0) {
  console.log('No test files found.');
  process.exit(0);
}

const result = spawnSync(
  'node',
  ['--import', 'tsx', '--test', ...testFiles],
  {
    stdio: 'inherit',
    env: process.env,
  },
);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 0);
