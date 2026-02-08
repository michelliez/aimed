#!/usr/bin/env node
/**
 * AIMED - Download and Load OpenFDA Drug Data
 * Downloads drug data from FDA Open API and loads into Supabase
 * 
 * Usage: node load_openfda_data.js
 */

import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const OPENFDA_API_URL = 'https://api.fda.gov/drug/label.json';

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

async function fetchDrugPage(skip = 0, limit = 100) {
  try {
    log.info(`Fetching drugs (skip: ${skip}, limit: ${limit})...`);
    
    const response = await axios.get(OPENFDA_API_URL, {
      params: {
        skip,
        limit,
      },
      timeout: 30000,
    });
    
    const data = response.data;
    const results = data.results || [];
    const total = data.meta?.results?.total || 0;
    
    log.success(`Fetched ${results.length} drugs`);
    
    return {
      drugs: results,
      total,
    };
  } catch (error) {
    log.warning(`Error fetching drugs: ${error.message.substring(0, 50)}`);
    return { drugs: [], total: 0 };
  }
}

function parseDrug(drug) {
  // Extract from openfda nested object
  const fda = drug.openfda || {};
  
  // Extract active ingredients
  const ingredients = [];
  
  if (drug.active_ingredient && Array.isArray(drug.active_ingredient)) {
    drug.active_ingredient.forEach(ing => {
      if (typeof ing === 'string') {
        const match = ing.match(/^([^0-9]+)/);
        if (match) ingredients.push(match[1].trim());
      }
    });
  }
  
  if (fda.substance_name && Array.isArray(fda.substance_name)) {
    ingredients.push(...fda.substance_name.slice(0, 5));
  }
  
  // Get brand names from openfda
  const brandNames = [];
  if (fda.brand_name && Array.isArray(fda.brand_name)) {
    brandNames.push(...fda.brand_name.slice(0, 5)); // Limit to first 5
  }
  
  // Get generic name
  let genericName = null;
  if (fda.generic_name && Array.isArray(fda.generic_name)) {
    genericName = fda.generic_name[0];
  }
  
  // Get manufacturer
  let manufacturer = null;
  if (fda.manufacturer_name && Array.isArray(fda.manufacturer_name)) {
    manufacturer = fda.manufacturer_name[0];
  }
  
  // Get product name - prefer brand name, then generic
  const productName = (brandNames.length > 0 ? brandNames[0] : null) ||
                      (genericName) ||
                      (fda.product_ndc && Array.isArray(fda.product_ndc) ? fda.product_ndc[0] : null) ||
                      null;
  
  if (!productName) {
    return null; // Skip if no name
  }
  
  return {
    name: productName,
    type: 'medicine',
    dsld_id: null,  // Don't store FDA NDC as dsld_id since it's a string
    generic_name: genericName,
    brand_names: brandNames.length > 0 ? brandNames : [],
    dosage_form: null, // OpenFDA doesn't have standardized dosage form
    strength: null,    // OpenFDA doesn't have standardized strength
    description: productName,
    active_ingredients: [...new Set(ingredients)].slice(0, 10), // Remove duplicates, limit to 10
    market_status: 'Active',
  };
}

async function drugExists(supabase, name) {
  try {
    const { data } = await supabase
      .from('products')
      .select('id')
      .eq('name', name)
      .limit(1);
    
    return data && data.length > 0;
  } catch {
    return false;
  }
}

async function loadDrugs(supabase, drugs) {
  log.header(`Loading ${drugs.length} Drugs`);
  
  let loaded = 0;
  let skipped = 0;
  let errors = 0;
  const seenNames = new Set();
  let firstError = null;
  
  for (let i = 0; i < drugs.length; i++) {
    try {
      // Skip if we've already seen this name in this batch
      if (seenNames.has(drugs[i].name)) {
        skipped++;
        continue;
      }
      seenNames.add(drugs[i].name);
      
      // Skip if already exists in database
      if (await drugExists(supabase, drugs[i].name)) {
        skipped++;
        continue;
      }
      
      // Insert drug
      const { error } = await supabase
        .from('products')
        .insert([drugs[i]]);
      
      if (error) {
        errors++;
        if (!firstError) firstError = error;
        continue;
      }
      
      loaded++;
      
      if ((i + 1) % 50 === 0) {
        log.info(`Progress: ${i + 1}/${drugs.length}`);
      }
    } catch (error) {
      errors++;
      if (!firstError) firstError = error;
    }
  }
  
  console.log('');
  log.success(`Loaded: ${loaded} drugs`);
  if (skipped > 0) log.warning(`Skipped: ${skipped} (duplicates)`);
  if (errors > 0) {
    log.warning(`Errors: ${errors}`);
    if (firstError) {
      log.info(`First error: ${firstError.message || JSON.stringify(firstError)}`);
    }
  }
  
  return loaded;
}

async function main() {
  try {
    log.header('AIMED - Load OpenFDA Drugs');
    
    validateConfig();
    const supabase = initSupabase();
    
    log.header('Fetching Drug Data from OpenFDA');
    
    let allDrugs = [];
    let skip = 0;
    let totalFetched = 0;
    
    // Fetch pages until we get all drugs
    while (true) {
      const { drugs, total } = await fetchDrugPage(skip, 100);
      
      if (drugs.length === 0) {
        log.info(`Reached end of data at skip ${skip}`);
        break;
      }
      
      // Parse and add drugs
      for (const drug of drugs) {
        const parsed = parseDrug(drug);
        if (parsed) {
          allDrugs.push(parsed);
        }
        
        // Rate limiting - FDA API allows 240 requests/minute
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      totalFetched += drugs.length;
      log.info(`Total fetched so far: ${totalFetched}/${total}`);
      
      skip += 100;
      
      // Stop after reasonable amount (adjust as needed)
      if (skip > 5000) { // Get first 5,000 drugs
        log.warning('Stopping at 5,000 drugs (adjust limit in code)');
        break;
      }
    }
    
    // Load into database
    const loaded = await loadDrugs(supabase, allDrugs);
    
    log.success(`✓ Complete! Loaded ${loaded} drugs into database`);
    
  } catch (error) {
    log.error(`Unexpected error: ${error.message}`);
    process.exit(1);
  }
}

main();
