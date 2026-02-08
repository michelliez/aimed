import { useMemo, useState } from 'react'

const SYMPTOM_PRESETS = [
  'Headache',
  'Fatigue',
  'Chest pain',
  'Shortness of breath',
  'Fever',
  'Nausea',
  'Dizziness',
  'Sore throat',
  'Abdominal pain',
  'Rash',
]

const EDUCATION = [
  {
    title: 'Hydration + rest check',
    notes:
      'Many mild symptoms improve with hydration, rest, and sleep regularity. Track duration and severity.',
  },
  {
    title: 'Medication review',
    notes:
      'If symptoms began after a new medication or supplement, consider a review with a clinician or pharmacist.',
  },
  {
    title: 'Red-flag screening',
    notes:
      'Severe chest pain, trouble breathing, sudden weakness, or confusion warrant urgent care.',
  },
]

const CARE_ROUTING = [
  {
    level: 'Emergency care',
    description:
      'Severe chest pain, breathing difficulty, fainting, or signs of stroke.',
  },
  {
    level: 'Urgent care',
    description:
      'High fever, worsening pain, or symptoms lasting more than 48-72 hours.',
  },
  {
    level: 'Primary care',
    description:
      'Ongoing non-urgent symptoms, medication questions, or lab follow-ups.',
  },
]

export function SymptomGuidePage() {
  const [input, setInput] = useState('')
  const [selected, setSelected] = useState([])
  const [notes, setNotes] = useState('')

  const combined = useMemo(() => {
    const manual = input
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
    return Array.from(new Set([...selected, ...manual]))
  }, [input, selected])

  const togglePreset = (item) => {
    if (selected.includes(item)) {
      setSelected(selected.filter((entry) => entry !== item))
    } else {
      setSelected([...selected, item])
    }
  }

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <h2>Symptom Guide</h2>
          <p>Educational guidance only — no diagnoses or medical decisions.</p>
        </div>
        <p className="disclaimer">
          This tool does not provide medical advice. If you have severe symptoms,
          call emergency services or seek immediate care.
        </p>
      </div>

      <div className="panel danger" style={{ marginBottom: '1.5rem' }}>
        <strong>Medical disclaimer:</strong> This page offers general education
        and care-routing guidance only. It does not diagnose conditions or
        replace a licensed clinician.
      </div>

      <div className="grid-two">
        <div className="panel">
          <h3>Describe symptoms</h3>
          <label className="field">
            Symptoms (comma-separated)
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="e.g., headache, fatigue, nausea"
            />
          </label>
          <label className="field">
            Presets
            <div className="chip-group">
              {SYMPTOM_PRESETS.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`chip ${selected.includes(item) ? 'active' : ''}`}
                  onClick={() => togglePreset(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </label>
          <label className="field">
            Additional context
            <textarea
              rows={4}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Duration, severity, triggers, or recent changes"
            />
          </label>
        </div>

        <div className="panel highlight">
          <h3>What to consider</h3>
          <ul className="bullets">
            {EDUCATION.map((item) => (
              <li key={item.title}>
                <strong>{item.title}:</strong> {item.notes}
              </li>
            ))}
          </ul>
          <div className="callout">
            <strong>Selected symptoms:</strong>{' '}
            {combined.length ? combined.join(', ') : 'None yet'}
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: '1.5rem' }}>
        <h3>Care routing guidance</h3>
        <div className="results-list">
          {CARE_ROUTING.map((item) => (
            <div className="result-card" key={item.level}>
              <h4>{item.level}</h4>
              <p className="muted">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
