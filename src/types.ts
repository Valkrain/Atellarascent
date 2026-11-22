export type PartCategory = 'command' | 'fuel' | 'engine' | 'booster' | 'decoupler' | 'aerodynamics' | 'utility' | 'science';

export interface PartDefinition {
  id: string;
  name: string;
  category: PartCategory;
  mass: number; // tons
  cost: number;
  maxTemp: number;
  dragCoef: number;
  // Specific properties
  thrust?: number; // kN in vacuum
  isp?: number; // specific impulse (s)
  fuelCapacity?: number; // tons of liquid fuel / oxidizer or solid propellant
  isCommand?: boolean;
  isDecoupler?: boolean;
  decoupleForce?: number;
  chuteDrag?: number;
  hasLandingLegs?: boolean;
  powerGen?: number; // kW
  scienceValue?: number;
  iconName: string;
}

export interface PlacedPart {
  instanceId: string;
  partId: string;
  stage: number; // staging index (0 = bottom/first to fire, higher = later)
  fuelRemaining?: number;
  isDecoupled?: boolean;
  rotation?: number; // radians or degrees
}

export interface CraftDesign {
  id: string;
  name: string;
  description: string;
  parts: PlacedPart[];
  totalMass: number;
  totalCost: number;
}

export interface CelestialBody {
  id: string;
  name: string;
  color: string;
  radius: number; // km
  mass: number; // kg (GM standard gravitational parameter mu = G*M in km^3/s^2)
  mu: number; // km^3/s^2
  atmosphereHeight: number; // km
  orbitRadius: number; // km from parent
  orbitPeriod: number; // seconds
  parentId: string | null;
  soi: number; // Sphere of Influence radius in km
  colorHex: string;
}

export interface Vector2D {
  x: number;
  y: number;
}

export interface ManeuverNode {
  id: string;
  timeOffset: number; // seconds from now
  deltaV: {
    prograde: number;
    normal: number;
    radial: number;
  };
}

export interface FlightPlanInstruction {
  id: string;
  type: 'throttle' | 'pitch' | 'stage' | 'warp' | 'wait_altitude' | 'wait_apoapsis' | 'burn_node';
  targetValue: number; // percentage, degrees, warp factor, altitude km, etc.
  enabled: boolean;
}

export interface FlightState {
  vesselName: string;
  active: boolean;
  bodyId: string; // current celestial body or parent SOI
  pos: Vector2D; // position in km relative to body center or star
  vel: Vector2D; // velocity vector in km/s
  altitude: number; // km above surface
  surfaceSpeed: number; // km/s
  orbitalSpeed: number; // km/s
  apoapsis: number; // km
  periapsis: number; // km
  inclination: number; // deg
  mass: number; // tons
  throttle: number; // 0 to 1
  stage: number; // active stage index
  timeWarp: number; // 1, 5, 10, 50, 100, 1000, 10000
  met: number; // Mission Elapsed Time in seconds
  gForce: number;
  dynamicPressure: number; // kPa
  sasEnabled: boolean;
  sasMode: 'prograde' | 'retrograde' | 'stability' | 'target';
  heading: number; // degrees (0 = up/North, 90 = right/East)
  fuelLevels: Record<string, number>; // instanceId -> current fuel
  decoupledParts: string[]; // instanceIds
  landed: boolean;
  crashed: boolean;
  orbitTrail: Vector2D[];
}

export interface TrackedVessel {
  id: string;
  name: string;
  craft: CraftDesign;
  flightState: FlightState;
}
