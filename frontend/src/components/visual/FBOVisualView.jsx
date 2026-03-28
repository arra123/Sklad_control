import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import api from '../../api/client';
import Spinner from '../ui/Spinner';

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
    namePlane: new THREE.PlaneGeometry(3, 0.75),
  };
  return _sharedGeo;
}

// ─── Create box label texture (name + barcode + qty) ─────────────────────────
function makeBoxLabelTexture(name, qty) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 128, 64);
  ctx.fillStyle = '#3a3020';
  ctx.font = 'bold 11px Arial';
  const short = name.length > 16 ? name.slice(0, 15) + '…' : name;
  ctx.fillText(short, 4, 14);
  ctx.font = '10px Arial';
  ctx.fillStyle = '#888';
  ctx.fillText(qty + ' шт', 4, 28);
  // Mini barcode
  for (let i = 0; i < 20; i++) {
    const h = 4 + Math.random() * 8;
    ctx.fillStyle = `rgba(60,50,30,${0.3 + Math.random() * 0.3})`;
    ctx.fillRect(4 + i * 5, 38, 2, h);
  }
  return new THREE.CanvasTexture(c);
}

// ─── Pallet name label ───────────────────────────────────────────────────────
function makePalletLabel(name, count, qty) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#7c3aed';
  ctx.roundRect(0, 0, 256, 64, 8);
  ctx.fill();
  ctx.fillStyle = 'white';
  ctx.font = 'bold 26px Arial';
  ctx.fillText(name, 12, 28);
  ctx.font = '16px Arial';
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillText(`${count} кор. · ${qty} шт`, 12, 50);
  return new THREE.CanvasTexture(c);
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

      // Box label texture
      const bName = (box.product_name || '—').replace(/GraFLab,?\s*/i, '').trim();
      const labelTex = makeBoxLabelTexture(bName, box.quantity || 0);
      const labelMat = new THREE.MeshStandardMaterial({ map: labelTex, roughness: 0.3 });

      // Box mesh with label on front face (index 4 = +Z)
      const faceMats = [mats.boxSide, mats.boxSide, mats.boxTop, mats.boxSide, labelMat, mats.boxSide];
      const mesh = new THREE.Mesh(geo.box, faceMats);
      mesh.castShadow = true;
      bGroup.add(mesh);

      // Tape
      bGroup.add(new THREE.Mesh(geo.tapeV, mats.tape));
      bGroup.add(new THREE.Mesh(geo.tapeH, mats.tape));

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

// ─── Info Panel (React overlay) ──────────────────────────────────────────────
function InfoPanel({ data, onClose, onNavigate }) {
  if (!data) return null;
  const isBox = data.type === 'box';
  return (
    <div style={{
      position: 'absolute', top: 16, left: 16, width: 260, zIndex: 20,
      background: 'white', borderRadius: 16, padding: '16px 18px',
      boxShadow: '0 8px 30px rgba(0,0,0,0.12)', fontFamily: 'Inter,Arial,sans-serif',
    }}>
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
          <p style={{ fontSize: 11, color: '#aaa', margin: 0, fontFamily: 'monospace' }}>ШК: {data.barcode}</p>
        </>
      )}
      {!isBox && data.palletInfo && (
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, background: '#f5f3ff', borderRadius: 8, padding: '6px 10px' }}>
            <p style={{ fontSize: 9, color: '#7c3aed', margin: 0, fontWeight: 600 }}>Коробок</p>
            <p style={{ fontSize: 16, fontWeight: 900, color: '#5b21b6', margin: 0 }}>{data.palletInfo.boxes?.length || 0}</p>
          </div>
          <div style={{ flex: 1, background: '#f0fdf4', borderRadius: 8, padding: '6px 10px' }}>
            <p style={{ fontSize: 9, color: '#16a34a', margin: 0, fontWeight: 600 }}>Штук</p>
            <p style={{ fontSize: 16, fontWeight: 900, color: '#15803d', margin: 0 }}>
              {(data.palletInfo.boxes || []).reduce((s, b) => s + Number(b.quantity || 0), 0)}
            </p>
          </div>
        </div>
      )}
      <button onClick={onNavigate} style={{
        width: '100%', marginTop: 12, padding: '8px 0', borderRadius: 10, border: 'none',
        background: '#7c3aed', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer',
      }}>
        {isBox ? 'Открыть карточку' : 'Перейти в паллет'}
      </button>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function FBOVisualView({ warehouse }) {
  const containerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(null);
  const rendererRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`/fbo/visual/${warehouse.id}`);
      setRows(r.data.rows || []);
    } catch {} finally { setLoading(false); }
  }, [warehouse.id]);

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

    // Floor — warm polished concrete
    const floorGeo = new THREE.PlaneGeometry(60, 60);
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

    const onClick = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(allBoxMeshes, true);
      if (intersects.length > 0) {
        let obj = intersects[0].object;
        while (obj.parent && !obj.userData.type) obj = obj.parent;
        if (obj.userData.type === 'box') {
          setSelected(obj.userData);
          return;
        }
      }
      // Check pallet click (name label on floor)
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
      <InfoPanel data={selected} onClose={() => setSelected(null)} onNavigate={() => {
        // TODO: navigate to box/pallet detail
        setSelected(null);
      }} />
      <p style={{ textAlign: 'center', fontSize: 11, color: '#bbb', marginTop: 6 }}>
        ЛКМ + тянуть = вращение · Скролл = зум · ПКМ = панорама · Клик на коробку = инфо
      </p>
    </div>
  );
}
