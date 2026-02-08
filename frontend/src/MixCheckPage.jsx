import React, { useEffect, useMemo, useState } from 'react'

const MOCK_PRODUCTS = [
  { product_name: 'Vitamin D3' },
  { product_name: 'Vitamin K2 (MK-7)' },
  { product_name: 'Magnesium Glycinate' },
  { product_name: 'Omega-3 Fish Oil' },
  { product_name: 'Iron (Ferrous Bisglycinate)' },
  { product_name: "St. John's Wort" },
  { product_name: 'Ashwagandha' },
  { product_name: 'Metformin' },
  { product_name: 'Warfarin' },
]

const MOCK_INTERACTIONS = [
  {
    ingredient_a: 'vitamin k2 (mk-7)',
    ingredient_b: 'warfarin',
    severity: 'high',
    interaction: 'May reduce anticoagulant effectiveness',
    notes: 'Vitamin K can counteract warfarin. Monitor INR if combined.',
  },
  {
    ingredient_a: 'omega-3 fish oil',
    ingredient_b: 'warfarin',
    severity: 'low',
    interaction: 'Possible bleeding risk increase',
    notes: 'Use caution with high doses; monitor for bleeding.',
  },
  {
    ingredient_a: 'iron (ferrous bisglycinate)',
    ingredient_b: 'magnesium glycinate',
    severity: 'moderate',
    interaction: 'Absorption competition',
    notes: 'Separate dosing by 2-3 hours to reduce interference.',
  },
  {
    ingredient_a: "st. john's wort",
    ingredient_b: 'metformin',
    severity: 'moderate',
    interaction: 'Potential metabolism changes',
    notes: 'May affect blood sugar control. Monitor glucose.',
  },
]

