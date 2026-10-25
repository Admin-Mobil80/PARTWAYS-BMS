// BMS pages. Each returns the page content; app.js mounts it.
import { h, fmt, toast, dialog, confirmDialog, debounce } from './lib.js';
import { bms, state, setCrumbs, rerender } from './app.js';

const money = (usd) => `$${Number(usd || 0).toLocaleString('en-US')}`;
const n = (x) => Number(x || 0).toLocaleString('en-GB');
const plural = (x, word) => `${n(x)} ${x === 1 ? word : `${word}s`}`;
let countryNames;
const country = (code) => {
  try { countryNames ||= new Intl.DisplayNames(['en'], { type: 'region' }); return countryNames.of(code) || code; } catch { return code || '–'; }
};

const head = (title, sub, ...actions) => h('div', { class: 'page-head' },
  h('div', h('h1', { tabindex: '-1' }, title), sub ? h('p', sub) : null),
  actions.length ? h('div', { class: 'row' }, actions) : null);

const stat = (k, v, s) => h('div', { class: 'stat' }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v), s ? h('div', { class: 's' }, s) : null);

function table(columns, rows, { onRow, empty = 'Nothing here yet.' } = {}) {
  if (!rows.length) return h('div', { class: 'empty' }, h('p', { class: 'muted', style: { margin: 0 } }, empty));
  return h('div', { class: 'table-wrap' }, h('table',
    h('thead', h('tr', columns.map((c) => h('th', { class: c.num ? 'num' : null, scope: 'col' }, c.label)))),
    h('tbody', rows.map((r) => h('tr', {
      class: onRow ? 'clickable' : null,
      tabindex: onRow ? '0' : null,
      onclick: onRow ? () => onRow(r) : null,
      onkeydown: onRow ? (e) => { if (e.key === 'Enter') onRow(r); } : null,
    }, columns.map((c) => h('td', { class: c.num ? 'num' : null }, c.cell(r))))))));
}

const card = (title, ...body) => h('section', { class: 'card stack' }, title ? h('h3', title) : null, ...body);

// --- Overview ----------------------------------------------------------------
export async function overview() {
  setCrumbs('Overview');
  const o = await bms('/api/bms/overview');
  return h('div', { class: 'stack' },
    head('Overview', 'All PartWays organisations, from their own workspaces. Demonstration workspaces are not counted.'),
    h('div', { class: 'stats' },
      stat('Organisations', n(o.organisations), `${n(o.signupsLast7Days)} in the last 7 days`),
      stat('Sign-ups, 30 days', n(o.signupsLast30Days)),
      stat('Invitations sent', n(o.invitationsSent)),
      stat('Interviews completed', n(o.interviewsCompleted)),
      stat('Revenue', money(o.revenueUsd), plural(o.purchases, 'paid purchase')),
      stat('Credits outstanding', n(o.creditsOutstanding), 'Unused, across all organisations')),
    card('Latest sign-ups', table([
      { label: 'Organisation', cell: (r) => r.name },
      { label: 'Country', cell: (r) => country(r.country) },
      { label: 'Owner', cell: (r) => r.ownerEmail },
      { label: 'Signed up', cell: (r) => fmt.dateTime(r.createdAt) },
    ], o.recentSignups, { onRow: (r) => { location.hash = `#/orgs/${r.id}`; }, empty: 'No organisations have signed up yet.' }),
    h('a', { href: '#/orgs', class: 'small' }, 'All organisations →')));
}

