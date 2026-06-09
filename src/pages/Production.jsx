import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { AlertCircle, CheckCircle, Loader, Trash2 } from 'lucide-react'

export default function Production() {
  // Form State
  const [selectedProduct, setSelectedProduct] = useState('')
  const [selectedMachine, setSelectedMachine] = useState('')
  const [selectedShift, setSelectedShift] = useState('morning')
  const [operatorName, setOperatorName] = useState('')
  const [qtyAccepted, setQtyAccepted] = useState('')
  const [qtyRejected, setQtyRejected] = useState('')

  // Dropdowns
  const [products, setProducts] = useState([])
  const [machines, setMachines] = useState([])

  // BOM Materials
  const [bomMaterials, setBomMaterials] = useState([])
  const [materialUsages, setMaterialUsages] = useState({})

  // Status
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState(null)

  // Fetch products and machines on mount
  useEffect(() => {
    fetchInitialData()
  }, [])

  const fetchInitialData = async () => {
    try {
      setLoading(true)
      setMessage(null)

      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select('*')

      if (productsError) throw new Error(`Products: ${productsError.message}`)

      const { data: machinesData, error: machinesError } = await supabase
        .from('machines')
        .select('*')

      if (machinesError) throw new Error(`Machines: ${machinesError.message}`)

      setProducts(productsData || [])
      setMachines(machinesData || [])
    } catch (error) {
      setMessage({ type: 'error', text: `Failed to load data — ${error.message}` })
      console.error('fetchInitialData error:', error)
    } finally {
      setLoading(false)
    }
  }

  // Fetch BOM when product is selected
  useEffect(() => {
    if (selectedProduct) {
      fetchBOM(selectedProduct)
    }
  }, [selectedProduct])

  // Recalculate waste % when qty_accepted changes
  useEffect(() => {
    if (!bomMaterials.length) return
    setMaterialUsages(prev => {
      const updated = { ...prev }
      bomMaterials.forEach(item => {
        const entry = updated[item.id]
        if (entry?.qty_used) {
          const perUnit = parseFloat(item.qty_per_unit)
          const qty = parseFloat(entry.qty_used)
          const acc = parseFloat(qtyAccepted)
          if (perUnit && qty && acc) {
            const expected = perUnit * acc
            const waste = qty <= expected ? 0 : (((qty - expected) / expected) * 100).toFixed(2)
            updated[item.id] = { ...entry, waste_percentage: parseFloat(waste) }
          }
        }
      })
      return updated
    })
  }, [qtyAccepted])

  const fetchBOM = async (productId) => {
    try {
      const { data, error } = await supabase
        .from('bom')
        .select('id, material_id, qty_per_unit, raw_materials:material_id(id, name, unit)')
        .eq('product_id', productId)

      if (error) throw error

      setBomMaterials(data || [])

      // Initialize material usages
      const usages = {}
      data.forEach(item => {
        usages[item.id] = { qty_used: '', waste_percentage: 0 }
      })
      setMaterialUsages(usages)
    } catch (error) {
      setMessage({ type: 'error', text: `Failed to load BOM: ${error.message}` })
    }
  }

  // Calculate waste percentage
  // expected = qty_per_unit × qty_accepted
  // waste % = ((actual - expected) / expected) × 100
  const calculateWaste = (qtyPerUnit, qtyUsed, accepted) => {
    const perUnit = parseFloat(qtyPerUnit)
    const qty = parseFloat(qtyUsed)
    const acc = parseFloat(accepted)
    if (!perUnit || !qty || !acc) return 0
    const expected = perUnit * acc
    if (qty <= expected) return 0
    return (((qty - expected) / expected) * 100).toFixed(2)
  }

  // Handle material usage input
  const handleMaterialInput = (bomId, value) => {
    const bomItem = bomMaterials.find(m => m.id === bomId)
    const waste = calculateWaste(bomItem.qty_per_unit, value, qtyAccepted)

    setMaterialUsages(prev => ({
      ...prev,
      [bomId]: { qty_used: value, waste_percentage: parseFloat(waste) }
    }))
  }

  // Validate form
  const validateForm = () => {
    if (!selectedProduct) return 'Please select a product'
    if (!selectedMachine) return 'Please select a machine'
    if (!operatorName.trim()) return 'Please enter operator name'
    if (!qtyAccepted && qtyAccepted !== 0) return 'Please enter quantity accepted'
    if (!qtyRejected && qtyRejected !== 0) return 'Please enter quantity rejected'

    for (const bomItem of bomMaterials) {
      if (!materialUsages[bomItem.id]?.qty_used) {
        return `Please enter quantity used for ${bomItem.raw_materials.name}`
      }
    }

    return null
  }

  // Submit production run
  const handleSubmit = async (e) => {
    e.preventDefault()

    const error = validateForm()
    if (error) {
      setMessage({ type: 'error', text: error })
      return
    }

    try {
      setSubmitting(true)
      setMessage(null)

      // Insert production run
      const { data: productionData, error: productionError } = await supabase
        .from('production_runs')
        .insert({
          batch_number: 'BATCH-' + Date.now(),
          product_id: selectedProduct,
          machine_id: selectedMachine,
          run_date: new Date().toISOString().split('T')[0],
          shift: selectedShift,
          operator_name: operatorName,
          qty_started: parseFloat(qtyAccepted) + parseFloat(qtyRejected),
          qty_accepted: parseFloat(qtyAccepted),
          qty_rejected: parseFloat(qtyRejected),
          bom_version: 1,
        })
        .select()

      if (productionError) throw productionError

      const productionRunId = productionData[0].id

      // Insert material usages and deduct stock
      const materialUsageInserts = []
      const stockUpdates = []

      for (const bomItem of bomMaterials) {
        const usage = materialUsages[bomItem.id]
        const qtyUsed = parseFloat(usage.qty_used)

        // Record material usage
        materialUsageInserts.push({
          production_run_id: productionRunId,
          raw_material_id: bomItem.material_id,
          actual_qty: qtyUsed,
          expected_qty: bomItem.qty_per_unit * parseFloat(qtyAccepted),
          waste_percentage: usage.waste_percentage
        })

        // Track stock deduction
        stockUpdates.push({
          material_id: bomItem.material_id,
          qty_used: qtyUsed
        })
      }

      // Insert all material usages
      if (materialUsageInserts.length > 0) {
        const { error: usageError } = await supabase
          .from('production_material_usage')
          .insert(materialUsageInserts)

        if (usageError) throw usageError
      }

      // Update stock for each material (deduct from raw_materials)
      for (const update of stockUpdates) {
        const { data: currentStock } = await supabase
          .from('raw_materials')
          .select('quantity')
          .eq('id', update.material_id)
          .single()

        if (currentStock) {
          const newQty = (currentStock.quantity || 0) - update.qty_used
          await supabase
            .from('raw_materials')
            .update({ quantity: Math.max(0, newQty) })
            .eq('id', update.material_id)
        }
      }

      // Record stock movements
      const movementInserts = stockUpdates.map(update => ({
        raw_material_id: update.material_id,
        movement_type: 'production_usage',
        quantity: -update.qty_used,
        reference_id: productionRunId,
      }))

      if (movementInserts.length > 0) {
        await supabase
          .from('stock_movements')
          .insert(movementInserts)
      }

      // Success
      setMessage({ type: 'success', text: 'Production run recorded successfully!' })

      // Reset form
      setTimeout(() => {
        setSelectedProduct('')
        setSelectedMachine('')
        setSelectedShift('morning')
        setOperatorName('')
        setQtyAccepted('')
        setQtyRejected('')
        setBomMaterials([])
        setMaterialUsages({})
        setMessage(null)
      }, 2000)
    } catch (error) {
      setMessage({ type: 'error', text: `Failed to submit: ${error.message}` })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  const totalQty = (parseFloat(qtyAccepted) || 0) + (parseFloat(qtyRejected) || 0)

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-800 mb-2">
            Production Run Entry
          </h1>
          <p className="text-gray-600">Record daily production activities</p>
        </div>

        {/* Message */}
        {message && (
          <div className={`mb-6 p-4 rounded-lg flex items-start gap-3 ${
            message.type === 'error' 
              ? 'bg-red-50 border border-red-200' 
              : 'bg-green-50 border border-green-200'
          }`}>
            {message.type === 'error' ? (
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            ) : (
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            )}
            <p className={message.type === 'error' ? 'text-red-700' : 'text-green-700'}>
              {message.text}
            </p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-lg p-6 md:p-8 space-y-6">
          {/* Section 1: Production Basics */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-700 border-b pb-2">
              Production Basics
            </h2>

            <div className="grid md:grid-cols-2 gap-4">
              {/* Product */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Product *
                </label>
                <select
                  value={selectedProduct}
                  onChange={(e) => setSelectedProduct(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select a product</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Machine */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Machine *
                </label>
                <select
                  value={selectedMachine}
                  onChange={(e) => setSelectedMachine(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select a machine</option>
                  {machines.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {/* Shift */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Shift *
                </label>
                <select
                  value={selectedShift}
                  onChange={(e) => setSelectedShift(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="morning">Morning</option>
                  <option value="evening">Evening</option>
                </select>
              </div>

              {/* Operator */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Operator Name *
                </label>
                <input
                  type="text"
                  value={operatorName}
                  onChange={(e) => setOperatorName(e.target.value)}
                  placeholder="Enter operator name"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Production Quantities */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-700 border-b pb-2">
              Production Quantities
            </h2>

            <div className="grid md:grid-cols-3 gap-4">
              {/* Accepted */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Qty Accepted *
                </label>
                <input
                  type="number"
                  value={qtyAccepted}
                  onChange={(e) => setQtyAccepted(e.target.value)}
                  placeholder="0"
                  min="0"
                  step="0.01"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Rejected */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Qty Rejected *
                </label>
                <input
                  type="number"
                  value={qtyRejected}
                  onChange={(e) => setQtyRejected(e.target.value)}
                  placeholder="0"
                  min="0"
                  step="0.01"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Total */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Total Qty
                </label>
                <div className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 flex items-center font-semibold text-gray-700">
                  {totalQty.toFixed(2)}
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: BOM Materials */}
          {bomMaterials.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-700 border-b pb-2">
                Material Usage (BOM)
              </h2>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-100 border-b">
                      <th className="px-4 py-2 text-left font-semibold text-gray-700">Material</th>
                      <th className="px-4 py-2 text-left font-semibold text-gray-700">Required</th>
                      <th className="px-4 py-2 text-left font-semibold text-gray-700">Actual Used</th>
                      <th className="px-4 py-2 text-left font-semibold text-gray-700">Waste %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bomMaterials.map(item => (
                      <tr key={item.id} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-700">
                          {item.raw_materials.name}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {qtyAccepted
                            ? `${(item.qty_per_unit * parseFloat(qtyAccepted)).toFixed(2)} ${item.raw_materials.unit}`
                            : `${item.qty_per_unit} ${item.raw_materials.unit} × qty`
                          }
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              value={materialUsages[item.id]?.qty_used || ''}
                              onChange={(e) => handleMaterialInput(item.id, e.target.value)}
                              placeholder="0"
                              min="0"
                              step="0.01"
                              className="w-24 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                            <span className="text-gray-600 text-xs">{item.raw_materials.unit}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className={`font-semibold ${
                            materialUsages[item.id]?.waste_percentage > 10 
                              ? 'text-orange-600' 
                              : materialUsages[item.id]?.waste_percentage > 0
                              ? 'text-yellow-600'
                              : 'text-green-600'
                          }`}>
                            {materialUsages[item.id]?.waste_percentage.toFixed(2)}%
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Waste Summary */}
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <p className="text-sm text-gray-700">
                  <span className="font-semibold">Note:</span> Waste % is calculated as (Qty Used - Qty Required) / Qty Required.
                  Higher percentages indicate more waste.
                </p>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <div className="pt-6 border-t">
            <button
              type="submit"
              disabled={submitting}
              className="w-full md:w-auto px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit Production Run'
              )}
            </button>
          </div>
        </form>

        {/* Info Box */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-gray-700">
            <span className="font-semibold">Quick Info:</span> When you submit, the system will record the production run, 
            track material usage, calculate waste, and automatically deduct stock from your raw materials inventory.
          </p>
        </div>
      </div>
    </div>
  )
}
