/** Reusable waveform viewer with optional selection */

function createWaveformPlayer(opts) {
  const wrap = document.querySelector(opts.wrap);
  const canvas = document.querySelector(opts.canvas);
  const ctx = canvas.getContext('2d');
  const timeCurrent = document.querySelector(opts.timeCurrent);
  const timeTotal = document.querySelector(opts.timeTotal);
  const selectionInfo = opts.selectionInfo ? document.querySelector(opts.selectionInfo) : null;
  const btnPlay = opts.btnPlay ? document.querySelector(opts.btnPlay) : null;
  const btnPlaySel = opts.btnPlaySel ? document.querySelector(opts.btnPlaySel) : null;
  const btnClearSel = opts.btnClearSel ? document.querySelector(opts.btnClearSel) : null;
  const selectable = opts.selectable !== false;

  let audioEl = null;
  let audioUrl = null;
  let duration = 0;
  let peaks = [];
  let selection = null;
  let dragMode = null;
  let dragAnchor = 0;
  let dragOriginSel = null;
  let dragStartX = 0;
  let playSelectionOnly = false;
  let rafId = null;
  let onSelectionChange = opts.onSelectionChange || (() => {});

  function xFromTime(t) {
    const w = canvas.clientWidth;
    return duration ? (t / duration) * w : 0;
  }

  function timeFromX(x) {
    const w = canvas.clientWidth;
    if (!w || !duration) return 0;
    return App.clamp(x / w, 0, 1) * duration;
  }

  function normalizeSelection(start, end) {
    let a = App.clamp(Math.min(start, end), 0, duration);
    let b = App.clamp(Math.max(start, end), 0, duration);
    if (b - a < 0.05) b = Math.min(duration, a + 0.05);
    return { start: a, end: b };
  }

  function hasSelection() {
    if (!selection || !duration) return false;
    const len = selection.end - selection.start;
    if (len <= 0.05) return false;
    return selection.start > 0.01 || selection.end < duration - 0.01;
  }

  function updateSelectionInfo() {
    if (btnPlaySel) btnPlaySel.disabled = !hasSelection();
    if (!selectionInfo) return;
    if (!duration) {
      selectionInfo.textContent = 'Kein Bereich markiert.';
      return;
    }
    if (hasSelection()) {
      const len = selection.end - selection.start;
      selectionInfo.innerHTML =
        'Markierter Bereich: <strong>' + App.fmtTime(selection.start) + ' &ndash; ' +
        App.fmtTime(selection.end) + '</strong> (' + len.toFixed(1) + ' s)';
    } else {
      selectionInfo.textContent =
        'Kein Bereich markiert &ndash; ganze Datei (' + App.fmtTime(duration) + ').';
    }
  }

  function notifySelection() {
    updateSelectionInfo();
    onSelectionChange(hasSelection() ? selection : null);
  }

  function setPlayButton(playing) {
    if (!btnPlay) return;
    btnPlay.textContent = playing ? '\u23F8' : '\u25B6';
  }

  function stopPlayback() {
    playSelectionOnly = false;
    if (audioEl) {
      audioEl.pause();
      setPlayButton(false);
    }
    cancelAnimationFrame(rafId);
    drawWaveform();
  }

  function tickPlayhead() {
    if (!audioEl || audioEl.paused) return;
    if (playSelectionOnly && selection && audioEl.currentTime >= selection.end - 0.02) {
      audioEl.pause();
      audioEl.currentTime = selection.end;
      playSelectionOnly = false;
      setPlayButton(false);
    }
    if (timeCurrent) timeCurrent.textContent = App.fmtTime(audioEl.currentTime);
    drawWaveform(audioEl.currentTime);
    rafId = requestAnimationFrame(tickPlayhead);
  }

  function drawWaveform(playhead) {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;

    if (canvas.width !== w * devicePixelRatio || canvas.height !== h * devicePixelRatio) {
      canvas.width = w * devicePixelRatio;
      canvas.height = h * devicePixelRatio;
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    }

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0a0e14';
    ctx.fillRect(0, 0, w, h);

    const mid = h / 2;
    const amp = h * 0.42;

    if (peaks.length) {
      ctx.beginPath();
      ctx.moveTo(0, mid);
      for (let i = 0; i < peaks.length; i++) {
        const x = (i / (peaks.length - 1)) * w;
        ctx.lineTo(x, mid - peaks[i] * amp);
      }
      for (let i = peaks.length - 1; i >= 0; i--) {
        const x = (i / (peaks.length - 1)) * w;
        ctx.lineTo(x, mid + peaks[i] * amp);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(91, 156, 245, 0.35)';
      ctx.fill();
      ctx.strokeStyle = '#5b9cf5';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    if (selectable && selection && duration) {
      const x0 = xFromTime(selection.start);
      const x1 = xFromTime(selection.end);
      ctx.fillStyle = 'rgba(61, 139, 253, 0.35)';
      ctx.fillRect(x0, 0, Math.max(1, x1 - x0), h);
    }

    if (playhead != null && Number.isFinite(playhead)) {
      const px = xFromTime(playhead);
      ctx.strokeStyle = '#3dd68c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
      ctx.stroke();
    }
  }

  function computePeaks(buffer, buckets) {
    const data = buffer.getChannelData(0);
    const block = Math.max(1, Math.floor(data.length / buckets));
    const result = [];
    for (let i = 0; i < buckets; i++) {
      let peak = 0;
      const start = i * block;
      const end = Math.min(data.length, start + block);
      for (let j = start; j < end; j++) {
        peak = Math.max(peak, Math.abs(data[j]));
      }
      result.push(peak);
    }
    return result;
  }

  function cleanup() {
    stopPlayback();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioUrl = null;
    if (audioEl) {
      audioEl.remove();
      audioEl = null;
    }
    duration = 0;
    peaks = [];
    selection = null;
    if (timeCurrent) timeCurrent.textContent = App.fmtTime(0);
    if (timeTotal) timeTotal.textContent = App.fmtTime(0);
    drawWaveform();
  }

  async function loadFromFile(file) {
    cleanup();
    if (!file) return null;

    audioUrl = URL.createObjectURL(file);
    audioEl = new Audio(audioUrl);
    audioEl.preload = 'auto';
    audioEl.addEventListener('timeupdate', () => {
      if (audioEl && !audioEl.paused && timeCurrent) {
        timeCurrent.textContent = App.fmtTime(audioEl.currentTime);
      }
    });
    audioEl.addEventListener('ended', () => {
      setPlayButton(false);
      drawWaveform();
    });

    const arrayBuffer = await file.arrayBuffer();
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const buffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
    await audioCtx.close();

    duration = buffer.duration;
    peaks = computePeaks(buffer, 1200);
    if (timeTotal) timeTotal.textContent = App.fmtTime(duration);
    if (timeCurrent) timeCurrent.textContent = App.fmtTime(0);
    selection = null;
    notifySelection();
    drawWaveform();

    return {
      duration: buffer.duration,
      sampleRate: buffer.sampleRate,
      channels: buffer.numberOfChannels,
    };
  }

  async function loadFromBlob(blob) {
    const file = new File([blob], 'audio.wav', { type: 'audio/wav' });
    return loadFromFile(file);
  }

  function hitTestSelection(x) {
    if (!selection || !duration) return null;
    const edge = 8;
    const xs = xFromTime(selection.start);
    const xe = xFromTime(selection.end);
    if (Math.abs(x - xs) <= edge) return 'resize-start';
    if (Math.abs(x - xe) <= edge) return 'resize-end';
    if (x >= xs && x <= xe) return 'move';
    return null;
  }

  if (selectable) {
    wrap.addEventListener('pointerdown', (e) => {
      if (!duration) return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      dragStartX = x;
      const t = timeFromX(x);
      const hit = hitTestSelection(x);

      if (hit === 'resize-start') dragMode = 'resize-start';
      else if (hit === 'resize-end') dragMode = 'resize-end';
      else if (hit === 'move') {
        dragMode = 'move';
        dragOriginSel = { ...selection };
        dragAnchor = t;
      } else {
        dragMode = 'new';
        dragAnchor = t;
        selection = normalizeSelection(t, t);
      }
      wrap.setPointerCapture(e.pointerId);
    });

    wrap.addEventListener('pointermove', (e) => {
      if (!dragMode || !duration) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const t = timeFromX(x);

      if (dragMode === 'new') selection = normalizeSelection(dragAnchor, t);
      else if (dragMode === 'resize-start') selection = normalizeSelection(t, selection.end);
      else if (dragMode === 'resize-end') selection = normalizeSelection(selection.start, t);
      else if (dragMode === 'move' && dragOriginSel) {
        const len = dragOriginSel.end - dragOriginSel.start;
        let newStart = dragOriginSel.start + (t - dragAnchor);
        if (newStart < 0) newStart = 0;
        if (newStart + len > duration) newStart = duration - len;
        selection = { start: newStart, end: newStart + len };
      }
      notifySelection();
      drawWaveform();
    });

    wrap.addEventListener('pointerup', (e) => {
      if (!dragMode) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      if (dragMode === 'new' && Math.abs(x - dragStartX) < 4) {
        if (audioEl) {
          audioEl.currentTime = timeFromX(x);
          if (timeCurrent) timeCurrent.textContent = App.fmtTime(audioEl.currentTime);
        }
        selection = null;
      }
      dragMode = null;
      dragOriginSel = null;
      notifySelection();
    });
  }

  btnPlay?.addEventListener('click', () => {
    if (!audioEl) return;
    if (audioEl.paused) {
      playSelectionOnly = false;
      audioEl.play();
      setPlayButton(true);
      rafId = requestAnimationFrame(tickPlayhead);
    } else {
      audioEl.pause();
      setPlayButton(false);
    }
  });

  btnPlaySel?.addEventListener('click', () => {
    if (!audioEl || !hasSelection()) return;
    playSelectionOnly = true;
    audioEl.currentTime = selection.start;
    audioEl.play();
    setPlayButton(true);
    rafId = requestAnimationFrame(tickPlayhead);
  });

  btnClearSel?.addEventListener('click', () => {
    selection = null;
    notifySelection();
    drawWaveform();
  });

  window.addEventListener('resize', () => drawWaveform());

  return {
    cleanup,
    loadFromFile,
    loadFromBlob,
    drawWaveform,
    hasSelection,
    getSelection: () => (hasSelection() ? { ...selection } : null),
    setSelection(start, end) {
      if (!duration) return;
      selection = normalizeSelection(start, end);
      notifySelection();
      drawWaveform();
    },
    clearSelection() {
      selection = null;
      notifySelection();
      drawWaveform();
    },
    getDuration: () => duration,
    play: () => btnPlay?.click(),
    stop: stopPlayback,
  };
}
