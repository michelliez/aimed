import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'
import { parse } from 'csv-parse'
import pg from 'pg'

dotenv.config()

const { Client } = pg

const connectionString = process.env.DATABASE_URL
const dataDir = process.env.DSLD_DATA_DIR
const batchSize = Number(process.env.INGEST_BATCH_SIZE || 2000)

if (!connectionString) {
  console.error('Missing DATABASE_URL in environment.')
  process.exit(1)
}

if (!dataDir) {
  console.error('Missing DSLD_DATA_DIR in environment.')
  process.exit(1)
}

const TABLES = [
  {
    name: 'products',
    prefix: 'ProductOverview_',
    columns: [
      'url',
      'dsld_id',
      'product_name',
      'brand_name',
      'bar_code',
      'net_contents',
      'serving_size',
      'product_type',
      'supplement_form',
      'date_entered',
      'market_status',
      'suggested_use',
    ],
    mapping: {
      URL: 'url',
      'DSLD ID': 'dsld_id',
      'Product Name': 'product_name',
      'Brand Name': 'brand_name',
      'Bar Code': 'bar_code',
      'Net Contents': 'net_contents',
      'Serving Size': 'serving_size',
      'Product Type [LanguaL]': 'product_type',
      'Supplement Form [LanguaL]': 'supplement_form',
      'Date Entered into DSLD': 'date_entered',
      'Market Status': 'market_status',
      'Suggested Use': 'suggested_use',
    },
  },
  {
    name: 'supplement_facts',
    prefix: 'DietarySupplementFacts_',
    columns: [
      'url',
      'dsld_id',
      'product_name',
      'serving_size',
      'ingredient',
      'ingredient_category',
      'amount_per_serving',
      'amount_unit',
      'daily_value',
      'daily_value_target_group',
    ],
    mapping: {
      URL: 'url',
      'DSLD ID': 'dsld_id',
      'Product Name': 'product_name',
      'Serving Size': 'serving_size',
      Ingredient: 'ingredient',
      'DSLD Ingredient Categories': 'ingredient_category',
      'Amount Per Serving': 'amount_per_serving',
      'Amount Per Serving Unit': 'amount_unit',
      '% Daily Value per Serving': 'daily_value',
      'Daily Value Target Group': 'daily_value_target_group',
    },
  },
  {
    name: 'other_ingredients',
    prefix: 'OtherIngredients_',
    columns: ['url', 'dsld_id', 'product_name', 'other_ingredients'],
    mapping: {
      URL: 'url',
      'DSLD ID': 'dsld_id',
      'Product Name': 'product_name',
      'Other Ingredients': 'other_ingredients',
    },
  },
  {
    name: 'label_statements',
    prefix: 'LabelStatements_',
    columns: ['url', 'dsld_id', 'product_name', 'statement_type', 'statement'],
    mapping: {
      URL: 'url',
      'DSLD ID': 'dsld_id',
      'Product Name': 'product_name',
      'Statement Type': 'statement_type',
      Statement: 'statement',
    },
  },
  {
    name: 'company_information',
    prefix: 'CompanyInformation_',
    columns: [
      'url',
      'dsld_id',
      'product_name',
      'company_name',
      'address',
      'city',
      'state',
      'zip',
      'country',
      'manufacturer',
      'distributor',
      'packager',
      'reseller',
      'other',
    ],
    mapping: {
      URL: 'url',
      'DSLD ID': 'dsld_id',
      'Product Name': 'product_name',
      'Company Name': 'company_name',
      Address: 'address',
      City: 'city',
      State: 'state',
      ZIP: 'zip',
      Country: 'country',
      Manufacturer: 'manufacturer',
      Distributor: 'distributor',
      Packager: 'packager',
      Reseller: 'reseller',
      Other: 'other',
    },
  },
]

const client = new Client({ connectionString })
await client.connect()

const insertBatch = async (table, columns, rows) => {
  if (!rows.length) return
  const values = []
  const placeholders = rows
    .map((row, rowIndex) => {
      const offset = rowIndex * columns.length
      const rowPlaceholders = columns.map((_, colIndex) => `$${offset + colIndex + 1}`)
      values.push(...row)
      return `(${rowPlaceholders.join(',')})`
    })
    .join(',')

  const query = `INSERT INTO ${table} (${columns.join(',')}) VALUES ${placeholders}`
  await client.query(query, values)
}

const normalizeValue = (value) => {
  if (value === undefined || value === null) return null
  const trimmed = String(value).trim()
  return trimmed === '' ? null : trimmed
}

const ingestFile = async (tableConfig, filePath) => {
  const rows = []
  let processed = 0
  const parser = fs.createReadStream(filePath).pipe(
    parse({
      columns: true,
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true,
    })
  )

  for await (const record of parser) {
    const row = tableConfig.columns.map((column) => {
      const sourceKey = Object.keys(tableConfig.mapping).find(
        (key) => tableConfig.mapping[key] === column
      )
      const value = sourceKey ? record[sourceKey] : null
      if (column === 'dsld_id' && value) {
        const num = Number(value)
        return Number.isNaN(num) ? null : num
      }
      return normalizeValue(value)
    })

    rows.push(row)
    processed += 1

    if (rows.length >= batchSize) {
      await insertBatch(tableConfig.name, tableConfig.columns, rows.splice(0))
      if (processed % (batchSize * 10) === 0) {
        console.log(`${tableConfig.name}: ${processed.toLocaleString()} rows`)
      }
    }
  }

  if (rows.length) {
    await insertBatch(tableConfig.name, tableConfig.columns, rows)
  }

  console.log(`${tableConfig.name}: completed ${processed.toLocaleString()} rows`)
}

const findFiles = (prefix) => {
  const files = fs
    .readdirSync(dataDir)
    .filter((file) => file.startsWith(prefix) && file.endsWith('.csv'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  return files.map((file) => path.join(dataDir, file))
}

try {
  for (const table of TABLES) {
    const files = findFiles(table.prefix)
    if (!files.length) {
      console.warn(`No files found for prefix ${table.prefix}`)
      continue
    }

    for (const file of files) {
      console.log(`Ingesting ${file}`)
      await ingestFile(table, file)
    }
  }
} finally {
  await client.end()
}
