// 事件的中文說明（測試頁、遊戲 HUD 共用）
const SIDE = { left: '左', right: '右', both: '雙手', center: '回正' };
export const ACTION_NAMES = { paddle: '划槳', lean: '傾斜', raise: '舉手', jump: '跳躍', swing: '揮臂', crouch: '蹲低' };

export function describe(e) {
  switch (e.type) {
    case 'paddle': return e.side === 'both' ? '雙手一起划' : `${SIDE[e.side]}邊划槳`;
    case 'lean': return e.side === 'center' ? '身體回正' : `身體向${SIDE[e.side]}傾`;
    case 'raise': return e.side === 'both' ? '雙手舉高' : `舉${SIDE[e.side]}手`;
    case 'jump': return '跳躍';
    case 'swing': return `${SIDE[e.side]}手往${SIDE[e.dir]}揮`;
    case 'crouch': return e.on ? '蹲低' : '站起來';
    case 'status': return e.hint || '追蹤正常';
    default: return e.type;
  }
}
