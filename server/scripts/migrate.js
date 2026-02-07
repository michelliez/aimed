import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import pg from 'pg'

dotenv.config()

const { Client } = pg

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const schemaPath = path.join(__dirname, 'schema.sql')
const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  console.error('Missing DATABASE_URL in environment.')
  process.exit(1)
}

const sql = await fs.readFile(schemaPath, 'utf8')

const client = new Client({ connectionString })
await client.connect()

try {
  await client.query(sql)
  console.log('Schema applied.')
} finally {
  await client.end()
}
