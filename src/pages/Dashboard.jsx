import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import {
  Loader, AlertCircle, RefreshCw,
  CheckCircle2, TrendingDown, AlertTriangle, BarChart3
} from 'lucide-react'

// ─── helpers ────────────────────────────────────────────────────────────────
function todayISO() {
  return new Date().toISOString().split('T')[0]          // "2026-06-07"
}

function monthStart() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString()
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric'
  })
}

function rejectionPct(accepted, rejected) {
  const total = (accepted ?? 0) + (rejected ?? 0)
  if (!total) return '—'
  return ((rejected / total) * 100).toFixed(1) + '%'
}

function statusInfo(material) {
  const stock = material.current_stock ?? 0
  const min   = material.minimum_stock ?? 0
  const reorder = material.reorder_level ?? 0
  if (stock <= min)      return { label: 'Critical', cls: 'bg-red-100 text-red-700' }
  if (stock <= reorder)  return { label: 'Low',      cls: 'bg-yellow-100 text-yellow-700' }
  return                        { label: 'OK',       cls: 'bg-green-100 text-green-700' }
}
// ────────────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [kpi, setKpi]           = useState(null)
  const [runs, setRuns]         = useState([])
  const [lowStock, setLowStock] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [refreshed, setRefreshed] = useState(null)

  useEffect(() => { load() }, [])

  const load = async () => {
    try {
      setLoading(true)
      setError(null)

      const today      = todayISO()
      const monthBegin = monthStart()

      // ── 1. Today's production runs ──────────────────────────────────────
      const { data: todayRuns, error: e1 } = await supabase
        .from('production_runs')
        .select('id, qty_accepted, qty_rejected, created_at')
        .gte('created_at', today + 'T00:00:00')
        .lte('created_at', today + 'T23:59:59')

      if (e1) throw new Error('Today runs: ' + e1.message)

      const todayAccepted = todayRuns.reduce((s, r) => s + (r.qty_accepted ?? 0), 0)

      // ── 2. Today's waste % — derived from qty_used vs qty_required ────
      // Get today's run IDs first, then fetch their material usage
      const todayRunIds = (todayRuns || []).map(r => r.id).filter(Boolean)

      let avgWaste = null
      if (todayRunIds.length > 0) {
        const { data: todayUsage, error: e2 } = await supabase
          .from('production_material_usage')
          .select('qty_used, qty_required')
          .in('production_run_id', todayRunIds)

        if (e2) throw new Error('Today usage: ' + e2.message)

        const withWaste = (todayUsage || []).filter(
          u => u.qty_required != null && u.qty_required > 0 && u.qty_used != null
        )
        if (withWaste.length > 0) {
          const totalWaste = withWaste.reduce((s, u) => {
            const w = Math.max(0, ((u.qty_used - u.qty_required) / u.qty_required) * 100)
            return s + w
          }, 0)
          avgWaste = (totalWaste / withWaste.length).toFixed(1)
        }
      }

      // ── 3. This month's total production ────────────────────────────────
      const { data: monthRuns, error: e3 } = await supabase
        .from('production_runs')
        .select('qty_accepted')
        .gte('created_at', monthBegin)

      if (e3) throw new Error('Month runs: ' + e3.message)

      const monthAccepted = (monthRuns || []).reduce((s, r) => s + (r.qty_accepted ?? 0), 0)

      // ── 4. Low stock count ───────────────────────────────────────────────
      const { data: allMaterials, error: e4 } = await supabase
        .from('raw_materials')
        .select('id, name, unit, current_stock, minimum_stock, reorder_level')

      if (e4) throw new Error('Materials: ' + e4.message)

      const alertMaterials = (allMaterials || []).filter(
        m => (m.current_stock ?? 0) <= (m.reorder_level ?? 0)
      )

      // ── 5. Recent production runs (last 10) ─────────────────────────────
      const { data: recentRuns, error: e5 } = await supabase
        .from('production_runs')
        .select('id, created_at, qty_accepted, qty_rejected, shift, operator_name, products(name), machines(name)')
        .order('created_at', { ascending: false })
        .limit(10)

      if (e5) throw new Error('Recent runs: ' + e5.message)

      setKpi({
        todayAccepted,
        avgWaste,
        lowStockCount: alertMaterials.length,
        monthAccepted,
      })
      setRuns(recentRuns || [])
      setLowStock(alertMaterials)
      setRefreshed(new Date())
    } catch (err) {
      setError(err.message)
      console.error('Dashboard load error:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 max-w-lg w-full flex gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-700 mb-1">Failed to load dashboard</p>
            <p className="text-red-600 text-sm">{error}</p>
            <button onClick={load} className="mt-3 text-sm text-blue-600 hover:underline">
              Try again
            </button>
          </div>
        </div>
      </div>
    )
  }

  const wasteColor = kpi.avgWaste == null
    ? 'text-gray-400'
    : kpi.avgWaste > 10 ? 'text-red-600'
    : kpi.avgWaste > 5  ? 'text-yellow-600'
    : 'text-green-600'

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-gray-800 mb-1">
              Production Dashboard
            </h1>
            <p className="text-gray-500 text-sm">
              {new Date().toLocaleDateString('en-GB', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
              })}
            </p>
          </div>
          <button
            onClick={load}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 shadow-sm transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        {/* ── KPI Cards ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-blue-600" />
              </div>
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Today's Output</span>
            </div>
            <p className="text-3xl font-bold text-gray-800">{kpi.todayAccepted.toLocaleString()}</p>
            <p className="text-xs text-gray-400 mt-1">units accepted</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <TrendingDown className="w-5 h-5 text-orange-600" />
              </div>
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Avg Waste Today</span>
            </div>
            <p className={`text-3xl font-bold ${wasteColor}`}>
              {kpi.avgWaste != null ? `${kpi.avgWaste}%` : 'N/A'}
            </p>
            <p className="text-xs text-gray-400 mt-1">across all materials</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className={`p-2 rounded-lg ${kpi.lowStockCount > 0 ? 'bg-red-100' : 'bg-green-100'}`}>
                <AlertTriangle className={`w-5 h-5 ${kpi.lowStockCount > 0 ? 'text-red-600' : 'text-green-600'}`} />
              </div>
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Stock Alerts</span>
            </div>
            <p className={`text-3xl font-bold ${kpi.lowStockCount > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {kpi.lowStockCount}
            </p>
            <p className="text-xs text-gray-400 mt-1">materials at/below reorder</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <BarChart3 className="w-5 h-5 text-purple-600" />
              </div>
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">This Month</span>
            </div>
            <p className="text-3xl font-bold text-gray-800">{kpi.monthAccepted.toLocaleString()}</p>
            <p className="text-xs text-gray-400 mt-1">units accepted</p>
          </div>
        </div>

        {/* ── Recent Production Runs ──────────────────────────────────────── */}
        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-gray-700">Recent Production Runs</h2>
            <p className="text-xs text-gray-400 mt-0.5">Last 10 batches</p>
          </div>

          {runs.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              No production runs recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b text-left">
                    <th className="px-4 py-3 font-semibold text-gray-600">Date</th>
                    <th className="px-4 py-3 font-semibold text-gray-600">Batch #</th>
                    <th className="px-4 py-3 font-semibold text-gray-600">Product</th>
                    <th className="px-4 py-3 font-semibold text-gray-600">Machine</th>
                    <th className="px-4 py-3 font-semibold text-gray-600">Shift</th>
                    <th className="px-4 py-3 font-semibold text-gray-600 text-right">Accepted</th>
                    <th className="px-4 py-3 font-semibold text-gray-600 text-right">Rejected</th>
                    <th className="px-4 py-3 font-semibold text-gray-600 text-right">Rejection %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {runs.map((run, i) => {
                    const rej = parseFloat(rejectionPct(run.qty_accepted, run.qty_rejected))
                    const rejClass = isNaN(rej) ? 'text-gray-400'
                      : rej > 10 ? 'text-red-600 font-semibold'
                      : rej > 5  ? 'text-yellow-600'
                      : 'text-green-600'
                    return (
                      <tr key={run.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(run.created_at)}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-400">#{String(run.id).slice(0, 8).toUpperCase()}</td>
                        <td className="px-4 py-3 font-medium text-gray-800">{run.products?.name ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{run.machines?.name ?? '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                            run.shift === 'morning'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-indigo-100 text-indigo-700'
                          }`}>
                            {run.shift}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700">{run.qty_accepted ?? 0}</td>
                        <td className="px-4 py-3 text-right text-gray-500">{run.qty_rejected ?? 0}</td>
                        <td className={`px-4 py-3 text-right ${rejClass}`}>
                          {rejectionPct(run.qty_accepted, run.qty_rejected)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Low Stock Alerts ─────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          <div className="px-6 py-4 border-b flex items-center gap-2">
            <AlertTriangle className={`w-5 h-5 ${lowStock.length > 0 ? 'text-red-500' : 'text-green-500'}`} />
            <h2 className="text-lg font-semibold text-gray-700">Low Stock Alerts</h2>
            {lowStock.length > 0 && (
              <span className="ml-auto text-xs bg-red-100 text-red-700 font-semibold px-2.5 py-0.5 rounded-full">
                {lowStock.length} alert{lowStock.length > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {lowStock.length === 0 ? (
            <div className="text-center py-10 text-green-600 text-sm font-medium">
              ✓ All materials are above reorder levels
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b text-left">
                    <th className="px-4 py-3 font-semibold text-gray-600">Material Name</th>
                    <th className="px-4 py-3 font-semibold text-gray-600 text-right">Current Stock</th>
                    <th className="px-4 py-3 font-semibold text-gray-600 text-right">Reorder Level</th>
                    <th className="px-4 py-3 font-semibold text-gray-600 text-right">Min Stock</th>
                    <th className="px-4 py-3 font-semibold text-gray-600 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {lowStock.map(m => {
                    const { label, cls } = statusInfo(m)
                    return (
                      <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-800">{m.name}</td>
                        <td className={`px-4 py-3 text-right font-semibold ${
                          label === 'Critical' ? 'text-red-600' : 'text-yellow-600'
                        }`}>
                          {m.current_stock ?? 0} {m.unit}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-500">{m.reorder_level ?? '—'} {m.unit}</td>
                        <td className="px-4 py-3 text-right text-gray-500">{m.minimum_stock ?? '—'} {m.unit}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
                            {label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Last refreshed */}
        {refreshed && (
          <p className="text-center text-xs text-gray-400 pb-4">
            Last refreshed: {refreshed.toLocaleTimeString()}
          </p>
        )}
      </div>
    </div>
  )
}
