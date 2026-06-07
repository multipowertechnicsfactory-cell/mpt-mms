# Multipower Manufacturing Management System

A comprehensive manufacturing management system for **Multipower Technics** — a Sri Lankan extension cord and plastic factory.

## Tech Stack

- **Frontend**: React 18 + Vite
- **Backend/Database**: Supabase (PostgreSQL)
- **Styling**: Tailwind CSS
- **Icons**: Lucide React

## Features

### Production Run Entry Page
Factory workers can record production activities with:
- Product selection from dropdown
- Machine and shift selection (morning/evening)
- Operator name entry
- Quantity tracking (accepted/rejected)
- Automatic BOM material loading
- Real-time waste percentage calculation
- Automatic stock deduction from raw materials
- Production material usage tracking

## Project Structure

```
src/
├── pages/
│   └── Production.jsx      # Main production entry page
├── lib/
│   └── supabase.js         # Supabase client configuration
├── App.jsx                 # Main app component
├── main.jsx                # Entry point
└── index.css               # Global Tailwind styles
```

## Database Tables (Supabase)

- `products` - Product catalog
- `raw_materials` - Raw material inventory
- `bom` - Bill of Materials (product → materials mapping)
- `machines` - Machine list
- `production_runs` - Production batch records
- `production_material_usage` - Material consumption per production run
- `stock_movements` - Stock movement history

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Supabase

Create a `.env.local` file in the root directory:

```
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Get these values from your Supabase project settings.

### 3. Run Development Server

```bash
npm run dev
```

The app will open at `http://localhost:5173`

### 4. Build for Production

```bash
npm run build
```

## Features Implemented

✅ Product dropdown (fetched from Supabase)
✅ Machine selection
✅ Shift selection (morning/evening)
✅ Operator name input
✅ Quantity tracking (accepted/rejected)
✅ Automatic BOM loading for selected product
✅ Material usage input
✅ Live waste percentage calculation
✅ Form validation
✅ Production run creation
✅ Material usage recording
✅ Automatic raw material stock deduction
✅ Stock movement tracking
✅ Mobile-friendly responsive layout
✅ Error handling and user feedback
✅ Loading states

## Workflow

1. Worker selects a product
2. BOM materials automatically load
3. Worker selects machine and shift
4. Worker enters operator name
5. Worker enters quantities (accepted/rejected)
6. Worker enters actual material quantities used
7. Waste % calculates automatically
8. Worker submits the form
9. System records:
   - Production run details
   - Material usage per material
   - Stock deductions from raw_materials
   - Stock movements for audit trail

## Mobile Responsive

The form is fully responsive with:
- Stack layout on mobile (single column)
- Grid layout on tablets/desktop (2 columns)
- Touch-friendly input fields
- Readable table on all screen sizes

## Styling

- Modern gradient background
- Clean card-based UI
- Color-coded waste percentage (green: 0%, yellow: 1-10%, orange: >10%)
- Smooth transitions and hover effects
- Accessible color contrast

## Error Handling

- Validates all required fields
- Displays user-friendly error messages
- Network error handling
- Graceful fallbacks

## Next Steps

Potential features to add:
- Production run history/dashboard
- Inventory management page
- Machine maintenance tracking
- Report generation
- User authentication
- Multi-language support

---

Built for **Multipower Technics** Manufacturing Management System
