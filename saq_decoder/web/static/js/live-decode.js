/** Live Decode – microphone capture with cumulative decode output */

document.addEventListener('DOMContentLoaded', async () => {
  const btnStart = document.getElementById('live-start');
  const btnStop = document.getElementById('live-stop');
  const btnClear = document.getElementById('live-clear');
  const statusEl = document.getElementById('live-status');
  const out = document.getElementById('live-out');
  const meta = document.getElementById('live-meta');
  const canvas = document.getElementById('live-waveform');
  const ctx = canvas.getContext('2d');
  const decodeInterval = document.getElementById('live-interval');
  const levelBar = document.getElementById('live-level');
  const segmentCount = document.getElementById('live-segments');
  const presetSelect = document.getElementById('live-preset');

  if (!btnStart) return;

  await Presets.load();
  Presets.fillSelect(presetSelect, Presets.currentId);
  Presets.bindSelect(presetSelect, 'live-');

  let audioCtx = null;
  let analyser = null;
  let source = null;
  let stream = null;
  let recorder = null;
  let chunks = [];
  let rafId = null;
  let decodeTimer = null;
  let running = false;
  let accumulatedText = '';
  let segmentsDecoded = 0;
  let decodeBusy = false;
  let mime = 'audio/webm';
  let livePeaks = [];

  function drawLiveWaveform() {
    if (!analyser) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;

    if (canvas.width !== w * devicePixelRatio || canvas.height !== h * devicePixelRatio) {
      canvas.width = w * devicePixelRatio;
      canvas.height = h * devicePixelRatio;
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    }

    const buf = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(buf);

    let peak = 0;
    for (let i = 0; i < buf.length; i++) {
      peak = Math.max(peak, Math.abs(buf[i] - 128));
    }
    livePeaks.push(peak / 128);
    if (livePeaks.length > w) livePeaks.shift();

    if (levelBar) {
      const pct = Math.min(100, Math.round((peak / 128) * 140));
      levelBar.style.width = pct + '%';
    }

    ctx.fillStyle = '#0a0e14';
    ctx.fillRect(0, 0, w, h);

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#3dd68c';
    ctx.beginPath();
    const mid = h / 2;
    for (let i = 0; i < livePeaks.length; i++) {
      const y = mid - livePeaks[i] * mid * 0.9;
      if (i === 0) ctx.moveTo(i, y);
      else ctx.lineTo(i, y);
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(61, 139, 253, 0.5)';
    ctx.beginPath();
    for (let i = 0; i < livePeaks.length; i++) {
      const y = mid + livePeaks[i] * mid * 0.9;
      if (i === 0) ctx.moveTo(i, y);
      else ctx.lineTo(i, y);
    }
    ctx.stroke();

    if (running) rafId = requestAnimationFrame(drawLiveWaveform);
  }

  function audioBufferToWav(buffer) {
    const channel = buffer.getChannelData(0);
    const pcm = new Int16Array(channel.length);
    for (let i = 0; i < channel.length; i++) {
      pcm[i] = Math.max(-32768, Math.min(32767, channel[i] * 32767));
    }

    const sampleRate = buffer.sampleRate;
    const dataSize = pcm.length * 2;
    const header = new ArrayBuffer(44);
    const view = new DataView(header);
    const writeStr = (off, s) => {
      for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
    };
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, dataSize, true);
    return new Blob([header, pcm], { type: 'audio/wav' });
  }

  async function decodeChunk(wavBlob) {
    if (decodeBusy || wavBlob.size < 1000) return;
    decodeBusy = true;
    meta.className = 'meta live';
    meta.textContent = 'Dekodiere Live-Segment\u2026';

    const segLen = parseFloat(decodeInterval.value) || 4;
    const fd = new FormData();
    fd.append('file', wavBlob, 'live-chunk.wav');
    fd.append('offset', '0');
    fd.append('length', String(segLen));
    fd.append('freq', document.getElementById('live-freq').value || '750');
    fd.append('auto_freq', document.getElementById('live-auto-freq').checked ? 'true' : 'false');
    const wpm = document.getElementById('live-wpm').value;
    if (wpm) fd.append('wpm', wpm);
    fd.append('auto_wpm', document.getElementById('live-auto-wpm').checked ? 'true' : 'false');

    try {
      const data = await App.fetchJson('/decode/live', { method: 'POST', body: fd });
      const text = (data.text || '').trim();
      segmentsDecoded += 1;
      if (segmentCount) segmentCount.textContent = String(segmentsDecoded);

      if (text) {
        accumulatedText = Presets.mergeDecodeText(accumulatedText, text);
        out.textContent = accumulatedText;
        meta.className = 'meta ok';
        const freqPart = data.detected_freq != null
          ? ' \u00b7 Ton erkannt: ' + data.detected_freq + ' Hz'
          : '';
        meta.textContent =
          'Preset: ' + (Presets.get(Presets.currentId)?.name || '') +
          ' \u00b7 Engine: ' + data.engine + ' \u00b7 WPM: ' + data.wpm +
          freqPart + ' \u00b7 Segment #' + segmentsDecoded;
      } else {
        meta.className = 'meta';
        meta.textContent = 'Segment #' + segmentsDecoded + ': kein Morse erkannt.';
      }
    } catch (err) {
      meta.className = 'meta error';
      meta.textContent = 'Decode-Fehler: ' + err.message;
    } finally {
      decodeBusy = false;
    }
  }

  function startRecorder() {
    chunks = [];
    recorder = new MediaRecorder(stream, { mimeType: mime });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.start();
  }

  async function captureAndDecode() {
    if (!recorder || recorder.state === 'inactive') return;

    const blob = await new Promise((resolve) => {
      recorder.addEventListener('stop', () => {
        resolve(new Blob(chunks, { type: mime }));
      }, { once: true });
      recorder.stop();
    });

    if (running) startRecorder();

    if (blob.size < 2000) return;
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const decodeCtx = new AudioContext();
      const audioBuffer = await decodeCtx.decodeAudioData(arrayBuffer.slice(0));
      await decodeCtx.close();
      await decodeChunk(audioBufferToWav(audioBuffer));
    } catch {
      /* segment too short */
    }
  }

  async function startLive() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch (err) {
      meta.className = 'meta error';
      meta.textContent = 'Mikrofon-Zugriff verweigert: ' + err.message;
      return;
    }

    mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    audioCtx = new AudioContext();
    source = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);

    startRecorder();
    running = true;
    livePeaks = [];
    btnStart.disabled = true;
    btnStop.disabled = false;
    if (btnClear) btnClear.disabled = false;
    statusEl.textContent = 'Live';
    statusEl.className = 'status-pill recording';
    out.textContent = accumulatedText || 'Warte auf Signal\u2026';
    drawLiveWaveform();

    const intervalSec = parseFloat(decodeInterval.value) || 4;
    decodeTimer = setInterval(captureAndDecode, intervalSec * 1000);
  }

  function stopLive() {
    running = false;
    clearInterval(decodeTimer);
    cancelAnimationFrame(rafId);

    if (recorder && recorder.state !== 'inactive') recorder.stop();
    stream?.getTracks().forEach((t) => t.stop());
    source?.disconnect();
    audioCtx?.close();

    stream = null;
    recorder = null;
    source = null;
    analyser = null;
    audioCtx = null;
    chunks = [];

    btnStart.disabled = false;
    btnStop.disabled = true;
    statusEl.textContent = 'Bereit';
    statusEl.className = 'status-pill';
    if (levelBar) levelBar.style.width = '0%';
  }

  btnStart.addEventListener('click', startLive);
  btnStop.addEventListener('click', stopLive);
  btnClear?.addEventListener('click', () => {
    accumulatedText = '';
    segmentsDecoded = 0;
    if (segmentCount) segmentCount.textContent = '0';
    out.textContent = running ? 'Warte auf Signal\u2026' : 'Noch kein Live-Decode gestartet.';
    meta.textContent = '';
    meta.className = 'meta';
  });

  window.addEventListener('panelchange', (e) => {
    if (e.detail.id !== 'live' && running) stopLive();
  });
  window.addEventListener('beforeunload', () => { if (running) stopLive(); });
});
