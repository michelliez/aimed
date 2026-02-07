import dotenv from 'dotenv'
import pg from 'pg'

dotenv.config()

const { Client } = pg
const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  console.error('Missing DATABASE_URL in environment.')
  process.exit(1)
}

const interactions = [
  {
    ingredient_a: 'vitamin k2',
    ingredient_b: 'warfarin',
    severity: 'high',
    interaction: 'May reduce anticoagulant effectiveness',
    notes: 'Vitamin K can counteract warfarin. Monitor INR if combined.',
    evidence_url: 'https://ods.od.nih.gov/factsheets/VitaminK-Consumer/',
  },
  {
    ingredient_a: 'omega-3',
    ingredient_b: 'warfarin',
    severity: 'low',
    interaction: 'Possible bleeding risk increase',
    notes: 'Use caution with high doses; monitor for bleeding.',
    evidence_url: 'https://ods.od.nih.gov/factsheets/Omega3FattyAcids-Consumer/',
  },
  {
    ingredient_a: 'iron',
    ingredient_b: 'magnesium',
    severity: 'moderate',
    interaction: 'Absorption competition',
    notes: 'Separate dosing by 2-3 hours to reduce interference.',
    evidence_url: 'https://ods.od.nih.gov/factsheets/Iron-Consumer/',
  },
  {
    ingredient_a: "st. john's wort",
    ingredient_b: 'metformin',
    severity: 'moderate',
    interaction: 'Potential metabolism changes',
    notes: 'May affect blood sugar control. Monitor glucose.',
    evidence_url: 'https://ods.od.nih.gov/factsheets/StJohnsWort-Consumer/',
  },
]

const normalize = (value) => value.trim().toLowerCase()

const client = new Client({ connectionString })
await client.connect()

try {
  for (const item of interactions) {
    const ingredientA = normalize(item.ingredient_a)
    const ingredientB = normalize(item.ingredient_b)
    await client.query(
      `INSERT INTO interactions
        (ingredient_a, ingredient_b, severity, interaction, notes, evidence_url)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (ingredient_a, ingredient_b) DO NOTHING`,
      [
        ingredientA,
        ingredientB,
        item.severity,
        item.interaction,
        item.notes,
        item.evidence_url,
      ]
    )
  }
  console.log('Seeded interactions.')
} finally {
  await client.end()
}
