import dotenv from 'dotenv'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import pg from 'pg'

dotenv.config()

const { Client } = pg
const app = Fastify({ logger: true })

await app.register(cors, {
  origin: true,
})

const connectionString = process.env.DATABASE_URL
const k2ApiUrl = process.env.K2_API_URL || 'https://api.k2think.ai/v1/chat/completions'
const k2ApiKey = process.env.K2_API_KEY
let client = null
let dbError = null

const connectDb = async () => {
  if (!connectionString) {
    dbError = new Error('Missing DATABASE_URL in environment.')
    return
  }
  try {
    client = new Client({ connectionString })
    await client.connect()
    dbError = null
  } catch (error) {
    dbError = error
    app.log.error({ err: error }, 'Failed to connect to database.')
  }
}

await connectDb()

app.get('/health', async () => {
  return { ok: true, db: dbError ? 'down' : 'up' }
})

app.get('/products', async (request) => {
  if (!client || dbError) {
    return { items: [], error: 'database_unavailable' }
  }
  const q = request.query.q?.trim()
  const limit = Math.min(Number(request.query.limit || 20), 100)
  const params = []
  let where = ''
  if (q) {
    params.push(`%${q}%`)
    where = `WHERE name ILIKE $${params.length}`
  }
  const { rows } = await client.query(
    `SELECT id, name, type, generic_name, brand_names
     FROM products
     ${where}
     ORDER BY name
     LIMIT ${limit}`,
    params
  )
  return { items: rows }
})

app.get('/ingredients', async (request) => {
  if (!client || dbError) {
    return { items: [], error: 'database_unavailable' }
  }
  const q = request.query.q?.trim()
  if (!q) {
    return { items: [] }
  }
  const { rows } = await client.query(
    `SELECT DISTINCT ingredient
     FROM supplement_facts
     WHERE ingredient ILIKE $1
     ORDER BY ingredient
     LIMIT 20`,
    [`%${q}%`]
  )
  return { items: rows.map((row) => row.ingredient) }
})

app.post('/mix', async (request) => {
  if (!client || dbError) {
    return { interactions: [], resolved: [], error: 'database_unavailable' }
  }

  const items = Array.isArray(request.body?.items) ? request.body.items : []
  if (!items.length) {
    return { interactions: [], resolved: [] }
  }

  const resolved = []
  const ingredientSet = new Set()

  for (const rawItem of items) {
    const input = String(rawItem).trim()
    if (!input) continue

    const { rows: productRows } = await client.query(
      `SELECT id, name, type, active_ingredients, generic_name
       FROM products
       WHERE LOWER(name) ILIKE $1
       ORDER BY name
       LIMIT 1`,
      [input.toLowerCase()]
    )

    if (productRows.length) {
      const product = productRows[0]
      const ingredients = product.active_ingredients || []
      ingredients.forEach((ingredient) =>
        ingredientSet.add(ingredient.toLowerCase())
      )
      resolved.push({
        input,
        type: 'product',
        product,
        ingredients,
      })
      continue
    }

    // Treat as ingredient if not found
    resolved.push({ input, type: 'ingredient', ingredient: input })
    ingredientSet.add(input.toLowerCase())
  }

  const ingredients = Array.from(ingredientSet)
  if (!ingredients.length) {
    return { interactions: [], resolved }
  }

  // Return empty interactions since we don't have interaction data yet
  return { interactions: [], resolved }
})

