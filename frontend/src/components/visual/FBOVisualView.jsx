import { useState, useCallback, useRef, useEffect } from 'react';
import { ChevronRight, RotateCcw, Clock } from 'lucide-react';
import api from '../../api/client';
import { qty } from '../../utils/fmt';
import Spinner from '../ui/Spinner';

const FONT = '"Helvetica Neue", Arial, sans-serif';

// ─── Colors (same as PalletWarehouseView, but keyed by product_id) ─────────────
const COLORS = [
  '#c07830','#1e7ea0','#6a48b0','#3f8050',
  '#a03860','#706020','#286090','#7a4090',
];
const boxColor = (productId) => COLORS[(productId || 0) % COLORS.length];

function ph(hex)      { return [parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)]; }
function lighten(h,a) { const [r,g,b]=ph(h); return `rgb(${Math.round(r+(255-r)*a)},${Math.round(g+(255-g)*a)},${Math.round(b+(255-b)*a)})`; }
function darken(h,a)  { const [r,g,b]=ph(h); return `rgb(${Math.round(r*(1-a))},${Math.round(g*(1-a))},${Math.round(b*(1-a))})`; }

// ─── Mini box on pallet floor ─────────────────────────────────────────────────
function MiniBox({ box, isDragging, onPointerDown }) {
  const [hov, setHov] = useState(false);
  const c = boxColor(box.product_id);
  return (
    <div data-box-id={box.id}
      onPointerDown={e => { e.stopPropagation(); onPointerDown(e); }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ borderRadius:2, cursor:'grab', position:'relative', overflow:'hidden',
        opacity:isDragging?0.15:1, transition:'opacity .1s, transform .07s',
        transform:hov&&!isDragging?'scale(1.12)':'scale(1)',
        background:`linear-gradient(135deg,${lighten(c,.22)},${c})`,
        border:`1px solid ${darken(c,.18)}`,
        boxShadow:`inset 0 1px 0 rgba(255,255,255,.3), inset 0 -1px 0 rgba(0,0,0,.12)` }}>
      <div style={{ position:'absolute', top:0, left:0, right:0, height:'28%',
        background:'rgba(255,255,255,.18)', pointerEvents:'none' }} />
    </div>
  );
}

// ─── Pallet floor cell ────────────────────────────────────────────────────────
const BOX_COLS = 4, BOX_ROWS = 3, MAX_BOXES = 12;

