-- ============================================================================
-- PRODUCTS TABLE (Medicines & Supplements)
-- ============================================================================

CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  type VARCHAR(50) NOT NULL CHECK (type IN ('medicine', 'supplement')),
  nih_drug_id INT,
  dsld_id INT,
  generic_name VARCHAR(255),
  brand_names TEXT[],
  category VARCHAR(100),
  strength VARCHAR(100),
  dosage_form VARCHAR(50),
  description TEXT,
  active_ingredients TEXT[],
  market_status VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- INTERACTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS interactions (
  id BIGSERIAL PRIMARY KEY,
  product_id_1 BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_id_2 BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  nih_interaction_id INT,
  interaction_description TEXT NOT NULL,
  mechanism TEXT,
  effect TEXT,
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('mild', 'moderate', 'severe', 'contraindicated')),
  evidence_level VARCHAR(50),
  notes TEXT,
  sources TEXT[],
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(product_id_1, product_id_2)
);

-- ============================================================================
-- PHARMACIES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS pharmacies (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  chain VARCHAR(100),
  address VARCHAR(500) NOT NULL,
  city VARCHAR(100),
  state VARCHAR(2),
  zip_code VARCHAR(10) NOT NULL,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  phone VARCHAR(20),
  hours JSONB,
  accepts_insurance TEXT[],
  website VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- PHARMACY INVENTORY (Which products each pharmacy has)
-- ============================================================================

CREATE TABLE IF NOT EXISTS pharmacy_inventory (
  id BIGSERIAL PRIMARY KEY,
  pharmacy_id BIGINT NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  price DECIMAL(10, 2),
  in_stock BOOLEAN DEFAULT true,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(pharmacy_id, product_id)
);

-- ============================================================================
-- INSURANCE PROVIDERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS insurance_providers (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- USER SEARCHES TABLE (For analytics)
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_searches (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID,
  search_type VARCHAR(50),
  query TEXT,
  results JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_type ON products(type);
CREATE INDEX IF NOT EXISTS idx_products_nih_id ON products(nih_drug_id);
CREATE INDEX IF NOT EXISTS idx_products_dsld_id ON products(dsld_id);
CREATE INDEX IF NOT EXISTS idx_interactions_products ON interactions(product_id_1, product_id_2);
CREATE INDEX IF NOT EXISTS idx_pharmacies_zip ON pharmacies(zip_code);
CREATE INDEX IF NOT EXISTS idx_pharmacies_location ON pharmacies(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_pharmacy_inventory ON pharmacy_inventory(pharmacy_id);

-- ============================================================================
-- AUTO-UPDATE TRIGGER FOR updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER IF NOT EXISTS update_products_updated_at
BEFORE UPDATE ON products
FOR EACH ROW
EXECUTE PROCEDURE update_updated_at_column();