app.post('/compare', async (request) => {
  if (!client || dbError) {
    return { comparison: [], error: 'database_unavailable' }
  }

  const productNames = Array.isArray(request.body?.products) ? request.body.products : []
  if (productNames.length < 2) {
    return { comparison: [], error: 'at_least_two_products_required' }
  }

  const productDetails = []

  for (const productName of productNames) {
    const trimmed = String(productName).trim()
    if (!trimmed) continue

    // Find product in database
    const { rows: productRows } = await client.query(
      `SELECT id, name, type, generic_name, brand_names, dosage_form, strength, description, active_ingredients
       FROM products
       WHERE LOWER(name) ILIKE $1
       ORDER BY name
       LIMIT 1`,
      [trimmed.toLowerCase()]
    )

    if (productRows.length) {
      const product = productRows[0]
      productDetails.push({
        name: product.name,
        type: product.type,
        generic_name: product.generic_name || 'N/A',
        brand: Array.isArray(product.brand_names) ? product.brand_names.join(', ') : 'N/A',
        form: product.dosage_form || 'N/A',
        strength: product.strength || 'N/A',
        description: product.description || 'N/A',
        active_ingredients: product.active_ingredients || []
      })
    }
  }

  return { comparison: [{ products: productDetails }] }
})

app.post('/recommendations', async (request) => {
  const {
    symptoms = [],
    medications = [],
    supplements = [],
    medicalConsiderations = {},
    preferences = {},
  } = request.body || {}

  const cleanedSymptoms = sanitizeList(symptoms)
  const cleanedMeds = sanitizeList(medications)
  const cleanedSupps = sanitizeList(supplements)

  if (!cleanedSymptoms.length && !cleanedMeds.length && !cleanedSupps.length) {
    return { error: 'at_least_symptoms_or_meds_required' }
  }

  const safety = evaluateSafety({
    symptoms: cleanedSymptoms,
    medications: cleanedMeds,
    supplements: cleanedSupps,
    medicalConsiderations,
    preferences,
  })

  if (safety.blocked) {
    return {
      blocked: true,
      warnings: safety.warnings,
      nextSteps: safety.nextSteps,
      disclaimer: safety.disclaimer,
    }
  }

  const prompt = buildRecommendationPrompt({
    symptoms: cleanedSymptoms,
    medications: cleanedMeds,
    supplements: cleanedSupps,
    medicalConsiderations,
    preferences,
    safetyWarnings: safety.warnings,
  })

  if (!k2ApiKey) {
    return getDefaultRecommendationPayload({
      symptoms: cleanedSymptoms,
      warnings: safety.warnings,
    })
  }

  try {
    const response = await fetch(k2ApiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${k2ApiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        model: 'MBZUAI-IFM/K2-Think-v2',
        messages: [
          {
            role: 'system',
            content: 'You provide educational, safety-first information about medications and supplements. Never diagnose, never give dosing instructions, and never claim "best" or "most effective". Always include a clear medical disclaimer.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        stream: false
      })
    })

    if (!response.ok) {
      const errText = await response.text()
      app.log.error({ status: response.status, error: errText }, 'K2 recommendation failed')
      return getDefaultRecommendationPayload({
        symptoms: cleanedSymptoms,
        warnings: safety.warnings,
      })
    }

    const data = await response.json()
    const raw = data.choices?.[0]?.message?.content
    const parsed = parseK2Json(raw)
    if (!parsed) {
      return getDefaultRecommendationPayload({
        symptoms: cleanedSymptoms,
        warnings: safety.warnings,
      })
    }

    return {
      ...parsed,
      warnings: Array.from(new Set([...(parsed.warnings || []), ...safety.warnings])),
    }
  } catch (error) {
    app.log.error({ err: error }, 'Recommendation request error')
    return getDefaultRecommendationPayload({
      symptoms: cleanedSymptoms,
      warnings: safety.warnings,
    })
  }
})

function sanitizeList(items) {
  if (!Array.isArray(items)) return []
  return items
    .map((item) => String(item || '').trim())
    .filter(Boolean)
}

function normalize(value) {
  return String(value || '').toLowerCase().trim()
}

function includesAny(list, keywords) {
  return list.some((item) => keywords.some((keyword) => item.includes(keyword)))
}

