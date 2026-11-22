import React, { useRef, useEffect, useState, useMemo } from 'react';
import { FlightState, ManeuverNode, TrackedVessel, Vector2D } from '../types';
import { STELLAR_SYSTEM } from '../data/stellarSystem';
import { computeOrbitalTrajectory } from '../utils/orbitalPhysics';
import {
  Globe,
  Plus,
  Trash2,
  Navigation,
  ChevronUp,
  ChevronDown,
  Rocket,
  ZoomIn,
  ZoomOut,
  Compass,
  Crosshair,
  ArrowRightLeft,
  Play,
  Pause,
  FastForward,
} from 'lucide-react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

interface MapViewProps {
  flightState: FlightState;
  setFlightState: React.Dispatch<React.SetStateAction<FlightState>>;
  maneuverNodes: ManeuverNode[];
  setManeuverNodes: React.Dispatch<React.SetStateAction<ManeuverNode[]>>;
  trackedFleet: TrackedVessel[];
  onSwitchToVessel: (vesselId: string) => void;
  isPaused: boolean;
  setIsPaused: React.Dispatch<React.SetStateAction<boolean>>;
}

const VISUAL_BODY_RADIUS: Record<string, number> = {
  aethel: 85,
  aurelia: 42,
  lunara: 16,
  caelum: 13,
  vespera: 70,
};

const VISUAL_ORBIT_RADIUS: Record<string, number> = {
  aethel: 0,
  aurelia: 1100,
  lunara: 160,
  caelum: 270,
  vespera: 2500,
};

const DEFAULT_FOCUS_DISTANCE: Record<string, number> = {
  aethel: 2400,
  aurelia: 360,
  lunara: 90,
  caelum: 80,
  vespera: 420,
};

const TIME_WARP_OPTIONS = [1, 10, 100, 1000, 10000];

function computeVisualAltitudeOffset(bodyId: string, altitudeKm: number, landed: boolean): number {
  if (landed) return 2.8;
  const body = STELLAR_SYSTEM.find((b) => b.id === bodyId) || STELLAR_SYSTEM[1];
  const visualR = VISUAL_BODY_RADIUS[body.id] || 42;
  const clampedAlt = Math.max(0, altitudeKm);
  const ratio = clampedAlt / Math.max(100, body.radius);
  return 2.8 + Math.min(72, ratio * visualR * 1.25);
}

function projectBodyKmTo3D(bodyId: string, posKm: Vector2D, out: THREE.Vector3, landed = false): THREE.Vector3 {
  const body = STELLAR_SYSTEM.find((b) => b.id === bodyId) || STELLAR_SYSTEM[1];
  const visualR = VISUAL_BODY_RADIUS[body.id] || 42;
  const rKm = Math.hypot(posKm.x, posKm.y);
  const altKm = Math.max(0, rKm - body.radius);
  const angle = posKm.x === 0 && posKm.y === 0 ? 0 : Math.atan2(posKm.y, posKm.x);
  const visualDist = visualR + computeVisualAltitudeOffset(bodyId, altKm, landed);
  out.set(Math.cos(angle) * visualDist, 0, Math.sin(angle) * visualDist);
  return out;
}

function getVesselStatusText(fs: FlightState): string {
  const body = STELLAR_SYSTEM.find((b) => b.id === fs.bodyId);
  const bodyName = body ? body.name.split(' ')[0] : fs.bodyId;
  if (fs.crashed) return `Destroyed · ${bodyName}`;
  if (fs.landed) {
    return fs.met === 0 && fs.bodyId === 'aurelia'
      ? `On Launchpad · ${bodyName}`
      : `Landed · ${bodyName}`;
  }
  const altStr = `${Math.round(Math.max(0, fs.altitude))} km`;
  if (body && body.atmosphereHeight > 0 && fs.periapsis > body.atmosphereHeight) {
    return `Orbiting ${bodyName} · ${altStr}`;
  }
  if (body && body.atmosphereHeight === 0 && fs.periapsis > 5) {
    return `Orbiting ${bodyName} · ${altStr}`;
  }
  return `In Flight (${bodyName}) · ${altStr}`;
}

