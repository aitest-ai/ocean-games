// 用 AI 把教材轉成題目 — the interface only. This version does NOT call any AI service.
//
//   buildPrompt(options)      → the prompt text a teacher copies into an AI tool they choose
//   parseAIOutput(text)       → finds the JSON in an AI reply and checks it like any other bank
//   generateWithAI(options)   → reserved hook for a school's own backend (see docs/quiz-ai.md);
//                               it only works when a page sets window.QUIZ_AI = { endpoint, … }
//
// Privacy: the teaching material goes wherever the teacher pastes it. The prompt asks for questions
// only; it never includes students' names or answers.
import { parseAny, TYPE_NAMES } from './bank.js';

export const AI_TYPES = ['choice', 'tf', 'order', 'match', 'number'];

export function buildPrompt({ material = '', subject = '', grade = '', count = 10, types = ['choice', 'tf'], difficulty = 'mixed', language = '繁體中文（臺灣用語）' } = {}) {
  const typeLines = {
    choice: '- 選擇題 choice：2～4 個選項（options），answer 寫正確選項的字母 A～D',
    tf: '- 是非題 tf：一句話，answer 寫 "○"（對）或 "×"（錯）',
    order: '- 排序題 order：2～6 個項目，items 依「正確順序」排列',
    match: '- 配對題 match：2～6 組，pairs 寫成 [["左", "右"], …]，右邊不可重複',
    number: '- 數字題 number：answer 是一個數字（不要算式、不要分數），可另給 options 當錯誤選項，unit 寫單位',
  };
  return `你是國小老師的出題助手。請根據下面的「教材」出 ${count} 題給${grade || '國小'}學生的${subject || ''}題目，用${language}。

【規則】
1. 只根據教材內容出題，不要加入教材以外的知識；不確定的不要出。
2. 每題要短（題目最好 40 字以內，選項 12 字以內），學生要站在 2 公尺外看投影幕作答。
3. 題型只用下面這些：
${types.map((t) => typeLines[t]).filter(Boolean).join('\n')}
4. 每題加：difficulty（1 簡單、2 普通、3 困難${difficulty === 'mixed' ? '，三種都要有' : `，都用 ${difficulty}`}）、explain（一句話解說，答錯時給學生看）、tags（1～2 個主題標籤）。
5. 錯誤選項要「看起來合理」，但只能有一個正確答案；不要出「以上皆是／以上皆非」。
6. 不要使用任何人的真實姓名、照片或個人資料；不要抄錄受版權保護的長段文字。

【輸出格式】只輸出一個 JSON，不要其他文字：
{
  "format": "taikan-quiz", "version": 1,
  "title": "（題庫名稱）", "subject": "${subject}", "grade": "${grade}",
  "author": "AI 協助出題，老師審核", "license": "依教材授權，僅供教學使用",
  "questions": [
    { "type": "choice", "q": "題目", "options": ["選項1", "選項2", "選項3"], "answer": "A", "explain": "解說", "difficulty": 1, "tags": ["主題"] },
    { "type": "tf", "q": "一句話", "answer": "○", "explain": "解說", "difficulty": 1, "tags": ["主題"] }
  ]
}

【教材】
${material.trim()}`;
}

// AI replies often wrap the JSON in ``` fences or add a sentence before it
export function extractJSON(text) {
  const s = String(text || '');
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) return s.slice(a, b + 1);
  return s.trim();
}

// → { bank, errors, warnings } like parseAny; AI output that is not JSON is read as pasted text
export function parseAIOutput(text, images = {}) {
  const js = extractJSON(text);
  if (js.startsWith('{') || js.startsWith('[')) return parseAny(js, 'ai.json', images);
  return parseAny(text, '', images);
}

