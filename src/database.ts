import { createRequire } from 'node:module'
import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')

type BetterSqlite3 = import('better-sqlite3').Database

let db: BetterSqlite3

export function initDB(): void {
  const dbPath = path.join(app.getPath('userData'), 'garage.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // In packaged app: schema is placed next to the executable via extraResources.
  // In development: schema lives in electron/schema.sql.
  const schemaPath = app.isPackaged
    ? path.join(process.resourcesPath, 'schema.sql')
    : path.join(app.getAppPath(), 'electron', 'schema.sql')

  if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, 'utf-8')
    db.exec(schema)
  } else {
    console.warn('⚠️ schema.sql غير موجود في:', schemaPath)
  }

  console.log('✅ قاعدة البيانات جاهزة:', dbPath)
}

export function getDB(): BetterSqlite3 {
  if (!db) throw new Error('قاعدة البيانات لم تُهيَّأ بعد — استدع initDB() أولاً')
  return db
}
