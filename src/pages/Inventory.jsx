import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import {
  Loader, AlertCircle, CheckCircle,
  PackageOpen, AlertTriangle, TrendingDown, PlusCircle, X
} from 'lucide-react'

function getStatus(material) {
  const stock = material.current_stock ?? 0
  const min = material.minimum_stock ?? 0
  const reorder = material.reorder_level ?? 0
  if (stock <= min) return 'critical'
  if (stock <= reorder) return 'low'
  return 'ok'
}

const STATUS_BADGE = {
  ok:       'bg-green-100 text-green-700',
  low:      'bg-yellow-100 text-yellow-700',
  critical: 'bg-red-100 text-red-700',
}
const STATUS_LABEL = { ok: 'OK', low: 'Low', critical: 'Critical' }

export default function Inventory() {
  const [materials, setMaterials] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState(null)

  // Stock-in modal state
  const [stockInRow, setStockInRow] = useState(null)   // the material being edited
  const [stockInQty, setStockInQty] = useState('')
  const [stockInNote, setStockInNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchMaterials() }, [])

  const fetchMaterials = async () => {
    try {
      setLoading(true)
      setMessage(null)
      const { data, error } = await supabase
        .from('raw_materials')
        .select('*')
        .order('name')
      if (error) throw new Error(error.message)
      setMaterials(data || [])
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setLoading(false)
    }
  }

  const openStockIn = (material) => {
    setStockInRow(material)
    setStockInQty('')
    setStockInNote('')
  }

  const handleStockIn = async (e) => {
    e.preventDefault()
    const qty = parseFloat(stockInQty)
    if (!qty || qty <= 0) return showMsg('error', 'Quantity must be greater than 0.')

    try {
      setSaving(true)

      const newStock = (stockInRow.current_stock ?? 0) + qty

      const { error: updateError } = await supabase
        .from('raw_materials')
        .update({ current_stock: newStock })
        .eq('id', stockInRow.id)

      if (updateError) throw new Error(updateError.message)

      const { error: movementError } = await supabase
        .from('stock_movements')
        .insert({
          material_id: stockInRow.id,
          movement_type: 'purchase',
          qty: qty,
          notes: stockInNote || null,
        })

      if (movementError) throw new Error(movementError.message)

      // Update local state immediately
      setMaterials(prev =>
        prev.map(m => m.id === stockInRow.id ? { ...m, current_stock: newStock } : m)
      )

      showMsg('success', `Added ${qty} ${stockInRow.unit} to ${stockInRow.name}.`)
      setStockInRow(null)
    } catch (err) {
      showMsg('error', `Stock-in failed: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  const showMsg = (type, text) => {
    setMessage({ type, text })
    if (type === 'success') setTimeout(() => setMessage(null), 3000)
  }

  // Summary counts
  const total = materials.length
  const lowCount = materials.filter(m => getStatus(m) === 'low').length
  const criticalCount = materials.filter(m => getStatus(m) === 'critical').length

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-gray-800 mb-1">
            Raw Materials Inventory
          </h1>
          <p className="text-gray-500">Track stock levels and reorder status for all materials.</p>
        </div>

        {/* Message */}
        {message && (
          <div className={`p-4 rounded-lg flex items-start gap-3 ${
            message.type === 'error'
              ? 'bg-red-50 border border-red-200'
              : 'bg-green-50 border border-green-200'
          }`}>
            {message.type === 'error'
              ? <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              : <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
            }
            <p className={message.type === 'error' ? 'text-red-700' : 'text-green-700'}>
              {message.text}
            </p>
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl shadow-sm p-5 flex items-center gap-4 border border-gray-100">
            <div className="p-3 bg-blue-100 rounded-lg">
              <PackageOpen className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Materials</p>
              <p className="text-2xl font-bold text-gray-800">{total}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-5 flex items-center gap-4 border border-yellow-100">
            <div className="p-3 bg-yellow-100 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Low Stock</p>
              <p className="text-2xl font-bold text-yellow-700">{lowCount}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-5 flex items-center gap-4 border border-red-100">
            <div className="p-3 bg-red-100 rounded-lg">
              <TrendingDown className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Critical Stock</p>
              <p className="text-2xl font-bold text-red-700">{criticalCount}</p>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-700">All Materials</h2>
            <button
              onClick={fetchMaterials}
              className="text-sm text-blue-600 hover:underline"
            >
              Refresh
            </button>
          </div>

          {materials.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <p>No materials found in inventory.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b text-left">
                    <th className="px-4 py-3 font-semibold text-gray-600">Material Name</th>
                    <th className="px-4 py-3 font-semibold text-gray-600">Code</th>
                    <th className="px-4 py-3 font-semibold text-gray-600">Unit</th>
                    <th className="px-4 py-3 font-semibold text-gray-600 text-right">Current Stock</th>
                    <th className="px-4 py-3 font-semibold text-gray-600 text-right">Min Stock</th>
                    <th className="px-4 py-3 font-semibold text-gray-600 text-right">Reorder Level</th>
                    <th className="px-4 py-3 font-semibold text-gray-600 text-right">Cost (LKR)</th>
                    <th className="px-4 py-3 font-semibold text-gray-600 text-center">Status</th>
                    <th className="px-4 py-3 font-semibold text-gray-600 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {materials.map(m => {
                    const status = getStatus(m)
                    return (
                      <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-800">{m.name}</td>
                        <td className="px-4 py-3 text-gray-500 font-mono text-xs">{m.code ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-500">{m.unit}</td>
                        <td className={`px-4 py-3 text-right font-semibold ${
                          status === 'critical' ? 'text-red-600'
                          : status === 'low' ? 'text-yellow-600'
                          : 'text-gray-700'
                        }`}>
                          {m.current_stock ?? 0}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-500">{m.minimum_stock ?? '—'}</td>
                        <td className="px-4 py-3 text-right text-gray-500">{m.reorder_level ?? '—'}</td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {m.cost_per_unit != null
                            ? Number(m.cost_per_unit).toLocaleString('en-LK', { minimumFractionDigits: 2 })
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_BADGE[status]}`}>
                            {STATUS_LABEL[status]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => openStockIn(m)}
                            className="flex items-center gap-1 mx-auto px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-medium rounded-lg transition-colors"
                          >
                            <PlusCircle className="w-3.5 h-3.5" />
                            Stock In
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Stock In Modal */}
      {stockInRow && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">Stock In</h3>
              <button
                onClick={() => setStockInRow(null)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4 p-3 bg-gray-50 rounded-lg text-sm">
              <p className="font-medium text-gray-700">{stockInRow.name}</p>
              <p className="text-gray-500">
                Current stock: <span className="font-semibold text-gray-700">
                  {stockInRow.current_stock ?? 0} {stockInRow.unit}
                </span>
              </p>
            </div>

            <form onSubmit={handleStockIn} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Quantity to Add ({stockInRow.unit}) *
                </label>
                <input
                  type="number"
                  value={stockInQty}
                  onChange={e => setStockInQty(e.target.value)}
                  placeholder="e.g. 500"
                  min="0.001"
                  step="0.001"
                  autoFocus
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Notes (optional)
                </label>
                <input
                  type="text"
                  value={stockInNote}
                  onChange={e => setStockInNote(e.target.value)}
                  placeholder="e.g. Supplier delivery #INV-001"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  {saving
                    ? <><Loader className="w-4 h-4 animate-spin" /> Saving…</>
                    : <><PlusCircle className="w-4 h-4" /> Add Stock</>
                  }
                </button>
                <button
                  type="button"
                  onClick={() => setStockInRow(null)}
                  className="px-4 py-2 border border-gray-300 text-gray-600 hover:bg-gray-50 font-medium rounded-lg transition-colors text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
