// Warehouse entity icons v3 — realistic drawn style

// 10 color themes for warehouses — each warehouse gets a unique look
const WAREHOUSE_THEMES = [
  { wall: '#c7d2e0', wallStroke: '#8494a7', roof: '#7b8fa8', roofStroke: '#5c6f82', roofLight: '#9bafc4', door: '#5a7089', doorStroke: '#46586b', window: '#a3c4e8', windowStroke: '#7b9ab8' }, // серый (default)
  { wall: '#c7d0e8', wallStroke: '#7b8ab8', roof: '#6375a8', roofStroke: '#4a5a8a', roofLight: '#8b9fd0', door: '#4a6099', doorStroke: '#3a4e7a', window: '#a3b8e8', windowStroke: '#7090c0' }, // синий
  { wall: '#c7e8d0', wallStroke: '#6ba87b', roof: '#4a8a5e', roofStroke: '#3a7048', roofLight: '#7bc090', door: '#3a7050', doorStroke: '#2a5a3a', window: '#90d8a8', windowStroke: '#60b880' }, // зелёный
  { wall: '#e8c7c7', wallStroke: '#b87070', roof: '#a85050', roofStroke: '#883838', roofLight: '#d08080', door: '#904040', doorStroke: '#703030', window: '#e8a0a0', windowStroke: '#c07070' }, // красный
  { wall: '#e8dcc7', wallStroke: '#b89a60', roof: '#a88040', roofStroke: '#886828', roofLight: '#d0a860', door: '#907030', doorStroke: '#705820', window: '#e8d0a0', windowStroke: '#c0a060' }, // жёлтый/золотой
  { wall: '#dcc7e8', wallStroke: '#9070b8', roof: '#7850a8', roofStroke: '#603888', roofLight: '#a080d0', door: '#684099', doorStroke: '#503080', window: '#c8a0e8', windowStroke: '#a070c0' }, // фиолетовый
  { wall: '#c7e0e8', wallStroke: '#60a0b8', roof: '#4088a8', roofStroke: '#287088', roofLight: '#60b0d0', door: '#307090', doorStroke: '#205870', window: '#90d0e8', windowStroke: '#60b0c8' }, // бирюзовый
  { wall: '#e8d0c7', wallStroke: '#b87850', roof: '#a86038', roofStroke: '#884820', roofLight: '#d09060', door: '#905030', doorStroke: '#703820', window: '#e8b8a0', windowStroke: '#c09070' }, // оранжевый
  { wall: '#e0c7e8', wallStroke: '#a070b0', roof: '#8850a0', roofStroke: '#703888', roofLight: '#b080c8', door: '#784090', doorStroke: '#603070', window: '#d0a0e0', windowStroke: '#b070c0' }, // розовый
  { wall: '#c7e8e0', wallStroke: '#60b0a0', roof: '#409888', roofStroke: '#288070', roofLight: '#60c8b0', door: '#308070', doorStroke: '#206858', window: '#90e0d0', windowStroke: '#60c0b0' }, // мятный
];

export function WarehouseIcon({ size = 20, className = '', style, colorIndex }) {
  const t = WAREHOUSE_THEMES[(colorIndex ?? 0) % WAREHOUSE_THEMES.length];
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} style={style}>
      <rect x="6" y="18" width="36" height="24" rx="2" fill={t.wall} stroke={t.wallStroke} strokeWidth="1.5"/>
      <path d="M4 20L24 6l20 14" fill={t.roof} stroke={t.roofStroke} strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M4 20L24 10l20 10" fill={t.roofLight}/>
      <rect x="17" y="28" width="14" height="14" rx="1.5" fill={t.door} stroke={t.doorStroke} strokeWidth="1"/>
      <line x1="24" y1="28" x2="24" y2="42" stroke={t.doorStroke} strokeWidth=".8"/>
      <rect x="9" y="22" width="5" height="4" rx=".8" fill={t.window} stroke={t.windowStroke} strokeWidth=".8"/>
      <rect x="34" y="22" width="5" height="4" rx=".8" fill={t.window} stroke={t.windowStroke} strokeWidth=".8"/>
    </svg>
  );
}

