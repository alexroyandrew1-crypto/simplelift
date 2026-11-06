// Simple Lift config. Set DONATE_URL to a real link (e.g. Ko-fi, Buy Me a Coffee, PayPal.me) to show the
// optional Donate button in Settings → Support. While it's empty, only the message is shown.
const DONATE_URL='https://paypal.me/simplelift';
// Support email shown in Settings > Support (mailto link). Empty = hidden.
const SUPPORT_EMAIL='simpleliftsupport@gmail.com';
// Shown in Settings > About. Bump together with the cache name in sw.js.
const APP_VERSION='29';
// Fallback rest (seconds) for exercises not in the library's per-exercise defaults.
const DEFAULT_REST_SEC=120;
// Simple Lift account server (simplelift-api Cloudflare Worker), e.g. 'https://simplelift-api.<you>.workers.dev'.
// Empty = accounts and watch sync are hidden and the app never contacts any server.
const API_URL='https://simplelift-api.alexroyandrew1.workers.dev';
