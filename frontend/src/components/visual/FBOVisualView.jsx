import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import api from '../../api/client';
import Spinner from '../ui/Spinner';

const BOX_W = 1.05, BOX_D = 1.05, BOX_H = 0.9;
const COLS = 5, ROWS = 5, LAYER_SIZE = COLS * ROWS;
const PALLET_GAP = 8;
const fmtQ = (v) => { const n = parseFloat(v || 0); return Number.isInteger(n) ? String(n) : n.toFixed(0); };

// Label texture cache — reuse same texture for same name+qty
const labelCache = new Map();
function getLabelTexture(name, qty) {
  const key = `${name}|${qty}`;
  if (labelCache.has(key)) return labelCache.get(key);
  const lc = document.createElement('canvas');
  lc.width = 128; lc.height = 64;
  const ctx = lc.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 128, 64);
  ctx.fillStyle = '#1a1a1a'; ctx.font = 'bold 14px Arial';
  const short = name.length > 14 ? name.slice(0, 13) + '…' : name;
  ctx.fillText(short, 6, 22);
  ctx.font = 'bold 16px Arial'; ctx.fillStyle = '#333';
  ctx.fillText(qty + ' шт', 6, 48);
  const tex = new THREE.CanvasTexture(lc);
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.3 });
  labelCache.set(key, mat);
  return mat;
}

