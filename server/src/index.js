import dotenv from 'dotenv'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import axios from 'axios'
import { createClient } from '@supabase/supabase-js'

dotenv.config()

const app = Fastify()

await app.register(cors, {
  origin: true,
})

// Error handler
app.setErrorHandler((error, request, reply) => {
  app.log.error(error)
  reply.code(500).send({ error: 'internal_server_error' })
})

// Supabase client
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
    // Fetch all products and match locally (more reliable than complex Supabase filters)
    const { data: allProducts, error: fetchError } = await supabase
      .from('products')
      .select('id, name, type, active_ingredients, generic_name')

    if (fetchError) throw fetchError

    // Match products to input items
    const matchedProducts = []
    const resolved = []

    for (const inputItem of cleanItems) {
      const inputLower = inputItem.toLowerCase()
      
      // Find matching product (exact or contains match)
      const match = allProducts.find(p => 
        p.name.toLowerCase().includes(inputLower) ||
        (p.generic_name && p.generic_name.toLowerCase().includes(inputLower))
      )

      if (match) {
        resolved.push({
          input: inputItem,
          type: 'product',
          product: match,
          ingredients: match.active_ingredients || [],
        })
        matchedProducts.push(match)
      } else {
        // Treat as custom ingredient
        resolved.push({
          input: inputItem,
          type: 'ingredient',
          ingredient: inputItem,
        })
      }
    }

    // Get interactions between matched products
    const interactions = []
    if (matchedProducts.length >= 2) {
      const productIds = matchedProducts.map(p => p.id)

      const { data: dbInteractions, error: interError } = await supabase
        .from('interactions')
        .select(`
          *,
          product1:products!product_id_1(name, type),
          product2:products!product_id_2(name, type)
        `)
        .in('product_id_1', productIds)
        .in('product_id_2', productIds)

      if (!interError && dbInteractions?.length > 0) {
        dbInteractions.forEach(inter => {
          interactions.push({
            ingredient_a: inter.product1.name,
            ingredient_b: inter.product2.name,
            severity: inter.severity,
            interaction: inter.interaction_description,
            notes: inter.notes
          })
        })
      }
    }

    return { interactions, resolved }
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
    // Build flexible query to match products by name or generic name
    const likeConditions = cleanNames.map(name => `name.ilike.%${name}%`).join(',')
    
    const { data: productRows, error } = await supabase
      .from('products')
      .select('id, name, type, generic_name, brand_names, dosage_form, strength, description, active_ingredients')
      .or(likeConditions)
      .order('name')

    if (error) throw error

    if (!productRows || productRows.length === 0) {
      return { comparison: [], error: 'no_products_found' }
    }

    // Map input names to found products (handle case-insensitive, partial matches)
    const foundProducts = []
    for (const inputName of cleanNames) {
      const match = productRows.find(p => 
        p.name.toLowerCase().includes(inputName.toLowerCase()) ||
        (p.generic_name && p.generic_name.toLowerCase().includes(inputName.toLowerCase()))
      )
      if (match) {
        foundProducts.push(match)
      }
    }

    // If we have at least 2 matches, return comparison
    if (foundProducts.length >= 2) {
      const productDetails = foundProducts.map(product => ({
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
    }

    // If only partial matches, return what we have
    if (foundProducts.length > 0) {
      const productDetails = foundProducts.map(product => ({
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
    }

    return { comparison: [], error: 'no_matching_products' }
  } catch (error) {
    app.log.error({ err: error }, 'Compare query failed')
    return { comparison: [], error: 'database_unavailable' }
  }
})

app.post('/predict-interactions', async (request, reply) => {
  console.log('[/predict-interactions] Received request')
  const items = Array.isArray(request.body?.items) ? request.body.items : []
  console.log('[/predict-interactions] Items:', items)
  if (items.length < 2) {
    console.log('[/predict-interactions] Not enough items')
    return { interactions: [], error: 'at_least_two_items_required' }
  }

  if (!k2ApiKey) {
    console.log('[/predict-interactions] K2 API key missing')
    return { interactions: [], error: 'k2_api_key_missing' }
  }

  try {
    const cleanItems = items.map(i => String(i).trim()).filter(Boolean)
    if (cleanItems.length < 2) {
      console.log('[/predict-interactions] Not enough clean items')
      return { interactions: [], error: 'at_least_two_items_required' }
    }

    // Get product details for items that exist in database
    const { data: productRows } = await supabase
      .from('products')
      .select('id, name, type, generic_name, active_ingredients')
      .or(cleanItems.map(item => `name.ilike.${item}%`).join(','))

    const productMap = new Map()
    if (productRows) {
      productRows.forEach(p => {
        productMap.set(p.name.toLowerCase(), p)
      })
    }

    // Build item details (from DB or custom)
    const itemDetails = cleanItems.map(input => {
      const product = productMap.get(input.toLowerCase())
      return {
        name: input,
        type: product?.type || 'unknown',
        generic_name: product?.generic_name || input,
        active_ingredients: product?.active_ingredients || [],
      }
    })

    // Predict interactions between all pairs using K2
    const interactions = []
    console.log(`[K2] Starting predictions for ${itemDetails.length} items`)

    for (let i = 0; i < itemDetails.length; i++) {
      for (let j = i + 1; j < itemDetails.length; j++) {
        const item1 = itemDetails[i]
        const item2 = itemDetails[j]
        console.log(`[K2] Predicting interaction: ${item1.name} + ${item2.name}`)

        try {
          const prompt = `You are a pharmacist expert in drug interactions. Assess the interaction between these two products:

Product 1: ${item1.name}
Type: ${item1.type}
Generic: ${item1.generic_name}
${item1.active_ingredients.length > 0 ? `Active Ingredients: ${item1.active_ingredients.join(', ')}` : ''}

Product 2: ${item2.name}
Type: ${item2.type}
Generic: ${item2.generic_name}
${item2.active_ingredients.length > 0 ? `Active Ingredients: ${item2.active_ingredients.join(', ')}` : ''}

Respond in JSON format ONLY:
{
  "has_interaction": boolean,
  "severity": "none" | "mild" | "moderate" | "severe" | "contraindicated",
  "description": "brief interaction description",
  "notes": "brief notes or recommendations"
}

Be conservative. If uncertain, rate as mild.`

          const response = await axios.post(
            k2ApiUrl,
            {
              model: 'MBZUAI-IFM/K2-Think-v2',
              messages: [
                {
                  role: 'system',
                  content: 'You are a pharmacist expert. Always respond in valid JSON format only.',
                },
                {
                  role: 'user',
                  content: prompt,
                },
              ],
              temperature: 0.3,
            },
            {
              headers: {
                Authorization: `Bearer ${k2ApiKey}`,
                'Content-Type': 'application/json',
              },
              timeout: 30000,
            }
          )

          const content = response.data.choices?.[0]?.message?.content
          if (!content) {
            app.log.warn(`K2 no content for ${item1.name} + ${item2.name}`)
            continue
          }

          // Parse JSON from response - K2 Think includes thinking process in <think> tags
          // The actual JSON comes after the </think> tag
          let jsonContent = content
          const thinkEndIdx = content.indexOf('</think>')
          if (thinkEndIdx !== -1) {
            jsonContent = content.substring(thinkEndIdx + 8) // Skip past </think>
          }

          let prediction = null
          try {
            // Find the first { and match the closing }
            const startIdx = jsonContent.indexOf('{')
            if (startIdx === -1) {
              app.log.warn(`K2 no JSON found for ${item1.name} + ${item2.name}`)
              continue
            }
            
            // Find the matching closing brace
            let braceCount = 0
            let endIdx = -1
            for (let i = startIdx; i < jsonContent.length; i++) {
              if (jsonContent[i] === '{') braceCount++
              if (jsonContent[i] === '}') braceCount--
              if (braceCount === 0) {
                endIdx = i
                break
              }
            }
            
            if (endIdx === -1) {
              app.log.warn(`K2 unmatched braces for ${item1.name} + ${item2.name}`)
              continue
            }
            
            const jsonStr = jsonContent.substring(startIdx, endIdx + 1)
            prediction = JSON.parse(jsonStr)
          } catch (parseErr) {
            app.log.warn(`K2 JSON parse error for ${item1.name} + ${item2.name}: ${parseErr.message}`)
            continue
          }

          if (!prediction || prediction.severity === undefined) {
            app.log.warn(`K2 no valid prediction for ${item1.name} + ${item2.name}`)
            continue
          }

          app.log.info(`K2 prediction for ${item1.name} + ${item2.name}: ${JSON.stringify(prediction)}`)

          // Include all predictions from K2 (even "none" severity, so user knows we checked)
          if (prediction.severity) {
            interactions.push({
              ingredient_a: item1.name,
              ingredient_b: item2.name,
              severity: prediction.severity,
              interaction: prediction.description || 'No significant interaction expected',
              notes: prediction.notes || '',
            })
          }
        } catch (err) {
          app.log.error({ err }, `K2 prediction failed for ${item1.name} + ${item2.name}`)
        }
      }
    }

    return { interactions }
  } catch (error) {
    app.log.error({ err: error }, 'Predict interactions failed')
    return { interactions: [], error: 'prediction_failed' }
  }
})

app.post('/product-info', async (request) => {
  const productNames = Array.isArray(request.body?.products) ? request.body.products : []
  if (!productNames.length) {
    return { products: [] }
  }

  if (!k2ApiKey) {
    return { products: [], error: 'k2_api_key_missing' }
  }

  try {
    const cleanNames = productNames.map(p => String(p).trim()).filter(Boolean)
    if (!cleanNames.length) {
      return { products: [] }
    }

    const productInfos = []

    for (const productName of cleanNames) {
      try {
        const prompt = `You are a pharmaceutical expert. Provide detailed information about this product/supplement:

Product: ${productName}

Respond in JSON format ONLY with this structure:
{
  "name": "${productName}",
  "type": "supplement" | "medication" | "herb" | "unknown",
  "active_ingredients": ["ingredient1", "ingredient2"],
  "typical_dose": "dose with units (e.g., 500mg)",
  "form": "tablet, capsule, powder, liquid, etc.",
  "serving_size": "e.g., 1 capsule, 2 tablets",
  "suggested_use": "brief suggested usage instructions",
  "key_benefits": "comma-separated list of primary benefits",
  "notes": "brief safety/interaction notes"
}

Be concise. If unsure about specifics, use reasonable estimates based on common formulations.`

        const response = await axios.post(
          k2ApiUrl,
          {
            model: 'MBZUAI-IFM/K2-Think-v2',
            messages: [
              {
                role: 'system',
                content: 'You are a pharmaceutical expert. Always respond in valid JSON format only.',
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
            temperature: 0.3,
          },
          {
            headers: {
              Authorization: `Bearer ${k2ApiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 30000,
          }
        )

        const content = response.data.choices?.[0]?.message?.content
        if (!content) {
          app.log.warn(`K2 no content for product: ${productName}`)
          continue
        }

        // Parse JSON from response - K2 Think includes thinking process in <think> tags
        let jsonContent = content
        const thinkEndIdx = content.indexOf('</think>')
        if (thinkEndIdx !== -1) {
          jsonContent = content.substring(thinkEndIdx + 8) // Skip past </think>
        }

        // Parse JSON from response
        let productInfo = null
        try {
          const startIdx = jsonContent.indexOf('{')
          if (startIdx === -1) {
            app.log.warn(`K2 no JSON found for ${productName}`)
            continue
          }
          
          let braceCount = 0
          let endIdx = -1
          for (let i = startIdx; i < jsonContent.length; i++) {
            if (jsonContent[i] === '{') braceCount++
            if (jsonContent[i] === '}') braceCount--
            if (braceCount === 0) {
              endIdx = i
              break
            }
          }
          
          if (endIdx === -1) {
            app.log.warn(`K2 unmatched braces for ${productName}`)
            continue
          }
          
          const jsonStr = jsonContent.substring(startIdx, endIdx + 1)
          productInfo = JSON.parse(jsonStr)
          productInfos.push(productInfo)
        } catch (parseErr) {
          app.log.warn(`K2 JSON parse error for ${productName}: ${parseErr.message}`)
        }
      } catch (err) {
        app.log.error({ err }, `K2 product info failed for ${productName}`)
      }
    }

    return { products: productInfos }
  } catch (error) {
    app.log.error({ err: error }, 'Product info failed')
    return { products: [], error: 'product_info_failed' }
  }
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

  // Check for interactions if medications provided
  let interactions = []
  if (cleanedMeds.length >= 2) {
    try {
      const { data: products } = await supabase
        .from('products')
        .select('id, name')
        .or(cleanedMeds.map(med => `name.ilike.%${med}%`).join(','))

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

  const prompt = buildRecommendationPrompt({
    symptoms: cleanedSymptoms,
    medications: cleanedMeds,
    supplements: cleanedSupps,
    medicalConsiderations,
    preferences,
    safetyWarnings: safety.warnings,
    interactions,
  })

  if (!k2ApiKey) {
    return getDefaultRecommendationPayload({
      symptoms: cleanedSymptoms,
      warnings: safety.warnings,
      interactions,
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
        interactions,
      })
    }

    const data = await response.json()
    const raw = data.choices?.[0]?.message?.content
    const parsed = parseK2Json(raw)
    if (!parsed) {
      return getDefaultRecommendationPayload({
        symptoms: cleanedSymptoms,
        warnings: safety.warnings,
        interactions,
      })
    }

    return {
      ...parsed,
      warnings: Array.from(new Set([...(parsed.warnings || []), ...safety.warnings])),
      interactions,
    }
  } catch (error) {
    app.log.error({ err: error }, 'Recommendation request error')
    return getDefaultRecommendationPayload({
      symptoms: cleanedSymptoms,
      warnings: safety.warnings,
      interactions,
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
  interactions = [],
}) {
  const info = [
    `Symptoms: ${symptoms.length ? symptoms.join(', ') : 'None provided'}`,
    `Medications: ${medications.length ? medications.join(', ') : 'None listed'}`,
    `Supplements: ${supplements.length ? supplements.join(', ') : 'None listed'}`,
    `Medical considerations: ${formatConsiderations(medicalConsiderations)}`,
    `Preferences: ${formatPreferences(preferences)}`,
    `Safety notes: ${safetyWarnings.length ? safetyWarnings.join(' | ') : 'None'}`,
  ].join('\n')

  let interactionInfo = ''
  if (interactions.length > 0) {
    interactionInfo = `\n\nIMPORTANT: The following drug interactions were detected in the database:\n`
    interactions.forEach(i => {
      interactionInfo += `- ${i.substance_a} + ${i.substance_b} (${i.severity}): ${i.interaction_type}\n`
    })
  }

  return `Use the profile below to generate educational options.\n\n${info}${interactionInfo}\n\nRules:\n- Provide educational options only (no prescriptions, no dosing).\n- Do not diagnose or claim "best" treatment.\n- Include evidence strength and interaction risk for each option.\n- Highlight who should avoid it and key cautions.\n- Add personalized warnings based on the profile.\n- Provide next-step questions for a clinician/pharmacist.\n\nReturn ONLY valid JSON with this shape:\n{\n  "disclaimer": string,\n  "warnings": string[],\n  "recommendations": [\n    {\n      "option": string,\n      "category": "Supplement"|"OTC medication"|"Lifestyle"|"Prescription"|"Other",\n      "whyDiscussed": string,\n      "keyCautions": string,\n      "evidenceStrength": "High"|"Moderate"|"Limited",\n      "interactionRisk": "Low"|"Medium"|"High",\n      "avoidIf": string\n    }\n  ],\n  "nextSteps": string[]\n}`
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

function getDefaultRecommendationPayload({ symptoms, warnings, interactions = [] }) {
  return {
    disclaimer: 'Not medical advice. This tool provides educational information only and cannot diagnose, treat, or recommend specific medications. Always consult a licensed healthcare professional.',
    warnings,
    interactions,
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

const port = Number(process.env.PORT || 9000)
app.listen({ port, host: '0.0.0.0' })
