/**
 * Ejecuta la migración 003 (chat y transferencias) en Supabase.
 * Requiere en .env: SUPABASE_DB_URL=postgresql://...
 */
import 'dotenv/config'
import pg from 'pg'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL

if (!dbUrl) {
  console.error('Falta SUPABASE_DB_URL en .env')
  process.exit(1)
}

const sql = readFileSync(join(__dirname, '../supabase/migrations/003_chat_y_transferencias.sql'), 'utf-8')
const client = new pg.Client({ connectionString: dbUrl })

async function run() {
  try {
    await client.connect()
    await client.query(sql)
    console.log('Migración 003 aplicada (chat y transferencias)')
  } catch (err) {
    console.error('Error:', err.message)
    process.exit(1)
  } finally {
    await client.end()
  }
}

run()