export function RackIcon({ size = 20, className = '', style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} style={style}>
      <rect x="7" y="4" width="3" height="40" rx=".5" fill="#6ba87b" stroke="#4a7a58" strokeWidth=".8"/>
      <rect x="38" y="4" width="3" height="40" rx=".5" fill="#6ba87b" stroke="#4a7a58" strokeWidth=".8"/>
      <rect x="7" y="4" width="34" height="2.5" rx=".5" fill="#7bc090" stroke="#5a9a6a" strokeWidth=".8"/>
      <rect x="7" y="16" width="34" height="2.5" rx=".5" fill="#7bc090" stroke="#5a9a6a" strokeWidth=".8"/>
      <rect x="7" y="28" width="34" height="2.5" rx=".5" fill="#7bc090" stroke="#5a9a6a" strokeWidth=".8"/>
      <rect x="7" y="40" width="34" height="2.5" rx=".5" fill="#7bc090" stroke="#5a9a6a" strokeWidth=".8"/>
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
      {/* полка доска */}
      <rect x="2" y="24" width="44" height="3" rx=".8" fill="#9a9a9a" stroke="#7a7a7a" strokeWidth="1"/>
      <rect x="2" y="24" width="44" height="1.2" rx=".5" fill="#b5b5b5" opacity=".5"/>
      {/* кронштейны */}
      <path d="M6 27v4l-2 2" stroke="#7a7a7a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M42 27v4l2 2" stroke="#7a7a7a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      {/* коробки на полке — одного цвета */}
      <rect x="5" y="10" width="9" height="14" rx="1.5" fill="#d4a76a" stroke="#b8884a" strokeWidth=".8"/>
      <line x1="9.5" y1="10" x2="9.5" y2="24" stroke="#b8884a" strokeWidth=".5" opacity=".3"/>
      <rect x="16" y="13" width="7" height="11" rx="1.2" fill="#c9985a" stroke="#a87a3e" strokeWidth=".8"/>
      <line x1="19.5" y1="13" x2="19.5" y2="24" stroke="#a87a3e" strokeWidth=".5" opacity=".3"/>
      <rect x="25" y="8" width="10" height="16" rx="1.5" fill="#d4a76a" stroke="#b8884a" strokeWidth=".8"/>
      <line x1="30" y1="8" x2="30" y2="24" stroke="#b8884a" strokeWidth=".5" opacity=".3"/>
      <rect x="37" y="15" width="6" height="9" rx="1" fill="#c9985a" stroke="#a87a3e" strokeWidth=".8"/>
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

// Numbered icon badge — icon with number overlay
export function RackBadge({ number, size = 40, color = '#6366f1' }) {
  return (
    <div style={{ width: size, height: size, position: 'relative', flexShrink: 0 }}>
      <RackIcon size={size} />
      <div style={{
        position: 'absolute', bottom: -2, right: -2,
        width: size * 0.45, height: size * 0.45, borderRadius: '50%',
        background: color, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.25, fontWeight: 800, color: 'white', lineHeight: 1,
        border: '2px solid white',
      }}>{number}</div>
    </div>
  );
}

export function RowBadge({ number, size = 40, color = '#0891b2' }) {
  return (
    <div style={{ width: size, height: size, position: 'relative', flexShrink: 0 }}>
      <RowIcon size={size} />
      <div style={{
        position: 'absolute', bottom: -2, right: -2,
        width: size * 0.45, height: size * 0.45, borderRadius: '50%',
        background: color, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.25, fontWeight: 800, color: 'white', lineHeight: 1,
        border: '2px solid white',
      }}>{number}</div>
    </div>
  );
}

export function ShelfBadge({ number, size = 40, color = '#059669' }) {
  return (
    <div style={{ width: size, height: size, position: 'relative', flexShrink: 0 }}>
      <ShelfIcon size={size} />
      <div style={{
        position: 'absolute', bottom: -2, right: -2,
        width: size * 0.45, height: size * 0.45, borderRadius: '50%',
        background: color, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.25, fontWeight: 800, color: 'white', lineHeight: 1,
        border: '2px solid white',
      }}>{number}</div>
    </div>
  );
}

export function PalletBadge({ number, size = 40, color = '#d97706' }) {
  return (
    <div style={{ width: size, height: size, position: 'relative', flexShrink: 0 }}>
      <PalletIcon size={size} />
      <div style={{
        position: 'absolute', bottom: -2, right: -2,
        width: size * 0.45, height: size * 0.45, borderRadius: '50%',
        background: color, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.25, fontWeight: 800, color: 'white', lineHeight: 1,
        border: '2px solid white',
      }}>{number}</div>
    </div>
  );
}

// ─── Task type icons ─────────────────────────────────────────────────────────

export function InventoryIcon({ size = 20, className = '', style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} style={style}>
      {/* Clipboard board */}
      <rect x="8" y="6" width="32" height="38" rx="3" fill="#e8edf2" stroke="#8494a7" strokeWidth="1.3"/>
      {/* Clipboard clip */}
      <rect x="16" y="3" width="16" height="7" rx="2" fill="#5c6f82" stroke="#46586b" strokeWidth="1"/>
      <rect x="20" y="4.5" width="8" height="3" rx="1" fill="#8494a7"/>
      {/* Checkline 1 — checked */}
      <rect x="14" y="16" width="20" height="2.5" rx="1" fill="#b0bec5" opacity=".5"/>
      <circle cx="14" cy="17.2" r="3" fill="#4caf50" stroke="#388e3c" strokeWidth=".7"/>
      <path d="M12.5 17.2l1.2 1.2 2.2-2.4" stroke="white" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      {/* Checkline 2 — checked */}
      <rect x="14" y="24" width="20" height="2.5" rx="1" fill="#b0bec5" opacity=".5"/>
      <circle cx="14" cy="25.2" r="3" fill="#4caf50" stroke="#388e3c" strokeWidth=".7"/>
      <path d="M12.5 25.2l1.2 1.2 2.2-2.4" stroke="white" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      {/* Checkline 3 — unchecked */}
      <rect x="14" y="32" width="20" height="2.5" rx="1" fill="#b0bec5" opacity=".5"/>
      <circle cx="14" cy="33.2" r="3" fill="white" stroke="#b0bec5" strokeWidth="1"/>
      {/* Magnifier */}
      <circle cx="35" cy="36" r="6" fill="white" stroke="#5c6f82" strokeWidth="1.5"/>
      <circle cx="35" cy="36" r="3" fill="none" stroke="#5c6f82" strokeWidth="1"/>
      <line x1="39.5" y1="40.5" x2="43" y2="44" stroke="#5c6f82" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

export function PackagingIcon({ size = 20, className = '', style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} style={style}>
      {/* Open box — back panel */}
      <path d="M6 20L24 12l18 8v18L24 46 6 38V20z" fill="#d4a76a" stroke="#b8884a" strokeWidth="1.3" strokeLinejoin="round"/>
      {/* Top face */}
      <path d="M6 20l18 8 18-8" fill="#e8c888" stroke="#b8884a" strokeWidth="1" strokeLinejoin="round"/>
      {/* Right face (darker) */}
      <path d="M24 28l18-8v18L24 46z" fill="#c49558"/>
      {/* Center line */}
      <path d="M24 28v18" stroke="#b8884a" strokeWidth="1"/>
      {/* Left flap (open) */}
      <path d="M6 20l9-7 9 5" fill="#e8d8a0" stroke="#b8884a" strokeWidth="1" strokeLinejoin="round" opacity=".85"/>
      {/* Right flap (open) */}
      <path d="M42 20l-9-7-9 5" fill="#dfc87a" stroke="#b8884a" strokeWidth="1" strokeLinejoin="round" opacity=".85"/>
      {/* Arrow down into box */}
      <path d="M24 2v12" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M20 10l4 5 4-5" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      {/* Product jar silhouette inside */}
      <rect x="19" y="30" width="10" height="12" rx="2.5" fill="#f8f8f6" stroke="#d4d0c8" strokeWidth=".8" opacity=".7"/>
      <rect x="20" y="29" width="8" height="3" rx="1.5" fill="#c9a94e" opacity=".6"/>
    </svg>
  );
}

export function TransferIcon({ size = 20, className = '', style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} style={style}>
      {/* Factory/production building */}
      <rect x="2" y="20" width="16" height="18" rx="1.5" fill="#9bafc4" stroke="#6b7f96" strokeWidth="1.2"/>
      <rect x="5" y="14" width="4" height="6" rx=".5" fill="#7b8fa8" stroke="#5c6f82" strokeWidth=".8"/>
      <rect x="11" y="16" width="4" height="4" rx=".5" fill="#7b8fa8" stroke="#5c6f82" strokeWidth=".8"/>
      {/* Factory chimney smoke */}
      <path d="M7 14c0-2 1-3 1-4" stroke="#b0bec5" strokeWidth="1" strokeLinecap="round" opacity=".5"/>
      <path d="M13 16c0-1.5 .8-2.5 .8-3.5" stroke="#b0bec5" strokeWidth="1" strokeLinecap="round" opacity=".5"/>
      {/* Factory window */}
      <rect x="5" y="24" width="4" height="4" rx=".5" fill="#a3c4e8" stroke="#7b9ab8" strokeWidth=".5"/>
      <rect x="11" y="24" width="4" height="4" rx=".5" fill="#a3c4e8" stroke="#7b9ab8" strokeWidth=".5"/>
      {/* Factory door */}
      <rect x="7" y="31" width="6" height="7" rx="1" fill="#5a7089" stroke="#46586b" strokeWidth=".6"/>
      {/* Arrow pointing right */}
      <path d="M20 29h10" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M27 25l4 4-4 4" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      {/* Pallet destination */}
      <rect x="32" y="24" width="14" height="3" rx=".8" fill="#d4b05a" stroke="#a88520" strokeWidth=".8"/>
      <rect x="34" y="27" width="3.5" height="6" rx=".5" fill="#a07820" stroke="#8a7020" strokeWidth=".5"/>
      <rect x="40.5" y="27" width="3.5" height="6" rx=".5" fill="#a07820" stroke="#8a7020" strokeWidth=".5"/>
      <rect x="32" y="33" width="14" height="3" rx=".8" fill="#d4b05a" stroke="#a88520" strokeWidth=".8"/>
      {/* Boxes on pallet */}
      <rect x="34" y="16" width="5" height="8" rx="1" fill="#d4a76a" stroke="#b8884a" strokeWidth=".7"/>
      <rect x="40" y="18" width="4" height="6" rx="1" fill="#c49558" stroke="#a87a3e" strokeWidth=".7"/>
    </svg>
  );
}

