# AIMED - Medicine/Supplement AI Chatbot

## Project Overview
An AI-powered web platform that helps users understand medicine and supplement interactions, compare products, get personalized recommendations, and find local healthcare providers.

---

## Features

### 1. Landing Page
- **Hero section** with app title and tagline
- **Chat input** - Smart routing based on user query
  - "Does vitamin D interact with..." → Mix Check
  - "Compare vitamin D and..." → Compare
  - "What should I take for..." → Recommendations
  - "Where can I get..." → Where to Go
- **Navigation tabs** to each section
- **Call-to-action buttons** linking to features

### 2. Mix Check (Drug/Supplement Interactions)
- **Input methods:**
  - Custom text input with autocomplete
  - Dropdown selection from product database
  - Add multiple products
- **Display interaction results:**
  - Table: `| Substance A | Substance B | Interaction | Severity | Notes |`
  - Color-coded severity (High/Moderate/Low)
  - Clinician-friendly explanations
  - Actionable advice (separation timing, monitoring, etc.)

### 3. Compare Products
- **Input:**
  - Single product → suggestions for similar options
  - Multiple products → side-by-side comparison
- **Comparison table:**
  - `| Product | Dose | Form | Key Notes |`
  - Highlights differences
  - Price/availability notes

### 4. Recommendations (with Disclaimer)
- **Large disclaimer** about consulting healthcare providers
- **Input:**
  - Symptoms (e.g., "low energy", "joint pain")
  - Medical history/conditions
  - Current medications
- **Output:**
  - Recommended supplements with evidence level
  - Associated medicines (informational only)
  - Lifestyle suggestions
  - When to see a doctor

### 5. Where to Go
- **Insurance provider input**
- **Location input**
- **Output:**
  - Coverage information
  - Nearby providers/pharmacies
  - Telemedicine options
  - Contact information

---

## Tech Stack

### Frontend
- **Framework:** React + Vite
- **Styling:** CSS (currently in App.css)
- **Design:** Figma → implemented in React components
- **Deployment:** (TBD - Vercel/Netlify)

### Backend
- **Framework:** Fastify (Node.js)
- **API:** REST endpoints for:
  - Product search
  - Interaction checking
  - Recommendations
  - Provider lookup

### Database
- **Primary:** Supabase (PostgreSQL)
  - Store product/supplement data
  - Store company information
  - Cache AI-generated interactions
- **Tables:**
  - `products` - product metadata
  - `supplement_facts` - nutritional/ingredient info
  - `interactions` - pre-computed or cached interactions
  - `company_information` - manufacturer/distributor info

### AI/ML
- **Interaction Analysis:** K2 Think API
  - Validate drug-drug and drug-supplement interactions
  - Generate clinical explanations
- **Recommendations:** OpenAI GPT API or HuggingFace models
  - Personalized supplement recommendations
  - Natural language query understanding
- **Provider Lookup:** Google Maps API or healthcare database

---

## Architecture

```
aimed/
├── frontend/                 # React + Vite
│   ├── src/
│   │   ├── components/      # Reusable UI components
│   │   ├── pages/           # Page components (Mix, Compare, Recommend, WhereToGo)
│   │   ├── hooks/           # Custom React hooks
│   │   ├── services/        # API calls
│   │   └── App.jsx
│   └── package.json
├── server/                   # Fastify backend
│   ├── src/
│   │   ├── routes/          # API routes
│   │   ├── controllers/     # Business logic
│   │   ├── services/        # K2 Think, AI, database queries
│   │   ├── middleware/      # Auth, validation
│   │   └── index.js         # Server entry
│   ├── scripts/
│   │   ├── schema.sql       # Database schema
│   │   ├── migrate.js       # Run migrations
│   │   └── ingest.js        # Load DSLD data
│   └── package.json
└── data/                     # DSLD CSV data
    └── DSLD-full-database-CSV/
```

---

## Database Schema

### products
```sql
CREATE TABLE products (
  dsld_id INTEGER PRIMARY KEY,
  url TEXT,
  product_name TEXT,
  brand_name TEXT,
  supplement_form TEXT,
  serving_size TEXT,
  date_entered DATE,
  market_status TEXT,
  suggested_use TEXT
);
```

### supplement_facts
```sql
CREATE TABLE supplement_facts (
  id BIGSERIAL PRIMARY KEY,
  dsld_id INTEGER REFERENCES products(dsld_id),
  ingredient TEXT,
  amount_per_serving TEXT,
  daily_value TEXT
);
```

### interactions (cached/computed)
```sql
CREATE TABLE interactions (
  id BIGSERIAL PRIMARY KEY,
  product_id_1 INTEGER REFERENCES products(dsld_id),
  product_id_2 INTEGER REFERENCES products(dsld_id),
  interaction_type TEXT,
  severity TEXT (HIGH/MODERATE/LOW),
  description TEXT,
  clinical_notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## API Endpoints

### Products
- `GET /api/products` - Search products
- `GET /api/products/:id` - Get product details
- `GET /api/products/search?q=vitamin` - Autocomplete search

### Interactions
- `POST /api/interactions/check` - Check interaction between products
  ```json
  {
    "product_ids": [123, 456],
    "use_cache": true
  }
  ```

### Recommendations
- `POST /api/recommendations` - Get personalized recommendations
  ```json
  {
    "symptoms": ["fatigue", "joint pain"],
    "medical_history": ["hypertension"],
    "current_medications": [456],
    "age": 45
  }
  ```

### Providers
- `GET /api/providers/search` - Find healthcare providers
  ```json
  {
    "location": "94102",
    "insurance": "Aetna",
    "type": "pharmacy|doctor|telemedicine"
  }
  ```

---

## Implementation Roadmap

### Phase 1: Core Setup
- [ ] Migrate DSLD data to Supabase
- [ ] Set up Fastify server with basic routes
- [ ] Build product search endpoint
- [ ] Connect frontend to backend

### Phase 2: Mix Check Feature
- [ ] Integrate K2 Think API for interaction checking
- [ ] Build interaction UI (tables, severity badges)
- [ ] Add caching for common interactions
- [ ] Implement custom product input

### Phase 3: Compare Feature
- [ ] Build product comparison logic
- [ ] Create comparison UI
- [ ] Add similarity suggestions

### Phase 4: Recommendations
- [ ] Integrate GPT/HuggingFace for recommendations
- [ ] Build symptom/history input forms
- [ ] Add large disclaimer component
- [ ] Display recommendations with evidence levels

### Phase 5: Where to Go
- [ ] Integrate provider database/Google Maps API
- [ ] Build location + insurance inputs
- [ ] Display results with contact info

### Phase 6: Polish & Deploy
- [ ] Finish Figma designs
- [ ] Add responsive design
- [ ] Optimize performance
- [ ] Deploy frontend + backend
- [ ] Add monitoring/logging

---

## Environment Variables

**Frontend (.env):**
```
VITE_K2_ENDPOINT_URL=
VITE_K2_API_KEY=
REACT_APP_SUPABASE_URL=
REACT_APP_SUPABASE_ANON_KEY=
VITE_OPENAI_API_KEY=
```

**Backend (.env):**
```
DATABASE_URL=
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
K2_API_KEY=
OPENAI_API_KEY=
GOOGLE_MAPS_API_KEY=
```

---

## Next Steps
1. Finalize designs in Figma
2. Set up provider database integration
3. Create detailed component specs
4. Begin Phase 1 implementation
