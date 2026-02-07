//loads 100 common medicines
const { supabase } = require('./supabaseClient')
const { loadStarterData } = require('./starter_medicines')

async function load() {
  await loadStarterData(supabase)
  console.log('✓ Starter data loaded!')
}

load().catch(console.error)