// Reserved hook. A school that runs its own AI service sets, before this page loads:
//   window.QUIZ_AI = { endpoint: 'https://…/quiz', headers: { … } }
// and the service answers POST { prompt } with { text }. Nothing is sent unless that is set.
export async function generateWithAI(options, cfg = globalThis.QUIZ_AI) {
  if (!cfg?.endpoint) throw new Error('尚未設定 AI 服務（這個版本只提供提示詞，請複製到您自己的 AI 工具）');
  const res = await fetch(cfg.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cfg.headers || {}) }, body: JSON.stringify({ prompt: buildPrompt(options) }) });
  if (!res.ok) throw new Error('AI 服務回應錯誤：' + res.status);
  const { text } = await res.json();
  return parseAIOutput(text);
}

// the editor's "🤖 用 AI 轉題" tab
export function aiPanelHTML() {
  return `
  <p>把教材文字交給<b>您自己選用的 AI 工具</b>，請它照本遊戲的格式出題，再把結果貼回來檢查。<b>這個網站不會把教材送到任何地方</b>；要不要用 AI、用哪一個，由老師決定。</p>
  <ol class="small">
    <li>貼上教材（課文、講義的一段），選好題型和題數，按「產生提示詞」。</li>
    <li>按「複製提示詞」，貼到您的 AI 工具。</li>
    <li>把 AI 回覆的<b>整段文字</b>貼到下面第二個框，按「檢查並加入題庫」。</li>
    <li><b>一定要逐題看過</b>：AI 可能出錯、答案可能不對。</li>
  </ol>
  <p class="warnbox small">⚖️ 教材要有使用權；不要貼學生姓名、成績或任何個人資料。AI 產生的題目請老師審核後再使用。</p>
  <div class="meta">
    <label>科目<input id="aiSubject" placeholder="例如 自然"></label>
    <label>年級<input id="aiGrade" placeholder="例如 四年級"></label>
    <label>題數<input id="aiCount" type="number" min="3" max="30" value="10"></label>
    <label>難度<select id="aiDiff"><option value="mixed">混合</option><option value="1">1 簡單</option><option value="2">2 普通</option><option value="3">3 困難</option></select></label>
  </div>
  <p class="small">題型：${AI_TYPES.map((t) => `<label><input type="checkbox" class="aiType" value="${t}" ${t === 'choice' || t === 'tf' ? 'checked' : ''}> ${TYPE_NAMES[t]}</label>`).join('　')}</p>
  <textarea id="aiMaterial" rows="7" placeholder="在這裡貼上教材文字…"></textarea>
  <div class="btns"><button id="aiMake" class="primary">產生提示詞</button><button id="aiCopy" disabled>📋 複製提示詞</button></div>
  <textarea id="aiPrompt" rows="8" readonly placeholder="提示詞會出現在這裡"></textarea>
  <h3>貼回 AI 的回覆</h3>
  <textarea id="aiReply" rows="8" placeholder="把 AI 回覆的整段文字貼在這裡…"></textarea>
  <div class="btns"><button id="aiCheck" class="primary">🔍 檢查並加入題庫</button><span id="aiSum" class="muted"></span></div>
  <div id="aiReport"></div>`;
}

// wire the tab; onReady(result) receives the checked bank (the editor adds its questions)
export function mountAIPanel(root, { onResult }) {
  root.innerHTML = aiPanelHTML();
  const $ = (id) => root.querySelector('#' + id);
  $('aiMake').onclick = () => {
    $('aiPrompt').value = buildPrompt({
      material: $('aiMaterial').value, subject: $('aiSubject').value, grade: $('aiGrade').value,
      count: Math.min(Math.max(Number($('aiCount').value) || 10, 3), 30), difficulty: $('aiDiff').value,
      types: [...root.querySelectorAll('.aiType:checked')].map((x) => x.value),
    });
    $('aiCopy').disabled = !$('aiMaterial').value.trim();
    if (!$('aiMaterial').value.trim()) $('aiPrompt').value = '（請先貼上教材文字）';
  };
  $('aiCopy').onclick = async () => { try { await navigator.clipboard.writeText($('aiPrompt').value); $('aiCopy').textContent = '✅ 已複製'; } catch { $('aiPrompt').select(); } };
  $('aiCheck').onclick = () => onResult($('aiReply').value, { report: $('aiReport'), sum: $('aiSum'), clear: () => { $('aiReply').value = ''; } });
}
