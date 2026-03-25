// Warehouse entity icons v3 — realistic drawn style

export function WarehouseIcon({ size = 20, className = '', style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} style={style}>
      <rect x="6" y="18" width="36" height="24" rx="2" fill="#c7d2e0" stroke="#8494a7" strokeWidth="1.5"/>
      <path d="M4 20L24 6l20 14" fill="#7b8fa8" stroke="#5c6f82" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M4 20L24 10l20 10" fill="#9bafc4"/>
      <rect x="17" y="28" width="14" height="14" rx="1.5" fill="#5a7089" stroke="#46586b" strokeWidth="1"/>
      <line x1="24" y1="28" x2="24" y2="42" stroke="#46586b" strokeWidth=".8"/>
      <rect x="9" y="22" width="5" height="4" rx=".8" fill="#a3c4e8" stroke="#7b9ab8" strokeWidth=".8"/>
      <rect x="34" y="22" width="5" height="4" rx=".8" fill="#a3c4e8" stroke="#7b9ab8" strokeWidth=".8"/>
    </svg>
  );
}

export function RackIcon({ size = 20, className = '', style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} style={style}>
      <rect x="7" y="4" width="3" height="40" rx=".5" fill="#8a8a8a" stroke="#6b6b6b" strokeWidth=".8"/>
      <rect x="38" y="4" width="3" height="40" rx=".5" fill="#8a8a8a" stroke="#6b6b6b" strokeWidth=".8"/>
      <rect x="7" y="4" width="34" height="2.5" rx=".5" fill="#a0a0a0" stroke="#7a7a7a" strokeWidth=".8"/>
      <rect x="7" y="16" width="34" height="2.5" rx=".5" fill="#a0a0a0" stroke="#7a7a7a" strokeWidth=".8"/>
      <rect x="7" y="28" width="34" height="2.5" rx=".5" fill="#a0a0a0" stroke="#7a7a7a" strokeWidth=".8"/>
      <rect x="7" y="40" width="34" height="2.5" rx=".5" fill="#a0a0a0" stroke="#7a7a7a" strokeWidth=".8"/>
      <rect x="12" y="7" width="8" height="8.5" rx="1" fill="#d4a76a" stroke="#b8884a" strokeWidth=".8"/>
      <rect x="22" y="9" width="6" height="6.5" rx="1" fill="#c49558" stroke="#a87a3e" strokeWidth=".8"/>
      <rect x="30" y="8" width="7" height="7.5" rx="1" fill="#d4a76a" stroke="#b8884a" strokeWidth=".8"/>
      <rect x="11" y="19" width="10" height="8.5" rx="1" fill="#c49558" stroke="#a87a3e" strokeWidth=".8"/>
      <rect x="24" y="20" width="5" height="7.5" rx="1" fill="#d4a76a" stroke="#b8884a" strokeWidth=".8"/>
      <rect x="13" y="31" width="7" height="8.5" rx="1" fill="#d4a76a" stroke="#b8884a" strokeWidth=".8"/>
      <rect x="23" y="31" width="9" height="8.5" rx="1" fill="#c49558" stroke="#a87a3e" strokeWidth=".8"/>
    </svg>
  );
}

