// Local file logger for TalKing desktop (step 10)
// Writes rotating logs to <userData>/logs/talking.log (+ .1 .2 .3 .4)
// Rotates at 1 MB, keeps 5 files (~5 MB max on disk).
// Also mirrors to stdout so `talking.exe` launched from a terminal still shows output.

const fs = require('fs');
const path = require('path');

const MAX_BYTES = 1024 * 1024; // 1 MB
const MAX_FILES = 5;

let logDir = null;
let logFile = null;
let stream = null;
let initialized = false;

function ts() {
  const d = new Date();
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function safeStringify(v) {
  if (v instanceof Error) return v.stack || `${v.name}: ${v.message}`;
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch { return String(v); }
}

function openStream() {
  try {
    stream = fs.createWriteStream(logFile, { flags: 'a' });
    stream.on('error', (e) => { try { process.stderr.write(`[logger] stream error: ${e.message}\n`); } catch {} });
  } catch (e) {
    stream = null;
  }
}

function rotateIfNeeded() {
  try {
    if (!logFile) return;
    let size = 0;
    try { size = fs.statSync(logFile).size; } catch { return; }
    if (size < MAX_BYTES) return;
    try { stream && stream.end(); } catch {}
    stream = null;
    for (let i = MAX_FILES - 1; i >= 1; i--) {
      const src = i === 1 ? logFile : `${logFile}.${i - 1}`;
      const dst = `${logFile}.${i}`;
      if (fs.existsSync(src)) {
        try { fs.renameSync(src, dst); } catch {}
      }
    }
    openStream();
  } catch {}
}

function writeLine(level, args) {
  const line = `[${ts()}] [${level}] ${args.map(safeStringify).join(' ')}\n`;
  try { process.stdout.write(line); } catch {}
  if (!stream) return;
  try {
    stream.write(line);
    rotateIfNeeded();
  } catch {}
}

function init(userDataPath) {
  if (initialized) return { logDir, logFile };
  initialized = true;
  logDir = path.join(userDataPath, 'logs');
  try { fs.mkdirSync(logDir, { recursive: true }); } catch {}
  logFile = path.join(logDir, 'talking.log');
  openStream();

  const origLog = console.log.bind(console);
  const origWarn = console.warn.bind(console);
  const origErr = console.error.bind(console);
  console.log = (...a) => { writeLine('INFO', a); origLog(...a); };
  console.warn = (...a) => { writeLine('WARN', a); origWarn(...a); };
  console.error = (...a) => { writeLine('ERROR', a); origErr(...a); };

  process.on('uncaughtException', (e) => writeLine('FATAL', ['uncaughtException', e]));
  process.on('unhandledRejection', (r) => writeLine('FATAL', ['unhandledRejection', r]));

  writeLine('INFO', ['--- TalKing session start ---']);
  writeLine('INFO', [`platform=${process.platform} arch=${process.arch} node=${process.versions.node} electron=${process.versions.electron}`]);
  writeLine('INFO', [`logFile=${logFile}`]);
  return { logDir, logFile };
}

function attachRenderer(webContents) {
  try {
    webContents.on('console-message', (_e, level, message, line, sourceId) => {
      const lvl = ['DEBUG', 'INFO', 'WARN', 'ERROR'][level] || 'INFO';
      writeLine(`RENDERER/${lvl}`, [`${message} (${sourceId}:${line})`]);
    });
    webContents.on('render-process-gone', (_e, details) => {
      writeLine('FATAL', ['render-process-gone', details]);
    });
    webContents.on('unresponsive', () => writeLine('WARN', ['renderer unresponsive']));
  } catch {}
}

function getPaths() { return { logDir, logFile }; }

module.exports = { init, attachRenderer, getPaths, log: (...a) => writeLine('INFO', a), warn: (...a) => writeLine('WARN', a), error: (...a) => writeLine('ERROR', a) };
