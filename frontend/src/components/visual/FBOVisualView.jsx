import { useState, useCallback, useEffect } from 'react';
import api from '../../api/client';
import Spinner from '../ui/Spinner';

const BOX_COLS = 5;
const BOX_ROWS_VISIBLE = 4;
const MAX_VISIBLE = BOX_COLS * BOX_ROWS_VISIBLE; // 20 boxes shown on top

function PalletBox({ box }) {
  // Generate barcode bars from barcode_value
  const bars = (box.barcode_value || '000000000').slice(0, 10).split('').map((c, i) => {
    const h = 3 + (parseInt(c) || 0) % 5;
    return <span key={i} style={{ width: 1, height: h, background: '#3a3020', opacity: 0.5, borderRadius: 0.2 }} />;
  });

  const name = (box.product_name || '—').replace(/GraFLab,?\s*/i, '').trim();
  const qty = box.quantity || 0;

  return (
    <div style={{ position: 'relative', cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s' }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.06)'; e.currentTarget.style.zIndex = 5; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.zIndex = 1; }}>
      {/* Box top face */}
      <div style={{
        aspectRatio: '1', borderRadius: 3,
        background: 'linear-gradient(145deg, #e8dbc4, #ddd0b4 40%, #d0c0a0)',
        border: '1.5px solid #b8a480', position: 'relative', overflow: 'hidden',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35), 0 2px 6px rgba(0,0,0,0.12)',
      }}>
        {/* Tape vertical */}
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 8, transform: 'translateX(-50%)',
          background: 'rgba(200,180,150,0.3)', borderLeft: '0.5px solid rgba(180,160,130,0.2)', borderRight: '0.5px solid rgba(180,160,130,0.2)' }} />
        {/* Tape horizontal */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 8, transform: 'translateY(-50%)',
          background: 'rgba(200,180,150,0.3)', borderTop: '0.5px solid rgba(180,160,130,0.2)', borderBottom: '0.5px solid rgba(180,160,130,0.2)' }} />
        {/* Flap lines */}
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '25%', borderRight: '1px solid rgba(160,140,110,0.2)' }} />
        <div style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: '25%', borderLeft: '1px solid rgba(160,140,110,0.2)' }} />
        {/* Shine */}
        <div style={{ position: 'absolute', top: 0, right: 0, width: '40%', height: '35%',
          background: 'linear-gradient(225deg, rgba(255,255,255,0.25), transparent 60%)', borderRadius: '0 3px 0 0', pointerEvents: 'none' }} />
        {/* Label */}
        <div style={{
          position: 'absolute', bottom: 3, left: 3, right: 3,
          background: 'white', border: '0.5px solid #d8d0c4', borderRadius: 1.5,
          opacity: 0.85, padding: '2px 3px', zIndex: 2,
          boxShadow: '0 0.5px 2px rgba(0,0,0,0.06)',
        }}>
          <div style={{ fontSize: 6, fontWeight: 700, color: '#3a3020', lineHeight: 1.15,
            overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
            {name}
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 2, marginTop: 1 }}>
            <div style={{ display: 'flex', gap: 0.4, alignItems: 'flex-end', height: 5, flexShrink: 0 }}>{bars}</div>
            <div style={{ fontSize: 6, fontWeight: 800, color: '#6a5a40', whiteSpace: 'nowrap' }}>{qty}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PalletView({ pallet }) {
  const allBoxes = pallet.boxes || [];
  const visibleBoxes = allBoxes.slice(0, MAX_VISIBLE);
  const hiddenCount = Math.max(0, allBoxes.length - MAX_VISIBLE);
  const totalQty = allBoxes.reduce((s, b) => s + Number(b.quantity || 0), 0);

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', width: 220 }}>
      {/* Wood pallet + boxes */}
      <div style={{
        padding: 8,
        background: `repeating-linear-gradient(0deg, #c89838 0px, #bd8d35 14px, #7a5020 14px, #7a5020 15.5px, #c89838 15.5px)`,
        border: '2.5px solid #8a5c20', borderRadius: 5,
        boxShadow: '0 2px 0 #6a4818, 0 3px 0 #5a3810, 0 8px 20px rgba(0,0,0,0.18)',
        width: '100%',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${BOX_COLS}, 1fr)`, gap: 3 }}>
          {visibleBoxes.map(box => <PalletBox key={box.id} box={box} />)}
          {/* Empty cells to fill grid */}
          {visibleBoxes.length < MAX_VISIBLE && visibleBoxes.length > 0 && Array.from({ length: MAX_VISIBLE - visibleBoxes.length }, (_, i) => (
            <div key={`empty-${i}`} style={{ aspectRatio: '1', borderRadius: 2, background: 'rgba(0,0,0,0.04)', border: '0.5px dashed rgba(0,0,0,0.08)' }} />
          ))}
        </div>
        {hiddenCount > 0 && (
          <div style={{ textAlign: 'center', marginTop: 4, fontSize: 8, color: '#8a7050', fontWeight: 600, opacity: 0.7 }}>
            +{hiddenCount} ещё снизу
          </div>
        )}
      </div>
      {/* Pallet name below */}
      <div style={{ marginTop: 6, textAlign: 'center' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#7a6b5a', fontFamily: 'monospace' }}>{pallet.name}</span>
        <span style={{ fontSize: 9, color: '#b0a090', marginLeft: 4 }}>{allBoxes.length} кор. · {totalQty} шт</span>
      </div>
    </div>
  );
}

export default function FBOVisualView({ warehouse }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRow, setSelectedRow] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`/fbo/visual/${warehouse.id}`);
      const data = r.data.rows || [];
      setRows(data);
      if (data.length > 0 && !selectedRow) setSelectedRow(data[0].id);
    } catch {} finally { setLoading(false); }
  }, [warehouse.id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}><Spinner size="lg" /></div>;

  const activeRow = rows.find(r => r.id === selectedRow) || rows[0];

  return (
    <div>
      {/* Row tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {rows.map(r => (
          <button key={r.id} onClick={() => setSelectedRow(r.id)}
            style={{
              padding: '6px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: r.id === selectedRow ? 700 : 500, transition: 'all 0.15s',
              background: r.id === selectedRow ? '#7c3aed' : '#f3f4f6',
              color: r.id === selectedRow ? '#fff' : '#6b7280',
              boxShadow: r.id === selectedRow ? '0 2px 8px rgba(124,58,237,0.3)' : 'none',
            }}>
            {r.name} <span style={{ opacity: 0.6, marginLeft: 4 }}>{r.pallets.length}</span>
          </button>
        ))}
      </div>

      {/* Pallets */}
      {activeRow && (
        <div style={{
          display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start',
          padding: '20px 16px 28px',
          background: '#f2efe9',
          backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.03) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          borderRadius: 12, minHeight: 200,
        }}>
          {activeRow.pallets.map(p => <PalletView key={p.id} pallet={p} />)}
          {activeRow.pallets.length === 0 && (
            <div style={{ textAlign: 'center', padding: 60, color: '#bbb', fontSize: 14, width: '100%' }}>Нет паллет в этом ряду</div>
          )}
        </div>
      )}
    </div>
  );
}