// --- Organisations -----------------------------------------------------------
export async function organisations() {
  setCrumbs('Organisations');
  const { organisations: all } = await bms('/api/bms/orgs');
  const slot = h('div');
  const columns = [
    { label: 'Organisation', cell: (r) => h('div', h('div', { style: { fontWeight: 600 } }, r.name), h('div', { class: 'small muted' }, r.ownerEmail)) },
    { label: 'Country', cell: (r) => country(r.country) },
    { label: 'Signed up', cell: (r) => fmt.date(r.createdAt) },
    { label: 'Credits', num: true, cell: (r) => n(r.creditBalance) },
    { label: 'Invitations', num: true, cell: (r) => n(r.invitationsSent) },
    { label: 'Interviews', num: true, cell: (r) => n(r.interviewsCompleted) },
    { label: 'Revenue', num: true, cell: (r) => money(r.revenueUsd) },
    { label: 'Last activity', cell: (r) => fmt.date(r.lastActivityAt) },
    // The same dialog as on the organisation's page, without opening it first.
    { label: '', cell: (r) => h('button', { class: 'btn sm', type: 'button', style: { whiteSpace: 'nowrap' }, 'aria-label': `Add credits for ${r.name}`, onclick: (e) => { e.stopPropagation(); adjustCredits(r); }, onkeydown: (e) => e.stopPropagation() }, 'Add credits') },
  ];
  const show = (q = '') => {
    const t = q.trim().toLowerCase();
    const rows = all.filter((o) => !t || `${o.name} ${o.ownerEmail} ${country(o.country)}`.toLowerCase().includes(t));
    slot.replaceChildren(table(columns, rows, {
      onRow: (r) => { location.hash = `#/orgs/${r.id}`; },
      empty: t ? 'No organisation matches that search.' : 'No organisations have signed up yet.',
    }));
  };
  show();
  return h('div', { class: 'stack' },
    head('Organisations', `${plural(all.length, 'organisation')}, newest first.`),
    h('div', { class: 'toolbar' }, h('input', { type: 'search', placeholder: 'Search by name, owner or country', 'aria-label': 'Search organisations', oninput: debounce((e) => show(e.target.value), 150) })),
    slot);
}

// --- One organisation ----------------------------------------------------------
const LEDGER_KIND = { free_grant: 'Free interviews', purchase: 'Credits bought', invite: 'Invitation sent', adjustment: 'Adjusted by PartWays' };
const ROLE = { owner: 'Owner', analyst: 'Analyst', leader: 'Leader' };

export async function organisation(id) {
  const d = await bms(`/api/bms/orgs/${encodeURIComponent(id)}`);
  const o = d.organisation;
  setCrumbs(['Organisations', '#/orgs'], o.name);
  const delta = (x) => h('span', { class: `delta ${x > 0 ? 'up' : 'down'}` }, x > 0 ? `+${x}` : `${x}`);
  return h('div', { class: 'stack' },
    head(o.name, `${country(o.country)} · signed up ${fmt.date(o.createdAt)}`,
      h('button', { class: 'btn primary', type: 'button', onclick: () => adjustCredits(o) }, 'Adjust credits')),
    h('div', { class: 'stats' },
      stat('Credits left', n(o.creditBalance)),
      stat('Invitations sent', n(o.invitationsSent)),
      stat('Interviews completed', n(o.interviewsCompleted)),
      stat('Revenue', money(o.revenueUsd), o.testPurchases ? `${plural(o.testPurchases, 'test purchase')} not counted` : plural(o.purchases, 'paid purchase'))),
    h('div', { class: 'split' },
      h('div', { class: 'stack' },
        card('Credit ledger', table([
          { label: 'When', cell: (r) => fmt.dateTime(r.at) },
          { label: 'What', cell: (r) => [LEDGER_KIND[r.kind] || r.kind, r.simulated ? h('span', { class: 'badge demo', style: { marginLeft: '.35rem' } }, 'test') : null] },
          { label: 'Note', cell: (r) => h('span', { class: 'small ink2' }, r.note || '') },
          { label: 'Credits', num: true, cell: (r) => delta(r.delta) },
        ], d.ledger)),
        card('Programmes', table([
          { label: 'Programme', cell: (r) => r.name },
          { label: 'Status', cell: (r) => fmt.title(r.status) },
          { label: 'Invitations', num: true, cell: (r) => n(r.invitationsSent) },
          { label: 'Interviews', num: true, cell: (r) => n(r.interviewsCompleted) },
        ], d.programmes, { empty: 'No programmes yet.' }))),
      h('div', { class: 'stack' },
        card('Details', h('dl', { class: 'kv' },
          h('dt', 'Owner'), h('dd', o.ownerEmail),
          h('dt', 'Team'), h('dd', plural(o.members, 'person')),
          h('dt', 'Programmes'), h('dd', n(o.programmes)),
          h('dt', 'Last activity'), h('dd', fmt.dateTime(o.lastActivityAt)),
          h('dt', 'Workspace id'), h('dd', { class: 'mono small' }, o.id))),
        card('People', table([
          { label: 'Email', cell: (r) => r.email },
          { label: 'Role', cell: (r) => ROLE[r.role] || r.role },
        ], d.members)),
        card('Changes made from the BMS', d.audit.length
          ? h('ul', { class: 'stack', style: { listStyle: 'none', padding: 0, margin: 0 } }, d.audit.map((a) => h('li', { class: 'small' },
            h('div', delta(a.delta), ' credits · ', h('span', { class: 'muted' }, `${fmt.dateTime(a.at)} by ${a.by}`)),
            h('div', { class: 'ink2' }, a.reason))))
          : h('p', { class: 'small muted', style: { margin: 0 } }, 'None yet.')))));
}

