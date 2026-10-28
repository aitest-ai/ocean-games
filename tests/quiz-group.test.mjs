// 體感闖關問答, stage three: group play (分組對戰, 全班合作打大 Boss, 接力) and the AI interface
// (prompt templates and reading an AI reply). No browser, no AI service.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateBank, rng } from '../src/quiz/bank.js';
import { Match } from '../src/quiz/match.js';
import { buildPrompt, extractJSON, parseAIOutput, generateWithAI } from '../src/quiz/ai.js';

const load = async (f) => JSON.parse(await readFile(new URL('../data/quiz/' + f, import.meta.url), 'utf8'));
const banks = (await Promise.all((await load('index.json')).banks.map(load))).map((b) => validateBank(b).bank);
const blank = (t) => ({ t: t * 1000, lean: 0, side: 'center', armsUp: 0, crouch: 0, crouching: false, cross: false, pump: 0, events: [] });

// a player who answers tf / run / buzz questions (right with probability skill)
function player(skill, seed) {
  const r = rng(seed);
  let last = null, pick = null, sent = {};
  return (lv, t) => {
    const f = blank(t);
    if (!lv || lv.phase !== 'answer') return f;
    if (lv.step !== last) { last = lv.step; sent = {}; pick = r() < skill ? lv.step.correct : lv.step.kind === 'tf' ? !lv.step.correct : (lv.step.correct + 1) % lv.step.options.length; }
    if (lv.t < 2) return f;
    const id = lv.constructor.name;
    if (id === 'TF') { if (pick) f.armsUp = 1; else f.cross = true; }
    if (id === 'Run') f.side = lv.step.options.length === 3 ? ['left', 'center', 'right'][pick] : pick === 0 ? 'left' : 'right';
    if (id === 'Buzz') {
      if (lv.stage === 'fuse' && !sent.b) { sent.b = 1; f.events.push({ type: 'raise', side: 'both' }); }
      if (lv.stage === 'choose') {
        if (lv.cursor !== pick && (!sent.l || t - sent.l > 0.5)) { sent.l = t; f.events.push({ type: 'lean', side: pick < lv.cursor ? 'left' : 'right' }); }
        else if (lv.cursor === pick && !sent.ok && t - (sent.l || 0) > 0.6) { sent.ok = 1; f.events.push({ type: 'raise', side: 'left' }); }
      }
    }
    return f;
  };
}

// runs a whole match; skills[side] per team. Hand-overs start as soon as they appear.
function runMatch(opts, skills = [0.8, 0.8, 0.8, 0.8]) {
  const M = new Match({ bank: banks[0], levels: [{ level: 'tf', count: 3 }, { level: 'run', count: 3 }, { level: 'buzz', count: 2 }], seed: 4, ...opts });
  const bots = skills.map((s, i) => player(s, i + 1));
  let t = 0, guard = 0;
  const events = [], askedIds = [];
  while (!M.done && guard++ < 30 * 60 * 30) {
    if (M.phase === 'handover') M.begin();
    const lv = M.session?.level;
    for (const e of M.update(1 / 30, bots[M.turn?.side || 0](lv, t))) { events.push(e); if (e.type === 'step') askedIds.push(e.step.qid + (e.step.sub || '')); }
    t += 1 / 30;
  }
  return { M, events, sum: M.summary(), askedIds, t };
}

test('分組對戰: teams take turns in order, each plays one level, scores are kept per team', () => {
  const { M, sum } = runMatch({ mode: 'teams', teams: 3, rounds: 2 });
  assert.equal(M.turns.length, 6);
  assert.deepEqual(M.turns.map((t) => t.side), [0, 1, 2, 0, 1, 2]);
  assert.deepEqual(sum.results.map((r) => r.player), [1, 1, 1, 2, 2, 2]);
  for (const s of sum.sides) assert.equal(s.total, sum.results.filter((r) => r.sideName === s.name).reduce((n, r) => n + r.total, 0));
  assert.equal(sum.sides.reduce((n, s) => n + s.score, 0), sum.results.reduce((n, r) => n + r.score, 0));
});

test('分組對戰: the better team wins, and every team gets an award', () => {
  const { sum } = runMatch({ mode: 'teams', teams: 2, rounds: 3 }, [1, 0.2]);
  assert.equal(sum.ranked[0].name, '紅隊');
  assert.ok(sum.awards.some((a) => a.side === 0) && sum.awards.some((a) => a.side === 1), JSON.stringify(sum.awards));
});

