// Головний файл бота - точка входу
import { Telegraf, session, Markup } from "telegraf";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Завантаження змінних оточення з папки бота, а не з cwd
dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), ".env") });

// Імпорт обробників команд
import { handleStart, handleHelp, createMainMenu, handleAdminManageNeedsMenu, handleAdminArchiveMenu } from "./handlers/commands.js";
import { handleRegisterStart, handleRegisterSteps, handleRegisterBaptismStatus, handleRegisterContinue, handleRegisterRestart } from "./handlers/register.js";
import {
  handleMe,
  handleMembers,
  handleMembersShowChat,
  handleMembersShowExcel,
  handleHumanitarianReportMenu,
  handleHumanitarianReportExcel,
  handleMemberMoveToCandidatesStart,
  handleMemberMoveToCandidatesConfirm,
  handleMemberMoveToCandidatesCancel,
  handleProfileEditMenu,
  handleProfileEditField,
  handleProfileEditCancel,
  handleProfileEditText,
} from "./handlers/members.js";
import { handleCandidates, handleCandidatesShowChat, handleCandidatesShowExcel } from "./handlers/candidates.js";
import { handleNeedStart, handleNeedTypeSelection, handleNeedHumanitarianCategorySelection, handleNeedSteps, handleNeedsList, handleNeedsShowChat, handleNeedsShowExcel, handleNeedStatusChange, handleNeedReplyStart, handleNeedReplyText, handleAdminNeedsManageList, handleAdminNeedsArchiveList, handleAdminNeedMarkDone, handleAdminNeedMarkProgress, handleAdminNeedDoneText, handleAdminNeedDelete, handleAdminNeedDeleteConfirm, handleAdminNeedDeleteCancel, handleAdminNeedsCategoryMenu, handleAdminNeedsCategoryShowChat, handleAdminNeedsCategoryShowPdf, handleAdminNeedsArchiveCategoryMenu, handleAdminNeedsArchiveCategoryShowChat, handleAdminNeedsArchiveCategoryShowPdf } from "./handlers/needs/index.js";
import { findMemberById } from "./services/storage.js";
import { handleContact, handleChurchChat, handleBackToMainMenu } from "./handlers/contact.js";
import {
  handleAnnounceStart,
  handleAnnounceAudience,
  handleAnnounceText,
  handleAnnouncePhoto,
  handleAnnounceFailedReport,
} from "./handlers/announce.js";

// Імпорт middleware
import { checkAdmin } from "./middlewares/admin.js";

// Імпорт сервісів
import { updateNeedStatuses } from "./services/statusUpdater.js";
import { STATUS_UPDATE_INTERVAL } from "./config/constants.js";
import { connectToDatabase, closeDatabase, getCollection } from "./services/database.js";

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

bot.use(async (ctx, next) => {
  if (!ctx.session) ctx.session = {};

  const saveLastBotMessage = (text) => {
    if (typeof text === "string" && ctx.session && typeof ctx.session === "object") {
      ctx.session.lastBotMessage = text;
    }
  };

  const originalReply = ctx.reply.bind(ctx);
  ctx.reply = async (text, ...args) => {
    const result = await originalReply(text, ...args);
    saveLastBotMessage(text);
    return result;
  };

  const originalReplyWithMarkdown = ctx.replyWithMarkdown.bind(ctx);
  ctx.replyWithMarkdown = async (text, ...args) => {
    const result = await originalReplyWithMarkdown(text, ...args);
    saveLastBotMessage(text);
    return result;
  };

  return next();
});

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

// Middleware: блокування незареєстрованих користувачів
bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) return next();

  const msg = ctx.message?.text?.trim();

  if (msg && (msg === "/start" || msg.startsWith("/start ") || msg === "/register")) {
    return next();
  }

  if (msg === "📝 Зареєструватися") {
    return next();
  }

  if (ctx.session?.step >= 1 && ctx.session?.step <= 6) {
    return next();
  }

  if (typeof ctx.session?.step === "string" && ctx.session.step.startsWith("profile_edit_")) {
    return next();
  }

  if (ctx.callbackQuery?.data?.startsWith("register_") || ctx.callbackQuery?.data?.startsWith("profile_edit_")) {
    return next();
  }

  try {
    const member = await findMemberById(userId);
    if (!member) {
      return ctx.reply(
        "⚠️ Щоб користуватися ботом, спочатку зареєструйтесь, натиснувши кнопку нижче.",
        Markup.keyboard([["📝 Зареєструватися"]]).resize().persistent()
      );
    }
    if (member.blocked) {
      // Дозволяємо тільки кнопку "Зв'язатися з нами"
      if (msg === "📞 Зв'язатися з нами") {
        return next();
      }
      return ctx.reply(
        "⚠️ Ваш доступ до бота обмежено.\n\nЯкщо у вас є питання, зверніться до служителя протягом 7 днів:\n\n📍 Пирогова 59А\n📅 Середа 13:00 - 14:30\n📅 Неділя о 11:00\n📞 +380 (93) 223 25 26\n👤 Олексій\n\nПісля 7 днів ваш акаунт буде видалено."
      );
    }
  } catch (err) {
    console.error("Помилка перевірки реєстрації в middleware:", err);
  }

  return next();
});

