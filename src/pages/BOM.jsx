import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Trash2, PlusCircle, Loader, AlertCircle, CheckCircle } from 'lucide-react'

const UNITS = ['g', 'kg', 'm', 'pcs', 'ml', 'L']

export default function BOM() {
  const [bomEntries, setBomEntries] = useState([])
  const [products, setProducts] = useState([])
  const [materials, setMaterials] = useState([])

  const [formProduct, setFormProduct] = useState('')
  const [formMaterial, setFormMaterial] = useState('')
  const [formQty, setFormQty] = useState('')
  const [formUnit, setFormUnit] = useState('g')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [message, setMessage] = useState(null)

  useEffect(() => {
    fetchAll()
  }, [])

  const fetchAll = async () => {
    try {
      setLoading(true)
      setMessage(null)

      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select('*')
        .order('name')

      if (productsError) throw new Error(`Products: ${productsError.message}`)

      const { data: materialsData, error: materialsError } = await supabase
        .from('raw_materials')
        .select('*')
        .order('name')

      if (materialsError) throw new Error(`Materials: ${materialsError.message}`)

      const { data: bomData, error: bomError } = await supabase
        .from('bom')
        .select('id, qty_per_unit, products(id, name), raw_materials:material_id(id, name, unit)')
        .order('id')

      if (bomError) throw new Error(`BOM: ${bomError.message}`)

      setProducts(productsData || [])
      setMaterials(materialsData || [])
      setBomEntries(bomData || [])
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
      console.error('fetchAll error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = async (e) => {
    e.preventDefault()

    if (!formProduct) return showMessage('error', 'Please select a product.')
    if (!formMaterial) return showMessage('error', 'Please select a material.')
    if (!formQty || parseFloat(formQty) <= 0) return showMessage('error', 'Qty per unit must be greater than 0.')

    // Prevent duplicate product + material combo
    const duplicate = bomEntries.find(
      b => b.products?.id === formProduct && b.raw_materials?.id === formMaterial
    )

    if (duplicate) return showMessage('error', 'A BOM entry for this product + material already exists.')

    try {
      setSaving(true)
      setMessage(null)

      const { error } = await supabase.from('bom').insert({
        product_id: formProduct,
        material_id: formMaterial,
        qty_per_unit: parseFloat(formQty),
        unit: formUnit,
        version: 1,
        effective_date: new Date().toISOString().split('T')[0],
      })

      if (error) throw new Error(error.message)

      showMessage('success', 'BOM entry added successfully.')
      setFormProduct('')
      setFormMaterial('')
      setFormQty('')
      setFormUnit('g')
      await fetchAll()
    } catch (error) {
      showMessage('error', `Failed to save: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    try {
      setDeletingId(id)
      const { error } = await supabase.from('bom').delete().eq('id', id)
      if (error) throw new Error(error.message)
      setBomEntries(prev => prev.filter(b => b.id !== id))
      showMessage('success', 'BOM entry deleted.')
    } catch (error) {
      showMessage('error', `Failed to delete: ${error.message}`)
    } finally {
      setDeletingId(null)
    }
  }

  const showMessage = (type, text) => {
    setMessage({ type, text })
    if (type === 'success') setTimeout(() => setMessage(null), 3000)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-8">

        {/* Header */}
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-gray-800 mb-1">
            Bill of Materials
          </h1>
          <p className="text-gray-500">Define raw material quantities required per unit of each product.</p>
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

        {/* Add BOM Entry Form */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <h2 className="text-lg font-semibold text-gray-700 mb-4 pb-2 border-b">
            Add New BOM Entry
          </h2>

          <form onSubmit={handleAdd}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">

              {/* Product */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Product *</label>
                <select
                  value={formProduct}
                  onChange={e => setFormProduct(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select product</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Material */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Raw Material *</label>
                <select
                  value={formMaterial}
                  onChange={e => setFormMaterial(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select material</option>
                  {materials.map(m => (
                    <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>
                  ))}
                </select>
              </div>

              {/* Qty per unit */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Qty per Unit *</label>
                <input
                  type="number"
                  value={formQty}
                  onChange={e => setFormQty(e.target.value)}
                  placeholder="e.g. 2.5"
                  min="0.001"
                  step="0.001"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Unit */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Unit</label>
                <select
                  value={formUnit}
                  onChange={e => setFormUnit(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {UNITS.map(u => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {saving
                ? <><Loader className="w-4 h-4 animate-spin" /> Saving…</>
                : <><PlusCircle className="w-4 h-4" /> Add Entry</>
              }
            </button>
          </form>
        </div>

        {/* BOM Table */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <div className="flex items-center justify-between mb-4 pb-2 border-b">
            <h2 className="text-lg font-semibold text-gray-700">
              Current BOM Entries
            </h2>
            <span className="text-sm text-gray-400">{bomEntries.length} entries</span>
          </div>

          {bomEntries.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-lg mb-1">No BOM entries yet.</p>
              <p className="text-sm">Use the form above to add your first entry.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b text-left">
                    <th className="px-4 py-3 font-semibold text-gray-600">#</th>
                    <th className="px-4 py-3 font-semibold text-gray-600">Product</th>
                    <th className="px-4 py-3 font-semibold text-gray-600">Raw Material</th>
                    <th className="px-4 py-3 font-semibold text-gray-600 text-right">Qty / Unit</th>
                    <th className="px-4 py-3 font-semibold text-gray-600">Unit</th>
                    <th className="px-4 py-3 font-semibold text-gray-600 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {bomEntries.map((entry, idx) => (
                    <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-400">{idx + 1}</td>
                      <td className="px-4 py-3 font-medium text-gray-800">
                        {entry.products?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {entry.raw_materials?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-700">
                        {entry.qty_per_unit}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {entry.raw_materials?.unit ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleDelete(entry.id)}
                          disabled={deletingId === entry.id}
                          className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-40"
                          title="Delete entry"
                        >
                          {deletingId === entry.id
                            ? <Loader className="w-4 h-4 animate-spin" />
                            : <Trash2 className="w-4 h-4" />
                          }
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
