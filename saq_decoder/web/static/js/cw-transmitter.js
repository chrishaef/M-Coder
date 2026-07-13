/** Live CW output via Web Audio API (matches server morse timing) */

const MORSE_TABLE = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....',
  I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.',
  Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-',
  Y: '-.--', Z: '--..', '0': '-----', '1': '.----', '2': '..---', '3': '...--',
  '4': '....-', '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.',
  '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.', '/': '-..-.',
  '(': '-.--.', ')': '-.--.-', '&': '.-...', ':': '---...', ';': '-.-.-.',
  '!': '-.-.--', '-': '-....-', '_': '..--.-', '"': '.-..-.', '$': '...-..-',
  '@': '.--.-.',
};

function createLiveCwTransmitter() {
  let ctx = null;
  let nextTime = 0;
  let prevWasChar = false;
  let active = false;

  function unitSec(wpm) {
    return 1.2 / wpm;
  }

  function ensureContext() {
    if (!ctx || ctx.state === 'closed') {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      nextTime = 0;
    }
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    return ctx;
  }

  function baseTime() {
    const audioCtx = ensureContext();
    const now = audioCtx.currentTime + 0.03;
    if (nextTime < now) nextTime = now;
    return nextTime;
  }

  function scheduleGap(seconds) {
    if (seconds <= 0) return;
    nextTime += seconds;
  }

  function scheduleTone(duration, freq) {
    const audioCtx = ensureContext();
    const start = baseTime();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const peak = 0.82;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(peak, start + 0.003);
    gain.gain.setValueAtTime(peak, start + duration - 0.003);
    gain.gain.linearRampToValueAtTime(0, start + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.005);
    nextTime = start + duration;
  }

  function sendChar(ch, settings) {
    const unit = unitSec(settings.wpm);
    const upper = ch.toUpperCase();

    if (upper === ' ' || upper === '\n' || upper === '\t') {
      if (prevWasChar) scheduleGap(7 * unit);
      prevWasChar = false;
      return true;
    }

    const pattern = MORSE_TABLE[upper];
    if (!pattern) return false;

    if (prevWasChar) scheduleGap(3 * unit);

    for (let i = 0; i < pattern.length; i++) {
      if (i > 0) scheduleGap(unit);
      const sym = pattern[i];
      scheduleTone(sym === '.' ? unit : 3 * unit, settings.freq);
    }
    prevWasChar = true;
    return true;
  }

  return {
    isActive() {
      return active;
    },

    getSettingsFromDom() {
      return {
        freq: parseInt(document.getElementById('transmit-freq')?.value, 10) || 750,
        wpm: parseFloat(document.getElementById('transmit-wpm')?.value) || 20,
      };
    },

    sendText(text) {
      if (!text) return 0;
      active = true;
      const settings = this.getSettingsFromDom();
      let sent = 0;
      for (const ch of text) {
        if (sendChar(ch, settings)) sent += 1;
      }
      return sent;
    },

    resetState() {
      prevWasChar = false;
      if (ctx && ctx.state !== 'closed') {
        nextTime = ctx.currentTime + 0.03;
      } else {
        nextTime = 0;
      }
    },

    stop() {
      active = false;
      prevWasChar = false;
      nextTime = 0;
      if (ctx) {
        ctx.close().catch(() => {});
        ctx = null;
      }
    },

    remainingSeconds() {
      if (!ctx || ctx.state === 'closed') return 0;
      return Math.max(0, nextTime - ctx.currentTime);
    },
  };
}
