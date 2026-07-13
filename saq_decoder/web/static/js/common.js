/** Shared utilities, navigation, API key, settings */

const App = {
  apiKey: localStorage.getItem('saq_api_key') || '',

  headers() {
    const h = {};
    if (this.apiKey) h['X-API-Key'] = this.apiKey;
    return h;
  },

  fmtTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const d = Math.floor((sec % 1) * 10);
    return m + ':' + String(s).padStart(2, '0') + '.' + d;
  },

  clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  },

  escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  async fetchJson(url, options = {}) {
    const res = await fetch(url, {
      ...options,
      headers: { ...this.headers(), ...(options.headers || {}) },
    });
    let data;
    try {
      data = await res.json();
    } catch {
      data = {};
    }
    if (!res.ok) {
      const detail = data.detail;
      throw new Error(typeof detail === 'string' ? detail : res.statusText);
    }
    return data;
  },

  showPanel(id) {
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
    document.querySelectorAll('nav.tabs button').forEach((b) => b.classList.remove('active'));
    const panel = document.getElementById('panel-' + id);
    const tab = document.querySelector('nav.tabs button[data-panel="' + id + '"]');
    if (panel) panel.classList.add('active');
    if (tab) tab.classList.add('active');
    history.replaceState(null, '', '#' + id);
    window.dispatchEvent(new CustomEvent('panelchange', { detail: { id } }));
  },

  initNav() {
    document.querySelectorAll('nav.tabs button').forEach((btn) => {
      btn.addEventListener('click', () => this.showPanel(btn.dataset.panel));
    });

    const hash = location.hash.replace('#', '');
    const valid = ['live', 'file', 'transmit'];
    this.showPanel(valid.includes(hash) ? hash : 'file');

    const settingsBtn = document.getElementById('btn-settings');
    const drawer = document.getElementById('settings-drawer');
    const backdrop = document.getElementById('settings-backdrop');
    const apiInput = document.getElementById('settings-apikey');

    if (apiInput) apiInput.value = this.apiKey;

    const closeSettings = () => {
      drawer?.classList.remove('open');
      backdrop?.classList.remove('open');
    };

    settingsBtn?.addEventListener('click', () => {
      drawer?.classList.add('open');
      backdrop?.classList.add('open');
    });
    backdrop?.addEventListener('click', closeSettings);

    document.getElementById('settings-save')?.addEventListener('click', () => {
      this.apiKey = apiInput?.value.trim() || '';
      localStorage.setItem('saq_api_key', this.apiKey);
      closeSettings();
    });
  },
};

document.addEventListener('DOMContentLoaded', () => App.initNav());