// ─── Raw Materials & Tech Card icons ─────────────────────────────────────────

export function IngredientIcon({ size = 20, className = '', style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} style={style}>
      {/* Flask body */}
      <path d="M18 4h12v14l10 22a3 3 0 01-2.7 4.3H10.7A3 3 0 018 40L18 18V4z" fill="#d0f0d8" stroke="#4a9a5e" strokeWidth="1.3" strokeLinejoin="round"/>
      {/* Flask neck */}
      <rect x="18" y="3" width="12" height="5" rx="1.5" fill="#e8f5ec" stroke="#4a9a5e" strokeWidth="1"/>
      {/* Liquid level */}
      <path d="M12 30l6-6h12l6 6v10a3 3 0 01-3 3H15a3 3 0 01-3-3V30z" fill="#6bc480" opacity=".6"/>
      {/* Bubbles */}
      <circle cx="20" cy="34" r="1.5" fill="#a8e0b8" opacity=".8"/>
      <circle cx="28" cy="32" r="1" fill="#a8e0b8" opacity=".6"/>
      <circle cx="24" cy="36" r="1.2" fill="#a8e0b8" opacity=".7"/>
      {/* Pour lines */}
      <line x1="21" y1="6" x2="21" y2="8" stroke="#4a9a5e" strokeWidth=".6" opacity=".4"/>
      <line x1="27" y1="6" x2="27" y2="8" stroke="#4a9a5e" strokeWidth=".6" opacity=".4"/>
    </svg>
  );
}

