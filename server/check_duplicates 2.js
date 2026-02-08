#!/usr/bin/env node
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();
const { Client } = pg;

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function checkDuplicates() {
  try {
    await client.connect();
    
    // Get total count
    const countResult = await client.query('SELECT COUNT(*) as total FROM products');
    console.log(`Total products: ${countResult.rows[0].total}`);
    
    // Check for duplicates by dsld_id
    const dsldDupesResult = await client.query(`
      SELECT dsld_id, COUNT(*) as count 
      FROM products 
      WHERE dsld_id IS NOT NULL 
      GROUP BY dsld_id 
      HAVING COUNT(*) > 1
      ORDER BY count DESC
    `);
    
    if (dsldDupesResult.rows.length > 0) {
      console.log(`\n⚠ Found ${dsldDupesResult.rows.length} duplicate DSLD IDs:`);
      dsldDupesResult.rows.slice(0, 10).forEach(row => {
        console.log(`  DSLD ID ${row.dsld_id}: ${row.count} times`);
      });
    } else {
      console.log('✓ No duplicate DSLD IDs');
    }
    
    // Check for duplicates by name
    const nameDupesResult = await client.query(`
      SELECT name, COUNT(*) as count 
      FROM products 
      GROUP BY name 
      HAVING COUNT(*) > 1
      ORDER BY count DESC
    `);
    
    if (nameDupesResult.rows.length > 0) {
      console.log(`\n⚠ Found ${nameDupesResult.rows.length} duplicate product names:`);
      nameDupesResult.rows.slice(0, 10).forEach(row => {
        console.log(`  "${row.name}": ${row.count} times`);
      });
    } else {
      console.log('✓ No duplicate product names');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

checkDuplicates();