function FloorPallet({ pallet, selected, isDragOver, canDrop, dragBoxId, onBoxPointerDown, onPalletPointerDown, onClick }) {
  const [hov, setHov] = useState(false);
  const fill = pallet.boxes.length;
  const bc = selected?'#4f46e5':isDragOver&&canDrop?'#16a34a':isDragOver?'#ef4444':null;
  return (
    <div data-pallet-id={pallet.id} onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display:'inline-flex', flexDirection:'column', alignItems:'center', cursor:'pointer',
        outline:bc?`3px solid ${bc}`:'none', outlineOffset:4, borderRadius:6,
        transform:hov&&!selected?'translateY(-4px)':'none',
        transition:'transform .14s, outline .08s',
        filter:selected?'drop-shadow(0 8px 18px rgba(79,70,229,.28))':hov?'drop-shadow(0 5px 14px rgba(0,0,0,.2))':'drop-shadow(0 2px 7px rgba(0,0,0,.12))' }}>
      {/* Code label / drag handle */}
      <div data-pallet-header-id={pallet.id}
        onPointerDown={e => { e.stopPropagation(); onPalletPointerDown(e, pallet); }}
        style={{ fontSize:9.5, fontWeight:900, fontFamily:'monospace',
          color:selected?'#4f46e5':'#7a6b5a', marginBottom:5, cursor:'grab',
          userSelect:'none', letterSpacing:'.04em' }}>
        {pallet.name}
      </div>

      {/* Pallet 3D */}
      <div style={{ perspective:360, perspectiveOrigin:'50% -20%' }}>
        <div style={{ transform:'rotateX(32deg)', transformStyle:'preserve-3d', transformOrigin:'bottom center' }}>
          {/* Top deck */}
          <div style={{ width:130, position:'relative', borderRadius:'3px 3px 0 0',
            background:'repeating-linear-gradient(90deg,#c89838 0px,#bd8d35 12px,#7a5020 12px,#7a5020 13.5px,#c89838 13.5px)',
            border:'2px solid #8a5c20', borderBottom:'none',
            padding:'5px 5px 4px', boxShadow:'inset 0 2px 0 rgba(255,255,255,.2)' }}>
            {[.33,.66].map(p =>
              <div key={p} style={{ position:'absolute',top:4,bottom:3,left:`${p*100}%`,width:1,
                background:'rgba(0,0,0,.16)',pointerEvents:'none',zIndex:2 }}/>
            )}
            {/* Box grid 4×3 */}
            <div style={{ display:'grid', gridTemplateColumns:`repeat(${BOX_COLS},1fr)`,
              gridTemplateRows:`repeat(${BOX_ROWS},1fr)`,
              gap:2.5, width:118, height:74, position:'relative', zIndex:3 }}>
              {Array.from({length:MAX_BOXES},(_,i) => {
                const box = pallet.boxes[i];
                return box ? (
                  <MiniBox key={box.id} box={box} isDragging={dragBoxId===box.id}
                    onPointerDown={e => onBoxPointerDown(e, box, pallet)} />
                ) : (
                  <div key={`e${i}`} style={{ borderRadius:2, background:'rgba(0,0,0,.055)', border:'0.5px dashed rgba(0,0,0,.1)' }} />
                );
              })}
            </div>
          </div>
          {/* Stringers */}
          <div style={{ width:130, height:17, display:'flex', border:'2px solid #7a5020', borderTop:'none', borderBottom:'none' }}>
            <div style={{ flex:1.3, background:'linear-gradient(180deg,#9a7028,#7a5018)' }}/>
            <div style={{ flex:2.2, background:'#c8b898', borderLeft:'2px solid #a08040', borderRight:'2px solid #a08040', boxShadow:'inset 0 4px 6px rgba(0,0,0,.16)' }}/>
            <div style={{ flex:1, background:'linear-gradient(180deg,#9a7028,#7a5018)' }}/>
            <div style={{ flex:2.2, background:'#c8b898', borderLeft:'2px solid #a08040', borderRight:'2px solid #a08040', boxShadow:'inset 0 4px 6px rgba(0,0,0,.16)' }}/>
            <div style={{ flex:1.3, background:'linear-gradient(180deg,#9a7028,#7a5018)' }}/>
          </div>
          {/* Bottom deck */}
          <div style={{ width:130, height:10, overflow:'hidden',
            background:'repeating-linear-gradient(90deg,#907028 0px,#887028 12px,#6a4818 12px,#6a4818 13.5px,#907028 13.5px)',
            border:'2px solid #6a4818', borderTop:'none', borderRadius:'0 0 3px 3px',
            boxShadow:'0 6px 16px rgba(0,0,0,.22)' }}/>
        </div>
      </div>
      {/* Fill bar */}
      <div style={{ width:130, marginTop:7 }}>
        <div style={{ height:3.5, background:'#ddd8d0', borderRadius:3, overflow:'hidden' }}>
          <div style={{ height:'100%', width:`${(fill/MAX_BOXES)*100}%`, borderRadius:3, transition:'width .3s',
            background:fill/MAX_BOXES>.8?'#16a34a':fill/MAX_BOXES>.4?'#ca8a04':'#94a3b8' }}/>
        </div>
        <div style={{ fontSize:8, fontFamily:'monospace', color:'#bbb', textAlign:'center', marginTop:3 }}>
          {fill}/{MAX_BOXES}
        </div>
      </div>
    </div>
  );
}

// ─── Data helpers ─────────────────────────────────────────────────────────────
function applyFBOMove(rows, boxId, toPalletId) {
  let movedBox = null;
  const step1 = rows.map(row => ({
    ...row,
    pallets: row.pallets.map(p => {
      const b = p.boxes.find(x => x.id === boxId);
      if (b) movedBox = b;
      return { ...p, boxes: p.boxes.filter(x => x.id !== boxId) };
    }),
  }));
  if (!movedBox) return rows;
  return step1.map(row => ({
    ...row,
    pallets: row.pallets.map(p => {
      if (p.id !== toPalletId) return p;
      return { ...p, boxes: [...p.boxes, movedBox] };
    }),
  }));
}

