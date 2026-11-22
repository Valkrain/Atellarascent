import { CelestialBody } from '../types';

export const STELLAR_SYSTEM: CelestialBody[] = [
  {
    id: 'aethel',
    name: 'Aethel (Star)',
    color: '#F59E0B',
    radius: 500, // km
    mass: 1.75e14, // GM
    mu: 1.179e10, // km^3/s^2
    atmosphereHeight: 0,
    orbitRadius: 0,
    orbitPeriod: 0,
    parentId: null,
    soi: 100000,
    colorHex: '#F59E0B',
  },
  {
    id: 'aurelia',
    name: 'Aurelia (Homeworld)',
    color: '#3B82F6',
    radius: 600, // km (scaled for playable physics)
    mass: 3.5e12,
    mu: 3531.6, // km^3/s^2 (similar to Kerbin standard GM)
    atmosphereHeight: 70, // km
    orbitRadius: 3500, // km from Aethel
    orbitPeriod: 21600, // 6 hours
    parentId: 'aethel',
    soi: 84000,
    colorHex: '#3B82F6',
  },
  {
    id: 'lunara',
    name: 'Lunara (Moon)',
    color: '#9CA3AF',
    radius: 200, // km
    mass: 6.5e10,
    mu: 65.13, // km^3/s^2
    atmosphereHeight: 0,
    orbitRadius: 500, // km from Aurelia
    orbitPeriod: 5400, // 1.5 hours
    parentId: 'aurelia',
    soi: 2400,
    colorHex: '#9CA3AF',
  },
  {
    id: 'caelum',
    name: 'Caelum (Outer Moon)',
    color: '#10B981',
    radius: 160, // km
    mass: 2.5e10,
    mu: 24.5, // km^3/s^2
    atmosphereHeight: 0,
    orbitRadius: 900, // km from Aurelia
    orbitPeriod: 12600, // 3.5 hours
    parentId: 'aurelia',
    soi: 3100,
    colorHex: '#10B981',
  },
  {
    id: 'vespera',
    name: 'Vespera (Gas Giant)',
    color: '#8B5CF6',
    radius: 1200, // km
    mass: 8.5e13,
    mu: 85000,
    atmosphereHeight: 150,
    orbitRadius: 9000, // km from Aethel
    orbitPeriod: 128000,
    parentId: 'aethel',
    soi: 240000,
    colorHex: '#8B5CF6',
  },
];
