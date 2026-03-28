import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import api from '../../api/client';
import Spinner from '../ui/Spinner';
import { useToast } from '../ui/Toast';

// ─── Constants ───────────────────────────────────────────────────────────────
const BOX_W = 1.05, BOX_D = 1.05, BOX_H = 0.9;
const COLS = 5, LAYER_SIZE = 25;
const PALLET_SPACING = 8, ROW_SPACING = 10;

// ─── Shared geometries (reuse = huge perf win) ──────────────────────────────
let _sharedGeo = null;
function getSharedGeo() {
  if (_sharedGeo) return _sharedGeo;
  _sharedGeo = {
    box: new THREE.BoxGeometry(BOX_W, BOX_H, BOX_D),
    tapeV: new THREE.BoxGeometry(0.06, BOX_H * 0.98, BOX_D * 0.98),
    tapeH: new THREE.BoxGeometry(BOX_W * 0.98, BOX_H * 0.98, 0.06),
    plank: new THREE.BoxGeometry(6, 0.15, 0.8),
    stringer: new THREE.BoxGeometry(0.6, 0.35, 5.6),
    bottomPlank: new THREE.BoxGeometry(0.8, 0.12, 5.6),
    board: new THREE.BoxGeometry(5.8, 0.06, 5.8),
    label: new THREE.PlaneGeometry(0.55, 0.3),
    namePlane: new THREE.PlaneGeometry(5, 1.25),
  };
  return _sharedGeo;
}

// ─── Box top texture (tape cross + flap lines) ──────────────────────────────
let _boxTopTex = null;
function getBoxTopTexture() {
  if (_boxTopTex) return _boxTopTex;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  // Base kraft color
  ctx.fillStyle = '#e8dbc4';
  ctx.fillRect(0, 0, 128, 128);
  // Tape vertical
  ctx.fillStyle = 'rgba(200,185,155,0.35)';
  ctx.fillRect(58, 0, 12, 128);
  // Tape horizontal
  ctx.fillRect(0, 58, 128, 12);
  // Flap lines
  ctx.strokeStyle = 'rgba(170,150,120,0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(32, 0); ctx.lineTo(32, 128); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(96, 0); ctx.lineTo(96, 128); ctx.stroke();
  // Corner shine
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.beginPath(); ctx.moveTo(128, 0); ctx.lineTo(128, 50); ctx.lineTo(78, 0); ctx.fill();
  _boxTopTex = new THREE.CanvasTexture(c);
  return _boxTopTex;
}

// ─── Box front texture (label with name, qty, barcode) ───────────────────────
function makeBoxFrontTexture(name, qty, barcode) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  // Kraft side
  ctx.fillStyle = '#d8c8a8';
  ctx.fillRect(0, 0, 128, 128);
  // Tape down middle
  ctx.fillStyle = 'rgba(200,185,155,0.3)';
  ctx.fillRect(58, 0, 12, 128);
  // White label
  ctx.fillStyle = 'white';
  ctx.shadowColor = 'rgba(0,0,0,0.06)';
  ctx.shadowBlur = 2;
  ctx.fillRect(12, 30, 104, 70);
  ctx.shadowBlur = 0;
  // Name
  ctx.fillStyle = '#3a3020';
  ctx.font = 'bold 13px Arial';
  const short = name.length > 18 ? name.slice(0, 17) + '…' : name;
  ctx.fillText(short, 16, 50);
  // Qty
  ctx.font = 'bold 12px Arial';
  ctx.fillStyle = '#7a6a50';
  ctx.fillText(qty + ' шт', 16, 68);
  // Barcode
  const bc = String(barcode || '').slice(0, 10);
  for (let i = 0; i < 18; i++) {
    const h = 6 + ((bc.charCodeAt(i % bc.length) || 5) % 6) * 1.5;
    ctx.fillStyle = `rgba(50,40,20,${0.4 + (i % 3) * 0.15})`;
    ctx.fillRect(16 + i * 5, 100 - h, 2.5, h);
  }
  return new THREE.CanvasTexture(c);
}

// ─── Box side texture (kraft with tape) ──────────────────────────────────────
let _boxSideTex = null;
function getBoxSideTexture() {
  if (_boxSideTex) return _boxSideTex;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ddd0b4';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = 'rgba(200,185,155,0.25)';
  ctx.fillRect(28, 0, 8, 64);
  _boxSideTex = new THREE.CanvasTexture(c);
  return _boxSideTex;
}

