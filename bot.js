// Головний файл бота - точка входу
import { Telegraf, session } from "telegraf";
import dotenv from "dotenv";
import http from "http";

// Завантаження змінних оточення
dotenv.config();

// Імпорт обробників команд
import { handleStart, handleHelp } from "./handlers/commands.js";
import { handleRegisterStart, handleRegisterSteps } from "./handlers/register.js";
import { handleMe, handleMembers, handleMembersShowChat, handleMembersShowExcel } from "./handlers/members.js";
import { handleNeedStart, handleNeedSteps, handleNeedsList, handleNeedsShowChat, handleNeedsShowExcel, handleNeedStatusChange } from "./handlers/needs.js";
import { handlePrayStart, handlePraySteps, handlePrayersList, handlePrayersShowChat, handlePrayersShowExcel } from "./handlers/prayers.js";
import { handleLessons, handleLessonSelection, handleLessonCallback } from "./handlers/lessons.js";
import { handleUploadLessonStart, handleUploadLessonName, handleUploadLessonFile } from "./handlers/lessonsAdmin.js";
import { handleContact } from "./handlers/contact.js";
import { handleAnnounceStart, handleAnnounceText } from "./handlers/announce.js";

// Імпорт middleware
import { checkAdmin } from "./middlewares/admin.js";

// Імпорт сервісів
import { updateNeedStatuses } from "./services/statusUpdater.js";
import { STATUS_UPDATE_INTERVAL } from "./config/constants.js";
import { connectToDatabase, closeDatabase } from "./services/database.js";

// Ініціалізація бота
// ⚠️ ВАЖЛИВО: Створіть .env файл з BOT_TOKEN та ADMIN_IDS для безпеки!
const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error("❌ ПОМИЛКА: BOT_TOKEN не встановлено в .env файлі!");
  console.error("Створіть файл .env з наступним вмістом:");
  console.error("BOT_TOKEN=ваш_токен_бота");
  console.error("ADMIN_IDS=id1,id2");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// Використання session middleware для покрокових діалогів
bot.use(session());

// Логування middleware
import { loggingMiddleware, securityLoggingMiddleware } from "./middlewares/logging.js";
import { logInfo, logError, cleanupOldLogs } from "./utils/logger.js";
bot.use(loggingMiddleware);
bot.use(securityLoggingMiddleware);

// Rate limiting middleware (захист від спаму)
import { rateLimit } from "./middlewares/rateLimit.js";
bot.use(rateLimit(20, 60 * 1000)); // 20 повідомлень на хвилину

// Очищення старих логів при старті
cleanupOldLogs();

// ==================== КОМАНДИ ====================
// /start - привітання
bot.start(handleStart);

// /help - довідка
bot.command("help", handleHelp);

// /register - реєстрація члена церкви
bot.command("register", handleRegisterStart);

// /me - перегляд власного профілю
bot.command("me", handleMe);

// /members - список членів (тільки для адмінів)
bot.command("members", checkAdmin, handleMembers);

// /need - подати заявку на допомогу
bot.command("need", handleNeedStart);

// /needs - список заявок (тільки для адмінів)
bot.command("needs", checkAdmin, handleNeedsList);

// /pray - додати молитвенну потребу
bot.command("pray", handlePrayStart);

// /prayers - список молитвенних потреб (тільки для адмінів)
bot.command("prayers", checkAdmin, handlePrayersList);

// /lessons - отримати біблійний урок
bot.command("lessons", handleLessons);

// /contact - контакти служителів
bot.command("contacts", handleContact);

// /announce - зробити оголошення (тільки для адмінів)
bot.command("announce", checkAdmin, handleAnnounceStart);

// /upload_lesson - завантажити PDF урок (тільки для адмінів)
bot.command("upload_lesson", checkAdmin, handleUploadLessonStart);

// ==================== ОБРОБКА ТЕКСТОВИХ ПОВІДОМЛЕНЬ ====================