export const MapView: React.FC<MapViewProps> = ({
  flightState,
  setFlightState,
  maneuverNodes,
  setManeuverNodes,
  trackedFleet,
  onSwitchToVessel,
  isPaused,
  setIsPaused,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);

  const [panels, setPanels] = useState({
    system: true,
    maneuvers: false,
    orbitStats: true,
  });

  // Default focus on active_vessel if in flight, otherwise Aurelia overview
  const [focusId, setFocusId] = useState<string>(() =>
    flightState.met > 0 ? 'active_vessel' : 'aurelia'
  );

  // Keep latest props & focus in refs so the Three.js WebGL context never tears down on telemetry ticks
  const flightStateRef = useRef<FlightState>(flightState);
  flightStateRef.current = flightState;

  const trackedFleetRef = useRef<TrackedVessel[]>(trackedFleet);
  trackedFleetRef.current = trackedFleet;

  const focusIdRef = useRef<string>(focusId);
  focusIdRef.current = focusId;

  const isPausedRef = useRef<boolean>(isPaused);
  isPausedRef.current = isPaused;

  // Interactive camera spherical coordinates
  const cameraSphericalRef = useRef({
    yaw: 0.7,
    pitch: 0.55,
    distance: flightState.met > 0 ? 150 : 360,
    targetDistance: flightState.met > 0 ? 150 : 360,
  });

  const handleSelectFocus = (id: string, isVessel = false) => {
    setFocusId(id);
    const defaultDist = isVessel ? (id === 'active_vessel' ? 140 : 95) : DEFAULT_FOCUS_DISTANCE[id] || 320;
    cameraSphericalRef.current.targetDistance = defaultDist;
  };

  const handleZoomStep = (factor: number) => {
    const cam = cameraSphericalRef.current;
    cam.targetDistance = Math.max(28, Math.min(6800, cam.targetDistance * factor));
  };

  // All vessels unified for UI list
  const allVessels = useMemo(() => {
    const activeEntry = {
      id: 'active_vessel',
      name: flightState.vesselName || 'Active Craft',
      isActive: true,
      flightState,
    };
    const fleetEntries = trackedFleet.map((v) => ({
      id: v.id,
      name: v.name,
      isActive: false,
      flightState: v.flightState,
    }));
    return [activeEntry, ...fleetEntries];
  }, [flightState, trackedFleet]);

  const focusedVessel = useMemo(() => {
    return allVessels.find((v) => v.id === focusId) || allVessels[0];
  }, [allVessels, focusId]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth || window.innerWidth;
    const height = mount.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x03050a);

    const camera = new THREE.PerspectiveCamera(55, width / height, 0.5, 40000);

    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl ? gl.getExtension('WEBGL_debug_renderer_info') : null;
    const gpu = ext && gl ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
    const isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software/i.test(gpu);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    mount.appendChild(renderer.domElement);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xdbeafe, 0.75);
    scene.add(ambientLight);

    const sunLight = new THREE.PointLight(0xfffbeb, 6.0, 20000, 0.4);
    sunLight.position.set(0, 0, 0);
    scene.add(sunLight);

    // Background 3D Starfield
    const starPositions: number[] = [];
    for (let i = 0; i < 1600; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 8500 + Math.random() * 5500;
      starPositions.push(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi)
      );
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xe2e8f0, size: 12, sizeAttenuation: true, transparent: true, opacity: 0.75 });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    const createOrbitRing = (radius: number, colorHex: string | number, opacity = 0.25) => {
      const geo = new THREE.BufferGeometry();
      const pts: THREE.Vector3[] = [];
      const segments = 128;
      for (let i = 0; i <= segments; i++) {
        const t = (i / segments) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(t) * radius, 0, Math.sin(t) * radius));
      }
      geo.setFromPoints(pts);
      return new THREE.Line(
        geo,
        new THREE.LineBasicMaterial({ color: colorHex, transparent: true, opacity })
      );
    };

    // Hierarchical body groups: bodyId -> THREE.Group
    const bodyGroups: Record<string, THREE.Group> = {};
    const orbitingBodies: { id: string; group: THREE.Group; orbitR: number; period: number; phase: number }[] = [];

    // 1. Star Aethel at (0, 0, 0)
    const aethelGroup = new THREE.Group();
    scene.add(aethelGroup);
    bodyGroups['aethel'] = aethelGroup;

    const aethelMesh = new THREE.Mesh(
      new THREE.SphereGeometry(VISUAL_BODY_RADIUS.aethel, 40, 40),
      new THREE.MeshBasicMaterial({ color: 0xf59e0b })
    );
    aethelGroup.add(aethelMesh);

    const aethelCorona = new THREE.Mesh(
      new THREE.SphereGeometry(VISUAL_BODY_RADIUS.aethel * 1.24, 32, 32),
      new THREE.MeshBasicMaterial({
        color: 0xfbbf24,
        transparent: true,
        opacity: 0.22,
        side: THREE.BackSide,
      })
    );
    aethelGroup.add(aethelCorona);

    // 2. Child planets and moons respecting parentId
    const createBodyVisual = (bodyId: string) => {
      const body = STELLAR_SYSTEM.find((b) => b.id === bodyId);
      if (!body || !body.parentId) return;

      const parentGroup = bodyGroups[body.parentId] || scene;
      const orbitR = VISUAL_ORBIT_RADIUS[body.id] || 400;
      const visualR = VISUAL_BODY_RADIUS[body.id] || 20;

      const ring = createOrbitRing(orbitR, body.colorHex, body.parentId === 'aurelia' ? 0.35 : 0.2);
      parentGroup.add(ring);

      const group = new THREE.Group();
      parentGroup.add(group);
      bodyGroups[body.id] = group;

      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(visualR, 36, 36),
        new THREE.MeshStandardMaterial({
          color: body.colorHex,
          roughness: body.id === 'vespera' ? 0.5 : 0.75,
          metalness: 0.1,
        })
      );
      group.add(mesh);

      if (body.atmosphereHeight > 0) {
        const atmoRatio = 1 + Math.min(0.22, (body.atmosphereHeight / body.radius) * 1.25);
        const atmoMesh = new THREE.Mesh(
          new THREE.SphereGeometry(visualR * atmoRatio, 32, 32),
          new THREE.MeshBasicMaterial({
            color: body.id === 'vespera' ? 0xc084fc : 0x38bdf8,
            transparent: true,
            opacity: 0.16,
            side: THREE.BackSide,
          })
        );
        group.add(atmoMesh);
      }

      if (body.id === 'vespera') {
        const ringGeo = new THREE.RingGeometry(visualR * 1.35, visualR * 1.98, 64);
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0xa78bfa,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.35,
        });
        const planetRing = new THREE.Mesh(ringGeo, ringMat);
        planetRing.rotation.x = Math.PI / 2 - 0.25;
        planetRing.rotation.y = 0.2;
        group.add(planetRing);
      }

      const initialPhase = body.id === 'aurelia' ? 0.4 : body.id === 'lunara' ? 1.1 : body.id === 'caelum' ? 3.8 : 2.3;
      orbitingBodies.push({
        id: body.id,
        group,
        orbitR,
        period: Math.max(100, body.orbitPeriod),
        phase: initialPhase,
      });
    };

    STELLAR_SYSTEM.filter((b) => b.parentId === 'aethel').forEach((b) => createBodyVisual(b.id));
    STELLAR_SYSTEM.filter((b) => b.parentId && b.parentId !== 'aethel').forEach((b) => createBodyVisual(b.id));

    // --- Real-Time Active Flight Path, Traveled Trail & Ap/Pe/Impact Markers ---
    const MAX_PREDICTED_PTS = 180;
    const predictedBuffer = new Float32Array(MAX_PREDICTED_PTS * 3);
    const predictedGeo = new THREE.BufferGeometry();
    predictedGeo.setAttribute('position', new THREE.BufferAttribute(predictedBuffer, 3));
    predictedGeo.setDrawRange(0, 0);
    const predictedMat = new THREE.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.92 });
    const predictedLine = new THREE.Line(predictedGeo, predictedMat);
    predictedLine.frustumCulled = false;

    const MAX_TRAIL_PTS = 320;
    const trailBuffer = new Float32Array(MAX_TRAIL_PTS * 3);
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailBuffer, 3));
    trailGeo.setDrawRange(0, 0);
    const trailMat = new THREE.LineBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.9 });
    const trailLine = new THREE.Line(trailGeo, trailMat);
    trailLine.frustumCulled = false;

    const apMarker = new THREE.Mesh(
      new THREE.OctahedronGeometry(2.2, 0),
      new THREE.MeshBasicMaterial({ color: 0x10b981 })
    );
    apMarker.visible = false;

    const peMarker = new THREE.Mesh(
      new THREE.OctahedronGeometry(2.2, 0),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    );
    peMarker.visible = false;

    const impactMarker = new THREE.Mesh(
      new THREE.ConeGeometry(1.8, 4.4, 4),
      new THREE.MeshBasicMaterial({ color: 0xf43f5e })
    );
    impactMarker.visible = false;

    let activePathBodyId = '';

    // Dynamic Vessel Visual Registry
    interface VesselVisual {
      id: string;
      root: THREE.Group;
      marker: THREE.Group;
      orbitLine: THREE.Line;
      currentBodyId: string;
      orbitRadiusCached: number;
    }
    const vesselVisuals = new Map<string, VesselVisual>();

    const buildVesselMesh = (isActive: boolean, isLanded: boolean) => {
      const marker = new THREE.Group();
      const accentColor = isActive ? 0x06b6d4 : isLanded ? 0xf59e0b : 0x10b981;

      if (isLanded) {
        const pod = new THREE.Mesh(
          new THREE.ConeGeometry(2.2, 4.5, 6),
          new THREE.MeshStandardMaterial({ color: accentColor, metalness: 0.5, roughness: 0.3, emissive: accentColor, emissiveIntensity: 0.35 })
        );
        pod.position.y = 1.5;
        marker.add(pod);

        const beacon = new THREE.Mesh(
          new THREE.CylinderGeometry(0.25, 0.9, 10, 8),
          new THREE.MeshBasicMaterial({ color: accentColor, transparent: true, opacity: 0.55 })
        );
        beacon.position.y = 6.5;
        marker.add(beacon);
      } else {
        const hull = new THREE.Mesh(
          new THREE.ConeGeometry(1.9, 5.2, 12),
          new THREE.MeshStandardMaterial({
            color: accentColor,
            metalness: 0.65,
            roughness: 0.25,
            emissive: accentColor,
            emissiveIntensity: 0.4,
          })
        );
        hull.rotation.x = Math.PI / 2;
        marker.add(hull);

        const wing = new THREE.Mesh(
          new THREE.BoxGeometry(7.5, 0.2, 1.6),
          new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.8, roughness: 0.2 })
        );
        marker.add(wing);

        const ring = new THREE.Mesh(
          new THREE.RingGeometry(3.2, 4.2, 24),
          new THREE.MeshBasicMaterial({ color: accentColor, side: THREE.DoubleSide, transparent: true, opacity: 0.7 })
        );
        ring.rotation.x = Math.PI / 2;
        marker.add(ring);
      }
      return marker;
    };

    const tempVec = new THREE.Vector3();
    const upVec = new THREE.Vector3(0, 1, 0);

    const syncVesselsAndRealTimePaths = (simTime: number) => {
      const currentFs = flightStateRef.current;
      const fleet = trackedFleetRef.current;

      const desiredVessels: { id: string; fs: FlightState; isActive: boolean }[] = [
        { id: 'active_vessel', fs: currentFs, isActive: true },
        ...fleet.map((v) => ({ id: v.id, fs: v.flightState, isActive: false })),
      ];

      const desiredIds = new Set(desiredVessels.map((v) => v.id));

      for (const [id, vis] of vesselVisuals.entries()) {
        if (!desiredIds.has(id)) {
          vis.root.parent?.remove(vis.root);
          vis.orbitLine.parent?.remove(vis.orbitLine);
          vesselVisuals.delete(id);
        }
      }

      desiredVessels.forEach(({ id, fs, isActive }, index) => {
        const bodyId = bodyGroups[fs.bodyId] ? fs.bodyId : 'aurelia';
        const parentBodyGroup = bodyGroups[bodyId];
        const visualR = VISUAL_BODY_RADIUS[bodyId] || 42;
        const altOffset = computeVisualAltitudeOffset(bodyId, fs.altitude, fs.landed);
        const orbitR = visualR + altOffset;

        let vis = vesselVisuals.get(id);
        if (!vis || vis.currentBodyId !== bodyId || vis.marker.userData.isLanded !== fs.landed) {
          if (vis) {
            vis.root.parent?.remove(vis.root);
            vis.orbitLine.parent?.remove(vis.orbitLine);
          }

          const root = new THREE.Group();
          const marker = buildVesselMesh(isActive, fs.landed);
          marker.userData.isLanded = fs.landed;
          root.add(marker);
          parentBodyGroup.add(root);

          // For archived fleet vessels, draw their static orbital ring; active vessel uses live predictedLine + trailLine
          const orbitLine = createOrbitRing(orbitR, 0x10b981, 0.4);
          orbitLine.visible = !isActive && !fs.landed;
          parentBodyGroup.add(orbitLine);

          vis = {
            id,
            root,
            marker,
            orbitLine,
            currentBodyId: bodyId,
            orbitRadiusCached: orbitR,
          };
          vesselVisuals.set(id, vis);
        }

        if (!isActive && !fs.landed && Math.abs(vis.orbitRadiusCached - orbitR) > 0.2) {
          vis.orbitLine.parent?.remove(vis.orbitLine);
          vis.orbitLine = createOrbitRing(orbitR, 0x10b981, 0.4);
          parentBodyGroup.add(vis.orbitLine);
          vis.orbitRadiusCached = orbitR;
        }
        vis.orbitLine.visible = !isActive && !fs.landed;

        // Position vessel in host body local coordinates
        const baseAngle =
          fs.pos.x === 0 && fs.pos.y === 0
            ? index * 1.2
            : Math.atan2(fs.pos.y, fs.pos.x);

        const orbitalAngularRate = !fs.landed && !isActive ? 0.14 : 0;
        const angle = baseAngle + simTime * orbitalAngularRate;

        const vx = Math.cos(angle) * orbitR;
        const vz = Math.sin(angle) * orbitR;
        vis.root.position.set(vx, 0, vz);

        if (fs.landed) {
          const radialDir = new THREE.Vector3(vx, 0, vz).normalize();
          vis.marker.quaternion.setFromUnitVectors(upVec, radialDir);
        } else {
          // Point craft along live velocity direction when active, or orbit tangent when archived
          let tanX = -Math.sin(angle);
          let tanZ = Math.cos(angle);
          if (isActive && Math.hypot(fs.vel.x, fs.vel.y) > 1e-4) {
            const vMag = Math.hypot(fs.vel.x, fs.vel.y);
            // Map 2D radial/tangential velocity into visual orbit plane smoothly
            const body = STELLAR_SYSTEM.find((b) => b.id === bodyId) || STELLAR_SYSTEM[1];
            const futurePos = { x: fs.pos.x + fs.vel.x * 2, y: fs.pos.y + fs.vel.y * 2 };
            const cur3D = projectBodyKmTo3D(bodyId, fs.pos, new THREE.Vector3(), false);
            const next3D = projectBodyKmTo3D(bodyId, futurePos, new THREE.Vector3(), false);
            const delta3D = next3D.sub(cur3D);
            if (delta3D.lengthSq() > 1e-6 && body) {
              delta3D.normalize();
              tanX = delta3D.x;
              tanZ = delta3D.z;
            } else if (vMag > 0) {
              tanX = fs.vel.x / vMag;
              tanZ = fs.vel.y / vMag;
            }
          }
          const tangentDir = new THREE.Vector3(tanX, 0, tanZ).normalize();
          vis.marker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangentDir);
        }
      });

      // --- Update Active Craft's Real-Time Predicted Flight Line, Trail & Ap/Pe Beacons ---
      const activeBodyId = bodyGroups[currentFs.bodyId] ? currentFs.bodyId : 'aurelia';
      if (activePathBodyId !== activeBodyId) {
        activePathBodyId = activeBodyId;
        const targetBodyGroup = bodyGroups[activeBodyId];
        targetBodyGroup.add(predictedLine);
        targetBodyGroup.add(trailLine);
        targetBodyGroup.add(apMarker);
        targetBodyGroup.add(peMarker);
        targetBodyGroup.add(impactMarker);
      }

      const activeBodyDef = STELLAR_SYSTEM.find((b) => b.id === activeBodyId) || STELLAR_SYSTEM[1];

      // 1. Traveled Flight Trail
      const trailPoints = currentFs.orbitTrail;
      if (currentFs.met > 0.1 && trailPoints.length > 0) {
        const count = Math.min(MAX_TRAIL_PTS - 1, trailPoints.length);
        const startIdx = trailPoints.length - count;
        for (let i = 0; i < count; i++) {
          projectBodyKmTo3D(activeBodyId, trailPoints[startIdx + i], tempVec, false);
          trailBuffer[i * 3] = tempVec.x;
          trailBuffer[i * 3 + 1] = tempVec.y;
          trailBuffer[i * 3 + 2] = tempVec.z;
        }
        // Connect cleanly to the craft's exact current position
        projectBodyKmTo3D(activeBodyId, currentFs.pos, tempVec, currentFs.landed);
        trailBuffer[count * 3] = tempVec.x;
        trailBuffer[count * 3 + 1] = tempVec.y;
        trailBuffer[count * 3 + 2] = tempVec.z;

        trailGeo.attributes.position.needsUpdate = true;
        trailGeo.setDrawRange(0, count + 1);
        trailGeo.computeBoundingSphere();
        trailLine.visible = true;
      } else {
        trailLine.visible = false;
      }

      // 2. Real-Time Predicted Keplerian Flight Line + Ap/Pe/Impact Markers
      if (!currentFs.landed && currentFs.met > 0.05) {
        const traj = computeOrbitalTrajectory(currentFs, 140);
        const ptCount = Math.min(MAX_PREDICTED_PTS, traj.points.length);

        for (let i = 0; i < ptCount; i++) {
          projectBodyKmTo3D(activeBodyId, traj.points[i], tempVec, false);
          predictedBuffer[i * 3] = tempVec.x;
          predictedBuffer[i * 3 + 1] = tempVec.y;
          predictedBuffer[i * 3 + 2] = tempVec.z;
        }
        predictedGeo.attributes.position.needsUpdate = true;
        predictedGeo.setDrawRange(0, ptCount);
        predictedGeo.computeBoundingSphere();
        predictedLine.visible = ptCount > 1;

        if (traj.isEscape) {
          predictedMat.color.setHex(0xf59e0b);
        } else if (traj.isClosedOrbit && currentFs.periapsis > activeBodyDef.atmosphereHeight) {
          predictedMat.color.setHex(0x10b981);
        } else {
          predictedMat.color.setHex(0x22d3ee);
        }

        if (traj.apoapsisPoint && traj.apoapsisPoint.altitude > 0.2) {
          projectBodyKmTo3D(activeBodyId, traj.apoapsisPoint, apMarker.position, false);
          apMarker.rotation.y += 0.03;
          apMarker.visible = true;
        } else {
          apMarker.visible = false;
        }

        if (traj.periapsisPoint && traj.periapsisPoint.altitude > 0.2) {
          projectBodyKmTo3D(activeBodyId, traj.periapsisPoint, peMarker.position, false);
          peMarker.rotation.y -= 0.03;
          peMarker.visible = true;
        } else {
          peMarker.visible = false;
        }

        if (traj.impactPoint && !traj.isClosedOrbit && !traj.isEscape) {
          projectBodyKmTo3D(activeBodyId, traj.impactPoint, impactMarker.position, false);
          const radial = impactMarker.position.clone().normalize();
          impactMarker.quaternion.setFromUnitVectors(upVec, radial);
          impactMarker.visible = true;
        } else {
          impactMarker.visible = false;
        }
      } else {
        predictedLine.visible = false;
        apMarker.visible = false;
        peMarker.visible = false;
        impactMarker.visible = false;
      }
    };

    // Interactive Drag / Touch / Wheel Camera Listeners
    let isDragging = false;
    let lastPointer = { x: 0, y: 0 };
    let lastPinchDist: number | null = null;

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      lastPointer = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - lastPointer.x;
      const dy = e.clientY - lastPointer.y;
      lastPointer = { x: e.clientX, y: e.clientY };

      cameraSphericalRef.current.yaw -= dx * 0.0065;
      cameraSphericalRef.current.pitch = Math.max(
        0.08,
        Math.min(Math.PI / 2 - 0.05, cameraSphericalRef.current.pitch + dy * 0.0065)
      );
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.12 : 0.89;
      const cam = cameraSphericalRef.current;
      cam.targetDistance = Math.max(28, Math.min(6800, cam.targetDistance * factor));
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        isDragging = true;
        lastPointer = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        lastPinchDist = null;
      } else if (e.touches.length === 2) {
        isDragging = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastPinchDist = Math.hypot(dx, dy);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1 && isDragging) {
        e.preventDefault();
        const dx = e.touches[0].clientX - lastPointer.x;
        const dy = e.touches[0].clientY - lastPointer.y;
        lastPointer = { x: e.touches[0].clientX, y: e.touches[0].clientY };

        cameraSphericalRef.current.yaw -= dx * 0.007;
        cameraSphericalRef.current.pitch = Math.max(
          0.08,
          Math.min(Math.PI / 2 - 0.05, cameraSphericalRef.current.pitch + dy * 0.007)
        );
      } else if (e.touches.length === 2 && lastPinchDist !== null) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        if (dist > 0) {
          const factor = lastPinchDist / dist;
          const cam = cameraSphericalRef.current;
          cam.targetDistance = Math.max(28, Math.min(6800, cam.targetDistance * factor));
          lastPinchDist = dist;
        }
      }
    };

    const onTouchEnd = () => {
      isDragging = false;
      lastPinchDist = null;
    };

    const domEl = renderer.domElement;
    domEl.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    domEl.addEventListener('wheel', onWheel, { passive: false });
    domEl.addEventListener('touchstart', onTouchStart, { passive: false });
    domEl.addEventListener('touchmove', onTouchMove, { passive: false });
    domEl.addEventListener('touchend', onTouchEnd);

    let animationFrameId: number;
    let lastFrameTime = performance.now();
    let simTime = 0;
    const currentLookAt = new THREE.Vector3(1100 * Math.cos(0.4), 0, 1100 * Math.sin(0.4));
    const targetWorldPos = new THREE.Vector3();

    const animate = () => {
      const now = performance.now();
      const dtReal = Math.min(0.05, (now - lastFrameTime) / 1000);
      lastFrameTime = now;

      if (!isPausedRef.current) {
        const warpBoost = 1 + Math.log10(Math.max(1, flightStateRef.current.timeWarp)) * 0.8;
        simTime += dtReal * warpBoost;
      }

      // 1. Update planetary & lunar orbits hierarchically
      orbitingBodies.forEach((bm) => {
        const angularSpeed = (Math.PI * 2) / (bm.period * 0.045);
        const angle = bm.phase + simTime * angularSpeed;
        bm.group.position.set(Math.cos(angle) * bm.orbitR, 0, Math.sin(angle) * bm.orbitR);
      });

      // 2. Sync all active & tracked vessels + live predicted flight lines & trail
      syncVesselsAndRealTimePaths(simTime);

      scene.updateMatrixWorld(true);

      // 3. Camera focus tracking
      const fId = focusIdRef.current;
      const vesselVis = vesselVisuals.get(fId);
      if (vesselVis) {
        vesselVis.root.getWorldPosition(targetWorldPos);
      } else if (bodyGroups[fId]) {
        bodyGroups[fId].getWorldPosition(targetWorldPos);
      } else {
        targetWorldPos.set(0, 0, 0);
      }

      currentLookAt.lerp(targetWorldPos, 0.16);
      const camSph = cameraSphericalRef.current;
      camSph.distance += (camSph.targetDistance - camSph.distance) * 0.16;

      const horizDist = camSph.distance * Math.cos(camSph.pitch);
      camera.position.set(
        currentLookAt.x + horizDist * Math.cos(camSph.yaw),
        currentLookAt.y + camSph.distance * Math.sin(camSph.pitch),
        currentLookAt.z + horizDist * Math.sin(camSph.yaw)
      );
      camera.lookAt(currentLookAt);

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
      domEl.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      domEl.removeEventListener('wheel', onWheel);
      domEl.removeEventListener('touchstart', onTouchStart);
      domEl.removeEventListener('touchmove', onTouchMove);
      domEl.removeEventListener('touchend', onTouchEnd);
      cancelAnimationFrame(animationFrameId);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  const handleAddManeuverNode = () => {
    const newNode: ManeuverNode = {
      id: 'node_' + Math.random().toString(36).substr(2, 9),
      timeOffset: 300,
      deltaV: { prograde: 150, normal: 0, radial: 0 },
    };
    setManeuverNodes([...maneuverNodes, newNode]);
  };

  const handleDeleteNode = (id: string) => {
    setManeuverNodes(maneuverNodes.filter((n) => n.id !== id));
  };

  const focusedBody = STELLAR_SYSTEM.find((b) => b.id === focusId);

  return (
    <div className="relative w-full h-[calc(100vh-73px)] bg-[#03050A] overflow-hidden select-none">
      {/* Fullscreen Interactive 3D Planetary & Fleet Viewport */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Floating Header Toolbar + Time Warp & Simulation Bar */}
      <div className="absolute top-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 z-20 pointer-events-none">
        <div className="flex flex-wrap items-center gap-2 pointer-events-auto">
          <div className="bg-[#0B0E17]/90 backdrop-blur-md border border-slate-800/80 px-3.5 py-2 rounded-2xl flex items-center gap-3 shadow-xl">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-xs font-bold text-white uppercase tracking-wider">Orbital Map & Trajectories</h1>
              <p className="text-[10px] text-slate-400 font-mono tabular-nums">
                {allVessels.length} Vessels · MET T+{Math.floor(flightState.met)}s
              </p>
            </div>
          </div>

          {/* Live Simulation Play/Pause & Time Warp Strip */}
          <div className="bg-[#0B0E17]/90 backdrop-blur-md border border-slate-800/80 p-1.5 rounded-2xl flex items-center gap-1 shadow-xl">
            <button
              onClick={() => setIsPaused((p) => !p)}
              className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 cursor-pointer flex items-center gap-1"
              title={isPaused ? 'Resume Simulation' : 'Pause Simulation'}
            >
              {isPaused ? (
                <Play className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Pause className="w-3.5 h-3.5 text-amber-400" />
              )}
            </button>
            <div className="flex items-center gap-0.5 px-1">
              <FastForward className="w-3.5 h-3.5 text-cyan-400 mr-1 hidden sm:block" />
              {TIME_WARP_OPTIONS.map((warp) => (
                <button
                  key={warp}
                  onClick={() => setFlightState((prev) => ({ ...prev, timeWarp: warp }))}
                  className={`px-2 py-1 rounded-lg text-[10px] font-mono tabular-nums font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    flightState.timeWarp === warp
                      ? 'bg-cyan-500 text-slate-950 font-bold'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                  }`}
                >
                  {warp >= 1000 ? `${warp / 1000}k` : `${warp}x`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Minimized Panel Pill Buttons */}
        <div className="flex flex-wrap items-center justify-end gap-2 pointer-events-auto">
          {!panels.system && (
            <button
              onClick={() => setPanels((p) => ({ ...p, system: true }))}
              className="px-3 py-1.5 bg-[#0B0E17]/90 backdrop-blur border border-slate-800 rounded-xl text-xs font-mono text-amber-400 shadow-lg hover:border-amber-500/50 cursor-pointer flex items-center gap-1.5"
            >
              <span>System & Fleet</span> <ChevronDown className="w-3.5 h-3.5" />
            </button>
          )}
          {!panels.maneuvers && (
            <button
              onClick={() => setPanels((p) => ({ ...p, maneuvers: true }))}
              className="px-3 py-1.5 bg-[#0B0E17]/90 backdrop-blur border border-slate-800 rounded-xl text-xs font-mono text-cyan-400 shadow-lg hover:border-cyan-500/50 cursor-pointer flex items-center gap-1.5"
            >
              <span>Maneuvers</span> <ChevronDown className="w-3.5 h-3.5" />
            </button>
          )}
          {!panels.orbitStats && (
            <button
              onClick={() => setPanels((p) => ({ ...p, orbitStats: true }))}
              className="px-3 py-1.5 bg-[#0B0E17]/90 backdrop-blur border border-slate-800 rounded-xl text-xs font-mono text-emerald-400 shadow-lg hover:border-emerald-500/50 cursor-pointer flex items-center gap-1.5"
            >
              <span>Orbital Data</span> <ChevronDown className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Floating Glass Panels Layer */}
      <div className="absolute inset-0 pointer-events-none p-3 pt-18 flex flex-col justify-between z-10">
        {/* Top Row: Left = System & Vessels Switcher, Right = Maneuver Nodes */}
        <div className="flex items-start justify-between gap-3">
          {panels.system ? (
            <div className="pointer-events-auto bg-[#0B0E17]/90 backdrop-blur-md border border-slate-800/80 p-3.5 rounded-2xl shadow-2xl w-72 max-h-[54vh] flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Compass className="w-3.5 h-3.5 text-amber-400" />
                  <h3 className="text-[11px] font-semibold text-white uppercase tracking-wider">System & Vessels</h3>
                </div>
                <button
                  onClick={() => setPanels((p) => ({ ...p, system: false }))}
                  className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
                  title="Minimize Panel"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
              </div>

              <div className="overflow-y-auto space-y-3 pr-1">
                {/* Celestial Bodies */}
                <div>
                  <div className="text-[10px] font-mono uppercase text-slate-500 mb-1.5 px-1">Celestial Bodies</div>
                  <div className="space-y-1">
                    {STELLAR_SYSTEM.map((body) => {
                      const isFocused = focusId === body.id;
                      const isMoon = body.parentId && body.parentId !== 'aethel';
                      return (
                        <button
                          key={body.id}
                          onClick={() => handleSelectFocus(body.id, false)}
                          className={`w-full text-left px-2.5 py-1.5 rounded-xl border text-xs flex items-center justify-between transition-colors cursor-pointer ${
                            isFocused
                              ? 'bg-cyan-500/15 border-cyan-500/50 text-white'
                              : 'bg-slate-900/60 border-slate-800/70 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {isMoon && <span className="text-slate-600 text-[10px] pl-1">└</span>}
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: body.colorHex }}
                            />
                            <span className="truncate font-medium">{body.name.split(' ')[0]}</span>
                          </div>
                          <span className="text-[10px] font-mono text-slate-500 shrink-0 tabular-nums">
                            {body.radius} km
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Tracked Spacecraft Fleet */}
                <div>
                  <div className="text-[10px] font-mono uppercase text-slate-500 mb-1.5 px-1">
                    Tracked Crafts ({allVessels.length})
                  </div>
                  <div className="space-y-1.5">
                    {allVessels.map((v) => {
                      const isFocused = focusId === v.id;
                      const statusColor = v.isActive
                        ? 'text-cyan-400 border-cyan-500/40 bg-cyan-500/10'
                        : v.flightState.landed
                          ? 'text-amber-400 border-amber-500/40 bg-amber-500/10'
                          : 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10';
                      const badgeText = v.isActive
                        ? 'ACTIVE'
                        : v.flightState.landed
                          ? 'LANDED'
                          : 'ORBIT';

                      return (
                        <div
                          key={v.id}
                          className={`p-2 rounded-xl border transition-colors ${
                            isFocused
                              ? 'bg-cyan-500/15 border-cyan-500/50'
                              : 'bg-slate-900/70 border-slate-800/80 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <button
                              onClick={() => handleSelectFocus(v.id, true)}
                              className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer"
                            >
                              <Rocket className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                              <span className="text-xs font-semibold text-white truncate">{v.name}</span>
                            </button>
                            <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border shrink-0 ${statusColor}`}>
                              {badgeText}
                            </span>
                          </div>
                          <div className="mt-1.5 flex items-center justify-between gap-2 pl-5">
                            <span className="text-[10px] font-mono text-slate-400 truncate tabular-nums">
                              {getVesselStatusText(v.flightState)}
                            </span>
                            {!v.isActive && (
                              <button
                                onClick={() => onSwitchToVessel(v.id)}
                                className="px-2 py-0.5 rounded-md bg-slate-800 hover:bg-cyan-500 hover:text-slate-950 text-[10px] font-semibold text-cyan-300 transition-colors flex items-center gap-1 shrink-0 cursor-pointer"
                                title="Take command in Flight View"
                              >
                                <ArrowRightLeft className="w-2.5 h-2.5" /> Fly
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div />
          )}

          {panels.maneuvers && (
            <div className="pointer-events-auto bg-[#0B0E17]/90 backdrop-blur-md border border-slate-800/80 p-4 rounded-2xl shadow-2xl w-full max-w-xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-white uppercase tracking-wider">Maneuver Nodes</h3>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleAddManeuverNode}
                    className="px-2.5 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500 text-cyan-400 hover:text-slate-950 border border-cyan-500/30 text-[10px] font-semibold transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Add
                  </button>
                  <button
                    onClick={() => setPanels((p) => ({ ...p, maneuvers: false }))}
                    className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
                    title="Minimize Panel"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-2.5 max-h-56 overflow-y-auto">
                {maneuverNodes.length === 0 ? (
                  <div className="text-center py-5 border border-dashed border-slate-800 rounded-xl p-3">
                    <Navigation className="w-5 h-5 text-slate-600 mx-auto mb-1" />
                    <p className="text-[11px] text-slate-400">No maneuver nodes planned.</p>
                  </div>
                ) : (
                  maneuverNodes.map((node) => (
                    <div key={node.id} className="p-2.5 bg-slate-900/90 border border-slate-800 rounded-xl space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-white">Burn Maneuver</span>
                        <button
                          onClick={() => handleDeleteNode(node.id)}
                          className="p-1 rounded text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="text-[11px] font-mono text-cyan-400 tabular-nums">
                        Prograde ΔV: +{node.deltaV.prograde} m/s
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Row: Left = Live Orbital Elements & Trajectory Key, Right = Zoom & Focus Controls */}
        <div className="flex items-end justify-between gap-3 pb-1">
          {panels.orbitStats ? (
            <div className="pointer-events-auto bg-[#0B0E17]/90 backdrop-blur-md border border-slate-800/80 p-3.5 rounded-2xl shadow-2xl w-full max-w-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-slate-400 uppercase">
                  {focusedBody
                    ? `${focusedBody.name.split(' ')[0]} · System Body`
                    : `${focusedVessel.name} · Telemetry`}
                </span>
                <button
                  onClick={() => setPanels((p) => ({ ...p, orbitStats: false }))}
                  className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
                  title="Minimize Panel"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
              </div>
              {focusedBody ? (
                <div className="space-y-1 font-mono text-xs tabular-nums">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Radius:</span>
                    <span className="text-white">{focusedBody.radius} km</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Atmosphere:</span>
                    <span className="text-cyan-400">
                      {focusedBody.atmosphereHeight > 0 ? `${focusedBody.atmosphereHeight} km` : 'Vacuum'}
                    </span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-slate-800/80">
                    <span className="text-slate-400">Active Alt / Vel:</span>
                    <span className="text-emerald-400">
                      {flightState.altitude.toFixed(1)} km · {flightState.orbitalSpeed.toFixed(2)} km/s
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-1 font-mono text-xs tabular-nums">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Altitude / Speed:</span>
                    <span className="text-white">
                      {focusedVessel.flightState.altitude.toFixed(1)} km · {focusedVessel.flightState.orbitalSpeed.toFixed(2)} km/s
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Apoapsis (Ap):</span>
                    <span className="text-emerald-400">{Math.round(focusedVessel.flightState.apoapsis)} km</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Periapsis (Pe):</span>
                    <span className="text-cyan-400">{Math.round(focusedVessel.flightState.periapsis)} km</span>
                  </div>
                </div>
              )}
              <div className="pt-1.5 border-t border-slate-800/70 flex items-center justify-between text-[10px] font-mono text-slate-400">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-0.5 bg-cyan-400" /> Predicted Arc
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-0.5 bg-amber-400" /> Flight Trail
                </span>
              </div>
            </div>
          ) : (
            <div />
          )}

          {/* Camera Zoom & Focus Shortcuts */}
          <div className="pointer-events-auto flex items-center gap-1.5 bg-[#0B0E17]/90 backdrop-blur-md border border-slate-800/80 p-1.5 rounded-2xl shadow-xl">
            <button
              onClick={() => handleZoomStep(0.75)}
              className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-200 hover:text-cyan-400 transition-colors cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleZoomStep(1.33)}
              className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-200 hover:text-cyan-400 transition-colors cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleSelectFocus('active_vessel', true)}
              className="px-2.5 py-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-[11px] font-mono text-cyan-300 hover:text-cyan-200 transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Focus Active Craft"
            >
              <Rocket className="w-3.5 h-3.5" /> Craft
            </button>
            <button
              onClick={() => handleSelectFocus('aethel', false)}
              className="px-2.5 py-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-[11px] font-mono text-slate-200 hover:text-amber-400 transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Focus Star System Overview"
            >
              <Crosshair className="w-3.5 h-3.5" /> System
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
