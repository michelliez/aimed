#!/usr/bin/env node
//current implementation

/**
 * AIMED - Load RxNorm Interactions
 * Queries RxNorm API for drug interactions and loads into Supabase
 * 
 * Usage: node load_rxnorm_interactions.js
 * 
 * Note: This will take 30-60 minutes as it queries the API for each product
 * Set a reasonable rate limit to avoid overwhelming the RxNorm API
 */

import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RXNORM_API_URL = 'https://rxnav.nlm.nih.gov/REST';

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

function validateConfig() {
  log.info('Validating configuration...');
  
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    log.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
    process.exit(1);
  }
  
  log.success('Configuration valid');
}

function initSupabase() {
  log.info('Connecting to Supabase...');
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    log.success('Connected to Supabase');
    return supabase;
  } catch (error) {
    log.error(`Failed to connect: ${error.message}`);
    process.exit(1);
  }
}

async function getAllProducts(supabase) {
  log.info('Fetching all products from database...');
  try {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, type')
      .order('id');
    
    if (error) throw error;
    
    log.success(`Fetched ${data.length} products`);
    return data;
  } catch (error) {
    log.error(`Error fetching products: ${error.message}`);
    throw error;
  }
}

// Sleep function for rate limiting (milliseconds)
async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function findRxCUI(drugName) {
  try {
    const response = await axios.get(`${RXNORM_API_URL}/rxcui.json`, {
      params: {
        name: drugName,
        search: 2, // approximate match
      },
      timeout: 10000,
    });
    
    if (response.data && response.data.idGroup && response.data.idGroup.rxnormId && response.data.idGroup.rxnormId.length > 0) {
      return response.data.idGroup.rxnormId[0];
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

async function getInteractions(rxcui) {
  try {
    const response = await axios.get(`${RXNORM_API_URL}/interaction/interaction.json`, {
      params: {
        rxcui: rxcui,
      },
      timeout: 10000,
    });
    
    const interactions = [];
    
    if (response.data && response.data.interactionTypeGroup && Array.isArray(response.data.interactionTypeGroup)) {
      response.data.interactionTypeGroup.forEach(group => {
        if (group.interactionType && Array.isArray(group.interactionType)) {
          group.interactionType.forEach(type => {
            if (type.interactionPair && Array.isArray(type.interactionPair)) {
              type.interactionPair.forEach(pair => {
                interactions.push({
                  drugName: pair.interactionConcept[1]?.name || 'Unknown',
                  description: pair.description || '',
                  severity: determineSeverity(pair.description || ''),
                });
              });
            }
          });
        }
      });
    }
    
    return interactions;
  } catch (error) {
    return [];
  }
}

function determineSeverity(description) {
  const lower = description.toLowerCase();
  
  if (lower.includes('contraindicated') || lower.includes('avoid')) {
    return 'contraindicated';
  } else if (lower.includes('severe') || lower.includes('serious')) {
    return 'severe';
  } else if (lower.includes('moderate')) {
    return 'moderate';
  } else if (lower.includes('minor') || lower.includes('mild')) {
    return 'mild';
  }
  
  return 'moderate'; // default
}

async function findProductId(supabase, drugName, productMap) {
  // Quick lookup in memory map first
  const lower = drugName.toLowerCase();
  for (const [id, name] of Object.entries(productMap)) {
    if (name.toLowerCase() === lower || name.toLowerCase().includes(lower)) {
      return parseInt(id);
    }
  }
  
  // Fallback to database query if not in map
  try {
    const { data } = await supabase
      .from('products')
      .select('id')
      .ilike('name', `%${drugName}%`)
      .limit(1);
    
    return data && data.length > 0 ? data[0].id : null;
  } catch {
    return null;
  }
}

async function interactionExists(supabase, productId1, productId2) {
  try {
    const { data } = await supabase
      .from('interactions')
      .select('id')
      .or(`and(product_id_1.eq.${productId1},product_id_2.eq.${productId2}),and(product_id_1.eq.${productId2},product_id_2.eq.${productId1})`)
      .limit(1);
    
    return data && data.length > 0;
  } catch {
    return false;
  }
}

async function loadInteractions(supabase, interactions) {
  log.header(`Loading ${interactions.length} Interactions`);
  
  let loaded = 0;
  let skipped = 0;
  let errors = 0;
  
  for (let i = 0; i < interactions.length; i++) {
    try {
      const interaction = interactions[i];
      
      // Skip if already exists
      if (await interactionExists(supabase, interaction.product_id_1, interaction.product_id_2)) {
        skipped++;
        continue;
      }
      
      // Insert interaction
      const { error } = await supabase
        .from('interactions')
        .insert([interaction]);
      
      if (error) {
        errors++;
        continue;
      }
      
      loaded++;
      
      if ((i + 1) % 100 === 0) {
        log.info(`Progress: ${i + 1}/${interactions.length}`);
      }
    } catch (error) {
      errors++;
    }
  }
  
  console.log('');
  log.success(`Loaded: ${loaded} interactions`);
  if (skipped > 0) log.warning(`Skipped: ${skipped} (already exist)`);
  if (errors > 0) log.warning(`Errors: ${errors}`);
  
  return loaded;
}

async function main() {
  try {
    log.header('AIMED - Load RxNorm Interactions');
    
    validateConfig();
    const supabase = initSupabase();
    
    log.header('Fetching Products');
    const products = await getAllProducts(supabase);
    
    // Create product map for quick lookups
    const productMap = {};
    products.forEach(p => {
      productMap[p.id] = p.name;
    });
    
    log.header('Querying RxNorm Interactions');
    
    const interactions = [];
    let foundRxcui = 0;
    let foundInteractions = 0;
    let notFound = 0;
    
    // Rate limiting: 500ms between requests (very conservative for RxNorm)
    const RATE_LIMIT_MS = 500;
    
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      
      // Query RxNorm for this product
      const rxcui = await findRxCUI(product.name);
      
      if (!rxcui) {
        notFound++;
      } else {
        foundRxcui++;
        
        // Get interactions for this drug
        const rxInteractions = await getInteractions(rxcui);
        
        // Match interactions with our products
        for (const rxinter of rxInteractions) {
          const productId2 = await findProductId(supabase, rxinter.drugName, productMap);
          
          if (productId2 && productId2 !== product.id) {
            interactions.push({
              product_id_1: product.id,
              product_id_2: productId2,
              interaction_description: rxinter.description || rxinter.drugName,
              severity: rxinter.severity,
              notes: `From RxNorm API`,
            });
            foundInteractions++;
          }
        }
      }
      
      // Show progress
      if ((i + 1) % 50 === 0) {
        log.info(`Progress: ${i + 1}/${products.length} (found RxCUI: ${foundRxcui}, interactions: ${foundInteractions})`);
      }
      
      // Rate limiting
      await sleep(RATE_LIMIT_MS);
    }
    
    log.info(`\nRxNorm Query Summary:`);
    log.success(`Found RxCUI: ${foundRxcui}/${products.length}`);
    log.warning(`Not found: ${notFound}/${products.length}`);
    log.info(`Total interactions found: ${foundInteractions}`);
    
    // Load into database
    const loaded = await loadInteractions(supabase, interactions);
    
    log.success(`✓ Complete! Loaded ${loaded} interactions from RxNorm into database`);
    
  } catch (error) {
    log.error(`Unexpected error: ${error.message}`);
    process.exit(1);
  }
}

main();
