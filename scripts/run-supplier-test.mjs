import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'

const require = createRequire(import.meta.url)
const scriptsDir = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(scriptsDir, '..')
const nodeModules = path.join(repo, 'node_modules')

const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'garage-supplier-test-'))
const dbPath = path.join(tmpBase, 'test-garage-e2e.db')

const electronPath = require('electron')

function cleanup() {
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.rmSync(dbPath + suffix, { force: true }) } catch {}
  }
  try { fs.rmSync(tmpBase, { recursive: true, force: true }) } catch {}
}

let exitCode = 1
try {
  const bundle = path.join(tmpBase, 'supplier-test.mjs')
  await build({
    entryPoints: [path.join(scriptsDir, 'test-supplier-invoice.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    outfile: bundle,
    external: ['better-sqlite3', 'bindings'],
    alias: { electron: path.join(scriptsDir, 'electron-stub.mjs') },
    logLevel: 'warning',
  })

  console.log('\n########## (1) تشغيل سيناريوهات فاتورة المورد ##########')
  const scen = spawnSync(electronPath, [bundle], {
    stdio: 'inherit',
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_PATH: nodeModules,
      SIM_APPPATH: repo,
      GARAGE_DB_PATH: dbPath,
    },
  })

  exitCode = scen.status ?? 1
} finally {
  cleanup()
}
process.exit(exitCode)