export function PackagingMaterialIcon({ size = 20, className = '', style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} style={style}>
      {/* Roll/tube body */}
      <rect x="8" y="10" width="32" height="28" rx="3" fill="#e0e8f0" stroke="#7090b0" strokeWidth="1.3"/>
      {/* Cap top */}
      <ellipse cx="24" cy="10" rx="16" ry="4" fill="#c0d0e0" stroke="#7090b0" strokeWidth="1"/>
      {/* Cap bottom */}
      <ellipse cx="24" cy="38" rx="16" ry="4" fill="#b0c0d0" stroke="#7090b0" strokeWidth="1"/>
      {/* Label band */}
      <rect x="8" y="18" width="32" height="12" fill="#7090b0" opacity=".2"/>
      {/* Detail lines */}
      <line x1="14" y1="22" x2="34" y2="22" stroke="#7090b0" strokeWidth=".8" opacity=".5"/>
      <line x1="14" y1="26" x2="28" y2="26" stroke="#7090b0" strokeWidth=".8" opacity=".4"/>
      {/* Recycle symbol hint */}
      <circle cx="36" cy="32" r="3" fill="none" stroke="#7090b0" strokeWidth=".8" opacity=".4"/>
    </svg>
  );
}

export function TechCardIcon({ size = 20, className = '', style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} style={style}>
      {/* Card/document */}
      <rect x="6" y="3" width="30" height="42" rx="3" fill="#f0eef8" stroke="#7c6ab8" strokeWidth="1.3"/>
      {/* Tab/fold */}
      <path d="M26 3h7a3 3 0 013 3v4H26V3z" fill="#c4b8e0" stroke="#7c6ab8" strokeWidth="1"/>
      {/* Header bar */}
      <rect x="10" y="12" width="22" height="4" rx="1" fill="#7c6ab8" opacity=".7"/>
      {/* Recipe lines */}
      <circle cx="13" cy="22" r="1.5" fill="#a890d0"/>
      <rect x="17" y="21" width="13" height="2" rx=".5" fill="#c4b8e0"/>
      <circle cx="13" cy="28" r="1.5" fill="#a890d0"/>
      <rect x="17" y="27" width="10" height="2" rx=".5" fill="#c4b8e0"/>
      <circle cx="13" cy="34" r="1.5" fill="#a890d0"/>
      <rect x="17" y="33" width="14" height="2" rx=".5" fill="#c4b8e0"/>
      {/* Gear/process symbol */}
      <circle cx="38" cy="38" r="7" fill="#f0eef8" stroke="#7c6ab8" strokeWidth="1.2"/>
      <circle cx="38" cy="38" r="3" fill="#7c6ab8" opacity=".3"/>
      <path d="M38 31v2m0 10v2m-5-9l1.5 1m7-5l1.5 1m-10 0l1.5-1m7 5l1.5-1" stroke="#7c6ab8" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}

