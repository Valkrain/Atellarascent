import React, { useState, useEffect, useRef } from 'react';
import { CraftDesign, PlacedPart } from '../types';
import { PARTS_CATALOG } from '../data/partsCatalog';
import { CRAFT_PRESETS } from '../data/presets';
import { Plus, Trash2, ArrowUp, ArrowDown, RotateCw, Rocket, Shield, Flame, Zap, Database, Split, Wind, CloudRain, Anchor, Sun, FlaskConical, Gauge, Compass, Wrench, Info, ChevronRight, Layers, X, Move, ZoomIn, ZoomOut, RefreshCw, Settings, GripVertical } from 'lucide-react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

interface AssemblyHangarProps {
  currentCraft: CraftDesign;
  setCurrentCraft: (craft: CraftDesign) => void;
  onLaunch: () => void;
}

export const AssemblyHangar: React.FC<AssemblyHangarProps> = ({ currentCraft, setCurrentCraft, onLaunch }) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const [selectedPartInstanceId, setSelectedPartInstanceId] = useState<string | null>(null);
  const [isReadinessOpen, setIsReadinessOpen] = useState<boolean>(false);
  const [isCatalogOpen, setIsCatalogOpen] = useState<boolean>(false);
  const [draggedPartId, setDraggedPartId] = useState<string | null>(null);
  const [grabbedPartId, setGrabbedPartId] = useState<string | null>(null);
  const [grabbedPos, setGrabbedPos] = useState<{ x: number; y: number } | null>(null);
  const [autoDecoupleNotice, setAutoDecoupleNotice] = useState<string | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);

  // Camera control state for pan and zoom
  const cameraPosRef = useRef({ x: 0, y: 4, z: 16 });
  const rocketRotRef = useRef({ x: 0, y: 0 });

  // Three.js 3D Interactive Turntable / Drag & Click Raycasting Scene
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth;
    const height = mount.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x04060a);
    scene.fog = new THREE.FogExp2(0x04060a, 0.002);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(cameraPosRef.current.x, cameraPosRef.current.y, cameraPosRef.current.z);
    camera.lookAt(0, 0, 0);

    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl ? gl.getExtension('WEBGL_debug_renderer_info') : null;
    const gpu = ext && gl ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
    const isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software/i.test(gpu);

    const renderer = new THREE.WebGLRenderer({ antialias: !isSoftwareGl, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    mount.appendChild(renderer.domElement);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // Lighting
    const ambientLight = new THREE.HemisphereLight(0xffffff, 0x333344, 1.5);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
    dirLight.position.set(10, 25, 15);
    scene.add(dirLight);

    // Rocket Assembly Group
    const rocketGroup = new THREE.Group();
    scene.add(rocketGroup);

    // Build 3D Stack & Radial Attachments
    const meshToInstanceMap = new Map<THREE.Mesh, string>();
    let inlineY = ((currentCraft.parts.filter(p => {
      const def = PARTS_CATALOG.find(d => d.id === p.partId);
      return def && ['command', 'fuel', 'engine', 'booster', 'decoupler'].includes(def.category);
    }).length * 2.0) / 2);

    let radialCount = 0;

    currentCraft.parts.forEach((p) => {
      const def = PARTS_CATALOG.find((d) => d.id === p.partId);
      if (!def) return;

      let mesh: THREE.Mesh;
      const isSelected = p.instanceId === selectedPartInstanceId;
      const color = isSelected ? 0x06b6d4 : def.category === 'command' ? 0x3b82f6 : def.category === 'engine' ? 0xef4444 : def.category === 'aerodynamics' ? 0x10b981 : 0xe2e8f0;

      if (def.category === 'command') {
        const geo = new THREE.ConeGeometry(1.2, 2.2, 16);
        const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.2, wireframe: isSelected });
        mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(0, inlineY, 0);
        inlineY -= 2.0;
      } else if (def.category === 'engine' || def.category === 'booster') {
        const geo = new THREE.CylinderGeometry(1.2, 1.4, 2, 16);
        const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.3, wireframe: isSelected });
        mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(0, inlineY, 0);
        inlineY -= 2.0;
      } else if (def.category === 'fuel' || def.category === 'decoupler') {
        const isDecoupler = def.category === 'decoupler';
        const geo = isDecoupler ? new THREE.CylinderGeometry(1.25, 1.25, 0.4, 16) : new THREE.CylinderGeometry(1.2, 1.2, 1.8, 16);
        const mat = new THREE.MeshStandardMaterial({
          color: isDecoupler ? 0x64748b : color,
          metalness: isDecoupler ? 0.8 : 0.4,
          roughness: isDecoupler ? 0.2 : 0.3,
          wireframe: isSelected,
        });
        mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(0, inlineY, 0);
        inlineY -= isDecoupler ? 0.8 : 2.0;
      } else if (def.category === 'aerodynamics') {
        const geo = new THREE.BoxGeometry(0.2, 1.2, 0.8);
        const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.2, wireframe: isSelected });
        mesh = new THREE.Mesh(geo, mat);
        const sideSign = radialCount % 2 === 0 ? 1 : -1;
        mesh.position.set(sideSign * 1.4, 0, 0);
        radialCount++;
      } else {
        const geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.4, wireframe: isSelected });
        mesh = new THREE.Mesh(geo, mat);
        const sideSign = radialCount % 2 === 0 ? 1 : -1;
        mesh.position.set(sideSign * 1.3, 1.0, 0);
        radialCount++;
      }

      if (p.rotation) {
        mesh.rotation.y = p.rotation;
      }
      rocketGroup.add(mesh);
      meshToInstanceMap.set(mesh, p.instanceId);
    });

    // Raycasting for 3D part clicking
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onClick = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(rocketGroup.children);

      if (intersects.length > 0) {
        const hitMesh = intersects[0].object as THREE.Mesh;
        const instanceId = meshToInstanceMap.get(hitMesh);
        if (instanceId) {
          setSelectedPartInstanceId(instanceId);
        }
      }
    };

    // Mouse drag rotation & pan handlers
    let isDragging = false;
    let isPanning = false;
    let previousMousePosition = { x: 0, y: 0 };

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      isPanning = e.button === 2 || e.shiftKey;
      previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const deltaX = e.clientX - previousMousePosition.x;
      const deltaY = e.clientY - previousMousePosition.y;

      if (isPanning || e.shiftKey) {
        cameraPosRef.current.x -= deltaX * 0.02;
        cameraPosRef.current.y += deltaY * 0.02;
      } else {
        rocketRotRef.current.y += deltaX * 0.01;
        rocketRotRef.current.x += deltaY * 0.01;
      }
      previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const onMouseUp = () => {
      isDragging = false;
      isPanning = false;
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      cameraPosRef.current.z = Math.max(5, Math.min(40, cameraPosRef.current.z + e.deltaY * 0.01));
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        isDragging = true;
        previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isDragging || e.touches.length !== 1) return;
      const deltaX = e.touches[0].clientX - previousMousePosition.x;
      const deltaY = e.touches[0].clientY - previousMousePosition.y;

      rocketRotRef.current.y += deltaX * 0.01;
      rocketRotRef.current.x += deltaY * 0.01;

      previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };

    const onTouchEnd = () => {
      isDragging = false;
    };

    const domElem = renderer.domElement;
    domElem.addEventListener('click', onClick);
    domElem.addEventListener('mousedown', onMouseDown);
    domElem.addEventListener('contextmenu', onContextMenu);
    domElem.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    domElem.addEventListener('wheel', onWheel, { passive: false });

    let animationFrameId: number;
    const animate = () => {
      rocketGroup.rotation.y = rocketRotRef.current.y;
      rocketGroup.rotation.x = rocketRotRef.current.x;

      camera.position.set(cameraPosRef.current.x, cameraPosRef.current.y, cameraPosRef.current.z);
      camera.lookAt(cameraPosRef.current.x, cameraPosRef.current.y, 0);

      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(animate);
    };
    animate();

    const handleResize = () => {
      if (!mount || !renderer || !camera) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      domElem.removeEventListener('click', onClick);
      domElem.removeEventListener('mousedown', onMouseDown);
      domElem.removeEventListener('contextmenu', onContextMenu);
      domElem.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      domElem.removeEventListener('wheel', onWheel);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [currentCraft, selectedPartInstanceId]);

  // Camera control helpers
  const handleRotate = (deltaY: number, deltaX: number = 0) => {
    rocketRotRef.current.y += deltaY;
    rocketRotRef.current.x += deltaX;
  };

  const handlePan = (deltaX: number, deltaY: number) => {
    cameraPosRef.current.x += deltaX;
    cameraPosRef.current.y += deltaY;
  };

  const handleZoom = (deltaZ: number) => {
    cameraPosRef.current.z = Math.max(5, Math.min(40, cameraPosRef.current.z + deltaZ));
  };

  const handleResetView = () => {
    cameraPosRef.current = { x: 0, y: 4, z: 16 };
    rocketRotRef.current = { x: 0, y: 0 };
  };

  // Icon mapping
  const renderIcon = (name: string) => {
    switch (name) {
      case 'Shield': return <Shield className="w-4 h-4 text-cyan-400" />;
      case 'Compass': return <Compass className="w-4 h-4 text-cyan-400" />;
      case 'Database': return <Database className="w-4 h-4 text-amber-400" />;
      case 'Flame': return <Flame className="w-4 h-4 text-rose-500" />;
      case 'Zap': return <Zap className="w-4 h-4 text-amber-300" />;
      case 'Rocket': return <Rocket className="w-4 h-4 text-orange-500" />;
      case 'Split': return <Split className="w-4 h-4 text-purple-400" />;
      case 'Wind': return <Wind className="w-4 h-4 text-blue-400" />;
      case 'CloudRain': return <CloudRain className="w-4 h-4 text-teal-400" />;
      case 'Anchor': return <Anchor className="w-4 h-4 text-emerald-400" />;
      case 'Sun': return <Sun className="w-4 h-4 text-yellow-400" />;
      default: return <Gauge className="w-4 h-4 text-slate-400" />;
    }
  };

  const recalculateStagesAcrossDecouplers = (parts: PlacedPart[]): PlacedPart[] => {
    const result = parts.map((p) => ({ ...p }));
    let currentStage = 0;

    // Walk from bottom of stack (first to fire = Stage 0) up to top
    for (let i = result.length - 1; i >= 0; i--) {
      const def = PARTS_CATALOG.find((d) => d.id === result[i].partId);
      result[i].stage = currentStage;
      if (def?.category === 'decoupler') {
        currentStage += 1;
      }
    }
    return result;
  };

  const handleAddPart = (partId: string) => {
    const partDef = PARTS_CATALOG.find((p) => p.id === partId);
    if (!partDef) return;

    const inlineCategories = ['command', 'fuel', 'engine', 'booster', 'decoupler'];
    const isNewInline = inlineCategories.includes(partDef.category);

    // Check trailing inline part to see if we are connecting inline to an engine or booster
    let lastInlineDef = null;
    for (let i = currentCraft.parts.length - 1; i >= 0; i--) {
      const d = PARTS_CATALOG.find((x) => x.id === currentCraft.parts[i].partId);
      if (d && inlineCategories.includes(d.category)) {
        lastInlineDef = d;
        break;
      }
    }

    const needsAutoDecoupler =
      isNewInline &&
      partDef.category !== 'decoupler' &&
      lastInlineDef &&
      (lastInlineDef.category === 'engine' || lastInlineDef.category === 'booster');

    const newPartsToAdd: PlacedPart[] = [];

    if (needsAutoDecoupler) {
      newPartsToAdd.push({
        instanceId: 'part_' + Math.random().toString(36).substr(2, 9),
        partId: 'decoupler_stack_small',
        stage: 0,
        rotation: 0,
      });
      setAutoDecoupleNotice('Auto-inserted TR-18A Decoupler & grouped lower stage');
      setTimeout(() => setAutoDecoupleNotice(null), 3500);
    }

    const defaultStage =
      currentCraft.parts.length > 0 ? Math.min(...currentCraft.parts.map((p) => p.stage)) : 0;

    newPartsToAdd.push({
      instanceId: 'part_' + Math.random().toString(36).substr(2, 9),
      partId,
      stage: defaultStage,
      rotation: 0,
    });

    let updatedParts = [...currentCraft.parts, ...newPartsToAdd];

    // Whenever a decoupler is added (manually or automatically), partition stages bottom-up
    if (needsAutoDecoupler || partDef.category === 'decoupler') {
      updatedParts = recalculateStagesAcrossDecouplers(updatedParts);
    }

    updateCraftMetrics(updatedParts);
  };

  const handleTouchStartCatalog = (partId: string, e: React.TouchEvent) => {
    const touch = e.touches[0];
    const startX = touch.clientX;
    const startY = touch.clientY;

    longPressTimerRef.current = setTimeout(() => {
      if (navigator.vibrate) navigator.vibrate(50);
      setGrabbedPartId(partId);
      setGrabbedPos({ x: startX, y: startY });
      setIsCatalogOpen(false);
    }, 500);
  };

  const handleTouchMoveCatalog = (e: React.TouchEvent) => {
    if (grabbedPartId && e.touches.length > 0) {
      setGrabbedPos({ x: e.touches[0].clientX, y: e.touches[0].clientY });
    }
  };

  const handleTouchEndCatalog = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (grabbedPartId) {
      handleAddPart(grabbedPartId);
      setGrabbedPartId(null);
      setGrabbedPos(null);
    }
  };

  const handleRemovePart = (instanceId: string) => {
    const updatedParts = currentCraft.parts.filter((p) => p.instanceId !== instanceId);
    if (selectedPartInstanceId === instanceId) setSelectedPartInstanceId(null);
    updateCraftMetrics(updatedParts);
  };

  const handleMoveStage = (instanceId: string, delta: number) => {
    const updatedParts = currentCraft.parts.map((p) => {
      if (p.instanceId === instanceId) {
        return { ...p, stage: Math.max(0, p.stage + delta) };
      }
      return p;
    });
    updateCraftMetrics(updatedParts);
  };

  const handleRotatePart = (instanceId: string) => {
    const updatedParts = currentCraft.parts.map((p) => {
      if (p.instanceId === instanceId) {
        return { ...p, rotation: (p.rotation || 0) + Math.PI / 2 };
      }
      return p;
    });
    updateCraftMetrics(updatedParts);
  };

  const updateCraftMetrics = (parts: PlacedPart[]) => {
    let totalMass = 0;
    let totalCost = 0;
    parts.forEach((p) => {
      const def = PARTS_CATALOG.find((d) => d.id === p.partId);
      if (def) {
        totalMass += def.mass + (def.fuelCapacity || 0);
        totalCost += def.cost;
      }
    });

    setCurrentCraft({
      ...currentCraft,
      parts,
      totalMass: Number(totalMass.toFixed(2)),
      totalCost,
    });
  };

  const handleLoadPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    const preset = CRAFT_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      setCurrentCraft({ ...preset });
    }
  };

  // Drag and Drop Handlers
  const handleDragStart = (e: React.DragEvent, partId: string) => {
    setDraggedPartId(partId);
    e.dataTransfer.setData('text/plain', partId);
  };

  const handleDropOnAssembly = (e: React.DragEvent) => {
    e.preventDefault();
    if (draggedPartId) {
      handleAddPart(draggedPartId);
      setDraggedPartId(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  let totalThrust = 0;
  let totalDryMass = 0;
  let totalWetMass = 0;
  currentCraft.parts.forEach((p) => {
    const def = PARTS_CATALOG.find((d) => d.id === p.partId);
    if (def) {
      totalDryMass += def.mass;
      totalWetMass += def.mass + (def.fuelCapacity || 0);
      if (def.thrust) totalThrust += def.thrust;
    }
  });

  const surfaceGravity = 9.81;
  const weight = totalWetMass * surfaceGravity;
  const twr = weight > 0 ? Number((totalThrust / weight).toFixed(2)) : 0;
  const estimatedDeltaV = totalWetMass > totalDryMass && totalThrust > 0 ? Math.round(300 * 9.81 * Math.log(totalWetMass / Math.max(0.1, totalDryMass))) : 0;

  const categories = [
    { id: 'all', label: 'All' },
    { id: 'command', label: 'Command' },
    { id: 'fuel', label: 'Fuel' },
    { id: 'engine', label: 'Engine' },
    { id: 'booster', label: 'Booster' },
    { id: 'decoupler', label: 'Decoupler' },
    { id: 'aerodynamics', label: 'Aero' },
    { id: 'utility', label: 'Utility' },
  ];

  const filteredParts = selectedCategory === 'all'
    ? PARTS_CATALOG
    : PARTS_CATALOG.filter((p) => p.category === selectedCategory);

  const selectedPart = currentCraft.parts.find((p) => p.instanceId === selectedPartInstanceId);
  const selectedPartDef = selectedPart ? PARTS_CATALOG.find((d) => d.id === selectedPart.partId) : null;

  return (
    <div className="flex flex-col h-[calc(100vh-73px)] bg-[#07090E] text-slate-100 overflow-hidden relative">
      {/* Distinct Screen Header */}
      <div className="flex items-center justify-between px-6 py-3 bg-[#0B0E17] border-b border-slate-800 z-30">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Wrench className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-wide uppercase">Vehicle Assembly Hangar</h1>
            <p className="text-[10px] text-slate-400 font-mono">Drag & Drop Assembly Bay & 3D Inspection</p>
          </div>
        </div>

        {/* Quick Actions in Header */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsCatalogOpen(!isCatalogOpen)}
            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              isCatalogOpen ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-400' : 'bg-slate-900 border-slate-800 text-slate-300'
            }`}
          >
            <Layers className="w-3.5 h-3.5" /> {isCatalogOpen ? 'Hide Catalog' : 'Parts Catalog'}
          </button>
          <button
            onClick={() => setIsReadinessOpen(!isReadinessOpen)}
            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              isReadinessOpen ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-400' : 'bg-slate-900 border-slate-800 text-slate-300'
            }`}
          >
            <Info className="w-3.5 h-3.5" /> Flight Readiness
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Floating Grabbed Indicator Badge for Mobile Long Press */}
        {grabbedPartId && grabbedPos && (
          <div
            className="fixed z-50 pointer-events-none px-4 py-2.5 bg-cyan-500 text-slate-950 font-bold text-xs rounded-xl shadow-2xl flex items-center gap-2 transform -translate-x-1/2 -translate-y-1/2 animate-pulse"
            style={{ left: grabbedPos.x, top: grabbedPos.y }}
          >
            <Rocket className="w-4 h-4" /> Grabbed Part (Release to Add)
          </div>
        )}

        {/* Part Catalog Drawer / Modal with HTML5 Drag */}
        {isCatalogOpen && (
          <div className="absolute lg:relative inset-y-0 left-0 w-80 bg-[#0B0E17]/95 lg:bg-[#0B0E17] backdrop-blur-md lg:backdrop-blur-none border-r border-slate-800 flex flex-col z-40 shadow-2xl transition-all">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h2 className="text-xs font-semibold text-white uppercase tracking-wider">Part Catalog (Drag to Add)</h2>
              <button
                onClick={() => setIsCatalogOpen(false)}
                className="lg:hidden p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-900 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 border-b border-slate-800">
              <div className="flex flex-wrap gap-1">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-2 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer ${
                      selectedCategory === cat.id
                        ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                        : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            <div
              className="flex-1 overflow-y-auto p-3 space-y-2"
              onTouchMove={handleTouchMoveCatalog}
              onTouchEnd={handleTouchEndCatalog}
            >
              {filteredParts.map((part) => (
                <div
                  key={part.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, part.id)}
                  onClick={() => handleAddPart(part.id)}
                  onTouchStart={(e) => handleTouchStartCatalog(part.id, e)}
                  className="flex items-center justify-between p-2.5 bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-cyan-500/40 rounded-xl transition-all cursor-grab active:cursor-grabbing group select-none"
                  title="Long-press (500ms) or drag/click to add to craft"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center border border-slate-700">
                      {renderIcon(part.iconName)}
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-white">{part.name}</h4>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                        <span>{part.mass}t</span>
                        <span>·</span>
                        <span className="text-cyan-400">${part.cost}</span>
                      </div>
                    </div>
                  </div>
                  <div className="w-7 h-7 rounded-lg bg-cyan-500/10 text-cyan-400 group-hover:bg-cyan-500 group-hover:text-slate-950 flex items-center justify-center transition-all">
                    <GripVertical className="w-3.5 h-3.5" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Center: Main Focus - 3D Craft Assembly Bay with Drag & Drop Dropzone */}
        <div
          className="flex-1 flex flex-col bg-[#07090E] relative overflow-hidden"
          onDrop={handleDropOnAssembly}
          onDragOver={handleDragOver}
        >
          <div className="absolute top-4 left-4 z-20 flex flex-wrap items-center gap-2.5">
            <input
              type="text"
              value={currentCraft.name}
              onChange={(e) => setCurrentCraft({ ...currentCraft, name: e.target.value })}
              className="text-sm md:text-base font-bold text-white bg-slate-950/80 border border-slate-800 backdrop-blur rounded-xl px-3.5 py-2 focus:outline-none focus:border-cyan-500 w-48 md:w-auto"
            />
            <select
              value={selectedPresetId}
              onChange={(e) => handleLoadPreset(e.target.value)}
              className="bg-slate-950/80 backdrop-blur border border-slate-800 text-xs text-slate-300 rounded-xl px-3 py-2.5 focus:outline-none focus:border-cyan-500 cursor-pointer"
            >
              <option value="">Load Preset...</option>
              {CRAFT_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.name}</option>
              ))}
            </select>
            {autoDecoupleNotice && (
              <div className="px-3 py-1.5 rounded-xl bg-purple-500/20 border border-purple-500/40 text-purple-200 text-xs font-medium backdrop-blur-md shadow-lg animate-in fade-in duration-200">
                {autoDecoupleNotice}
              </div>
            )}
          </div>

          {/* On-Screen Camera Control HUD */}
          <div className="absolute top-20 left-4 z-20 bg-[#0B0E17]/90 backdrop-blur-md border border-slate-800 rounded-2xl p-3 shadow-2xl flex flex-col gap-2">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider text-center">Camera View</span>
            <div className="grid grid-cols-3 gap-1 w-32">
              <div />
              <button onClick={() => handlePan(0, 0.5)} className="p-2 bg-slate-900 hover:bg-slate-800 rounded text-slate-300 flex items-center justify-center text-xs cursor-pointer" title="Pan Up">▲</button>
              <div />
              <button onClick={() => handlePan(-0.5, 0)} className="p-2 bg-slate-900 hover:bg-slate-800 rounded text-slate-300 flex items-center justify-center text-xs cursor-pointer" title="Pan Left">◀</button>
              <button onClick={handleResetView} className="p-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 rounded flex items-center justify-center cursor-pointer" title="Reset View"><RefreshCw className="w-3.5 h-3.5" /></button>
              <button onClick={() => handlePan(0.5, 0)} className="p-2 bg-slate-900 hover:bg-slate-800 rounded text-slate-300 flex items-center justify-center text-xs cursor-pointer" title="Pan Right">▶</button>
              <div />
              <button onClick={() => handlePan(0, -0.5)} className="p-2 bg-slate-900 hover:bg-slate-800 rounded text-slate-300 flex items-center justify-center text-xs cursor-pointer" title="Pan Down">▼</button>
              <div />
            </div>
            <div className="flex items-center justify-between gap-1 pt-1 border-t border-slate-800">
              <button onClick={() => handleRotate(0.3, 0)} className="px-2 py-1 bg-slate-900 hover:bg-slate-800 rounded text-xs text-slate-300 cursor-pointer" title="Rotate Left">⟲ Rotate</button>
              <button onClick={() => handleRotate(-0.3, 0)} className="px-2 py-1 bg-slate-900 hover:bg-slate-800 rounded text-xs text-slate-300 cursor-pointer" title="Rotate Right">Rotate ⟳</button>
            </div>
            <div className="flex items-center justify-between gap-1">
              <button onClick={() => handleZoom(-1)} className="flex-1 py-1 bg-slate-900 hover:bg-slate-800 rounded text-xs text-slate-300 flex items-center justify-center gap-1 cursor-pointer"><ZoomIn className="w-3 h-3" /> Zoom In</button>
              <button onClick={() => handleZoom(1)} className="flex-1 py-1 bg-slate-900 hover:bg-slate-800 rounded text-xs text-slate-300 flex items-center justify-center gap-1 cursor-pointer"><ZoomOut className="w-3 h-3" /> Zoom Out</button>
            </div>
          </div>

          {/* Selected Part Inspector Modal / Floating Card */}
          {selectedPart && selectedPartDef && (
            <div className="absolute top-20 right-4 z-30 bg-[#0B0E17]/95 backdrop-blur-md border border-cyan-500/40 rounded-2xl p-4 shadow-2xl w-72 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-xs font-semibold text-white uppercase tracking-wider">Selected Part</h3>
                </div>
                <button
                  onClick={() => setSelectedPartInstanceId(null)}
                  className="p-1 rounded text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div>
                <h4 className="text-sm font-bold text-white">{selectedPartDef.name}</h4>
                <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                  Stage: {selectedPart.stage} · Mass: {selectedPartDef.mass}t
                </div>
              </div>

              <div className="grid grid-cols-4 gap-1.5 pt-1">
                <button
                  onClick={() => handleRotatePart(selectedPart.instanceId)}
                  className="py-2 px-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-[11px] font-medium text-slate-200 flex flex-col items-center gap-1 cursor-pointer"
                  title="Rotate 90 deg"
                >
                  <RotateCw className="w-3.5 h-3.5 text-cyan-400" />
                  Rotate
                </button>
                <button
                  onClick={() => handleMoveStage(selectedPart.instanceId, -1)}
                  className="py-2 px-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-[11px] font-medium text-slate-200 flex flex-col items-center gap-1 cursor-pointer"
                  title="Move to Earlier Stage (-1)"
                >
                  <ArrowDown className="w-3.5 h-3.5 text-emerald-400" />
                  Stage -1
                </button>
                <button
                  onClick={() => handleMoveStage(selectedPart.instanceId, 1)}
                  className="py-2 px-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-[11px] font-medium text-slate-200 flex flex-col items-center gap-1 cursor-pointer"
                  title="Move to Later Stage (+1)"
                >
                  <ArrowUp className="w-3.5 h-3.5 text-amber-400" />
                  Stage +1
                </button>
                <button
                  onClick={() => handleRemovePart(selectedPart.instanceId)}
                  className="py-2 px-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-xl text-[11px] font-medium text-rose-300 flex flex-col items-center gap-1 cursor-pointer"
                  title="Remove Part"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  Remove
                </button>
              </div>
            </div>
          )}

          {/* Three.js 3D Viewport centered in full focus */}
          <div ref={mountRef} className="flex-1 w-full h-full relative cursor-grab active:cursor-grabbing" title="Drag parts here to attach · Click part to inspect · Drag to rotate view" />

          {/* Bottom Floating Staging & Part Inspector Bar */}
          <div className="absolute bottom-4 left-4 right-4 z-20 bg-[#0B0E17]/90 backdrop-blur-md border border-slate-800/90 rounded-2xl p-3 md:p-4 flex items-center gap-3 overflow-x-auto shadow-2xl">
            <span className="text-xs font-semibold text-slate-400 uppercase shrink-0">Staging Stack:</span>
            {currentCraft.parts.length === 0 ? (
              <span className="text-xs text-slate-500 font-mono">No parts in assembly stack. Drag parts from Catalog above to begin.</span>
            ) : (
              currentCraft.parts.map((p, index) => {
                const def = PARTS_CATALOG.find((d) => d.id === p.partId);
                if (!def) return null;
                const isSelected = p.instanceId === selectedPartInstanceId;
                return (
                  <div
                    key={p.instanceId}
                    onClick={() => setSelectedPartInstanceId(p.instanceId)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all shrink-0 cursor-pointer ${
                      isSelected
                        ? 'bg-cyan-500/20 border-cyan-500 text-white shadow-lg shadow-cyan-500/20'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                      def.category === 'decoupler'
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                        : 'bg-cyan-500/15 text-cyan-400'
                    }`}>
                      S{p.stage}
                    </span>
                    <span className="text-xs font-semibold">{def.name}</span>
                    <div className="flex items-center gap-1 ml-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRotatePart(p.instanceId); }}
                        className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                        title="Rotate 90 deg"
                      >
                        <RotateCw className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleMoveStage(p.instanceId, -1); }}
                        className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-emerald-400 cursor-pointer"
                        title="Earlier Stage (-1)"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleMoveStage(p.instanceId, 1); }}
                        className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-400 cursor-pointer"
                        title="Later Stage (+1)"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRemovePart(p.instanceId); }}
                        className="p-1 rounded bg-rose-500/10 text-rose-400 hover:bg-rose-500 hover:text-white cursor-pointer"
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Pull-Out Drawer: Flight Readiness & Metrics */}
        {isReadinessOpen && (
          <div className="absolute lg:relative inset-y-0 right-0 w-80 bg-[#0B0E17]/95 lg:bg-[#0B0E17] backdrop-blur-md lg:backdrop-blur-none border-l border-slate-800 flex flex-col z-40 shadow-2xl p-6 justify-between transition-all">
            <div>
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-xs font-semibold text-white uppercase tracking-wider">Flight Readiness</h3>
                </div>
                <button
                  onClick={() => setIsReadinessOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-900 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
                  <span className="text-[10px] uppercase font-mono text-slate-400">Total Wet Mass</span>
                  <div className="text-2xl font-bold font-mono text-white mt-0.5">{totalWetMass.toFixed(1)} <span className="text-xs text-slate-400">t</span></div>
                </div>
                <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
                  <span className="text-[10px] uppercase font-mono text-slate-400">Total Thrust (Vacuum)</span>
                  <div className="text-2xl font-bold font-mono text-cyan-400 mt-0.5">{totalThrust} <span className="text-xs text-slate-400">kN</span></div>
                </div>
                <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
                  <span className="text-[10px] uppercase font-mono text-slate-400">Thrust-to-Weight Ratio (TWR)</span>
                  <div className={`text-2xl font-bold font-mono mt-0.5 ${twr >= 1.2 ? 'text-emerald-400' : twr > 0 ? 'text-amber-400' : 'text-rose-400'}`}>
                    {twr} <span className="text-xs text-slate-400">g</span>
                  </div>
                </div>
                <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
                  <span className="text-[10px] uppercase font-mono text-slate-400">Estimated Delta-V</span>
                  <div className="text-2xl font-bold font-mono text-purple-400 mt-0.5">{estimatedDeltaV} <span className="text-xs text-slate-400">m/s</span></div>
                </div>
              </div>
            </div>

            <button
              onClick={onLaunch}
              disabled={currentCraft.parts.length === 0}
              className="w-full py-3.5 bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-800 disabled:text-slate-600 text-slate-950 font-bold rounded-xl transition-all shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2 cursor-pointer text-xs uppercase tracking-wider"
            >
              <Rocket className="w-4 h-4 fill-current" /> Launch to Launchpad
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
