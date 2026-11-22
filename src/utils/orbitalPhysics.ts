import { CraftDesign, FlightState, Vector2D } from '../types';
import { STELLAR_SYSTEM } from '../data/stellarSystem';
import { PARTS_CATALOG } from '../data/partsCatalog';

export interface OrbitalTrajectory {
  points: Vector2D[];
  apoapsisPoint: (Vector2D & { altitude: number }) | null;
  periapsisPoint: (Vector2D & { altitude: number }) | null;
  impactPoint: Vector2D | null;
  isClosedOrbit: boolean;
  isEscape: boolean;
}

/**
 * Integrates one frame of spacecraft physics (with adaptive sub-stepping for stable time-warp orbits).
 */
export function stepFlightSimulation(
  prev: FlightState,
  craft: CraftDesign,
  dtReal: number,
  steerInput: number
): FlightState {
  if (!prev.active || prev.crashed) return prev;

  const launchedNow = prev.throttle > 0 || prev.met > 0;

  // Apply angular steering rate (55 deg/s) clamped between -90° and 270°
  const nextHeading =
    steerInput !== 0
      ? Math.max(-90, Math.min(270, Math.round((prev.heading + steerInput * 55 * dtReal) * 10) / 10))
      : prev.heading;

  const body = STELLAR_SYSTEM.find((b) => b.id === prev.bodyId) || STELLAR_SYSTEM[1];

  if (!launchedNow) {
    if (nextHeading === prev.heading) return prev;
    return {
      ...prev,
      heading: nextHeading,
      pos: { x: 0, y: body.radius },
      vel: { x: 0, y: 0 },
      altitude: 0,
      surfaceSpeed: 0,
      met: 0,
      crashed: false,
      landed: true,
    };
  }

  const totalDt = Math.max(0.001, dtReal * prev.timeWarp);
  // Sub-step physics at high time-warp so orbits stay accurate and stable
  const subSteps = Math.min(48, Math.max(1, Math.ceil(totalDt / 0.25)));
  const dt = totalDt / subSteps;

  let posX = prev.pos.x;
  let posY = prev.pos.y;
  let velX = prev.vel.x;
  let velY = prev.vel.y;
  let met = prev.met;
  let landed: boolean = prev.landed;
  let crashed: boolean = prev.crashed;
  let dynPressure = prev.dynamicPressure;
  let gForce = prev.gForce;
  let currentMass = prev.mass;
  const newFuelLevels = { ...prev.fuelLevels };

  const activeTanksBase = craft.parts.filter((tp) => {
    if (prev.decoupledParts.includes(tp.instanceId)) return false;
    const tDef = PARTS_CATALOG.find((d) => d.id === tp.partId);
    return Boolean(tDef && tDef.category === 'fuel');
  });

  const headingRad = (nextHeading * Math.PI) / 180;
  const scaleHeight = 7.5;

  for (let step = 0; step < subSteps; step++) {
    if (crashed) break;

    const r = Math.max(body.radius, Math.hypot(posX, posY));
    const alt = Math.max(0, r - body.radius);

    const upX = posX / r;
    const upY = posY / r;
    const eastX = upY;
    const eastY = -upX;

    const gKm = body.mu / (r * r);
    const atmDensity = alt < body.atmosphereHeight ? Math.exp(-alt / scaleHeight) : 0;

    let activeThrust = 0;
    if (prev.throttle > 0) {
      craft.parts.forEach((p) => {
        if (p.stage === prev.stage && !prev.decoupledParts.includes(p.instanceId)) {
          const def = PARTS_CATALOG.find((d) => d.id === p.partId);
          if (def && def.thrust && def.isp) {
            let needed = (def.thrust * prev.throttle * dt) / (def.isp * 9.81);

            if (def.fuelCapacity && def.fuelCapacity > 0) {
              const avail = newFuelLevels[p.instanceId] || 0;
              if (avail > 0) {
                const burned = Math.min(avail, needed);
                newFuelLevels[p.instanceId] = avail - burned;
                activeThrust += def.thrust * prev.throttle;
              }
            } else {
              const availableTanks = activeTanksBase
                .filter((t) => (newFuelLevels[t.instanceId] || 0) > 0)
                .sort((a, b) =>
                  a.stage === p.stage && b.stage !== p.stage ? -1 : b.stage === p.stage && a.stage !== p.stage ? 1 : 0
                );

              let totalDrawn = 0;
              for (const tank of availableTanks) {
                if (needed <= 0) break;
                const avail = newFuelLevels[tank.instanceId] || 0;
                if (avail > 0) {
                  const take = Math.min(avail, needed);
                  newFuelLevels[tank.instanceId] = avail - take;
                  needed -= take;
                  totalDrawn += take;
                }
              }
              if (totalDrawn > 0) {
                activeThrust += def.thrust * prev.throttle;
              }
            }
          }
        }
      });
    }

    let stepMass = 0;
    craft.parts.forEach((p) => {
      if (!prev.decoupledParts.includes(p.instanceId)) {
        const def = PARTS_CATALOG.find((d) => d.id === p.partId);
        if (def) {
          stepMass += def.mass + (newFuelLevels[p.instanceId] || 0);
        }
      }
    });
    currentMass = Math.max(0.5, stepMass);

    const thrustUp = activeThrust * Math.sin(headingRad);
    const thrustEast = activeThrust * Math.cos(headingRad);

    const thrustAccelXKm = ((thrustUp * upX + thrustEast * eastX) / currentMass) / 1000;
    const thrustAccelYKm = ((thrustUp * upY + thrustEast * eastY) / currentMass) / 1000;

    const speedKm = Math.hypot(velX, velY);
    const speedMs = speedKm * 1000;
    dynPressure = 0.5 * atmDensity * speedMs * speedMs * 0.001;
    const dragDecelKm = speedKm > 0 ? (0.5 * atmDensity * speedMs * speedMs * 0.0005) / (currentMass * 1000) : 0;
    const dragXKm = speedKm > 0 ? (velX / speedKm) * dragDecelKm : 0;
    const dragYKm = speedKm > 0 ? (velY / speedKm) * dragDecelKm : 0;

    const ax = -upX * gKm + thrustAccelXKm - dragXKm;
    const ay = -upY * gKm + thrustAccelYKm - dragYKm;

    // Symplectic Euler integration preserves orbital energy stably across sub-steps
    velX += ax * dt;
    velY += ay * dt;
    posX += velX * dt;
    posY += velY * dt;

    const newR = Math.hypot(posX, posY);
    const newAlt = newR - body.radius;
    gForce = Math.max(0, activeThrust / currentMass / 9.81);
    met += dt;

    if (newAlt <= 0) {
      const nUpX = posX / newR;
      const nUpY = posY / newR;
      posX = nUpX * body.radius;
      posY = nUpY * body.radius;

      const radialVel = velX * nUpX + velY * nUpY;
      if (radialVel < 0) {
        if (met > 2.5 && prev.apoapsis > 0.05 && Math.abs(radialVel) > 0.025) {
          crashed = true;
          velX = 0;
          velY = 0;
        } else {
          velX -= radialVel * nUpX;
          velY -= radialVel * nUpY;
          if (activeThrust === 0) {
            velX *= 0.8;
            velY *= 0.8;
          }
          landed = true;
        }
      } else {
        landed = radialVel < 0.0001;
      }
    } else {
      landed = false;
    }
  }

  const finalR = Math.hypot(posX, posY);
  const finalAlt = Math.max(0, finalR - body.radius);
  const surfaceSpeed = Math.hypot(velX, velY);

  // True Keplerian orbital elements
  const mu = body.mu;
  const epsilon = (surfaceSpeed * surfaceSpeed) / 2 - mu / Math.max(1, finalR);
  const hSpec = posX * velY - posY * velX;
  const eSq = Math.max(0, 1 + (2 * epsilon * hSpec * hSpec) / (mu * mu));
  const ecc = Math.sqrt(eSq);

  let calcApoapsis = finalAlt;
  let calcPeriapsis = 0;

  if (epsilon < -1e-6 && ecc < 1) {
    const semiMajor = -mu / (2 * epsilon);
    const rApo = semiMajor * (1 + ecc);
    const rPeri = semiMajor * (1 - ecc);
    calcApoapsis = Math.max(0, rApo - body.radius);
    calcPeriapsis = Math.max(0, rPeri - body.radius);
  } else {
    const rPeri = (hSpec * hSpec) / mu / Math.max(1e-6, 1 + ecc);
    calcPeriapsis = Math.max(0, rPeri - body.radius);
    calcApoapsis = Math.max(finalAlt, 99999);
  }

  // Adaptive distance-filtered trail sampling (retains full smooth ascent/orbit history)
  const lastTrailPt = prev.orbitTrail[prev.orbitTrail.length - 1];
  const distSinceLast = lastTrailPt ? Math.hypot(posX - lastTrailPt.x, posY - lastTrailPt.y) : Infinity;
  const minSampleSpacingKm = Math.max(1.5, finalAlt * 0.015);
  const nextTrail =
    distSinceLast >= minSampleSpacingKm
      ? [...prev.orbitTrail.slice(-299), { x: posX, y: posY }]
      : prev.orbitTrail;

  return {
    ...prev,
    heading: nextHeading,
    pos: { x: posX, y: posY },
    vel: { x: velX, y: velY },
    altitude: Number(finalAlt.toFixed(2)),
    surfaceSpeed: Number(surfaceSpeed.toFixed(3)),
    orbitalSpeed: Number(surfaceSpeed.toFixed(3)),
    apoapsis: Number(calcApoapsis.toFixed(2)),
    periapsis: Number((finalAlt <= 0 ? 0 : calcPeriapsis).toFixed(2)),
    mass: Number(currentMass.toFixed(2)),
    met,
    gForce: Number(gForce.toFixed(1)),
    dynamicPressure: Number(dynPressure.toFixed(1)),
    fuelLevels: newFuelLevels,
    landed,
    crashed,
    orbitTrail: nextTrail,
  };
}