// ─── Pallet name label ───────────────────────────────────────────────────────
function makePalletLabel(name, count, qty) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const ctx = c.getContext('2d');
  // Background
  ctx.fillStyle = '#7c3aed';
  ctx.beginPath();
  ctx.roundRect(0, 0, 512, 128, 16);
  ctx.fill();
  // Name
  ctx.fillStyle = 'white';
  ctx.font = 'bold 48px Arial';
  ctx.fillText(name, 24, 55);
  // Stats
  ctx.font = '32px Arial';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(`${count} коробок · ${qty} шт`, 24, 100);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

// ─── Build pallet ────────────────────────────────────────────────────────────
function buildPallet(palletData, mats, geo, offsetX, offsetZ) {
  const group = new THREE.Group();
  group.position.set(offsetX, 0, offsetZ);

  const boxes = palletData.boxes || [];
  const totalQty = boxes.reduce((s, b) => s + Number(b.quantity || 0), 0);

  // Wood base (5 planks + 3 stringers + 3 bottom)
  for (let i = 0; i < 5; i++) {
    const p = new THREE.Mesh(geo.plank, mats.wood);
    p.position.set(0, 0.35, -2.4 + i * 1.2);
    p.castShadow = true;
    group.add(p);
  }
  for (let i = -1; i <= 1; i++) {
    const s = new THREE.Mesh(geo.stringer, mats.woodDark);
    s.position.set(i * 2.2, 0.175, 0);
    group.add(s);
  }
  for (let x = -1; x <= 1; x++) {
    const bp = new THREE.Mesh(geo.bottomPlank, mats.wood);
    bp.position.set(x * 2.2, 0.06, 0);
    group.add(bp);
  }

  // Name label
  const labelTex = makePalletLabel(palletData.name, boxes.length, totalQty);
  const nameMesh = new THREE.Mesh(geo.namePlane, new THREE.MeshBasicMaterial({ map: labelTex, transparent: true }));
  nameMesh.position.set(0, 0.01, 3.5);
  nameMesh.rotation.x = -Math.PI / 2;
  group.add(nameMesh);

  // Boxes
  const boxMeshes = [];
  const layers = Math.ceil(boxes.length / LAYER_SIZE);
  for (let li = 0; li < layers; li++) {
    if (li > 0) {
      const bd = new THREE.Mesh(geo.board, mats.boardSep);
      bd.position.y = 0.42 + li * (BOX_H + 0.08) - 0.04;
      group.add(bd);
    }
    const layerBoxes = boxes.slice(li * LAYER_SIZE, (li + 1) * LAYER_SIZE);
    const baseY = 0.42 + li * (BOX_H + 0.08);

    layerBoxes.forEach((box, idx) => {
      const row = Math.floor(idx / COLS), col = idx % COLS;
      const bGroup = new THREE.Group();

      const bName = (box.product_name || '—').replace(/GraFLab,?\s*/i, '').trim();
      const frontTex = makeBoxFrontTexture(bName, box.quantity || 0, box.barcode_value);
      const topTex = getBoxTopTexture();
      const sideTex = getBoxSideTexture();

      // 6 faces: +X, -X, +Y (top), -Y, +Z (front), -Z
      const faceMats = [
        new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.55 }),
        new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.55 }),
        new THREE.MeshStandardMaterial({ map: topTex, roughness: 0.45 }),
        mats.boxSide,
        new THREE.MeshStandardMaterial({ map: frontTex, roughness: 0.4 }),
        new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.55 }),
      ];
      const mesh = new THREE.Mesh(geo.box, faceMats);
      mesh.castShadow = true;
      bGroup.add(mesh);

      const x = (col - 2) * (BOX_W + 0.05);
      const z = (row - 2) * (BOX_D + 0.05);
      bGroup.position.set(x, baseY + BOX_H / 2, z);

      bGroup.userData = {
        type: 'box', product: bName, qty: box.quantity || 0,
        barcode: box.barcode_value || '—', boxId: box.id,
        palletId: palletData.id, palletName: palletData.name,
      };

      group.add(bGroup);
      boxMeshes.push(bGroup);
    });
  }

  group.userData = { type: 'pallet', boxMeshes, palletInfo: palletData };
  return group;
}

