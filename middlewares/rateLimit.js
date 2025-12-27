// Middleware для rate limiting (захист від спаму)
import { logWarning, logSecurity } from "../utils/logger.js";

// Мапа для зберігання кількості запитів від кожного користувача
const userRequests = new Map();

// Очищення старих записів кожні 5 хвилин
setInterval(() => {
  const now = Date.now();
  for (const [userId, data] of userRequests.entries()) {
    if (now - data.resetTime > 0) {
      userRequests.delete(userId);
    }
  }
}, 5 * 60 * 1000);

/**
 * Rate limiting middleware
 * Обмежує кількість повідомлень від одного користувача
 * @param {number} maxRequests - Максимальна кількість запитів (за замовчуванням 20)
 * @param {number} windowMs - Вікно часу в мілісекундах (за замовчуванням 1 хвилина)
 * @returns {Function} Middleware функція
 */
export function rateLimit(maxRequests = 20, windowMs = 60 * 1000) {
  return (ctx, next) => {
    const userId = ctx.from?.id;
    
    if (!userId) {
      return next();
    }

    const now = Date.now();
    const userData = userRequests.get(userId);

    if (!userData || now > userData.resetTime) {
      // Перший запит або вікно минуло
      userRequests.set(userId, {
        count: 1,
        resetTime: now + windowMs,
      });
      return next();
    }

    if (userData.count >= maxRequests) {
      // Перевищено ліміт - логуємо як підозрілу дію
      const remainingSeconds = Math.ceil((userData.resetTime - now) / 1000);
      logSecurity(userId, "Rate limit exceeded", {
        count: userData.count,
        maxRequests,
        remainingSeconds,
      });
      return ctx.reply(
        `⏳ Ви надто часто надсилаєте повідомлення. Спробуйте через ${remainingSeconds} секунд.`
      );
    }

    // Збільшуємо лічильник
    userData.count++;
    return next();
  };
}

