import * as THREE from 'three';

function hash3(x: number, y: number, z: number, seed: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 19.19) * 43758.5453123;
  return n - Math.floor(n);
}

function valueNoise3D(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;

  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);

  const c000 = hash3(ix, iy, iz, seed);
  const c100 = hash3(ix + 1, iy, iz, seed);
  const c010 = hash3(ix, iy + 1, iz, seed);
  const c110 = hash3(ix + 1, iy + 1, iz, seed);
  const c001 = hash3(ix, iy, iz + 1, seed);
  const c101 = hash3(ix + 1, iy, iz + 1, seed);
  const c011 = hash3(ix, iy + 1, iz + 1, seed);
  const c111 = hash3(ix + 1, iy + 1, iz + 1, seed);

  const x00 = c000 + (c100 - c000) * ux;
  const x10 = c010 + (c110 - c010) * ux;
  const x01 = c001 + (c101 - c001) * ux;
  const x11 = c011 + (c111 - c011) * ux;

  const y0 = x00 + (x10 - x00) * uy;
  const y1 = x01 + (x11 - x01) * uy;

  return y0 + (y1 - y0) * uz;
}

function fbm3D(x: number, y: number, z: number, seed: number, octaves = 4): number {
  let val = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    val += amp * valueNoise3D(x * freq, y * freq, z * freq, seed + i * 7);
    freq *= 2.07;
    amp *= 0.5;
  }
  return val;
}

