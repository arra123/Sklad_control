import { useState, useCallback, useEffect } from 'react';
import api from '../../api/client';
import Spinner from '../ui/Spinner';

const BOX_COLS = 5;

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
          position: 'absolute', bottom: 6, left: 6, right: 6, height: 38,
          background: 'white', border: '0.5px solid #d8d0c4', borderRadius: 2,
          opacity: 0.88, padding: '3px 4px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', zIndex: 2,
          boxShadow: '0 0.5px 2px rgba(0,0,0,0.06)',
        }}>
          <div style={{ fontSize: 7, fontWeight: 700, color: '#3a3020', lineHeight: 1.2,
            overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', letterSpacing: '-0.01em' }}>
            {name}
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 3 }}>
            <div style={{ display: 'flex', gap: 0.5, alignItems: 'flex-end', height: 7, flexShrink: 0 }}>{bars}</div>
            <div style={{ fontSize: 7, fontWeight: 800, color: '#6a5a40', whiteSpace: 'nowrap' }}>{qty} шт</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PalletView({ pallet }) {
  const boxes = pallet.boxes || [];
  const rows = Math.ceil(boxes.length / BOX_COLS);

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* Wood pallet + boxes */}
      <div style={{
        padding: 14,
        background: `repeating-linear-gradient(0deg, #c89838 0px, #bd8d35 18px, #7a5020 18px, #7a5020 20px, #c89838 20px)`,
        border: '3px solid #8a5c20', borderRadius: 6,
        boxShadow: '0 2px 0 #6a4818, 0 4px 0 #5a3810, 0 10px 30px rgba(0,0,0,0.2)',
        width: Math.max(BOX_COLS * 100 + (BOX_COLS - 1) * 5 + 28, 200),
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${BOX_COLS}, 1fr)`, gap: 5 }}>
          {boxes.map(box => <PalletBox key={box.id} box={box} />)}
        </div>
      </div>
      {/* Pallet name below */}
      <div style={{ marginTop: 8, textAlign: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#7a6b5a', fontFamily: 'monospace' }}>{pallet.name}</span>
        <span style={{ fontSize: 10, color: '#b0a090', marginLeft: 6 }}>{boxes.length} кор. · {boxes.reduce((s, b) => s + Number(b.quantity || 0), 0)} шт</span>
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
