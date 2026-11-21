// AI plan features (xAI Grok API). Stores only per-user daily COUNTS and a global spend total. Never stores or logs plan text,
// and never logs/returns the API key.
// v22: up to AI_MAX_IMAGES pictures per photo import (pages of one plan), each <= AI_MAX_IMAGE_BYTES; one call = one daily use.
export const AI_MAX_IMAGES = 6;
export const AI_MAX_IMAGE_BYTES = 4 * 1024 * 1024, AI_MAX_IMAGE_BODY = (Math.ceil(AI_MAX_IMAGE_BYTES * 4 / 3) + 1024) * AI_MAX_IMAGES + 4096, IMAGE_MIMES = ['image/jpeg', 'image/png'];
export const AI_MAX_TEXT = 6000, AI_MAX_TOKENS = 4000, AI_TIMEOUT_MS = 45000;
const MAX_DAYS = 7, MAX_EX = 12;
const clampN = (v, lo, hi, d) => { v = Math.round(+v); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; };
const str = (v, n) => typeof v === 'string' ? v.replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, n) : '';
export const utcDay = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
export const resetsAt = (t = Date.now()) => new Date(Date.UTC(...utcDay(t).split('-').map((x, i) => i === 1 ? x - 1 : +x)) + 864e5).toISOString();

// ---- schema the model must follow (strict JSON schema) ----
const EX = { type: 'object', additionalProperties: false, required: ['name', 'sets', 'repMin', 'repMax', 'rest', 'note'],
  properties: { name: { type: 'string' }, sets: { type: 'integer' }, repMin: { type: 'integer' }, repMax: { type: 'integer' }, rest: { type: 'integer' }, note: { type: 'string' } } };
const DAY = { type: 'object', additionalProperties: false, required: ['name', 'rest', 'estMinutes', 'exercises'],
  properties: { name: { type: 'string' }, rest: { type: 'boolean' }, estMinutes: { type: 'integer' }, exercises: { type: 'array', items: EX } } };
const PLAN = { type: 'object', additionalProperties: false, required: ['name', 'notes', 'days'],
  properties: { name: { type: 'string' }, notes: { type: 'string' }, days: { type: 'array', items: DAY } } };
export const SCHEMA = { plan: PLAN,
  parse: { type: 'object', additionalProperties: false, required: ['name', 'notes', 'days', 'unparsed'],
    properties: { ...PLAN.properties, unparsed: { type: 'array', items: { type: 'string' } } } } };

// ---- validation / normalisation: unknown fields dropped, numbers clamped, counts capped ----
export function normPlan(p) {
  if (!p || typeof p !== 'object' || !Array.isArray(p.days)) throw new Error('bad_ai_output');
  const days = p.days.slice(0, MAX_DAYS).map((d, i) => {
    if (!d || typeof d !== 'object') return null;
    const ex = (Array.isArray(d.exercises) ? d.exercises : []).slice(0, MAX_EX).map(e => {
      const name = str(e && e.name, 60); if (!name) return null;
      let lo = clampN(e.repMin, 1, 100, 8), hi = clampN(e.repMax, 1, 100, lo); if (hi < lo) [lo, hi] = [hi, lo];
      return { name, sets: clampN(e.sets, 1, 10, 3), repMin: lo, repMax: hi, rest: clampN(e.rest, 0, 600, 90), note: str(e.note, 140) };
    }).filter(Boolean);
    const rest = !!d.rest && !ex.length;
    return { name: str(d.name, 40) || (rest ? 'Rest' : 'Day ' + (i + 1)), rest, estMinutes: rest ? 0 : clampN(d.estMinutes, 0, 240, 0), exercises: rest ? [] : ex };
  }).filter(d => d && (d.rest || d.exercises.length));
  if (!days.some(d => !d.rest)) throw new Error('bad_ai_output');
  return { name: str(p.name, 50) || 'AI plan', notes: str(p.notes, 400), days };
}
export function normAnswers(a) {
  a = a && typeof a === 'object' ? a : {};
  const pick = (v, ok, d) => ok.includes(v) ? v : d;
  return { goal: pick(a.goal, ['muscle', 'strength', 'general', 'fatloss'], 'general'), experience: pick(a.experience, ['beginner', 'intermediate', 'advanced'], 'beginner'),
    days: clampN(a.days, 2, 7, 3), minutes: clampN(a.minutes, 20, 120, 45), equipment: pick(a.equipment, ['full', 'machines', 'dumbbells', 'bodyweight'], 'full'),
    injuries: str(a.injuries, 500), changes: str(a.changes, 500), focus: (Array.isArray(a.focus) ? a.focus : []).filter(f => typeof f === 'string').slice(0, 3).map(f => str(f, 20)) };
}

const RULES = 'Return JSON only. Exactly 7 days in week order (Mon..Sun) for generated plans; rest days have rest=true and no exercises. ' +
  'Use common gym exercise names (e.g. "Barbell Bench Press", "Lat Pulldown", "Dumbbell Lateral Raise"). rest = seconds between sets for that exercise ' +
  '(heavy compounds 120-240, accessories 45-90, 0 for the first exercise of a superset). estMinutes = realistic session length including warm-up sets and rest. ' +
  'note: short cue or "" (no weights). Respect injuries strictly: leave out anything that loads an injured area.';