function evaluateSafety({ symptoms, medications, supplements, medicalConsiderations, preferences }) {
  const warnings = []
  const nextSteps = [
    'Ask a pharmacist about interaction risks with your current medications.',
    'Bring a full list of meds/supplements to your next appointment.',
    'Ask what labs or history are relevant before adding new products.'
  ]

  const meds = medications.map(normalize)
  const supps = supplements.map(normalize)
  const combined = [...meds, ...supps]

  if (medicalConsiderations?.pregnancy) {
    warnings.push('Pregnancy requires clinician review before adding supplements or medications.')
  }

  if (medicalConsiderations?.kidneyLiverIssues) {
    warnings.push('Kidney/liver issues can change drug clearance and increase risk.')
  }

  if (includesAny(meds, ['warfarin', 'coumadin'])) {
    warnings.push('Warfarin has significant interaction risks with many supplements and foods.')
    warnings.push('Warfarin can interact with vitamin K, fish oil, ginkgo, ginseng, garlic, and turmeric.')
  }

  if (includesAny(meds, ['lithium'])) {
    warnings.push('Lithium interactions can be serious and require close monitoring.')
    warnings.push('Lithium interacts with many OTC meds and supplements; clinician review is required.')
  }

  if (includesAny(meds, ['maoi', 'monoamine oxidase inhibitor'])) {
    warnings.push('MAOI medications have high-risk interaction profiles.')
    warnings.push('MAOIs require strict interaction screening for OTC and supplements.')
  }

  if (includesAny(meds, ['sertraline', 'fluoxetine', 'escitalopram', 'citalopram', 'paroxetine'])) {
    warnings.push('SSRIs can interact with serotonergic supplements (e.g., St. John\'s wort, 5-HTP, SAMe).')
  }

  if (medicalConsiderations?.bloodPressureConcerns) {
    warnings.push('Stimulants, decongestants, and high-caffeine products can raise blood pressure.')
  }

  if (preferences?.avoidDrowsiness) {
    warnings.push('Avoid sedating options if you need to stay alert or drive.')
  }

  if (preferences?.avoidStimulants) {
    warnings.push('Avoid stimulant-like ingredients (e.g., high caffeine, yohimbine).')
  }

  const disclaimer = 'Not medical advice. This tool provides educational information only and cannot diagnose, treat, or recommend specific medications. Always consult a licensed healthcare professional.'

  if (symptoms.length === 0 && combined.length > 0) {
    warnings.push('No symptoms were provided, so educational options will be broad and non-specific.')
  }

  return {
    blocked: false,
    warnings,
    nextSteps,
    disclaimer,
  }
}

function buildRecommendationPrompt({
  symptoms,
  medications,
  supplements,
  medicalConsiderations,
  preferences,
  safetyWarnings,
}) {
  const info = [
    `Symptoms: ${symptoms.length ? symptoms.join(', ') : 'None provided'}`,
    `Medications: ${medications.length ? medications.join(', ') : 'None listed'}`,
    `Supplements: ${supplements.length ? supplements.join(', ') : 'None listed'}`,
    `Medical considerations: ${formatConsiderations(medicalConsiderations)}`,
    `Preferences: ${formatPreferences(preferences)}`,
    `Safety notes: ${safetyWarnings.length ? safetyWarnings.join(' | ') : 'None'}`,
  ].join('\n')

  return `Use the profile below to generate educational options.\n\n${info}\n\nRules:\n- Provide educational options only (no prescriptions, no dosing).\n- Do not diagnose or claim "best" treatment.\n- Include evidence strength and interaction risk for each option.\n- Highlight who should avoid it and key cautions.\n- Add personalized warnings based on the profile.\n- Provide next-step questions for a clinician/pharmacist.\n\nReturn ONLY valid JSON with this shape:\n{\n  "disclaimer": string,\n  "warnings": string[],\n  "recommendations": [\n    {\n      "option": string,\n      "category": "Supplement"|"OTC medication"|"Lifestyle"|"Prescription"|"Other",\n      "whyDiscussed": string,\n      "keyCautions": string,\n      "evidenceStrength": "High"|"Moderate"|"Limited",\n      "interactionRisk": "Low"|"Medium"|"High",\n      "avoidIf": string\n    }\n  ],\n  "nextSteps": string[]\n}`
}

