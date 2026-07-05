/** Preset management – loads from API, applies to decode panels */

const Presets = {
  items: [],
  currentId: localStorage.getItem('mcoder_preset') || 'ham',

  async load() {
    try {
      const data = await fetch('/presets').then((r) => r.json());
      this.items = data.presets || [];
    } catch {
      this.items = this.fallback();
    }
    return this.items;
  },

  fallback() {
    return [
      { id: 'saq', name: 'SAQ VLF (Grimeton)', description: 'VLF 750 Hz', freq: 750, wpm: null, auto_wpm: true, live_interval: 6, sample_rate: 8000, offset: 0, length: null },
      { id: 'ham', name: 'Amateurfunk CW', description: 'HF 600 Hz', freq: 600, wpm: null, auto_wpm: true, live_interval: 4, sample_rate: 11025, offset: 0, length: null },
      { id: 'maritime', name: 'Seefunk', description: '500 Hz, 12 WPM', freq: 500, wpm: 12, auto_wpm: false, live_interval: 5, sample_rate: 8000, offset: 0, length: null },
      { id: 'beacon', name: 'Beacon', description: '800 Hz, 22 WPM', freq: 800, wpm: 22, auto_wpm: false, live_interval: 3, sample_rate: 8000, offset: 0, length: null },
      { id: 'qrss', name: 'Langsam-CW', description: '750 Hz, 8 WPM', freq: 750, wpm: 8, auto_wpm: false, live_interval: 10, sample_rate: 8000, offset: 0, length: null },
      { id: 'custom', name: 'Manuell', description: 'Freie Einstellung', freq: 750, wpm: null, auto_wpm: true, live_interval: 4, sample_rate: 8000, offset: 0, length: null },
    ];
  },

  get(id) {
    return this.items.find((p) => p.id === id) || this.items[0];
  },

  setCurrent(id) {
    this.currentId = id;
    localStorage.setItem('mcoder_preset', id);
    window.dispatchEvent(new CustomEvent('presetchange', { detail: { id, preset: this.get(id) } }));
  },

  fillSelect(selectEl, selectedId) {
    if (!selectEl) return;
    selectEl.innerHTML = '';
    for (const p of this.items) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      selectEl.appendChild(opt);
    }
    selectEl.value = selectedId || this.currentId;
  },

  applyToPanel(prefix, presetId) {
    const p = this.get(presetId || this.currentId);
    if (!p) return p;

    const setVal = (id, val) => {
      const el = document.getElementById(prefix + id);
      if (el && val != null) el.value = val;
    };
    const setCheck = (id, val) => {
      const el = document.getElementById(prefix + id);
      if (el) el.checked = !!val;
    };

    setVal('freq', p.freq);
    setVal('wpm', p.wpm ?? '');
    setCheck('auto-wpm', p.auto_wpm);
    if (prefix === 'live-') setVal('interval', p.live_interval);
    if (prefix === 'file-') {
      setVal('offset', p.offset ?? 0);
      setVal('length', p.length ?? '');
    }
    if (prefix === 'transmit-') {
      setVal('wpm', p.wpm ?? 20);
      setVal('sr', p.sample_rate);
    }

    const desc = document.getElementById(prefix + 'preset-desc');
    if (desc) desc.textContent = p.description;

    return p;
  },

  bindSelect(selectEl, prefix, onApplied) {
    if (!selectEl) return;
    const apply = () => {
      this.setCurrent(selectEl.value);
      const p = this.applyToPanel(prefix, selectEl.value);
      if (onApplied) onApplied(p);
    };
    selectEl.addEventListener('change', apply);
    apply();
  },

  mergeDecodeText(existing, incoming) {
    if (!incoming) return existing || '';
    if (!existing) return incoming;
    if (incoming === existing) return existing;

    const maxOverlap = Math.min(existing.length, incoming.length, 100);
    for (let len = maxOverlap; len >= 4; len--) {
      if (existing.slice(-len) === incoming.slice(0, len)) {
        return existing + incoming.slice(len);
      }
    }

    const sep = /[\s=]$/.test(existing) ? '' : ' ';
    return existing + sep + incoming;
  },
};

document.addEventListener('DOMContentLoaded', async () => {
  await Presets.load();
});
