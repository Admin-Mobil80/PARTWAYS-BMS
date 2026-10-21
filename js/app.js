// PartWays BMS: sign-in, navigation shell and hash routing.
import { api, h, mount, toast, store, applyPrefs, watchForUpdates, ApiError } from './lib.js';
import * as views from './views.js';

export const state = { token: store.get('pw.bms.token'), email: store.get('pw.bms.email'), role: null };

export function signOut() {
  store.del('pw.bms.token'); store.del('pw.bms.email');
  location.hash = '#/';
  location.reload();
}

// API calls as the signed-in team member.
export async function bms(path, opts = {}) {
  try {
    return await api(path, { ...opts, headers: { ...(opts.headers || {}), authorization: `Bearer ${state.token}` } });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) { toast('Your session has ended. Please sign in again.', { kind: 'bad' }); signOut(); }
    throw err;
  }
}

const mark = () => h('a', { class: 'pw-mark', href: '#/' }, h('span', { class: 'dot' }, 'P'), 'PartWays BMS');

// --- Sign-in: email, then the 6-digit code ---------------------------------
function loginScreen() {
  let step = 'email', email = '', session = null;
  const root = h('main', { id: 'main', class: 'login' });
  const render = (msg) => {
    const errEl = msg ? h('div', { class: 'notice bad', role: 'alert' }, msg) : null;
    if (step === 'email') {
      const input = h('input', { type: 'email', id: 'f-email', value: email, required: true, autocomplete: 'email' });
      const btn = h('button', { class: 'btn primary lg', type: 'submit' }, 'Send me a sign-in code');
      const form = h('form', { class: 'stack', onsubmit: async (e) => {
        e.preventDefault();
        email = input.value.trim();
        btn.disabled = true;
        try {
          const r = await api('/api/bms/auth/start', { method: 'POST', body: { email } });
          session = r.session; step = 'code'; render();
          if (r.devCode) toast(`Local development: your code is ${r.devCode}`, { timeout: 12000 });
          else if (r.delivery === 'console') toast('Local development: the code is printed in the server console.', { timeout: 8000 });
        } catch (err) { btn.disabled = false; render(err.message); }
      } }, h('div', { class: 'field' }, h('label', { for: 'f-email' }, 'Email'), input), errEl, btn);
      mount(root, h('div', { class: 'card stack' }, mark(), h('h1', 'Sign in'),
        h('p', { class: 'ink2' }, 'For the PartWays team. We will email you a 6-digit code. There is no password.'), form));
      input.focus();
    } else {
      const input = h('input', { type: 'text', id: 'code', class: 'otp', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6, required: true });
      const form = h('form', { class: 'stack', onsubmit: async (e) => {
        e.preventDefault();
        const code = input.value.replace(/\D/g, '');
        if (code.length !== 6) return render('Enter the 6-digit code from the email.');
        try {
          const r = await api('/api/bms/auth/verify', { method: 'POST', body: { email, code, session } });
          if (r.retry) { session = r.session; return render(r.error); }
          state.token = r.token; state.email = r.email;
          store.set('pw.bms.token', r.token); store.set('pw.bms.email', r.email);
          history.replaceState(null, '', '#/');
          start();
        } catch (err) { render(err.message); }
      } }, h('div', { class: 'field' }, h('label', { for: 'code' }, 'Sign-in code'), h('span', { class: 'hint' }, `Sent to ${email}. It expires in 10 minutes.`), input), errEl,
      h('div', { class: 'row' }, h('button', { class: 'btn primary lg', type: 'submit' }, 'Sign in'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { step = 'email'; render(); } }, 'Use a different email')));
      mount(root, h('div', { class: 'card stack' }, mark(), h('h1', 'Check your email'), form));
      input.focus();
    }
  };
  render();
  mount('#app', root);
}

// --- Shell and routing ------------------------------------------------------
const ROUTES = [
  [/^\/$/, views.overview, 'overview'],
  [/^\/orgs$/, views.organisations, 'orgs'],
  [/^\/orgs\/([^/]+)$/, views.organisation, 'orgs'],
  [/^\/team$/, views.team, 'team'],
  [/^\/audit$/, views.auditLog, 'audit'],
];

let main, side, crumbs;

export function setCrumbs(...parts) {
  crumbs.replaceChildren(...parts.flatMap((p, i) => [i ? ' / ' : '', Array.isArray(p) ? h('a', { href: p[1] }, p[0]) : p]));
  const last = parts.at(-1);
  document.title = `${Array.isArray(last) ? last[0] : last} · PartWays BMS`;
}

function buildShell() {
  const link = (href, nav, label) => h('a', { href, 'data-nav': nav }, label);
  side = h('aside', { class: 'side', 'aria-label': 'Navigation' },
    mark(),
    h('nav', link('#/', 'overview', 'Overview'), link('#/orgs', 'orgs', 'Organisations'), link('#/team', 'team', 'Team'), link('#/audit', 'audit', 'Audit log')),
    h('div', { class: 'foot' },
      h('div', { class: 'small muted', style: { overflowWrap: 'anywhere' } }, state.email),
      h('span', { class: 'badge accent', style: { justifySelf: 'start' } }, state.role === 'root' ? 'Root' : 'Team member'),
      h('button', { class: 'btn sm', type: 'button', onclick: signOut }, 'Sign out')));
  crumbs = h('div', { class: 'crumbs' });
  main = h('main', { id: 'main', class: 'page', tabindex: '-1' });
  const menu = h('button', { class: 'btn sm menu-btn', type: 'button', 'aria-label': 'Open navigation', onclick: () => side.classList.toggle('open') }, '☰');
  mount('#app', h('div', { class: 'shell' }, side, h('div', { style: { minWidth: 0 } }, h('div', { class: 'topline' }, menu, crumbs), main)));
}

let seq = 0;
async function route() {
  const path = (location.hash.replace(/^#/, '') || '/').split('?')[0];
  side.classList.remove('open');
  const hit = ROUTES.find(([re]) => re.test(path));
  for (const a of side.querySelectorAll('[data-nav]')) {
    if (hit && a.dataset.nav === hit[2]) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  if (!hit) { mount(main, h('div', { class: 'empty' }, h('h3', 'Page not found'), h('a', { href: '#/' }, 'Go to the overview'))); return; }
  const mine = ++seq;
  mount(main, h('div', { class: 'stack', 'aria-busy': 'true' }, h('div', { class: 'skeleton', style: { height: '28px', width: '40%' } }), h('div', { class: 'skeleton', style: { height: '160px' } })));
  try {
    const page = await hit[1](...path.match(hit[0]).slice(1));
    if (mine !== seq) return;
    mount(main, page);
    window.scrollTo(0, 0);
    (main.querySelector('h1') || main).focus?.({ preventScroll: true });
  } catch (err) {
    if (mine === seq) mount(main, h('div', { class: 'notice bad', role: 'alert' }, err.message || 'This page could not be loaded.'));
  }
}

export const rerender = () => route();

async function start() {
  try {
    state.role = (await bms('/api/bms/me')).role;
  } catch (err) {
    if (!state.token) return;
    mount('#app', h('main', { class: 'login' }, h('div', { class: 'card stack' }, h('p', err.message), h('button', { class: 'btn', onclick: () => location.reload() }, 'Try again'))));
    return;
  }
  buildShell();
  window.onhashchange = route;
  route();
}

applyPrefs();
watchForUpdates({ message: 'A new version of the PartWays BMS is available.' });
if (state.token) start(); else loginScreen();
