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
  
  // Get brand names
  const brandNames = [];
  if (drug.brand_name && Array.isArray(drug.brand_name)) {
    brandNames.push(...drug.brand_name.slice(0, 5)); // Limit to first 5
  }
  
  // Get generic name
  let genericName = null;
  if (drug.generic_name && Array.isArray(drug.generic_name)) {
    genericName = drug.generic_name[0];
  }
  
  // Get dosage form
  let dosageForm = null;
  if (drug.dosage_form && Array.isArray(drug.dosage_form)) {
    dosageForm = drug.dosage_form[0];
  }
  
  // Get strength
  let strength = null;
  if (drug.strength && Array.isArray(drug.strength)) {
    strength = drug.strength[0];
  }
  
  // Get product name (required)
  const productName = drug.product_ndc && Array.isArray(drug.product_ndc) 
    ? drug.product_ndc[0] 
    : drug.brand_name && Array.isArray(drug.brand_name)
    ? drug.brand_name[0]
    : null;
  
  if (!productName) {
    return null; // Skip if no name
  }
  
  return {
    name: productName,
    type: 'drug',
    dsld_id: drug.id || null,
    generic_name: genericName,
    brand_names: brandNames.length > 0 ? brandNames : [],
    dosage_form: dosageForm,
    strength: strength,
    description: productName,
    active_ingredients: ingredients.length > 0 ? ingredients : [],
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
  
  for (let i = 0; i < drugs.length; i++) {
    try {
      // Skip if already exists
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
        continue;
      }
      
      loaded++;
      
      if ((i + 1) % 50 === 0) {
        log.info(`Progress: ${i + 1}/${drugs.length}`);
      }
    } catch (error) {
      errors++;
    }
  }
  
  console.log('');
  log.success(`Loaded: ${loaded} drugs`);
  if (skipped > 0) log.warning(`Skipped: ${skipped} (already exist)`);
  if (errors > 0) log.warning(`Errors: ${errors}`);
  
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
      if (skip > 1000) { // Get first 1,000 drugs
        log.warning('Stopping at 1,000 drugs (adjust limit in code)');
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
