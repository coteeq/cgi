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

/* ---------- Tab switching ---------- */
function switchTab(name) {
  document.querySelectorAll('.tab').forEach((b) =>
    b.classList.toggle('active', b.dataset.tab === name)
  );
  document.querySelectorAll('.tab-panel').forEach((p) =>
    p.classList.toggle('hidden', p.id !== `tab-${name}`)
  );
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

/* ---------- Rendering helpers ---------- */
function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function textNode(s) {
  return escHtml(String(s));
}

function badge(s) {
  return `<span class="badge">${escHtml(s)}</span>`;
}

function row(label, value, highlight = false) {
  const tr = document.createElement('tr');
  if (highlight) tr.className = 'highlight';
  tr.innerHTML = `<th>${escHtml(label)}</th><td>${value}</td>`;
  return tr;
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

/* ---------- Trace rendering ---------- */
function render(trace, colos) {
  const container = document.getElementById('output');
  container.innerHTML = '';

  const coloCode = trace.colo || '';
  const coloEntry = colos[coloCode] || null;

  const topRows = [];
  if (trace.ip) topRows.push(row('IP address', badge(trace.ip), true));
  if (coloCode) topRows.push(row('Colocation', textNode(formatColo(coloCode, colos)), true));
  if (trace.loc) topRows.push(row('Country (loc)', badge(trace.loc), true));
  if (coloEntry) {
    topRows.push(row('Location', textNode(`${coloEntry.city}, ${coloEntry.country}`)));
    if (coloEntry.region) topRows.push(row('Region', textNode(coloEntry.region)));
  }
  container.appendChild(makeCard('Identity & Location', topRows));

  const SKIP = new Set(['ip', 'colo', 'loc']);
  const LABELS = {
    fl: 'Flow ID', h: 'Host', ts: 'Timestamp', visit_scheme: 'Scheme',
    uag: 'User-Agent', sliver: 'Sliver', http: 'HTTP version', tls: 'TLS version',
    sni: 'SNI', warp: 'Warp', gateway: 'Gateway', rbi: 'RBI', kex: 'Key exchange',
  };

  const techRows = [];
  for (const [key, value] of Object.entries(trace)) {
    if (SKIP.has(key)) continue;
    techRows.push(row(LABELS[key] || key, textNode(value)));
  }
  if (techRows.length) container.appendChild(makeCard('Technical Details', techRows));
}

/* ---------- Trace fetch ---------- */
async function fetchTrace(colos) {
  const output = document.getElementById('output');
  const btn = document.getElementById('refresh');
  output.innerHTML = '<div id="status">Fetching trace...</div>';
  btn.disabled = true;

  try {
    const url = `https://one.one.one.one/cdn-cgi/trace?ts=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store' });
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

/* ---------- URL list storage ---------- */
const LS_KEY = 'ping-urls';

function loadUrls() {
  return JSON.parse(localStorage.getItem(LS_KEY) || 'null');
}

function saveUrls(list) {
  localStorage.setItem(LS_KEY, JSON.stringify(list));
}

function normalizeUrl(u) {
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

/* ---------- URL list rendering ---------- */
// states: { [url]: { status: 'idle'|'fetching'|'ok'|'error'|'timeout', duration?: number } }
let urlStates = {};
let urlList = [];

const STATUS_LABEL = { idle: '', fetching: 'fetching...', ok: 'ok', error: 'error', timeout: 'timeout' };

function renderUrlList() {
  const container = document.getElementById('url-list');
  container.innerHTML = '';

  if (urlList.length === 0) {
    container.innerHTML = '<div class="url-empty">No URLs. Add one below.</div>';
    return;
  }

  for (const url of urlList) {
    const state = urlStates[url] || { status: 'idle' };
    const row = document.createElement('div');
    row.className = 'url-row';

    const text = document.createElement('span');
    text.className = 'url-text';
    text.textContent = url;

    const statusEl = document.createElement('span');
    statusEl.className = `url-status url-status--${state.status}`;
    statusEl.textContent = STATUS_LABEL[state.status] || state.status;

    const durEl = document.createElement('span');
    durEl.className = 'url-duration';
    durEl.textContent = state.duration != null ? `${state.duration} ms` : '';

    const fetchBtn = document.createElement('button');
    fetchBtn.className = 'url-fetch btn-small';
    fetchBtn.textContent = 'Fetch';
    fetchBtn.disabled = state.status === 'fetching';
    fetchBtn.addEventListener('click', () => pingOne(url));

    const delBtn = document.createElement('button');
    delBtn.className = 'url-delete btn-small btn-danger';
    delBtn.textContent = 'x';
    delBtn.addEventListener('click', () => deleteUrl(url));

    row.append(text, statusEl, durEl, fetchBtn, delBtn);
    container.appendChild(row);
  }
}

function setUrlState(url, state) {
  urlStates[url] = state;
  renderUrlList();
  updateFetchAllBtn();
}

function updateFetchAllBtn() {
  const anyFetching = urlList.some((u) => (urlStates[u] || {}).status === 'fetching');
  document.getElementById('fetch-all').disabled = anyFetching;
}

/* ---------- URL CRUD ---------- */
function deleteUrl(url) {
  urlList = urlList.filter((u) => u !== url);
  delete urlStates[url];
  saveUrls(urlList);
  renderUrlList();
  updateFetchAllBtn();
}

function addUrl(raw) {
  const u = raw.trim();
  if (!u || urlList.includes(u)) return;
  urlList.push(u);
  saveUrls(urlList);
  renderUrlList();
}

async function resetToDefaults() {
  try {
    const res = await fetch('defaults.json', { cache: 'no-store' });
    const data = await res.json();
    urlList = data.urls;
    urlStates = {};
    saveUrls(urlList);
    renderUrlList();
    updateFetchAllBtn();
  } catch (e) {
    console.error('Could not load defaults.json', e);
  }
}

/* ---------- Ping logic ---------- */
async function pingUrl(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  const start = Date.now();
  setUrlState(url, { status: 'fetching' });
  try {
    await fetch(normalizeUrl(url), { mode: 'no-cors', cache: 'no-store', signal: controller.signal });
    clearTimeout(timer);
    setUrlState(url, { status: 'ok', duration: Date.now() - start });
  } catch (e) {
    clearTimeout(timer);
    setUrlState(url, {
      status: e.name === 'AbortError' ? 'timeout' : 'error',
      duration: Date.now() - start,
    });
  }
}

function pingOne(url) {
  pingUrl(url);
}

function fetchAll() {
  for (const url of urlList) pingUrl(url);
}

/* ---------- Main ---------- */
async function main() {
  applyTheme(getTheme());
  document.getElementById('theme-toggle').addEventListener('click', cycleTheme);
  document.querySelectorAll('.tab').forEach((b) =>
    b.addEventListener('click', () => switchTab(b.dataset.tab))
  );

  // Load colos for trace tab
  let colos = {};
  try {
    const res = await fetch('colos.json');
    colos = await res.json();
  } catch (e) {
    console.warn('Could not load colos.json', e);
  }

  document.getElementById('refresh').addEventListener('click', () => fetchTrace(colos));
  fetchTrace(colos);

  // Init URL list
  urlList = loadUrls();
  if (urlList === null) {
    // First visit: load defaults from server
    try {
      const res = await fetch('defaults.json');
      const data = await res.json();
      urlList = data.urls;
      saveUrls(urlList);
    } catch (e) {
      console.warn('Could not load defaults.json', e);
      urlList = [];
    }
  }
  renderUrlList();

  document.getElementById('fetch-all').addEventListener('click', fetchAll);
  document.getElementById('reset-urls').addEventListener('click', resetToDefaults);
  document.getElementById('add-url').addEventListener('click', () => {
    const input = document.getElementById('url-input');
    addUrl(input.value);
    input.value = '';
  });
  document.getElementById('url-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      addUrl(e.target.value);
      e.target.value = '';
    }
  });
}

main();
