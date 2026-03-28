import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import api from '../../api/client';
import Spinner from '../ui/Spinner';

// ─── Materials (created once) ────────────────────────────────────────────────
const woodColor = 0xc89838;
const woodDarkColor = 0x8a6828;
const boxSideColor = 0xddd0b4;
const boxTopColor = 0xe8dbc4;
const tapeColor = 0xc8b898;
const labelColor = 0xffffff;

function createMaterials() {
  return {
    wood: new THREE.MeshStandardMaterial({ color: woodColor, roughness: 0.7 }),
    woodDark: new THREE.MeshStandardMaterial({ color: woodDarkColor, roughness: 0.8 }),
    boxSide: new THREE.MeshStandardMaterial({ color: boxSideColor, roughness: 0.6 }),
    boxTop: new THREE.MeshStandardMaterial({ color: boxTopColor, roughness: 0.5 }),
    tape: new THREE.MeshStandardMaterial({ color: tapeColor, roughness: 0.4, transparent: true, opacity: 0.5 }),
    label: new THREE.MeshStandardMaterial({ color: labelColor, roughness: 0.3 }),
    boardSep: new THREE.MeshStandardMaterial({ color: 0xd0b070, roughness: 0.6 }),
    highlight: new THREE.MeshStandardMaterial({ color: 0xf0e8d0, roughness: 0.4, emissive: 0x222200, emissiveIntensity: 0.15 }),
  };
}

