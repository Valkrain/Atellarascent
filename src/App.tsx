import React, { useEffect, useRef, useState } from 'react';
import { CraftDesign, FlightState, ManeuverNode, FlightPlanInstruction, TrackedVessel } from './types';
import { CRAFT_PRESETS } from './data/presets';
import { PARTS_CATALOG } from './data/partsCatalog';
import { Navbar } from './components/Navbar';
import { MissionControl } from './components/MissionControl';
import { AssemblyHangar } from './components/AssemblyHangar';
import { FlightView } from './components/FlightView';
import { MapView } from './components/MapView';
import { FlightPlanner } from './components/FlightPlanner';
import { stepFlightSimulation } from './utils/orbitalPhysics';

function createInitialFlightState(craft: CraftDesign): FlightState {
  const fuelLevels: Record<string, number> = {};
  const thrustStages: number[] = [];

  craft.parts.forEach((p) => {
    const def = PARTS_CATALOG.find((d) => d.id === p.partId);
    if (def) {
      if (def.fuelCapacity && def.fuelCapacity > 0) {
        fuelLevels[p.instanceId] = def.fuelCapacity;
      }
      if (def.thrust && def.thrust > 0) {
        thrustStages.push(p.stage);
      }
    }
  });

  const startStage = thrustStages.length > 0
    ? Math.min(...thrustStages)
    : (craft.parts.length > 0 ? Math.min(...craft.parts.map((p) => p.stage)) : 0);

  return {
    vesselName: craft.name,
    active: true,
    bodyId: 'aurelia',
    pos: { x: 0, y: 600 }, // surface of Aurelia at radius 600 km
    vel: { x: 0, y: 0 },
    altitude: 0,
    surfaceSpeed: 0,
    orbitalSpeed: 0,
    apoapsis: 0,
    periapsis: 0,
    inclination: 0,
    mass: craft.totalMass,
    throttle: 0,
    stage: startStage,
    timeWarp: 1,
    met: 0,
    gForce: 1.0,
    dynamicPressure: 0,
    sasEnabled: true,
    sasMode: 'prograde',
    heading: 90,
    fuelLevels,
    decoupledParts: [],
    landed: true,
    crashed: false,
    orbitTrail: [],
  };
}

