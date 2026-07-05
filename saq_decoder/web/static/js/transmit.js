/** Transmit – generate CW audio from text */

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('transmit-form');
  if (!form) return;

  const textInput = document.getElementById('transmit-text');
  const preview = document.getElementById('transmit-morse-preview');
  const btn = document.getElementById('transmit-btn');
  const meta = document.getElementById('transmit-meta');
  const playerCard = document.getElementById('transmit-player');
  const playerInfo = document.getElementById('transmit-info');

  const player = createWaveformPlayer({
    wrap: '#transmit-waveform-wrap',
    canvas: '#transmit-waveform',
    timeCurrent: '#transmit-time-current',
    timeTotal: '#transmit-time-total',
    btnPlay: '#transmit-btn-play',
    selectable: false,
  });

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

  textInput.addEventListener('input', () => {
    preview.textContent = clientMorsePreview(textInput.value);
  });
  preview.textContent = clientMorsePreview(textInput.value);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    btn.disabled = true;
    meta.textContent = 'Erzeuge CW-Signal\u2026';
    meta.className = 'meta';

    const body = {
      text: textInput.value,
      freq: parseInt(document.getElementById('transmit-freq').value, 10) || 750,
      wpm: parseFloat(document.getElementById('transmit-wpm').value) || 20,
      sample_rate: parseInt(document.getElementById('transmit-sr').value, 10) || 8000,
    };

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
      meta.textContent = 'CW-Audio erzeugt – Vorschau abspielen oder Datei speichern.';
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
      body: JSON.stringify({
        text: textInput.value,
        freq: parseInt(document.getElementById('transmit-freq').value, 10) || 750,
        wpm: parseFloat(document.getElementById('transmit-wpm').value) || 20,
        sample_rate: parseInt(document.getElementById('transmit-sr').value, 10) || 8000,
      }),
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
    if (e.detail.id !== 'transmit') player.stop();
  });
});