// ─── Build one pallet with boxes ─────────────────────────────────────────────
function buildPallet(palletData, mats, offsetX, offsetZ) {
  const group = new THREE.Group();
  group.position.set(offsetX, 0, offsetZ);

  const boxes = palletData.boxes || [];
  const COLS = 5, ROWS = 5, LAYER_SIZE = 25;
  const BOX_W = 1.05, BOX_D = 1.05, BOX_H = 0.9;

  // Wood base
  for (let i = 0; i < 5; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(6, 0.15, 0.8), mats.wood);
    plank.position.set(0, 0.35, -2.4 + i * 1.2);
    plank.castShadow = true;
    group.add(plank);
  }
  for (let i = -1; i <= 1; i++) {
    const stringer = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.35, 5.6), mats.woodDark);
    stringer.position.set(i * 2.2, 0.175, 0);
    stringer.castShadow = true;
    group.add(stringer);
  }
  for (let x = -1; x <= 1; x++) {
    const bp = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 5.6), mats.wood);
    bp.position.set(x * 2.2, 0.06, 0);
    group.add(bp);
  }

  // Name label (3D text alternative — flat plane with canvas texture)
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#7c3aed';
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = 'white';
  ctx.font = 'bold 28px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(palletData.name, 128, 24);
  ctx.font = '18px Arial';
  ctx.fillText(`${boxes.length} кор. · ${boxes.reduce((s, b) => s + Number(b.quantity || 0), 0)} шт`, 128, 50);
  const labelTex = new THREE.CanvasTexture(canvas);
  const namePlane = new THREE.Mesh(
    new THREE.PlaneGeometry(3, 0.75),
    new THREE.MeshBasicMaterial({ map: labelTex, transparent: true })
  );
  namePlane.position.set(0, 0.01, 3.5);
  namePlane.rotation.x = -Math.PI / 2;
  group.add(namePlane);

  // Boxes
  const boxMeshes = [];
  const layers = Math.ceil(boxes.length / LAYER_SIZE);
  for (let li = 0; li < layers; li++) {
    // Layer separator board
    if (li > 0) {
      const boardY = 0.42 + li * (BOX_H + 0.08) - 0.04;
      const board = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.06, 5.8), mats.boardSep);
      board.position.y = boardY;
      board.castShadow = true;
      group.add(board);
    }

    const layerBoxes = boxes.slice(li * LAYER_SIZE, (li + 1) * LAYER_SIZE);
    const baseY = 0.42 + li * (BOX_H + 0.08);

    layerBoxes.forEach((box, idx) => {
      const row = Math.floor(idx / COLS);
      const col = idx % COLS;
      const bGroup = new THREE.Group();

      const sideMat = mats.boxSide;
      const topMat = mats.boxTop;
      const faceMats = [sideMat, sideMat, topMat, sideMat, sideMat, sideMat];
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(BOX_W, BOX_H, BOX_D), faceMats);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      bGroup.add(mesh);

      // Tape strips
      bGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.07, BOX_H + 0.01, BOX_D + 0.01), mats.tape));
      bGroup.add(new THREE.Mesh(new THREE.BoxGeometry(BOX_W + 0.01, BOX_H + 0.01, 0.07), mats.tape));

      // Top tape cross
      const tv = new THREE.Mesh(new THREE.PlaneGeometry(0.09, BOX_D), mats.tape);
      tv.rotation.x = -Math.PI / 2; tv.position.y = BOX_H / 2 + 0.005;
      bGroup.add(tv);
      const th = new THREE.Mesh(new THREE.PlaneGeometry(BOX_W, 0.09), mats.tape);
      th.rotation.x = -Math.PI / 2; th.position.y = BOX_H / 2 + 0.005;
      bGroup.add(th);

      // Label on front
      const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.3), mats.label);
      lbl.position.set(0, -0.1, BOX_D / 2 + 0.005);
      bGroup.add(lbl);

      const x = (col - 2) * (BOX_W + 0.05);
      const z = (row - 2) * (BOX_D + 0.05);
      bGroup.position.set(x, baseY + BOX_H / 2, z);

      const name = (box.product_name || '—').replace(/GraFLab,?\s*/i, '').trim();
      bGroup.userData = { product: name, qty: box.quantity || 0, barcode: box.barcode_value || '—', boxId: box.id };

      group.add(bGroup);
      boxMeshes.push(bGroup);
    });
  }

  group.userData.boxMeshes = boxMeshes;
  group.userData.palletInfo = palletData;
  return group;
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function FBOVisualView({ warehouse }) {
  const containerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const sceneRef = useRef(null);
  const tooltipRef = useRef(null);

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

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0ede6);
    scene.fog = new THREE.Fog(0xf0ede6, 40, 80);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 200);
    camera.position.set(20, 22, 20);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 3, 0);
    controls.maxPolarAngle = Math.PI / 2.1;

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(15, 25, 10);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.left = -30; dir.shadow.camera.right = 30;
    dir.shadow.camera.top = 30; dir.shadow.camera.bottom = -30;
    scene.add(dir);

    // Floor
    const floorGeo = new THREE.PlaneGeometry(80, 80);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.9 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    scene.add(new THREE.GridHelper(80, 80, 0xd8d4cc, 0xd8d4cc));

    // Materials
    const mats = createMaterials();

    // Place pallets
    const allBoxMeshes = [];
    const PALLET_SPACING = 8;
    const ROW_SPACING = 10;

    rows.forEach((row, ri) => {
      row.pallets.forEach((pallet, pi) => {
        const x = pi * PALLET_SPACING - ((row.pallets.length - 1) * PALLET_SPACING) / 2;
        const z = ri * ROW_SPACING;
        const palletGroup = buildPallet(pallet, mats, x, z);
        scene.add(palletGroup);
        allBoxMeshes.push(...(palletGroup.userData.boxMeshes || []));
      });

      // Row label
      const canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = 48;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#7c3aed';
      ctx.font = 'bold 32px Arial';
      ctx.fillText(row.name, 10, 34);
      const tex = new THREE.CanvasTexture(canvas);
      const lbl = new THREE.Mesh(
        new THREE.PlaneGeometry(4, 0.75),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true })
      );
      lbl.position.set(-((row.pallets.length) * PALLET_SPACING) / 2 - 3, 2, ri * ROW_SPACING);
      lbl.lookAt(camera.position.x, 2, lbl.position.z);
      scene.add(lbl);
    });

    // Center camera on scene
    const totalZ = (rows.length - 1) * ROW_SPACING;
    controls.target.set(0, 3, totalZ / 2);
    camera.position.set(20, 22, totalZ / 2 + 20);

    // Tooltip
    const tooltip = document.createElement('div');
    tooltip.style.cssText = 'position:fixed;display:none;z-index:100;background:#1c1917;color:white;padding:8px 14px;border-radius:10px;font-size:12px;pointer-events:none;box-shadow:0 6px 20px rgba(0,0,0,0.3);font-family:Inter,Arial,sans-serif;';
    container.appendChild(tooltip);
    tooltipRef.current = tooltip;

    // Raycaster
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let hoveredBox = null;

    const onMouseMove = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(allBoxMeshes, true);

      if (intersects.length > 0) {
        let obj = intersects[0].object;
        while (obj.parent && !obj.userData.product) obj = obj.parent;
        if (obj.userData.product) {
          if (hoveredBox !== obj) {
            if (hoveredBox) { hoveredBox.scale.set(1, 1, 1); }
            hoveredBox = obj;
            obj.scale.set(1.08, 1.08, 1.08);
          }
          tooltip.style.display = 'block';
          tooltip.style.left = (e.clientX + 16) + 'px';
          tooltip.style.top = (e.clientY - 10) + 'px';
          tooltip.innerHTML = `<b>${obj.userData.product}</b><br>ШК: ${obj.userData.barcode} · ${obj.userData.qty} шт`;
          return;
        }
      }
      if (hoveredBox) { hoveredBox.scale.set(1, 1, 1); hoveredBox = null; }
      tooltip.style.display = 'none';
    };

    renderer.domElement.addEventListener('mousemove', onMouseMove);

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
      renderer.dispose();
      if (tooltip.parentNode) tooltip.parentNode.removeChild(tooltip);
      container.innerHTML = '';
    };
  }, [loading, rows]);

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 400 }}><Spinner size="lg" /></div>;

  return (
    <div>
      <div ref={containerRef} style={{ width: '100%', borderRadius: 12, overflow: 'hidden', position: 'relative' }}>
        {rows.length === 0 && <div style={{ textAlign: 'center', padding: 80, color: '#bbb' }}>Нет данных</div>}
      </div>
      <p style={{ textAlign: 'center', fontSize: 11, color: '#bbb', marginTop: 8 }}>
        Крути мышкой · Скролл = зум · ПКМ = панорама
      </p>
    </div>
  );
}
