import React, { useState } from 'react'
import Dashboard from './pages/Dashboard'
import Production from './pages/Production'
import BOM from './pages/BOM'
import Inventory from './pages/Inventory'
import Sales from './pages/Sales'

const PAGES = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'production', label: 'Production Run' },
  { key: 'bom', label: 'Bill of Materials' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'sales', label: 'Sales & Dispatch' },
]

function App() {
  const [page, setPage] = useState('dashboard')

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Nav */}
      <nav className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 flex items-center gap-1 h-14">
          <span className="font-bold text-blue-700 mr-4 text-sm tracking-wide uppercase">
            Multipower MFG
          </span>
          {PAGES.map(p => (
            <button
              key={p.key}
              onClick={() => setPage(p.key)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                page === p.key
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </nav>

      {page === 'dashboard' && <Dashboard />}
      {page === 'production' && <Production />}
      {page === 'bom' && <BOM />}
      {page === 'inventory' && <Inventory />}
      {page === 'sales' && <Sales />}
    </div>
  )
}

export default App
