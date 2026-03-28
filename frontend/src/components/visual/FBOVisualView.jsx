import { useState, useCallback, useEffect, useMemo } from 'react';
import { X, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, RotateCcw } from 'lucide-react';
import api from '../../api/client';
import Spinner from '../ui/Spinner';

const BOX_COLS = 5;
const BOX_ROWS_VISIBLE = 4;
const MAX_VISIBLE = BOX_COLS * BOX_ROWS_VISIBLE;

const PALLET_COLORS = [
  '#7c3aed', '#2563eb', '#0891b2', '#059669', '#ca8a04',
  '#dc2626', '#db2777', '#7c3aed', '#4f46e5', '#0d9488',
];

// ─── Box on pallet grid ──────────────────────────────────────────────────────
function PalletBox({ box }) {
  const name = (box.product_name || '—').replace(/GraFLab,?\s*/i, '').trim();
  const qty = box.quantity || 0;
  return (
    <div style={{ position: 'relative', cursor: 'pointer', transition: 'transform 0.15s' }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.zIndex = 5; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.zIndex = 1; }}>
      <div style={{
        aspectRatio: '1', borderRadius: 3,
        background: 'linear-gradient(145deg, #e8dbc4, #ddd0b4 40%, #d0c0a0)',
        border: '1.5px solid #b8a480', position: 'relative', overflow: 'hidden',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35), 0 1px 4px rgba(0,0,0,0.1)',
      }}>
        {/* Tape */}
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 6, transform: 'translateX(-50%)', background: 'rgba(200,180,150,0.25)' }} />
        <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 6, transform: 'translateY(-50%)', background: 'rgba(200,180,150,0.25)' }} />
        {/* Flaps */}
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '25%', borderRight: '1px solid rgba(160,140,110,0.15)' }} />
        <div style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: '25%', borderLeft: '1px solid rgba(160,140,110,0.15)' }} />
        {/* Shine */}
        <div style={{ position: 'absolute', top: 0, right: 0, width: '40%', height: '35%', background: 'linear-gradient(225deg, rgba(255,255,255,0.22), transparent 60%)', borderRadius: '0 3px 0 0', pointerEvents: 'none' }} />
        {/* Label: name + qty only */}
        <div style={{
          position: 'absolute', bottom: 3, left: 3, right: 3,
          background: 'white', border: '0.5px solid #d8d0c4', borderRadius: 1.5,
          opacity: 0.88, padding: '2px 3px', zIndex: 2,
        }}>
          <div style={{ fontSize: 6, fontWeight: 700, color: '#3a3020', lineHeight: 1.15, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{name}</div>
          <div style={{ fontSize: 6, fontWeight: 800, color: '#6a5a40', marginTop: 1 }}>{qty} шт</div>
        </div>
      </div>
    </div>
  );
}

