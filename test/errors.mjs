// Ring buffer for the on-phone error log. No browser and no server.
import fs from 'fs';
import vm from 'vm';
import {fileURLToPath} from 'url';
import path from 'path';

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'errors.js');
const mem = {};
const calls = [];
const sandbox = {
  APP_VERSION: '40',
  API_URL: '',
  localStorage: {
    getItem(k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
    setItem(k, v) { mem[k] = String(v); },
    removeItem(k) { delete mem[k]; }
  },
  fetch(url, opts) {
    calls.push({ url: String(url), opts });
    return Promise.resolve({ ok: true });
  }
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox);
const {Errors} = sandbox;
if (!Errors) { console.error('FAIL: Errors missing'); process.exit(1); }

let failed = 0;
function check(cond, msg) {
  if (!cond) { failed++; console.error('FAIL:', msg); }
  else console.log('ok:', msg);
}

const first = Errors.push({ kind: 'error', msg: 'broke', src: 'app-boot.js', line: 4, stack: 'Error: broke' });
check(first.msg === 'broke' && first.v === '40' && Errors.list().length === 1, 'one error is stored');
for (let i = 0; i < 50; i++) Errors.push({ kind: 'rejection', msg: 'n' + i });
const list = Errors.list();
check(list.length === Errors.MAX, 'the ring keeps the newest ' + Errors.MAX);
check(list[0].msg !== 'broke' && list[list.length - 1].msg === 'n49', 'the oldest entry falls off');
check(calls.length === 0, 'nothing is posted when API_URL is empty');

sandbox.API_URL = 'https://simplelift-api.example.test';
sandbox.Sync = { on() { return false; }, a: { token: 'secret-token' } };
Errors.push({ msg: 'signed-out' });
check(calls.length === 0, 'a signed-out phone does not post');
sandbox.Sync.on = () => true;
Errors.push({ msg: 'signed-in Bearer secret-token leaked' });
await new Promise(r => setTimeout(r, 20));
check(calls.length === 1 && calls[0].url.endsWith('/errors'), 'a signed-in phone posts to /errors');
check(calls[0].opts.headers.Authorization === 'Bearer secret-token', 'the post uses the account token');
const body = JSON.parse(calls[0].opts.body);
check(body.errors[0].msg.includes('[redacted]') && !body.errors[0].msg.includes('secret-token'), 'the body does not keep a bearer token');
check(!Errors.exportJSON().includes('secret-token'), 'the export does not keep a bearer token');
Errors.clear();
check(Errors.list().length === 0 && Errors.exportJSON() === '[]', 'clear empties the log');

if (failed) process.exit(1);
console.log('errors: all checks passed');
