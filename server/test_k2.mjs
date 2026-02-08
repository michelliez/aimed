import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const K2_API_URL = process.env.K2_API_URL || 'https://api.k2think.ai/v1/chat/completions';
const K2_API_KEY = process.env.K2_API_KEY;

console.log('K2_API_URL:', K2_API_URL);
console.log('K2_API_KEY:', K2_API_KEY ? 'SET' : 'NOT SET');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function testPrediction() {
  const items = ['Aspirin', 'Ibuprofen'];
  
  // Get product details
  const { data: productRows } = await supabase
    .from('products')
    .select('id, name, type, generic_name, active_ingredients')
    .or(items.map(item => `name.ilike.${item}%`).join(','));

  console.log('Found products:', productRows);

  const productMap = new Map();
  if (productRows) {
    productRows.forEach(p => {
      productMap.set(p.name.toLowerCase(), p);
    });
  }

  const itemDetails = items.map(input => {
    const product = productMap.get(input.toLowerCase());
    return {
      name: input,
      type: product?.type || 'unknown',
      generic_name: product?.generic_name || input,
      active_ingredients: product?.active_ingredients || [],
    };
  });

  console.log('Item details:', itemDetails);

  // Try K2 prediction
  const item1 = itemDetails[0];
  const item2 = itemDetails[1];

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

Be conservative. If uncertain, rate as mild.`;

  console.log('Sending request to K2 API...');

  try {
    const response = await axios.post(
      K2_API_URL,
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
          Authorization: `Bearer ${K2_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    console.log('K2 Response:', JSON.stringify(response.data, null, 2));
    const content = response.data.choices?.[0]?.message?.content;
    console.log('Content:', content);

    if (content) {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const prediction = JSON.parse(jsonMatch[0]);
        console.log('Parsed prediction:', prediction);
      } else {
        console.log('No JSON found in content');
      }
    } else {
      console.log('No content in response');
    }
  } catch (err) {
    console.error('Error:', err.message);
    if (err.response) {
      console.error('Response status:', err.response.status);
      console.error('Response data:', JSON.stringify(err.response.data, null, 2));
    }
  }
}

testPrediction();
