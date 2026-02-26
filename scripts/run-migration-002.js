/**
 * Ejecuta la migración 002 (buscar_partida) en Supabase.
 * Requiere en .env: SUPABASE_DB_URL=postgresql://postgres.[ref]:[TU_PASSWORD]@...
 * (Supabase → Project Settings → Database → Connection string → URI)
 */
import 'dotenv/config'
import pg from 'pg'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL
if (!dbUrl) {
  console.error('Falta SUPABASE_DB_URL o DATABASE_URL en .env')
  console.error('Supabase → Project Settings → Database → Connection string (URI)')
  process.exit(1)
}

const sql = readFileSync(
  join(__dirname, '../supabase/migrations/002_buscar_partida_matchmaking.sql'),
  'utf-8'
)

const client = new pg.Client({ connectionString: dbUrl })

async function run() {
  try {
    await client.connect()
    await client.query(sql)
    console.log('Migración 002 aplicada correctamente (buscar_partida)')
  } catch (err) {
    console.error('Error:', err.message)
    process.exit(1)
  } finally {
    await client.end()
  }
}

run()
