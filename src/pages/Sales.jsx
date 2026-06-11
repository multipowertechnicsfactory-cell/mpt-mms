import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import {
  Loader, AlertCircle, CheckCircle, PlusCircle,
  Trash2, X, ChevronDown, ChevronUp, Truck
} from 'lucide-react'

const PAYMENT_TYPES = ['cash', 'credit', 'cheque']
const EMPTY_ITEM = { product_id: '', qty: '', unit_price: '' }

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtLKR(val) {
  if (val == null || val === '') return '—'
  return 'LKR ' + Number(val).toLocaleString('en-LK', { minimumFractionDigits: 2 })
}

export default function Sales() {
  // ── Lookup data ─────────────────────────────────────────────────────────
  const [dealers, setDealers] = useState([])
  const [products, setProducts] = useState([])
  const [dispatches, setDispatches] = useState([])

  // ── Form state ───────────────────────────────────────────────────────────
  const [dealerId, setDealerId] = useState('')
  const [dispatchDate, setDispatchDate] = useState(new Date().toISOString().split('T')[0])
  const [lorryNumber, setLorryNumber] = useState('')
  const [paymentType, setPaymentType] = useState('cash')
  const [discount, setDiscount] = useState('')
  const [items, setItems] = useState([{ ...EMPTY_ITEM }])

  // cheque fields
  const [chequeNumber, setChequeNumber] = useState('')
  const [chequeDate, setChequeDate] = useState('')
  const [chequeAmount, setChequeAmount] = useState('')

  // ── UI state ─────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [expandedRow, setExpandedRow] = useState(null)

  useEffect(() => {
    fetchLookups()
    fetchDispatches()
  }, [])

  // ── Fetch dealers & products (independent of dispatches) ─────────────────
  const fetchLookups = async () => {
    const { data: dealerData } = await supabase
      .from('dealers')
      .select('*')
      .eq('is_active', true)
      .order('name')
    setDealers(dealerData || [])

    const { data: productData } = await supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .order('name')
    setProducts(productData || [])
  }

  // ── Fetch dispatches ──────────────────────────────────────────────────────
  const fetchDispatches = async () => {
    try {
      setLoading(true)
      setMessage(null)

      const { data, error } = await supabase
        .from('dispatches')
        .select('*, dealers(name), dispatch_items(id, quantity, unit_price, products(name))')
        .order('dispatch_date', { ascending: false })
        .limit(20)

      if (error) throw new Error('Dispatches: ' + error.message)
      setDispatches(data || [])
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setLoading(false)
    }
  }

  const fetchAll = async () => {
    await fetchDispatches()
  }

  // ── Item helpers ─────────────────────────────────────────────────────────
  const updateItem = (idx, field, value) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it))
  }

  const addItem = () => setItems(prev => [...prev, { ...EMPTY_ITEM }])

  const removeItem = (idx) => {
    if (items.length === 1) return
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  // ── Computed totals ──────────────────────────────────────────────────────
  const subtotal = items.reduce((sum, it) => {
    const q = parseFloat(it.qty) || 0
    const p = parseFloat(it.unit_price) || 0
    return sum + q * p
  }, 0)
  const discountAmt = parseFloat(discount) || 0
  const total = Math.max(0, subtotal - discountAmt)

  // ── Validate ─────────────────────────────────────────────────────────────
  const validate = () => {
    if (!dealerId) return 'Please select a dealer.'
    if (!dispatchDate) return 'Please enter a dispatch date.'
    if (!lorryNumber.trim()) return 'Please enter the lorry number.'
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      if (!it.product_id) return `Row ${i + 1}: select a product.`
      if (!it.qty || parseFloat(it.qty) <= 0) return `Row ${i + 1}: enter a valid quantity.`
      if (!it.unit_price || parseFloat(it.unit_price) <= 0) return `Row ${i + 1}: enter a valid unit price.`
    }
    if (paymentType === 'cheque') {
      if (!chequeNumber.trim()) return 'Enter the cheque number.'
      if (!chequeDate) return 'Enter the cheque date.'
      if (!chequeAmount || parseFloat(chequeAmount) <= 0) return 'Enter the cheque amount.'
    }
    return null
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    const err = validate()
    if (err) return showMsg('error', err)

    try {
      setSaving(true)
      setMessage(null)

      // 1. Insert dispatch
      const dispatchPayload = {
        dealer_id: dealerId,
        dispatch_date: dispatchDate,
        lorry_number: lorryNumber,
        payment_type: paymentType,
        discount: discountAmt,
        total_value: total,
        ...(paymentType === 'cheque' && {
          cheque_no: chequeNumber,
          cheque_date: chequeDate,
          cheque_amount: parseFloat(chequeAmount),
        }),
      }

      const { data: dispatchData, error: dispatchErr } = await supabase
        .from('dispatches')
        .insert(dispatchPayload)
        .select()

      if (dispatchErr) throw new Error(dispatchErr.message)

      const dispatchId = dispatchData[0].id

      // 2. Insert dispatch items
      const itemsPayload = items.map(it => ({
        dispatch_id: dispatchId,
        product_id: it.product_id,
        quantity: parseFloat(it.qty),
        unit_price: parseFloat(it.unit_price),
        line_total: parseFloat(it.qty) * parseFloat(it.unit_price),
      }))

      const { error: itemsErr } = await supabase
        .from('dispatch_items')
        .insert(itemsPayload)

      if (itemsErr) throw new Error(itemsErr.message)

      showMsg('success', 'Dispatch saved successfully!')
      resetForm()
      await fetchAll()
    } catch (err) {
      showMsg('error', 'Failed to save: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const resetForm = () => {
    setDealerId('')
    setDispatchDate(new Date().toISOString().split('T')[0])
    setLorryNumber('')
    setPaymentType('cash')
    setDiscount('')
    setItems([{ ...EMPTY_ITEM }])
    setChequeNumber('')
    setChequeDate('')
    setChequeAmount('')
  }

  const showMsg = (type, text) => {
    setMessage({ type, text })
    if (type === 'success') setTimeout(() => setMessage(null), 3000)
  }

  // ── Render ────────────────────────────────────────────────────────────────
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
          <h1 className="text-3xl md:text-4xl font-bold text-gray-800 mb-1 flex items-center gap-3">
            <Truck className="w-8 h-8 text-blue-600" />
            Sales & Dispatch
          </h1>
          <p className="text-gray-500">Create dispatch orders and track deliveries.</p>
        </div>

        {/* Message */}
        {message && (
          <div className={`p-4 rounded-lg flex items-start gap-3 ${
            message.type === 'error' ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'
          }`}>
            {message.type === 'error'
              ? <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              : <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
            }
            <p className={message.type === 'error' ? 'text-red-700' : 'text-green-700'}>{message.text}</p>
          </div>
        )}

        {/* ── New Dispatch Form ── */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <h2 className="text-lg font-semibold text-gray-700 mb-5 pb-2 border-b">New Dispatch</h2>

          <form onSubmit={handleSubmit} className="space-y-6">

            {/* Row 1: Dealer / Date / Lorry */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Dealer *</label>
                <select value={dealerId} onChange={e => setDealerId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                  <option value="">Select dealer</option>
                  {dealers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Dispatch Date *</label>
                <input type="date" value={dispatchDate} onChange={e => setDispatchDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Lorry Number *</label>
                <input type="text" value={lorryNumber} onChange={e => setLorryNumber(e.target.value)}
                  placeholder="e.g. WP CAB-1234"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>
            </div>

            {/* Row 2: Payment type */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Payment Type *</label>
                <div className="flex gap-2">
                  {PAYMENT_TYPES.map(pt => (
                    <button key={pt} type="button"
                      onClick={() => setPaymentType(pt)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border capitalize transition-colors ${
                        paymentType === pt
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'text-gray-600 border-gray-300 hover:bg-gray-50'
                      }`}>
                      {pt}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Discount (LKR)</label>
                <input type="number" value={discount} onChange={e => setDiscount(e.target.value)}
                  placeholder="0.00" min="0" step="0.01"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>
            </div>

            {/* Cheque fields */}
            {paymentType === 'cheque' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Cheque Number *</label>
                  <input type="text" value={chequeNumber} onChange={e => setChequeNumber(e.target.value)}
                    placeholder="e.g. 001234"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Cheque Date *</label>
                  <input type="date" value={chequeDate} onChange={e => setChequeDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Cheque Amount (LKR) *</label>
                  <input type="number" value={chequeAmount} onChange={e => setChequeAmount(e.target.value)}
                    placeholder="0.00" min="0" step="0.01"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white" />
                </div>
              </div>
            )}

            {/* Items table */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-600">Products *</label>
                <button type="button" onClick={addItem}
                  className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium">
                  <PlusCircle className="w-4 h-4" /> Add Row
                </button>
              </div>

              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">Product</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">Qty</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">Unit Price (LKR)</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-600">Line Total</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {items.map((it, idx) => {
                      const lineTotal = (parseFloat(it.qty) || 0) * (parseFloat(it.unit_price) || 0)
                      return (
                        <tr key={idx}>
                          <td className="px-3 py-2">
                            <select value={it.product_id} onChange={e => updateItem(idx, 'product_id', e.target.value)}
                              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                              <option value="">Select product</option>
                              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" value={it.qty} onChange={e => updateItem(idx, 'qty', e.target.value)}
                              placeholder="0" min="0" step="0.01"
                              className="w-24 px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" value={it.unit_price} onChange={e => updateItem(idx, 'unit_price', e.target.value)}
                              placeholder="0.00" min="0" step="0.01"
                              className="w-32 px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-gray-700">
                            {lineTotal > 0 ? fmtLKR(lineTotal) : '—'}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button type="button" onClick={() => removeItem(idx)}
                              disabled={items.length === 1}
                              className="p-1 text-red-400 hover:text-red-600 disabled:opacity-30 rounded transition-colors">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-64 space-y-1.5 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span>{fmtLKR(subtotal)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Discount</span>
                  <span className="text-red-500">- {fmtLKR(discountAmt)}</span>
                </div>
                <div className="flex justify-between font-bold text-gray-800 text-base border-t pt-1.5">
                  <span>Total</span>
                  <span>{fmtLKR(total)}</span>
                </div>
              </div>
            </div>

            <button type="submit" disabled={saving}
              className="flex items-center gap-2 px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm">
              {saving ? <><Loader className="w-4 h-4 animate-spin" /> Saving…</> : <><Truck className="w-4 h-4" /> Save Dispatch</>}
            </button>
          </form>
        </div>

        {/* ── Recent Dispatches Table ── */}
        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-700">Recent Dispatches</h2>
            <span className="text-sm text-gray-400">{dispatches.length} records</span>
          </div>

          {dispatches.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">No dispatches recorded yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b text-left">
                    <th className="px-4 py-3 font-semibold text-gray-600">Date</th>
                    <th className="px-4 py-3 font-semibold text-gray-600">Dealer</th>
                    <th className="px-4 py-3 font-semibold text-gray-600">Lorry</th>
                    <th className="px-4 py-3 font-semibold text-gray-600">Payment</th>
                    <th className="px-4 py-3 font-semibold text-gray-600 text-right">Discount</th>
                    <th className="px-4 py-3 font-semibold text-gray-600 text-right">Total</th>
                    <th className="px-4 py-3 font-semibold text-gray-600 text-center">Items</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {dispatches.map(d => {
                    const isOpen = expandedRow === d.id
                    return (
                      <React.Fragment key={d.id}>
                        <tr className="hover:bg-gray-50 cursor-pointer transition-colors"
                          onClick={() => setExpandedRow(isOpen ? null : d.id)}>
                          <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(d.dispatch_date)}</td>
                          <td className="px-4 py-3 font-medium text-gray-800">{d.dealers?.name ?? '—'}</td>
                          <td className="px-4 py-3 text-gray-600 font-mono text-xs">{d.lorry_number}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${
                              d.payment_type === 'cash' ? 'bg-green-100 text-green-700'
                              : d.payment_type === 'cheque' ? 'bg-amber-100 text-amber-700'
                              : 'bg-blue-100 text-blue-700'
                            }`}>
                              {d.payment_type}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-red-500">{d.discount > 0 ? fmtLKR(d.discount) : '—'}</td>
                          <td className="px-4 py-3 text-right font-semibold text-gray-800">{fmtLKR(d.total_value)}</td>
                          <td className="px-4 py-3 text-center text-gray-400">
                            <span className="flex items-center justify-center gap-1">
                              {d.dispatch_items?.length ?? 0}
                              {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </span>
                          </td>
                        </tr>

                        {/* Expanded items row */}
                        {isOpen && (
                          <tr>
                            <td colSpan={7} className="px-8 py-3 bg-blue-50 border-b border-blue-100">
                              <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Items</p>
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-gray-500">
                                    <th className="text-left py-1 pr-4 font-medium">Product</th>
                                    <th className="text-right py-1 pr-4 font-medium">Qty</th>
                                    <th className="text-right py-1 pr-4 font-medium">Unit Price</th>
                                    <th className="text-right py-1 font-medium">Line Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(d.dispatch_items || []).map(it => (
                                    <tr key={it.id} className="border-t border-blue-100">
                                      <td className="py-1 pr-4 text-gray-700">{it.products?.name ?? '—'}</td>
                                      <td className="py-1 pr-4 text-right text-gray-600">{it.quantity}</td>
                                      <td className="py-1 pr-4 text-right text-gray-600">{fmtLKR(it.unit_price)}</td>
                                      <td className="py-1 text-right font-medium text-gray-700">{fmtLKR(it.line_total)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              {d.payment_type === 'cheque' && d.cheque_no && (
                                <p className="mt-2 text-xs text-amber-700">
                                  Cheque: <span className="font-semibold">{d.cheque_no}</span> — {fmtDate(d.cheque_date)} — {fmtLKR(d.cheque_amount)}
                                </p>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
