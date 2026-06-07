# Multipower Manufacturing System - Development Instructions

This workspace contains the Production Run entry page for the Multipower Manufacturing Management System.

## Project Overview

- **Framework**: React 18 + Vite
- **Database**: Supabase
- **UI**: Tailwind CSS + Lucide React
- **Main Feature**: Production run entry with BOM material tracking and automatic stock deduction

## Project Status

✅ Project setup complete
✅ Production.jsx page built with all required features
✅ Supabase integration configured
✅ Responsive design implemented

## Key Components

- `src/pages/Production.jsx` - Main production entry page with full functionality
- `src/lib/supabase.js` - Supabase client configuration
- `src/App.jsx` - App wrapper

## Environment Setup

Before running the project, create `.env.local` with:

```
VITE_SUPABASE_URL=your_project_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

## Running the Project

```bash
npm install
npm run dev
```

## Development Notes

- All components are functional React components with hooks
- State management uses React hooks (useState, useEffect)
- Database queries use Supabase client
- Tailwind CSS for all styling
- Lucide React for icons
- Mobile-first responsive design

## Supabase Tables Required

Ensure these tables exist in your Supabase project:
- `products` (id, name)
- `machines` (id, name)
- `raw_materials` (id, name, unit, quantity)
- `bom` (id, product_id, raw_material_id, qty_required)
- `production_runs` (id, product_id, machine_id, shift, operator_name, qty_accepted, qty_rejected, total_qty, timestamp)
- `production_material_usage` (id, production_run_id, raw_material_id, qty_used, qty_required, waste_percentage)
- `stock_movements` (id, raw_material_id, movement_type, quantity, reference_id, timestamp)