export function RawMaterialsIcon({ size = 20, className = '', style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} style={style}>
      {/* Mortar bowl */}
      <path d="M6 22c0 10 8 18 18 18s18-8 18-18H6z" fill="#e8dcc7" stroke="#a88520" strokeWidth="1.3"/>
      <ellipse cx="24" cy="22" rx="18" ry="5" fill="#f0e8d0" stroke="#a88520" strokeWidth="1"/>
      {/* Powder inside */}
      <ellipse cx="24" cy="28" rx="12" ry="3" fill="#d4b870" opacity=".5"/>
      {/* Pestle */}
      <line x1="34" y1="8" x2="26" y2="20" stroke="#8a7a60" strokeWidth="3" strokeLinecap="round"/>
      <circle cx="35" cy="7" r="3" fill="#a89070" stroke="#8a7a60" strokeWidth="1"/>
      {/* Small particles */}
      <circle cx="20" cy="26" r=".8" fill="#c4a040" opacity=".6"/>
      <circle cx="28" cy="27" r=".6" fill="#c4a040" opacity=".5"/>
      <circle cx="24" cy="25" r=".7" fill="#c4a040" opacity=".7"/>
    </svg>
  );
}

// ─── Capsule icon ────────────────────────────────────────────────────────────

export function CapsuleIcon({ size = 20, className = '', style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} style={style}>
      <rect x="14" y="4" width="20" height="40" rx="10" fill="#f0efe8" stroke="#b0a890" strokeWidth="1.3"/>
      <rect x="14" y="4" width="20" height="20" rx="10" fill="#e8d8a0" stroke="#b0a890" strokeWidth="1.3"/>
      <path d="M30 10v6" stroke="white" strokeWidth="1.5" opacity=".35" strokeLinecap="round"/>
      <line x1="14" y1="24" x2="34" y2="24" stroke="#b0a890" strokeWidth="1"/>
    </svg>
  );
}

