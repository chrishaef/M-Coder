/** Transmit – WAV export and live CW output */

document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('transmit-form');
  if (!form) return;

  await Presets.load();

  const textInput = document.getElementById('transmit-text');
  const preview = document.getElementById('transmit-morse-preview');
  const btn = document.getElementById('transmit-btn');
  const meta = document.getElementById('transmit-meta');
  const playerCard = document.getElementById('transmit-player');
  const playerInfo = document.getElementById('transmit-info');
  const presetSelect = document.getElementById('transmit-preset');
  const liveCheck = document.getElementById('transmit-live');
  const liveStatus = document.getElementById('transmit-live-status');
  const liveStop = document.getElementById('transmit-live-stop');
  const liveSendAll = document.getElementById('transmit-live-send-all');
  const liveHint = document.getElementById('transmit-live-hint');

  const liveCw = createLiveCwTransmitter();
  let lastSentText = '';
  let statusTimer = null;

  const player = createWaveformPlayer({
    wrap: '#transmit-waveform-wrap',
    canvas: '#transmit-waveform',
    timeCurrent: '#transmit-time-current',
    timeTotal: '#transmit-time-total',
    btnPlay: '#transmit-btn-play',
    selectable: false,
    zoomable: true,
    btnZoomIn: '#transmit-zoom-in',
    btnZoomOut: '#transmit-zoom-out',
    btnZoomReset: '#transmit-zoom-reset',
  });

  Presets.fillSelect(presetSelect, 'transmit');
  Presets.bindSelect(presetSelect, 'transmit-');

  const MORSE_CHARS = {
    A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....',
    I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.',
    Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-',
    Y: '-.--', Z: '--..', '0': '-----', '1': '.----', '2': '..---', '3': '...--',
    '4': '....-', '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.',
    '.': '.-.-.-', ',': '--..--', '?': '..--..', '/': '-..-.', '=': '-...-',
  };

  function clientMorsePreview(text) {
    const parts = [];
    for (const ch of text.toUpperCase()) {
      if (ch === ' ') parts.push('/');
      else if (MORSE_CHARS[ch]) parts.push(MORSE_CHARS[ch]);
    }
    return parts.join(' ') || '(leer)';
  }

  function getTransmitBody() {
    return {
      text: textInput.value,
      freq: parseInt(document.getElementById('transmit-freq').value, 10) || 750,
      wpm: parseFloat(document.getElementById('transmit-wpm').value) || 20,
      sample_rate: parseInt(document.getElementById('transmit-sr').value, 10) || 8000,
    };
  }

  function isLiveEnabled() {
    return liveCheck?.checked === true;
  }

  function updateLiveStatus() {
    if (!liveStatus) return;
    if (!isLiveEnabled()) {
      liveStatus.textContent = 'Aus';
      liveStatus.className = 'status-pill';
      if (liveStop) liveStop.disabled = true;
      return;
    }

    const remaining = liveCw.remainingSeconds();
    if (remaining > 0.05) {
      liveStatus.textContent = 'Sendet…';
      liveStatus.className = 'status-pill on-air';
      if (liveStop) liveStop.disabled = false;
    } else {
      liveStatus.textContent = 'Bereit';
      liveStatus.className = 'status-pill';
      if (liveStop) liveStop.disabled = false;
    }
  }

  function startStatusPoll() {
    clearInterval(statusTimer);
    statusTimer = setInterval(updateLiveStatus, 100);
  }

  function stopStatusPoll() {
    clearInterval(statusTimer);
    statusTimer = null;
    updateLiveStatus();
  }

  async function syncLiveAppend() {
    if (!isLiveEnabled()) return;

    const text = textInput.value;
    if (!text) {
      lastSentText = '';
      return;
    }
    if (text === lastSentText) return;

    // Nur Anhängen am Ende oder Backspace am Ende
    if (text.length < lastSentText.length) {
      if (lastSentText.startsWith(text)) {
        lastSentText = text;
        return;
      }
      // Bearbeitung in der Mitte – ab hier neu synchronisieren
      lastSentText = '';
    }

    if (!text.startsWith(lastSentText)) {
      lastSentText = '';
    }

    const newPart = text.slice(lastSentText.length);
    if (newPart) {
      try {
        await liveCw.sendText(newPart);
        lastSentText = text;
        updateLiveStatus();
      } catch (err) {
        meta.className = 'meta error';
        meta.textContent = 'Live-Audio: ' + err.message;
      }
    }
  }

  async function enableLiveMode(on) {
    if (on) {
      try {
        await liveCw.unlock();
      } catch (err) {
        if (liveCheck) liveCheck.checked = false;
        meta.className = 'meta error';
        meta.textContent = 'Audio konnte nicht gestartet werden: ' + err.message;
        updateLiveStatus();
        return;
      }
      lastSentText = textInput.value;
      liveCw.resetState();
      if (liveHint) liveHint.classList.remove('hidden');
      startStatusPoll();
      meta.className = 'meta ok';
      meta.textContent =
        'Live-Modus aktiv – neue Zeichen werden sofort gesendet. Preset: ' +
        (Presets.get(Presets.getStoredId('transmit'))?.name || '') +
        ' (' + liveCw.getSettingsFromDom().freq + ' Hz, ' +
        liveCw.getSettingsFromDom().wpm + ' WPM)';
    } else {
      liveCw.stop();
      lastSentText = '';
      stopStatusPoll();
      if (meta.textContent.includes('Live-Modus aktiv')) meta.textContent = '';
    }
    updateLiveStatus();
  }

  textInput.addEventListener('input', () => {
    preview.textContent = clientMorsePreview(textInput.value);
    void syncLiveAppend();
  });
  preview.textContent = clientMorsePreview(textInput.value);

  liveCheck?.addEventListener('change', () => {
    void enableLiveMode(isLiveEnabled());
  });

  liveStop?.addEventListener('click', async () => {
    liveCw.stop();
    lastSentText = textInput.value;
    if (isLiveEnabled()) {
      try {
        await liveCw.unlock();
        liveCw.resetState();
      } catch (err) {
        meta.className = 'meta error';
        meta.textContent = 'Audio konnte nicht neu gestartet werden: ' + err.message;
      }
    }
    updateLiveStatus();
  });

  liveSendAll?.addEventListener('click', async () => {
    if (!isLiveEnabled()) {
      liveCheck.checked = true;
      await enableLiveMode(true);
      if (!isLiveEnabled()) return;
    }
    try {
      await liveCw.unlock();
      liveCw.resetState();
      lastSentText = '';
      const text = textInput.value;
      if (text) {
        await liveCw.sendText(text);
        lastSentText = text;
      }
      updateLiveStatus();
    } catch (err) {
      meta.className = 'meta error';
      meta.textContent = 'Live-Audio: ' + err.message;
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    btn.disabled = true;
    meta.textContent = 'Erzeuge CW-Signal\u2026';
    meta.className = 'meta';

    const body = getTransmitBody();

    try {
      const res = await fetch('/transmit', {
        method: 'POST',
        headers: { ...App.headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || res.statusText);
      }

      const blob = await res.blob();
      const morseHeader = res.headers.get('X-Morse-Preview');
      if (morseHeader) preview.textContent = morseHeader;

      const info = await player.loadFromBlob(blob);
      playerInfo.textContent =
        App.fmtTime(info.duration) + ' \u00b7 ' + info.sampleRate + ' Hz \u00b7 ' +
        body.freq + ' Hz Ton \u00b7 ' + body.wpm + ' WPM';
      playerCard.classList.remove('hidden');

      meta.className = 'meta ok';
      meta.textContent =
        'Preset: ' + (Presets.get(Presets.getStoredId('transmit'))?.name || '') +
        ' \u00b7 CW-Audio erzeugt';
    } catch (err) {
      meta.className = 'meta error';
      meta.textContent = 'Fehler: ' + err.message;
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('transmit-download')?.addEventListener('click', async () => {
    const res = await fetch('/transmit', {
      method: 'POST',
      headers: { ...App.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify(getTransmitBody()),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'morse-transmit.wav';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  window.addEventListener('panelchange', (e) => {
    if (e.detail.id !== 'transmit') {
      player.stop();
      if (isLiveEnabled()) {
        liveCheck.checked = false;
        enableLiveMode(false);
      }
    }
  });

  window.addEventListener('beforeunload', () => {
    liveCw.stop();
    stopStatusPoll();
  });
});
