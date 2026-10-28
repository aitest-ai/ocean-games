// "How to set up the classroom" diagram (inline SVG, drawn by code), shown in the menu and the docs.
// Top view: projector screen and camera at the front, a tape mark for the player 2 m away, the
// camera's field of view, the waiting line outside it, and the class seated behind.
export function classroomSVG() {
  return `<svg viewBox="0 0 640 420" role="img" aria-label="教室擺法俯視圖" style="width:100%;max-width:640px;background:#10213a;border-radius:12px">
  <defs><marker id="ar" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#ffd23f"/></marker></defs>
  <rect x="170" y="14" width="300" height="16" rx="4" fill="#cfe3ff"/><text x="320" y="27" fill="#10213a" font-size="13" text-anchor="middle">投影幕／大螢幕（遊戲畫面）</text>
  <rect x="306" y="34" width="28" height="14" rx="3" fill="#ffd23f"/><text x="298" y="46" fill="#ffd23f" font-size="13" text-anchor="end">📷 鏡頭（螢幕正下方、胸口高）</text>
  <path d="M320,48 L170,300 L470,300 Z" fill="rgba(99,184,255,0.13)" stroke="rgba(99,184,255,0.6)" stroke-dasharray="6 5"/>
  <text x="320" y="104" fill="#8fcaff" font-size="13" text-anchor="middle">鏡頭看得到的範圍</text><text x="320" y="121" fill="#8fcaff" font-size="13" text-anchor="middle">（只能有一個人）</text>
  <circle cx="320" cy="210" r="56" fill="none" stroke="#ff8a65" stroke-width="2" stroke-dasharray="4 4"/>
  <text x="320" y="286" fill="#ff8a65" font-size="13" text-anchor="middle">虛線圓：淨空，張開雙臂碰不到東西</text>
  <rect x="296" y="205" width="48" height="10" fill="#ffd23f"/><text x="320" y="198" fill="#fff" font-size="15" text-anchor="middle">🧍 玩家</text><text x="320" y="236" fill="#fff" font-size="13" text-anchor="middle">地上貼膠帶</text>
  <line x1="480" y1="44" x2="480" y2="210" stroke="#ffd23f" stroke-width="1.5" marker-start="url(#ar)" marker-end="url(#ar)"/><text x="488" y="132" fill="#ffd23f" font-size="13">離鏡頭</text><text x="488" y="150" fill="#ffd23f" font-size="13">1.5～2.5 m</text>
  <text x="70" y="200" fill="#c9f7d9" font-size="14" text-anchor="middle">🧍🧍🧍</text><text x="70" y="222" fill="#c9f7d9" font-size="13" text-anchor="middle">下一棒排在</text><text x="70" y="240" fill="#c9f7d9" font-size="13" text-anchor="middle">鏡頭範圍外</text>
  <path d="M110,250 Q200,270 285,222" fill="none" stroke="#c9f7d9" stroke-dasharray="4 4" marker-end="url(#ar)"/>
  <text x="582" y="236" fill="#ffd38a" font-size="14" text-anchor="middle">🧑‍🏫 老師</text><text x="582" y="254" fill="#ffd38a" font-size="12" text-anchor="middle">空白鍵：換人</text><text x="582" y="270" fill="#ffd38a" font-size="12" text-anchor="middle">Esc：暫停</text><text x="582" y="286" fill="#ffd38a" font-size="12" text-anchor="middle">Y：全隊復活</text>
  ${[0, 1, 2].map((r) => [0, 1, 2, 3, 4, 5].map((c) => `<rect x="${130 + c * 66}" y="${318 + r * 32}" width="50" height="20" rx="4" fill="#2a4166"/>`).join('')).join('')}
  <text x="320" y="414" fill="#9fb2cc" font-size="13" text-anchor="middle">其他同學坐在後面看投影、幫隊友加油（在鏡頭範圍外）</text>
</svg>`;
}
