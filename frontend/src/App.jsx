import React, { useMemo, useState } from 'react'
import './App.css'
import { MixCheckPage } from './MixCheckPage'
import { ComparePage } from './ComparePage'
import { RecommendationPage } from './RecommendationPage'


const TABS = [
  { id: 'mix', label: 'Mix', tagline: 'Check interactions' },
  { id: 'compare', label: 'Compare', tagline: 'Line up products' },
  { id: 'recommend', label: 'Recommendations', tagline: 'Guided suggestions' },
  { id: 'where', label: 'Where To Go', tagline: 'Coverage + care path' },
]

const MIX_SUGGESTIONS = [
  'Vitamin D3',
  'Vitamin K2 (MK-7)',
  'Magnesium Glycinate',
  'Omega-3 Fish Oil',
  'Iron (Ferrous Bisglycinate)',
  'St. John\'s Wort',
  'Ashwagandha',
  'Metformin',
  'Warfarin',
]

const COMPARE_SUGGESTIONS = [
  'Vitamin D3 5000 IU',
  'Vitamin D3 2000 IU',
  'Magnesium Glycinate 200mg',
  'Omega-3 1200mg Softgel',
  'Iron Bisglycinate 25mg',
]

const MIX_INTERACTIONS = [
  {
    a: 'Vitamin K2 (MK-7)',
    b: 'Warfarin',
    interaction: 'May reduce anticoagulant effectiveness',
    severity: 'High',
    notes:
      'K2 can counteract warfarin. A clinician should monitor INR if both are used.',
  },
  {
    a: 'Iron (Ferrous Bisglycinate)',
    b: 'Magnesium Glycinate',
    interaction: 'Absorption competition',
    severity: 'Moderate',
    notes: 'Separate by 2-3 hours to reduce absorption interference.',
  },
  {
    a: 'St. John\'s Wort',
    b: 'Metformin',
    interaction: 'Potential metabolism changes',
    severity: 'Moderate',
    notes:
      'May change blood sugar control. Monitor glucose and ask a clinician.',
  },
  {
    a: 'Omega-3 Fish Oil',
    b: 'Warfarin',
    interaction: 'Bleeding risk increase',
    severity: 'Low',
    notes: 'Use caution if you have a bleeding disorder or on anticoagulants.',
  },
]

const COMPARE_ROWS = [
  {
    product: 'Vitamin D3 5000 IU',
    dose: '5000 IU',
    form: 'Softgel',
    notes: 'High potency, best with fat-containing meal.',
  },
  {
    product: 'Vitamin D3 2000 IU',
    dose: '2000 IU',
    form: 'Tablet',
    notes: 'Moderate daily dose, easier to titrate.',
  },
  {
    product: 'Magnesium Glycinate 200mg',
    dose: '200 mg',
    form: 'Capsule',
    notes: 'Gentle on stomach, often used at night.',
  },
]

const RECOMMENDATIONS = [
  {
    title: 'Supplement Add-ons',
    items: [
      'Vitamin D3 + K2 (for bone health)',
      'Magnesium Glycinate (sleep support)',
      'Omega-3 (heart + brain support)',
    ],
  },
  {
    title: 'Symptom-Based Suggestions',
    items: [
      'Fatigue: check iron + B12 labs',
      'Muscle cramps: magnesium + hydration',
      'Stress: magnesium + sleep hygiene review',
    ],
  },
]

const CARE_PATHS = [
  {
    title: 'Urgent',
    description: 'Severe symptoms, allergic reactions, or bleeding risks.',
    steps: ['Urgent care or ER', 'Bring your full supplement list'],
  },
  {
    title: 'Primary Care',
    description: 'Medication review, chronic symptoms, lab follow-ups.',
    steps: ['Schedule PCP visit', 'Ask for interaction review'],
  },
  {
    title: 'Pharmacy Consult',
    description: 'Quick medication + supplement check.',
    steps: ['Walk-in consult', 'Confirm OTC interactions'],
  },
]
import Navbar from './Navbar';


