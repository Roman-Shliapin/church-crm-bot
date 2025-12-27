// Middleware для логування запитів та підозрілих дій
import { logInfo, logWarning, logSecurity } from "../utils/logger.js";
import { isAdmin } from "./admin.js";

/**
 * Middleware для логування всіх запитів
 */
export function loggingMiddleware(ctx, next) {
  const userId = ctx.from?.id;
  const username = ctx.from?.username || "unknown";
  const firstName = ctx.from?.first_name || "unknown";
  const command = ctx.message?.text || ctx.callbackQuery?.data || "unknown";

  // Логуємо всі запити
  logInfo("Bot request", {
    userId,
    username,
    firstName,
    command: command.substring(0, 50), // Обмежуємо довжину
  });

  return next();
}

/**
 * Middleware для логування підозрілих дій
 */
export function securityLoggingMiddleware(ctx, next) {
  const userId = ctx.from?.id;
  const command = ctx.message?.text || ctx.callbackQuery?.data || "";

  // Логуємо спроби доступу до адмінівських команд
  const adminCommands = ["/members", "/needs", "/prayers", "/announce"];
  const isAdminCommand = adminCommands.some((cmd) => command.startsWith(cmd));

  if (isAdminCommand && !isAdmin(userId)) {
    logSecurity(userId, `Unauthorized access attempt to: ${command}`);
    logWarning(`User ${userId} attempted to access admin command: ${command}`);
  }

  return next();
}