function adjustCredits(o) {
  let sign = 1;
  const amount = h('input', { type: 'number', id: 'adj-amount', min: 1, max: 1000, step: 1, value: 5, required: true });
  const reason = h('textarea', { id: 'adj-reason', rows: 3, maxlength: 500, placeholder: 'For example: pilot customer, goodwill after a failed invitation' });
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Add or remove' },
    ['Add', 'Remove'].map((label, i) => h('button', { type: 'button', 'aria-pressed': String(i === 0), onclick: (e) => {
      sign = i === 0 ? 1 : -1;
      for (const b of seg.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b === e.currentTarget));
    } }, label)));
  dialog({
    title: `Adjust credits · ${o.name}`,
    body: h('div', { class: 'stack' },
      h('p', { class: 'small ink2', style: { margin: 0 } }, `${o.name} has ${plural(o.creditBalance, 'credit')}. The organisation sees the change in its ledger as made by PartWays; your reason stays in the BMS audit log.`),
      seg,
      h('div', { class: 'field' }, h('label', { for: 'adj-amount' }, 'Credits'), amount),
      h('div', { class: 'field' }, h('label', { for: 'adj-reason' }, 'Reason'), reason)),
    actions: [
      { label: 'Cancel' },
      { label: 'Save', kind: 'primary', onClick: async () => {
        const x = Number(amount.value);
        if (!Number.isInteger(x) || x < 1) { toast('Enter a whole number of credits.', { kind: 'bad' }); return false; }
        const r = await bms(`/api/bms/orgs/${encodeURIComponent(o.id)}/credits`, { method: 'POST', body: { delta: sign * x, reason: reason.value } });
        toast(`${o.name} now has ${plural(r.balance, 'credit')}.`);
        rerender();
      } },
    ],
  });
  amount.focus();
}

// --- Team ----------------------------------------------------------------------
export async function team() {
  setCrumbs('Team');
  const { members } = await bms('/api/bms/team');
  const isRoot = state.role === 'root';
  const add = async () => {
    const email = h('input', { type: 'email', id: 'tm-email', required: true, autocomplete: 'off' });
    dialog({
      title: 'Add a team member',
      body: h('div', { class: 'stack' },
        h('p', { class: 'small ink2', style: { margin: 0 } }, 'They can sign in to the BMS with a 6-digit code sent to this email, see every organisation and adjust credits. Only the root account can add or remove team members.'),
        h('div', { class: 'field' }, h('label', { for: 'tm-email' }, 'Email'), email)),
      actions: [{ label: 'Cancel' }, { label: 'Add', kind: 'primary', onClick: async () => {
        await bms('/api/bms/team', { method: 'POST', body: { email: email.value } });
        toast('Team member added.');
        rerender();
      } }],
    });
    email.focus();
  };
  const remove = async (m) => {
    if (!(await confirmDialog('Remove team member', `${m.email} will be signed out and can no longer sign in to the BMS.`, { confirmLabel: 'Remove', kind: 'danger' }))) return;
    try {
      await bms(`/api/bms/team/${encodeURIComponent(m.email)}`, { method: 'DELETE' });
      toast('Team member removed.');
      rerender();
    } catch (err) { toast(err.message, { kind: 'bad' }); }
  };
  return h('div', { class: 'stack' },
    head('Team', 'People who can sign in to the BMS.', isRoot ? h('button', { class: 'btn primary', type: 'button', onclick: add }, 'Add a team member') : null),
    isRoot ? null : h('div', { class: 'notice' }, 'Only the root account can add or remove team members.'),
    card(null, table([
      { label: 'Email', cell: (m) => [m.email, m.you ? h('span', { class: 'badge', style: { marginLeft: '.4rem' } }, 'You') : null] },
      { label: 'Role', cell: (m) => (m.role === 'root' ? 'Root' : 'Team member') },
      { label: 'Added', cell: (m) => (m.role === 'root' ? '–' : `${fmt.date(m.addedAt)} by ${m.addedBy}`) },
      { label: '', cell: (m) => (isRoot && m.role !== 'root' ? h('button', { class: 'btn sm danger', type: 'button', onclick: (e) => { e.stopPropagation(); remove(m); } }, 'Remove') : null) },
    ], members)));
}