/**
 * Computes analytical Keplerian conic trajectory points, Ap/Pe positions, and impact point
 * in km relative to the parent celestial body's center.
 */
export function computeOrbitalTrajectory(fs: FlightState, sampleCount = 140): OrbitalTrajectory {
  const body = STELLAR_SYSTEM.find((b) => b.id === fs.bodyId) || STELLAR_SYSTEM[1];
  const mu = body.mu;
  const x = fs.pos.x;
  const y = fs.pos.y;
  const vx = fs.vel.x;
  const vy = fs.vel.y;

  const r = Math.hypot(x, y);
  const vSq = vx * vx + vy * vy;

  if (fs.landed || r < body.radius * 0.5 || vSq < 1e-8) {
    return {
      points: [],
      apoapsisPoint: null,
      periapsisPoint: null,
      impactPoint: null,
      isClosedOrbit: false,
      isEscape: false,
    };
  }

  const h = x * vy - y * vx;
  const rDotV = x * vx + y * vy;

  // Eccentricity vector
  const factor = vSq - mu / r;
  const ex = (factor * x - rDotV * vx) / mu;
  const ey = (factor * y - rDotV * vy) / mu;
  const ecc = Math.hypot(ex, ey);
  const epsilon = vSq / 2 - mu / r;

  // Near-vertical trajectory with tiny angular momentum: draw radial ascent/descent arc
  if (Math.abs(h) < 1e-2) {
    const dirX = x / r;
    const dirY = y / r;
    const rPeak =
      epsilon < -1e-6
        ? Math.max(r, -mu / (2 * epsilon))
        : body.radius * 3.5;
    const pts: Vector2D[] = [];
    const steps = 24;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const rad = r + (rPeak - r) * t;
      pts.push({ x: dirX * rad, y: dirY * rad });
    }
    return {
      points: pts,
      apoapsisPoint:
        epsilon < -1e-6
          ? { x: dirX * rPeak, y: dirY * rPeak, altitude: Math.max(0, rPeak - body.radius) }
          : null,
      periapsisPoint: null,
      impactPoint: { x: dirX * body.radius, y: dirY * body.radius },
      isClosedOrbit: false,
      isEscape: epsilon >= -1e-6,
    };
  }

  const p = (h * h) / mu;
  const omega = ecc > 1e-5 ? Math.atan2(ey, ex) : Math.atan2(y, x);
  const posAngle = Math.atan2(y, x);
  let nu0 = posAngle - omega;
  while (nu0 > Math.PI) nu0 -= Math.PI * 2;
  while (nu0 < -Math.PI) nu0 += Math.PI * 2;

  const isEscape = ecc >= 0.999 || epsilon >= -1e-6;

  if (!isEscape) {
    const rPe = p / (1 + ecc);
    const rAp = p / Math.max(1e-4, 1 - ecc);
    const apPt = {
      x: Math.cos(omega + Math.PI) * rAp,
      y: Math.sin(omega + Math.PI) * rAp,
      altitude: Math.max(0, rAp - body.radius),
    };

    if (rPe >= body.radius) {
      // Closed elliptical orbit above the surface
      const pts: Vector2D[] = [];
      for (let i = 0; i <= sampleCount; i++) {
        const nu = (i / sampleCount) * Math.PI * 2;
        const rad = p / (1 + ecc * Math.cos(nu));
        const worldAngle = omega + nu;
        pts.push({ x: Math.cos(worldAngle) * rad, y: Math.sin(worldAngle) * rad });
      }
      return {
        points: pts,
        apoapsisPoint: apPt,
        periapsisPoint: {
          x: Math.cos(omega) * rPe,
          y: Math.sin(omega) * rPe,
          altitude: Math.max(0, rPe - body.radius),
        },
        impactPoint: null,
        isClosedOrbit: true,
        isEscape: false,
      };
    } else {
      // Suborbital ellipse intersecting body surface
      const cosNuSurf = Math.max(-1, Math.min(1, (p / body.radius - 1) / Math.max(1e-5, ecc)));
      const nuSurf = Math.acos(cosNuSurf); // positive in [0, pi], surface crossings at +nuSurf and 2pi - nuSurf
      const startNu = nuSurf;
      const endNu = Math.PI * 2 - nuSurf;
      const pts: Vector2D[] = [];
      for (let i = 0; i <= sampleCount; i++) {
        const nu = startNu + (i / sampleCount) * (endNu - startNu);
        const rad = Math.max(body.radius, p / (1 + ecc * Math.cos(nu)));
        const worldAngle = omega + nu;
        pts.push({ x: Math.cos(worldAngle) * rad, y: Math.sin(worldAngle) * rad });
      }
      // Impact point depends on orbital direction (sign of h)
      const impactNu = h >= 0 ? endNu : startNu;
      const impactAngle = omega + impactNu;
      return {
        points: pts,
        apoapsisPoint: apPt,
        periapsisPoint: null,
        impactPoint: {
          x: Math.cos(impactAngle) * body.radius,
          y: Math.sin(impactAngle) * body.radius,
        },
        isClosedOrbit: false,
        isEscape: false,
      };
    }
  }

  // Hyperbolic / Escape trajectory
  const nuInf = ecc > 1 ? Math.acos(-1 / ecc) - 0.06 : Math.PI * 0.92;
  const maxRad = body.radius * 3.8;
  const dir = h >= 0 ? 1 : -1;
  const targetNu = dir > 0 ? nuInf : -nuInf;
  const pts: Vector2D[] = [];
  for (let i = 0; i <= sampleCount; i++) {
    const nu = nu0 + (i / sampleCount) * (targetNu - nu0);
    const denom = 1 + ecc * Math.cos(nu);
    if (denom <= 0.05) break;
    const rad = Math.min(maxRad, p / denom);
    const worldAngle = omega + nu;
    pts.push({ x: Math.cos(worldAngle) * rad, y: Math.sin(worldAngle) * rad });
    if (rad >= maxRad) break;
  }

  const rPeEsc = p / (1 + ecc);
  return {
    points: pts,
    apoapsisPoint: null,
    periapsisPoint:
      rPeEsc >= body.radius
        ? {
            x: Math.cos(omega) * rPeEsc,
            y: Math.sin(omega) * rPeEsc,
            altitude: Math.max(0, rPeEsc - body.radius),
          }
        : null,
    impactPoint: null,
    isClosedOrbit: false,
    isEscape: true,
  };
}