export function MixCheckPage() {
  const [products, setProducts] = useState([])
  const [selectedItems, setSelectedItems] = useState([])
  const [interactions, setInteractions] = useState([])
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(false)
  const [mixInput, setMixInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [showSearchResults, setShowSearchResults] = useState(false)
  const [error, setError] = useState(null)
  const [usingMock, setUsingMock] = useState(false)
  const [hasChecked, setHasChecked] = useState(false)

  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:9000'

  const normalize = (value) =>
    value
      .toLowerCase()
      .replace(/[()]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()

  const normalizedSelected = useMemo(
    () => selectedItems.map((item) => normalize(item)),
    [selectedItems]
  )

  useEffect(() => {
    fetchProducts()
  }, [])

  const fetchProducts = async () => {
    setLoading(true)
    try {
      const response = await fetch(`${apiBase}/products?limit=50`)
      if (!response.ok) {
        throw new Error(`http_${response.status}`)
      }
      const payload = await response.json()
      if (payload.error) throw new Error(payload.error)
      const items = payload.items || []
      if (!items.length) {
        throw new Error('no_products')
      }
      setProducts(items)
      setUsingMock(false)
    } catch (err) {
      setProducts(MOCK_PRODUCTS)
      setUsingMock(true)
      setError('Backend unavailable. Using local demo data.')
    } finally {
      setLoading(false)
    }
  }

  const handleSearchChange = async (query) => {
    setSearchQuery(query)
    
    if (!query.trim()) {
      setSearchResults([])
      setShowSearchResults(false)
      return
    }

    try {
      const response = await fetch(`${apiBase}/products?q=${encodeURIComponent(query)}&limit=20`)
      if (!response.ok) throw new Error('search_failed')
      const payload = await response.json()
      const items = payload.items || []
      setSearchResults(items)
      setShowSearchResults(true)
    } catch (err) {
      // Fallback to local search
      const matches = MOCK_PRODUCTS.filter(p =>
        (p.product_name || p.name || '').toLowerCase().includes(query.toLowerCase())
      ).slice(0, 20)
      setSearchResults(matches)
      setShowSearchResults(true)
    }
  }

  const addFromSearch = (product) => {
    const productName = product.name || product.product_name
    addMixItem(productName)
    setSearchQuery('')
    setShowSearchResults(false)
  }

  const addMixItem = (value) => {
    const trimmed = value.trim()
    if (!trimmed) return

    if (selectedItems.includes(trimmed)) {
      setError('Already selected.')
      return
    }

    setSelectedItems([...selectedItems, trimmed])
    setMixInput('')
    setError(null)
  }

  const getSeverityClass = (severity) => {
    switch (severity) {
      case 'low':
      case 'mild':
        return 'low'
      case 'moderate':
        return 'moderate'
      case 'high':
      case 'severe':
      case 'contraindicated':
        return 'high'
      default:
        return 'low'
    }
  }

  const handleCheckInteractions = async () => {
    if (selectedItems.length < 2) {
      setError('Add at least 2 substances to see interactions.')
      return
    }

    setChecking(true)
    setError(null)
    setInteractions([])
    setHasChecked(true)

    try {
      // First try the database endpoint
      const response = await fetch(`${apiBase}/mix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: selectedItems }),
      })
      if (!response.ok) {
        throw new Error(`http_${response.status}`)
      }
      const payload = await response.json()
      if (payload.error) throw new Error(payload.error)
      
      // If no interactions found in database, try K2 prediction
      if (!payload.interactions || payload.interactions.length === 0) {
        const k2Response = await fetch(`${apiBase}/predict-interactions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            items: selectedItems.map(item => typeof item === 'string' ? item : item.name || item)
          }),
        })
        
        if (k2Response.ok) {
          const k2Payload = await k2Response.json()
          console.log('K2 Response:', k2Payload)
          console.log('K2 Interactions:', k2Payload.interactions)
          console.log('K2 Predictions:', k2Payload.predictions)
          setInteractions(k2Payload.interactions || k2Payload.predictions || [])
          setUsingMock(false)
          return
        } else {
          console.error('K2 API error:', k2Response.status, await k2Response.text())
        }
      }
      
      setInteractions(payload.interactions || [])
      setUsingMock(false)
    } catch (err) {
      setInteractions([])
      setUsingMock(false)
      setError('Could not fetch interactions. Please try again or check your connection.')
    } finally {
      setChecking(false)
    }
  }

  if (loading) {
    return (
      <section className="page">
        <p>Loading medicines...</p>
      </section>
    )
  }

  return (
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

      {error && <div className="error-message">{error}</div>}
      {usingMock && (
        <div className="callout" style={{ marginBottom: '1rem' }}>
          Using local demo data. Connect the database to enable full results.
        </div>
      )}

      <div className="grid-two">
        <div className="panel">
          <h3>Add Substances</h3>
          <label className="field">
            Custom input
            <div className="field-row">
              <input
                value={mixInput}
                onChange={(event) => setMixInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    addMixItem(mixInput)
                  }
                }}
                placeholder="Type a medicine or supplement"
              />
              <button type="button" onClick={() => addMixItem(mixInput)}>
                Add
              </button>
            </div>
          </label>
          <label className="field">
            Search database
            <div className="field-row" style={{ position: 'relative' }}>
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => handleSearchChange(event.target.value)}
                onFocus={() => searchQuery && setShowSearchResults(true)}
                onBlur={() => setTimeout(() => setShowSearchResults(false), 100)}
                placeholder="Search products by name..."
                autoComplete="off"
              />
              <button 
                type="button" 
                onClick={() => {
                  if (searchResults.length > 0) {
                    addFromSearch(searchResults[0])
                  } else if (searchQuery.trim()) {
                    addMixItem(searchQuery)
                  }
                }}
                disabled={!searchQuery.trim()}
              >
                Add
              </button>
              {showSearchResults && searchResults.length > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    backgroundColor: 'white',
                    border: '1px solid #ccc',
                    borderTop: 'none',
                    maxHeight: '200px',
                    overflowY: 'auto',
                    zIndex: 1000,
                  }}
                >
                  {searchResults.map((product) => (
                    <div
                      key={product.id}
                      onClick={() => addFromSearch(product)}
                      style={{
                        padding: '0.5rem',
                        cursor: 'pointer',
                        borderBottom: '1px solid #eee',
                        fontSize: '0.9rem',
                      }}
                      onMouseEnter={(e) => (e.target.style.backgroundColor = '#f5f5f5')}
                      onMouseLeave={(e) => (e.target.style.backgroundColor = 'white')}
                    >
                      {product.name || product.product_name}
                      <span style={{ fontSize: '0.8rem', color: '#666', marginLeft: '0.5rem' }}>
                        ({product.type || 'unknown'})
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {showSearchResults && searchQuery && searchResults.length === 0 && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    backgroundColor: 'white',
                    border: '1px solid #ccc',
                    borderTop: 'none',
                    padding: '0.5rem',
                    fontSize: '0.9rem',
                    color: '#666',
                  }}
                >
                  No products found. Use custom input instead.
                </div>
              )}
            </div>
          </label>
          <div className="chip-group">
            {selectedItems.map((item) => (
              <button
                key={item}
                className="chip"
                onClick={() =>
                  setSelectedItems(
                    selectedItems.filter((entry) => entry !== item)
                  )
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
            <strong>Tip:</strong> Add 2 items to see interactions.
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
            {interactions.length ? (
              interactions
                .map((row, idx) => (
                <tr key={idx}>
                  <td>{`${row.ingredient_a} + ${row.ingredient_b}`}</td>
                  <td>{row.interaction}</td>
                  <td>
                    <span className={`severity ${getSeverityClass(row.severity)}`}>
                      {row.severity || 'unknown'}
                    </span>
                  </td>
                  <td>{row.notes || 'No additional notes.'}</td>
                </tr>
              ))
            ) : checking ? (
              <tr>
                <td colSpan={4} className="empty">
                  Checking interactions...
                </td>
              </tr>
            ) : selectedItems.length < 2 ? (
              <tr>
                <td colSpan={4} className="empty">
                  Add more substances to reveal documented interactions.
                </td>
              </tr>
            ) : hasChecked ? (
              <tr>
                <td colSpan={4} className="empty">
                  No interactions found for these substances.
                </td>
              </tr>
            ) : (
              <tr>
                <td colSpan={4} className="empty">
                  Click "Check Interactions" to run analysis.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <button
        className="primary"
        onClick={handleCheckInteractions}
        disabled={checking || selectedItems.length < 2}
        style={{ marginTop: '1rem' }}
      >
        {checking ? 'Checking...' : 'Check Interactions'}
      </button>

      {interactions.filter(i => i.severity !== 'none').length > 0 && (
        <div className="interactions-results">
          <h3>Interaction Results ({interactions.filter(i => i.severity !== 'none').length})</h3>
          <div className="interactions-list">
            {interactions
              .filter(i => i.severity !== 'none')
              .map((inter, idx) => (
              <div key={idx} className="interaction-card">
                <div className="interaction-header">
                  <div>
                    <h4>
                      {inter.ingredient_a} + {inter.ingredient_b}
                    </h4>
                    <p>{inter.interaction}</p>
                  </div>
                  <div className="interaction-badges">
                    <span className={`severity ${getSeverityClass(inter.severity)}`}>
                      {inter.severity || 'unknown'}
                    </span>
                  </div>
                </div>
                <div className="interaction-body">
                  {inter.notes || 'No additional notes.'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