// ─── Pallet card (mini, on floor) ────────────────────────────────────────────
function PalletView({ pallet, colorIndex, onClick }) {
  const allBoxes = pallet.boxes || [];
  const visibleBoxes = allBoxes.slice(0, MAX_VISIBLE);
  const totalQty = allBoxes.reduce((s, b) => s + Number(b.quantity || 0), 0);
  const color = PALLET_COLORS[colorIndex % PALLET_COLORS.length];

  return (
    <div onClick={onClick} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', width: 210, cursor: 'pointer',
      transition: 'transform 0.15s', }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}>
      <div style={{
        padding: 6, width: '100%', borderRadius: 5,
        background: `repeating-linear-gradient(0deg, #c89838 0px, #bd8d35 12px, #7a5020 12px, #7a5020 13.5px, #c89838 13.5px)`,
        border: '2px solid #8a5c20',
        boxShadow: '0 2px 0 #6a4818, 0 3px 0 #5a3810, 0 6px 16px rgba(0,0,0,0.15)',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${BOX_COLS}, 1fr)`, gap: 2 }}>
          {visibleBoxes.map(box => <PalletBox key={box.id} box={box} />)}
          {visibleBoxes.length < MAX_VISIBLE && visibleBoxes.length > 0 && Array.from({ length: MAX_VISIBLE - visibleBoxes.length }, (_, i) => (
            <div key={`e${i}`} style={{ aspectRatio: '1', borderRadius: 2, background: 'rgba(0,0,0,0.03)', border: '0.5px dashed rgba(0,0,0,0.06)' }} />
          ))}
        </div>
      </div>
      {/* Label below */}
      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: '#4a4a4a' }}>{pallet.name}</span>
        <span style={{ fontSize: 10, color: '#a0a0a0' }}>{allBoxes.length} кор. · {totalQty} шт</span>
      </div>
    </div>
  );
}

// ─── Side panel: 3D pallet detail ────────────────────────────────────────────
function PalletDetailPanel({ pallet, onClose }) {
  const [rotX, setRotX] = useState(50);
  const [rotY, setRotY] = useState(-25);
  const [activeLayer, setActiveLayer] = useState(null); // null = all

  const allBoxes = pallet.boxes || [];
  const totalQty = allBoxes.reduce((s, b) => s + Number(b.quantity || 0), 0);

  // Split into layers of 25 (5x5)
  const LAYER_SIZE = 25;
  const layers = useMemo(() => {
    const l = [];
    for (let i = 0; i < allBoxes.length; i += LAYER_SIZE) {
      l.push(allBoxes.slice(i, i + LAYER_SIZE));
    }
    return l.length > 0 ? l : [[]];
  }, [allBoxes]);

  const resetRotation = () => { setRotX(50); setRotY(-25); };

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: '38%', minWidth: 400, maxWidth: 550,
      background: 'white', borderLeft: '1px solid #e5e7eb', zIndex: 50,
      boxShadow: '-8px 0 30px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column',
      animation: 'slideIn 0.25s ease-out',
    }}>
      <style>{`@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>

      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: '#1c1917', margin: 0 }}>{pallet.name}</h3>
          <p style={{ fontSize: 12, color: '#a0a0a0', margin: '2px 0 0' }}>{allBoxes.length} коробок · {totalQty} шт · {layers.length} слоёв</p>
        </div>
        <button onClick={onClose} style={{ width: 32, height: 32, border: '1px solid #e5e7eb', borderRadius: 8, background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa' }}>
          <X size={16} />
        </button>
      </div>

      {/* 3D View with controls */}
      <div style={{ padding: '16px 20px', flex: '0 0 auto' }}>
        {/* Rotation controls */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 12 }}>
          <button onClick={() => setRotY(r => r - 15)} style={ctrlBtn}><ChevronLeft size={14} /></button>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <button onClick={() => setRotX(r => r + 10)} style={ctrlBtn}><ChevronUp size={14} /></button>
            <button onClick={() => setRotX(r => r - 10)} style={ctrlBtn}><ChevronDown size={14} /></button>
          </div>
          <button onClick={() => setRotY(r => r + 15)} style={ctrlBtn}><ChevronRight size={14} /></button>
          <button onClick={resetRotation} style={{ ...ctrlBtn, marginLeft: 8 }}><RotateCcw size={12} /></button>
        </div>

        {/* 3D Pallet - isometric with real box faces */}
        <div style={{ display: 'flex', justifyContent: 'center', perspective: 1000 }}>
          <div style={{
            transform: `rotateX(${rotX}deg) rotateY(${rotY}deg)`,
            transformStyle: 'preserve-3d', transition: 'transform 0.4s ease',
          }}>
            {layers.map((layer, li) => {
              const isActive = activeLayer === null || activeLayer === li;
              const isAboveActive = activeLayer !== null && li > activeLayer;
              const BOX_W = 36, BOX_H = 36, GAP = 2;
              const gridW = BOX_COLS * (BOX_W + GAP);
              const layerRows = Math.ceil(layer.length / BOX_COLS);
              return (
                <div key={li} style={{
                  opacity: isActive ? 1 : 0.1, transition: 'opacity 0.3s',
                  display: isAboveActive ? 'none' : 'block',
                  transformStyle: 'preserve-3d',
                  marginBottom: 2,
                }}>
                  {li > 0 && (
                    <div style={{ width: gridW, height: 4, margin: '0 auto 2px',
                      background: 'repeating-linear-gradient(90deg, #c8a050 0, #b08838 5px, #c8a050 6px)', opacity: 0.5, borderRadius: 1 }} />
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${BOX_COLS}, ${BOX_W}px)`, gap: GAP, justifyContent: 'center' }}>
                    {layer.map(box => (
                      <div key={box.id} style={{ width: BOX_W, height: BOX_H, position: 'relative', transformStyle: 'preserve-3d' }}>
                        {/* Top face */}
                        <div style={{
                          position: 'absolute', width: BOX_W, height: BOX_H,
                          background: 'linear-gradient(135deg, #e8dbc4, #d8c8a8)',
                          border: '1px solid #b8a480', borderRadius: 1,
                          transform: `translateZ(${BOX_H/2}px)`,
                        }}>
                          <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 4, transform: 'translateX(-50%)', background: 'rgba(190,170,140,0.2)' }} />
                          <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 4, transform: 'translateY(-50%)', background: 'rgba(190,170,140,0.2)' }} />
                        </div>
                        {/* Front face */}
                        <div style={{
                          position: 'absolute', width: BOX_W, height: BOX_H/2,
                          background: 'linear-gradient(180deg, #d4be98, #c4aa80)',
                          border: '1px solid #b8a480', borderTop: 'none', borderRadius: '0 0 1px 1px',
                          transform: `rotateX(-90deg) translateZ(${BOX_H/2}px)`,
                          transformOrigin: 'top center',
                        }} />
                        {/* Right face */}
                        <div style={{
                          position: 'absolute', width: BOX_H/2, height: BOX_H,
                          background: 'linear-gradient(180deg, #cbb890, #baa878)',
                          border: '1px solid #b8a480', borderLeft: 'none', borderRadius: '0 1px 1px 0',
                          transform: `rotateY(90deg) translateZ(${BOX_W - BOX_H/4}px)`,
                          transformOrigin: 'left center',
                        }} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {/* Wood base */}
            <div style={{ width: BOX_COLS * (36 + 2), height: 8, margin: '4px auto 0',
              background: 'repeating-linear-gradient(90deg, #c89838 0, #bd8d35 8px, #7a5020 8px, #7a5020 9.5px, #c89838 9.5px)',
              border: '2px solid #8a5c20', borderRadius: '0 0 3px 3px',
              transformStyle: 'preserve-3d',
            }} />
          </div>
        </div>

        {/* Layer slicer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 12 }}>
          <span style={{ fontSize: 10, color: '#aaa', marginRight: 4 }}>Слой:</span>
          {layers.map((_, i) => (
            <button key={i} onClick={() => setActiveLayer(activeLayer === i ? null : i)}
              style={{
                padding: '3px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: activeLayer === i ? 700 : 500,
                background: activeLayer === i ? '#7c3aed' : '#f3f4f6',
                color: activeLayer === i ? '#fff' : '#888',
              }}>
              {i + 1}
            </button>
          ))}
          <button onClick={() => setActiveLayer(null)}
            style={{
              padding: '3px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontSize: 11, fontWeight: activeLayer === null ? 700 : 500,
              background: activeLayer === null ? '#7c3aed' : '#f3f4f6',
              color: activeLayer === null ? '#fff' : '#888',
            }}>Все</button>
        </div>
      </div>

      {/* Boxes list */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', borderTop: '1px solid #f0f0f0' }}>
        <div style={{ padding: '10px 20px', background: '#fafafa' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#888', margin: 0 }}>
            {activeLayer !== null ? `Слой ${activeLayer + 1} — ${layers[activeLayer]?.length || 0} коробок` : `Все коробки — ${allBoxes.length}`}
          </p>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px' }}>
          {(activeLayer !== null ? layers[activeLayer] || [] : allBoxes).map((box, i) => {
            const name = (box.product_name || '—').replace(/GraFLab,?\s*/i, '').trim();
            return (
              <div key={box.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', margin: '3px 0',
                borderRadius: 10, background: '#fff', border: '1px solid #f0f0f0', cursor: 'pointer',
                transition: 'background 0.1s',
              }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f5f3ff'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}>
                {/* Mini box icon */}
                <div style={{ width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                  background: 'linear-gradient(145deg, #e8dbc4, #d0c0a0)', border: '1px solid #b8a480',
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 8, fontWeight: 900, color: '#8a7050' }}>{i + 1}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#1c1917', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</p>
                  <p style={{ fontSize: 9, color: '#bbb', margin: '1px 0 0', fontFamily: 'monospace' }}>{box.barcode_value || '—'}</p>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#555', flexShrink: 0 }}>{box.quantity} шт</span>
                <ChevronRight size={14} style={{ color: '#ddd', flexShrink: 0 }} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const ctrlBtn = {
  width: 28, height: 28, borderRadius: 6, border: '1px solid #e5e7eb',
  background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: '#666', fontSize: 12, padding: 0,
};

// ─── Main ────────────────────────────────────────────────────────────────────
export default function FBOVisualView({ warehouse }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRow, setSelectedRow] = useState(null);
  const [detailPallet, setDetailPallet] = useState(null);

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
          <button key={r.id} onClick={() => { setSelectedRow(r.id); setDetailPallet(null); }}
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
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start', minHeight: 200 }}>
          {activeRow.pallets.map((p, i) => (
            <PalletView key={p.id} pallet={p} colorIndex={i} onClick={() => setDetailPallet(p)} />
          ))}
          {activeRow.pallets.length === 0 && (
            <div style={{ textAlign: 'center', padding: 60, color: '#bbb', fontSize: 14, width: '100%' }}>Нет паллет</div>
          )}
        </div>
      )}

      {/* Detail panel */}
      {detailPallet && (
        <>
          <div onClick={() => setDetailPallet(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.15)', zIndex: 49 }} />
          <PalletDetailPanel pallet={detailPallet} onClose={() => setDetailPallet(null)} />
        </>
      )}
    </div>
  );
}
