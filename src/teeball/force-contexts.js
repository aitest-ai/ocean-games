// Fixed start snapshots only. One throw, no chain outs or recomputed continuing play.
export const FORCE_CONTEXTS = Object.freeze([
  {
    "id": "force-first-empty",
    "occupiedBeforeHit": [],
    "runners": [
      {
        "base": 0,
        "destination": 1,
        "status": "advancing",
        "target": true
      }
    ],
    "receiverReady": [
      1,
      2,
      3,
      4
    ],
    "objective": "retireBatterRunner",
    "prompt": "壘上原本無人。有效滾地球已由你控制，尚無人出局或到達下一壘；各壘隊友已就位。任務：阻止打者安全到一壘。判斷傳球方向。",
    "explanation": "打者須先到一壘，持球踩一壘可讓打者出局。",
    "sourceRefs": [
      "chba-general:二、4"
    ],
    "requiredTarget": 1,
    "goal": "阻止打者安全到一壘"
  },
  {
    "id": "force-second-first-occupied",
    "occupiedBeforeHit": [
      1
    ],
    "runners": [
      {
        "base": 0,
        "destination": 1,
        "status": "advancing"
      },
      {
        "base": 1,
        "destination": 2,
        "status": "forced",
        "target": true
      }
    ],
    "receiverReady": [
      1,
      2,
      3,
      4
    ],
    "objective": "oneReliableOut",
    "prompt": "原本一壘有人。有效滾地球已由你控制，尚無人出局或到達下一壘；各壘隊友已就位。任務：優先讓最前方被迫前進的跑者出局（本題只處理一次傳球）。判斷傳球方向。",
    "explanation": "一壘跑者受迫往二壘；依本題優先處理最前跑者的目標，傳二壘。",
    "sourceRefs": [
      "chba-general:二、4",
      "chba-faq:10"
    ],
    "requiredTarget": 2,
    "goal": "優先讓最前方被迫前進的跑者出局（本題只處理一次傳球）"
  },
  {
    "id": "force-third-first-second-occupied",
    "occupiedBeforeHit": [
      1,
      2
    ],
    "runners": [
      {
        "base": 0,
        "destination": 1,
        "status": "advancing"
      },
      {
        "base": 1,
        "destination": 2,
        "status": "forced"
      },
      {
        "base": 2,
        "destination": 3,
        "status": "forced",
        "target": true
      }
    ],
    "receiverReady": [
      1,
      2,
      3,
      4
    ],
    "objective": "oneReliableOut",
    "prompt": "原本一、二壘有人。有效滾地球已由你控制，尚無人出局或到達下一壘；各壘隊友已就位。任務：優先讓最前方被迫前進的跑者出局（本題只處理一次傳球）。判斷傳球方向。",
    "explanation": "後方壘位連續有人，二壘跑者受迫往三壘；依本題優先處理最前跑者的目標，傳三壘。",
    "sourceRefs": [
      "chba-general:二、4",
      "chba-faq:10"
    ],
    "requiredTarget": 3,
    "goal": "優先讓最前方被迫前進的跑者出局（本題只處理一次傳球）"
  },
  {
    "id": "force-home-loaded",
    "occupiedBeforeHit": [
      1,
      2,
      3
    ],
    "runners": [
      {
        "base": 0,
        "destination": 1,
        "status": "advancing"
      },
      {
        "base": 1,
        "destination": 2,
        "status": "forced"
      },
      {
        "base": 2,
        "destination": 3,
        "status": "forced"
      },
      {
        "base": 3,
        "destination": 4,
        "status": "forced",
        "target": true
      }
    ],
    "receiverReady": [
      1,
      2,
      3,
      4
    ],
    "objective": "preventLeadRunnerScoring",
    "prompt": "原本滿壘。有效滾地球已由你控制，尚無人出局或到達下一壘；各壘隊友已就位。任務：優先阻止三壘跑者得分。判斷傳球方向。",
    "explanation": "滿壘時三壘跑者受迫往本壘；依阻止這一分的指定目標，傳本壘。",
    "sourceRefs": [
      "chba-general:二、4",
      "chba-general:一、11"
    ],
    "requiredTarget": 4,
    "goal": "優先阻止三壘跑者得分"
  }
].map(c=>Object.freeze({...c,runners:Object.freeze(c.runners.map(r=>Object.freeze(r))),receiverReady:Object.freeze(c.receiverReady)})));
export function validateForceContext(c){
 const canonical=FORCE_CONTEXTS.find(x=>x.id===c?.id);
 if(!canonical||c.requiredTarget!==canonical.requiredTarget||JSON.stringify(c.runners)!==JSON.stringify(canonical.runners))throw new Error('Unsupported or contradictory force snapshot');
 return canonical;
}
