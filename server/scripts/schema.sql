CREATE TABLE IF NOT EXISTS products (
  dsld_id INTEGER PRIMARY KEY,
  url TEXT,
  product_name TEXT,
  brand_name TEXT,
  bar_code TEXT,
  net_contents TEXT,
  serving_size TEXT,
  product_type TEXT,
  supplement_form TEXT,
  date_entered DATE,
  market_status TEXT,
  suggested_use TEXT
);

CREATE TABLE IF NOT EXISTS supplement_facts (
  id BIGSERIAL PRIMARY KEY,
  dsld_id INTEGER REFERENCES products(dsld_id),
  url TEXT,
  product_name TEXT,
  serving_size TEXT,
  ingredient TEXT,
  ingredient_category TEXT,
  amount_per_serving TEXT,
  amount_unit TEXT,
  daily_value TEXT,
  daily_value_target_group TEXT
);

CREATE TABLE IF NOT EXISTS other_ingredients (
  id BIGSERIAL PRIMARY KEY,
  dsld_id INTEGER REFERENCES products(dsld_id),
  url TEXT,
  product_name TEXT,
  other_ingredients TEXT
);

CREATE TABLE IF NOT EXISTS label_statements (
  id BIGSERIAL PRIMARY KEY,
  dsld_id INTEGER REFERENCES products(dsld_id),
  url TEXT,
  product_name TEXT,
  statement_type TEXT,
  statement TEXT
);

CREATE TABLE IF NOT EXISTS company_information (
  id BIGSERIAL PRIMARY KEY,
  dsld_id INTEGER REFERENCES products(dsld_id),
  url TEXT,
  product_name TEXT,
  company_name TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  country TEXT,
  manufacturer TEXT,
  distributor TEXT,
  packager TEXT,
  reseller TEXT,
  other TEXT
);

CREATE TABLE IF NOT EXISTS interactions (
  id BIGSERIAL PRIMARY KEY,
  ingredient_a TEXT NOT NULL,
  ingredient_b TEXT NOT NULL,
  severity TEXT,
  interaction TEXT,
  notes TEXT,
  evidence_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_interactions_pair
  ON interactions (ingredient_a, ingredient_b);

CREATE INDEX IF NOT EXISTS idx_supplement_facts_dsld_id ON supplement_facts(dsld_id);
CREATE INDEX IF NOT EXISTS idx_supplement_facts_ingredient ON supplement_facts(ingredient);
CREATE INDEX IF NOT EXISTS idx_other_ingredients_dsld_id ON other_ingredients(dsld_id);
CREATE INDEX IF NOT EXISTS idx_label_statements_dsld_id ON label_statements(dsld_id);
CREATE INDEX IF NOT EXISTS idx_company_information_dsld_id ON company_information(dsld_id);
CREATE INDEX IF NOT EXISTS idx_interactions_ingredient_a ON interactions(ingredient_a);
CREATE INDEX IF NOT EXISTS idx_interactions_ingredient_b ON interactions(ingredient_b);
