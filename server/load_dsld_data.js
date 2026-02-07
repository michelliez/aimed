#!/usr/bin/env node
// should add all data
/**
 * AIMED - Download and Load DSLD Supplement Data
 * Downloads supplement data from NIH DSLD and loads into Supabase
 * 
 * Usage: node load_dsld_data.js
 */

import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const DSLD_API_URL = 'https://api.ods.od.nih.gov/dsld/v9';

// Colors
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

async function fetchProductPage(pageNum, pageSize = 100) {
  try {
    log.info(`Fetching page ${pageNum} (${pageSize} items)...`);
    
    const response = await axios.get(`${DSLD_API_URL}/browse-products/`, {
      params: {
        method: 'by_keyword',
        q: 'vitamin',  // Search for vitamin products initially
        size: pageSize,
        from: pageNum * pageSize,
      },
      timeout: 30000,
    });
    
    const data = response.data;
    // DSLD API returns results in 'hits' array with '_source' containing actual data
    const products = data.hits ? data.hits.map(hit => hit._source) : [];
    const total = data.total?.value || 0;
    
    log.success(`Fetched ${products.length} products from page ${pageNum}`);
    
    return {
      products,
      total,
    };
  } catch (error) {
    log.warning(`Error fetching page ${pageNum}: ${error.message.substring(0, 50)}`);
    return { products: [], total: 0 };
  }
}


function parseProduct(product) {
  // Extract ingredients from supplement facts
  const ingredients = [];
  
  if (product.supplementFacts && Array.isArray(product.supplementFacts)) {
    product.supplementFacts.forEach(fact => {
      if (fact.name) {
        ingredients.push(fact.name);
      }
    });
  }
  
  // Get serving size info
  let strength = null;
  if (product.servingSizes && product.servingSizes.length > 0) {
    const serving = product.servingSizes[0];
    if (serving.minQuantity) {
      strength = `${serving.minQuantity}${serving.unit ? ' ' + serving.unit : ''}`.trim();
    }
  }
  
  // Extract product name - use fullName if available
  const productName = product.fullName || product.name || 'Unknown';
  
  return {
    name: productName,
    type: 'supplement',
    dsld_id: product._id || null,  // DSLD ID from response
    generic_name: null,  // DSLD doesn't provide this
    brand_names: product.brandName ? [product.brandName] : [],
    dosage_form: product.physicalState?.langualCodeDescription || null,
    strength: strength,
    description: productName,
    active_ingredients: ingredients,
    market_status: 'Active',  // Default, would need to check events for actual status
  };
}

async function productExists(supabase, dsldId) {
  try {
    const { data } = await supabase
      .from('products')
      .select('id')
      .eq('dsld_id', dsldId)
      .limit(1);
    
    return data && data.length > 0;
  } catch {
    return false;
  }
}

async function loadProducts(supabase, products) {
  log.header(`Loading ${products.length} Products`);
  
  let loaded = 0;
  let skipped = 0;
  let errors = 0;
  
  for (let i = 0; i < products.length; i++) {
    try {
      // Skip if already exists
      if (await productExists(supabase, products[i].dsld_id)) {
        skipped++;
        continue;
      }
      
      // Insert product
      const { error } = await supabase
        .from('products')
        .insert([products[i]]);
      
      if (error) {
        errors++;
        continue;
      }
      
      loaded++;
      
      if ((i + 1) % 50 === 0) {
        log.info(`Progress: ${i + 1}/${products.length}`);
      }
    } catch (error) {
      errors++;
    }
  }
  
  console.log('');
  log.success(`Loaded: ${loaded} supplements`);
  if (skipped > 0) log.warning(`Skipped: ${skipped} (already exist)`);
  if (errors > 0) log.warning(`Errors: ${errors}`);
  
  return loaded;
}

async function main() {
  try {
    log.header('AIMED - Load DSLD Supplements');
    
    validateConfig();
    const supabase = initSupabase();
    
    log.header('Fetching Supplement Data from DSLD');
    
    let allProducts = [];
    let pageNum = 0;
    let totalFetched = 0;
    
    // Fetch pages until we get all products
    while (true) {
      const { products, total } = await fetchProductPage(pageNum, 100);
      
      if (products.length === 0) {
        log.info(`Reached end of data at page ${pageNum}`);
        break;
      }
      
      // Parse and add products
      for (const product of products) {
        const parsed = parseProduct(product);
        allProducts.push(parsed);
        
        // Rate limiting - DSLD API has limits
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      totalFetched += products.length;
      log.info(`Total fetched so far: ${totalFetched}/${total}`);
      
      pageNum++;
      
      // Stop after reasonable amount (adjust as needed)
      if (pageNum > 10) { // Get first 1,000 products
        log.warning('Stopping at 1,000 products (adjust limit in code)');
        break;
      }
    }
    
    // Load into database
    const loaded = await loadProducts(supabase, allProducts);
    
    log.success(`✓ Complete! Loaded ${loaded} supplements into database`);
    
  } catch (error) {
    log.error(`Unexpected error: ${error.message}`);
    process.exit(1);
  }
}

main();