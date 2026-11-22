import React, { useEffect, useRef, useState } from 'react';
import { FlightState, CraftDesign, PlacedPart, PartDefinition } from '../types';
import { STELLAR_SYSTEM } from '../data/stellarSystem';
import { PARTS_CATALOG } from '../data/partsCatalog';
import { Play, Pause, FastForward, Navigation, ChevronUp, ChevronDown, Rocket, RotateCcw, RotateCw, Compass, Sparkles, Wind, Globe, X } from 'lucide-react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  createPlanetTexture,
  createCloudTexture,
  createAtmosphereLimbMaterial,
} from '../utils/planetVisuals';

interface FlightViewProps {
  flightState: FlightState;
  setFlightState: React.Dispatch<React.SetStateAction<FlightState>>;
  currentCraft: CraftDesign;
  isPaused: boolean;
  setIsPaused: React.Dispatch<React.SetStateAction<boolean>>;
  steerDirRef: React.MutableRefObject<number>;
}

interface TrackedPartMesh {
  mesh: THREE.Mesh;
  part: PlacedPart;
  def: PartDefinition;
  bottomLocalY: number;
  isInline: boolean;
}

interface DebrisItem {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  rotVel: THREE.Vector3;
  age: number;
}

interface FlightMilestoneToast {
  id: string;
  kind: 'space' | 'atmosphere' | 'orbit';
  title: string;
  subtitle: string;
}

