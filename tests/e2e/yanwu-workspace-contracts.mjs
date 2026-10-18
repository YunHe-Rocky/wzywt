import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { startYanwuHost } from './yanwu/host.mjs';

// Existing HTTP-fixture regressions mount the same actual workspace entry.
// No Next server, database, production connection or alternative mock UI is started.
const host = await startYanwuHost({
  entry: 'tests/e2e/yanwu/workspace-entry.tsx',
  aliases: {
    'next/navigation': 'tests/e2e/yanwu/workspace-navigation.tsx',
    '@/features/auth/client': 'tests/e2e/yanwu/workspace-auth.tsx',
    '@/features/auth/client/api': 'src/features/auth/client/api.ts',
    '@/features/resource-scheduler/client': 'tests/e2e/yanwu/workspace-resources.tsx',
  },
});

try {
  const suites = [
    'human-factors-regression',
    'room-archive-regression',
    'tactic-layer-regression',
  ].filter(name => !process.env.YANWU_CONTRACT || name === process.env.YANWU_CONTRACT);
  for (const suite of suites) {
    const status = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [`tests/e2e/${suite}.mjs`], {
        stdio: 'inherit',
        env: {
          ...process.env,
          E2E_BASE_URL: host.baseURL,
          E2E_BROWSER_PATH: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
        },
      });
      child.once('error', reject);
      child.once('exit', resolve);
    });
    assert.equal(status, 0, `${suite} must exit successfully`);
  }
  assert.deepEqual(host.violations, []);
} finally {
  await host.close();
}
