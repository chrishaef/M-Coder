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
  const presetSelect = document.getElementById('file-preset');
  const dropZone = document.getElementById('file-drop');
  const detectedFreqEl = document.getElementById('file-detected-freq');
  const configuredFreqEl = document.getElementById('file-configured-freq');
  const applyFreqBtn = document.getElementById('file-apply-freq');

  let inputSyncTimer = null;

  function updateFreqBar(detected) {
    if (detectedFreqEl) detectedFreqEl.textContent = detected != null ? String(detected) : '–';
    if (configuredFreqEl) {
      configuredFreqEl.textContent = freqInput.value || '–';
    }
  }

  const player = createWaveformPlayer({
    wrap: '#file-waveform-wrap',
    canvas: '#file-waveform',
    spectrumCanvas: '#file-spectrum',
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
      } else {
        offsetInput.value = '0';
        lengthInput.value = '';
      }
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

  async function handleFile(file) {
    if (!file) {
      player.cleanup();
      playerCard.classList.add('hidden');
      updateFreqBar(null);
      return;
    }
    try {
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
      playerCard.classList.remove('hidden');
    } catch (err) {
      player.cleanup();
      fileMeta.textContent = 'Wellenform konnte nicht geladen werden: ' + err.message;
      playerCard.classList.remove('hidden');
    }
  }

  function syncSelectionFromInputs() {
    const dur = player.getDuration();
    if (!dur) return;
    const off = parseFloat(offsetInput.value) || 0;
    const lenRaw = lengthInput.value.trim();
    if (!lenRaw) player.clearSelection();
    else {
      const len = parseFloat(lenRaw) || 0;
      player.setSelection(off, off + len);
    }
  }

  offsetInput.addEventListener('input', () => {
    clearTimeout(inputSyncTimer);
    inputSyncTimer = setTimeout(syncSelectionFromInputs, 200);
  });
  lengthInput.addEventListener('input', () => {
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
    btn.disabled = true;
    out.textContent = 'Dekodiere\u2026';
    meta.textContent = '';
    meta.className = 'meta';

    syncSelectionFromInputs();

    const file = fileInput.files?.[0];
    if (!file) return;

    const fd = new FormData();
    fd.append('file', file);
    fd.append('offset', offsetInput.value || '0');
    const len = lengthInput.value;
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
      const freqInfo = data.freq_auto
        ? 'Ton auto: ' + data.detected_freq + ' Hz (genutzt: ' + data.freq_used + ' Hz)'
        : 'Ton erkannt: ' + data.detected_freq + ' Hz (eingestellt: ' + data.freq_used + ' Hz)';
      meta.textContent =
        'Preset: ' + (Presets.get(Presets.getStoredId('file'))?.name || '') +
        ' \u00b7 ' + freqInfo +
        ' \u00b7 Engine: ' + data.engine + ' \u00b7 WPM: ' + data.wpm +
        ' \u00b7 Dauer: ' + data.duration_seconds + 's';
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
});
