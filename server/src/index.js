import dotenv from 'dotenv'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { createClient } from '@supabase/supabase-js'

dotenv.config()

const app = Fastify({ logger: true })

await app.register(cors, {
  origin: true,
})

// ✅ NEW: Supabase client instead of pg
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
)

const k2ApiUrl = process.env.K2_API_URL || 'https://api.k2think.ai/v1/chat/completions'
const k2ApiKey = process.env.K2_API_KEY

app.get('/health', async () => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('count')
      .limit(1)
    
    return { ok: true, db: error ? 'down' : 'up' }
  } catch (err) {
    return { ok: true, db: 'down' }
  }
})

app.get('/products', async (request) => {
  const q = request.query.q?.trim()
  const limit = Math.min(Number(request.query.limit || 20), 100)

  try {
    let query = supabase
      .from('products')
      .select('id, name, type, generic_name, brand_names')
      .order('name')
      .limit(limit)

    if (q) {
      query = query.ilike('name', `%${q}%`)
    }

    const { data, error } = await query

    if (error) throw error

    return { items: data || [] }
  } catch (error) {
    app.log.error({ err: error }, 'Products query failed')
    return { items: [], error: 'database_unavailable' }
  }
})

app.get('/ingredients', async (request) => {
  const q = request.query.q?.trim()
  if (!q) {
    return { items: [] }
  }

  try {
    const { data, error } = await supabase
      .from('supplement_facts')
      .select('ingredient')
      .ilike('ingredient', `%${q}%`)
      .order('ingredient')
      .limit(20)

    if (error) throw error

    const items = [...new Set(data.map(row => row.ingredient))]
    return { items }
  } catch (error) {
    app.log.error({ err: error }, 'Ingredients query failed')
    return { items: [], error: 'database_unavailable' }
  }
})

app.post('/mix', async (request) => {
  const items = Array.isArray(request.body?.items) ? request.body.items : []
  if (!items.length) {
    return { interactions: [], resolved: [] }
  }

  const cleanItems = items.map(i => String(i).trim()).filter(Boolean)
  if (!cleanItems.length) {
    return { interactions: [], resolved: [] }
  }

  try {
    // Query products matching input items
    const { data: productRows, error } = await supabase
      .from('products')
      .select('id, name, type, active_ingredients, generic_name')
      .or(cleanItems.map(item => `name.ilike.${item}%`).join(','))
      .order('name')

    if (error) throw error

    // Build product map
    const productMap = new Map()
    productRows.forEach(p => {
      productMap.set(p.name.toLowerCase(), p)
    })

    const resolved = []
    const ingredientSet = new Set()

    for (const rawItem of items) {
      const input = String(rawItem).trim()
      if (!input) continue

      const product = productMap.get(input.toLowerCase())

      if (product) {
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

    // Get product IDs for interaction check
    const productIds = productRows.map(p => p.id)

    if (productIds.length >= 2) {
      // Check for interactions
      const { data: interactions, error: interError } = await supabase
        .from('interactions')
        .select(`
          *,
          product1:products!product_id_1(name, type),
          product2:products!product_id_2(name, type)
        `)
        .in('product_id_1', productIds)
        .in('product_id_2', productIds)

      if (!interError && interactions?.length > 0) {
        const formattedInteractions = interactions.map(inter => ({
          ingredient_a: inter.product1.name,
          ingredient_b: inter.product2.name,
          severity: inter.severity,
          interaction: inter.interaction_description,
          notes: inter.notes
        }))

        return { interactions: formattedInteractions, resolved }
      }
    }

    return { interactions: [], resolved }
  } catch (error) {
    app.log.error({ err: error }, 'Mix query failed')
    return { interactions: [], resolved: [], error: 'database_unavailable' }
  }
})

app.post('/compare', async (request) => {
  const productNames = Array.isArray(request.body?.products) ? request.body.products : []
  if (productNames.length < 2) {
    return { comparison: [], error: 'at_least_two_products_required' }
  }

  const cleanNames = productNames.map(p => String(p).trim()).filter(Boolean)
  if (cleanNames.length < 2) {
    return { comparison: [], error: 'at_least_two_products_required' }
  }

  try {
    const { data: productRows, error } = await supabase
      .from('products')
      .select('id, name, type, generic_name, brand_names, dosage_form, strength, description, active_ingredients')
      .or(cleanNames.map(name => `name.ilike.${name}%`).join(','))
      .order('name')

    if (error) throw error

    const productDetails = productRows.map(product => ({
      name: product.name,
      type: product.type,
      generic_name: product.generic_name || 'N/A',
      brand: Array.isArray(product.brand_names) ? product.brand_names.join(', ') : 'N/A',
      form: product.dosage_form || 'N/A',
      strength: product.strength || 'N/A',
      description: product.description || 'N/A',
      active_ingredients: product.active_ingredients || []
    }))

    return { comparison: [{ products: productDetails }] }
  } catch (error) {
    app.log.error({ err: error }, 'Compare query failed')
    return { comparison: [], error: 'database_unavailable' }
  }
})

app.post('/recommendations', async (request, reply) => {
  const { symptoms = [], medicalHistory = [], currentMedications = [] } = request.body || {}

  if (!symptoms.length && !medicalHistory.length) {
    return { error: 'at_least_symptoms_or_history_required' }
  }

  // Check for interactions if medications provided
  let interactions = []
  if (currentMedications.length >= 2) {
    try {
      const { data: products } = await supabase
        .from('products')
        .select('id, name')
        .or(currentMedications.map(med => `name.ilike.%${med}%`).join(','))

      if (products?.length >= 2) {
        const productIds = products.map(p => p.id)

        const { data: interactionData } = await supabase
          .from('interactions')
          .select(`
            *,
            product1:products!product_id_1(name),
            product2:products!product_id_2(name)
          `)
          .in('product_id_1', productIds)
          .in('product_id_2', productIds)

        if (interactionData?.length > 0) {
          interactions = interactionData.map(inter => ({
            substance_a: inter.product1.name,
            substance_b: inter.product2.name,
            interaction_type: inter.interaction_description,
            severity: inter.severity,
            recommendation: inter.notes
          }))
        }
      }
    } catch (err) {
      app.log.error({ err }, 'Failed to check interactions')
    }
  }

  const prompt = buildRecommendationPrompt(symptoms, medicalHistory, currentMedications, interactions)

  if (!k2ApiKey) {
    return { recommendation: getDefaultRecommendations(symptoms), interactions }
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
      return { recommendation: getDefaultRecommendations(symptoms), interactions }
    }

    const data = await response.json()
    const recommendation = data.choices?.[0]?.message?.content || getDefaultRecommendations(symptoms)
    return { recommendation, interactions }
  } catch (error) {
    app.log.error({ err: error }, 'Recommendation request error')
    return { recommendation: getDefaultRecommendations(symptoms), interactions }
  }
})

function buildRecommendationPrompt(symptoms, medicalHistory, currentMedications, interactions = []) {
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

  if (interactions.length > 0) {
    prompt += `\nIMPORTANT: The following drug interactions were detected in the database:\n`
    interactions.forEach(i => {
      prompt += `- ${i.substance_a} + ${i.substance_b} (${i.severity}): ${i.interaction_type}\n`
    })
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

const port = Number(process.env.PORT || 9000)
app.listen({ port, host: '0.0.0.0' })