function createInitialFleet(): TrackedVessel[] {
  const probePreset = CRAFT_PRESETS[2] || CRAFT_PRESETS[0];
  const landerPreset = CRAFT_PRESETS[1] || CRAFT_PRESETS[0];

  const relayState = createInitialFlightState(probePreset);
  relayState.vesselName = 'Aurelia Orbital Relay';
  relayState.bodyId = 'aurelia';
  relayState.pos = { x: 720, y: 0 };
  relayState.vel = { x: 0, y: 2.215 };
  relayState.altitude = 120;
  relayState.surfaceSpeed = 2.215;
  relayState.orbitalSpeed = 2.215;
  relayState.apoapsis = 124;
  relayState.periapsis = 116;
  relayState.landed = false;
  relayState.met = 1420;

  const lunaraLanderState = createInitialFlightState(landerPreset);
  lunaraLanderState.vesselName = 'Lunara Base One';
  lunaraLanderState.bodyId = 'lunara';
  lunaraLanderState.pos = { x: 140, y: 143 }; // radius ~200 km on Lunara surface
  lunaraLanderState.vel = { x: 0, y: 0 };
  lunaraLanderState.altitude = 0;
  lunaraLanderState.surfaceSpeed = 0;
  lunaraLanderState.orbitalSpeed = 0;
  lunaraLanderState.apoapsis = 0;
  lunaraLanderState.periapsis = 0;
  lunaraLanderState.landed = true;
  lunaraLanderState.met = 6850;

  return [
    {
      id: 'fleet_aurelia_relay',
      name: 'Aurelia Orbital Relay',
      craft: { ...probePreset, name: 'Aurelia Orbital Relay' },
      flightState: relayState,
    },
    {
      id: 'fleet_lunara_base',
      name: 'Lunara Base One',
      craft: { ...landerPreset, name: 'Lunara Base One' },
      flightState: lunaraLanderState,
    },
  ];
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'mission_control' | 'assembly' | 'flight' | 'map' | 'planner'>('mission_control');
  const [currentCraft, setCurrentCraft] = useState<CraftDesign>(CRAFT_PRESETS[0]);
  const [maneuverNodes, setManeuverNodes] = useState<ManeuverNode[]>([]);
  const [flightPlanInstructions, setFlightPlanInstructions] = useState<FlightPlanInstruction[]>([
    { id: '1', type: 'throttle', targetValue: 100, enabled: true },
    { id: '2', type: 'pitch', targetValue: 85, enabled: true },
    { id: '3', type: 'wait_altitude', targetValue: 10, enabled: true },
    { id: '4', type: 'pitch', targetValue: 45, enabled: true },
  ]);

  const [flightState, setFlightState] = useState<FlightState>(() => createInitialFlightState(CRAFT_PRESETS[0]));
  const [trackedFleet, setTrackedFleet] = useState<TrackedVessel[]>(() => createInitialFleet());
  const [isFlightPaused, setIsFlightPaused] = useState(false);

  const steerDirRef = useRef<number>(0);
  const currentCraftRef = useRef<CraftDesign>(currentCraft);
  currentCraftRef.current = currentCraft;

  // Continuous live physics simulation across Flight Simulator and Orbital Map
  useEffect(() => {
    if (isFlightPaused) return;
    if (activeTab !== 'flight' && activeTab !== 'map') return;

    let animId: number;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const dtReal = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      const steerInput = activeTab === 'flight' ? steerDirRef.current : 0;
      setFlightState((prev) => stepFlightSimulation(prev, currentCraftRef.current, dtReal, steerInput));

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [isFlightPaused, activeTab]);

  const archiveActiveCraftIfDeployed = (state: FlightState, craft: CraftDesign, currentFleet: TrackedVessel[]): TrackedVessel[] => {
    if (state.met <= 0 || state.crashed) return currentFleet;
    const archived: TrackedVessel = {
      id: 'vessel_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      name: state.vesselName || craft.name,
      craft: { ...craft, parts: craft.parts.map((p) => ({ ...p })) },
      flightState: { ...state },
    };
    return [archived, ...currentFleet];
  };

  const handleQuickLaunch = () => {
    setTrackedFleet((prev) => archiveActiveCraftIfDeployed(flightState, currentCraft, prev));
    setFlightState(createInitialFlightState(currentCraft));
    setIsFlightPaused(false);
    setActiveTab('flight');
  };

  const handleLaunchPreset = (preset: CraftDesign) => {
    setTrackedFleet((prev) => archiveActiveCraftIfDeployed(flightState, currentCraft, prev));
    const clonedPreset = { ...preset, parts: preset.parts.map((p) => ({ ...p })) };
    setCurrentCraft(clonedPreset);
    setFlightState(createInitialFlightState(clonedPreset));
    setIsFlightPaused(false);
    setActiveTab('flight');
  };

  const handleSwitchToVessel = (vesselId: string) => {
    const target = trackedFleet.find((v) => v.id === vesselId);
    if (!target) return;

    setTrackedFleet((prev) => {
      const remaining = prev.filter((v) => v.id !== vesselId);
      return archiveActiveCraftIfDeployed(flightState, currentCraft, remaining);
    });
    setCurrentCraft({ ...target.craft, parts: target.craft.parts.map((p) => ({ ...p })) });
    setFlightState({ ...target.flightState });
    setIsFlightPaused(false);
    setActiveTab('flight');
  };

  return (
    <div className="min-h-screen bg-[#07090E] text-slate-100 flex flex-col font-sans select-none">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onQuickLaunch={handleQuickLaunch}
        hasActiveFlight={flightState.active}
      />

      <main className="flex-1 overflow-hidden">
        {activeTab === 'mission_control' && (
          <MissionControl
            currentCraft={currentCraft}
            onLaunchPreset={handleLaunchPreset}
            setActiveTab={setActiveTab}
          />
        )}
        {activeTab === 'assembly' && (
          <AssemblyHangar
            currentCraft={currentCraft}
            setCurrentCraft={setCurrentCraft}
            onLaunch={handleQuickLaunch}
          />
        )}
        {activeTab === 'flight' && (
          <FlightView
            flightState={flightState}
            setFlightState={setFlightState}
            currentCraft={currentCraft}
            isPaused={isFlightPaused}
            setIsPaused={setIsFlightPaused}
            steerDirRef={steerDirRef}
          />
        )}
        {activeTab === 'map' && (
          <MapView
            flightState={flightState}
            setFlightState={setFlightState}
            maneuverNodes={maneuverNodes}
            setManeuverNodes={setManeuverNodes}
            trackedFleet={trackedFleet}
            onSwitchToVessel={handleSwitchToVessel}
            isPaused={isFlightPaused}
            setIsPaused={setIsFlightPaused}
          />
        )}
        {activeTab === 'planner' && (
          <FlightPlanner
            instructions={flightPlanInstructions}
            setInstructions={setFlightPlanInstructions}
          />
        )}
      </main>
    </div>
  );
}