function App() {
  const [activeTab, setActiveTab] = useState('landing')
  const [chatInput, setChatInput] = useState('')
  const [mixInput, setMixInput] = useState('')
  const [mixSelection, setMixSelection] = useState(MIX_SUGGESTIONS[0])
  const [mixItems, setMixItems] = useState(['Vitamin D3', 'Vitamin K2 (MK-7)'])
  const [compareInput, setCompareInput] = useState('')
  const [compareSelection, setCompareSelection] = useState(COMPARE_SUGGESTIONS[0])
  const [compareItems, setCompareItems] = useState(['Vitamin D3 5000 IU'])
  const [symptoms, setSymptoms] = useState('Low energy, poor sleep')
  const [insurance, setInsurance] = useState('Aetna PPO')
  const [location, setLocation] = useState('San Francisco, CA')

  const mixTable = useMemo(() => {
    if (mixItems.length < 2) return []
    return MIX_INTERACTIONS.filter((row) => {
      const includesA = mixItems.includes(row.a)
      const includesB = mixItems.includes(row.b)
      return includesA && includesB
    })
  }, [mixItems])

  const compareTable = useMemo(() => {
    if (!compareItems.length) return []
    return COMPARE_ROWS.filter((row) => compareItems.includes(row.product))
  }, [compareItems])

  const addMixItem = (value) => {
    const trimmed = value.trim()
    if (!trimmed) return
    if (mixItems.includes(trimmed)) return
    setMixItems((prev) => [...prev, trimmed])
  }

  const addCompareItem = (value) => {
    const trimmed = value.trim()
    if (!trimmed) return
    if (compareItems.includes(trimmed)) return
    setCompareItems((prev) => [...prev, trimmed])
  }

  const handleChatSubmit = (event) => {
    event.preventDefault()
    const query = chatInput.toLowerCase()
    if (query.includes('mix') || query.includes('interact')) {
      setActiveTab('mix')
    } else if (query.includes('compare')) {
      setActiveTab('compare')
    } else if (query.includes('recommend')) {
      setActiveTab('recommend')
    } else if (query.includes('insurance') || query.includes('where')) {
      setActiveTab('where')
    } else {
      setActiveTab('mix')
    }
    setChatInput('')
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand" onClick={() => setActiveTab('landing')}>
          <span className="brand-mark">A</span>
          <div>
            <p className="brand-name">aimed</p>
            <p className="brand-sub">Medicine + supplement intelligence</p>
          </div>
        </div>
        <nav className="tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span>{tab.label}</span>
              <small>{tab.tagline}</small>
            </button>
          ))}
        </nav>
        <button className="cta">Launch Demo</button>
      </header>

      <main>
        {activeTab === 'landing' && (
          <section className="hero">
            <div className="hero-copy">
              <p className="pill">Powered by K2 Think + curated evidence</p>
              <h1>
                Your clarity layer for supplements, prescriptions, and
                interactions.
              </h1>
              <p className="lead">
                Ask a question, choose a flow, and get a structured, transparent
                answer. We never fabricate interactions — we summarize what the
                data shows.
              </p>
              <form className="chat" onSubmit={handleChatSubmit}>
                <input
                  type="text"
                  placeholder="Try: mix vitamin D3 + warfarin"
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                />
                <button type="submit">Route me</button>
              </form>
              <div className="hero-actions">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    className="ghost"
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="hero-card">
              <div className="card-header">
                <h3>Interaction Snapshot</h3>
                <p>Vitamin K2 + Warfarin</p>
              </div>
              <div className="card-body">
                <div className="risk-row">
                  <span className="risk high">High</span>
                  <div>
                    <p>May reduce anticoagulant effectiveness</p>
                    <small>Evidence from curated interaction records.</small>
                  </div>
                </div>
                <div className="divider" />
                <div className="risk-row">
                  <span className="risk low">Low</span>
                  <div>
                    <p>Omega-3 + Warfarin</p>
                    <small>Monitor bleeding risk if doses are high.</small>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

{activeTab === 'mix' && (
  <MixCheckPage />
)}
        {/* {activeTab === 'mix' && (
          <section className="page">
            <div className="page-head">
              <div>
                <h2>Mix</h2>
                <p>
                  Combine products or custom substances to see documented
                  interactions.
                </p>
              </div>
              <p className="disclaimer">
                This tool is not medical advice. Always confirm with a clinician
                or pharmacist.
              </p>
            </div>

            <div className="grid-two">
              <div className="panel">
                <h3>Add Substances</h3>
                <label className="field">
                  Custom input
                  <div className="field-row">
                    <input
                      value={mixInput}
                      onChange={(event) => setMixInput(event.target.value)}
                      placeholder="Type a medicine or supplement"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        addMixItem(mixInput)
                        setMixInput('')
                      }}
                    >
                      Add
                    </button>
                  </div>
                </label>
                <label className="field">
                  Choose from list
                  <div className="field-row">
                    <select
                      value={mixSelection}
                      onChange={(event) => setMixSelection(event.target.value)}
                    >
                      {MIX_SUGGESTIONS.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={() => addMixItem(mixSelection)}>
                      Add
                    </button>
                  </div>
                </label>
                <div className="chip-group">
                  {mixItems.map((item) => (
                    <button
                      key={item}
                      className="chip"
                      onClick={() =>
                        setMixItems((prev) => prev.filter((entry) => entry !== item))
                      }
                    >
                      {item}
                      <span>×</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="panel highlight">
                <h3>Mix Guidance</h3>
                <ul className="bullets">
                  <li>We match products to ingredient records first.</li>
                  <li>Only evidence-backed interactions are shown.</li>
                  <li>K2 Think summarizes notes for quick readability.</li>
                </ul>
                <div className="callout">
                  <strong>Tip:</strong> Add at least 2 items to see interactions.
                </div>
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Substance</th>
                    <th>Interaction</th>
                    <th>Severity</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {mixTable.length ? (
                    mixTable.map((row) => (
                      <tr key={`${row.a}-${row.b}`}>
                        <td>{`${row.a} + ${row.b}`}</td>
                        <td>{row.interaction}</td>
                        <td>
                          <span className={`severity ${row.severity.toLowerCase()}`}>
                            {row.severity}
                          </span>
                        </td>
                        <td>{row.notes}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="empty">
                        Add more substances to reveal documented interactions.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )} */}

        {activeTab === 'compare' && <ComparePage />}

        {activeTab === 'recommend' && <RecommendationPage />}

        {activeTab === 'where' && (
          <section className="page">
            <div className="page-head">
              <div>
                <h2>Where To Go</h2>
                <p>Match your insurance, urgency, and supply channel.</p>
              </div>
              <p className="disclaimer">
                Coverage varies. Confirm eligibility before appointments.
              </p>
            </div>

            <div className="grid-two">
              <div className="panel">
                <h3>Coverage + location</h3>
                <label className="field">
                  Insurance plan
                  <input
                    value={insurance}
                    onChange={(event) => setInsurance(event.target.value)}
                  />
                </label>
                <label className="field">
                  Location
                  <input
                    value={location}
                    onChange={(event) => setLocation(event.target.value)}
                  />
                </label>
                <label className="field">
                  Need
                  <select>
                    <option>Prescription refill</option>
                    <option>Medication review</option>
                    <option>New symptoms</option>
                    <option>Supplement guidance</option>
                  </select>
                </label>
                <button className="primary" type="button">
                  Find care options
                </button>
              </div>

              <div className="panel highlight">
                <h3>Instant routing</h3>
                <p className="muted">
                  We map your plan to in-network options and identify the fastest
                  safe path.
                </p>
                <div className="callout">
                  <strong>Example:</strong> {insurance} in {location}
                </div>
              </div>
            </div>

            <div className="care-grid">
              {CARE_PATHS.map((path) => (
                <div className="panel" key={path.title}>
                  <h3>{path.title}</h3>
                  <p className="muted">{path.description}</p>
                  <ul className="bullets">
                    {path.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="footer">
        <div>
          <p>aimed • Interaction clarity for supplements and medicines</p>
          <small>
            Data sources: dietary supplement labels + curated interaction
            knowledge base.
          </small>
        </div>
        <button className="ghost" onClick={() => setActiveTab('landing')}>
          Back to top
        </button>
      </footer>
    </div>
  )
}

export default App