export function createPlanetTexture(bodyId: string): THREE.CanvasTexture {
  const width = 512;
  const height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;

  // Deterministic craters for moons
  const craters: { x: number; y: number; z: number; r: number }[] = [];
  if (bodyId === 'lunara' || bodyId === 'caelum') {
    for (let i = 0; i < 42; i++) {
      const phi = Math.acos(2 * hash3(i, 1, 2, 11) - 1);
      const theta = hash3(i, 3, 4, 17) * Math.PI * 2;
      craters.push({
        x: Math.sin(phi) * Math.cos(theta),
        y: Math.cos(phi),
        z: Math.sin(phi) * Math.sin(theta),
        r: 0.06 + hash3(i, 5, 6, 23) * 0.16,
      });
    }
  }

  for (let py = 0; py < height; py++) {
    const v = py / (height - 1);
    const phi = v * Math.PI;
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);
    const absLat = Math.abs(cosPhi);

    for (let px = 0; px < width; px++) {
      const u = px / width;
      const theta = u * Math.PI * 2;

      const nx = sinPhi * Math.cos(theta);
      const ny = cosPhi;
      const nz = sinPhi * Math.sin(theta);

      let r = 30;
      let g = 80;
      let b = 150;

      if (bodyId === 'aurelia') {
        const elev = fbm3D(nx * 2.4 + 3.1, ny * 2.4 + 1.7, nz * 2.4 + 5.2, 42, 4);
        const detail = fbm3D(nx * 8.0, ny * 8.0, nz * 8.0, 99, 3);
        const polarThreshold = 0.8 + (detail - 0.5) * 0.1;

        if (absLat > polarThreshold) {
          // Polar ice caps
          r = 224;
          g = 236;
          b = 248;
        } else if (elev < 0.51) {
          // Deep to coastal ocean
          const depth = elev / 0.51;
          r = Math.round(10 + depth * 22);
          g = Math.round(38 + depth * 68);
          b = Math.round(88 + depth * 72);
        } else if (elev < 0.54) {
          // Coastal plains
          r = 56;
          g = 128;
          b = 98;
        } else if (elev < 0.66) {
          // Lush continents & forests
          const hNorm = (elev - 0.54) / 0.12;
          r = Math.round(42 + hNorm * 68 + (detail - 0.5) * 28);
          g = Math.round(118 + hNorm * 22 + (detail - 0.5) * 24);
          b = Math.round(68 - hNorm * 14);
        } else if (elev < 0.76) {
          // Arid highlands
          r = Math.round(145 + (detail - 0.5) * 35);
          g = Math.round(128 + (detail - 0.5) * 25);
          b = 92;
        } else {
          // Alpine ridges
          r = 195;
          g = 202;
          b = 212;
        }
      } else if (bodyId === 'lunara') {
        const maria = fbm3D(nx * 2.0 + 1.2, ny * 2.0 + 2.5, nz * 2.0, 7, 4);
        const grain = fbm3D(nx * 9.0, ny * 9.0, nz * 9.0, 19, 3);
        let shade = maria < 0.48 ? 78 + maria * 55 : 122 + (maria - 0.48) * 90;
        shade += (grain - 0.5) * 24;

        for (let c = 0; c < craters.length; c++) {
          const cr = craters[c];
          const d = Math.hypot(nx - cr.x, ny - cr.y, nz - cr.z);
          if (d < cr.r) {
            const normD = d / cr.r;
            if (normD > 0.78) {
              shade += 26;
            } else {
              shade -= 22 * (1 - normD);
            }
          }
        }
        const clamped = Math.max(40, Math.min(220, Math.round(shade)));
        r = clamped;
        g = clamped + 2;
        b = clamped + 6;
      } else if (bodyId === 'caelum') {
        const terrain = fbm3D(nx * 3.0, ny * 3.0, nz * 3.0, 61, 4);
        let shade = terrain * 110 + 40;
        for (let c = 0; c < craters.length; c++) {
          const cr = craters[c];
          const d = Math.hypot(nx - cr.x, ny - cr.y, nz - cr.z);
          if (d < cr.r) {
            shade += d / cr.r > 0.78 ? 22 : -18;
          }
        }
        r = Math.max(10, Math.min(120, Math.round(shade * 0.25)));
        g = Math.max(55, Math.min(210, Math.round(shade * 1.15)));
        b = Math.max(45, Math.min(180, Math.round(shade * 0.85)));
      } else if (bodyId === 'vespera') {
        const swirl = fbm3D(nx * 3.2, ny * 6.5, nz * 3.2, 88, 4);
        const band = 0.5 + 0.5 * Math.sin(ny * 16 + swirl * 5.0);
        r = Math.round(68 + band * 96);
        g = Math.round(32 + band * 76);
        b = Math.round(135 + band * 105);
      } else {
        const plasma = fbm3D(nx * 4, ny * 4, nz * 4, 3, 3);
        r = Math.round(235 + plasma * 20);
        g = Math.round(145 + plasma * 70);
        b = Math.round(20 + plasma * 50);
      }

      const idx = (py * width + px) * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

export function createCloudTexture(): THREE.CanvasTexture {
  const width = 512;
  const height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;

  for (let py = 0; py < height; py++) {
    const phi = (py / (height - 1)) * Math.PI;
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);

    for (let px = 0; px < width; px++) {
      const theta = (px / width) * Math.PI * 2;
      const nx = sinPhi * Math.cos(theta);
      const ny = cosPhi;
      const nz = sinPhi * Math.sin(theta);

      const n = fbm3D(nx * 3.8 + 7.2, ny * 4.8 + 1.1, nz * 3.8 + 2.9, 104, 4);
      const density = Math.max(0, Math.min(1, (n - 0.5) * 3.4));
      const alpha = Math.round(density * 215);

      const idx = (py * width + px) * 4;
      data[idx] = 244;
      data[idx + 1] = 248;
      data[idx + 2] = 255;
      data[idx + 3] = alpha;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

export function createAtmosphereLimbMaterial(colorHex: number, isOuterHalo = false): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(colorHex) },
    },
    vertexShader: `
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      void main() {
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: isOuterHalo
      ? `
      uniform vec3 uColor;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float ndv = max(0.0, -dot(normalize(vWorldNormal), viewDir));
        float intensity = pow(clamp(ndv * 1.45, 0.0, 1.0), 3.4) * 0.72;
        gl_FragColor = vec4(uColor, intensity);
      }
    `
      : `
      uniform vec3 uColor;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float rim = clamp(1.0 - max(0.0, dot(normalize(vWorldNormal), viewDir)), 0.0, 1.0);
        float intensity = pow(rim, 3.0) * 0.85;
        gl_FragColor = vec4(uColor, intensity);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: isOuterHalo ? THREE.BackSide : THREE.FrontSide,
  });
}