export function ShelfIcon({ size = 20, className = '', style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} style={style}>
      {/* полка */}
      <rect x="3" y="26" width="42" height="3.5" rx="1" fill="#a0a0a0" stroke="#7a7a7a" strokeWidth="1"/>
      {/* ножки */}
      <path d="M7 29.5V44M41 29.5V44" stroke="#8a8a8a" strokeWidth="2.5" strokeLinecap="round"/>
      <rect x="5.5" y="43" width="3" height="2" rx=".5" fill="#6b6b6b"/>
      <rect x="39.5" y="43" width="3" height="2" rx=".5" fill="#6b6b6b"/>
      {/* товары на полке */}
      <rect x="6" y="12" width="7" height="14" rx="2.5" fill="#5b9bd5" stroke="#4080b8" strokeWidth=".8"/>
      <rect x="7.5" y="16" width="4" height="4" rx=".5" fill="white" opacity=".6"/>
      <rect x="15" y="14" width="6" height="12" rx="2" fill="#e87070" stroke="#c44" strokeWidth=".8"/>
      <rect x="16.2" y="17" width="3.5" height="3.5" rx=".5" fill="white" opacity=".6"/>
      <rect x="23" y="10" width="9" height="16" rx="1.5" fill="#d4a76a" stroke="#b8884a" strokeWidth=".8"/>
      <line x1="27.5" y1="10" x2="27.5" y2="26" stroke="#b8884a" strokeWidth=".6" opacity=".4"/>
      <rect x="34" y="16" width="6" height="10" rx="1.5" fill="#7bc47b" stroke="#5a9a5a" strokeWidth=".8"/>
      <rect x="35.2" y="18.5" width="3.5" height="3" rx=".5" fill="white" opacity=".5"/>
    </svg>
  );
}

export function PalletIcon({ size = 20, className = '', style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} style={style}>
      {/* верхняя доска */}
      <rect x="3" y="12" width="42" height="4" rx="1" fill="#d4b05a" stroke="#a88520" strokeWidth="1"/>
      {/* ножки с дырками */}
      <rect x="6" y="16" width="5" height="10" rx="1" fill="#a07820" stroke="#8a7020" strokeWidth=".6"/>
      <rect x="21.5" y="16" width="5" height="10" rx="1" fill="#a07820" stroke="#8a7020" strokeWidth=".6"/>
      <rect x="37" y="16" width="5" height="10" rx="1" fill="#a07820" stroke="#8a7020" strokeWidth=".6"/>
      {/* нижняя доска */}
      <rect x="3" y="26" width="42" height="4" rx="1" fill="#d4b05a" stroke="#a88520" strokeWidth="1"/>
    </svg>
  );
}

export function RowIcon({ size = 20, className = '', style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} style={style}>
      <rect x="1" y="36" width="12" height="3" rx=".5" fill="#c49a40"/>
      <rect x="2" y="26" width="10" height="10" rx="1" fill="#d4a76a" stroke="#b8884a" strokeWidth=".7"/>
      <rect x="3" y="18" width="8" height="8" rx="1" fill="#c49558" stroke="#a87a3e" strokeWidth=".7"/>
      <rect x="16" y="36" width="14" height="3" rx=".5" fill="#c49a40"/>
      <rect x="17" y="22" width="12" height="14" rx="1" fill="#d4a76a" stroke="#b8884a" strokeWidth=".7"/>
      <rect x="18" y="10" width="10" height="12" rx="1" fill="#c49558" stroke="#a87a3e" strokeWidth=".7"/>
      <rect x="20" y="3" width="6" height="7" rx="1" fill="#d4a76a" stroke="#b8884a" strokeWidth=".7"/>
      <rect x="33" y="36" width="12" height="3" rx=".5" fill="#c49a40"/>
      <rect x="34" y="28" width="10" height="8" rx="1" fill="#c49558" stroke="#a87a3e" strokeWidth=".7"/>
      <rect x="35" y="20" width="8" height="8" rx="1" fill="#d4a76a" stroke="#b8884a" strokeWidth=".7"/>
      <path d="M5 44h38" stroke="#94a3b8" strokeWidth="1" strokeDasharray="3 2" opacity=".4"/>
    </svg>
  );
}

export function BoxIcon({ size = 20, className = '', style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} style={style}>
      <path d="M6 16L24 6l18 10v20L24 46 6 36V16z" fill="#d4a76a" stroke="#b8884a" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M6 16l18 8 18-8" fill="#e8c888" stroke="#b8884a" strokeWidth="1" strokeLinejoin="round"/>
      <path d="M24 24v22" stroke="#b8884a" strokeWidth="1"/>
      <path d="M24 24l18-8v20L24 46z" fill="#c49558"/>
      <path d="M18 13l6 3 6-3" stroke="#e8d8a0" strokeWidth="2.5" strokeLinecap="round" opacity=".7"/>
      <line x1="24" y1="24" x2="24" y2="38" stroke="#e8d8a0" strokeWidth="2" opacity=".5"/>
      <rect x="14" y="28" width="8" height="6" rx=".5" fill="white" opacity=".6"/>
    </svg>
  );
}