function formatConsiderations(considerations = {}) {
  const entries = []
  if (considerations.pregnancy) entries.push('Pregnancy')
  if (considerations.allergies) entries.push('Allergies')
  if (considerations.kidneyLiverIssues) entries.push('Kidney/liver issues')
  if (considerations.bloodPressureConcerns) entries.push('Blood pressure concerns')
  return entries.length ? entries.join(', ') : 'None'
}

function formatPreferences(preferences = {}) {
  const entries = []
  if (preferences.preferenceType) entries.push(preferences.preferenceType)
  if (preferences.avoidDrowsiness) entries.push('Avoid drowsiness')
  if (preferences.avoidStimulants) entries.push('Avoid stimulants')
  return entries.length ? entries.join(', ') : 'None'
}

function parseK2Json(raw) {
  if (!raw) return null
  let text = String(raw)

  // Strip K2 Think reasoning block (everything up to and including </think>)
  const thinkEnd = text.indexOf('</think>')
  if (thinkEnd !== -1) {
    text = text.substring(thinkEnd + '</think>'.length)
  }

  text = text.trim()

  // Strip markdown code fences
  text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '')
  text = text.trim()

  // Try parsing directly
  try {
    return JSON.parse(text)
  } catch {
    // Fallback: find first { and last } to extract JSON object
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(text.substring(start, end + 1))
      } catch {
        return null
      }
    }
    return null
  }
}

function getDefaultRecommendationPayload({ symptoms, warnings }) {
  return {
    disclaimer: '🚨 Not medical advice. This tool provides educational information only and cannot diagnose, treat, or recommend specific medications. Always consult a licensed healthcare professional.',
    warnings,
    recommendations: [
      {
        option: 'Magnesium glycinate',
        category: 'Supplement',
        whyDiscussed: 'Commonly discussed for sleep support and muscle relaxation.',
        keyCautions: 'Can interact with some antibiotics and cause GI upset.',
        evidenceStrength: 'Moderate',
        interactionRisk: 'Medium',
        avoidIf: 'Significant kidney disease or on interacting antibiotics.'
      },
      {
        option: 'Sleep hygiene routines',
        category: 'Lifestyle',
        whyDiscussed: 'Behavioral changes can improve sleep consistency and quality.',
        keyCautions: 'None specific; align with clinician guidance for complex cases.',
        evidenceStrength: 'High',
        interactionRisk: 'Low',
        avoidIf: 'N/A'
      }
    ],
    nextSteps: [
      'Ask a clinician if any listed options conflict with your current medications.',
      'Ask whether labs (e.g., vitamin D, iron, B12) are appropriate for your symptoms.',
      'Bring a full medication and supplement list to your next appointment.'
    ]
  }
}

app.post('/k2/chat', async (request, reply) => {
  if (!k2ApiKey) {
    reply.code(500)
    return { error: 'missing_k2_api_key' }
  }

  const { messages, model, stream } = request.body || {}
  if (!Array.isArray(messages) || messages.length === 0) {
    reply.code(400)
    return { error: 'messages_required' }
  }

  const payload = {
    model: model || 'MBZUAI-IFM/K2-Think-v2',
    messages,
    stream: Boolean(stream)
  }

  try {
    const response = await fetch(k2ApiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${k2ApiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const errText = await response.text()
      reply.code(response.status)
      return { error: 'k2_request_failed', details: errText }
    }

    const data = await response.json()
    return data
  } catch (error) {
    app.log.error({ err: error }, 'K2 Think request failed')
    reply.code(500)
    return { error: 'k2_request_error' }
  }
})

const port = Number(process.env.PORT || 5000)
app.listen({ port, host: '0.0.0.0' })