bot.on("text", async (ctx, next) => {
  const msg = ctx.message.text.trim();

  // Спробуємо обробити кроки реєстрації
  if (await handleRegisterSteps(ctx, msg)) {
    return;
  }

  // Спробуємо обробити кроки створення заявки
  if (await handleNeedSteps(ctx, msg)) {
    return;
  }

  // Спробуємо обробити кроки додавання молитвенної потреби
  if (await handlePraySteps(ctx, msg)) {
    return;
  }

  // Спробуємо обробити назву уроку для завантаження PDF (адмін)
  if (await handleUploadLessonName(ctx, msg)) {
    return;
  }

  // Спробуємо обробити вибір уроку (користувач)
  if (await handleLessonSelection(ctx, msg)) {
    return;
  }

  // Спробуємо обробити текст оголошення
  if (await handleAnnounceText(ctx, msg)) {
    return;
  }

  // Якщо нічого не підійшло - передаємо далі
  return next();
});

// ==================== ОБРОБКА CALLBACK КНОПОК ====================

// Зміна статусу заявки
bot.action(/status_(\d+)_(\w+)/, handleNeedStatusChange);

// Вибір формату для заявок
bot.action("needs_show_chat", handleNeedsShowChat);
bot.action("needs_show_excel", handleNeedsShowExcel);

// Вибір формату для молитв
bot.action("prayers_show_chat", handlePrayersShowChat);
bot.action("prayers_show_excel", handlePrayersShowExcel);

// Вибір формату для списку членів
bot.action("members_show_chat", handleMembersShowChat);
bot.action("members_show_excel", handleMembersShowExcel);

// Вибір уроку
bot.action(/lesson_(\d+)/, handleLessonCallback);

// ==================== ОБРОБКА ДОКУМЕНТІВ ====================

// Завантаження PDF для уроків (тільки для адмінів)
bot.on("document", async (ctx, next) => {
  // Перевіряємо, чи це адмінська сесія завантаження уроку
  if (ctx.session?.step === "upload_lesson_file") {
    const result = await handleUploadLessonFile(ctx);
    if (result) {
      return; // Обробили документ
    }
  }
  return next();
});

// ==================== АВТОМАТИЧНІ ЗАВДАННЯ ====================

// Оновлення статусів заявок кожні 10 хвилин
setInterval(() => {
  updateNeedStatuses().catch((err) => {
    logError("Помилка при автоматичному оновленні статусів", err);
  });
}, STATUS_UPDATE_INTERVAL * 60 * 1000);

// ==================== ЗАПУСК БОТА ====================

// Підключення до MongoDB перед запуском бота
(async () => {
  try {
    await connectToDatabase();
    logInfo("Підключено до MongoDB", {});
    
    // Запуск HTTP сервера для Render (має слухати на порту)
    const PORT = process.env.PORT || 3000;
    const server = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Bot is running");
    });
    
    server.listen(PORT, () => {
      console.log(`✅ HTTP сервер слухає на порту ${PORT}`);
      logInfo(`HTTP сервер слухає на порту ${PORT}`, {});
    });
    
    bot.launch().then(async () => {
      logInfo("Bot запущено і він слухає команди...");
      console.log("✅ Bot запущено і він слухає команди...");

      // Налаштування меню команд (тільки для звичайних користувачів)
      try {
        const { regularUserCommands } = await import("./utils/botMenu.js");
        await bot.telegram.setMyCommands(regularUserCommands);
        logInfo("Меню команд бота налаштовано");
      } catch (err) {
        logError("Помилка налаштування меню команд", err);
        // Не критична помилка, продовжуємо роботу
      }
    }).catch((err) => {
      logError("Помилка запуску бота", err);
      console.error("❌ Помилка запуску бота:", err);
      process.exit(1);
    });
  } catch (err) {
    logError("Помилка підключення до MongoDB", err);
    console.error("❌ Помилка підключення до MongoDB:", err);
    process.exit(1);
  }
})();

// Graceful shutdown
process.once("SIGINT", async () => {
  logInfo("Bot зупиняється (SIGINT)");
  bot.stop("SIGINT");
  await closeDatabase();
  process.exit(0);
});
process.once("SIGTERM", async () => {
  logInfo("Bot зупиняється (SIGTERM)");
  bot.stop("SIGTERM");
  await closeDatabase();
  process.exit(0);
});