export function ProductIcon({ size = 20, className = '', style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} style={style}>
      {/* Банка — белый корпус */}
      <rect x="13" y="7" width="22" height="35" rx="5" fill="#f8f8f6" stroke="#d4d0c8" strokeWidth="1.3"/>
      {/* Крышка — золотая */}
      <rect x="15" y="4" width="18" height="6" rx="3" fill="#c9a94e" stroke="#b08d30" strokeWidth="1"/>
      <rect x="17" y="5.5" width="14" height="2.5" rx="1" fill="#dfc065" opacity=".6"/>
      {/* Дно — золотое */}
      <rect x="15" y="39" width="18" height="4" rx="2" fill="#c9a94e" stroke="#b08d30" strokeWidth="1"/>
      {/* Этикетка */}
      <rect x="15" y="15" width="18" height="18" rx="1.5" fill="white" stroke="#e8e0c8" strokeWidth=".8"/>
      {/* Золотая полоска сверху этикетки */}
      <rect x="15" y="15" width="18" height="3.5" rx="1" fill="#c9a94e" opacity=".8"/>
      {/* Текст GRA */}
      <text x="24" y="17.5" textAnchor="middle" fill="white" fontSize="3" fontWeight="800" fontFamily="sans-serif">GRAFLab</text>
      {/* Текст на этикетке */}
      <rect x="17" y="21" width="14" height="1.5" rx=".4" fill="#b08d30" opacity=".35"/>
      <rect x="17" y="24" width="10" height="1.2" rx=".4" fill="#c9a94e" opacity=".25"/>
      <rect x="17" y="26.5" width="12" height="1.2" rx=".4" fill="#c9a94e" opacity=".2"/>
      <rect x="17" y="29" width="8" height="1.2" rx=".4" fill="#d4d0c8" opacity=".3"/>
      {/* Блик на банке */}
      <path d="M31 10v28" stroke="white" strokeWidth="2" opacity=".35" strokeLinecap="round"/>
      <path d="M29 12v24" stroke="white" strokeWidth=".8" opacity=".15" strokeLinecap="round"/>
    </svg>
  );
}

export function ScanIcon({ size = 20, className = '', style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} style={style}>
      <path d="M6 14V6h8" stroke="#4f46e5" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M42 14V6h-8" stroke="#4f46e5" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M6 34v8h8" stroke="#4f46e5" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M42 34v8h-8" stroke="#4f46e5" strokeWidth="2.5" strokeLinecap="round"/>
      <rect x="12" y="14" width="3" height="20" rx=".3" fill="#1e293b" opacity=".85"/>
      <rect x="16.5" y="12" width="2" height="24" rx=".3" fill="#1e293b" opacity=".6"/>
      <rect x="20" y="14" width="4" height="20" rx=".3" fill="#1e293b" opacity=".85"/>
      <rect x="25.5" y="12" width="1.5" height="24" rx=".3" fill="#1e293b" opacity=".5"/>
      <rect x="28.5" y="14" width="3" height="20" rx=".3" fill="#1e293b" opacity=".75"/>
      <rect x="33" y="12" width="2" height="24" rx=".3" fill="#1e293b" opacity=".6"/>
      <rect x="36.5" y="14" width="1.5" height="20" rx=".3" fill="#1e293b" opacity=".4"/>
      <line x1="8" y1="24" x2="40" y2="24" stroke="#ef4444" strokeWidth="2" opacity=".7"/>
    </svg>
  );
}

