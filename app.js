/* ---------- Theme ---------- */
const THEMES = ['system', 'light', 'dark'];
const THEME_LABELS = { system: 'Theme: System', light: 'Theme: Light', dark: 'Theme: Dark' };

function getTheme() {
  return localStorage.getItem('theme') || 'system';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('theme-toggle').textContent = THEME_LABELS[theme];
}

function cycleTheme() {
  const current = getTheme();
  const next = THEMES[(THEMES.indexOf(current) + 1) % THEMES.length];
  localStorage.setItem('theme', next);
  applyTheme(next);
}

/* ---------- Trace parsing ---------- */
function parseTrace(text) {
  const result = {};
  for (const line of text.trim().split('\n')) {
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    result[line.slice(0, eq)] = line.slice(eq + 1);
  }
  return result;
}

/* ---------- Colo enrichment ---------- */
function formatColo(code, colos) {
  const entry = colos[code];
  if (!entry) return code;
  return `${code} (${entry.cca2}, ${entry.country}, ${entry.city})`;
}

/* ---------- Rendering ---------- */
function row(label, value, highlight = false) {
  const tr = document.createElement('tr');
  if (highlight) tr.className = 'highlight';
  tr.innerHTML = `<th>${escHtml(label)}</th><td>${value}</td>`;
  return tr;
}

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function textNode(s) {
  return escHtml(String(s));
}

function badge(s) {
  return `<span class="badge">${escHtml(s)}</span>`;
}

function makeCard(title, rows) {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `<div class="card-header">${escHtml(title)}</div>`;
  const table = document.createElement('table');
  table.className = 'fields';
  const tbody = document.createElement('tbody');
  for (const r of rows) tbody.appendChild(r);
  table.appendChild(tbody);
  card.appendChild(table);
  return card;
}

function render(trace, colos) {
  const container = document.getElementById('output');
  container.innerHTML = '';

  const coloCode = trace.colo || '';
  const coloEntry = colos[coloCode] || null;

  // --- Top card: identity & location ---
  const topRows = [];

  if (trace.ip) topRows.push(row('IP address', badge(trace.ip), true));
  if (coloCode) topRows.push(row('Colocation', textNode(formatColo(coloCode, colos)), true));
  if (trace.loc) topRows.push(row('Country (loc)', badge(trace.loc), true));
  if (coloEntry) {
    topRows.push(row('Location', textNode(`${coloEntry.city}, ${coloEntry.country}`)));
    if (coloEntry.region) topRows.push(row('Region', textNode(coloEntry.region)));
  }

  container.appendChild(makeCard('Identity & Location', topRows));

  // --- Bottom card: technical details ---
  const SKIP = new Set(['ip', 'colo', 'loc']);
  const LABELS = {
    fl: 'Flow ID',
    h: 'Host',
    ts: 'Timestamp',
    visit_scheme: 'Scheme',
    uag: 'User-Agent',
    sliver: 'Sliver',
    http: 'HTTP version',
    tls: 'TLS version',
    sni: 'SNI',
    warp: 'Warp',
    gateway: 'Gateway',
    rbi: 'RBI',
    kex: 'Key exchange',
  };

  const techRows = [];
  for (const [key, value] of Object.entries(trace)) {
    if (SKIP.has(key)) continue;
    const label = LABELS[key] || key;
    techRows.push(row(label, textNode(value)));
  }

  if (techRows.length) container.appendChild(makeCard('Technical Details', techRows));
}

/* ---------- Main ---------- */
async function fetchTrace(colos) {
  const output = document.getElementById('output');
  const btn = document.getElementById('refresh');
  output.innerHTML = '<div id="status">Fetching trace...</div>';
  btn.disabled = true;

  try {
    const res = await fetch('https://one.one.one.one/cdn-cgi/trace');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const trace = parseTrace(text);
    output.innerHTML = '';
    render(trace, colos);
  } catch (e) {
    output.innerHTML = '';
    const err = document.createElement('div');
    err.className = 'error';
    err.textContent = `Failed to fetch trace: ${e.message}`;
    output.appendChild(err);
  } finally {
    btn.disabled = false;
  }
}

async function main() {
  applyTheme(getTheme());
  document.getElementById('theme-toggle').addEventListener('click', cycleTheme);

  let colos = {};
  try {
    const res = await fetch('colos.json');
    colos = await res.json();
  } catch (e) {
    console.warn('Could not load colos.json', e);
  }

  document.getElementById('refresh').addEventListener('click', () => fetchTrace(colos));
  fetchTrace(colos);
}

main();