// ─── Info Panel (React overlay, left side) ───────────────────────────────────
function InfoPanel({ data, onClose, onNavigate, onStartMove }) {
  if (!data) return null;
  const isBox = data.type === 'box';
  return (
    <div style={{
      position: 'absolute', top: 16, left: 16, width: 260, zIndex: 20,
      background: 'white', borderRadius: 16, padding: '16px 18px',
      boxShadow: '0 8px 30px rgba(0,0,0,0.12)', fontFamily: 'Inter,Arial,sans-serif',
      animation: 'fadeIn 0.15s ease-out',
    }}>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}`}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <p style={{ fontSize: 9, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
            {isBox ? 'Коробка' : 'Паллет'}
          </p>
          <h4 style={{ fontSize: 15, fontWeight: 800, color: '#1c1917', margin: '4px 0 0' }}>
            {isBox ? data.product : data.palletName}
          </h4>
        </div>
        <button onClick={onClose} style={{ width: 24, height: 24, border: '1px solid #eee', borderRadius: 6, background: 'white', cursor: 'pointer', fontSize: 14, color: '#bbb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
      </div>
      {isBox && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <div style={{ flex: 1, background: '#f5f3ff', borderRadius: 8, padding: '6px 10px' }}>
              <p style={{ fontSize: 9, color: '#7c3aed', margin: 0, fontWeight: 600 }}>Кол-во</p>
              <p style={{ fontSize: 16, fontWeight: 900, color: '#5b21b6', margin: 0 }}>{data.qty} шт</p>
            </div>
            <div style={{ flex: 1, background: '#f0fdf4', borderRadius: 8, padding: '6px 10px' }}>
              <p style={{ fontSize: 9, color: '#16a34a', margin: 0, fontWeight: 600 }}>Паллет</p>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#15803d', margin: 0 }}>{data.palletName}</p>
            </div>
          </div>
          <p style={{ fontSize: 11, color: '#aaa', margin: '0 0 10px', fontFamily: 'monospace' }}>ШК: {data.barcode}</p>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={onNavigate} style={{ flex: 1, padding: '8px 0', borderRadius: 10, border: 'none', background: '#7c3aed', color: 'white', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              Карточка
            </button>
            <button onClick={onStartMove} style={{ flex: 1, padding: '8px 0', borderRadius: 10, border: '1.5px solid #7c3aed', background: 'white', color: '#7c3aed', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              Перенести
            </button>
          </div>
        </>
      )}
      {!isBox && data.palletInfo && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <div style={{ flex: 1, background: '#f5f3ff', borderRadius: 8, padding: '6px 10px' }}>
              <p style={{ fontSize: 9, color: '#7c3aed', margin: 0, fontWeight: 600 }}>Коробок</p>
              <p style={{ fontSize: 16, fontWeight: 900, color: '#5b21b6', margin: 0 }}>{data.palletInfo.boxes?.length || 0}</p>
            </div>
            <div style={{ flex: 1, background: '#f0fdf4', borderRadius: 8, padding: '6px 10px' }}>
              <p style={{ fontSize: 9, color: '#16a34a', margin: 0, fontWeight: 600 }}>Штук</p>
              <p style={{ fontSize: 16, fontWeight: 900, color: '#15803d', margin: 0 }}>{(data.palletInfo.boxes || []).reduce((s, b) => s + Number(b.quantity || 0), 0)}</p>
            </div>
          </div>
          <button onClick={onNavigate} style={{ width: '100%', padding: '8px 0', borderRadius: 10, border: 'none', background: '#7c3aed', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            Перейти в паллет
          </button>
        </>
      )}
    </div>
  );
}

// ─── Move mode banner ────────────────────────────────────────────────────────
function MoveBanner({ boxData, onCancel }) {
  return (
    <div style={{
      position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 20,
      background: '#fbbf24', borderRadius: 12, padding: '10px 20px',
      boxShadow: '0 4px 16px rgba(251,191,36,0.3)', fontFamily: 'Inter,Arial,sans-serif',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: '#78350f' }}>
        Выберите паллет для переноса «{boxData.product}»
      </span>
      <button onClick={onCancel} style={{ padding: '4px 12px', borderRadius: 8, border: '1px solid #92400e', background: 'rgba(255,255,255,0.5)', color: '#78350f', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
        Отмена
      </button>
    </div>
  );
}

// ─── Layer control (right side) ──────────────────────────────────────────────
function LayerControl({ maxLayers, activeLayer, onChange }) {
  return (
    <div style={{
      position: 'absolute', top: '50%', right: 16, transform: 'translateY(-50%)', zIndex: 20,
      background: 'white', borderRadius: 12, padding: '10px 6px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.1)', fontFamily: 'Inter,Arial,sans-serif',
      display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center',
    }}>
      <span style={{ fontSize: 8, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Слои</span>
      {Array.from({ length: maxLayers }, (_, i) => maxLayers - 1 - i).map(li => (
        <button key={li} onClick={() => onChange(activeLayer === li ? -1 : li)} style={{
          width: 32, height: 28, borderRadius: 6, border: 'none', cursor: 'pointer',
          fontSize: 11, fontWeight: activeLayer === li ? 700 : 500,
          background: activeLayer === li ? '#7c3aed' : '#f3f4f6',
          color: activeLayer === li ? '#fff' : '#888',
        }}>{li + 1}</button>
      ))}
      <button onClick={() => onChange(-1)} style={{
        width: 32, height: 28, borderRadius: 6, border: 'none', cursor: 'pointer',
        fontSize: 10, fontWeight: activeLayer === -1 ? 700 : 500,
        background: activeLayer === -1 ? '#7c3aed' : '#f3f4f6',
        color: activeLayer === -1 ? '#fff' : '#888',
      }}>Все</button>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function FBOVisualView({ warehouse }) {
  const navigate = useNavigate();
  const toast = useToast();
  const containerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [moveMode, setMoveMode] = useState(null);
  const moveModeRef = useRef(null);
  const [activeLayer, setActiveLayer] = useState(-1); // -1 = all
  const [maxLayers, setMaxLayers] = useState(3);
  const rendererRef = useRef(null);
  const layerGroupsRef = useRef([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`/fbo/visual/${warehouse.id}`);
      setRows(r.data.rows || []);
    } catch {} finally { setLoading(false); }
  }, [warehouse.id]);

  useEffect(() => { moveModeRef.current = moveMode; }, [moveMode]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (loading || !containerRef.current || rows.length === 0) return;

    const container = containerRef.current;
    const W = container.clientWidth;
    const H = Math.max(500, window.innerHeight - 280);

    // Scene — warm bright warehouse
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f0e8);

    // Camera
    const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 200);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // cap for perf
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const wrapper = container.querySelector('.three-canvas') || document.createElement('div');
    wrapper.className = 'three-canvas';
    wrapper.style.cssText = 'width:100%;border-radius:12px;overflow:hidden;';
    wrapper.innerHTML = '';
    wrapper.appendChild(renderer.domElement);
    if (!container.querySelector('.three-canvas')) container.prepend(wrapper);

    rendererRef.current = renderer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI / 2.1;
    controls.minDistance = 5;
    controls.maxDistance = 60;

    // Lights — warm warehouse lighting
    scene.add(new THREE.AmbientLight(0xfff8e8, 0.7));
    const dir = new THREE.DirectionalLight(0xfff0d0, 0.9);
    dir.position.set(15, 30, 12);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    dir.shadow.camera.left = -25; dir.shadow.camera.right = 25;
    dir.shadow.camera.top = 25; dir.shadow.camera.bottom = -25;
    scene.add(dir);
    // Fill light from other side
    const fill = new THREE.DirectionalLight(0xe8f0ff, 0.3);
    fill.position.set(-10, 15, -8);
    scene.add(fill);
    // Hemisphere for sky feel
    scene.add(new THREE.HemisphereLight(0xffeedd, 0xd0c8b8, 0.4));

    // Floor — warm polished concrete (big enough)
    const floorGeo = new THREE.PlaneGeometry(100, 100);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0xe0d8c8, roughness: 0.8, metalness: 0.05 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Materials (shared)
    const mats = {
      wood: new THREE.MeshStandardMaterial({ color: 0xd4a850, roughness: 0.65 }),
      woodDark: new THREE.MeshStandardMaterial({ color: 0x9a7430, roughness: 0.75 }),
      boxSide: new THREE.MeshStandardMaterial({ color: 0xe8d8b8, roughness: 0.55 }),
      boxTop: new THREE.MeshStandardMaterial({ color: 0xf0e4cc, roughness: 0.45 }),
      tape: new THREE.MeshStandardMaterial({ color: 0xd8c8a0, roughness: 0.35, transparent: true, opacity: 0.4 }),
      boardSep: new THREE.MeshStandardMaterial({ color: 0xdcc080, roughness: 0.55 }),
    };
    const geo = getSharedGeo();

    // Build pallets
    const allBoxMeshes = [];
    const palletGroups = [];

    rows.forEach((row, ri) => {
      row.pallets.forEach((pallet, pi) => {
        const x = pi * PALLET_SPACING - ((row.pallets.length - 1) * PALLET_SPACING) / 2;
        const z = ri * ROW_SPACING;
        const pg = buildPallet(pallet, mats, geo, x, z);
        scene.add(pg);
        palletGroups.push(pg);
        allBoxMeshes.push(...(pg.userData.boxMeshes || []));
      });
    });

    // Center camera
    const totalZ = Math.max(0, (rows.length - 1) * ROW_SPACING);
    controls.target.set(0, 3, totalZ / 2);
    camera.position.set(18, 18, totalZ / 2 + 18);

    // Raycaster
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let hoveredObj = null;

    const onMouseMove = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(allBoxMeshes, true);

      if (intersects.length > 0) {
        let obj = intersects[0].object;
        while (obj.parent && !obj.userData.type) obj = obj.parent;
        if (obj.userData.type === 'box') {
          if (hoveredObj !== obj) {
            if (hoveredObj) hoveredObj.scale.set(1, 1, 1);
            hoveredObj = obj;
            obj.scale.set(1.08, 1.08, 1.08);
          }
          renderer.domElement.style.cursor = 'pointer';
          return;
        }
      }
      if (hoveredObj) { hoveredObj.scale.set(1, 1, 1); hoveredObj = null; }
      renderer.domElement.style.cursor = 'grab';
    };

    const onClick = async (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);

      // Move mode: click on pallet to transfer box
      if (moveModeRef.current) {
        const palletHits = raycaster.intersectObjects(palletGroups, true);
        if (palletHits.length > 0) {
          let obj = palletHits[0].object;
          while (obj.parent && !obj.userData.type) obj = obj.parent;
          if (obj.userData.type === 'pallet') {
            const toPalletId = obj.userData.palletInfo.id;
            if (toPalletId !== moveModeRef.current.fromPalletId) {
              try {
                await api.post('/fbo/visual/move', { box_id: moveModeRef.current.boxId, to_pallet_id: toPalletId });
                setMoveMode(null);
                load(); // reload scene
              } catch (err) {
                // toast not available in closure, use alert
                alert('Ошибка переноса: ' + (err.response?.data?.error || err.message));
              }
            }
            return;
          }
        }
        return;
      }

      const intersects = raycaster.intersectObjects(allBoxMeshes, true);
      if (intersects.length > 0) {
        let obj = intersects[0].object;
        while (obj.parent && !obj.userData.type) obj = obj.parent;
        if (obj.userData.type === 'box') {
          setSelected(obj.userData);
          return;
        }
      }
      // Check pallet click
      const palletIntersects = raycaster.intersectObjects(palletGroups, true);
      if (palletIntersects.length > 0) {
        let obj = palletIntersects[0].object;
        while (obj.parent && !obj.userData.type) obj = obj.parent;
        if (obj.userData.type === 'pallet') {
          setSelected({ type: 'pallet', palletName: obj.userData.palletInfo.name, palletInfo: obj.userData.palletInfo });
        }
      }
    };

    renderer.domElement.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('click', onClick);

    // Resize
    const onResize = () => {
      const w = container.clientWidth;
      const h = Math.max(500, window.innerHeight - 280);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    // Animate
    let animId;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('mousemove', onMouseMove);
      renderer.domElement.removeEventListener('click', onClick);
      renderer.dispose();
      wrapper.innerHTML = '';
    };
  }, [loading, rows]);

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 400 }}><Spinner size="lg" /></div>;

  return (
    <div ref={containerRef} style={{ width: '100%', position: 'relative' }}>
      {rows.length === 0 && <div style={{ textAlign: 'center', padding: 80, color: '#bbb' }}>Нет данных</div>}

      {moveMode && <MoveBanner boxData={moveMode} onCancel={() => setMoveMode(null)} />}

      {!moveMode && <InfoPanel data={selected} onClose={() => setSelected(null)}
        onNavigate={() => {
          if (selected?.type === 'box') {
            // Navigate to box detail page (FBO box)
            navigate(`/admin/fbo?pallet=${selected.palletId}`);
          }
          setSelected(null);
        }}
        onStartMove={() => {
          if (selected?.type === 'box') {
            setMoveMode({ boxId: selected.boxId, product: selected.product, fromPalletId: selected.palletId, fromPalletName: selected.palletName });
            setSelected(null);
          }
        }}
      />}

      <LayerControl maxLayers={maxLayers} activeLayer={activeLayer} onChange={setActiveLayer} />

      <p style={{ textAlign: 'center', fontSize: 11, color: '#bbb', marginTop: 6 }}>
        ЛКМ + тянуть = вращение · Скролл = зум · ПКМ = панорама · Клик = инфо
      </p>
    </div>
  );
}