function fmtDate(iso) {
  return new Date(iso).toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
}

// ─── Main ──────────────────────────────────────────────────────────────────────
export default function FBOVisualView({ warehouse, onClose }) {
  const [originalRows, setOriginalRows] = useState([]);
  const [draftRows,    setDraftRows]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [pending,      setPending]      = useState([]);
  const [history,      setHistory]      = useState([]);
  const [saving,       setSaving]       = useState(false);
  const [drag,         setDrag]         = useState(null);
  const [selected,     setSelected]     = useState(null);
  const [showHistory,  setShowHistory]  = useState(false);
  const dropRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`/fbo/visual/${warehouse.id}`);
      setOriginalRows(r.data.rows || []);
      setDraftRows(r.data.rows || []);
      setPending([]);
    } catch {} finally { setLoading(false); }
  }, [warehouse.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (selected) setSelected(draftRows.flatMap(r=>r.pallets).find(p=>p.id===selected.id)||null);
  }, [draftRows]);

  // ── Drag ──────────────────────────────────────────────────────────────────
  const startBoxDrag = useCallback((e, box, pallet) => {
    e.preventDefault();
    setDrag({ mode:'box', boxId:box.id, box, fromPalletId:pallet.id, fromPalletName:pallet.name,
      ghostX:e.clientX, ghostY:e.clientY, targetPalletId:null });
  }, []);

  useEffect(() => {
    if (!drag) return;
    const onMove = e => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const pel = el?.closest('[data-pallet-id]');
      const tgt = pel ? +pel.dataset.palletId : null;
      dropRef.current = tgt;
      setDrag(d => d ? { ...d, ghostX:e.clientX, ghostY:e.clientY, targetPalletId:tgt } : null);
    };
    const onUp = () => {
      const toId = dropRef.current;
      if (toId && toId !== drag.fromPalletId) {
        const toPallet = draftRows.flatMap(r=>r.pallets).find(p=>p.id===toId);
        if (toPallet && toPallet.boxes.length < MAX_BOXES) {
          setDraftRows(prev => applyFBOMove(prev, drag.boxId, toId));
          setPending(prev => [...prev, {
            box_id: drag.boxId, box_barcode: drag.box.barcode_value,
            product_name: drag.box.product_name,
            from_pallet_id: drag.fromPalletId, from_pallet_name: drag.fromPalletName,
            to_pallet_id: toId, to_pallet_name: toPallet.name,
          }]);
        }
      }
      setDrag(null); dropRef.current=null; document.body.style.cursor='';
    };
    document.body.style.cursor='grabbing';
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => { window.removeEventListener('pointermove',onMove); window.removeEventListener('pointerup',onUp); document.body.style.cursor=''; };
  }, [drag?.boxId, drag?.fromPalletId, draftRows]);

  // ── Save / cancel ─────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    try {
      for (const m of pending) {
        await api.post('/fbo/visual/move', { box_id: m.box_id, to_pallet_id: m.to_pallet_id });
      }
      setHistory(prev => [{ id:Date.now(), savedAt:new Date().toISOString(), moves:[...pending] }, ...prev]);
      setPending([]);
      await load();
    } catch (err) {
      alert('Ошибка: ' + (err.response?.data?.error || err.message));
    } finally { setSaving(false); }
  };

  const handleCancel = () => { setDraftRows(originalRows); setPending([]); };

  const handleUndo = async (entry) => {
    setSaving(true);
    try {
      for (const m of [...entry.moves].reverse()) {
        await api.post('/fbo/visual/move', { box_id: m.box_id, to_pallet_id: m.from_pallet_id });
      }
      setHistory(prev => prev.filter(h => h.id !== entry.id));
      await load();
    } catch (err) {
      alert('Ошибка отката: ' + (err.response?.data?.error || err.message));
    } finally { setSaving(false); }
  };

  if (loading) return <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:280 }}><Spinner size="lg" /></div>;

  const tgtPallet = drag?.targetPalletId ? draftRows.flatMap(r=>r.pallets).find(p=>p.id===drag.targetPalletId) : null;
  const canDrop   = tgtPallet && tgtPallet.boxes.length < MAX_BOXES;

  return (
    <div>
      {/* ── Pending bar ── */}
      {pending.length > 0 && (
        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 16px', marginBottom:14,
          background:'#fffbeb', border:'1.5px solid #fbbf24', borderRadius:10,
          boxShadow:'0 2px 8px rgba(251,191,36,.18)', flexWrap:'wrap' }}>
          <div style={{ flex:1, fontSize:13, fontWeight:600, color:'#92400e', minWidth:140 }}>
            {pending.length} {pending.length===1?'несохранённое перемещение':'несохранённых перемещений'}
          </div>
          <button onClick={handleCancel}
            style={{ padding:'5px 14px', borderRadius:7, border:'1px solid #e5e7eb', background:'#fff',
              fontSize:13, fontWeight:600, color:'#6b7280', cursor:'pointer' }}>
            Отмена
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ padding:'5px 20px', borderRadius:7, border:'none', background:'#16a34a',
              fontSize:13, fontWeight:700, color:'#fff', cursor:saving?'wait':'pointer', opacity:saving?.7:1 }}>
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      )}

      {/* ── Pending list ── */}
      {pending.length > 0 && (
        <div style={{ marginBottom:14, background:'#f9f7f4', border:'1px solid #e8e3dc',
          borderRadius:8, padding:'8px 12px', display:'flex', flexDirection:'column', gap:5 }}>
          {pending.map((m,i) => (
            <div key={i} style={{ fontSize:11, display:'flex', alignItems:'center', gap:7, color:'#6b7280' }}>
              <span style={{ fontWeight:700, color:'#1c1917', flex:1, minWidth:0,
                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {m.product_name || m.box_barcode}
              </span>
              <span style={{ fontFamily:'monospace', color:'#ef4444', flexShrink:0 }}>{m.from_pallet_name}</span>
              <span style={{ color:'#bbb' }}>→</span>
              <span style={{ fontFamily:'monospace', color:'#16a34a', flexShrink:0 }}>{m.to_pallet_name}</span>
            </div>
          ))}
        </div>
      )}

      <p style={{ fontSize:11, color:'#bbb', textAlign:'center', marginBottom:16 }}>
        Перетащите коробку на другой паллет — кнопка «Сохранить» появится сверху
      </p>

      {/* ── Floor + Side Panel layout ── */}
      <div style={{ display:'flex', gap:16 }}>
        {/* Floor: rows → pallets */}
        <div style={{ flex:selected?'1 1 0':'1 1 auto', minWidth:0, transition:'flex .3s',
          background:'#f2efe9',
          backgroundImage:'radial-gradient(circle,rgba(0,0,0,.04) 1px,transparent 1px)',
          backgroundSize:'28px 28px', borderRadius:12, padding:'24px 24px 32px', overflowX:'auto' }}>
          {draftRows.length === 0 && (
            <div style={{ textAlign:'center', padding:60, color:'#bbb', fontSize:14 }}>Нет рядов/паллет</div>
          )}
          {draftRows.map((row, ri) => (
            <div key={row.id} style={{ display:'flex', alignItems:'flex-start', gap:0, marginBottom:40 }}>
              {/* Row label */}
              <div style={{ width:52, flexShrink:0, paddingRight:12, textAlign:'right', paddingTop:14 }}>
                <span style={{ fontSize:9.5, fontWeight:800, fontFamily:'monospace', color:'#bbb', textTransform:'uppercase', letterSpacing:'.08em' }}>
                  {row.name}
                </span>
              </div>
              <div style={{ width:2, alignSelf:'stretch', background:'rgba(0,0,0,.06)', borderRadius:2, marginRight:20, marginTop:10 }}/>
              {/* Pallets */}
              <div style={{ display:'flex', gap:22, flexWrap:'wrap' }}>
                {row.pallets.map(p => (
                  <FloorPallet key={p.id} pallet={p}
                    selected={selected?.id === p.id}
                    isDragOver={drag?.targetPalletId === p.id}
                    canDrop={p.boxes.length < MAX_BOXES}
                    dragBoxId={drag?.mode==='box' ? drag.boxId : null}
                    onBoxPointerDown={startBoxDrag}
                    onPalletPointerDown={() => {}}
                    onClick={() => { if (drag) return; setSelected(s=>s?.id===p.id?null:p); }}
                  />
                ))}
                {row.pallets.length === 0 && (
                  <div style={{ fontSize:12, color:'#bbb', paddingTop:20 }}>Нет паллет</div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* ── Side panel for selected pallet ── */}
        {selected && (
          <div style={{ width:320, flexShrink:0, background:'#faf9f7', border:'1px solid #ece8e2',
            borderRadius:12, overflow:'hidden', alignSelf:'flex-start', position:'sticky', top:80,
            boxShadow:'0 4px 20px rgba(0,0,0,.08)', transition:'all .3s' }}>
            {/* Header */}
            <div style={{ padding:'14px 16px', borderBottom:'1px solid #ece8e2', background:'#fff' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                <span style={{ fontSize:18, fontWeight:900, color:'#1c1917', fontFamily:'monospace' }}>{selected.name}</span>
                <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:99, border:'1px solid currentColor', marginLeft:'auto',
                  color:selected.boxes.length===0?'#bbb':selected.boxes.length>=MAX_BOXES?'#16a34a':'#ca8a04',
                  background:selected.boxes.length===0?'#f9f9f9':selected.boxes.length>=MAX_BOXES?'#f0fdf4':'#fefce8' }}>
                  {selected.boxes.length}/{MAX_BOXES}
                </span>
                <button onClick={() => setSelected(null)}
                  style={{ width:28,height:28,background:'transparent',border:'1px solid #e5e0d8',
                    borderRadius:6,color:'#bbb',cursor:'pointer',fontSize:16,lineHeight:1,
                    display:'flex',alignItems:'center',justifyContent:'center' }}>×</button>
              </div>
              {selected.barcode_value && (
                <span style={{ fontSize:10, color:'#a09080', background:'#f5f0e8', padding:'2px 8px',
                  borderRadius:99, border:'1px solid #e5e0d8', fontFamily:'monospace' }}>{selected.barcode_value}</span>
              )}
              {/* Total qty */}
              <div style={{ display:'flex', gap:12, marginTop:10 }}>
                <div style={{ flex:1, background:'#f0fdf4', borderRadius:8, padding:'6px 10px', textAlign:'center' }}>
                  <p style={{ fontSize:9, color:'#16a34a', margin:0, fontWeight:600 }}>Коробок</p>
                  <p style={{ fontSize:16, fontWeight:900, color:'#15803d', margin:0 }}>{selected.boxes.length}</p>
                </div>
                <div style={{ flex:1, background:'#eff6ff', borderRadius:8, padding:'6px 10px', textAlign:'center' }}>
                  <p style={{ fontSize:9, color:'#2563eb', margin:0, fontWeight:600 }}>Штук</p>
                  <p style={{ fontSize:16, fontWeight:900, color:'#1d4ed8', margin:0 }}>
                    {selected.boxes.reduce((s, b) => s + Number(b.quantity || 0), 0)}
                  </p>
                </div>
              </div>
            </div>
            {/* Boxes list */}
            <div style={{ padding:'10px 12px', maxHeight:400, overflowY:'auto' }}>
              {selected.boxes.length > 0 ? (
                <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                  {selected.boxes.map((box,i) => (
                    <div key={box.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px',
                      borderRadius:8, background:'#fff', border:'1px solid #eee',
                      boxShadow:'0 1px 3px rgba(0,0,0,.05)', cursor:'grab' }}
                      onPointerDown={e => { e.stopPropagation(); startBoxDrag(e, box, selected); }}>
                      <div style={{ width:28,height:28,flexShrink:0,borderRadius:6,
                        background:boxColor(box.product_id),
                        display:'flex',alignItems:'center',justifyContent:'center',
                        boxShadow:'inset 0 1px 0 rgba(255,255,255,.28)' }}>
                        <span style={{ fontSize:10,fontWeight:900,fontFamily:FONT,color:'#fff' }}>{i+1}</span>
                      </div>
                      <div style={{ flex:1,minWidth:0 }}>
                        <p style={{ fontSize:12,fontWeight:700,fontFamily:FONT,color:'#1c1917',margin:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>
                          {box.product_name || '—'}
                        </p>
                        <p style={{ fontSize:9,fontFamily:'monospace',color:'#c4b9ac',margin:0 }}>{box.barcode_value}</p>
                      </div>
                      <span style={{ fontSize:12,fontFamily:FONT,fontWeight:700,color:'#555',flexShrink:0 }}>
                        {qty(box.quantity)} шт.
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding:'30px 0',textAlign:'center' }}>
                  <p style={{ fontSize:13,fontFamily:FONT,color:'#ccc',margin:0 }}>Паллет пустой</p>
                  <p style={{ fontSize:11,fontFamily:FONT,color:'#ddd',margin:'4px 0 0' }}>Перетащите коробку сюда</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Drag ghost ── */}
      {drag && (
        <div style={{ position:'fixed', left:drag.ghostX-28, top:drag.ghostY-28, width:56, height:56,
          zIndex:9999, pointerEvents:'none', borderRadius:10,
          background:canDrop?lighten(boxColor(drag.box?.product_id||0),.35):'#fee2e2',
          border:`2.5px solid ${canDrop?boxColor(drag.box?.product_id||0):'#ef4444'}`,
          boxShadow:'0 12px 30px rgba(0,0,0,.25)',
          display:'flex',alignItems:'center',justifyContent:'center' }}>
          <div style={{ width:34,height:34,borderRadius:5,background:boxColor(drag.box?.product_id||0),
            boxShadow:'inset 0 1px 0 rgba(255,255,255,.3)' }}/>
          {!canDrop && drag.targetPalletId && (
            <div style={{ position:'absolute',top:-22,left:'50%',transform:'translateX(-50%)',
              whiteSpace:'nowrap',fontSize:9,fontWeight:700,color:'#ef4444',
              background:'#fff',padding:'2px 7px',borderRadius:6,border:'1px solid #fca5a5' }}>
              Заполнен
            </div>
          )}
        </div>
      )}

      {/* ── History ── */}
      {history.length > 0 && (
        <div style={{ marginTop:28 }}>
          <button onClick={() => setShowHistory(h=>!h)}
            style={{ display:'flex',alignItems:'center',gap:6,fontSize:12,fontWeight:700,
              color:'#6b7280',background:'none',border:'none',cursor:'pointer',padding:'0 0 8px' }}>
            <Clock size={14} />
            История перемещений ({history.length})
            <ChevronRight size={13} style={{ transform:showHistory?'rotate(90deg)':'none',transition:'transform .15s' }}/>
          </button>
          {showHistory && (
            <div style={{ background:'#f9f7f4',border:'1px solid #e8e3dc',borderRadius:10,overflow:'hidden' }}>
              {history.map((entry,hi) => (
                <div key={entry.id} style={{ padding:'10px 14px',
                  borderBottom:hi<history.length-1?'1px solid #e8e3dc':'none',
                  display:'flex',alignItems:'flex-start',gap:10 }}>
                  <div style={{ flex:1,minWidth:0 }}>
                    <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:4 }}>
                      <span style={{ fontSize:11,fontWeight:700,color:'#1c1917' }}>{fmtDate(entry.savedAt)}</span>
                      <span style={{ fontSize:10,color:'#bbb' }}>· {entry.moves.length} перемещений</span>
                    </div>
                    {entry.moves.map((m,mi) => (
                      <div key={mi} style={{ fontSize:10,color:'#9b8fa0',display:'flex',gap:5,alignItems:'center' }}>
                        <span style={{ overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:180 }}>
                          {m.product_name || m.box_barcode}
                        </span>
                        <span style={{ fontFamily:'monospace',color:'#ef9999',flexShrink:0 }}>{m.from_pallet_name}</span>
                        <span>→</span>
                        <span style={{ fontFamily:'monospace',color:'#86c068',flexShrink:0 }}>{m.to_pallet_name}</span>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => handleUndo(entry)} disabled={saving}
                    style={{ display:'flex',alignItems:'center',gap:4,padding:'4px 10px',
                      borderRadius:6,border:'1px solid #e5e7eb',background:'#fff',
                      fontSize:11,fontWeight:600,color:'#6b7280',
                      cursor:saving?'wait':'pointer',flexShrink:0,whiteSpace:'nowrap' }}>
                    <RotateCcw size={11} /> Откатить
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