export const FlightView: React.FC<FlightViewProps> = ({
  flightState,
  setFlightState,
  currentCraft,
  isPaused,
  setIsPaused,
  steerDirRef,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [isLaunched, setIsLaunched] = useState(() => flightState.met > 0 || flightState.throttle > 0);
  const [sceneResetKey, setSceneResetKey] = useState(0);

  // Collapsible panel states (minimized into pill buttons)
  const [panels, setPanels] = useState({
    telemetry: true,
    controls: true,
    staging: true,
  });

  // Active steering direction (-1 = tilt right/east, +1 = tilt left/west, 0 = none)
  const [activeSteerDir, setActiveSteerDir] = useState<number>(0);

  // Milestone notifications & orbital regime tracking
  const [milestoneToast, setMilestoneToast] = useState<FlightMilestoneToast | null>(null);
  const [isEscapeTrajectory, setIsEscapeTrajectory] = useState(false);
  const milestoneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevInSpaceRef = useRef<boolean>(false);
  const prevInOrbitRef = useRef<boolean>(false);

  // Refs synced with latest state for stable 60fps animation loop
  const flightStateRef = useRef(flightState);
  flightStateRef.current = flightState;

  const isLaunchedRef = useRef(isLaunched);
  isLaunchedRef.current = isLaunched;

  const prevMetRef = useRef(flightState.met);
  const prevDecoupledLenRef = useRef(flightState.decoupledParts.length);

  // Three.js refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const rocketGroupRef = useRef<THREE.Group | null>(null);
  const debrisGroupRef = useRef<THREE.Group | null>(null);
  const flameMeshRef = useRef<THREE.Mesh | null>(null);
  const umbilicalsGroupRef = useRef<THREE.Group | null>(null);
  const worldPadGroupRef = useRef<THREE.Group | null>(null);

  // Environment Three.js refs
  const planetGroupRef = useRef<THREE.Group | null>(null);
  const planetTerrainMeshRef = useRef<THREE.Mesh | null>(null);
  const planetCloudMeshRef = useRef<THREE.Mesh | null>(null);
  const padSurfaceYRef = useRef<number>(-5);
  const cloudsGroupRef = useRef<THREE.Group | null>(null);
  const starsMatRef = useRef<THREE.PointsMaterial | null>(null);
  const starsGroupRef = useRef<THREE.Group | null>(null);
  const speedParticlesRef = useRef<THREE.Points | null>(null);
  const speedParticlePositionsRef = useRef<Float32Array | null>(null);

  // Per-part mesh tracking & active debris list
  const partMeshesRef = useRef<Map<string, TrackedPartMesh>>(new Map());
  const processedDecoupledRef = useRef<Set<string>>(new Set());
  const debrisListRef = useRef<DebrisItem[]>([]);

  // Camera orbit rotation state for gimbal inspection
  const camAngleRef = useRef({ theta: 0.35, phi: Math.PI / 2.6, distance: 32 });
  const isDraggingRef = useRef(false);
  const mousePosRef = useRef({ x: 0, y: 0 });

  // Calculate inline stack height dynamically based on parts
  const inlineParts = currentCraft.parts.filter((p) => {
    const def = PARTS_CATALOG.find((d) => d.id === p.partId);
    return def && ['command', 'fuel', 'engine', 'booster', 'decoupler'].includes(def.category);
  });
  const craftHeight = Math.max(
    6,
    inlineParts.reduce((acc, p) => {
      const def = PARTS_CATALOG.find((d) => d.id === p.partId);
      return acc + (def?.category === 'decoupler' ? 0.6 : 2.0);
    }, 0)
  );

  // Reset launch hold state & rebuild 3D rocket meshes when a fresh launch resets state
  useEffect(() => {
    if (prevMetRef.current > 0 && flightState.met === 0 && flightState.throttle === 0) {
      setIsLaunched(false);
      isLaunchedRef.current = false;
      prevInSpaceRef.current = false;
      prevInOrbitRef.current = false;
      setIsEscapeTrajectory(false);
      setMilestoneToast(null);
    }
    if (prevDecoupledLenRef.current > 0 && flightState.decoupledParts.length === 0) {
      setSceneResetKey((k) => k + 1);
    }
    prevMetRef.current = flightState.met;
    prevDecoupledLenRef.current = flightState.decoupledParts.length;
  }, [flightState.met, flightState.throttle, flightState.decoupledParts.length]);

  const showMilestonePopUp = (toast: Omit<FlightMilestoneToast, 'id'>) => {
    if (milestoneTimerRef.current) {
      clearTimeout(milestoneTimerRef.current);
    }
    setMilestoneToast({ ...toast, id: 'ms_' + Date.now() });
    milestoneTimerRef.current = setTimeout(() => {
      setMilestoneToast(null);
    }, 4500);
  };

  // Detect Atmosphere <-> Space transitions & Stable Orbit achievement
  useEffect(() => {
    const body = STELLAR_SYSTEM.find((b) => b.id === flightState.bodyId) || STELLAR_SYSTEM[1];
    const atmHeight = body.atmosphereHeight;
    const r = Math.max(1, Math.hypot(flightState.pos.x, flightState.pos.y));
    const v = Math.hypot(flightState.vel.x, flightState.vel.y);
    const epsilon = (v * v) / 2 - body.mu / r;
    const escapeNow = epsilon >= -1e-6 && isLaunched && flightState.met > 0.5;
    if (escapeNow !== isEscapeTrajectory) {
      setIsEscapeTrajectory(escapeNow);
    }

    const inSpaceNow = flightState.altitude >= atmHeight;
    const inOrbitNow =
      !escapeNow &&
      flightState.periapsis > atmHeight &&
      flightState.apoapsis > atmHeight;

    if (isLaunched && flightState.met > 0.5) {
      if (inSpaceNow && !prevInSpaceRef.current) {
        showMilestonePopUp({
          kind: 'space',
          title: 'Entered Space — Exited Atmosphere',
          subtitle: `Crossed the ${atmHeight} km atmospheric boundary into vacuum space.`,
        });
      } else if (!inSpaceNow && prevInSpaceRef.current && flightState.altitude < atmHeight - 0.5) {
        showMilestonePopUp({
          kind: 'atmosphere',
          title: 'Atmospheric Re-Entry',
          subtitle: `Entered ${body.name.split(' ')[0]}'s atmosphere (<${atmHeight} km). Atmospheric drag active.`,
        });
      }

      if (inOrbitNow && !prevInOrbitRef.current) {
        showMilestonePopUp({
          kind: 'orbit',
          title: 'Stable Orbit Achieved!',
          subtitle: `Ap ${flightState.apoapsis.toLocaleString()} km · Pe ${flightState.periapsis.toLocaleString()} km — Orbit clears atmosphere.`,
        });
      }
    }

    prevInSpaceRef.current = inSpaceNow;
    prevInOrbitRef.current = inOrbitNow;
  }, [
    flightState.altitude,
    flightState.apoapsis,
    flightState.periapsis,
    flightState.pos,
    flightState.vel,
    flightState.bodyId,
    flightState.met,
    isLaunched,
    isEscapeTrajectory,
  ]);

  // Ensure fuel levels are initialized if empty
  useEffect(() => {
    if (Object.keys(flightState.fuelLevels).length === 0 && currentCraft.parts.length > 0) {
      const initialFuels: Record<string, number> = {};
      currentCraft.parts.forEach((p) => {
        const def = PARTS_CATALOG.find((d) => d.id === p.partId);
        if (def && def.fuelCapacity && def.fuelCapacity > 0) {
          initialFuels[p.instanceId] = def.fuelCapacity;
        }
      });
      setFlightState((prev) => ({ ...prev, fuelLevels: initialFuels }));
    }
  }, [currentCraft, flightState.fuelLevels, setFlightState]);

  // Keyboard steering support (A/D or Left/Right arrow keys)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        steerDirRef.current = 1;
        setActiveSteerDir(1);
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        steerDirRef.current = -1;
        setActiveSteerDir(-1);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'a', 'A', 'd', 'D'].includes(e.key)) {
        steerDirRef.current = 0;
        setActiveSteerDir(0);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // Setup Three.js Scene + Rich Flight Environment
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth || window.innerWidth;
    const height = mount.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c1e38);
    scene.fog = new THREE.FogExp2(0x0c1e38, 0.0028);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 25000);
    const { theta, phi, distance } = camAngleRef.current;
    camera.position.set(
      distance * Math.sin(phi) * Math.sin(theta),
      distance * Math.cos(phi),
      distance * Math.sin(phi) * Math.cos(theta)
    );
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Software WebGL detection
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl ? gl.getExtension('WEBGL_debug_renderer_info') : null;
    const gpu = ext && gl ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
    const isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software/i.test(gpu);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.shadowMap.enabled = !isSoftwareGl;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Studio Environment
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // Lighting
    const ambientLight = new THREE.HemisphereLight(0x93c5fd, 0x1e293b, 1.6);
    ambientLight.position.set(0, 80, 0);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfffbeb, 2.2);
    dirLight.position.set(45, 70, 35);
    dirLight.castShadow = true;
    scene.add(dirLight);

    // Clear tracking refs for this scene build
    partMeshesRef.current.clear();
    processedDecoupledRef.current = new Set(flightStateRef.current.decoupledParts);
    debrisListRef.current = [];

    // --- CELESTIAL SKY: Stars, Sun Aethel, Moon Lunara (beyond maximum planet retreat distance) ---
    const starsGroup = new THREE.Group();
    scene.add(starsGroup);
    starsGroupRef.current = starsGroup;

    const starCount = 1100;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const rStar = 4600 + Math.random() * 2800;
      const thetaStar = Math.random() * Math.PI * 2;
      const phiStar = Math.acos(2 * Math.random() - 1);
      starPositions[i * 3] = rStar * Math.sin(phiStar) * Math.cos(thetaStar);
      starPositions[i * 3 + 1] = rStar * Math.cos(phiStar);
      starPositions[i * 3 + 2] = rStar * Math.sin(phiStar) * Math.sin(thetaStar);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 8.5, transparent: true, opacity: 0.25, fog: false });
    starsMatRef.current = starMat;
    starsGroup.add(new THREE.Points(starGeo, starMat));

    // Distant Star Aethel glow sphere
    const aethelSky = new THREE.Mesh(
      new THREE.SphereGeometry(95, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0xfde68a, fog: false })
    );
    aethelSky.position.set(2200, 2600, -3400);
    starsGroup.add(aethelSky);

    // Distant Moon Lunara in upper sky (hidden when already on Lunara)
    const activeBodyId = flightStateRef.current.bodyId || 'aurelia';
    if (activeBodyId !== 'lunara') {
      const lunaraSky = new THREE.Mesh(
        new THREE.SphereGeometry(52, 24, 24),
        new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.9, fog: false })
      );
      lunaraSky.position.set(-1450, 1900, -2500);
      starsGroup.add(lunaraSky);
    }

    // --- ATMOSPHERIC CLOUDS LAYER ---
    const cloudsGroup = new THREE.Group();
    scene.add(cloudsGroup);
    cloudsGroupRef.current = cloudsGroup;

    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 1.0,
      metalness: 0.0,
      transparent: true,
      opacity: 0.55,
    });
    const puffGeo = new THREE.SphereGeometry(1, 10, 10);

    for (let c = 0; c < 42; c++) {
      const cluster = new THREE.Group();
      const puffCount = 3 + Math.floor(Math.random() * 4);
      for (let p = 0; p < puffCount; p++) {
        const puff = new THREE.Mesh(puffGeo, cloudMat);
        const s = 3.5 + Math.random() * 5.0;
        puff.scale.set(s * 1.4, s * 0.65, s);
        puff.position.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 2.5, (Math.random() - 0.5) * 6);
        cluster.add(puff);
      }
      cluster.position.set(
        (Math.random() - 0.5) * 260,
        35 + Math.random() * 140,
        (Math.random() - 0.5) * 240 - 20
      );
      cloudsGroup.add(cluster);
    }

    // --- FLIGHT SPEED MOTION PARTICLES ---
    const particleCount = 260;
    const pPositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      pPositions[i * 3] = (Math.random() - 0.5) * 110;
      pPositions[i * 3 + 1] = (Math.random() - 0.5) * 110;
      pPositions[i * 3 + 2] = (Math.random() - 0.5) * 110;
    }
    speedParticlePositionsRef.current = pPositions;
    const speedGeo = new THREE.BufferGeometry();
    speedGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
    const speedMat = new THREE.PointsMaterial({
      color: 0xbae6fd,
      size: 0.45,
      transparent: true,
      opacity: 0.55,
    });
    const speedParticles = new THREE.Points(speedGeo, speedMat);
    scene.add(speedParticles);
    speedParticlesRef.current = speedParticles;

    // Build Dynamic 3D Composite Rocket from currentCraft.parts
    const rocketGroup = new THREE.Group();
    scene.add(rocketGroup);
    rocketGroupRef.current = rocketGroup;

    // Debris Group for separated stages
    const debrisGroup = new THREE.Group();
    scene.add(debrisGroup);
    debrisGroupRef.current = debrisGroup;

    let topY = craftHeight / 2;
    let lowestY = topY;
    let radialCount = 0;

    if (currentCraft.parts.length === 0) {
      const fallbackGeo = new THREE.CylinderGeometry(1.2, 1.2, 4, 16);
      const fallbackMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.5, roughness: 0.2 });
      const fallbackMesh = new THREE.Mesh(fallbackGeo, fallbackMat);
      rocketGroup.add(fallbackMesh);
      lowestY = -2;
    } else {
      currentCraft.parts.forEach((p) => {
        const def = PARTS_CATALOG.find((d) => d.id === p.partId);
        if (!def) return;

        let mesh: THREE.Mesh;
        let partBottomY = topY;
        let isInline = true;

        const color =
          def.category === 'command'
            ? 0x3b82f6
            : def.category === 'engine'
            ? 0xef4444
            : def.category === 'booster'
            ? 0xf97316
            : def.category === 'aerodynamics'
            ? 0x10b981
            : 0xe2e8f0;

        if (def.category === 'command') {
          const geo = new THREE.ConeGeometry(1.2, 2.2, 16);
          const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.25 });
          mesh = new THREE.Mesh(geo, mat);
          mesh.position.set(0, topY - 1.0, 0);
          topY -= 2.0;
          partBottomY = topY;
          lowestY = Math.min(lowestY, topY);
        } else if (def.category === 'engine' || def.category === 'booster') {
          const geo = new THREE.CylinderGeometry(1.1, 1.35, 2.0, 16);
          const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.3 });
          mesh = new THREE.Mesh(geo, mat);
          mesh.position.set(0, topY - 1.0, 0);
          topY -= 2.0;
          partBottomY = topY;
          lowestY = Math.min(lowestY, topY);
        } else if (def.category === 'fuel' || def.category === 'decoupler') {
          const isDecoupler = def.category === 'decoupler';
          const step = isDecoupler ? 0.6 : 2.0;
          const geo = isDecoupler
            ? new THREE.CylinderGeometry(1.25, 1.25, 0.45, 16)
            : new THREE.CylinderGeometry(1.2, 1.2, 1.9, 16);
          const mat = new THREE.MeshStandardMaterial({
            color: isDecoupler ? 0x64748b : color,
            metalness: isDecoupler ? 0.8 : 0.4,
            roughness: isDecoupler ? 0.2 : 0.3,
          });
          mesh = new THREE.Mesh(geo, mat);
          mesh.position.set(0, topY - step / 2, 0);
          topY -= step;
          partBottomY = topY;
          lowestY = Math.min(lowestY, topY);
        } else if (def.category === 'aerodynamics') {
          isInline = false;
          const geo = new THREE.BoxGeometry(0.18, 1.2, 0.9);
          const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.25 });
          mesh = new THREE.Mesh(geo, mat);
          const sideSign = radialCount % 2 === 0 ? 1 : -1;
          mesh.position.set(sideSign * 1.45, topY + 1.5, 0);
          partBottomY = mesh.position.y - 0.6;
          radialCount++;
        } else {
          isInline = false;
          const geo = new THREE.BoxGeometry(0.45, 0.45, 0.45);
          const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.35, roughness: 0.4 });
          mesh = new THREE.Mesh(geo, mat);
          const sideSign = radialCount % 2 === 0 ? 1 : -1;
          mesh.position.set(sideSign * 1.3, craftHeight / 2 - 2.0, 0);
          partBottomY = mesh.position.y - 0.25;
          radialCount++;
        }

        if (p.rotation) {
          mesh.rotation.y = p.rotation;
        }
        mesh.castShadow = true;

        if (!processedDecoupledRef.current.has(p.instanceId)) {
          rocketGroup.add(mesh);
          partMeshesRef.current.set(p.instanceId, {
            mesh,
            part: p,
            def,
            bottomLocalY: partBottomY,
            isInline,
          });
        }
      });
    }

    // Exhaust Flame anchored right below the craft's lowest remaining inline part
    const flameGeo = new THREE.ConeGeometry(1.05, 3.6, 16);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.85 });
    const flameMesh = new THREE.Mesh(flameGeo, flameMat);
    flameMesh.position.y = lowestY - 1.8;
    flameMesh.rotation.x = Math.PI;
    flameMesh.scale.set(0.001, 0.001, 0.001);
    rocketGroup.add(flameMesh);
    flameMeshRef.current = flameMesh;

    // --- WORLD PAD & SURFACE TERRAIN GROUP ---
    const worldPadGroup = new THREE.Group();
    scene.add(worldPadGroup);
    worldPadGroupRef.current = worldPadGroup;

    const padSurfaceY = lowestY - 0.1;
    padSurfaceYRef.current = padSurfaceY;

    // --- CONTINUOUS CURVED CELESTIAL BODY SPHERE (Terrain + Clouds + Atmospheric Limb) ---
    const hostBodyDef = STELLAR_SYSTEM.find((b) => b.id === activeBodyId) || STELLAR_SYSTEM[1];
    const planetGroup = new THREE.Group();
    scene.add(planetGroup);
    planetGroupRef.current = planetGroup;

    const planetTexture = createPlanetTexture(hostBodyDef.id);
    const terrainMat = new THREE.MeshStandardMaterial({
      map: planetTexture,
      roughness: 0.85,
      metalness: 0.08,
    });
    const terrainSphere = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), terrainMat);
    terrainSphere.receiveShadow = true;
    planetGroup.add(terrainSphere);
    planetTerrainMeshRef.current = terrainSphere;

    let cloudTexture: THREE.CanvasTexture | null = null;
    if (hostBodyDef.atmosphereHeight > 0) {
      cloudTexture = createCloudTexture();
      const cloudMat = new THREE.MeshStandardMaterial({
        map: cloudTexture,
        transparent: true,
        opacity: 0.82,
        depthWrite: false,
        roughness: 0.95,
      });
      const cloudSphere = new THREE.Mesh(new THREE.SphereGeometry(1.012, 72, 48), cloudMat);
      planetGroup.add(cloudSphere);
      planetCloudMeshRef.current = cloudSphere;

      const limbColor = hostBodyDef.id === 'vespera' ? 0xc084fc : 0x38bdf8;
      const innerAtmoMesh = new THREE.Mesh(
        new THREE.SphereGeometry(1.016, 64, 48),
        createAtmosphereLimbMaterial(limbColor, false)
      );
      planetGroup.add(innerAtmoMesh);

      const outerAtmoMesh = new THREE.Mesh(
        new THREE.SphereGeometry(1.072, 64, 48),
        createAtmosphereLimbMaterial(limbColor, true)
      );
      planetGroup.add(outerAtmoMesh);
    } else {
      planetCloudMeshRef.current = null;
    }

    const initialVisualRadius = 2400;
    const initialBaseDrop = Math.abs(padSurfaceY) + 1.0;
    planetGroup.scale.setScalar(initialVisualRadius);
    planetGroup.position.set(0, -initialBaseDrop - initialVisualRadius, 0);

    // Dynamic Launch Structure & Gantry Tower scaled to craftHeight
    const towerHeight = craftHeight + 4.5;
    const gantryGeo = new THREE.BoxGeometry(1.4, towerHeight, 1.4);
    const gantryMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7, roughness: 0.3 });
    const gantryMesh = new THREE.Mesh(gantryGeo, gantryMat);
    gantryMesh.position.set(-4.5, padSurfaceY + towerHeight / 2, 0);
    gantryMesh.castShadow = true;
    worldPadGroup.add(gantryMesh);

    // Umbilical Arms Group anchored to gantry tower
    const umbilicalsGroup = new THREE.Group();
    umbilicalsGroup.position.set(-4.0, 0, 0);
    worldPadGroup.add(umbilicalsGroup);
    umbilicalsGroupRef.current = umbilicalsGroup;

    const armLength = 3.2;
    const armGeo = new THREE.CylinderGeometry(0.16, 0.16, armLength, 8);
    armGeo.rotateZ(Math.PI / 2);
    armGeo.translate(armLength / 2, 0, 0);
    const armMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.65 });

    for (let h = padSurfaceY + 2.0; h <= padSurfaceY + craftHeight - 0.5; h += 2.6) {
      const arm = new THREE.Mesh(armGeo, armMat);
      arm.position.set(0, h, 0);
      umbilicalsGroup.add(arm);
    }

    // Launch Pad Base & Apron
    const padGeo = new THREE.CylinderGeometry(6.5, 7.5, 1.0, 32);
    const padMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });
    const padMesh = new THREE.Mesh(padGeo, padMat);
    padMesh.position.y = padSurfaceY - 0.5;
    padMesh.receiveShadow = true;
    worldPadGroup.add(padMesh);

    const apronGeo = new THREE.CylinderGeometry(20, 22, 0.4, 32);
    const apronMat = new THREE.MeshStandardMaterial({ color: 0x263244, roughness: 0.9 });
    const apronMesh = new THREE.Mesh(apronGeo, apronMat);
    apronMesh.position.y = padSurfaceY - 0.9;
    apronMesh.receiveShadow = true;
    worldPadGroup.add(apronMesh);

    // Perimeter Launch Complex Beacon Lights / Pylons
    const pylonGeo = new THREE.BoxGeometry(0.6, 2.2, 0.6);
    const pylonMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.5 });
    const beaconGeo = new THREE.SphereGeometry(0.35, 8, 8);
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const px = Math.cos(angle) * 18;
      const pz = Math.sin(angle) * 18;
      const pylon = new THREE.Mesh(pylonGeo, pylonMat);
      pylon.position.set(px, padSurfaceY + 0.1, pz);
      worldPadGroup.add(pylon);
      const beacon = new THREE.Mesh(beaconGeo, beaconMat);
      beacon.position.set(px, padSurfaceY + 1.4, pz);
      worldPadGroup.add(beacon);
    }

    // Local Launch Complex Terrain Skirt (embeds flush into curved planet sphere and hides above 22 km)
    const skirtColor = activeBodyId === 'lunara' ? 0x4b5563 : activeBodyId === 'caelum' ? 0x065f46 : 0x14332d;
    const skirtGeo = new THREE.CylinderGeometry(240, 270, 18, 48);
    const skirtMat = new THREE.MeshStandardMaterial({ color: skirtColor, roughness: 0.95 });
    const skirtMesh = new THREE.Mesh(skirtGeo, skirtMat);
    skirtMesh.position.y = padSurfaceY - 10.1;
    skirtMesh.receiveShadow = true;
    worldPadGroup.add(skirtMesh);

    const ridgeColor = activeBodyId === 'lunara' ? 0x6b7280 : activeBodyId === 'caelum' ? 0x047857 : 0x1e463b;
    const ridgeMat = new THREE.MeshStandardMaterial({ color: ridgeColor, roughness: 0.95 });
    for (let m = 0; m < 22; m++) {
      const mAngle = (m / 22) * Math.PI * 2 + Math.random() * 0.15;
      const distM = 95 + Math.random() * 125;
      const mh = 12 + Math.random() * 26;
      const mr = 16 + Math.random() * 20;
      const mountain = new THREE.Mesh(new THREE.ConeGeometry(mr, mh, 6), ridgeMat);
      mountain.position.set(Math.cos(mAngle) * distM, padSurfaceY + mh / 2 - 3.5, Math.sin(mAngle) * distM);
      worldPadGroup.add(mountain);
    }

    const updateCameraFromAngles = () => {
      if (!cameraRef.current) return;
      const { theta: th, phi: ph, distance: dist } = camAngleRef.current;
      cameraRef.current.position.x = dist * Math.sin(ph) * Math.sin(th);
      cameraRef.current.position.y = dist * Math.cos(ph);
      cameraRef.current.position.z = dist * Math.sin(ph) * Math.cos(th);
      cameraRef.current.lookAt(0, 0, 0);
    };

    // Mouse / Touch gimbal camera drag handlers
    const handleMouseDown = (e: MouseEvent) => {
      isDraggingRef.current = true;
      mousePosRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const dx = e.clientX - mousePosRef.current.x;
      const dy = e.clientY - mousePosRef.current.y;
      mousePosRef.current = { x: e.clientX, y: e.clientY };

      camAngleRef.current.theta -= dx * 0.008;
      camAngleRef.current.phi = Math.max(0.15, Math.min(Math.PI / 2 - 0.05, camAngleRef.current.phi + dy * 0.008));
      updateCameraFromAngles();
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      camAngleRef.current.distance = Math.max(12, Math.min(80, camAngleRef.current.distance + e.deltaY * 0.02));
      updateCameraFromAngles();
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        isDraggingRef.current = true;
        mousePosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDraggingRef.current || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - mousePosRef.current.x;
      const dy = e.touches[0].clientY - mousePosRef.current.y;
      mousePosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };

      camAngleRef.current.theta -= dx * 0.008;
      camAngleRef.current.phi = Math.max(0.15, Math.min(Math.PI / 2 - 0.05, camAngleRef.current.phi + dy * 0.008));
      updateCameraFromAngles();
    };

    const handleTouchEnd = () => {
      isDraggingRef.current = false;
    };

    const domElem = renderer.domElement;
    domElem.addEventListener('mousedown', handleMouseDown);
    domElem.addEventListener('wheel', handleWheel, { passive: false });
    domElem.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    // Resize handler
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
      domElem.removeEventListener('mousedown', handleMouseDown);
      domElem.removeEventListener('wheel', handleWheel);
      domElem.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      planetTexture.dispose();
      cloudTexture?.dispose();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [craftHeight, currentCraft, flightState.bodyId, sceneResetKey]);

  // 3D visual sync & rendering loop (physics runs continuously in App.tsx)
  useEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now();
    const skyLowColor = new THREE.Color(0x0c1e38);
    const skyMidColor = new THREE.Color(0x0a1328);
    const skySpaceColor = new THREE.Color(0x020408);
    const workingSkyColor = new THREE.Color();

    const loop = (currentTime: number) => {
      const snap = flightStateRef.current;
      const dtReal = isPaused ? 0 : Math.min(0.05, (currentTime - lastTime) / 1000);
      lastTime = currentTime;

      const launchedNow = snap.throttle > 0 || snap.met > 0 || isLaunchedRef.current;
      if (launchedNow && !isLaunchedRef.current) {
        isLaunchedRef.current = true;
        setIsLaunched(true);
      }

      // Local craft velocity in scene coordinates (east = +X, up = +Y)
      const rNow = Math.max(1, Math.sqrt(snap.pos.x * snap.pos.x + snap.pos.y * snap.pos.y));
      const upXNow = snap.pos.x / rNow;
      const upYNow = snap.pos.y / rNow;
      const eastXNow = upYNow;
      const eastYNow = -upXNow;
      const vUp = snap.vel.x * upXNow + snap.vel.y * upYNow;
      const vEast = snap.vel.x * eastXNow + snap.vel.y * eastYNow;

      // --- DYNAMIC SKY, STARS, CLOUDS & SPHERICAL PLANET HORIZON ---
      const body = STELLAR_SYSTEM.find((b) => b.id === snap.bodyId) || STELLAR_SYSTEM[1];
      const atmRatio = body.atmosphereHeight > 0 ? Math.min(1, snap.altitude / body.atmosphereHeight) : 1;

      if (sceneRef.current) {
        if (atmRatio < 0.35) {
          workingSkyColor.copy(skyLowColor).lerp(skyMidColor, atmRatio / 0.35);
        } else {
          workingSkyColor.copy(skyMidColor).lerp(skySpaceColor, (atmRatio - 0.35) / 0.65);
        }
        sceneRef.current.background = workingSkyColor;
        if (sceneRef.current.fog instanceof THREE.FogExp2) {
          sceneRef.current.fog.color.copy(workingSkyColor);
          sceneRef.current.fog.density = 0.0028 * Math.max(0, 1 - atmRatio);
        }
        if (starsMatRef.current) {
          starsMatRef.current.opacity = 0.2 + atmRatio * 0.8;
        }
      }

      // Continuous altitude-scaled spherical planet retreat + orbital surface rotation
      const altRatio = Math.max(0, snap.altitude) / Math.max(50, body.radius);
      const visualRadius = 240 + 2160 / (1 + 14 * altRatio);
      const baseDrop = Math.abs(padSurfaceYRef.current) + 1.0;
      const surfaceDrop = baseDrop + visualRadius * altRatio * (1 + 2.2 * Math.exp(-12 * altRatio));
      const lonAngle = Math.atan2(snap.pos.y, snap.pos.x) - Math.PI / 2;

      if (planetGroupRef.current) {
        planetGroupRef.current.scale.setScalar(visualRadius);
        planetGroupRef.current.position.set(0, -surfaceDrop - visualRadius, 0);
      }
      if (planetTerrainMeshRef.current) {
        planetTerrainMeshRef.current.rotation.z = lonAngle;
      }
      if (planetCloudMeshRef.current) {
        planetCloudMeshRef.current.rotation.z = lonAngle;
        planetCloudMeshRef.current.rotation.y += 0.012 * dtReal;
      }

      // Scroll local low-altitude clouds opposite velocity
      if (cloudsGroupRef.current) {
        cloudsGroupRef.current.visible = body.atmosphereHeight > 0 && snap.altitude < 45;
        const scrollScale = 140;
        cloudsGroupRef.current.children.forEach((cluster) => {
          cluster.position.x -= vEast * scrollScale * dtReal;
          cluster.position.y -= vUp * scrollScale * dtReal;
          if (cluster.position.x < -140) cluster.position.x += 280;
          if (cluster.position.x > 140) cluster.position.x -= 280;
          if (cluster.position.y < -60) cluster.position.y += 220;
          if (cluster.position.y > 180) cluster.position.y -= 220;
        });
      }

      // Stream speed particles past the craft proportional to flight velocity
      if (speedParticlesRef.current && speedParticlePositionsRef.current) {
        const arr = speedParticlePositionsRef.current;
        const flowScale = 220;
        for (let i = 0; i < arr.length; i += 3) {
          arr[i] -= vEast * flowScale * dtReal;
          arr[i + 1] -= vUp * flowScale * dtReal;
          if (arr[i] < -55) arr[i] += 110;
          if (arr[i] > 55) arr[i] -= 110;
          if (arr[i + 1] < -55) arr[i + 1] += 110;
          if (arr[i + 1] > 55) arr[i + 1] -= 110;
        }
        speedParticlesRef.current.geometry.attributes.position.needsUpdate = true;
      }

      // --- VISIBLE 3D STAGE SEPARATION: Detach newly decoupled parts into tumbling 3D debris ---
      if (rocketGroupRef.current && debrisGroupRef.current) {
        rocketGroupRef.current.updateMatrixWorld(true);
        const rocketDown = new THREE.Vector3(0, -1, 0).applyEuler(rocketGroupRef.current.rotation).normalize();

        snap.decoupledParts.forEach((instId) => {
          if (!processedDecoupledRef.current.has(instId)) {
            processedDecoupledRef.current.add(instId);
            const tracked = partMeshesRef.current.get(instId);
            if (tracked) {
              const { mesh } = tracked;
              const worldPos = new THREE.Vector3();
              const worldQuat = new THREE.Quaternion();
              mesh.getWorldPosition(worldPos);
              mesh.getWorldQuaternion(worldQuat);

              rocketGroupRef.current?.remove(mesh);
              debrisGroupRef.current?.add(mesh);
              mesh.position.copy(worldPos);
              mesh.quaternion.copy(worldQuat);

              const separationVel = rocketDown
                .clone()
                .multiplyScalar(6.5 + Math.random() * 2.0)
                .add(new THREE.Vector3((Math.random() - 0.5) * 2.2, -1.5, (Math.random() - 0.5) * 2.2));

              debrisListRef.current.push({
                mesh,
                vel: separationVel,
                rotVel: new THREE.Vector3(
                  (Math.random() - 0.5) * 1.6,
                  (Math.random() - 0.5) * 1.0,
                  (Math.random() - 0.5) * 1.6
                ),
                age: 0,
              });
              partMeshesRef.current.delete(instId);
            }
          }
        });

        for (let i = debrisListRef.current.length - 1; i >= 0; i--) {
          const item = debrisListRef.current[i];
          item.age += dtReal;
          item.vel.y -= 9.5 * dtReal;
          item.mesh.position.addScaledVector(item.vel, dtReal);
          item.mesh.rotation.x += item.rotVel.x * dtReal;
          item.mesh.rotation.y += item.rotVel.y * dtReal;
          item.mesh.rotation.z += item.rotVel.z * dtReal;

          if (item.age > 8 || item.mesh.position.y < -90) {
            debrisGroupRef.current.remove(item.mesh);
            debrisListRef.current.splice(i, 1);
          }
        }
      }

      // Sync 3D Rocket Rotation, Dynamic Nozzle Position & Flame Scale
      if (rocketGroupRef.current) {
        rocketGroupRef.current.rotation.z = -((90 - snap.heading) * Math.PI) / 180;
      }

      if (flameMeshRef.current) {
        let lowestRemainingY = 0;
        let hasActiveEngine = false;

        partMeshesRef.current.forEach((tracked) => {
          if (tracked.isInline) {
            lowestRemainingY = Math.min(lowestRemainingY, tracked.bottomLocalY);
          }
          if (tracked.part.stage === snap.stage && tracked.def.thrust && tracked.def.thrust > 0) {
            if (tracked.def.fuelCapacity && tracked.def.fuelCapacity > 0) {
              if ((snap.fuelLevels[tracked.part.instanceId] || 0) > 0) hasActiveEngine = true;
            } else {
              const anyTankFuel = currentCraft.parts.some((tp) => {
                if (snap.decoupledParts.includes(tp.instanceId)) return false;
                const td = PARTS_CATALOG.find((d) => d.id === tp.partId);
                return td?.category === 'fuel' && (snap.fuelLevels[tp.instanceId] || 0) > 0;
              });
              if (anyTankFuel) hasActiveEngine = true;
            }
          }
        });

        flameMeshRef.current.position.y = lowestRemainingY - 1.8;
        const showFlame = snap.throttle > 0 && hasActiveEngine;
        const flameScaleY = showFlame ? snap.throttle * (0.85 + Math.random() * 0.35) : 0.001;
        flameMeshRef.current.scale.set(showFlame ? 1 : 0.001, flameScaleY, showFlame ? 1 : 0.001);
      }

      if (umbilicalsGroupRef.current) {
        const targetScaleX = launchedNow ? 0.05 : 1.0;
        umbilicalsGroupRef.current.scale.x = THREE.MathUtils.lerp(
          umbilicalsGroupRef.current.scale.x,
          targetScaleX,
          0.12
        );
      }
      if (worldPadGroupRef.current) {
        worldPadGroupRef.current.visible = snap.altitude < 22;
        worldPadGroupRef.current.position.y = -(surfaceDrop - baseDrop);
        worldPadGroupRef.current.position.x = -Math.max(-900, Math.min(900, lonAngle * visualRadius));
      }

      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }

      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isPaused, currentCraft]);

  const handleStageTrigger = () => {
    if (!isLaunchedRef.current) {
      isLaunchedRef.current = true;
      setIsLaunched(true);
      setFlightState((prev) => ({
        ...prev,
        throttle: prev.throttle === 0 ? 1.0 : prev.throttle,
      }));
      return;
    }

    setFlightState((prev) => {
      const remainingStages = currentCraft.parts
        .filter((p) => !prev.decoupledParts.includes(p.instanceId) && p.stage > prev.stage)
        .map((p) => p.stage);

      if (remainingStages.length === 0) return prev;

      const nextStage = Math.min(...remainingStages);
      const newlyDecoupled = currentCraft.parts
        .filter((p) => {
          const def = PARTS_CATALOG.find((d) => d.id === p.partId);
          return !prev.decoupledParts.includes(p.instanceId) && p.stage <= prev.stage && !def?.isCommand;
        })
        .map((p) => p.instanceId);

      return {
        ...prev,
        stage: nextStage,
        decoupledParts: Array.from(new Set([...prev.decoupledParts, ...newlyDecoupled])),
      };
    });
  };

  const handleManualLaunch = () => {
    isLaunchedRef.current = true;
    setIsLaunched(true);
    setFlightState((prev) => ({ ...prev, throttle: 1.0 }));
  };

  const startSteer = (dir: number) => {
    steerDirRef.current = dir;
    setActiveSteerDir(dir);
  };

  const stopSteer = () => {
    steerDirRef.current = 0;
    setActiveSteerDir(0);
  };

  const totalRemainingFuel = Object.values(flightState.fuelLevels).reduce((sum, val) => sum + val, 0);

  const activeStageParts = currentCraft.parts.filter(
    (p) => p.stage === flightState.stage && !flightState.decoupledParts.includes(p.instanceId)
  );
  const hasNextStage = currentCraft.parts.some(
    (p) => p.stage > flightState.stage && !flightState.decoupledParts.includes(p.instanceId)
  );

  const tiltFromVertical = Math.round(90 - flightState.heading);
  const tiltLabel =
    tiltFromVertical === 0
      ? '0° Vertical'
      : tiltFromVertical > 0
      ? `${tiltFromVertical}° East`
      : `${Math.abs(tiltFromVertical)}° West`;

  return (
    <div className="relative w-full h-[calc(100vh-73px)] bg-[#05070B] overflow-hidden select-none">
      {/* Dominant Immersive 3D Viewport in Background */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Left Side Angle / Pitch Input */}
      <div className="absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-2">
        <button
          onPointerDown={() => startSteer(1)}
          onPointerUp={stopSteer}
          onPointerLeave={stopSteer}
          onPointerCancel={stopSteer}
          className={`w-14 h-24 sm:w-16 sm:h-28 rounded-2xl backdrop-blur-md border shadow-2xl flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer touch-none ${
            activeSteerDir === 1
              ? 'bg-amber-500 text-slate-950 border-amber-300 scale-95 shadow-amber-500/40'
              : 'bg-[#0B0E17]/85 hover:bg-slate-900/95 text-amber-400 border-slate-700/80 hover:border-amber-400/60'
          }`}
          title="Hold or tap to pitch West / Left (A / Left Arrow)"
        >
          <RotateCcw className="w-6 h-6" />
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider">Pitch L</span>
        </button>
      </div>

      {/* Right Side Angle / Pitch Input */}
      <div className="absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-2">
        <button
          onPointerDown={() => startSteer(-1)}
          onPointerUp={stopSteer}
          onPointerLeave={stopSteer}
          onPointerCancel={stopSteer}
          className={`w-14 h-24 sm:w-16 sm:h-28 rounded-2xl backdrop-blur-md border shadow-2xl flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer touch-none ${
            activeSteerDir === -1
              ? 'bg-amber-500 text-slate-950 border-amber-300 scale-95 shadow-amber-500/40'
              : 'bg-[#0B0E17]/85 hover:bg-slate-900/95 text-amber-400 border-slate-700/80 hover:border-amber-400/60'
          }`}
          title="Hold or tap to pitch East / Right (D / Right Arrow)"
        >
          <RotateCw className="w-6 h-6" />
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider">Pitch R</span>
        </button>
      </div>

      {/* Floating Header Toolbar + Persistent Flight Regime Badge */}
      <div className="absolute top-4 left-4 right-4 flex flex-wrap items-center justify-between gap-2 z-20 pointer-events-none">
        <div className="flex items-center gap-2.5 pointer-events-auto">
          <div className="bg-[#0B0E17]/90 backdrop-blur-md border border-slate-800/80 px-4 py-2.5 rounded-2xl flex items-center gap-3 shadow-xl">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Navigation className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-xs font-bold text-white uppercase tracking-wider">Flight Simulator Deck</h1>
              <p className="text-[10px] text-slate-400 font-mono">Drag 3D View · Side Pads Steer Angle</p>
            </div>
          </div>

          {/* Persistent Flight Zone Badge (Atmosphere / Space / Orbit) */}
          {(() => {
            const activeBody = STELLAR_SYSTEM.find((b) => b.id === flightState.bodyId) || STELLAR_SYSTEM[1];
            const atmH = activeBody.atmosphereHeight;
            const inSpace = flightState.altitude >= atmH;
            const inStableOrbit =
              !isEscapeTrajectory &&
              flightState.periapsis > atmH &&
              flightState.apoapsis > atmH;

            if (inStableOrbit) {
              return (
                <div className="px-3.5 py-2 rounded-2xl bg-emerald-500/15 border border-emerald-400/50 backdrop-blur-md shadow-xl flex items-center gap-2 text-emerald-300">
                  <Globe className="w-4 h-4 text-emerald-400" />
                  <div className="leading-tight">
                    <div className="text-[10px] font-mono font-bold uppercase tracking-wider">Stable Orbit</div>
                    <div className="text-[10px] font-mono text-emerald-200/80">Pe {flightState.periapsis} km &gt; {atmH} km</div>
                  </div>
                </div>
              );
            }
            if (inSpace && isEscapeTrajectory) {
              return (
                <div className="px-3.5 py-2 rounded-2xl bg-amber-500/15 border border-amber-400/50 backdrop-blur-md shadow-xl flex items-center gap-2 text-amber-300">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <div className="leading-tight">
                    <div className="text-[10px] font-mono font-bold uppercase tracking-wider">Escape Trajectory</div>
                    <div className="text-[10px] font-mono text-amber-200/80">Deep Space (&gt;{atmH} km)</div>
                  </div>
                </div>
              );
            }
            if (inSpace) {
              return (
                <div className="px-3.5 py-2 rounded-2xl bg-indigo-500/20 border border-indigo-400/50 backdrop-blur-md shadow-xl flex items-center gap-2 text-indigo-200">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  <div className="leading-tight">
                    <div className="text-[10px] font-mono font-bold uppercase tracking-wider">Space · Suborbital</div>
                    <div className="text-[10px] font-mono text-indigo-200/80">Vacuum (&gt;{atmH} km)</div>
                  </div>
                </div>
              );
            }
            return (
              <div className="px-3.5 py-2 rounded-2xl bg-sky-500/15 border border-sky-400/40 backdrop-blur-md shadow-xl flex items-center gap-2 text-sky-200">
                <Wind className="w-4 h-4 text-sky-400" />
                <div className="leading-tight">
                  <div className="text-[10px] font-mono font-bold uppercase tracking-wider">Atmosphere</div>
                  <div className="text-[10px] font-mono text-sky-200/80">{flightState.altitude.toFixed(1)} / {atmH} km</div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Minimized Panel Pill Buttons */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {!panels.telemetry && (
            <button
              onClick={() => setPanels((p) => ({ ...p, telemetry: true }))}
              className="px-3 py-1.5 bg-[#0B0E17]/90 backdrop-blur border border-slate-800 rounded-xl text-xs font-mono text-cyan-400 shadow-lg hover:border-cyan-500/50 cursor-pointer flex items-center gap-1.5"
            >
              <span>Telemetry</span> <ChevronDown className="w-3.5 h-3.5" />
            </button>
          )}
          {!panels.controls && (
            <button
              onClick={() => setPanels((p) => ({ ...p, controls: true }))}
              className="px-3 py-1.5 bg-[#0B0E17]/90 backdrop-blur border border-slate-800 rounded-xl text-xs font-mono text-amber-400 shadow-lg hover:border-amber-500/50 cursor-pointer flex items-center gap-1.5"
            >
              <span>Controls</span> <ChevronDown className="w-3.5 h-3.5" />
            </button>
          )}
          {!panels.staging && (
            <button
              onClick={() => setPanels((p) => ({ ...p, staging: true }))}
              className="px-3 py-1.5 bg-[#0B0E17]/90 backdrop-blur border border-slate-800 rounded-xl text-xs font-mono text-rose-400 shadow-lg hover:border-rose-500/50 cursor-pointer flex items-center gap-1.5"
            >
              <span>Staging</span> <ChevronDown className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Auto-Dismissing Milestone Pop-Up Notification (Space Entry / Re-Entry / Orbit) */}
      {milestoneToast && (
        <div
          className={`absolute top-20 left-1/2 -translate-x-1/2 z-30 pointer-events-auto px-5 py-3 rounded-2xl backdrop-blur-lg border shadow-2xl flex items-center gap-3.5 max-w-md w-[90%] sm:w-auto animate-in fade-in duration-200 ${
            milestoneToast.kind === 'orbit'
              ? 'bg-emerald-950/90 border-emerald-400/60 text-emerald-100 shadow-emerald-500/20'
              : milestoneToast.kind === 'space'
              ? 'bg-indigo-950/90 border-indigo-400/60 text-indigo-100 shadow-indigo-500/20'
              : 'bg-amber-950/90 border-amber-400/60 text-amber-100 shadow-amber-500/20'
          }`}
        >
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              milestoneToast.kind === 'orbit'
                ? 'bg-emerald-500/20 text-emerald-400'
                : milestoneToast.kind === 'space'
                ? 'bg-indigo-500/20 text-indigo-300'
                : 'bg-amber-500/20 text-amber-400'
            }`}
          >
            {milestoneToast.kind === 'orbit' ? (
              <Globe className="w-5 h-5" />
            ) : milestoneToast.kind === 'space' ? (
              <Sparkles className="w-5 h-5" />
            ) : (
              <Wind className="w-5 h-5" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold uppercase tracking-wider">{milestoneToast.title}</div>
            <div className="text-[11px] opacity-85 font-mono leading-snug mt-0.5">{milestoneToast.subtitle}</div>
          </div>
          <button
            onClick={() => setMilestoneToast(null)}
            className="p-1 rounded-lg hover:bg-white/10 opacity-75 hover:opacity-100 cursor-pointer shrink-0"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Pre-Launch Pad Status Banner */}
      {!isLaunched && flightState.throttle === 0 && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 pointer-events-auto bg-cyan-500/20 border border-cyan-500/40 text-cyan-200 px-6 py-3 rounded-2xl backdrop-blur font-semibold shadow-2xl flex items-center gap-4 animate-bounce">
          <span className="text-xs sm:text-sm">Ready on Launch Gantry (Increase Throttle or Click Launch)</span>
          <button
            onClick={handleManualLaunch}
            className="px-4 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-lg cursor-pointer flex items-center gap-1.5 shrink-0"
          >
            <Rocket className="w-3.5 h-3.5" /> LAUNCH NOW
          </button>
        </div>
      )}

      {/* Floating Glass Panels Overlaid on 3D View */}
      <div className="absolute inset-0 pointer-events-none p-4 flex flex-col justify-between z-10">
        {/* Top Telemetry Panel */}
        <div className="flex justify-center pt-28">
          {panels.telemetry && (
            <div className="pointer-events-auto bg-[#0B0E17]/90 backdrop-blur-md border border-slate-800/80 p-4 rounded-2xl shadow-2xl w-full max-w-4xl grid grid-cols-2 md:grid-cols-4 gap-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-mono text-slate-400 uppercase">Altitude</span>
                  <div className="text-xl font-bold font-mono text-white">
                    {flightState.altitude.toLocaleString()} <span className="text-xs text-slate-400">km</span>
                  </div>
                </div>
                <button
                  onClick={() => setPanels((p) => ({ ...p, telemetry: false }))}
                  className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
                  title="Minimize Panel"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
              </div>
              <div>
                <span className="text-[10px] font-mono text-slate-400 uppercase">Surface Speed</span>
                <div className="text-xl font-bold font-mono text-cyan-400">
                  {flightState.surfaceSpeed} <span className="text-xs text-slate-400">km/s</span>
                </div>
              </div>
              <div>
                <span className="text-[10px] font-mono text-slate-400 uppercase">Apo / Periapsis</span>
                <div className="text-sm font-bold font-mono text-emerald-400">
                  {flightState.apoapsis} / {flightState.periapsis} <span className="text-xs text-slate-400">km</span>
                </div>
              </div>
              <div>
                <span className="text-[10px] font-mono text-slate-400 uppercase">MET · Fuel</span>
                <div className="text-lg font-bold font-mono text-amber-400">
                  T+{Math.floor(flightState.met)}s <span className="text-xs text-slate-400">({totalRemainingFuel.toFixed(1)}t)</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Status Banners */}
        {flightState.landed && isLaunched && flightState.met > 1 && (
          <div className="mx-auto z-20 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 px-6 py-2.5 rounded-2xl backdrop-blur font-semibold shadow-2xl">
            Vessel Landed Safely on Aurelia!
          </div>
        )}
        {flightState.crashed && (
          <div className="mx-auto z-20 bg-rose-500/20 border border-rose-500/40 text-rose-300 px-6 py-2.5 rounded-2xl backdrop-blur font-semibold shadow-2xl">
            Vessel Destroyed on Impact (Excessive Speed)
          </div>
        )}

        {/* Bottom / Side Floating Panels */}
        <div className="flex flex-col md:flex-row items-end justify-between gap-4 pb-4">
          {/* Controls Panel */}
          {panels.controls ? (
            <div className="pointer-events-auto bg-[#0B0E17]/90 backdrop-blur-md border border-slate-800/80 p-5 rounded-2xl shadow-2xl w-full md:w-80 space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-white uppercase tracking-wider">Flight Controls</h3>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setIsPaused(!isPaused)}
                    className="p-1.5 rounded-lg bg-slate-900 text-slate-300 hover:text-white border border-slate-800 cursor-pointer"
                    title={isPaused ? 'Resume' : 'Pause'}
                  >
                    {isPaused ? <Play className="w-3.5 h-3.5 text-emerald-400" /> : <Pause className="w-3.5 h-3.5 text-amber-400" />}
                  </button>
                  <button
                    onClick={() =>
                      setFlightState((prev) => ({ ...prev, timeWarp: prev.timeWarp >= 1000 ? 1 : prev.timeWarp * 10 }))
                    }
                    className="px-2 py-1 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 text-[10px] font-mono font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <FastForward className="w-3 h-3" /> {flightState.timeWarp}x
                  </button>
                  <button
                    onClick={() => setPanels((p) => ({ ...p, controls: false }))}
                    className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
                    title="Minimize Panel"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-mono">
                  <span className="text-slate-400">Throttle</span>
                  <span className="text-cyan-400 font-bold">{Math.round(flightState.throttle * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={flightState.throttle}
                  onChange={(e) => {
                    isLaunchedRef.current = true;
                    setIsLaunched(true);
                    setFlightState({ ...flightState, throttle: parseFloat(e.target.value) });
                  }}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>

              <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Compass className="w-4 h-4 text-amber-400" />
                  <div>
                    <div className="text-[10px] font-mono text-slate-400 uppercase">Pitch Angle</div>
                    <div className="text-xs font-mono font-bold text-amber-400">
                      {flightState.heading.toFixed(0)}° <span className="text-slate-400 font-normal">({tiltLabel})</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setFlightState((prev) => ({ ...prev, heading: 90 }))}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] font-mono font-semibold text-slate-200 cursor-pointer"
                  title="Snap Pitch Back to Vertical (90°)"
                >
                  Center 90°
                </button>
              </div>
            </div>
          ) : null}

          {/* Staging Panel */}
          {panels.staging ? (
            <div className="pointer-events-auto bg-[#0B0E17]/90 backdrop-blur-md border border-slate-800/80 p-5 rounded-2xl shadow-2xl w-full md:w-80 space-y-3 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-white uppercase tracking-wider">Vessel Staging</h3>
                <button
                  onClick={() => setPanels((p) => ({ ...p, staging: false }))}
                  className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
                  title="Minimize Panel"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-mono text-slate-400 uppercase">Active Stage</span>
                  <div className="text-xl font-bold font-mono text-rose-500">Stage #{flightState.stage}</div>
                </div>
                <button
                  onClick={handleStageTrigger}
                  disabled={isLaunched && !hasNextStage}
                  className="px-5 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-400 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold text-xs transition-all shadow-lg shadow-rose-500/20 cursor-pointer"
                >
                  {isLaunched ? (hasNextStage ? 'STAGE' : 'FINAL') : 'IGNITE'}
                </button>
              </div>

              <div className="space-y-1 max-h-24 overflow-y-auto">
                {activeStageParts.map((ap) => {
                  const def = PARTS_CATALOG.find((d) => d.id === ap.partId);
                  return (
                    <div key={ap.instanceId} className="flex items-center justify-between text-[10px] font-mono text-slate-300 px-2 py-1 bg-slate-950/60 rounded-lg">
                      <span className="truncate">{def?.name}</span>
                      <span className="text-cyan-400 shrink-0 ml-2">S{ap.stage}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
