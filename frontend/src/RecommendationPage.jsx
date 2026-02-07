import React, { useEffect, useMemo, useRef, useState } from 'react'

export function RecommendationPage() {
  const [messages, setMessages] = useState([
    {
      id: 1,
      role: 'assistant',
      content:
        "Hi! I'm your supplement recommendation assistant. To give you personalized suggestions, I'd like to know a bit about you. What brings you here today? (e.g., low energy, joint pain, sleep issues, general wellness)",
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [usingMock, setUsingMock] = useState(false)
  const [conversationPhase, setConversationPhase] = useState('symptoms') // symptoms → history → current → recommendations
  const [userProfile, setUserProfile] = useState({
    symptoms: [],
    medicalHistory: [],
    currentSupplements: [],
    currentMedications: [],
  })
  const messagesEndRef = useRef(null)
  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:9000'

  const mockRecommendation = useMemo(() => {
    const profile = userProfile.symptoms.join(' ').toLowerCase()
    if (profile.includes('sleep')) {
      return 'Consider magnesium glycinate and a consistent sleep routine. Avoid stimulants late in the day.'
    }
    if (profile.includes('energy') || profile.includes('fatigue')) {
      return 'Consider checking iron + B12 status with your clinician. Gentle B-complex and hydration may help.'
    }
    if (profile.includes('stress') || profile.includes('anxiety')) {
      return 'Consider magnesium + mindfulness routines. Talk to a clinician before adding adaptogens.'
    }
    return 'Start with foundational support: vitamin D3 (if deficient), omega-3, and magnesium as tolerated.'
  }, [userProfile.symptoms])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const addMessage = (role, content) => {
    setMessages((prev) => [
      ...prev,
      { id: prev.length + 1, role, content },
    ])
  }

  const handleSendMessage = async (e) => {
    e.preventDefault()
    if (!input.trim()) return

    const userMessage = input.trim()
    addMessage('user', userMessage)
    setInput('')
    setLoading(true)
    setError(null)

    try {
      // Route to different conversation phases
      let nextPhase = conversationPhase
      let assistantResponse = ''

      if (conversationPhase === 'symptoms') {
        // Parse symptoms and move to medical history
        setUserProfile((prev) => ({
          ...prev,
          symptoms: [userMessage],
        }))
        nextPhase = 'history'
        assistantResponse =
          "Got it! I've noted your symptoms. Now, do you have any relevant medical conditions or diagnoses we should consider? (e.g., hypertension, diabetes, pregnancy, kidney issues, or type 'none' if not applicable)"
      } else if (conversationPhase === 'history') {
        // Parse medical history and move to current medications
        setUserProfile((prev) => ({
          ...prev,
          medicalHistory: userMessage.toLowerCase() === 'none' ? [] : [userMessage],
        }))
        nextPhase = 'current'
        assistantResponse =
          "Thank you. Are you currently taking any medications or supplements? Please list them separated by commas, or type 'none'."
      } else if (conversationPhase === 'current') {
        // Parse current meds/supplements and generate recommendations
        const items =
          userMessage.toLowerCase() === 'none'
            ? []
            : userMessage.split(',').map((item) => item.trim())

        setUserProfile((prev) => ({
          ...prev,
          currentMedications: items,
        }))
        nextPhase = 'recommendations'

        // Call API to generate recommendations
        try {
          const response = await fetch(`${apiBase}/recommendations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              symptoms: userProfile.symptoms,
              medicalHistory: userProfile.medicalHistory,
              currentMedications: items,
            }),
          })

          if (!response.ok) {
            throw new Error(`http_${response.status}`)
          }
          const payload = await response.json()
          if (payload.error) throw new Error(payload.error)

          assistantResponse =
            payload.recommendation || 'Unable to generate recommendations at this time.'
          setUsingMock(false)
        } catch (apiErr) {
          assistantResponse = `${mockRecommendation} (Demo response)`
          setUsingMock(true)
        }
      }

      setConversationPhase(nextPhase)
      addMessage('assistant', assistantResponse)
    } catch (err) {
      setError(`Error: ${err.message}`)
      addMessage('assistant', `I encountered an error: ${err.message}. Please try again.`)
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setMessages([
      {
        id: 1,
        role: 'assistant',
        content:
          "Hi! I'm your supplement recommendation assistant. To give you personalized suggestions, I'd like to know a bit about you. What brings you here today? (e.g., low energy, joint pain, sleep issues, general wellness)",
      },
    ])
    setConversationPhase('symptoms')
    setUserProfile({
      symptoms: [],
      medicalHistory: [],
      currentSupplements: [],
      currentMedications: [],
    })
    setError(null)
  }

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <h2>Recommendations</h2>
          <p>Get personalized supplement suggestions through an interactive chat.</p>
        </div>
        <p className="disclaimer">
          ⚠️ <strong>Important:</strong> These recommendations are AI-generated for informational purposes only.
          Always consult with a healthcare provider before starting new supplements or medications.
        </p>
      </div>

      {usingMock && (
        <div className="callout" style={{ marginBottom: '1rem' }}>
          Using local demo recommendations. Connect the backend for live results.
        </div>
      )}

      <div className="recommendation-container" style={styles.container}>
        {/* Messages area */}
        <div style={styles.messagesArea}>
          {messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                ...styles.message,
                ...(msg.role === 'user'
                  ? styles.userMessage
                  : styles.assistantMessage),
              }}
            >
              <div style={{
                ...styles.messageBubble,
                ...(msg.role === 'user'
                  ? styles.userBubble
                  : styles.assistantBubble)
              }}>
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ ...styles.message, ...styles.assistantMessage }}>
              <div style={styles.messageBubble}>Generating recommendations...</div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div style={styles.inputArea}>
          {error && (
            <div style={styles.errorBox}>{error}</div>
          )}

          {conversationPhase === 'recommendations' ? (
            <div style={styles.completionBox}>
              <p>✓ Recommendations generated!</p>
              <button
                onClick={handleReset}
                style={styles.resetButton}
              >
                Start Over
              </button>
            </div>
          ) : (
            <form onSubmit={handleSendMessage} style={styles.form}>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your response..."
                disabled={loading}
                style={styles.input}
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                style={styles.submitButton}
              >
                {loading ? '...' : 'Send'}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Disclaimer panel */}
      <div className="panel danger" style={{ marginTop: '2rem' }}>
        <h3>⚠️ Medical Disclaimer</h3>
        <p>
          This chatbot does <strong>not</strong> provide medical advice. Recommendations are
          generated for educational purposes only. They:
        </p>
        <ul className="bullets">
          <li>Should not replace consultation with a licensed healthcare provider</li>
          <li>May not account for drug interactions or personal allergies</li>
          <li>Are not personalized medical treatment plans</li>
          <li>Require professional validation before use</li>
        </ul>
        <p>
          If you have a medical condition or take medications, consult your doctor or pharmacist
          before using any new supplements.
        </p>
      </div>
    </section>
  )
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '600px',
    border: '1px solid #ddd',
    borderRadius: '8px',
    backgroundColor: '#fafafa',
    marginTop: '1.5rem',
  },
  messagesArea: {
    flex: 1,
    overflowY: 'auto',
    padding: '1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  message: {
    display: 'flex',
    marginBottom: '0.5rem',
  },
  userMessage: {
    justifyContent: 'flex-end',
  },
  assistantMessage: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '70%',
    padding: '0.75rem 1rem',
    borderRadius: '8px',
    lineHeight: '1.5',
  },
  userBubble: {
    backgroundColor: '#007bff',
    color: 'white',
  },
  assistantBubble: {
    backgroundColor: '#e9ecef',
    color: '#1c2333',
  },
  inputArea: {
    padding: '1rem',
    borderTop: '1px solid #ddd',
    backgroundColor: '#fff',
  },
  form: {
    display: 'flex',
    gap: '0.5rem',
  },
  input: {
    flex: 1,
    padding: '0.75rem',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '1rem',
    fontFamily: 'inherit',
  },
  submitButton: {
    padding: '0.75rem 1.5rem',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: '500',
  },
  completionBox: {
    textAlign: 'center',
    padding: '1rem',
  },
  resetButton: {
    marginTop: '1rem',
    padding: '0.75rem 1.5rem',
    backgroundColor: '#28a745',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: '500',
  },
  errorBox: {
    padding: '1rem',
    backgroundColor: '#f8d7da',
    color: '#721c24',
    borderRadius: '4px',
    marginBottom: '1rem',
  },
}
