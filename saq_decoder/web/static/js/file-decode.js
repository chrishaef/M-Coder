/** File Decode panel */

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('file-form');
  if (!form) return;

  const out = document.getElementById('file-out');
  const meta = document.getElementById('file-meta-result');
  const btn = document.getElementById('file-btn');
  const fileInput = document.getElementById('file-input');
  const offsetInput = document.getElementById('file-offset');
  const lengthInput = document.getElementById('file-length');
  const fileMeta = document.getElementById('file-info');
  const playerCard = document.getElementById('file-player');

  let inputSyncTimer = null;

  const player = createWaveformPlayer({
    wrap: '#file-waveform-wrap',
    canvas: '#file-waveform',
    timeCurrent: '#file-time-current',
    timeTotal: '#file-time-total',
    selectionInfo: '#file-selection-info',
    btnPlay: '#file-btn-play',
    btnPlaySel: '#file-btn-play-sel',
    btnClearSel: '#file-btn-clear-sel',
    onSelectionChange(sel) {
      if (sel) {
        offsetInput.value = sel.start.toFixed(1);
        lengthInput.value = (sel.end - sel.start).toFixed(1);
      } else {
        offsetInput.value = '0';
        lengthInput.value = '';
      }
    },
  });

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

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) {
      player.cleanup();
      playerCard.classList.add('hidden');
      return;
    }
    try {
      const info = await player.loadFromFile(file);
      fileMeta.textContent =
        file.name + ' \u00b7 ' + App.fmtTime(info.duration) + ' \u00b7 ' +
        info.sampleRate + ' Hz \u00b7 ' + info.channels + ' Kanal(e)';
      offsetInput.value = '0';
      lengthInput.value = '';
      playerCard.classList.remove('hidden');
    } catch (err) {
      player.cleanup();
      fileMeta.textContent = 'Wellenform konnte nicht geladen werden: ' + err.message;
      playerCard.classList.remove('hidden');
    }
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
    fd.append('freq', document.getElementById('file-freq').value || '750');
    const wpm = document.getElementById('file-wpm').value;
    if (wpm) fd.append('wpm', wpm);
    fd.append('auto_wpm', document.getElementById('file-auto-wpm').checked ? 'true' : 'false');

    try {
      const data = await App.fetchJson('/decode/file', { method: 'POST', body: fd });
      out.textContent = data.text || '(leer)';
      meta.className = 'meta ok';
      meta.textContent =
        'Engine: ' + data.engine + ' \u00b7 WPM: ' + data.wpm +
        ' \u00b7 Dauer: ' + data.duration_seconds + 's \u00b7 Datei: ' +
        data.input.filename + ' (' + data.input.duration_seconds + 's)';
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
});
