//loads common medicines and supplements
import { supabase } from './supabaseClient.js'

const STARTER_PRODUCTS = [
  { name: 'aspirin', type: 'medicine', generic_name: 'Acetylsalicylic Acid', brand_names: ['Bayer', 'Ecotrin'], dosage_form: 'tablet', strength: '325mg', description: 'Pain reliever and anti-inflammatory', active_ingredients: ['Acetylsalicylic Acid'] },
  { name: 'ibuprofen', type: 'medicine', generic_name: 'Ibuprofen', brand_names: ['Advil', 'Motrin'], dosage_form: 'tablet', strength: '200mg', description: 'Pain reliever and anti-inflammatory', active_ingredients: ['Ibuprofen'] },
  { name: 'acetaminophen', type: 'medicine', generic_name: 'Acetaminophen', brand_names: ['Tylenol'], dosage_form: 'tablet', strength: '500mg', description: 'Pain reliever and fever reducer', active_ingredients: ['Acetaminophen'] },
  { name: 'vitamin d', type: 'supplement', generic_name: 'Cholecalciferol', brand_names: ['Nature Made', 'Solgar'], dosage_form: 'capsule', strength: '1000 IU', description: 'Vitamin D supplement for bone health', active_ingredients: ['Cholecalciferol', 'Vitamin D3'] },
  { name: 'vitamin c', type: 'supplement', generic_name: 'Ascorbic Acid', brand_names: ['Nature\'s Way', 'NOW Foods'], dosage_form: 'tablet', strength: '500mg', description: 'Vitamin C supplement for immunity', active_ingredients: ['Ascorbic Acid'] },
  { name: 'calcium', type: 'supplement', generic_name: 'Calcium Carbonate', brand_names: ['Citracal', 'Tums'], dosage_form: 'tablet', strength: '500mg', description: 'Calcium supplement for bone health', active_ingredients: ['Calcium Carbonate'] },
  { name: 'magnesium', type: 'supplement', generic_name: 'Magnesium Oxide', brand_names: ['Natrol', 'Bluebonnet'], dosage_form: 'tablet', strength: '400mg', description: 'Magnesium supplement for muscle health', active_ingredients: ['Magnesium Oxide'] },
  { name: 'iron', type: 'supplement', generic_name: 'Ferrous Sulfate', brand_names: ['Slow Fe', 'Floradix'], dosage_form: 'tablet', strength: '325mg', description: 'Iron supplement for energy', active_ingredients: ['Ferrous Sulfate'] },
  { name: 'zinc', type: 'supplement', generic_name: 'Zinc Gluconate', brand_names: ['Zicam', 'Sambucol'], dosage_form: 'lozenge', strength: '15mg', description: 'Zinc supplement for immunity', active_ingredients: ['Zinc Gluconate'] },
  { name: 'vitamin b12', type: 'supplement', generic_name: 'Cyanocobalamin', brand_names: ['Methylcobalamin', 'Jarrow'], dosage_form: 'tablet', strength: '1000mcg', description: 'Vitamin B12 for energy and nerve function', active_ingredients: ['Cyanocobalamin'] },
  { name: 'omega-3', type: 'supplement', generic_name: 'Fish Oil', brand_names: ['Nordic Naturals', 'Carlson Labs'], dosage_form: 'softgel', strength: '1000mg', description: 'Omega-3 fatty acid for heart health', active_ingredients: ['EPA', 'DHA'] },
  { name: 'probiotics', type: 'supplement', generic_name: 'Lactobacillus', brand_names: ['Align', 'Culturelle'], dosage_form: 'capsule', strength: '10 billion CFU', description: 'Probiotic for digestive health', active_ingredients: ['Lactobacillus', 'Bifidobacterium'] },
  { name: 'melatonin', type: 'supplement', generic_name: 'Melatonin', brand_names: ['Natrol', 'Schiff'], dosage_form: 'tablet', strength: '5mg', description: 'Sleep aid supplement', active_ingredients: ['Melatonin'] },
  { name: 'ginseng', type: 'supplement', generic_name: 'Panax Ginseng', brand_names: ['Ginseng Gold', 'Sunrider'], dosage_form: 'capsule', strength: '500mg', description: 'Ginseng for energy and stress relief', active_ingredients: ['Ginsenosides', 'Panax Ginseng'] },
  { name: 'turmeric', type: 'supplement', generic_name: 'Curcuma longa', brand_names: ['Turmeric Force', 'Organic India'], dosage_form: 'capsule', strength: '500mg', description: 'Turmeric for inflammation support', active_ingredients: ['Curcumin', 'Turmeric Root'] },
  { name: 'ginger', type: 'supplement', generic_name: 'Zingiber officinale', brand_names: ['Ginger Force', 'Traditional Medicinals'], dosage_form: 'capsule', strength: '400mg', description: 'Ginger for digestive and anti-inflammatory support', active_ingredients: ['Gingerol', 'Ginger Root'] },
  { name: 'garlic', type: 'supplement', generic_name: 'Allium sativum', brand_names: ['Kyolic', 'NOW Foods'], dosage_form: 'tablet', strength: '1000mg', description: 'Garlic supplement for heart health', active_ingredients: ['Allicin', 'Aged Garlic'] },
  { name: 'echinacea', type: 'supplement', generic_name: 'Echinacea purpurea', brand_names: ['Gaia', 'Nature\'s Sunshine'], dosage_form: 'capsule', strength: '500mg', description: 'Echinacea for immune support', active_ingredients: ['Echinacea Root', 'Echinacea Herb'] },
  { name: 'elderberry', type: 'supplement', generic_name: 'Sambucus nigra', brand_names: ['Sambucol', 'Nature\'s Way'], dosage_form: 'syrup', strength: '10mg/ml', description: 'Elderberry for immune support', active_ingredients: ['Sambucus Fruit', 'Elderberry Extract'] },
  { name: 'valerian', type: 'supplement', generic_name: 'Valeriana officinalis', brand_names: ['Herb Pharm', 'Traditional Medicinals'], dosage_form: 'capsule', strength: '500mg', description: 'Valerian root for sleep support', active_ingredients: ['Valerenic Acid', 'Valerian Root'] },
];

async function load() {
  try {
    console.log('Loading starter data...');
    
    for (const product of STARTER_PRODUCTS) {
      const { error } = await supabase
        .from('products')
        .insert([product])
        .select();
      
      if (error && !error.message.includes('duplicate')) {
        console.error(`Error inserting ${product.name}:`, error.message);
      }
    }
    
    console.log('✓ Starter data loaded!');
  } catch (error) {
    console.error('Error loading starter data:', error);
  }
}

load().catch(console.error)