// --- Audit log -------------------------------------------------------------------
const ACTION = {
  credits_adjusted: (a) => [`${a.delta > 0 ? 'Added' : 'Removed'} ${plural(Math.abs(a.delta), 'credit')} for `, h('a', { href: `#/orgs/${a.orgId}` }, a.orgName), ` (balance ${n(a.balanceAfter)}). ${a.reason}`],
  team_member_added: (a) => `Added ${a.member} to the team`,
  team_member_removed: (a) => `Removed ${a.member} from the team`,
  credits_free: (a) => [`${plural(a.delta, 'free credit')} on sign-up for `, h('a', { href: `#/orgs/${a.orgId}` }, a.orgName), ` (balance ${n(a.balanceAfter)})`],
  credits_bought: (a) => [`Bought ${plural(a.delta, 'credit')} for ${money(a.amountUsd)} for `, h('a', { href: `#/orgs/${a.orgId}` }, a.orgName), ` (balance ${n(a.balanceAfter)})`,
    a.simulated ? h('span', { class: 'badge', style: { marginLeft: '.4rem' } }, 'Test') : null],
  credits_used: (a) => [`Used 1 credit for invitation ${a.interviewId || ''} at `, h('a', { href: `#/orgs/${a.orgId}` }, a.orgName), ` (balance ${n(a.balanceAfter)})`],
};
const AUDIT_FILTERS = [
  ['', 'All activity'],
  ['credits_used', 'Credits used'],
  ['credits_bought', 'Credits bought'],
  ['credits_free', 'Free credits'],
  ['credits_adjusted', 'Adjusted by PartWays'],
  ['team', 'Team changes'],
];

export async function auditLog() {
  setCrumbs('Audit log');
  const { entries } = await bms('/api/bms/audit');
  const slot = h('div');
  let kind = '', q = '';
  const show = () => {
    const t = q.trim().toLowerCase();
    const rows = entries.filter((a) => (!kind || (kind === 'team' ? a.action.startsWith('team_') : a.action === kind))
      && (!t || `${a.orgName || ''} ${a.by || ''} ${a.interviewId || ''} ${a.member || ''}`.toLowerCase().includes(t)));
    slot.replaceChildren(card(null, table([
      { label: 'When', cell: (a) => fmt.dateTime(a.at) },
      // Credit lines from before who-did-what was recorded have no name.
      { label: 'Who', cell: (a) => a.by || h('span', { class: 'muted' }, '–') },
      { label: 'What', cell: (a) => (ACTION[a.action] ? ACTION[a.action](a) : a.action) },
    ], rows, { empty: kind || t ? 'Nothing matches this filter.' : 'No activity yet.' })));
  };
  show();
  return h('div', { class: 'stack' },
    head('Audit log', 'Changes made in the BMS and every organisation\'s credit activity, newest first.'),
    h('div', { class: 'toolbar' },
      h('select', { 'aria-label': 'Show', style: { maxWidth: '240px' }, onchange: (e) => { kind = e.target.value; show(); } }, AUDIT_FILTERS.map(([v, l]) => h('option', { value: v }, l))),
      h('input', { type: 'search', placeholder: 'Search by organisation, person or Interview Id', 'aria-label': 'Search the audit log', oninput: debounce((e) => { q = e.target.value; show(); }, 150) })),
    slot);
}