// ─── Sidebar nav icons ──────────────────────────────────────────────────────

export function DashboardNavIcon({ size = 20, className = '', style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} style={style}>
      <rect x="4" y="4" width="18" height="18" rx="3" fill="#7c3aed" opacity=".8"/>
      <rect x="26" y="4" width="18" height="10" rx="3" fill="#a78bfa" opacity=".6"/>
      <rect x="4" y="26" width="18" height="10" rx="3" fill="#a78bfa" opacity=".6"/>
      <rect x="26" y="18" width="18" height="18" rx="3" fill="#7c3aed" opacity=".5"/>
      <rect x="4" y="40" width="40" height="4" rx="2" fill="#c4b5fd" opacity=".4"/>
    </svg>
  );
}

export function WarehouseNavIcon({ size = 20, className = '', style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} style={style}>
      <rect x="6" y="18" width="36" height="24" rx="2" fill="#c7d2e0" stroke="#8494a7" strokeWidth="1.3"/>
      <path d="M4 20L24 6l20 14" fill="#7b8fa8" stroke="#5c6f82" strokeWidth="1.3" strokeLinejoin="round"/>
      <rect x="17" y="28" width="14" height="14" rx="1.5" fill="#5a7089"/>
      <line x1="24" y1="28" x2="24" y2="42" stroke="#46586b" strokeWidth=".8"/>
    </svg>
  );
}

export function TasksNavIcon({ size = 20, className = '', style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} style={style}>
      <rect x="8" y="4" width="32" height="40" rx="3" fill="#e8edf2" stroke="#8494a7" strokeWidth="1.2"/>
      <rect x="16" y="3" width="16" height="6" rx="2" fill="#5c6f82"/>
      <circle cx="15" cy="18" r="2.5" fill="#4caf50" stroke="#388e3c" strokeWidth=".7"/>
      <path d="M13.5 18l1 1 2-2" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      <rect x="20" y="16.5" width="16" height="2.5" rx="1" fill="#b0bec5" opacity=".5"/>
      <circle cx="15" cy="26" r="2.5" fill="#4caf50" stroke="#388e3c" strokeWidth=".7"/>
      <path d="M13.5 26l1 1 2-2" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      <rect x="20" y="24.5" width="12" height="2.5" rx="1" fill="#b0bec5" opacity=".5"/>
      <circle cx="15" cy="34" r="2.5" fill="white" stroke="#b0bec5" strokeWidth="1"/>
      <rect x="20" y="32.5" width="14" height="2.5" rx="1" fill="#b0bec5" opacity=".5"/>
    </svg>
  );
}

