import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logDir = path.join(__dirname, '../logs');

// Create logs directory if not exists
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const getTimestamp = () => new Date().toISOString();

const getLogFile = (filename) => path.join(logDir, filename);

const writeLog = (filename, level, message, data = null) => {
  const logEntry = {
    timestamp: getTimestamp(),
    level,
    message,
    ...(data && { data }),
  };

  const logLine = JSON.stringify(logEntry) + '\n';

  // Write to file
  fs.appendFileSync(getLogFile(filename), logLine, 'utf8');

  // Also print to console
  console.log(`[${logEntry.timestamp}] [${level}] ${message}`, data || '');
};

// ── Named loggers ──────────────────────────────────────────

export const webhookLogger = {
  info:  (msg, data) => writeLog('webhook.log',  'INFO',  msg, data),
  error: (msg, data) => writeLog('webhook.log',  'ERROR', msg, data),
  warn:  (msg, data) => writeLog('webhook.log',  'WARN',  msg, data),
};

export const authLogger = {
  info:  (msg, data) => writeLog('auth.log',  'INFO',  msg, data),
  error: (msg, data) => writeLog('auth.log',  'ERROR', msg, data),
  warn:  (msg, data) => writeLog('auth.log',  'WARN',  msg, data),
};

export const socketLogger = {
  info:  (msg, data) => writeLog('socket.log',  'INFO',  msg, data),
  error: (msg, data) => writeLog('socket.log',  'ERROR', msg, data),
  warn:  (msg, data) => writeLog('socket.log',  'WARN',  msg, data),
};

export const appLogger = {
  info:  (msg, data) => writeLog('app.log',  'INFO',  msg, data),
  error: (msg, data) => writeLog('app.log',  'ERROR', msg, data),
  warn:  (msg, data) => writeLog('app.log',  'WARN',  msg, data),
};