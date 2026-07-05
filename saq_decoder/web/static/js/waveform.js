/** Reusable waveform viewer with zoom, selection, and pan */

function createWaveformPlayer(opts) {
  const wrap = document.querySelector(opts.wrap);
  const canvas = document.querySelector(opts.canvas);
  const ctx = canvas.getContext('2d');
  const timeCurrent = document.querySelector(opts.timeCurrent);
  const timeTotal = document.querySelector(opts.timeTotal);
  const viewRangeEl = opts.viewRange ? document.querySelector(opts.viewRange) : null;
  const selectionInfo = opts.selectionInfo ? document.querySelector(opts.selectionInfo) : null;
  const btnPlay = opts.btnPlay ? document.querySelector(opts.btnPlay) : null;
  const btnPlaySel = opts.btnPlaySel ? document.querySelector(opts.btnPlaySel) : null;
  const btnClearSel = opts.btnClearSel ? document.querySelector(opts.btnClearSel) : null;
  const btnZoomIn = opts.btnZoomIn ? document.querySelector(opts.btnZoomIn) : null;
  const btnZoomOut = opts.btnZoomOut ? document.querySelector(opts.btnZoomOut) : null;
  const btnZoomReset = opts.btnZoomReset ? document.querySelector(opts.btnZoomReset) : null;
  const spectrumCanvas = opts.spectrumCanvas ? document.querySelector(opts.spectrumCanvas) : null;
  const selectable = opts.selectable !== false;
  const zoomable = opts.zoomable !== false;

  let audioEl = null;
  let audioUrl = null;
  let audioBuffer = null;
  let duration = 0;
  let peaks = [];
  let detectedFreq = null;
  let spectrum = null;
  let configuredFreq = opts.initialFreq || 750;
  let selection = null;
  let viewStart = 0;
  let viewEnd = 0;
  let dragMode = null;
  let dragAnchor = 0;
  let dragOriginSel = null;
  let dragStartX = 0;
  let panAnchor = null;
  let playSelectionOnly = false;
  let rafId = null;
  let onSelectionChange = opts.onSelectionChange || (() => {});
  let onAnalysis = opts.onAnalysis || (() => {});

  const MIN_VIEW_SEC = 1.5;

  function analysisSegment() {
    if (!audioBuffer) return null;
    const channel = audioBuffer.getChannelData(0);
    if (hasSelection()) {
      const i0 = Math.floor(selection.start * audioBuffer.sampleRate);
      const i1 = Math.floor(selection.end * audioBuffer.sampleRate);
      return channel.subarray(i0, Math.max(i1, i0 + 1));
    }
    return channel;
  }

  function runAnalysis() {
    if (!audioBuffer || typeof AudioAnalysis === 'undefined') return;
    const seg = analysisSegment();
    const sr = audioBuffer.sampleRate;
    detectedFreq = AudioAnalysis.detectToneFreq(seg, sr);
    const center = configuredFreq || detectedFreq || 750;
    spectrum = AudioAnalysis.computeSpectrum(seg, sr, center, 400);
    if (spectrumCanvas) {
      AudioAnalysis.drawSpectrum(spectrumCanvas, spectrum, {
        detected: detectedFreq,
        configured: configuredFreq,
      });
    }
    onAnalysis({ detectedFreq, spectrum, sampleRate: sr });
  }

  function drawSpectrumFromServer(data) {
    if (data.detected_freq != null) detectedFreq = data.detected_freq;
    if (data.spectrum && spectrumCanvas) {
      spectrum = data.spectrum;
      AudioAnalysis.drawSpectrum(spectrumCanvas, spectrum, {
        detected: detectedFreq,
        configured: configuredFreq,
      });
    }
  }

  function viewDuration() {
    return Math.max(MIN_VIEW_SEC, viewEnd - viewStart);
  }

  function resetView() {
    viewStart = 0;
    viewEnd = duration || 0;
    updateViewLabel();
  }

  function updateViewLabel() {
    if (!viewRangeEl || !duration) return;
    if (viewStart <= 0.01 && viewEnd >= duration - 0.01) {
      viewRangeEl.textContent = 'Gesamtansicht';
    } else {
      viewRangeEl.textContent =
        App.fmtTime(viewStart) + ' \u2013 ' + App.fmtTime(viewEnd) +
        ' von ' + App.fmtTime(duration);
    }
  }

  function xFromTime(t) {
    const w = canvas.clientWidth;
    const vd = viewDuration();
    if (!w || !vd) return 0;
    return ((t - viewStart) / vd) * w;
  }

  function timeFromX(x) {
    const w = canvas.clientWidth;
    const vd = viewDuration();
    if (!w || !duration) return 0;
    return App.clamp(viewStart + (x / w) * vd, 0, duration);
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
    const t = audioEl.currentTime;
    if (zoomable && (t < viewStart || t > viewEnd)) {
      const vd = viewDuration();
      viewStart = App.clamp(t - vd * 0.25, 0, Math.max(0, duration - vd));
      viewEnd = Math.min(duration, viewStart + vd);
      updateViewLabel();
    }
    if (timeCurrent) timeCurrent.textContent = App.fmtTime(t);
    drawWaveform(t);
    rafId = requestAnimationFrame(tickPlayhead);
  }

  function peakIndexForTime(t) {
    if (!peaks.length || !duration) return 0;
    return App.clamp(Math.floor((t / duration) * (peaks.length - 1)), 0, peaks.length - 1);
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

    if (peaks.length && duration) {
      const i0 = peakIndexForTime(viewStart);
      const i1 = Math.max(i0 + 1, peakIndexForTime(viewEnd));
      ctx.beginPath();
      ctx.moveTo(0, mid);
      for (let i = i0; i <= i1; i++) {
        const t = (i / (peaks.length - 1)) * duration;
        const x = xFromTime(t);
        ctx.lineTo(x, mid - peaks[i] * amp);
      }
      for (let i = i1; i >= i0; i--) {
        const t = (i / (peaks.length - 1)) * duration;
        const x = xFromTime(t);
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
      if (px >= 0 && px <= w) {
        ctx.strokeStyle = '#3dd68c';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, h);
        ctx.stroke();
      }
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

  function zoomAt(factor, centerTime) {
    if (!duration || !zoomable) return;
    const vd = viewDuration();
    const center = centerTime ?? viewStart + vd / 2;
    const newVd = App.clamp(vd * factor, MIN_VIEW_SEC, duration);
    viewStart = App.clamp(center - newVd / 2, 0, duration - newVd);
    viewEnd = viewStart + newVd;
    updateViewLabel();
    drawWaveform(audioEl && !audioEl.paused ? audioEl.currentTime : null);
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
    audioBuffer = null;
    detectedFreq = null;
    spectrum = null;
    selection = null;
    viewStart = 0;
    viewEnd = 0;
    if (timeCurrent) timeCurrent.textContent = App.fmtTime(0);
    if (timeTotal) timeTotal.textContent = App.fmtTime(0);
    updateViewLabel();
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

    audioBuffer = buffer;
    duration = buffer.duration;
    peaks = computePeaks(buffer, 2400);
    viewStart = 0;
    viewEnd = duration;
    if (timeTotal) timeTotal.textContent = App.fmtTime(duration);
    if (timeCurrent) timeCurrent.textContent = App.fmtTime(0);
    selection = null;
    updateViewLabel();
    notifySelection();
    drawWaveform();
    runAnalysis();

    return {
      duration: buffer.duration,
      sampleRate: buffer.sampleRate,
      channels: buffer.numberOfChannels,
      detectedFreq,
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

  if (selectable || zoomable) {
    wrap.addEventListener('pointerdown', (e) => {
      if (!duration) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;

      if (e.shiftKey && zoomable) {
        e.preventDefault();
        dragMode = 'pan';
        panAnchor = { x, viewStart };
        wrap.setPointerCapture(e.pointerId);
        return;
      }

      if (!selectable) return;
      e.preventDefault();
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

      if (dragMode === 'pan' && panAnchor && zoomable) {
        const vd = viewDuration();
        const dx = x - panAnchor.x;
        const dt = -(dx / canvas.clientWidth) * vd;
        viewStart = App.clamp(panAnchor.viewStart + dt, 0, duration - vd);
        viewEnd = viewStart + vd;
        updateViewLabel();
        drawWaveform();
        return;
      }

      if (!selectable) return;
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
      const mode = dragMode;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      if (mode === 'new' && Math.abs(x - dragStartX) < 4) {
        if (audioEl) {
          audioEl.currentTime = timeFromX(x);
          if (timeCurrent) timeCurrent.textContent = App.fmtTime(audioEl.currentTime);
        }
        selection = null;
      }
      dragMode = null;
      dragOriginSel = null;
      panAnchor = null;
      notifySelection();
      if (mode !== 'pan') runAnalysis();
    });

    if (zoomable) {
      wrap.addEventListener('wheel', (e) => {
        if (!duration) return;
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const center = timeFromX(x);
        zoomAt(e.deltaY > 0 ? 1.2 : 0.83, center);
      }, { passive: false });
    }
  }

  btnZoomIn?.addEventListener('click', () => zoomAt(0.75));
  btnZoomOut?.addEventListener('click', () => zoomAt(1.35));
  btnZoomReset?.addEventListener('click', () => {
    resetView();
    drawWaveform();
  });

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

  window.addEventListener('resize', () => {
    drawWaveform();
    if (spectrum && spectrumCanvas) {
      AudioAnalysis.drawSpectrum(spectrumCanvas, spectrum, {
        detected: detectedFreq,
        configured: configuredFreq,
      });
    }
  });

  return {
    cleanup,
    loadFromFile,
    loadFromBlob,
    drawWaveform,
    hasSelection,
    getSelection: () => (hasSelection() ? { ...selection } : null),
    getDetectedFreq: () => detectedFreq,
    setConfiguredFreq(hz) {
      configuredFreq = hz;
      runAnalysis();
    },
    runAnalysis,
    drawSpectrumFromServer,
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
    resetView,
    zoomToSelection() {
      if (!hasSelection()) return;
      viewStart = selection.start;
      viewEnd = selection.end;
      updateViewLabel();
      drawWaveform();
    },
    play: () => btnPlay?.click(),
    stop: stopPlayback,
  };
}

/** Drag & drop helper for WAV files */
function bindFileDrop(zoneEl, inputEl, onFile) {
  if (!zoneEl || !inputEl) return;

  const highlight = (on) => zoneEl.classList.toggle('drop-active', on);

  zoneEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    highlight(true);
  });
  zoneEl.addEventListener('dragleave', () => highlight(false));
  zoneEl.addEventListener('drop', (e) => {
    e.preventDefault();
    highlight(false);
    const file = [...(e.dataTransfer?.files || [])].find((f) =>
      f.name.toLowerCase().endsWith('.wav') || f.type.includes('wav'));
    if (file) {
      const dt = new DataTransfer();
      dt.items.add(file);
      inputEl.files = dt.files;
      onFile(file);
    }
  });
}