export function EmployeeIcon({ size = 20, className = '', style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} style={style}>
      <path d="M24 26c-8 0-15 4-15 10v4h30v-4c0-6-7-10-15-10z" fill="#6366f1" opacity=".15" stroke="#6366f1" strokeWidth="1.5"/>
      <circle cx="24" cy="15" r="9" fill="#fcd9b6" stroke="#e4a96a" strokeWidth="1.3"/>
      <path d="M15 13c0-6 4-9 9-9s9 3 9 9" fill="#5a3e28" opacity=".8"/>
      <circle cx="20.5" cy="15.5" r="1.2" fill="#3a3a3a"/>
      <circle cx="27.5" cy="15.5" r="1.2" fill="#3a3a3a"/>
      <path d="M21 19.5c1.5 1.5 4.5 1.5 6 0" stroke="#c47a4a" strokeWidth="1" strokeLinecap="round" fill="none"/>
      <rect x="20" y="30" width="8" height="5" rx="1" fill="white" stroke="#6366f1" strokeWidth=".8"/>
    </svg>
  );
}

export function BundleIcon({ size = 20, className = '', style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} style={style}>
      {/* банка левая наклон */}
      <g transform="rotate(-8 14 24)">
        <rect x="4" y="10" width="16" height="28" rx="3.5" fill="#f0efe8" stroke="#d4d0c8" strokeWidth="1"/>
        <rect x="6" y="8" width="12" height="4" rx="2" fill="#c9a94e" stroke="#b08d30" strokeWidth=".7"/>
        <rect x="6" y="35" width="12" height="3" rx="1.5" fill="#c9a94e"/>
        <rect x="6" y="16" width="12" height="12" rx="1" fill="white" stroke="#e8e0c8" strokeWidth=".5"/>
        <rect x="6" y="16" width="12" height="2.5" rx=".6" fill="#c9a94e" opacity=".7"/>
      </g>
      {/* банка центральная */}
      <rect x="14" y="6" width="20" height="34" rx="4.5" fill="#f8f8f6" stroke="#d4d0c8" strokeWidth="1.3"/>
      <rect x="16" y="3.5" width="16" height="5.5" rx="2.8" fill="#c9a94e" stroke="#b08d30" strokeWidth="1"/>
      <rect x="16" y="37" width="16" height="4" rx="2" fill="#c9a94e" stroke="#b08d30" strokeWidth="1"/>
      <rect x="16" y="14" width="16" height="16" rx="1.2" fill="white" stroke="#e8e0c8" strokeWidth=".7"/>
      <rect x="16" y="14" width="16" height="3.2" rx=".8" fill="#c9a94e" opacity=".8"/>
      <path d="M30 9v28" stroke="white" strokeWidth="1.5" opacity=".3" strokeLinecap="round"/>
      {/* банка правая наклон */}
      <g transform="rotate(8 34 24)">
        <rect x="28" y="10" width="16" height="28" rx="3.5" fill="#f0efe8" stroke="#d4d0c8" strokeWidth="1"/>
        <rect x="30" y="8" width="12" height="4" rx="2" fill="#c9a94e" stroke="#b08d30" strokeWidth=".7"/>
        <rect x="30" y="35" width="12" height="3" rx="1.5" fill="#c9a94e"/>
        <rect x="30" y="16" width="12" height="12" rx="1" fill="white" stroke="#e8e0c8" strokeWidth=".5"/>
        <rect x="30" y="16" width="12" height="2.5" rx=".6" fill="#c9a94e" opacity=".7"/>
      </g>
      {/* бейдж */}
      <circle cx="42" cy="8" r="6" fill="#c9a94e" stroke="#b08d30" strokeWidth=".8"/>
      <text x="42" y="10" textAnchor="middle" fill="white" fontSize="6" fontWeight="800" fontFamily="sans-serif">3</text>
    </svg>
  );
}

// Aliases for backward compatibility
export const ShelfBoxIcon = BoxIcon;
