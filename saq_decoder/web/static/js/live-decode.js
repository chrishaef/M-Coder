/** Live Decode – microphone capture with cumulative decode output */

document.addEventListener('DOMContentLoaded', async () => {
  const btnStart = document.getElementById('live-start');
  const btnStop = document.getElementById('live-stop');
  const btnClear = document.getElementById('live-clear');
  const btnDownload = document.getElementById('live-download');
  const statusEl = document.getElementById('live-status');
  const out = document.getElementById('live-out');
  const meta = document.getElementById('live-meta');
  const recordingInfo = document.getElementById('live-recording-info');
  const canvas = document.getElementById('live-waveform');
  const ctx = canvas.getContext('2d');
  const decodeInterval = document.getElementById('live-interval');
  const levelBar = document.getElementById('live-level');
  const segmentCount = document.getElementById('live-segments');
  const presetSelect = document.getElementById('live-preset');

  if (!btnStart) return;

  await Presets.load();
  Presets.fillSelect(presetSelect, 'live');
  Presets.bindSelect(presetSelect, 'live-');

  let audioCtx = null;
  let analyser = null;
  let source = null;
  let muteGain = null;
  let stream = null;
  let recorder = null;
  let chunks = [];
  let sessionChunks = [];
  let rafId = null;
  let decodeTimer = null;
  let running = false;
  let accumulatedText = '';
  let segmentsDecoded = 0;
  let decodeBusy = false;
  let mime = '';
  let livePeaks = [];
  let lastRecordingWav = null;
  let lastRecordingFallback = null;
  let lastRecordingExt = 'wav';
  const timeDomainBuf = new Float32Array(2048);

  function pickRecorderMime() {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
    ];
    for (const type of candidates) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return '';
  }

  function recordingTimestamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return d.getFullYear() +
      pad(d.getMonth() + 1) + pad(d.getDate()) + '-' +
      pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
  }

  function measureLevel() {
    if (!analyser) return 0;
    analyser.getFloatTimeDomainData(timeDomainBuf);
    let sum = 0;
    let peak = 0;
    for (let i = 0; i < timeDomainBuf.length; i++) {
      const v = timeDomainBuf[i];
      sum += v * v;
      peak = Math.max(peak, Math.abs(v));
    }
    const rms = Math.sqrt(sum / timeDomainBuf.length);
    return Math.max(rms * 4, peak);
  }

  function drawLiveWaveform() {
    if (!running || !analyser) return;

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) {
      rafId = requestAnimationFrame(drawLiveWaveform);
      return;
    }

    if (canvas.width !== w * devicePixelRatio || canvas.height !== h * devicePixelRatio) {
      canvas.width = w * devicePixelRatio;
      canvas.height = h * devicePixelRatio;
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    }

    const level = measureLevel();
    livePeaks.push(level);
    if (livePeaks.length > w) livePeaks.shift();

    if (levelBar) {
      const pct = Math.min(100, Math.round(level * 100));
      levelBar.style.width = pct + '%';
    }

    ctx.fillStyle = '#0a0e14';
    ctx.fillRect(0, 0, w, h);

    const mid = h / 2;
    ctx.lineWidth = 1.5;

    ctx.strokeStyle = '#3dd68c';
    ctx.beginPath();
    for (let i = 0; i < livePeaks.length; i++) {
      const x = livePeaks.length < w
        ? i * (w / Math.max(livePeaks.length - 1, 1))
        : i;
      const y = mid - Math.min(livePeaks[i], 1) * mid * 0.92;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(61, 139, 253, 0.55)';
    ctx.beginPath();
    for (let i = 0; i < livePeaks.length; i++) {
      const x = livePeaks.length < w
        ? i * (w / Math.max(livePeaks.length - 1, 1))
        : i;
      const y = mid + Math.min(livePeaks[i], 1) * mid * 0.92;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    rafId = requestAnimationFrame(drawLiveWaveform);
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

  async function mergeChunksToWav(parts) {
    const decodeCtx = new AudioContext();
    const buffers = [];
    for (const blob of parts) {
      if (blob.size < 64) continue;
      try {
        const ab = await blob.arrayBuffer();
        buffers.push(await decodeCtx.decodeAudioData(ab.slice(0)));
      } catch {
        /* einzelnes Segment überspringen */
      }
    }
    await decodeCtx.close();
    if (!buffers.length) return null;

    const sampleRate = buffers[0].sampleRate;
    let totalSamples = 0;
    for (const buf of buffers) {
      if (buf.sampleRate !== sampleRate) {
        totalSamples += Math.round(buf.length * sampleRate / buf.sampleRate);
      } else {
        totalSamples += buf.length;
      }
    }

    const mergeCtx = new AudioContext();
    const merged = mergeCtx.createBuffer(1, totalSamples, sampleRate);
    const outCh = merged.getChannelData(0);
    let offset = 0;

    for (const buf of buffers) {
      const src = buf.getChannelData(0);
      if (buf.sampleRate === sampleRate) {
        outCh.set(src, offset);
        offset += src.length;
      } else {
        for (let i = 0; i < src.length; i++) {
          const pos = offset + Math.round(i * sampleRate / buf.sampleRate);
          if (pos < outCh.length) outCh[pos] = src[i];
        }
        offset += Math.round(src.length * sampleRate / buf.sampleRate);
      }
    }
    await mergeCtx.close();
    return { wav: audioBufferToWav(merged), duration: merged.duration };
  }

  function clearRecordingDownload() {
    lastRecordingWav = null;
    lastRecordingFallback = null;
    if (btnDownload) btnDownload.disabled = true;
    if (recordingInfo) {
      recordingInfo.textContent = 'Nach Stoppen kann die gesamte Aufnahme als WAV heruntergeladen werden.';
    }
  }

  async function finalizeRecording() {
    if (!sessionChunks.length) {
      clearRecordingDownload();
      return;
    }

    if (recordingInfo) {
      recordingInfo.textContent = 'Aufnahme wird für Download vorbereitet\u2026';
    }

    lastRecordingFallback = new Blob(sessionChunks, { type: mime || 'audio/webm' });
    if (mime.includes('ogg')) lastRecordingExt = 'ogg';
    else if (mime.includes('mp4')) lastRecordingExt = 'm4a';
    else lastRecordingExt = 'webm';

    try {
      const result = await mergeChunksToWav(sessionChunks);
      if (result) {
        lastRecordingWav = result.wav;
        lastRecordingExt = 'wav';
        if (btnDownload) btnDownload.disabled = false;
        if (recordingInfo) {
          recordingInfo.textContent =
            'Aufnahme bereit: ' + App.fmtTime(result.duration) +
            ' \u00b7 ' + sessionChunks.length + ' Segment(e) \u00b7 Download als WAV';
        }
        return;
      }
    } catch {
      /* Fallback unten */
    }

    if (lastRecordingFallback.size > 0) {
      if (btnDownload) btnDownload.disabled = false;
      if (recordingInfo) {
        recordingInfo.textContent =
          'Aufnahme bereit (' + (lastRecordingFallback.size / 1024).toFixed(0) +
          ' KB) \u00b7 Download als ' + lastRecordingExt.toUpperCase();
      }
    } else {
      clearRecordingDownload();
    }
  }

  async function decodeChunk(wavBlob) {
    if (decodeBusy || wavBlob.size < 1000) return;
    decodeBusy = true;
    meta.className = 'meta live';
    meta.textContent = 'Dekodiere Live-Segment\u2026';

    const fd = new FormData();
    fd.append('file', wavBlob, 'live-chunk.wav');
    fd.append('offset', '0');
    // Kein length – gesamtes Segment dekodieren (kürzer als Intervall möglich)
    fd.append('freq', document.getElementById('live-freq').value || '750');
    fd.append('auto_freq', document.getElementById('live-auto-freq').checked ? 'true' : 'false');
    const wpm = document.getElementById('live-wpm').value;
    if (wpm) fd.append('wpm', wpm);
    fd.append('auto_wpm', document.getElementById('live-auto-wpm').checked ? 'true' : 'false');
    fd.append('autocorrect', document.getElementById('live-autocorrect').checked ? 'true' : 'false');

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
          'Preset: ' + (Presets.get(Presets.getStoredId('live'))?.name || '') +
          ' \u00b7 Engine: ' + data.engine + ' \u00b7 WPM: ' + data.wpm +
          freqPart + ' \u00b7 Segment #' + segmentsDecoded;
        const corrSummary = App.formatCorrectionSummary(data.corrections);
        if (corrSummary) meta.textContent += ' \u00b7 ' + corrSummary;
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

  function attachRecorderHandlers(rec) {
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data);
        sessionChunks.push(e.data);
      }
    };
    rec.onerror = (e) => {
      meta.className = 'meta error';
      meta.textContent = 'Recorder-Fehler: ' + (e.error?.message || 'unbekannt');
    };
  }

  function startRecorder() {
    if (!stream) return false;
    chunks = [];
    try {
      recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
    } catch (err) {
      meta.className = 'meta error';
      meta.textContent = 'Aufnahme nicht möglich: ' + err.message;
      return false;
    }
    attachRecorderHandlers(recorder);
    recorder.start();
    return true;
  }

  async function stopRecorderAndGetBlob() {
    if (!recorder || recorder.state === 'inactive') {
      return new Blob(chunks, { type: mime || 'audio/webm' });
    }
    return new Promise((resolve) => {
      recorder.addEventListener('stop', () => {
        resolve(new Blob(chunks, { type: mime || 'audio/webm' }));
      }, { once: true });
      try {
        recorder.stop();
      } catch {
        resolve(new Blob(chunks, { type: mime || 'audio/webm' }));
      }
    });
  }

  async function captureAndDecode() {
    if (!recorder || recorder.state === 'inactive') return;

    const blob = await stopRecorderAndGetBlob();

    if (running) startRecorder();

    if (blob.size < 2000) return;
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const decodeCtx = new AudioContext();
      const audioBuffer = await decodeCtx.decodeAudioData(arrayBuffer.slice(0));
      await decodeCtx.close();
      await decodeChunk(audioBufferToWav(audioBuffer));
    } catch (err) {
      meta.className = 'meta error';
      meta.textContent = 'Segment konnte nicht dekodiert werden: ' + err.message;
    }
  }

  async function setupAudioGraph() {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    source = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.35;

    muteGain = audioCtx.createGain();
    muteGain.gain.value = 0;

    source.connect(analyser);
    analyser.connect(muteGain);
    muteGain.connect(audioCtx.destination);
  }

  async function startLive() {
    if (!navigator.mediaDevices?.getUserMedia) {
      meta.className = 'meta error';
      meta.textContent = 'Mikrofon-API nicht verfügbar (HTTPS oder localhost nötig).';
      return;
    }

    btnStart.disabled = true;
    clearRecordingDownload();
    sessionChunks = [];
    meta.className = 'meta';
    meta.textContent = 'Mikrofon wird geöffnet\u2026';

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: true,
        },
      });
    } catch (err) {
      meta.className = 'meta error';
      meta.textContent = 'Mikrofon-Zugriff verweigert: ' + err.message;
      btnStart.disabled = false;
      return;
    }

    mime = pickRecorderMime();

    try {
      await setupAudioGraph();
    } catch (err) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
      meta.className = 'meta error';
      meta.textContent = 'Audio-Pipeline Fehler: ' + err.message;
      btnStart.disabled = false;
      return;
    }

    if (!startRecorder()) {
      await stopLive();
      return;
    }

    running = true;
    livePeaks = [];
    btnStop.disabled = false;
    if (btnDownload) btnDownload.disabled = true;
    statusEl.textContent = 'Live';
    statusEl.className = 'status-pill recording';
    out.textContent = accumulatedText || 'Warte auf Signal\u2026';

    const track = stream.getAudioTracks()[0];
    meta.className = 'meta ok';
    meta.textContent = 'Mikrofon aktiv' +
      (track?.label ? ': ' + track.label : '') +
      (mime ? ' \u00b7 Format: ' + mime : '');

    cancelAnimationFrame(rafId);
    drawLiveWaveform();

    const intervalSec = parseFloat(decodeInterval.value) || 4;
    decodeTimer = setInterval(captureAndDecode, intervalSec * 1000);
  }

  async function stopLive() {
    running = false;
    clearInterval(decodeTimer);
    cancelAnimationFrame(rafId);

    await stopRecorderAndGetBlob();

    stream?.getTracks().forEach((t) => t.stop());

    try { source?.disconnect(); } catch { /* ignore */ }
    try { analyser?.disconnect(); } catch { /* ignore */ }
    try { muteGain?.disconnect(); } catch { /* ignore */ }
    if (audioCtx && audioCtx.state !== 'closed') {
      audioCtx.close().catch(() => {});
    }

    stream = null;
    recorder = null;
    source = null;
    analyser = null;
    muteGain = null;
    audioCtx = null;
    chunks = [];

    btnStart.disabled = false;
    btnStop.disabled = true;
    statusEl.textContent = 'Bereit';
    statusEl.className = 'status-pill';
    if (levelBar) levelBar.style.width = '0%';

    await finalizeRecording();
  }

  btnStart.addEventListener('click', startLive);
  btnStop.addEventListener('click', () => { stopLive(); });

  btnDownload?.addEventListener('click', () => {
    const blob = lastRecordingWav || lastRecordingFallback;
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'live-aufnahme-' + recordingTimestamp() + '.' + lastRecordingExt;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  btnClear?.addEventListener('click', () => {
    accumulatedText = '';
    segmentsDecoded = 0;
    if (segmentCount) segmentCount.textContent = '0';
    out.textContent = running ? 'Warte auf Signal\u2026' : 'Noch kein Live-Decode gestartet.';
    if (!running) {
      meta.textContent = '';
      meta.className = 'meta';
    }
  });

  window.addEventListener('panelchange', (e) => {
    if (e.detail.id !== 'live' && running) stopLive();
  });
  window.addEventListener('beforeunload', () => { if (running) stopLive(); });
});
