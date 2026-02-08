import React, { useState } from 'react'
import './App.css'
import { MixCheckPage } from './MixCheckPage'
import { ComparePage } from './ComparePage'
import { RecommendationPage } from './RecommendationPage'

const TABS = [
  { id: 'mix', label: 'Mix', tagline: 'Check interactions' },
  { id: 'compare', label: 'Compare', tagline: 'Line up products' },
  { id: 'recommend', label: 'Recommendations', tagline: 'Guided suggestions' },
]

function App() {
  const [activeTab, setActiveTab] = useState('landing')
  const [chatInput, setChatInput] = useState('')

  const handleChatSubmit = (event) => {
    event.preventDefault()
    const query = chatInput.toLowerCase()
    if (query.includes('mix') || query.includes('interact')) {
      setActiveTab('mix')
    } else if (query.includes('compare')) {
      setActiveTab('compare')
    } else if (query.includes('recommend')) {
      setActiveTab('recommend')
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

        {activeTab === 'mix' && <MixCheckPage />}

        {activeTab === 'compare' && <ComparePage />}

        {activeTab === 'recommend' && <RecommendationPage />}

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
