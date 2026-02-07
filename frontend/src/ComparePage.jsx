import React, { useEffect, useMemo, useState } from 'react'

const MOCK_PRODUCTS = [
  { product_name: 'Vitamin D3 5000 IU', brand_name: 'Solaria', dsld_id: 1 },
  { product_name: 'Vitamin D3 2000 IU', brand_name: 'BrightLabs', dsld_id: 2 },
  { product_name: 'Magnesium Glycinate 200mg', brand_name: 'CalmCo', dsld_id: 3 },
  { product_name: 'Omega-3 1200mg Softgel', brand_name: 'NordicSea', dsld_id: 4 },
  { product_name: 'Iron Bisglycinate 25mg', brand_name: 'Rooted', dsld_id: 5 },
]

const MOCK_COMPARE = {
  'vitamin d3 5000 iu': {
    dose: '5000 IU',
    form: 'Softgel',
    serving_size: '1 softgel',
    ingredients: ['Cholecalciferol (Vitamin D3)', 'Olive oil'],
    suggested_use: 'Take 1 daily with food.',
  },
  'vitamin d3 2000 iu': {
    dose: '2000 IU',
    form: 'Tablet',
    serving_size: '1 tablet',
    ingredients: ['Cholecalciferol (Vitamin D3)'],
    suggested_use: 'Take 1 daily with a meal.',
  },
  'magnesium glycinate 200mg': {
    dose: '200 mg',
    form: 'Capsule',
    serving_size: '2 capsules',
    ingredients: ['Magnesium glycinate'],
    suggested_use: 'Take in the evening with water.',
  },
  'omega-3 1200mg softgel': {
    dose: '1200 mg',
    form: 'Softgel',
    serving_size: '1 softgel',
    ingredients: ['Fish oil concentrate', 'Omega-3'],
    suggested_use: 'Take 1-2 daily with food.',
  },
  'iron bisglycinate 25mg': {
    dose: '25 mg',
    form: 'Capsule',
    serving_size: '1 capsule',
    ingredients: ['Iron bisglycinate'],
    suggested_use: 'Take with vitamin C-rich food.',
  },
}

