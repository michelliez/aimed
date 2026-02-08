#!/usr/bin/env node
/**
 * AIMED - Predict Interactions with K2 Think AI
 * Uses K2 Think API to predict drug-supplement interactions
 * 
 * Usage: 
 *   - Predict for all medicine pairs: node predict_interactions_k2.js
 *   - Predict for specific products: node predict_interactions_k2.js 100 200
 */

import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const K2_API_URL = process.env.K2_API_URL || 'https://api.k2think.ai/v1/chat/completions';
const K2_API_KEY = process.env.K2_API_KEY;

// Colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

const log = {
  header: (text) => console.log(`\n${colors.bold}${colors.cyan}${'='.repeat(60)}${colors.reset}\n${colors.bold}${text.padStart(text.length + (60 - text.length) / 2)}${colors.reset}\n${colors.bold}${colors.cyan}${'='.repeat(60)}${colors.reset}\n`),
  success: (text) => console.log(`${colors.green}✓${colors.reset} ${text}`),
  error: (text) => console.log(`${colors.red}✗${colors.reset} ${text}`),
  info: (text) => console.log(`${colors.cyan}ℹ${colors.reset} ${text}`),
  warning: (text) => console.log(`${colors.yellow}⚠${colors.reset} ${text}`),
};

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function predictInteraction(product1, product2) {
  try {
    const prompt = `You are a pharmacist expert in drug interactions. Assess the interaction between these two products:

Product 1: ${product1.name}
Type: ${product1.type}
${product1.generic_name ? `Generic: ${product1.generic_name}` : ''}
${product1.active_ingredients ? `Active Ingredients: ${product1.active_ingredients.join(', ')}` : ''}

Product 2: ${product2.name}
Type: ${product2.type}
${product2.generic_name ? `Generic: ${product2.generic_name}` : ''}
${product2.active_ingredients ? `Active Ingredients: ${product2.active_ingredients.join(', ')}` : ''}

Respond in JSON format ONLY with this structure:
{
  "has_interaction": boolean,
  "severity": "none" | "mild" | "moderate" | "severe" | "contraindicated",
  "description": "brief description of interaction or why no interaction",
  "mechanism": "how the interaction works (if applicable)"
}

Be conservative in your assessment. If uncertain, rate as "mild" or lower.`;

    const response = await axios.post(
      K2_API_URL,
      {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a pharmacist expert in drug-drug and drug-supplement interactions. Always respond in valid JSON format.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3, // Lower temperature for more consistent predictions
      },
      {
        headers: {
          Authorization: `Bearer ${K2_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    const content = response.data.choices?.[0]?.message?.content;
    if (!content) {
      return null;
    }

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      log.warning(`Could not parse JSON from K2 response for ${product1.name} + ${product2.name}`);
      return null;
    }

    const prediction = JSON.parse(jsonMatch[0]);
    
    // Only save if there's an interaction
    if (!prediction.has_interaction || prediction.severity === 'none') {
      return null;
    }

    return {
      product_id_1: product1.id,
      product_id_2: product2.id,
      interaction_description: prediction.description,
      severity: prediction.severity,
      mechanism: prediction.mechanism || null,
      notes: 'Predicted by K2 Think AI',
      sources: ['K2 Think AI'],
    };
  } catch (error) {
    log.error(`K2 prediction error for ${product1.name} + ${product2.name}: ${error.message}`);
    return null;
  }
}

async function main() {
  try {
    log.header('AIMED - Predict Interactions with K2');

    if (!K2_API_KEY) {
      log.error('K2_API_KEY not set in .env');
      process.exit(1);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    log.info('Connecting to Supabase...');
    const { error: testError } = await supabase.from('products').select('count', { count: 'exact' });
    if (testError) {
      log.error(`Failed to connect: ${testError.message}`);
      process.exit(1);
    }
    log.success('Connected to Supabase');

    log.header('Fetching Products');
    const { data: products, error } = await supabase
      .from('products')
      .select('id, name, type, generic_name, active_ingredients')
      .order('id');

    if (error) {
      log.error(`Error fetching products: ${error.message}`);
      process.exit(1);
    }

    // Filter to specific products if args provided
    let targetProducts = products;
    if (process.argv.length > 2) {
      const productIds = process.argv.slice(2).map(Number);
      targetProducts = products.filter(p => productIds.includes(p.id));
      log.info(`Predicting interactions for ${targetProducts.length} products`);
    } else {
      log.info(`Predicting interactions for all ${products.length} products`);
      log.warning(`This will take several hours with rate limiting. Consider using specific product IDs.`);
      log.warning(`Usage: node predict_interactions_k2.js [product_id1] [product_id2] ...`);
    }

    log.header('Predicting Interactions with K2');

    const interactions = [];
    let processed = 0;
    let found = 0;
    let errors = 0;

    // Rate limiting: 3 second delay between K2 API calls (conservative)
    const RATE_LIMIT_MS = 3000;

    // Compare each product with every other product (avoiding duplicates)
    for (let i = 0; i < targetProducts.length; i++) {
      for (let j = i + 1; j < targetProducts.length; j++) {
        const product1 = targetProducts[i];
        const product2 = targetProducts[j];

        // Skip if same product
        if (product1.id === product2.id) continue;

        // Predict interaction
        const interaction = await predictInteraction(product1, product2);
        
        if (interaction) {
          interactions.push(interaction);
          found++;
          log.info(`Found: ${product1.name} + ${product2.name} (${interaction.severity})`);
        }

        processed++;

        // Show progress every 10 pairs
        if (processed % 10 === 0) {
          log.info(`Progress: ${processed} pairs checked, ${found} interactions found`);
        }

        // Rate limiting
        await sleep(RATE_LIMIT_MS);
      }
    }

    console.log('');
    log.header('Saving Interactions to Database');

    let saved = 0;
    let skipped = 0;
    let saveErrors = 0;

    // Save interactions
    for (const interaction of interactions) {
      try {
        // Check if already exists
        const { data: existing } = await supabase
          .from('interactions')
          .select('id')
          .or(`and(product_id_1.eq.${interaction.product_id_1},product_id_2.eq.${interaction.product_id_2}),and(product_id_1.eq.${interaction.product_id_2},product_id_2.eq.${interaction.product_id_1})`)
          .limit(1);

        if (existing && existing.length > 0) {
          skipped++;
          continue;
        }

        const { error } = await supabase.from('interactions').insert([interaction]);

        if (error) {
          log.warning(`Failed to save interaction: ${error.message}`);
          saveErrors++;
        } else {
          saved++;
        }
      } catch (error) {
        saveErrors++;
      }
    }

    console.log('');
    log.success(`✓ Complete!`);
    log.success(`Predicted: ${found} interactions`);
    log.success(`Saved: ${saved}`);
    if (skipped > 0) log.warning(`Skipped (already exist): ${skipped}`);
    if (saveErrors > 0) log.warning(`Save errors: ${saveErrors}`);

  } catch (error) {
    log.error(`Unexpected error: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

main();
