import test from 'node:test';
import assert from 'node:assert/strict';
import { dayCode, plansFromData, todayIndex, toLb } from './watch-plans.js';

test('pounds stay whole and kilograms convert', () => {
  assert.equal(toLb(30, 'lb'), 30);
  assert.equal(toLb(20, 'kg'), 44);
});

test('a training day becomes an SL1 code and a rest day does not', () => {
  const code = dayCode({
    name: 'Push',
    exercises: [{ name: 'Bench Press', sets: 3, repMin: 8, weight: 100, rest: 90 }]
  }, 'lb', 'set');
  assert.equal(code, 'SL1~Push~Bench Press,3,8,100,90~#set');
  assert.equal(dayCode({ name: 'Rest', rest: true, exercises: [] }, 'lb', 'set'), null);
});

test('today skips a leading rest day on the active plan', () => {
  const plan = { next: 0, days: [{ rest: true }, { name: 'Pull', rest: false }] };
  assert.equal(todayIndex(plan), 1);
  const body = plansFromData({
    settings: { units: 'lb', checkMode: 'exercise', autoDetectSets: false },
    activePlanId: 'p',
    plans: [{ id: 'p', name: 'PPL', next: 0, days: [{ name: 'Off', rest: true }, { name: 'Pull', exercises: [{ name: 'Row', sets: 2, repMin: 10, weight: 50, rest: 60 }] }] }]
  });
  assert.equal(body.checkMode, 'exercise');
  assert.equal(body.autoDetectSets, false);
  assert.equal(body.today.day, 1);
  assert.match(body.today.code, /^SL1~Pull~Row,2,10,50,60~#exercise$/);
});

test('auto-detect is omitted when the phone has no such setting', () => {
  const body = plansFromData({ settings: { units: 'lb' }, plans: [] });
  assert.equal(Object.hasOwn(body, 'autoDetectSets'), false);
});
