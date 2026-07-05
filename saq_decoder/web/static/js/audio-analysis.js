/** Client-side tone detection and spectrum analysis (mirrors server logic) */

const AudioAnalysis = {
  detectToneFreq(channelData, sampleRate, lo = 400, hi = 1200, step = 5) {
    const maxSamples = Math.min(channelData.length, Math.floor(20 * sampleRate));
    const seg = channelData.subarray(0, maxSamples);
    if (seg.length < sampleRate / 10) return 750;

    let bestF = 750;
    let bestP = 0;
    for (let f = lo; f < hi; f += step) {
      let p = 0;
      for (let i = 0; i < seg.length; i++) {
        p += seg[i] * Math.sin((2 * Math.PI * f * i) / sampleRate);
      }
      p = Math.abs(p);
      if (p > bestP) {
        bestP = p;
        bestF = f;
      }
    }
    return bestF;
  },

  computeSpectrum(channelData, sampleRate, centerHz, spanHz = 400, points = 128) {
    const n = Math.min(channelData.length, Math.floor(15 * sampleRate));
    const seg = channelData.subarray(0, Math.max(n, 64));
    const len = seg.length;

    const windowed = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      windowed[i] = seg[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (len - 1 || 1)));
    }

    const fftSize = 1 << Math.ceil(Math.log2(len));
    const re = new Float32Array(fftSize);
    const im = new Float32Array(fftSize);
    for (let i = 0; i < len; i++) re[i] = windowed[i];

    this._fft(re, im);

    const binHz = sampleRate / fftSize;
    const lo = Math.max(0, centerHz - spanHz / 2);
    const hi = centerHz + spanHz / 2;
    const frequencies = [];
    const magnitudes = [];

    let maxMag = 0;
    const mags = [];
    for (let b = 0; b < fftSize / 2; b++) {
      const freq = b * binHz;
      const mag = Math.sqrt(re[b] * re[b] + im[b] * im[b]);
      mags.push({ freq, mag });
      maxMag = Math.max(maxMag, mag);
    }

    for (let i = 0; i < points; i++) {
      const f = lo + (i / (points - 1)) * (hi - lo);
      let mag = 0;
      for (const bin of mags) {
        if (Math.abs(bin.freq - f) < binHz * 1.5) {
          mag = Math.max(mag, bin.mag);
        }
      }
      frequencies.push(Math.round(f * 10) / 10);
      magnitudes.push(maxMag > 0 ? mag / maxMag : 0);
    }

    return { center_hz: centerHz, span_hz: spanHz, frequencies, magnitudes };
  },

  _fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        [re[i], re[j]] = [re[j], re[i]];
        [im[i], im[j]] = [im[j], im[i]];
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (-2 * Math.PI) / len;
      const wlenRe = Math.cos(ang);
      const wlenIm = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let wRe = 1;
        let wIm = 0;
        for (let j = 0; j < len / 2; j++) {
          const uRe = re[i + j];
          const uIm = im[i + j];
          const vRe = re[i + j + len / 2] * wRe - im[i + j + len / 2] * wIm;
          const vIm = re[i + j + len / 2] * wIm + im[i + j + len / 2] * wRe;
          re[i + j] = uRe + vRe;
          im[i + j] = uIm + vIm;
          re[i + j + len / 2] = uRe - vRe;
          im[i + j + len / 2] = uIm - vIm;
          const nextWRe = wRe * wlenRe - wIm * wlenIm;
          wIm = wRe * wlenIm + wIm * wlenRe;
          wRe = nextWRe;
        }
      }
    }
  },

  drawSpectrum(canvas, spectrum, markers = {}) {
    const ctx = canvas.getContext('2d');
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h || !spectrum?.frequencies?.length) return;

    if (canvas.width !== w * devicePixelRatio || canvas.height !== h * devicePixelRatio) {
      canvas.width = w * devicePixelRatio;
      canvas.height = h * devicePixelRatio;
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    }

    const { frequencies, magnitudes, center_hz, span_hz } = spectrum;
    const lo = center_hz - span_hz / 2;
    const hi = center_hz + span_hz / 2;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0a0e14';
    ctx.fillRect(0, 0, w, h);

    const pad = 4;
    const plotH = h - 18;

    ctx.beginPath();
    for (let i = 0; i < frequencies.length; i++) {
      const x = pad + ((frequencies[i] - lo) / (hi - lo)) * (w - pad * 2);
      const y = plotH - magnitudes[i] * (plotH - pad) + pad;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#a78bfa';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.lineTo(pad + ((frequencies[frequencies.length - 1] - lo) / (hi - lo)) * (w - pad * 2), plotH + pad);
    ctx.lineTo(pad + ((frequencies[0] - lo) / (hi - lo)) * (w - pad * 2), plotH + pad);
    ctx.closePath();
    ctx.fillStyle = 'rgba(167, 139, 250, 0.2)';
    ctx.fill();

    const drawMarker = (freq, color, label) => {
      if (freq == null || freq < lo || freq > hi) return;
      const x = pad + ((freq - lo) / (hi - lo)) * (w - pad * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash(label.includes('Einst') ? [4, 3] : []);
      ctx.beginPath();
      ctx.moveTo(x, pad);
      ctx.lineTo(x, plotH + pad);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.font = '10px system-ui,sans-serif';
      ctx.fillText(label, Math.min(x + 2, w - 40), pad + 10);
    };

    if (markers.detected != null) {
      drawMarker(markers.detected, '#3dd68c', markers.detected + ' Hz');
    }
    if (markers.configured != null && markers.configured !== markers.detected) {
      drawMarker(markers.configured, '#3d8bfd', markers.configured + ' Hz');
    }

    ctx.fillStyle = '#8b9cb3';
    ctx.font = '10px system-ui,sans-serif';
    ctx.fillText(Math.round(lo) + ' Hz', pad, h - 2);
    ctx.fillText(Math.round(hi) + ' Hz', w - pad - 32, h - 2);
    ctx.fillText(Math.round(center_hz) + ' Hz', w / 2 - 16, h - 2);
  },
};