// ─── Build one pallet (exact copy of pallet-3d.html style) ──────────────────
function buildPallet(palletData, sharedMats, sharedGeo, offsetX, offsetZ) {
  const pallet = new THREE.Group();
  pallet.position.set(offsetX, 0, offsetZ);
  const boxes = palletData.boxes || [];

  // Wood base — top planks
  for (let i = 0; i < 5; i++) {
    const p = new THREE.Mesh(sharedGeo.plank, sharedMats.wood);
    p.position.set(0, 0.35, -2.4 + i * 1.2);
    p.castShadow = true;
    pallet.add(p);
  }
  // Stringers
  for (let i = -1; i <= 1; i++) {
    const s = new THREE.Mesh(sharedGeo.stringer, sharedMats.woodDark);
    s.position.set(i * 2.2, 0.175, 0);
    s.castShadow = true;
    pallet.add(s);
  }
  // Bottom planks
  for (let x = -1; x <= 1; x++) {
    const bp = new THREE.Mesh(sharedGeo.bottomPlank, sharedMats.wood);
    bp.position.set(x * 2.2, 0.06, 0);
    pallet.add(bp);
  }

  // Pallet name label on floor
  const nc = document.createElement('canvas');
  nc.width = 512; nc.height = 96;
  const nctx = nc.getContext('2d');
  nctx.fillStyle = '#7c3aed'; nctx.beginPath(); nctx.roundRect(0, 0, 512, 96, 14); nctx.fill();
  nctx.fillStyle = '#fff'; nctx.font = 'bold 40px Arial'; nctx.fillText(palletData.name, 20, 42);
  nctx.font = '26px Arial'; nctx.fillStyle = 'rgba(255,255,255,0.8)';
  const totalQty = boxes.reduce((s, b) => s + parseFloat(b.quantity || 0), 0);
  nctx.fillText(`${boxes.length} кор. · ${fmtQ(totalQty)} шт`, 20, 78);
  const nameTex = new THREE.CanvasTexture(nc); nameTex.anisotropy = 4;
  const nameMesh = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 0.85), new THREE.MeshBasicMaterial({ map: nameTex, transparent: true }));
  nameMesh.position.set(0, 0.01, 3.6); nameMesh.rotation.x = -Math.PI / 2;
  pallet.add(nameMesh);

  // Boxes — exact same structure as pallet-3d.html
  const boxMeshes = [];
  const layers = Math.ceil(boxes.length / LAYER_SIZE);
  const layerGroups = [];

  for (let li = 0; li < Math.max(layers, 1); li++) {
    const lg = new THREE.Group();
    const baseY = 0.42 + li * (BOX_H + 0.08);
    const layerBoxes = boxes.slice(li * LAYER_SIZE, (li + 1) * LAYER_SIZE);

    // Layer separator board
    if (li > 0) {
      const board = new THREE.Mesh(sharedGeo.board, sharedMats.boardSep);
      board.position.y = baseY - 0.04;
      board.castShadow = true;
      lg.add(board);
    }

    layerBoxes.forEach((box, idx) => {
      const row = Math.floor(idx / COLS), col = idx % COLS;
      const g = new THREE.Group();

      // Box body with 6 materials (sides + lighter top)
      const mesh = new THREE.Mesh(sharedGeo.box, [
        sharedMats.boxSide, sharedMats.boxSide,
        sharedMats.boxTop, sharedMats.boxSide,
        sharedMats.boxSide, sharedMats.boxSide,
      ]);
      mesh.castShadow = true; mesh.receiveShadow = true;
      g.add(mesh);

      // Tape strips
      g.add(new THREE.Mesh(sharedGeo.tapeV, sharedMats.tape));
      g.add(new THREE.Mesh(sharedGeo.tapeH, sharedMats.tape));

      // Top tape cross
      const tv = new THREE.Mesh(sharedGeo.topTapeV, sharedMats.tape);
      tv.rotation.x = -Math.PI / 2; tv.position.y = BOX_H / 2 + 0.005;
      g.add(tv);
      const th = new THREE.Mesh(sharedGeo.topTapeH, sharedMats.tape);
      th.rotation.x = -Math.PI / 2; th.position.y = BOX_H / 2 + 0.005;
      g.add(th);

      // White label on front face with product name + qty (cached)
      const name = (box.product_name || '—').replace(/GraFLab,?\s*/i, '').trim();
      const qty = fmtQ(box.quantity);
      const labelMat = getLabelTexture(name, qty);
      const label = new THREE.Mesh(sharedGeo.label, labelMat);
      label.position.set(0, -0.1, BOX_D / 2 + 0.005);
      g.add(label);

      g.position.set((col - 2) * (BOX_W + 0.05), baseY + BOX_H / 2, (row - 2) * (BOX_D + 0.05));
      g.userData = { type: 'box', product: name, qty, barcode: box.barcode_value || '—', boxId: box.id, palletName: palletData.name, layerIndex: li };

      lg.add(g);
      boxMeshes.push(g);
    });

    layerGroups.push(lg);
    pallet.add(lg);
  }

  pallet.userData = { type: 'pallet', boxMeshes, layerGroups, palletInfo: palletData };
  return pallet;
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function FBOVisualView({ warehouse }) {
  const containerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const allBoxRef = useRef([]);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api.get(`/fbo/visual/${warehouse.id}`); setRows(r.data.rows || []); }
    catch {} finally { setLoading(false); }
  }, [warehouse.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (loading || !containerRef.current || rows.length === 0) return;
    const el = containerRef.current;
    const W = el.clientWidth, H = Math.max(500, window.innerHeight - 260);

    // ═══ Scene (same as pallet-3d.html) ═══
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0ede6);

    const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 500);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'border-radius:12px;overflow:hidden;';
    wrapper.appendChild(renderer.domElement);
    el.innerHTML = '';
    el.appendChild(wrapper);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2.1;

    // ═══ Lights (same as pallet-3d.html) ═══
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 8);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(1024, 1024);
    dirLight.shadow.camera.left = -40; dirLight.shadow.camera.right = 40;
    dirLight.shadow.camera.top = 40; dirLight.shadow.camera.bottom = -40;
    scene.add(dirLight);

    // ═══ Floor (same as pallet-3d.html) ═══
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120),
      new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    scene.add(floor);
    const grid = new THREE.GridHelper(120, 60, 0xd0ccc4, 0xd0ccc4);
    grid.position.y = 0.01; grid.material.opacity = 0.4; grid.material.transparent = true;
    scene.add(grid);

    // ═══ Shared materials (same colors as pallet-3d.html) ═══
    const mats = {
      wood: new THREE.MeshStandardMaterial({ color: 0xc89838, roughness: 0.7 }),
      woodDark: new THREE.MeshStandardMaterial({ color: 0x8a6828, roughness: 0.8 }),
      boxSide: new THREE.MeshStandardMaterial({ color: 0xddd0b4, roughness: 0.6 }),
      boxTop: new THREE.MeshStandardMaterial({ color: 0xe8dbc4, roughness: 0.5 }),
      tape: new THREE.MeshStandardMaterial({ color: 0xc8b898, roughness: 0.4, transparent: true, opacity: 0.5 }),
      boardSep: new THREE.MeshStandardMaterial({ color: 0xc89838, roughness: 0.7 }),
    };

    // ═══ Shared geometries ═══
    const geo = {
      plank: new THREE.BoxGeometry(6, 0.15, 0.8),
      stringer: new THREE.BoxGeometry(0.6, 0.35, 5.6),
      bottomPlank: new THREE.BoxGeometry(0.8, 0.12, 5.6),
      box: new THREE.BoxGeometry(BOX_W, BOX_H, BOX_D),
      tapeV: new THREE.BoxGeometry(0.08, BOX_H + 0.01, BOX_D + 0.01),
      tapeH: new THREE.BoxGeometry(BOX_W + 0.01, BOX_H + 0.01, 0.08),
      topTapeV: new THREE.PlaneGeometry(0.1, BOX_D),
      topTapeH: new THREE.PlaneGeometry(BOX_W, 0.1),
      board: new THREE.BoxGeometry(5.8, 0.06, 5.8),
      label: new THREE.PlaneGeometry(0.6, 0.3),
    };

    // ═══ Place all pallets ═══
    const allBoxMeshes = [];
    rows.forEach((row, ri) => {
      row.pallets.forEach((p, pi) => {
        const x = pi * PALLET_GAP - ((row.pallets.length - 1) * PALLET_GAP) / 2;
        const z = ri * 12;
        const pg = buildPallet(p, mats, geo, x, z);
        scene.add(pg);
        allBoxMeshes.push(...(pg.userData.boxMeshes || []));
      });
    });
    allBoxRef.current = allBoxMeshes;

    // Camera position
    const totalZ = Math.max(0, (rows.length - 1) * 12);
    controls.target.set(0, 3, totalZ / 2);
    camera.position.set(20, 20, totalZ / 2 + 22);

    // ═══ Tooltip (same as pallet-3d.html) ═══
    const tooltip = document.createElement('div');
    tooltip.style.cssText = 'position:fixed;display:none;z-index:100;background:#1c1917;color:white;padding:8px 14px;border-radius:10px;font-size:12px;pointer-events:none;box-shadow:0 6px 20px rgba(0,0,0,0.3);font-family:Inter,Arial,sans-serif;';
    el.appendChild(tooltip);

    // ═══ Raycaster (same as pallet-3d.html) ═══
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let hovered = null;

    const onMove = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(allBoxMeshes, true);
      if (hits.length > 0) {
        let obj = hits[0].object;
        while (obj.parent && !obj.userData.type) obj = obj.parent;
        if (obj.userData.type === 'box') {
          if (hovered !== obj) { if (hovered) hovered.scale.set(1, 1, 1); hovered = obj; obj.scale.set(1.08, 1.08, 1.08); }
          tooltip.style.display = 'block';
          tooltip.style.left = (e.clientX + 16) + 'px';
          tooltip.style.top = (e.clientY - 10) + 'px';
          tooltip.innerHTML = `<b>${obj.userData.product}</b><br>ШК: ${obj.userData.barcode} · ${obj.userData.qty} шт`;
          renderer.domElement.style.cursor = 'pointer';
          return;
        }
      }
      if (hovered) { hovered.scale.set(1, 1, 1); hovered = null; }
      tooltip.style.display = 'none';
      renderer.domElement.style.cursor = 'grab';
    };
    renderer.domElement.addEventListener('mousemove', onMove);

    // Resize
    const onResize = () => {
      const w = el.clientWidth, h = Math.max(500, window.innerHeight - 260);
      camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    // Animate
    let animId;
    const animate = () => { animId = requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      el.innerHTML = '';
    };
  }, [loading, rows]);

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 400 }}><Spinner size="lg" /></div>;

  return (
    <div ref={containerRef} style={{ width: '100%', position: 'relative' }}>
      {rows.length === 0 && <div style={{ textAlign: 'center', padding: 80, color: '#bbb' }}>Нет данных</div>}
      <p style={{ textAlign: 'center', fontSize: 11, color: '#bbb', marginTop: 6 }}>
        Крути мышкой · Скролл = зум · ПКМ = панорама
      </p>
    </div>
  );
}
