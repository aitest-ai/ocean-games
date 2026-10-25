// Built-in drawings for picture questions: simple SVG made by code (original, no outside images),
// referred to as "art:<kind>:<value>" from any question bank, for example
//   art:clock:3:30  art:pie:3/4  art:dots:7  art:shape:triangle  art:color:red
//   art:weather:rain  art:animal:cat  art:plant:sprout  art:state:ice  art:moon:full
// Teachers without pictures can use these (the list is shown in the editor).

const C = { red: '#e8453c', orange: '#f39b2a', yellow: '#f6d32d', green: '#3cb36b', blue: '#3a7bd5', purple: '#8e5cc9', pink: '#f28bb5', brown: '#8b5a2b', black: '#222', white: '#fafafa', gray: '#9aa0a6' };
export const ART_LIST = {
  clock: ['3:00', '6:30', '9:15', '12:45'], pie: ['1/2', '1/3', '1/4', '2/3', '3/4', '3/8'], dots: ['1', '5', '7', '10'],
  shape: ['circle', 'triangle', 'square', 'rectangle', 'pentagon', 'hexagon', 'star', 'heart'],
  color: Object.keys(C), weather: ['sun', 'cloud', 'rain', 'snow', 'thunder', 'rainbow'],
  animal: ['cat', 'dog', 'fish', 'bird', 'rabbit', 'pig'], plant: ['seed', 'sprout', 'leaf', 'flower', 'fruit'],
  state: ['ice', 'water', 'steam'], moon: ['new', 'crescent', 'half', 'full'],
};
export const ART_NAMES = { clock: '時鐘', pie: '分數圓餅', dots: '點點（數數）', shape: '形狀', color: '顏色', weather: '天氣', animal: '動物', plant: '植物生長', state: '水的三態', moon: '月相' };

