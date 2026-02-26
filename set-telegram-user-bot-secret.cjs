#!/usr/bin/env node
/**
 * Pone el secreto TELEGRAM_USER_BOT_TOKEN en Supabase (Edge Functions).
 * Requiere: npx supabase login (una vez) y tener .env con VITE_TELEGRAM_USER_BOT_TOKEN.
 * Uso: node set-telegram-user-bot-secret.cjs
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const envPath = path.join(__dirname, '.env')
if (!fs.existsSync(envPath)) {
  console.error('No hay archivo .env en la raíz del proyecto.')
  process.exit(1)
}

const envContent = fs.readFileSync(envPath, 'utf8')
const match = envContent.match(/VITE_TELEGRAM_USER_BOT_TOKEN=(.+)/)
const token = match ? match[1].trim().split(/\s*#/)[0].trim() : ''
if (!token) {
  console.error('En .env no está definido VITE_TELEGRAM_USER_BOT_TOKEN.')
  process.exit(1)
}

const projectRef = 'cdwvmtdvpwzjbdoywzyw' // de tu VITE_SUPABASE_URL
const secret = `TELEGRAM_USER_BOT_TOKEN=${token}`

try {
  execSync(`npx supabase secrets set ${secret} --project-ref ${projectRef}`, {
    stdio: 'inherit',
  })
  console.log('Secreto TELEGRAM_USER_BOT_TOKEN actualizado en Supabase.')
} catch (e) {
  console.error('Error. ¿Has hecho "npx supabase login"?')
  process.exit(1)
}
