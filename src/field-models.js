import * as T from 'three';
// Anatomical details share the existing articulated head, leg and wool joints.
function workshop(r) {
  function mesh(p, g, c, xyz) {
    let m = new T.Mesh(g, r.material(null, c));
    m.position.set(...xyz);
    p.add(m);
    return m;
  }
  function oval(p, c, at, size) {
    let o = mesh(p, new T.SphereGeometry(1, 10, 7), c, at);
    o.scale.set(...size);
    return o;
  }
  function stem(p, c, pts, rr) {
    for (let i = 1; i < pts.length; i++) {
      let a = new T.Vector3(...pts[i - 1]),
        b = new T.Vector3(...pts[i]),
        delta = b.clone().sub(a);
      let o = mesh(
        p,
        new T.CylinderGeometry(rr[i], rr[i - 1], delta.length(), 8),
        c,
        a.lerp(b, 0.5).toArray(),
      );
      o.quaternion.setFromUnitVectors(
        new T.Vector3(0, 1, 0),
        delta.normalize(),
      );
    }
  }
  return { oval, stem };
}
export function pastureDetails(kind, r, head, legs, wings, wool) {
  const { oval, stem } = workshop(r),
    brown = '#634739',
    pink = '#d89587';
  let tail;
  if (['cow', 'sheep', 'pig'].includes(kind))
    for (let s of [-1, 1]) {
      let x = kind === 'cow' ? 0.177 : 0.144;
      oval(head, '#342d32', [s * x, 0.053, -0.211], [0.035, 0.043, 0.017]);
      oval(
        head,
        '#faf7e5',
        [s * (x + 0.008), 0.071, -0.225],
        [0.01, 0.01, 0.006],
      );
    }
  if (kind === 'cow') {
    for (let s of [-1, 1]) {
      stem(
        head,
        '#decca8',
        [
          [s * 0.17, 0.22, 0],
          [s * 0.23, 0.33, 0.01],
          [s * 0.294, 0.368, -0.01],
          [s * 0.303, 0.414, -0.02],
        ],
        [0.054, 0.043, 0.023, 0.003],
      );
      oval(
        head,
        brown,
        [s * 0.295, 0.08, 0.005],
        [0.115, 0.059, 0.07],
      ).rotation.z = s * 0.18;
      oval(head, pink, [s * 0.31, 0.081, -0.043], [0.077, 0.034, 0.027]);
    }
    oval(head, '#bd8d80', [0, -0.101, -0.215], [0.195, 0.104, 0.094]);
    for (let s of [-1, 1])
      oval(head, '#564349', [s * 0.105, -0.09, -0.291], [0.032, 0.022, 0.012]);
    tail = r.pivot(0, 0.98, 0.627);
    stem(
      tail,
      brown,
      [
        [0, 0, 0],
        [0.023, -0.26, 0.097],
        [0.049, -0.43, 0.074],
      ],
      [0.032, 0.024, 0.017],
    );
    oval(tail, '#3d312c', [0.051, -0.456, 0.074], [0.05, 0.1, 0.043]);
  } else if (kind === 'pig') {
    for (let s of [-1, 1]) {
      let e = oval(
        head,
        '#cf8d85',
        [s * 0.19, 0.169, 0.003],
        [0.068, 0.106, 0.052],
      );
      e.rotation.z = -s * 0.5;
      oval(
        head,
        '#da9a95',
        [s * 0.193, 0.182, -0.032],
        [0.041, 0.066, 0.022],
      ).rotation.z = -s * 0.5;
      oval(head, '#854f55', [s * 0.058, -0.055, -0.319], [0.021, 0.025, 0.01]);
    }
    tail = r.pivot(0, 0.765, 0.542);
    let pts = Array.from({ length: 14 }, (_, i) => {
      let a = i * 0.47;
      return [0.058 * Math.sin(a), 0.047 * (1 - Math.cos(a)), 0.009 * i];
    });
    stem(
      tail,
      '#d89891',
      pts,
      pts.map((_, i) => 0.021 - i * 0.0009),
    );
  } else if (kind === 'sheep') {
    const mat = r.material('mobs_mc_sheep_fur');
    for (let s of [-1, 1]) {
      oval(head, '#b39c8b', [s * 0.224, 0.022, -0.01], [0.082, 0.049, 0.043]);
      for (let j = 0; j < 4; j++) {
        let tuft = oval(
          wool,
          '#ffffff',
          [s * 0.393, 0.7, 0.4 - j * 0.263],
          [0.102, 0.21, 0.175],
        );
        tuft.material = mat;
      }
    }
    for (let j = 0; j < 3; j++) {
      let tuft = oval(
        wool,
        '#ffffff',
        [(j - 1) * 0.21, 1.035, -0.31],
        [0.171, 0.108, 0.19],
      );
      tuft.material = mat;
    }
  } else if (kind === 'chicken') {
    for (let j = 0; j < 4; j++)
      oval(
        head,
        '#ac4545',
        [0, 0.163 + (j % 2) * 0.011, 0.075 - j * 0.055],
        [0.037, 0.066 - j * 0.004, 0.039],
      );
    for (let j = -2; j <= 2; j++) {
      let o = oval(
        r.body,
        j % 2 ? '#d5d0bd' : '#eeeada',
        [j * 0.046, 0.55, 0.39],
        [0.07, 0.225, 0.057],
      );
      o.rotation.x = 0.72;
      o.rotation.z = -j * 0.18;
    }
    for (const w of wings)
      for (let j = 0; j < 3; j++) {
        let o = oval(
          w,
          '#e9e3d6',
          [w.userData.side * 0.048, -0.19, 0.11 - j * 0.104],
          [0.039, 0.115, 0.069],
        );
        o.rotation.x = 0.26;
      }
  }
  if (['cow', 'pig', 'sheep'].includes(kind))
    for (let l of legs)
      oval(
        l,
        kind === 'pig' ? '#ab7978' : '#554e49',
        [0, kind === 'cow' ? -0.482 : -0.387, -0.012],
        [0.083, 0.045, 0.085],
      );
  return tail;
}
export function villageDetails(role, r, head) {
  const { oval, stem } = workshop(r),
    cloth = r.material(
      null,
      role === 'smith'
        ? '#513e3c'
        : role === 'merchant'
          ? '#7d5664'
          : '#8b7351',
    );
  r.solid(0.62, 0.073, 0.411, cloth, 0, 0.79, 0);
  r.solid(0.095, 0.077, 0.035, r.material(null, '#c5ab70'), 0, 0.787, -0.219);
  if (role === 'merchant') {
    for (let s of [-1, 1]) {
      let rim = new T.Mesh(
        new T.TorusGeometry(0.07, 0.008, 5, 14),
        r.material(null, '#c4ae75'),
      );
      rim.position.set(s * 0.119, 0.046, -0.229);
      head.add(rim);
    }
    stem(
      head,
      '#c4ae75',
      [
        [-0.056, 0.058, -0.23],
        [0, 0.076, -0.247],
        [0.056, 0.058, -0.23],
      ],
      [0.009, 0.009, 0.009],
    );
  }
  if (role === 'smith') {
    r.solid(0.38, 0.38, 0.041, cloth, 0, 0.99, -0.209);
    for (let s of [-1, 1])
      stem(
        r.body,
        '#bd936d',
        [
          [s * 0.21, 1.28, -0.15],
          [s * 0.135, 1.15, -0.233],
        ],
        [0.031, 0.025],
      );
    stem(
      r.body,
      '#9b7454',
      [
        [0.242, 0.87, -0.15],
        [0.3, 0.55, -0.17],
      ],
      [0.027, 0.025],
    );
    r.solid(0.17, 0.078, 0.08, r.material(null, '#69737a'), 0.29, 0.59, -0.165);
  }
  if (role === 'farmer' || role === 'fisher') {
    r.solid(
      0.46,
      0.034,
      0.4,
      r.material(null, role === 'fisher' ? '#4c696d' : '#886743'),
      0,
      0.354,
      0,
      head,
    );
    if (role === 'farmer')
      for (let j = 0; j < 3; j++) {
        stem(
          head,
          '#be9858',
          [
            [0.188, 0.35, 0],
            [0.242 + j * 0.019, 0.5 + j * 0.025, 0.018],
          ],
          [0.009, 0.003],
        );
        oval(
          head,
          '#e1c582',
          [0.235 + j * 0.019, 0.47 + j * 0.025, 0.018],
          [0.019, 0.049, 0.012],
        ).rotation.z = -0.31;
      }
  }
}