const svg = (body, bg = '#ffffff') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" rx="18" fill="${bg}"/>${body}</svg>`;
const poly = (n, r, cx = 100, cy = 104, rot = -Math.PI / 2) => Array.from({ length: n }, (_, i) => { const a = rot + (i * 2 * Math.PI) / n; return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`; }).join(' ');

function clock(v) {
  const [h, m] = v.split(':').map(Number);
  const ma = (m / 60) * 2 * Math.PI, ha = (((h % 12) + m / 60) / 12) * 2 * Math.PI;
  const hand = (a, len, w, c) => `<line x1="100" y1="100" x2="${100 + len * Math.sin(a)}" y2="${100 - len * Math.cos(a)}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;
  let ticks = '';
  for (let i = 0; i < 12; i++) { const a = (i / 12) * 2 * Math.PI; ticks += `<text x="${100 + 64 * Math.sin(a)}" y="${100 - 64 * Math.cos(a) + 7}" font-size="20" text-anchor="middle" font-family="sans-serif" fill="#333">${i || 12}</text>`; }
  return svg(`<circle cx="100" cy="100" r="84" fill="#fff8e7" stroke="#333" stroke-width="6"/>${ticks}${hand(ha, 42, 9, '#222')}${hand(ma, 64, 5, '#e8453c')}<circle cx="100" cy="100" r="6" fill="#222"/>`);
}
function pie(v) {
  const [n, d] = v.split('/').map(Number);
  let s = '';
  for (let i = 0; i < d; i++) {
    const a0 = (i / d) * 2 * Math.PI - Math.PI / 2, a1 = ((i + 1) / d) * 2 * Math.PI - Math.PI / 2;
    const p = (a) => `${100 + 80 * Math.cos(a)},${100 + 80 * Math.sin(a)}`;
    s += d === 1 ? `<circle cx="100" cy="100" r="80" fill="${i < n ? '#f39b2a' : '#fff'}" stroke="#333" stroke-width="4"/>` : `<path d="M100,100 L${p(a0)} A80,80 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1)} Z" fill="${i < n ? '#f39b2a' : '#fff'}" stroke="#333" stroke-width="4"/>`;
  }
  return svg(s);
}
function dots(v) {
  const n = Math.min(Number(v) || 0, 20);
  let s = '';
  for (let i = 0; i < n; i++) { const r = Math.floor(i / 5), c = i % 5; s += `<circle cx="${30 + c * 35}" cy="${40 + r * 40}" r="13" fill="#3a7bd5"/>`; }
  return svg(s);
}
function shape(v) {
  const f = 'fill="#3cb36b" stroke="#1f6b3d" stroke-width="5"';
  const m = {
    circle: `<circle cx="100" cy="100" r="70" ${f}/>`, triangle: `<polygon points="${poly(3, 80, 100, 115)}" ${f}/>`,
    square: `<rect x="35" y="35" width="130" height="130" ${f}/>`, rectangle: `<rect x="20" y="55" width="160" height="90" ${f}/>`,
    pentagon: `<polygon points="${poly(5, 78)}" ${f}/>`, hexagon: `<polygon points="${poly(6, 78, 100, 100, 0)}" ${f}/>`,
    star: `<polygon points="${Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 34 : 82; return `${100 + r * Math.cos(a)},${106 + r * Math.sin(a)}`; }).join(' ')}" ${f}/>`,
    heart: `<path d="M100,170 C30,120 20,70 55,50 C78,37 95,52 100,65 C105,52 122,37 145,50 C180,70 170,120 100,170 Z" fill="#e8453c" stroke="#9c2620" stroke-width="5"/>`,
  };
  return svg(m[v] || m.circle);
}
const color = (v) => svg(`<circle cx="100" cy="100" r="72" fill="${C[v] || '#888'}" stroke="#333" stroke-width="4"/>`, v === 'white' ? '#cfd8dc' : '#ffffff');
function weather(v) {
  const cloud = (x, y, c = '#cfd8dc') => `<g fill="${c}"><circle cx="${x}" cy="${y}" r="28"/><circle cx="${x + 30}" cy="${y - 12}" r="34"/><circle cx="${x + 62}" cy="${y}" r="26"/><rect x="${x}" y="${y}" width="62" height="26"/></g>`;
  const sun = (x, y, r) => `<g stroke="#f39b2a" stroke-width="7" stroke-linecap="round">${Array.from({ length: 8 }, (_, i) => { const a = (i * Math.PI) / 4; return `<line x1="${x + (r + 10) * Math.cos(a)}" y1="${y + (r + 10) * Math.sin(a)}" x2="${x + (r + 26) * Math.cos(a)}" y2="${y + (r + 26) * Math.sin(a)}"/>`; }).join('')}</g><circle cx="${x}" cy="${y}" r="${r}" fill="#f6d32d"/>`;
  const m = {
    sun: sun(100, 100, 40), cloud: cloud(55, 100),
    rain: cloud(55, 80, '#90a4ae') + Array.from({ length: 5 }, (_, i) => `<line x1="${60 + i * 18}" y1="125" x2="${52 + i * 18}" y2="150" stroke="#3a7bd5" stroke-width="6" stroke-linecap="round"/>`).join(''),
    snow: cloud(55, 80, '#b0bec5') + Array.from({ length: 4 }, (_, i) => `<text x="${62 + i * 24}" y="160" font-size="28" fill="#3a7bd5" font-family="sans-serif">✻</text>`).join(''),
    thunder: cloud(55, 80, '#78909c') + `<polygon points="105,110 85,150 102,150 92,185 125,138 107,138 118,110" fill="#f6d32d" stroke="#c79a00" stroke-width="3"/>`,
    rainbow: ['#e8453c', '#f39b2a', '#f6d32d', '#3cb36b', '#3a7bd5', '#8e5cc9'].map((c, i) => `<path d="M${20 + i * 10},150 A${80 - i * 10},${80 - i * 10} 0 0 1 ${180 - i * 10},150" fill="none" stroke="${c}" stroke-width="10"/>`).join(''),
  };
  return svg(m[v] || m.sun, '#e3f2fd');
}
function animal(v) {
  const eye = (x, y) => `<circle cx="${x}" cy="${y}" r="7" fill="#222"/><circle cx="${x + 2}" cy="${y - 2}" r="2" fill="#fff"/>`;
  const m = {
    cat: `<polygon points="45,70 60,25 85,60" fill="#f39b2a"/><polygon points="155,70 140,25 115,60" fill="#f39b2a"/><circle cx="100" cy="105" r="62" fill="#f39b2a"/>${eye(78, 98)}${eye(122, 98)}<polygon points="94,118 106,118 100,126" fill="#e8453c"/><g stroke="#5a3200" stroke-width="3"><line x1="60" y1="120" x2="20" y2="112"/><line x1="60" y1="128" x2="22" y2="135"/><line x1="140" y1="120" x2="180" y2="112"/><line x1="140" y1="128" x2="178" y2="135"/></g>`,
    dog: `<ellipse cx="45" cy="95" rx="20" ry="42" fill="#8b5a2b"/><ellipse cx="155" cy="95" rx="20" ry="42" fill="#8b5a2b"/><circle cx="100" cy="100" r="58" fill="#d7a86e"/>${eye(80, 92)}${eye(120, 92)}<ellipse cx="100" cy="125" rx="24" ry="18" fill="#f3d9b1"/><ellipse cx="100" cy="117" rx="10" ry="7" fill="#222"/><path d="M100,124 v10" stroke="#222" stroke-width="3"/><ellipse cx="100" cy="148" rx="9" ry="10" fill="#e8453c"/>`,
    fish: `<ellipse cx="95" cy="100" rx="62" ry="38" fill="#3a7bd5"/><polygon points="150,100 185,70 185,130" fill="#3a7bd5"/>${eye(65, 92)}<path d="M100,70 q12,30 0,60" stroke="#1d4f91" stroke-width="4" fill="none"/>`,
    bird: `<ellipse cx="100" cy="110" rx="58" ry="46" fill="#f6d32d"/><circle cx="130" cy="78" r="30" fill="#f6d32d"/>${eye(138, 72)}<polygon points="158,78 185,86 158,92" fill="#f39b2a"/><path d="M60,105 q30,-25 55,5 q-30,15 -55,-5z" fill="#e0b800"/><line x1="90" y1="155" x2="85" y2="180" stroke="#f39b2a" stroke-width="5"/><line x1="110" y1="155" x2="115" y2="180" stroke="#f39b2a" stroke-width="5"/>`,
    rabbit: `<ellipse cx="78" cy="50" rx="15" ry="42" fill="#eeeeee" stroke="#bbb" stroke-width="3"/><ellipse cx="122" cy="50" rx="15" ry="42" fill="#eeeeee" stroke="#bbb" stroke-width="3"/><ellipse cx="78" cy="52" rx="6" ry="30" fill="#f28bb5"/><ellipse cx="122" cy="52" rx="6" ry="30" fill="#f28bb5"/><circle cx="100" cy="125" r="52" fill="#eeeeee" stroke="#bbb" stroke-width="3"/>${eye(82, 118)}${eye(118, 118)}<ellipse cx="100" cy="138" rx="7" ry="5" fill="#f28bb5"/>`,
    pig: `<polygon points="50,65 65,40 80,62" fill="#f28bb5"/><polygon points="150,65 135,40 120,62" fill="#f28bb5"/><circle cx="100" cy="105" r="62" fill="#f8b4cf"/>${eye(78, 92)}${eye(122, 92)}<ellipse cx="100" cy="125" rx="26" ry="18" fill="#f28bb5"/><ellipse cx="91" cy="125" rx="5" ry="7" fill="#9c4a6b"/><ellipse cx="109" cy="125" rx="5" ry="7" fill="#9c4a6b"/>`,
  };
  return svg(m[v] || m.cat, '#f1f8e9');
}
function plant(v) {
  const soil = '<rect x="0" y="150" width="200" height="50" fill="#8b5a2b"/>';
  const stem = (h) => `<path d="M100,150 v-${h}" stroke="#2e7d32" stroke-width="7"/>`;
  const leaf = (y, s) => `<ellipse cx="${100 + s * 24}" cy="${y}" rx="22" ry="10" fill="#3cb36b" transform="rotate(${s * -25} ${100 + s * 24} ${y})"/>`;
  const m = {
    seed: soil + '<ellipse cx="100" cy="168" rx="16" ry="10" fill="#5d4037"/>',
    sprout: soil + stem(30) + leaf(122, -1) + leaf(122, 1),
    leaf: soil + stem(80) + leaf(130, -1) + leaf(110, 1) + leaf(90, -1) + leaf(78, 1),
    flower: soil + stem(90) + leaf(130, -1) + leaf(110, 1) + Array.from({ length: 6 }, (_, i) => { const a = (i * Math.PI) / 3; return `<circle cx="${100 + 20 * Math.cos(a)}" cy="${55 + 20 * Math.sin(a)}" r="14" fill="#f28bb5"/>`; }).join('') + '<circle cx="100" cy="55" r="12" fill="#f6d32d"/>',
    fruit: soil + stem(90) + leaf(130, -1) + leaf(110, 1) + '<circle cx="100" cy="62" r="26" fill="#e8453c"/><path d="M100,36 q8,-10 16,-6" stroke="#2e7d32" stroke-width="4" fill="none"/>',
  };
  return svg(m[v] || m.seed, '#e3f2fd');
}
function state(v) {
  const m = {
    ice: '<polygon points="55,80 120,60 160,95 150,160 80,170 45,130" fill="#cfe9ff" stroke="#6aa9e0" stroke-width="5"/><path d="M75,95 l25,-8 M95,120 l30,-10" stroke="#fff" stroke-width="6"/>',
    water: '<path d="M100,30 C140,90 160,115 160,135 A60,60 0 0 1 40,135 C40,115 60,90 100,30 Z" fill="#3a7bd5"/><ellipse cx="78" cy="130" rx="8" ry="16" fill="#9cc7ff"/>',
    steam: '<rect x="45" y="140" width="110" height="40" rx="10" fill="#90a4ae"/>' + [70, 100, 130].map((x) => `<path d="M${x},130 c-15,-20 15,-30 0,-50 c-15,-20 15,-30 0,-50" stroke="#b0bec5" stroke-width="8" fill="none" stroke-linecap="round"/>`).join(''),
  };
  return svg(m[v] || m.water, '#f5f5f5');
}
function moon(v) {
  const base = '<circle cx="100" cy="100" r="70" fill="#37474f"/>';
  const m = {
    new: base, full: '<circle cx="100" cy="100" r="70" fill="#fff3b0"/>',
    half: base + '<path d="M100,30 A70,70 0 0 1 100,170 Z" fill="#fff3b0"/>',
    crescent: base + '<path d="M100,30 A70,70 0 0 1 100,170 A40,70 0 0 0 100,30 Z" fill="#fff3b0"/>',
  };
  return svg(m[v] || m.full, '#0d1b2a');
}

const KINDS = { clock, pie, dots, shape, color, weather, animal, plant, state, moon };
const cache = new Map();
// "art:clock:3:30" → data URL (or '' if unknown)
export function artURL(ref) {
  if (cache.has(ref)) return cache.get(ref);
  const m = /^art:([a-z]+):(.+)$/.exec(ref);
  const f = m && KINDS[m[1]];
  const url = f ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(f(m[2])) : '';
  cache.set(ref, url);
  return url;
}

// any image reference of a bank → URL to show ('' when there is none)
export function imageURL(ref, bank) {
  if (!ref) return '';
  if (ref.startsWith('art:')) return artURL(ref);
  if (/^(data:|blob:)/.test(ref)) return ref;
  const id = ref.startsWith('img:') ? ref.slice(4) : Object.keys(bank?.images || {}).find((k) => bank.images[k].name === ref);
  return (id && bank?.images?.[id]?.data) || '';
}
