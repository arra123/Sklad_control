// Unique icons for warehouse entities — Warehouse, Rack, Shelf, Pallet, Row, Box, ShelfBox

export function WarehouseIcon({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M3 21V8l9-5 9 5v13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M9 21v-6h6v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M3 8l9 4 9-4" stroke="currentColor" strokeWidth="1.2" opacity="0.4"/>
    </svg>
  );
}

export function RackIcon({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="4" y="3" width="16" height="18" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
      <line x1="4" y1="9" x2="20" y2="9" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="4" y1="15" x2="20" y2="15" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="12" y1="3" x2="12" y2="21" stroke="currentColor" strokeWidth="1.2" opacity="0.3"/>
    </svg>
  );
}

export function ShelfIcon({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M3 10h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M5 10v10M19 10v10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <rect x="7" y="5" width="4" height="5" rx="0.8" fill="currentColor" opacity="0.2" stroke="currentColor" strokeWidth="1"/>
      <rect x="13" y="6" width="3.5" height="4" rx="0.8" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1"/>
    </svg>
  );
}

export function PalletIcon({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="3" y="17" width="18" height="3" rx="1" stroke="currentColor" strokeWidth="1.8"/>
      <line x1="7" y1="20" x2="7" y2="22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="17" y1="20" x2="17" y2="22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="12" y1="17" x2="12" y2="20" stroke="currentColor" strokeWidth="1.2" opacity="0.4"/>
      <rect x="5" y="10" width="14" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.08"/>
      <rect x="7" y="4" width="10" height="6" rx="1" stroke="currentColor" strokeWidth="1.3" fill="currentColor" fillOpacity="0.05"/>
    </svg>
  );
}

export function RowIcon({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="2" y="14" width="6" height="7" rx="1" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="9" y="14" width="6" height="7" rx="1" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="16" y="14" width="6" height="7" rx="1" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M2 12h20" stroke="currentColor" strokeWidth="1.2" opacity="0.3" strokeDasharray="2 2"/>
      <path d="M5 11V8M12 11V6M19 11V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
    </svg>
  );
}

export function BoxIcon({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 3L3 8v8l9 5 9-5V8l-9-5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
      <path d="M12 13l9-5M12 13v8M12 13L3 8" stroke="currentColor" strokeWidth="1.3" opacity="0.4"/>
      <circle cx="12" cy="8" r="1.2" fill="currentColor" opacity="0.5"/>
    </svg>
  );
}

export function ShelfBoxIcon({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="4" y="6" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.8"/>
      <path d="M4 10h16" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M10 10v8M14 10v8" stroke="currentColor" strokeWidth="1" opacity="0.3"/>
      <path d="M9 6v4M15 6v4" stroke="currentColor" strokeWidth="1.2" opacity="0.4"/>
      <circle cx="12" cy="14" r="1.5" stroke="currentColor" strokeWidth="1.2" fill="currentColor" fillOpacity="0.15"/>
    </svg>
  );
}

export function ScanIcon({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M4 7V4h3M20 7V4h-3M4 17v3h3M20 17v3h-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="7" y1="9" x2="7" y2="15" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="9.5" y1="8" x2="9.5" y2="16" stroke="currentColor" strokeWidth="2"/>
      <line x1="12" y1="9" x2="12" y2="15" stroke="currentColor" strokeWidth="1"/>
      <line x1="14.5" y1="8" x2="14.5" y2="16" stroke="currentColor" strokeWidth="2"/>
      <line x1="17" y1="9" x2="17" y2="15" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  );
}

export function EmployeeIcon({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8"/>
      <path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M14.5 7.5l1.5 1.5 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.5"/>
    </svg>
  );
}
