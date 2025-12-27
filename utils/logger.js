// Система логування для відстеження подій та помилок
import fs from "fs";
import path from "path";

const LOG_DIR = "logs";
const LOG_FILE = path.join(LOG_DIR, `bot-${new Date().toISOString().split("T")[0]}.log`);
const ERROR_LOG_FILE = path.join(LOG_DIR, `errors-${new Date().toISOString().split("T")[0]}.log`);

// Створюємо директорію для логів, якщо її немає
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * Форматує повідомлення логу з timestamp
 */
function formatLogMessage(level, message, data = null) {
  const timestamp = new Date().toISOString();
  let logMessage = `[${timestamp}] [${level}] ${message}`;
  
  if (data) {
    logMessage += ` | Data: ${JSON.stringify(data)}`;
  }
  
  return logMessage + "\n";
}

/**
 * Записує повідомлення в файл
 */
function writeToFile(filePath, message) {
  try {
    fs.appendFileSync(filePath, message, "utf8");
  } catch (err) {
    console.error("Помилка запису в лог файл:", err);
  }
}

/**
 * Логування загальної інформації
 */
export function logInfo(message, data = null) {
  const logMessage = formatLogMessage("INFO", message, data);
  console.log(logMessage.trim());
  writeToFile(LOG_FILE, logMessage);
}

/**
 * Логування попереджень
 */
export function logWarning(message, data = null) {
  const logMessage = formatLogMessage("WARNING", message, data);
  console.warn(logMessage.trim());
  writeToFile(LOG_FILE, logMessage);
  writeToFile(ERROR_LOG_FILE, logMessage);
}

/**
 * Логування помилок
 */
export function logError(message, error = null, data = null) {
  const errorData = error ? {
    message: error.message,
    stack: error.stack,
    ...data,
  } : data;
  
  const logMessage = formatLogMessage("ERROR", message, errorData);
  console.error(logMessage.trim());
  writeToFile(LOG_FILE, logMessage);
  writeToFile(ERROR_LOG_FILE, logMessage);
}

/**
 * Логування підозрілих дій (безпека)
 */
export function logSecurity(userId, action, details = null) {
  const message = `Security event: User ${userId} performed action: ${action}`;
  const logMessage = formatLogMessage("SECURITY", message, {
    userId,
    action,
    details,
  });
  console.warn(logMessage.trim());
  writeToFile(LOG_FILE, logMessage);
  writeToFile(ERROR_LOG_FILE, logMessage);
}

/**
 * Логування успішних операцій
 */
export function logSuccess(message, data = null) {
  const logMessage = formatLogMessage("SUCCESS", message, data);
  console.log(logMessage.trim());
  writeToFile(LOG_FILE, logMessage);
}

/**
 * Очищення старих лог файлів (старіші за 30 днів)
 */
export function cleanupOldLogs() {
  try {
    if (!fs.existsSync(LOG_DIR)) return;
    
    const files = fs.readdirSync(LOG_DIR);
    const now = Date.now();
    const thirtyDaysAgo = 30 * 24 * 60 * 60 * 1000;
    
    files.forEach((file) => {
      const filePath = path.join(LOG_DIR, file);
      const stats = fs.statSync(filePath);
      
      if (now - stats.mtimeMs > thirtyDaysAgo) {
        fs.unlinkSync(filePath);
        logInfo(`Deleted old log file: ${file}`);
      }
    });
  } catch (err) {
    logError("Помилка очищення старих логів", err);
  }
}