// Глобальний обробник помилок Telegraf (запобігає крашу бота)
bot.catch((err, ctx) => {
  logError("Необроблена помилка в боті", err);
  console.error("❌ Bot error:", err);
  try {
    ctx.reply("⚠️ Виникла помилка. Спробуйте ще раз.");
  } catch (e) {
    // ignore
  }
});

// ==================== КОМАНДИ ====================
// /start - привітання
bot.start(handleStart);

// /help - довідка
bot.command("help", handleHelp);

// /register - реєстрація члена церкви
bot.command("register", handleRegisterStart);

// /me - перегляд власного профілю
bot.command("me", handleMe);

// /members - список членів (тільки для адмінів, тільки хрещені)
bot.command("members", checkAdmin, handleMembers);

// /candidates - список нехрещених (тільки для адмінів)
bot.command("candidates", checkAdmin, handleCandidates);

// /need - подати заявку на допомогу
bot.command("need", handleNeedStart);

// /needs - список заявок (тільки для адмінів)
bot.command("needs", checkAdmin, handleNeedsList);

// /contact - контакти служителів
bot.command("contacts", handleContact);

// /announce - зробити оголошення (тільки для адмінів)
bot.command("announce", checkAdmin, handleAnnounceStart);

// ==================== ОБРОБКА ТЕКСТОВИХ ПОВІДОМЛЕНЬ ====================