export function AnalyticsNavIcon({ size = 20, className = '', style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} style={style}>
      <rect x="6" y="30" width="8" height="14" rx="1.5" fill="#7c3aed" opacity=".7"/>
      <rect x="17" y="22" width="8" height="22" rx="1.5" fill="#7c3aed" opacity=".85"/>
      <rect x="28" y="14" width="8" height="30" rx="1.5" fill="#7c3aed"/>
      <rect x="39" y="6" width="3" height="38" rx="1" fill="#a78bfa" opacity=".4"/>
      <path d="M8 26l10-8 8 4 12-12" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="38" cy="10" r="2.5" fill="#7c3aed"/>
    </svg>
  );
}

export function EarningsNavIcon({ size = 20, className = '', style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} style={style}>
      <circle cx="24" cy="24" r="18" fill="#fef3c7" stroke="#d97706" strokeWidth="1.5"/>
      <circle cx="24" cy="24" r="14" fill="#fbbf24" opacity=".3"/>
      <text x="24" y="29" textAnchor="middle" fill="#d97706" fontSize="16" fontWeight="800" fontFamily="sans-serif">G</text>
    </svg>
  );
}

export function MovementsNavIcon({ size = 20, className = '', style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} style={style}>
      <rect x="4" y="16" width="16" height="16" rx="2" fill="#c7d2e0" stroke="#8494a7" strokeWidth="1"/>
      <rect x="28" y="16" width="16" height="16" rx="2" fill="#c7e8d0" stroke="#6ba87b" strokeWidth="1"/>
      <path d="M22 20h4" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M24 17l3 3-3 3" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M26 28h-4" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M24 31l-3-3 3-3" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export function ErrorsNavIcon({ size = 20, className = '', style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} style={style}>
      <path d="M24 4L4 40h40L24 4z" fill="#fef3c7" stroke="#d97706" strokeWidth="1.5" strokeLinejoin="round"/>
      <line x1="24" y1="18" x2="24" y2="30" stroke="#d97706" strokeWidth="3" strokeLinecap="round"/>
      <circle cx="24" cy="35" r="2" fill="#d97706"/>
    </svg>
  );
}

export function StaffNavIcon({ size = 20, className = '', style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} style={style}>
      <circle cx="18" cy="14" r="7" fill="#fcd9b6" stroke="#e4a96a" strokeWidth="1.2"/>
      <path d="M14 11c0-4 2-6 4-6s4 2 4 6" fill="#5a3e28" opacity=".7"/>
      <path d="M18 24c-7 0-13 3.5-13 9v3h26v-3c0-5.5-6-9-13-9z" fill="#6366f1" opacity=".15" stroke="#6366f1" strokeWidth="1.2"/>
      <circle cx="34" cy="16" r="5.5" fill="#fcd9b6" stroke="#e4a96a" strokeWidth="1"/>
      <path d="M31 14c0-3 1.5-5 3-5s3 2 3 5" fill="#5a3e28" opacity=".7"/>
      <path d="M34 25c-4.5 0-9 2.5-9 6.5v2.5h18V31.5c0-4-4.5-6.5-9-6.5z" fill="#6366f1" opacity=".1" stroke="#6366f1" strokeWidth="1"/>
    </svg>
  );
}