export function ComparePage() {
  const [products, setProducts] = useState([])
  const [selectedProducts, setSelectedProducts] = useState([])
  const [compareResults, setCompareResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [comparing, setComparing] = useState(false)
  const [compareInput, setCompareInput] = useState('')
  const [compareSelection, setCompareSelection] = useState('')
  const [error, setError] = useState(null)
  const [usingMock, setUsingMock] = useState(false)

  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:9000'

  const normalizedSelection = useMemo(
    () => selectedProducts.map((item) => item.trim().toLowerCase()),
    [selectedProducts]
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
      if (!items.length) throw new Error('no_products')
      setProducts(items)
      if (items.length > 0) {
        setCompareSelection(items[0].name)
      }
      setUsingMock(false)
    } catch (err) {
      setProducts(MOCK_PRODUCTS)
      setCompareSelection(MOCK_PRODUCTS[0]?.product_name || '')
      setUsingMock(true)
      setError('Backend unavailable. Using local demo data.')
    } finally {
      setLoading(false)
    }
  }

  const addCompareItem = (value) => {
    const trimmed = value.trim()
    if (!trimmed) return

    if (selectedProducts.some(p => p === trimmed)) {
      setError('Already selected.')
      return
    }

    setSelectedProducts([...selectedProducts, trimmed])
    setCompareInput('')
    setError(null)
  }

  const removeCompareItem = (productName) => {
    setSelectedProducts(selectedProducts.filter(p => p !== productName))
  }

  const handleCompare = async () => {
    if (selectedProducts.length < 2) {
      setError('Add at least 2 products to compare.')
      return
    }

    setComparing(true)
    setError(null)
    setCompareResults([])

    try {
      const response = await fetch(`${apiBase}/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: selectedProducts }),
      })
      if (!response.ok) {
        throw new Error(`http_${response.status}`)
      }
      const payload = await response.json()
      if (payload.error) throw new Error(payload.error)
      setCompareResults(payload.comparison || [])
      setUsingMock(false)
    } catch (err) {
      const mockProducts = normalizedSelection.map((name) => ({
        name,
        ...(MOCK_COMPARE[name] || {}),
      }))
      setCompareResults([{ products: mockProducts }])
      setUsingMock(true)
      setError('Backend unavailable. Showing demo comparison.')
    } finally {
      setComparing(false)
    }
  }

  if (loading) {
    return (
      <section className="page">
        <p>Loading products...</p>
      </section>
    )
  }

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <h2>Compare</h2>
          <p>Line up products side-by-side to spot differences.</p>
        </div>
        <p className="disclaimer">
          For informational purposes only. Not a substitute for professional advice.
        </p>
      </div>

      {usingMock && (
        <div className="callout" style={{ marginBottom: '1rem' }}>
          Using local demo data. Connect the database to enable full comparisons.
        </div>
      )}

      <div className="grid-two">
        {/* Left: Product Selection */}
        <div className="panel">
          <h3>Select Products</h3>

          {/* Custom input */}
          <label className="field">
            <strong>Type a product</strong>
            <div className="field-row">
              <input
                value={compareInput}
                onChange={(e) => setCompareInput(e.target.value)}
                placeholder="e.g., Vitamin D3 5000 IU"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addCompareItem(compareInput)
                  }
                }}
              />
              <button
                type="button"
                onClick={() => addCompareItem(compareInput)}
              >
                Add
              </button>
            </div>
          </label>

          {/* Dropdown selection */}
          <label className="field">
            <strong>Or pick from database</strong>
            <div className="field-row">
              <select
                value={compareSelection}
                onChange={(e) => setCompareSelection(e.target.value)}
              >
                {products.map((product) => (
                  <option key={product.id} value={product.name}>
                    {product.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => addCompareItem(compareSelection)}
              >
                Add
              </button>
            </div>
          </label>

          {/* Selected products chips */}
          {selectedProducts.length > 0 && (
            <div className="chip-group">
              {selectedProducts.map((productName, idx) => (
                <div key={idx} className="chip">
                  <span>{productName}</span>
                  <button
                    type="button"
                    onClick={() => removeCompareItem(productName)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && <p style={{ color: '#d32f2f' }}>{error}</p>}

          {/* Compare button */}
          <button
            className="primary"
            onClick={handleCompare}
            disabled={comparing || selectedProducts.length < 2}
          >
            {comparing ? 'Comparing...' : 'Compare'}
          </button>
        </div>

        {/* Right: Comparison Results */}
        <div className="panel">
          <h3>Side-by-Side</h3>

          {compareResults.length === 0 && !comparing && (
            <p style={{ color: '#888' }}>
              {selectedProducts.length < 2
                ? 'Add at least 2 products to see a comparison.'
                : 'Click "Compare" to see product details.'}
            </p>
          )}

          {comparing && <p>Loading comparison...</p>}

          {compareResults.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Attribute</th>
                    {compareResults[0]?.products?.map((p, idx) => (
                      <th key={idx}>{p.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Type row */}
                  <tr>
                    <td><strong>Type</strong></td>
                    {compareResults[0]?.products?.map((p, idx) => (
                      <td key={idx}>{p.type || 'N/A'}</td>
                    ))}
                  </tr>
                  {/* Generic Name row */}
                  <tr>
                    <td><strong>Generic Name</strong></td>
                    {compareResults[0]?.products?.map((p, idx) => (
                      <td key={idx}>{p.generic_name || 'N/A'}</td>
                    ))}
                  </tr>
                  {/* Brand Names row */}
                  <tr>
                    <td><strong>Brand</strong></td>
                    {compareResults[0]?.products?.map((p, idx) => (
                      <td key={idx}>{p.brand || 'N/A'}</td>
                    ))}
                  </tr>
                  {/* Strength row */}
                  <tr>
                    <td><strong>Strength</strong></td>
                    {compareResults[0]?.products?.map((p, idx) => (
                      <td key={idx}>{p.strength || 'N/A'}</td>
                    ))}
                  </tr>
                  {/* Form row */}
                  <tr>
                    <td><strong>Form</strong></td>
                    {compareResults[0]?.products?.map((p, idx) => (
                      <td key={idx}>{p.form || 'N/A'}</td>
                    ))}
                  </tr>
                  {/* Description row */}
                  <tr>
                    <td><strong>Description</strong></td>
                    {compareResults[0]?.products?.map((p, idx) => (
                      <td key={idx}>{p.description || 'N/A'}</td>
                    ))}
                  </tr>
                  {/* Active Ingredients */}
                  <tr>
                    <td><strong>Active Ingredients</strong></td>
                    {compareResults[0]?.products?.map((p, idx) => (
                      <td key={idx}>
                        {p.active_ingredients && Array.isArray(p.active_ingredients) && p.active_ingredients.length > 0 ? (
                          <ul style={{ margin: 0, paddingLeft: '20px' }}>
                            {p.active_ingredients.slice(0, 3).map((ing, i) => (
                              <li key={i}>{ing}</li>
                            ))}
                            {p.active_ingredients.length > 3 && (
                              <li>+{p.active_ingredients.length - 3} more</li>
                            )}
                          </ul>
                        ) : (
                          'None listed'
                        )}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
