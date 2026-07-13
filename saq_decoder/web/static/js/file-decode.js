/** File Decode panel */

document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('file-form');
  if (!form) return;

  await Presets.load();

  const out = document.getElementById('file-out');
  const meta = document.getElementById('file-meta-result');
  const btn = document.getElementById('file-btn');
  const fileInput = document.getElementById('file-input');
  const offsetInput = document.getElementById('file-offset');
  const lengthInput = document.getElementById('file-length');
  const freqInput = document.getElementById('file-freq');
  const fileMeta = document.getElementById('file-info');
  const playerCard = document.getElementById('file-player');
  const decodePanel = document.getElementById('file-decode-panel');
  const presetSelect = document.getElementById('file-preset');
  const dropZone = document.getElementById('file-drop');
  const detectedFreqEl = document.getElementById('file-detected-freq');
  const configuredFreqEl = document.getElementById('file-configured-freq');
  const applyFreqBtn = document.getElementById('file-apply-freq');
  const decodeFullCheckbox = document.getElementById('file-decode-full');
  const historyWrap = document.getElementById('file-history');
  const historyList = document.getElementById('file-history-list');

  let inputSyncTimer = null;
  let decodeHistory = [];
  let historyId = 0;

  function updateFreqBar(detected) {
    if (detectedFreqEl) detectedFreqEl.textContent = detected != null ? String(detected) : '–';
    if (configuredFreqEl) {
      configuredFreqEl.textContent = freqInput.value || '–';
    }
  }

  function updateDecodeButton() {
    const hasSel = player.hasSelection();
    const full = decodeFullCheckbox?.checked;
    if (!btn) return;
    if (full) {
      btn.textContent = 'Ganze Datei dekodieren';
    } else if (hasSel) {
      btn.textContent = 'Markierten Bereich dekodieren';
    } else {
      btn.textContent = 'Bereich markieren oder „Ganze Datei“ aktivieren';
    }
  }

  function showLoadedPanels(show) {
    playerCard?.classList.toggle('hidden', !show);
    decodePanel?.classList.toggle('hidden', !show);
  }

  function resetHistory() {
    decodeHistory = [];
    historyId = 0;
    historyWrap?.classList.add('hidden');
    if (historyList) historyList.innerHTML = '';
  }

  function renderHistory() {
    if (!historyList || !historyWrap) return;
    if (!decodeHistory.length) {
      historyWrap.classList.add('hidden');
      historyList.innerHTML = '';
      return;
    }
    historyWrap.classList.remove('hidden');
    historyList.innerHTML = decodeHistory
      .slice()
      .reverse()
      .map((entry) => {
        const preview = entry.text.length > 80 ? entry.text.slice(0, 80) + '…' : entry.text;
        return (
          '<li><button type="button" class="history-item" data-id="' + entry.id + '">' +
          '<span class="history-title">' + App.escapeHtml(entry.label) + '</span>' +
          '<span class="history-preview">' + App.escapeHtml(preview || '(leer)') + '</span>' +
          '</button></li>'
        );
      })
      .join('');
  }

  function addHistoryEntry(entry) {
    decodeHistory.push(entry);
    if (decodeHistory.length > 12) decodeHistory.shift();
    renderHistory();
  }

  function showHistoryEntry(id) {
    const entry = decodeHistory.find((e) => e.id === id);
    if (!entry) return;
    out.textContent = entry.text || '(leer)';
    meta.className = 'meta ok';
    meta.textContent = entry.meta;
  }

  const player = createWaveformPlayer({
    wrap: '#file-waveform-wrap',
    canvas: '#file-waveform',
    spectrumCanvas: '#file-spectrum',
    seekSlider: '#file-seek',
    timeCurrent: '#file-time-current',
    timeTotal: '#file-time-total',
    viewRange: '#file-view-range',
    selectionInfo: '#file-selection-info',
    btnPlay: '#file-btn-play',
    btnPlaySel: '#file-btn-play-sel',
    btnClearSel: '#file-btn-clear-sel',
    btnZoomIn: '#file-zoom-in',
    btnZoomOut: '#file-zoom-out',
    btnZoomReset: '#file-zoom-reset',
    initialFreq: parseInt(freqInput.value, 10) || 750,
    onSelectionChange(sel) {
      if (sel) {
        offsetInput.value = sel.start.toFixed(1);
        lengthInput.value = (sel.end - sel.start).toFixed(1);
        if (decodeFullCheckbox) decodeFullCheckbox.checked = false;
      } else if (!decodeFullCheckbox?.checked) {
        offsetInput.value = '0';
        lengthInput.value = '';
      }
      updateDecodeButton();
    },
    onAnalysis({ detectedFreq }) {
      updateFreqBar(detectedFreq);
    },
  });

  Presets.fillSelect(presetSelect, 'file');
  Presets.bindSelect(presetSelect, 'file-', () => {
    player.setConfiguredFreq(parseInt(freqInput.value, 10) || 750);
    syncSelectionFromInputs();
  });

  freqInput.addEventListener('input', () => {
    player.setConfiguredFreq(parseInt(freqInput.value, 10) || 750);
    updateFreqBar(player.getDetectedFreq());
  });

  applyFreqBtn?.addEventListener('click', () => {
    const detected = player.getDetectedFreq();
    if (detected) {
      freqInput.value = String(detected);
      player.setConfiguredFreq(detected);
      updateFreqBar(detected);
    }
  });

  decodeFullCheckbox?.addEventListener('change', () => {
    if (decodeFullCheckbox.checked) {
      player.clearSelection();
      offsetInput.value = '0';
      lengthInput.value = '';
    }
    updateDecodeButton();
  });

  historyList?.addEventListener('click', (e) => {
    const btnEl = e.target.closest('.history-item');
    if (!btnEl) return;
    showHistoryEntry(parseInt(btnEl.dataset.id, 10));
  });

  async function handleFile(file) {
    if (!file) {
      player.cleanup();
      showLoadedPanels(false);
      resetHistory();
      updateFreqBar(null);
      out.textContent = 'Nach dem Markieren eines Bereichs dekodieren – Preset und Einstellungen jederzeit änderbar.';
      meta.textContent = '';
      meta.className = 'meta';
      updateDecodeButton();
      return;
    }
    try {
      resetHistory();
      player.setConfiguredFreq(parseInt(freqInput.value, 10) || 750);
      const info = await player.loadFromFile(file);
      fileMeta.textContent =
        file.name + ' \u00b7 ' + App.fmtTime(info.duration) + ' \u00b7 ' +
        info.sampleRate + ' Hz \u00b7 ' + info.channels + ' Kanal(e)';
      updateFreqBar(info.detectedFreq);
      const p = Presets.get(Presets.getStoredId('file'));
      if (p?.offset) offsetInput.value = String(p.offset);
      if (p?.length) lengthInput.value = String(p.length);
      else {
        offsetInput.value = '0';
        lengthInput.value = '';
      }
      if (decodeFullCheckbox) decodeFullCheckbox.checked = false;
      showLoadedPanels(true);
      out.textContent =
        'Datei geladen. Bereich auf der Wellenform markieren, anhören und dann dekodieren.';
      meta.textContent = '';
      meta.className = 'meta';
      updateDecodeButton();
    } catch (err) {
      player.cleanup();
      showLoadedPanels(true);
      fileMeta.textContent = 'Wellenform konnte nicht geladen werden: ' + err.message;
    }
  }

  function syncSelectionFromInputs() {
    const dur = player.getDuration();
    if (!dur) return;
    if (decodeFullCheckbox?.checked) {
      player.clearSelection();
      return;
    }
    const off = parseFloat(offsetInput.value) || 0;
    const lenRaw = lengthInput.value.trim();
    if (!lenRaw) player.clearSelection();
    else {
      const len = parseFloat(lenRaw) || 0;
      player.setSelection(off, off + len);
    }
  }

  offsetInput.addEventListener('input', () => {
    if (decodeFullCheckbox?.checked) decodeFullCheckbox.checked = false;
    clearTimeout(inputSyncTimer);
    inputSyncTimer = setTimeout(syncSelectionFromInputs, 200);
  });
  lengthInput.addEventListener('input', () => {
    if (decodeFullCheckbox?.checked) decodeFullCheckbox.checked = false;
    clearTimeout(inputSyncTimer);
    inputSyncTimer = setTimeout(syncSelectionFromInputs, 200);
  });

  fileInput.addEventListener('change', () => handleFile(fileInput.files?.[0]));
  bindFileDrop(dropZone, fileInput, handleFile);

  document.getElementById('file-zoom-selection')?.addEventListener('click', () => {
    player.zoomToSelection();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const file = fileInput.files?.[0];
    if (!file) {
      meta.className = 'meta error';
      meta.textContent = 'Bitte zuerst eine WAV-Datei laden.';
      return;
    }

    syncSelectionFromInputs();

    const decodeFull = decodeFullCheckbox?.checked;
    const hasSel = player.hasSelection();

    if (!decodeFull && !hasSel) {
      meta.className = 'meta error';
      meta.textContent =
        'Bitte einen Bereich auf der Wellenform markieren oder „Ganze Datei dekodieren“ aktivieren.';
      return;
    }

    btn.disabled = true;
    out.textContent = 'Dekodiere\u2026';
    meta.textContent = '';
    meta.className = 'meta';

    const offset = decodeFull ? '0' : (offsetInput.value || '0');
    const len = decodeFull ? '' : lengthInput.value;

    const fd = new FormData();
    fd.append('file', file);
    fd.append('offset', offset);
    if (len) fd.append('length', len);
    fd.append('freq', freqInput.value || '750');
    fd.append('auto_freq', document.getElementById('file-auto-freq').checked ? 'true' : 'false');
    const wpm = document.getElementById('file-wpm').value;
    if (wpm) fd.append('wpm', wpm);
    fd.append('auto_wpm', document.getElementById('file-auto-wpm').checked ? 'true' : 'false');

    try {
      const data = await App.fetchJson('/decode/file', { method: 'POST', body: fd });
      out.textContent = data.text || '(leer)';
      player.drawSpectrumFromServer(data);
      if (data.detected_freq != null) updateFreqBar(data.detected_freq);
      if (data.freq_used != null && document.getElementById('file-auto-freq').checked) {
        freqInput.value = String(data.freq_used);
        updateFreqBar(data.detected_freq);
      }
      meta.className = 'meta ok';
      const presetName = Presets.get(Presets.getStoredId('file'))?.name || '';
      const freqInfo = data.freq_auto
        ? 'Ton auto: ' + data.detected_freq + ' Hz (genutzt: ' + data.freq_used + ' Hz)'
        : 'Ton erkannt: ' + data.detected_freq + ' Hz (eingestellt: ' + data.freq_used + ' Hz)';
      const rangeInfo = decodeFull
        ? 'Ganze Datei'
        : App.fmtTime(parseFloat(offset)) + ' \u2013 ' +
          App.fmtTime(parseFloat(offset) + (parseFloat(len) || data.duration_seconds));
      meta.textContent =
        'Preset: ' + presetName +
        ' \u00b7 Bereich: ' + rangeInfo +
        ' \u00b7 ' + freqInfo +
        ' \u00b7 Engine: ' + data.engine + ' \u00b7 WPM: ' + data.wpm +
        ' \u00b7 Dauer: ' + data.duration_seconds + 's';

      const entryId = ++historyId;
      addHistoryEntry({
        id: entryId,
        text: data.text || '',
        label: presetName + ' \u00b7 ' + rangeInfo + ' \u00b7 ' + data.wpm + ' WPM',
        meta: meta.textContent,
      });
    } catch (err) {
      out.textContent = '';
      meta.className = 'meta error';
      meta.textContent = 'Fehler: ' + err.message;
    } finally {
      btn.disabled = false;
    }
  });

  window.addEventListener('panelchange', (e) => {
    if (e.detail.id !== 'file') player.stop();
  });

  updateFreqBar(null);
  updateDecodeButton();
});