test('no question is asked twice in a match while the bank still has unused ones', () => {
  const { askedIds } = runMatch({ mode: 'teams', teams: 2, rounds: 1 });
  assert.equal(new Set(askedIds).size, askedIds.length);
});

test('hearts belong to the team and carry over between its turns', () => {
  const M = new Match({ mode: 'teams', bank: banks[0], levels: [{ level: 'tf', count: 2 }], teams: 2, rounds: 2, seed: 2, opts: { revive: false } });
  const wrong = player(0, 1), right = player(1, 2);
  let t = 0;
  while (!M.done && t < 2000) { if (M.phase === 'handover') M.begin(); M.update(1 / 30, (M.turn.side ? right : wrong)(M.session?.level, t)); t += 1 / 30; }
  assert.equal(M.sides[0].hearts, 0, 'red lost 4 hearts worth (stops at 0)');
  assert.equal(M.sides[1].hearts, 3);
});

test('全班合作: every right answer hits the shared Boss; a class that knows most answers beats it', () => {
  const win = runMatch({ mode: 'coop', players: 5 }, [0.9]);
  assert.equal(win.M.turns.length, 5);
  assert.equal(win.sum.bossMax, Math.round((3 + 3 + 2 + 3 + 3) * 0.6));
  assert.ok(win.sum.bossDown, JSON.stringify({ hp: win.sum.bossHP, c: win.sum.correct }));
  assert.ok(win.events.some((e) => e.type === 'classBossDown'));
  const lose = runMatch({ mode: 'coop', players: 5 }, [0.1]);
  assert.ok(!lose.sum.bossDown);
});

test('接力: players 1…N in order, the class total adds up', () => {
  const { sum, M } = runMatch({ mode: 'relay', players: 4 });
  assert.deepEqual(sum.results.map((r) => r.player), [1, 2, 3, 4]);
  assert.equal(sum.correct, sum.results.reduce((n, r) => n + r.correct, 0));
  assert.ok(sum.time > 0);
  assert.equal(M.sides.length, 1);
});

test('team revive: the teacher can confirm that the whole team did the task', () => {
  const M = new Match({ mode: 'teams', bank: banks[0], levels: [{ level: 'tf', count: 6 }], teams: 2, rounds: 1, seed: 3 });
  M.begin();
  const wrong = player(0, 1);
  let t = 0, revived = null;
  while (t < 300 && !revived) {
    if (M.session.phase === 'revive') M.teamRevive();
    for (const e of M.update(1 / 30, wrong(M.session.level, t))) if (e.type === 'revived') revived = e;
    t += 1 / 30;
  }
  assert.ok(revived?.success);
  assert.equal(M.side.hearts, 3);
});

// ── AI interface ──
test('the AI prompt asks for this game\'s JSON format, the chosen types and the material, and nothing personal', () => {
  const p = buildPrompt({ material: '水在 0°C 會結冰。', subject: '自然', grade: '四年級', count: 8, types: ['choice', 'tf', 'order'] });
  assert.match(p, /"format": "taikan-quiz"/);
  assert.match(p, /出 8 題/);
  assert.match(p, /選擇題 choice/); assert.match(p, /是非題 tf/); assert.match(p, /排序題 order/);
  assert.doesNotMatch(p, /配對題 match/);
  assert.match(p, /水在 0°C 會結冰。/);
  assert.match(p, /不要使用任何人的真實姓名/);
});

test('an AI reply wrapped in prose and ``` fences is read and checked like any bank', () => {
  const reply = '好的，以下是題目：\n```json\n{"format":"taikan-quiz","title":"水","questions":[{"type":"choice","q":"水在幾度結冰？","options":["0°C","10°C","100°C"],"answer":"A","difficulty":1,"tags":["水"]},{"type":"tf","q":"冰比水重。","answer":"×"},{"type":"choice","q":"壞題","options":["只有一個"],"answer":"A"}]}\n```\n希望有幫助！';
  assert.ok(extractJSON(reply).startsWith('{'));
  const r = parseAIOutput(reply);
  assert.equal(r.bank.questions.length, 2);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0].msg, /至少要 2 個選項/);
  const text = parseAIOutput('1. 水在幾度結冰？\nA. 0°C *\nB. 100°C');
  assert.equal(text.bank.questions[0].answer, 0, 'plain-text replies work too');
});

test('the AI hook sends nothing unless a school sets its own endpoint', async () => {
  await assert.rejects(() => generateWithAI({ material: 'x' }, undefined), /尚未設定 AI 服務/);
});
