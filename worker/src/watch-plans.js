// Today's workout and the rest of the user's plans, for a paired watch.
// NOT DEPLOYED. Merge watchPlanRoutes into the existing Worker the same way as
// worker/live-routes.js. GET /watch/workout already exists there; this adds
// GET /watch/plans and does not replace that route.
//
// Wire-up:
//   const plans = await watchPlanRoutes(request, env, { userIdFromWatch });
//   if (plans) return plans;

export const PLAN_MODES = ['set', 'exercise', 'none'];

export function normMode(value) {
  return PLAN_MODES.includes(value) ? value : 'set';
}

export function toLb(value, units) {
  const n = +value || 0;
  return Math.round(units === 'kg' ? n / 0.4536 : n);
}

export function clean(value) {
  return String(value || '').replace(/[~,@/]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
}

/** SL1 for one training day. Rest days return null. Weights are whole pounds. */
export function dayCode(day, units, mode) {
  if (!day || day.rest) return null;
  const items = (day.exercises || []).filter(ex => ex && String(ex.name || '').trim()).map(ex => {
    const sets = Math.max(1, Math.min(10, +ex.sets || 3));
    const reps = +ex.repMin || 8;
    const weight = toLb(ex.weight, units);
    const rest = Math.round(+ex.rest || 90);
    return [clean(ex.name), sets, reps, weight, rest].join(',');
  });
  if (!items.length) return null;
  return ['SL1', clean(day.name) || 'Workout', ...items, '#' + normMode(mode)].join('~');
}

/** The next training day, skipping rest days the way the phone's nextCode does. */
export function todayIndex(plan) {
  const days = plan && plan.days || [];
  if (!days.length) return -1;
  let i = plan.next | 0;
  if (i < 0 || i >= days.length) i = 0;
  for (let k = 0; k < days.length && days[i] && days[i].rest; k++) i = (i + 1) % days.length;
  return days[i] && days[i].rest ? -1 : i;
}

export function plansFromData(data) {
  const blob = data && typeof data === 'object' ? data : {};
  const units = blob.settings && blob.settings.units === 'kg' ? 'kg' : 'lb';
  const mode = normMode(blob.settings && blob.settings.checkMode);
  const auto = blob.settings && blob.settings.autoDetectSets;
  const plans = (blob.plans || []).map(plan => {
    const today = todayIndex(plan);
    const active = plan.id && plan.id === blob.activePlanId;
    return {
      id: plan.id || '',
      name: plan.name || '',
      days: (plan.days || []).map((day, index) => {
        const code = dayCode(day, units, mode);
        return {
          name: day.name || 'Workout',
          rest: !!day.rest,
          today: !!(active && index === today),
          day: index,
          planId: plan.id || '',
          code: code || ''
        };
      }).filter(day => day.rest || day.code)
    };
  });
  let today = null;
  for (const plan of plans) {
    const day = plan.days.find(item => item.today && item.code);
    if (day) { today = { name: day.name, code: day.code, planId: day.planId, day: day.day }; break; }
  }
  const body = { plans, today, checkMode: mode };
  if (typeof auto === 'boolean') body.autoDetectSets = auto;
  return body;
}

function bearer(request) {
  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });
}

/**
 * @param {Request} request
 * @param {{ DB: D1Database }} env
 * @param {{ userIdFromWatch: (token: string) => Promise<string|null> }} auth
 */
export async function watchPlanRoutes(request, env, auth) {
  const path = new URL(request.url).pathname.replace(/\/+$/, '');
  if (path !== '/watch/plans') return null;
  if (request.method !== 'GET') return json({ error: 'Method' }, 405);
  const token = bearer(request);
  if (!token) return json({ error: 'Not signed in' }, 401);
  const userId = await auth.userIdFromWatch(token);
  if (!userId) return json({ error: 'Not signed in' }, 401);
  const row = await env.DB.prepare('SELECT blob FROM data WHERE user_id = ?').bind(userId).first();
  let data = null;
  try { data = row && row.blob ? JSON.parse(row.blob) : null; } catch (e) { data = null; }
  return json(plansFromData(data));
}
