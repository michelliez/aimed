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
    where = `WHERE product_name ILIKE $${params.length}`
  }
  const { rows } = await client.query(
    `SELECT dsld_id, product_name, brand_name
     FROM products
     ${where}
     ORDER BY product_name
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
      `SELECT dsld_id, product_name, brand_name
       FROM products
       WHERE product_name ILIKE $1
       ORDER BY product_name
       LIMIT 1`,
      [input]
    )

    if (productRows.length) {
      const product = productRows[0]
      const { rows: ingredientRows } = await client.query(
        `SELECT ingredient
         FROM supplement_facts
         WHERE dsld_id = $1`,
        [product.dsld_id]
      )
      const ingredients = ingredientRows
        .map((row) => row.ingredient)
        .filter(Boolean)
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

    const { rows: ingredientMatches } = await client.query(
      `SELECT DISTINCT ingredient
       FROM supplement_facts
       WHERE ingredient ILIKE $1
       ORDER BY ingredient
       LIMIT 1`,
      [input]
    )

    if (ingredientMatches.length) {
      const ingredient = ingredientMatches[0].ingredient
      ingredientSet.add(ingredient.toLowerCase())
      resolved.push({ input, type: 'ingredient', ingredient })
    } else {
      resolved.push({ input, type: 'unknown' })
    }
  }

  const ingredients = Array.from(ingredientSet)
  if (!ingredients.length) {
    return { interactions: [], resolved }
  }

  const { rows: interactionRows } = await client.query(
    `SELECT ingredient_a, ingredient_b, severity, interaction, notes, evidence_url
     FROM interactions
     WHERE ingredient_a = ANY($1) AND ingredient_b = ANY($1)`,
    [ingredients]
  )

  return { interactions: interactionRows, resolved }
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
      `SELECT dsld_id, product_name, brand_name, serving_size, supplement_form, suggested_use
       FROM products
       WHERE product_name ILIKE $1
       ORDER BY product_name
       LIMIT 1`,
      [trimmed]
    )

    if (productRows.length) {
      const product = productRows[0]
      
      // Get ingredients/supplement facts
      const { rows: ingredientRows } = await client.query(
        `SELECT ingredient, amount_per_serving, amount_unit
         FROM supplement_facts
         WHERE dsld_id = $1
         ORDER BY ingredient
         LIMIT 10`,
        [product.dsld_id]
      )

      productDetails.push({
        name: product.product_name,
        brand: product.brand_name,
        dose: ingredientRows[0]?.amount_per_serving || 'N/A',
        form: product.supplement_form || 'N/A',
        serving_size: product.serving_size || 'N/A',
        ingredients: ingredientRows.map((row) => row.ingredient),
        suggested_use: product.suggested_use || 'N/A'
      })
    }
  }

  return { comparison: [{ products: productDetails }] }
})

app.post('/recommendations', async (request, reply) => {
  const { symptoms = [], medicalHistory = [], currentMedications = [] } = request.body || {}

  if (!symptoms.length && !medicalHistory.length) {
    return { error: 'at_least_symptoms_or_history_required' }
  }

  const prompt = buildRecommendationPrompt(symptoms, medicalHistory, currentMedications)

  if (!k2ApiKey) {
    return { recommendation: getDefaultRecommendations(symptoms) }
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
            content: 'You are a knowledgeable supplement and wellness advisor. Provide evidence-based recommendations with clear disclaimers. Always prioritize safety and mention when professional consultation is needed.'
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
      return { recommendation: getDefaultRecommendations(symptoms) }
    }

    const data = await response.json()
    const recommendation = data.choices?.[0]?.message?.content || getDefaultRecommendations(symptoms)
    return { recommendation }
  } catch (error) {
    app.log.error({ err: error }, 'Recommendation request error')
    return { recommendation: getDefaultRecommendations(symptoms) }
  }
})

function buildRecommendationPrompt(symptoms, medicalHistory, currentMedications) {
  let prompt = 'Based on the following health profile, provide 3-5 supplement recommendations:\n\n'

  if (symptoms.length > 0) {
    prompt += `Health Goals/Symptoms: ${symptoms.join(', ')}\n`
  }

  if (medicalHistory.length > 0) {
    prompt += `Medical History: ${medicalHistory.join(', ')}\n`
  }

  if (currentMedications.length > 0) {
    prompt += `Current Medications/Supplements: ${currentMedications.join(', ')}\n`
  }

  prompt += `\nFor each recommendation, include:
1. Supplement name
2. Typical dose
3. Evidence level (strong/moderate/emerging)
4. How it helps with the stated symptoms
5. Any contraindications or interactions with current medications
6. Timing and dietary notes

IMPORTANT: Start with a clear safety disclaimer that these are informational only and require professional validation.`

  return prompt
}

function getDefaultRecommendations(symptoms) {
  const defaultText = `I need your health profile to give specific recommendations. To properly suggest supplements, I would need:

1. Your main health goals or symptoms (e.g., fatigue, sleep issues, joint pain)
2. Any medical conditions (e.g., high blood pressure, diabetes)
3. Current medications or supplements you're taking

Based on general wellness, here are some commonly researched supplements, but these are NOT personalized for you:

**Safety First**: Always consult with your healthcare provider before starting new supplements, especially if you have medical conditions or take medications.

Popular wellness supplements that are often studied:
- Vitamin D3: Supports bone health, immune function
- Omega-3 Fish Oil: Supports heart and brain health
- Magnesium: Supports sleep, muscle relaxation
- Probiotics: Support gut health
- B-Complex: Supports energy metabolism

To get personalized recommendations, provide your specific symptoms and health history.`

  return defaultText
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