bot.on("text", async (ctx, next) => {
  const msg = ctx.message.text.trim();

  // Обробка кнопок підтвердження відправки (адмін)
  if (typeof ctx.session?.step === "string" && ctx.session.step.endsWith("_confirm")) {
    if (msg === "✅ Відправити") {
      ctx.session.step = ctx.session.step.replace(/_confirm$/, "");
      ctx.session.data.confirmed = true;
    } else if (msg === "✏️ Переписати") {
      ctx.session.step = ctx.session.step.replace(/_confirm$/, "");
      delete ctx.session.data.pendingText;
      delete ctx.session.data.pendingPhoto;
      delete ctx.session.data.confirmed;
      return ctx.reply("✍️ Введіть повідомлення повторно:", Markup.removeKeyboard());
    } else if (msg === "❌ Скасувати") {
      ctx.session = null;
      const menu = await createMainMenu(ctx);
      return ctx.reply("❌ Відправку скасовано.", menu);
    } else {
      return ctx.reply("⚠️ Оберіть дію: ✅ Відправити, ✏️ Переписати або ❌ Скасувати.");
    }
  }

  // Обробка кнопок reply keyboard (повинно бути перед обробкою кроків)
  if (msg === "📝 Зареєструватися") {
    return handleRegisterStart(ctx);
  }
  if (msg === "👤 Мій профіль") {
    return handleMe(ctx);
  }
  if (msg === "🙏 Попросити допомогу") {
    return handleNeedStart(ctx);
  }
  if (msg === "🛠️ Керувати потребами") {
    return handleAdminManageNeedsMenu(ctx);
  }
  if (msg === "🆘 Потреби на допомогу") {
    // старий пункт (залишаємо для сумісності)
    return handleAdminNeedsManageList(ctx);
  }
  if (msg === "🥫 Продукти") {
    return handleAdminNeedsCategoryMenu(ctx, "products");
  }
  if (msg === "📊 Звіт по допомозі") {
    return handleHumanitarianReportMenu(ctx);
  }
  if (msg === "🧴 Хімія") {
    return handleAdminNeedsCategoryMenu(ctx, "chemistry");
  }
  if (msg === "💬 Інше") {
    return handleAdminNeedsCategoryMenu(ctx, "other");
  }
  if (msg === "📦 Показати виконані (архів)") {
    return handleAdminArchiveMenu(ctx);
  }
  if (msg === "🆘 Виконані заявки") {
    // legacy (залишаємо)
    return handleAdminNeedsArchiveList(ctx);
  }
  if (msg === "🥫 Виконані продукти") {
    return handleAdminNeedsArchiveCategoryMenu(ctx, "products");
  }
  if (msg === "🧴 Виконана хімія") {
    return handleAdminNeedsArchiveCategoryMenu(ctx, "chemistry");
  }
  if (msg === "💬 Виконані інше") {
    return handleAdminNeedsArchiveCategoryMenu(ctx, "other");
  }
  if (msg === "📞 Зв'язатися з нами") {
    return handleContact(ctx);
  }
  if (msg === "💬 Перейти в чат церкви") {
    return handleChurchChat(ctx);
  }
  if (
    msg === "🏠 Вийти на головне меню" ||
    msg === "🏠 Повернутися до головного меню" ||
    msg === "🏠 Повернутися на головне меню" ||
    msg === "🏠 На головне меню"
  ) {
    return handleBackToMainMenu(ctx);
  }

  // Обробка вибору типу допомоги (через reply keyboard)
  if (await handleNeedTypeSelection(ctx, msg)) {
    return;
  }

  // Обробка вибору категорії гуманітарної допомоги (Продукти/Хімія)
  if (await handleNeedHumanitarianCategorySelection(ctx, msg)) {
    return;
  }
  
  // Старі кнопки (для сумісності, якщо хтось ще використовує)
  if (msg === "🙏 Подати заявку") {
    return handleNeedStart(ctx);
  }
  if (msg === "📞 Контакти") {
    return handleContact(ctx);
  }
  if (msg === "❓ Допомога") {
    return handleHelp(ctx);
  }

  // Спробуємо обробити кроки реєстрації
  if (await handleRegisterSteps(ctx, msg)) {
    return;
  }

  // Спробуємо обробити редагування профілю
  if (await handleProfileEditText(ctx, msg)) {
    return;
  }

  // Спробуємо обробити кроки створення заявки
  if (await handleNeedSteps(ctx, msg)) {
    return;
  }

  // Спробуємо обробити текст оголошення
  if (await handleAnnounceText(ctx, msg)) {
    return;
  }

  // Спробуємо обробити текст відповіді адміна на заявку
  if (await handleNeedReplyText(ctx, msg)) {
    return;
  }

  // Спробуємо обробити текст "виконано + повідомлення" для заявки
  if (await handleAdminNeedDoneText(ctx, msg)) {
    return;
  }

  // Команди (/...) обробляються окремо
  if (msg.startsWith("/")) {
    return next();
  }

  // Якщо користувач у діалозі (сесія) — не підказуємо про «вільне» повідомлення
  if (ctx.session?.step) {
    return next();
  }

  // Вільний текст: бот не пересилає його адміністрації
  const menu = await createMainMenu(ctx);
  const replyText =
    "ℹ️ Це повідомлення *адміністрація не побачить* — бот не пересилає вільний текст служителям.\n\n" +
    "Щоб зв'язатися з нами, натисніть кнопку *📞 Зв'язатися з нами* у меню\n" +
    "або скористайтеся командою /contacts.";

  try {
    const payload = {
      botMessage: ctx.session?.lastBotMessage || "(невідомо)",
      userMessage: msg,
    };
    const apiUrl = process.env.API_URL || "https://church-crm-api-t3ri.onrender.com";
    const url = `${apiUrl}/api/free-messages`;
    console.log("free-messages POST", {
      url,
      payload,
      hasApiUrl: Boolean(process.env.API_URL),
      hasInternalKey: Boolean(process.env.INTERNAL_API_KEY),
    });

    let saved = false;
    if (process.env.INTERNAL_API_KEY) {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-key": process.env.INTERNAL_API_KEY,
        },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      console.log("free-messages response", res.status, text);
      saved = res.ok;
    }

    if (!saved) {
      const col = await getCollection("freemessages");
      await col.insertOne({
        ...payload,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log("free-messages saved via mongo");
    }
  } catch (err) {
    console.error("free-messages save failed", err);
  }

  const sent = await ctx.reply(replyText, {
    parse_mode: "Markdown",
    reply_markup: menu.reply_markup,
  });
  if (ctx.session) ctx.session.lastBotMessage = replyText;
  return sent;
});

bot.on("photo", async (ctx, next) => {
  if (await handleAnnouncePhoto(ctx)) {
    return;
  }
  return next();
});

// ==================== ОБРОБКА CALLBACK КНОПОК ====================

// Зміна статусу заявки
bot.action(/status_(\d+)_(\w+)/, handleNeedStatusChange);

// Відповідь на заявку (кнопка "Написати відповідь")
bot.action(/reply_need_(\d+)/, checkAdmin, handleNeedReplyStart);

// Керування заявками на допомогу (адмін)
bot.action(/need_progress_(\d+)/, checkAdmin, handleAdminNeedMarkProgress);
bot.action(/need_done_(\d+)/, checkAdmin, handleAdminNeedMarkDone);
bot.action(/need_delete_(\d+)/, checkAdmin, handleAdminNeedDelete);
bot.action(/need_delete_confirm_(\d+)/, checkAdmin, handleAdminNeedDeleteConfirm);
bot.action(/need_delete_cancel_(\d+)/, checkAdmin, handleAdminNeedDeleteCancel);
bot.action(/needs_cat_(products|chemistry|other)_chat/, checkAdmin, handleAdminNeedsCategoryShowChat);
bot.action(/needs_cat_(products|chemistry|other)_pdf/, checkAdmin, handleAdminNeedsCategoryShowPdf);
bot.action(/needs_arch_cat_(products|chemistry|other)_chat/, checkAdmin, handleAdminNeedsArchiveCategoryShowChat);
bot.action(/needs_arch_cat_(products|chemistry|other)_pdf/, checkAdmin, handleAdminNeedsArchiveCategoryShowPdf);

// Вибір формату для заявок
bot.action("needs_show_chat", handleNeedsShowChat);
bot.action("needs_show_excel", handleNeedsShowExcel);

// Вибір формату для списку членів
bot.action("members_show_chat", handleMembersShowChat);
bot.action("members_show_excel", handleMembersShowExcel);

// Звіт по гуманітарній допомозі (Excel)
bot.action("humanitarian_report_products", checkAdmin, (ctx) => handleHumanitarianReportExcel(ctx, "products"));
bot.action("humanitarian_report_chemistry", checkAdmin, (ctx) => handleHumanitarianReportExcel(ctx, "chemistry"));
bot.action("humanitarian_report_other", checkAdmin, (ctx) => handleHumanitarianReportExcel(ctx, "other"));
bot.action("humanitarian_report_all", checkAdmin, (ctx) => handleHumanitarianReportExcel(ctx, "all"));

// Переміщення members -> candidates (тільки для адмінів, з підтвердженням)
bot.action(/member_to_candidate_(\d+)/, checkAdmin, handleMemberMoveToCandidatesStart);
bot.action(/member_to_candidate_confirm_(\d+)/, checkAdmin, handleMemberMoveToCandidatesConfirm);
bot.action(/member_to_candidate_cancel_(\d+)/, checkAdmin, handleMemberMoveToCandidatesCancel);

// Вибір формату для списку нехрещених
bot.action("candidates_show_chat", handleCandidatesShowChat);
bot.action("candidates_show_excel", handleCandidatesShowExcel);

// Вибір статусу хрещення при реєстрації
bot.action("register_baptized", (ctx) => handleRegisterBaptismStatus(ctx, true));
bot.action("register_unbaptized", (ctx) => handleRegisterBaptismStatus(ctx, false));
bot.action("register_continue", handleRegisterContinue);
bot.action("register_restart", handleRegisterRestart);

// Редагування профілю
bot.action("profile_edit_menu", handleProfileEditMenu);
bot.action("profile_edit_name", (ctx) => handleProfileEditField(ctx, "name"));
bot.action("profile_edit_baptism", (ctx) => handleProfileEditField(ctx, "baptism"));
bot.action("profile_edit_birthday", (ctx) => handleProfileEditField(ctx, "birthday"));
bot.action("profile_edit_phone", (ctx) => handleProfileEditField(ctx, "phone"));
bot.action("profile_edit_cancel", handleProfileEditCancel);

// Старі inline кнопки для типу допомоги (залишаємо для сумісності, але тепер використовується reply keyboard)
// bot.action("need_type_humanitarian", (ctx) => handleNeedTypeSelection(ctx, "humanitarian"));
// bot.action("need_type_other", (ctx) => handleNeedTypeSelection(ctx, "other"));

// Вибір цільової аудиторії для оголошення (тільки для адмінів)
bot.action("announce_baptized", checkAdmin, (ctx) => handleAnnounceAudience(ctx, "baptized"));
bot.action("announce_unbaptized", checkAdmin, (ctx) => handleAnnounceAudience(ctx, "unbaptized"));
bot.action("announce_all", checkAdmin, (ctx) => handleAnnounceAudience(ctx, "all"));
bot.action("announce_failed_report", checkAdmin, handleAnnounceFailedReport);


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

// Захист від крашу через необроблені помилки
process.on("unhandledRejection", (err) => {
  logError("Unhandled Promise Rejection", err);
  console.error("❌ Unhandled Rejection:", err);
});

process.on("uncaughtException", (err) => {
  logError("Uncaught Exception", err);
  console.error("❌ Uncaught Exception:", err);
});

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