export function SettingsNavIcon({ size = 20, className = '', style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} style={style}>
      <circle cx="24" cy="24" r="8" fill="none" stroke="#8494a7" strokeWidth="2.5"/>
      <circle cx="24" cy="24" r="3.5" fill="#8494a7"/>
      {[0,45,90,135,180,225,270,315].map(a => (
        <line key={a} x1="24" y1="24" x2={24+Math.cos(a*Math.PI/180)*16} y2={24+Math.sin(a*Math.PI/180)*16}
          stroke="#8494a7" strokeWidth="3.5" strokeLinecap="round" transform={`rotate(0,24,24)`}
          style={{transform: 'none'}}/>
      ))}
      <circle cx="24" cy="6" r="3.5" fill="#8494a7"/>
      <circle cx="24" cy="42" r="3.5" fill="#8494a7"/>
      <circle cx="6" cy="24" r="3.5" fill="#8494a7"/>
      <circle cx="42" cy="24" r="3.5" fill="#8494a7"/>
      <circle cx="11.3" cy="11.3" r="3" fill="#8494a7"/>
      <circle cx="36.7" cy="11.3" r="3" fill="#8494a7"/>
      <circle cx="11.3" cy="36.7" r="3" fill="#8494a7"/>
      <circle cx="36.7" cy="36.7" r="3" fill="#8494a7"/>
    </svg>
  );
}

export function ProductsNavIcon({ size = 20, className = '', style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} style={style}>
      <rect x="8" y="8" width="32" height="32" rx="5" fill="#f8f8f6" stroke="#d4d0c8" strokeWidth="1.3"/>
      <rect x="10" y="6" width="28" height="6" rx="3" fill="#c9a94e" stroke="#b08d30" strokeWidth=".8"/>
      <rect x="12" y="16" width="24" height="16" rx="1.5" fill="white" stroke="#e8e0c8" strokeWidth=".7"/>
      <rect x="12" y="16" width="24" height="3.5" rx="1" fill="#c9a94e" opacity=".8"/>
      <rect x="14" y="22" width="16" height="1.5" rx=".4" fill="#b08d30" opacity=".3"/>
      <rect x="14" y="25" width="12" height="1.2" rx=".4" fill="#c9a94e" opacity=".2"/>
      <rect x="14" y="28" width="8" height="1.2" rx=".4" fill="#d4d0c8" opacity=".3"/>
      <path d="M35 12v28" stroke="white" strokeWidth="1.5" opacity=".3" strokeLinecap="round"/>
    </svg>
  );
}

export function CardsNavIcon({ size = 20, className = '', style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} style={style}>
      <rect x="4" y="4" width="18" height="18" rx="3" fill="#f0eef8" stroke="#c4b8e0" strokeWidth="1"/>
      <rect x="26" y="4" width="18" height="18" rx="3" fill="#f0eef8" stroke="#c4b8e0" strokeWidth="1"/>
      <rect x="4" y="26" width="18" height="18" rx="3" fill="#f0eef8" stroke="#c4b8e0" strokeWidth="1"/>
      <rect x="26" y="26" width="18" height="18" rx="3" fill="#f0eef8" stroke="#c4b8e0" strokeWidth="1"/>
      <rect x="7" y="7" width="12" height="2" rx=".5" fill="#7c3aed" opacity=".5"/>
      <rect x="29" y="7" width="12" height="2" rx=".5" fill="#7c3aed" opacity=".5"/>
      <rect x="7" y="29" width="12" height="2" rx=".5" fill="#7c3aed" opacity=".5"/>
      <rect x="29" y="29" width="12" height="2" rx=".5" fill="#7c3aed" opacity=".5"/>
    </svg>
  );
}

export function StockNavIcon({ size = 20, className = '', style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} style={style}>
      <rect x="6" y="22" width="36" height="22" rx="3" fill="#e8edf2" stroke="#8494a7" strokeWidth="1.2"/>
      <rect x="10" y="14" width="28" height="10" rx="2" fill="#c7d2e0" stroke="#8494a7" strokeWidth="1"/>
      <rect x="14" y="8" width="20" height="8" rx="2" fill="#9bafc4" stroke="#5c6f82" strokeWidth="1"/>
      <circle cx="36" cy="16" r="6" fill="#4caf50" stroke="#388e3c" strokeWidth="1"/>
      <text x="36" y="19" textAnchor="middle" fill="white" fontSize="8" fontWeight="800" fontFamily="sans-serif">✓</text>
    </svg>
  );
}

// Aliases for backward compatibility
export const ShelfBoxIcon = BoxIcon;
