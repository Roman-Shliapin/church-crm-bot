// Middleware для перевірки прав адміністратора
import { ADMIN_IDS } from "../config/constants.js";
import { logSecurity } from "../utils/logger.js";

/**
 * Middleware для перевірки, чи є користувач адміністратором
 * @param {Object} ctx - Контекст Telegraf
 * @param {Function} next - Наступний middleware
 * @returns {Promise}
 */
export function checkAdmin(ctx, next) {
  const userId = ctx.from?.id;
  if (ADMIN_IDS.includes(userId)) {
    return next();
  }
  // Логуємо спробу неавторизованого доступу
  logSecurity(userId, "Unauthorized admin command access attempt", {
    command: ctx.message?.text || ctx.callbackQuery?.data,
  });
  return ctx.reply("⛔ Ця команда доступна лише служителям.");
}

/**
 * Перевіряє, чи є користувач адміністратором
 * @param {number} userId - Telegram ID користувача
 * @returns {boolean}
 */
export function isAdmin(userId) {
  return ADMIN_IDS.includes(userId);
}

