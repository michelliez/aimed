import React, { useEffect, useMemo, useState } from 'react'

const DISCLAIMER =
  'For educational purposes only — not medical advice. Always consult a healthcare professional.'

const MOCK_PRODUCTS = [
  { name: 'Vitamin D3' },
  { name: 'Magnesium glycinate' },
  { name: 'Ibuprofen' },
  { name: 'Sertraline' },
  { name: 'Omega-3 fish oil' },
]

export function RecommendationPage() {
  const [symptomsInput, setSymptomsInput] = useState('')
  const [medicationInput, setMedicationInput] = useState('')
  const [supplementInput, setSupplementInput] = useState('')
  const [medications, setMedications] = useState([])
  const [supplements, setSupplements] = useState([])
  const [productOptions, setProductOptions] = useState([])
  const [medicationSelection, setMedicationSelection] = useState('')
  const [supplementSelection, setSupplementSelection] = useState('')
  const [medicalConsiderations, setMedicalConsiderations] = useState({
    pregnancy: false,
    allergies: false,
    kidneyLiverIssues: false,
    bloodPressureConcerns: false,
  })
  const [preferences, setPreferences] = useState({
    preferenceType: 'no_preference',
    avoidDrowsiness: false,
    avoidStimulants: false,
  })
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [usingMock, setUsingMock] = useState(false)

  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:9000'

  const symptomList = useMemo(() => toList(symptomsInput), [symptomsInput])

  useEffect(() => {
    const loadProducts = async () => {
      try {
        const response = await fetch(`${apiBase}/products?limit=50`)
        if (!response.ok) throw new Error(`http_${response.status}`)
        const payload = await response.json()
        if (payload.error) throw new Error(payload.error)
        const items = payload.items || []
        const mapped = items.map((item) => ({
          name: item.name || item.product_name || item.generic_name || item.brand_name || 'Unknown',
        }))
        setProductOptions(mapped.length ? mapped : MOCK_PRODUCTS)
        setMedicationSelection(mapped[0]?.name || '')
        setSupplementSelection(mapped[0]?.name || '')
        setUsingMock(false)
      } catch (err) {
        setProductOptions(MOCK_PRODUCTS)
        setMedicationSelection(MOCK_PRODUCTS[0]?.name || '')
        setSupplementSelection(MOCK_PRODUCTS[0]?.name || '')
        setUsingMock(true)
      }
    }

    loadProducts()
  }, [apiBase])

  const addItem = (value, list, setList) => {
    const trimmed = value.trim()
    if (!trimmed) return
    if (list.includes(trimmed)) return
    setList([...list, trimmed])
  }

  const removeItem = (value, list, setList) => {
    setList(list.filter((item) => item !== value))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch(`${apiBase}/recommendations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symptoms: symptomList,
          medications,
          supplements,
          medicalConsiderations,
          preferences,
        }),
      })

      if (!response.ok) {
        throw new Error(`http_${response.status}`)
      }
      const payload = await response.json()
      if (payload.error) throw new Error(payload.error)
      setResult(payload)
      setUsingMock(false)
    } catch (err) {
      setResult(getLocalFallback(symptomList))
      setUsingMock(true)
      setError('Backend unavailable. Showing demo recommendations.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="page">
      {/* Header */}
      <div className="rec-header">
        <h2>Recommendations</h2>
        <p className="lead">Educational options for common health concerns.</p>
      </div>

      {/* Disclaimer bar */}
      <div className="rec-disclaimer-bar">
        <span className="disc-icon" aria-hidden="true">&#9888;</span>
        <span>{DISCLAIMER}</span>
      </div>

      {/* Mock banner */}
      {usingMock && (
        <div className="rec-mock-banner">
          <span aria-hidden="true">&#9881;</span>
          Using local demo data. Connect the backend for live results.
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="rec-form">
        {/* 1 — Symptoms */}
        <div className="rec-section">
          <div className="rec-section-head">
            <span className="rec-step-num">1</span>
            <div className="rec-section-title">
              <h3>Symptoms</h3>
            </div>
          </div>
          <input
            className="rec-add-row"
            style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius)', border: '1px solid rgba(31,47,85,0.16)', font: 'inherit', fontSize: '0.9rem' }}
            value={symptomsInput}
            onChange={(event) => setSymptomsInput(event.target.value)}
            placeholder="e.g. headache, poor sleep, acid reflux"
          />
          {symptomList.length > 0 && (
            <div className="symptom-preview">
              {symptomList.map((s) => (
                <span key={s} className="chip">{s}</span>
              ))}
            </div>
          )}
        </div>

        {/* 2 — Medications & Supplements */}
        <div className="rec-section">
          <div className="rec-section-head">
            <span className="rec-step-num">2</span>
            <div className="rec-section-title">
              <h3>Current medications &amp; supplements</h3>
            </div>
          </div>

          <div className="grid-two">
            {/* Medications sub-panel */}
            <div className="rec-sub-panel">
              <h4><span className="sub-icon" aria-hidden="true">&#128138;</span> Medications</h4>
              <div className="rec-add-row">
                <input
                  value={medicationInput}
                  onChange={(event) => setMedicationInput(event.target.value)}
                  placeholder="Type a medication"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      addItem(medicationInput, medications, setMedications)
                      setMedicationInput('')
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn-add"
                  onClick={() => {
                    addItem(medicationInput, medications, setMedications)
                    setMedicationInput('')
                  }}
                >
                  Add
                </button>
              </div>
              <div className="rec-or">or pick from list</div>
              <div className="rec-add-row">
                <select
                  value={medicationSelection}
                  onChange={(event) => setMedicationSelection(event.target.value)}
                >
                  {productOptions.map((option) => (
                    <option key={`med-${option.name}`} value={option.name}>
                      {option.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn-add"
                  onClick={() => addItem(medicationSelection, medications, setMedications)}
                >
                  Add
                </button>
              </div>
              <ChipList items={medications} onRemove={(item) => removeItem(item, medications, setMedications)} />
            </div>

            {/* Supplements sub-panel */}
            <div className="rec-sub-panel">
              <h4><span className="sub-icon" aria-hidden="true">&#127807;</span> Supplements</h4>
              <div className="rec-add-row">
                <input
                  value={supplementInput}
                  onChange={(event) => setSupplementInput(event.target.value)}
                  placeholder="Type a supplement"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      addItem(supplementInput, supplements, setSupplements)
                      setSupplementInput('')
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn-add"
                  onClick={() => {
                    addItem(supplementInput, supplements, setSupplements)
                    setSupplementInput('')
                  }}
                >
                  Add
                </button>
              </div>
              <div className="rec-or">or pick from list</div>
              <div className="rec-add-row">
                <select
                  value={supplementSelection}
                  onChange={(event) => setSupplementSelection(event.target.value)}
                >
                  {productOptions.map((option) => (
                    <option key={`supp-${option.name}`} value={option.name}>
                      {option.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn-add"
                  onClick={() => addItem(supplementSelection, supplements, setSupplements)}
                >
                  Add
                </button>
              </div>
              <ChipList items={supplements} onRemove={(item) => removeItem(item, supplements, setSupplements)} />
            </div>
          </div>
        </div>

        {/* 3 — Medical considerations */}
        <div className="rec-section">
          <div className="rec-section-head">
            <span className="rec-step-num">3</span>
            <div className="rec-section-title">
              <h3>Medical considerations</h3>
            </div>
          </div>
          <div className="rec-checks">
            <label className="rec-check">
              <input
                type="checkbox"
                checked={medicalConsiderations.pregnancy}
                onChange={(event) =>
                  setMedicalConsiderations((prev) => ({ ...prev, pregnancy: event.target.checked }))
                }
              />
              <span>Pregnancy</span>
            </label>
            <label className="rec-check">
              <input
                type="checkbox"
                checked={medicalConsiderations.allergies}
                onChange={(event) =>
                  setMedicalConsiderations((prev) => ({ ...prev, allergies: event.target.checked }))
                }
              />
              <span>Allergies</span>
            </label>
            <label className="rec-check">
              <input
                type="checkbox"
                checked={medicalConsiderations.kidneyLiverIssues}
                onChange={(event) =>
                  setMedicalConsiderations((prev) => ({ ...prev, kidneyLiverIssues: event.target.checked }))
                }
              />
              <span>Kidney or liver issues</span>
            </label>
            <label className="rec-check">
              <input
                type="checkbox"
                checked={medicalConsiderations.bloodPressureConcerns}
                onChange={(event) =>
                  setMedicalConsiderations((prev) => ({ ...prev, bloodPressureConcerns: event.target.checked }))
                }
              />
              <span>Blood pressure concerns</span>
            </label>
          </div>
        </div>

        {/* 4 — Preferences */}
        <div className="rec-section">
          <div className="rec-section-head">
            <span className="rec-step-num">4</span>
            <div className="rec-section-title">
              <h3>Preferences</h3>
            </div>
          </div>
          <div className="rec-prefs">
            <label className="field" style={{ marginBottom: 0 }}>
              <span>Product type</span>
              <select
                value={preferences.preferenceType}
                onChange={(event) =>
                  setPreferences((prev) => ({ ...prev, preferenceType: event.target.value }))
                }
              >
                <option value="no_preference">No preference</option>
                <option value="prescription">Prescription</option>
                <option value="otc">OTC</option>
                <option value="supplement_only">Supplement-only</option>
              </select>
            </label>
            <div className="rec-checks">
              <label className="rec-check">
                <input
                  type="checkbox"
                  checked={preferences.avoidDrowsiness}
                  onChange={(event) =>
                    setPreferences((prev) => ({ ...prev, avoidDrowsiness: event.target.checked }))
                  }
                />
                <span>Avoid drowsiness</span>
              </label>
              <label className="rec-check">
                <input
                  type="checkbox"
                  checked={preferences.avoidStimulants}
                  onChange={(event) =>
                    setPreferences((prev) => ({ ...prev, avoidStimulants: event.target.checked }))
                  }
                />
                <span>Avoid stimulants</span>
              </label>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rec-error">
            <span aria-hidden="true">&#9888;</span>
            {error}
          </div>
        )}

        {/* Submit */}
        <div className="rec-submit">
          <button type="submit" className="btn-submit" disabled={loading}>
            {loading ? 'Generating...' : 'Get educational options'}
          </button>
        </div>
      </form>

      {/* Loading */}
      {loading && (
        <div className="rec-loading">
          <div className="spinner" />
          <p>Analyzing your profile and building recommendations...</p>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div className="rec-results">
          <div className="rec-results-head">
            <h3>Results</h3>
          </div>

          {/* Warnings */}
          {result.warnings?.length > 0 && (
            <div className="rec-warnings">
              <strong>Warnings</strong>
              <ul>
                {result.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Blocked */}
          {result.blocked ? (
            <div className="rec-blocked">
              <h4>High-risk profile detected</h4>
              <p>
                Because of the risks listed above, the system will not provide
                recommendations. Please consult a licensed clinician or pharmacist.
              </p>
            </div>
          ) : (
            <>
              {/* Recommendation cards */}
              <div className="rec-cards">
                {(result.recommendations || []).map((rec) => (
                  <RecCard key={`${rec.option}-${rec.category}`} rec={rec} />
                ))}
              </div>

              {/* Next steps */}
              {result.nextSteps?.length > 0 && (
                <div className="rec-next-steps">
                  <h4>Next steps</h4>
                  <ol>
                    {result.nextSteps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Bottom disclaimer */}
      <div className="rec-bottom-disc">
        <span className="disc-icon" aria-hidden="true">&#9888;</span>
        <span>{DISCLAIMER}</span>
      </div>
    </section>
  )
}

/* ─── Sub-components ─── */

function RecCard({ rec }) {
  const catClass = categoryClass(rec.category)
  const evidenceClass = `evidence-${toneClass(rec.evidenceStrength)}`
  const riskClass = `risk-${toneClass(rec.interactionRisk)}`

  return (
    <div className="rec-card">
      <div className="rec-card-top">
        <h4>{rec.option}</h4>
        <span className={`rec-card-category ${catClass}`}>{rec.category}</span>
      </div>
      <div className="rec-card-meta">
        <span className={`rec-meta-badge ${evidenceClass}`}>
          {rec.evidenceStrength} evidence
        </span>
        <span className={`rec-meta-badge ${riskClass}`}>
          {rec.interactionRisk} risk
        </span>
      </div>
      {rec.keyCautions && (
        <p className="rec-card-caution-line">{rec.keyCautions}</p>
      )}
    </div>
  )
}

function ChipList({ items, onRemove }) {
  if (!items.length) return <p className="rec-empty">None added yet.</p>
  return (
    <div className="rec-chip-list">
      {items.map((item) => (
        <span key={item} className="rec-chip">
          {item}
          <button
            type="button"
            onClick={() => onRemove(item)}
            aria-label={`Remove ${item}`}
          >
            &times;
          </button>
        </span>
      ))}
    </div>
  )
}

/* ─── Helpers ─── */

function toList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function toneClass(value) {
  const normalized = String(value || '').toLowerCase()
  if (normalized.includes('high')) return 'high'
  if (normalized.includes('moderate') || normalized.includes('medium')) return 'moderate'
  return 'low'
}

function categoryClass(category) {
  const lower = String(category || '').toLowerCase()
  if (lower.includes('supplement')) return 'supplement'
  if (lower.includes('otc') || lower.includes('medication')) return 'otc'
  if (lower.includes('lifestyle')) return 'lifestyle'
  return ''
}

function getLocalFallback(symptoms) {
  const usesSleep = symptoms.some((symptom) => symptom.toLowerCase().includes('sleep'))
  return {
    disclaimer: DISCLAIMER,
    warnings: ['Local demo data only. Connect the backend for live results.'],
    recommendations: [
      {
        option: usesSleep ? 'Magnesium glycinate' : 'Omega-3 fish oil',
        category: 'Supplement',
        whyDiscussed: 'Often discussed in general wellness conversations.',
        keyCautions: 'May interact with certain medications. Ask a clinician.',
        evidenceStrength: 'Moderate',
        interactionRisk: 'Medium',
        avoidIf: 'Significant kidney issues or on interacting medications.'
      },
      {
        option: 'Sleep hygiene and routine changes',
        category: 'Lifestyle',
        whyDiscussed: 'Non-pharmacologic strategies are commonly recommended first.',
        keyCautions: 'None specific; tailor to your clinician guidance.',
        evidenceStrength: 'High',
        interactionRisk: 'Low',
        avoidIf: 'N/A'
      }
    ],
    nextSteps: [
      'Ask a clinician whether these options are suitable for your profile.',
      'Bring a full med/supplement list to your next appointment.'
    ]
  }
}