const IMAGE_SYS = 'You read a photo or screenshot of a workout plan (a whiteboard, notebook, printout, or app screen) and convert it into the Simple Lift plan format. ' +
  'Copy exercise names, sets, reps, rest times and day order exactly as written in the photo; only fix obvious spelling mistakes. When rest is missing, set a sensible rest for that exercise. ' +
  'Do not invent days or exercises that are not in the photo. Ignore anything that is not part of the workout. Put lines that look like exercises but cannot be read into unparsed. If the photo has no workout, return days: [].';
// v22: optional UI language. Only codes on this allowlist are used; anything else means English.
export const AI_LANGS = { en: 'English', es: 'Spanish', fr: 'French', de: 'German', pt: 'Brazilian Portuguese', it: 'Italian', nl: 'Dutch', ru: 'Russian', tr: 'Turkish', pl: 'Polish',
  zh: 'Simplified Chinese', ja: 'Japanese', ko: 'Korean', ar: 'Arabic', hi: 'Hindi', id: 'Indonesian' };
export const aiLang = v => typeof v === 'string' && Object.prototype.hasOwnProperty.call(AI_LANGS, v) ? v : 'en';
const langRule = lang => lang === 'en' ? '' : ' LANGUAGE: write the plan name, day names, notes and exercise notes in ' + AI_LANGS[lang] +
  '. For exercise names, use the common gym name in ' + AI_LANGS[lang] + ' only when it is widely used; otherwise keep the standard English exercise name so it stays recognizable. Keep JSON keys and numbers unchanged.';
export function messages(kind, input, lang = 'en') {
  const L = langRule(aiLang(lang));
  if (kind === 'image') return [
    { role: 'system', content: IMAGE_SYS + ' ' + RULES.replace('Exactly 7 days in week order (Mon..Sun) for generated plans; ', '') + L },
    { role: 'user', content: [...(Array.isArray(input) ? input : [input]).map(url => ({ type: 'image_url', image_url: { url, detail: 'high' } })),
      { type: 'text', text: Array.isArray(input) && input.length > 1 ? 'These ' + input.length + ' photos are parts of ONE workout plan, in order (e.g. pages or screenshots). Read them all and return a single combined plan JSON; do not repeat a day that appears twice.' : 'Read this workout photo and return the plan JSON.' }] }];
  if (kind === 'plan') return [
    { role: 'system', content: 'You are an expert strength coach writing a weekly weight-training plan for the Simple Lift app. ' + RULES + ' Fit each training day into the requested minutes. Use only the listed equipment. notes: 1-2 short lines explaining the split.' + L },
    { role: 'user', content: JSON.stringify(input) }];
  return [
    { role: 'system', content: 'You convert pasted workout text (often copied from a chat app, a website or OCR of a photo) into the Simple Lift plan format. ' +
      'Keep the user\'s exercises, sets, reps, rest and day order exactly when given; fix obvious OCR typos in exercise names; when rest is missing, set a sensible rest for that exercise. ' +
      'Do not invent days or exercises that are not in the text. Ignore intros, tips, warm-ups and nutrition. Put lines that look like exercises but cannot be read into unparsed. ' + RULES.replace('Exactly 7 days in week order (Mon..Sun) for generated plans; ', '') + L },
    { role: 'user', content: input }];
}

// ---- spend tracking (USD micros). xAI may return usage.cost_in_usd_ticks (1 tick = 1e-10 USD); otherwise priced from tokens. ----
const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) && n >= 0 ? n : d; };
export const prices = env => ({ in: num(env.AI_PRICE_IN, 1.25), out: num(env.AI_PRICE_OUT, 2.5), cached: num(env.AI_PRICE_CACHED, 0.2) });
const MARGIN = 1.2; // safety margin on our own estimate
export function costMicros(usage, env) {
  const u = usage || {};
  if (Number.isFinite(+u.cost_in_usd_ticks) && +u.cost_in_usd_ticks > 0) return Math.ceil(+u.cost_in_usd_ticks / 1e4 * MARGIN);
  const P = prices(env), pin = num(u.prompt_tokens, 0), cached = Math.min(pin, num(u.prompt_tokens_details && u.prompt_tokens_details.cached_tokens, 0));
  const comp = num(u.completion_tokens, 0), reas = num(u.completion_tokens_details && u.completion_tokens_details.reasoning_tokens, 0);
  // count reasoning separately unless total_tokens shows it's already inside completion_tokens
  const out = comp + (num(u.total_tokens, 0) > pin + comp ? reas : 0);
  return Math.ceil(((pin - cached) * P.in + cached * P.cached + out * P.out) * MARGIN);
}
// worst case for one call: max input (text cap ~ 2 chars/token + prompt) at full price + max_tokens output + reasoning allowance
export const worstMicros = env => { const P = prices(env); return Math.ceil(((AI_MAX_TEXT / 2 + 1500) * P.in + AI_MAX_TOKENS * 2 * P.out) / 1e6 * 1e6 * MARGIN); };
export const capMicros = env => Math.round(num(env.AI_SPEND_CAP_USD, 20) * 1e6);
// photo worst case: a high-detail image (xAI tiles large images; allow 12k tokens) + prompt + max output, all at full price
export const worstImageMicros = (env, n = 1) => { const P = prices(env); return Math.ceil(((12000 * Math.max(1, n) + 1500) * P.in + AI_MAX_TOKENS * 2 * P.out) * MARGIN); };
