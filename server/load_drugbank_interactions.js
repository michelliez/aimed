#!/usr/bin/env node
//for later implementation
/**
 * AIMED - Load DrugBank Interactions
 * Parses DrugBank XML and loads drug-drug interactions into Supabase
 * 
 * Usage: node load_drugbank_interactions.js [path/to/drugbank_file.xml]
 * 
 * Prerequisites:
 * 1. Download DrugBank XML from https://go.drugbank.com/releases
 * 2. Unzip the file
 * 3. Run: npm install fast-xml-parser
 */

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

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

// Simple XML parser - reads line by line for memory efficiency
function parseXMLLine(line) {
  // Extract content between XML tags
  const match = line.match(/<([^>]+)>([^<]*)<\/\1>/);
  if (match) {
    return { tag: match[1], value: match[2] };
  }
  return null;
}

async function parsedrugbankXML(filePath) {
  log.info(`Reading DrugBank XML file: ${filePath}`);
  
  if (!fs.existsSync(filePath)) {
    log.error(`File not found: ${filePath}`);
    process.exit(1);
  }
  
  const drugs = [];
  let currentDrug = null;
  let currentInteraction = null;
  let lineCount = 0;
  
  try {
    const fileSize = fs.statSync(filePath).size;
    const fileSizeMB = (fileSize / 1024 / 1024).toFixed(2);
    log.info(`File size: ${fileSizeMB} MB`);
    
    const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
    let buffer = '';
    
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => {
        buffer += chunk;
        const lines = buffer.split('\n');
        
        // Keep last incomplete line in buffer
        buffer = lines.pop() || '';
        
        lines.forEach(line => {
          lineCount++;
          line = line.trim();
          
          if (line.includes('<drug>')) {
            currentDrug = { id: null, name: null, interactions: [] };
          } else if (line.includes('</drug>')) {
            if (currentDrug && currentDrug.id && currentDrug.name) {
              drugs.push(currentDrug);
            }
            currentDrug = null;
          } else if (line.includes('<drugbank-id>') && currentDrug) {
            const match = line.match(/<drugbank-id>([^<]+)<\/drugbank-id>/);
            if (match && !currentDrug.id) {
              currentDrug.id = match[1];
            }
          } else if (line.includes('<name>') && currentDrug && !currentDrug.name) {
            const match = line.match(/<name>([^<]+)<\/name>/);
            if (match) {
              currentDrug.name = match[1];
            }
          } else if (line.includes('<drug-interaction>')) {
            currentInteraction = { id: null, name: null, description: null };
          } else if (line.includes('</drug-interaction>')) {
            if (currentInteraction && currentDrug && currentInteraction.name) {
              currentDrug.interactions.push(currentInteraction);
            }
            currentInteraction = null;
          } else if (currentInteraction) {
            if (line.includes('<drugbank-id>')) {
              const match = line.match(/<drugbank-id>([^<]+)<\/drugbank-id>/);
              if (match) currentInteraction.id = match[1];
            } else if (line.includes('<name>')) {
              const match = line.match(/<name>([^<]+)<\/name>/);
              if (match) currentInteraction.name = match[1];
            } else if (line.includes('<description>')) {
              const match = line.match(/<description>([^<]+)<\/description>/);
              if (match) currentInteraction.description = match[1];
            }
          }
          
          if (lineCount % 50000 === 0) {
            log.info(`Parsed ${lineCount} lines, ${drugs.length} drugs found...`);
          }
        });
      });
      
      stream.on('end', () => {
        // Process final buffer
        if (buffer.trim()) {
          const lines = buffer.split('\n');
          lines.forEach(line => {
            line = line.trim();
            if (line.includes('<drugbank-id>') && currentDrug) {
              const match = line.match(/<drugbank-id>([^<]+)<\/drugbank-id>/);
              if (match && !currentDrug.id) {
                currentDrug.id = match[1];
              }
            } else if (line.includes('<name>') && currentDrug && !currentDrug.name) {
              const match = line.match(/<name>([^<]+)<\/name>/);
              if (match) {
                currentDrug.name = match[1];
              }
            }
          });
        }
        
        log.success(`Parsed ${lineCount} lines, ${drugs.length} drugs extracted`);
        resolve(drugs);
      });
      
      stream.on('error', reject);
    });
  } catch (error) {
    log.error(`Error parsing XML: ${error.message}`);
    throw error;
  }
}

async function findProductId(supabase, drugName) {
  try {
    // Try exact match first
    let { data } = await supabase
      .from('products')
      .select('id')
      .ilike('name', drugName)
      .limit(1);
    
    if (data && data.length > 0) return data[0].id;
    
    // Try partial match (for brand names like "SILICEA 30X")
    const baseName = drugName.split(' ')[0];
    if (baseName.length > 3) {
      ({ data } = await supabase
        .from('products')
        .select('id')
        .ilike('name', `${baseName}%`)
        .limit(1));
      
      if (data && data.length > 0) return data[0].id;
    }
    
    return null;
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
    log.header('AIMED - Load DrugBank Interactions');
    
    // Get file path from args or use default
    const filePath = process.argv[2] || './drugbank_all_full_database.xml';
    
    validateConfig();
    const supabase = initSupabase();
    
    log.header('Parsing DrugBank XML');
    const drugs = await parsedrugbankXML(filePath);
    
    log.header(`Matching Drugs with Products (${drugs.length} drugs)`);
    
    const interactions = [];
    let matched = 0;
    let unmatched = 0;
    let totalInteractions = 0;
    
    for (let i = 0; i < drugs.length; i++) {
      const drug = drugs[i];
      
      // Find product ID in database
      const productId1 = await findProductId(supabase, drug.name);
      
      if (!productId1) {
        unmatched++;
        continue;
      }
      
      matched++;
      
      // Process interactions
      for (const inter of drug.interactions) {
        const productId2 = await findProductId(supabase, inter.name);
        
        if (productId2) {
          interactions.push({
            product_id_1: productId1,
            product_id_2: productId2,
            interaction_description: inter.description || inter.name,
            severity: 'moderate', // Default, could be enhanced
            notes: `From DrugBank`,
          });
          totalInteractions++;
        }
      }
      
      if ((i + 1) % 500 === 0) {
        log.info(`Progress: ${i + 1}/${drugs.length} (matched: ${matched}, interactions: ${totalInteractions})`);
      }
    }
    
    log.info(`Matched: ${matched}/${drugs.length} drugs`);
    log.info(`Found: ${totalInteractions} interactions`);
    
    // Load into database
    const loaded = await loadInteractions(supabase, interactions);
    
    log.success(`✓ Complete! Loaded ${loaded} interactions into database`);
    
  } catch (error) {
    log.error(`Unexpected error: ${error.message}`);
    process.exit(1);
  }
}

main();
