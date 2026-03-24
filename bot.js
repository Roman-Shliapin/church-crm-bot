// Головний файл бота - точка входу
import { Telegraf, session, Markup } from "telegraf";
import dotenv from "dotenv";

// Завантаження змінних оточення
dotenv.config();

// Імпорт обробників команд
import { handleStart, handleHelp, createMainMenu, handleBibleSupport, handleAdminManageNeedsMenu, handleAdminArchiveMenu } from "./handlers/commands.js";
import { handleRegisterStart, handleRegisterSteps, handleRegisterBaptismStatus, handleRegisterContinue, handleRegisterRestart } from "./handlers/register.js";
import {
  handleMe,
  handleMembers,
  handleMembersShowChat,
  handleMembersShowExcel,
  handleMemberMoveToCandidatesStart,
  handleMemberMoveToCandidatesConfirm,
  handleMemberMoveToCandidatesCancel,
  handleProfileEditMenu,
  handleProfileEditField,
  handleProfileEditCancel,
  handleProfileEditText,
} from "./handlers/members.js";
import { handleCandidates, handleCandidatesShowChat, handleCandidatesShowExcel } from "./handlers/candidates.js";
import { handleNeedStart, handleNeedTypeSelection, handleNeedHumanitarianCategorySelection, handleNeedSteps, handleNeedsList, handleNeedsShowChat, handleNeedsShowExcel, handleNeedStatusChange, handleNeedReplyStart, handleNeedReplyText, handleAdminNeedsManageList, handleAdminNeedsArchiveList, handleAdminNeedMarkDone, handleAdminNeedMarkProgress, handleAdminNeedDoneText, handleAdminNeedDelete, handleAdminNeedDeleteConfirm, handleAdminNeedDeleteCancel, handleAdminNeedsCategoryMenu, handleAdminNeedsCategoryShowChat, handleAdminNeedsCategoryShowPdf, handleAdminNeedsArchiveCategoryMenu, handleAdminNeedsArchiveCategoryShowChat, handleAdminNeedsArchiveCategoryShowPdf } from "./handlers/needs.js";
import { handlePrayStart, handlePraySteps, handlePrayersList, handlePrayersShowChat, handlePrayersShowExcel, handlePrayClarifyStart, handlePrayClarifyText, handlePrayClarifyReplyStart, handlePrayClarifyReplyText, handlePrayReplyStart, handlePrayReplyText, handleAdminPrayersManageList, handleAdminPrayersArchiveList, handleAdminPrayerMarkDone, handleAdminPrayerMarkProgress, handleAdminPrayerDoneText, handleAdminPrayerDelete, handleAdminPrayerDeleteConfirm, handleAdminPrayerDeleteCancel } from "./handlers/prayers.js";
import { readPrayers, readLiteratureRequests, findMemberById } from "./services/storage.js";
import { handleLessons, handleLessonSelection, handleLessonCallback } from "./handlers/lessons.js";
import { handleUploadLessonStart, handleUploadLessonName, handleUploadLessonFile } from "./handlers/lessonsAdmin.js";
import { handleContact, handleChurchChat, handleBackToMainMenu } from "./handlers/contact.js";
import {
  handleAnnounceStart,
  handleAnnounceAudience,
  handleAnnounceText,
  handleAnnouncePhoto,
  handleAnnounceFailedReport,
} from "./handlers/announce.js";
import { handleLiteratureStart, handleLiteratureRequest, handleLiteratureClarifyStart, handleLiteratureClarifyText, handleLiteratureClarifyReplyStart, handleLiteratureClarifyReplyText, handleLiteratureReplyStart, handleLiteratureFinalReplyStart, handleLiteratureReplyText, handleLiteratureReplyDocument } from "./handlers/literature.js";

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

  if (ctx.session?.step >= 1 && ctx.session?.step <= 5) {
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

// /pray - додати молитвенну потребу
bot.command("pray", handlePrayStart);

// /prayers - список молитвенних потреб (тільки для адмінів)
bot.command("prayers", checkAdmin, handlePrayersList);

// /lessons - отримати біблійний урок
bot.command("lessons", handleLessons);

// /contact - контакти служителів
bot.command("contacts", handleContact);

// /literature - пошук літератури
bot.command("literature", handleLiteratureStart);

// /announce - зробити оголошення (тільки для адмінів)
bot.command("announce", checkAdmin, handleAnnounceStart);

// /upload_lesson - завантажити PDF урок (тільки для адмінів)
bot.command("upload_lesson", checkAdmin, handleUploadLessonStart);

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
  if (msg === "📖 Біблія та духовна підтримка") {
    return handleBibleSupport(ctx);
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
  if (msg === "🧴 Хімія") {
    return handleAdminNeedsCategoryMenu(ctx, "chemistry");
  }
  if (msg === "💬 Інше") {
    return handleAdminNeedsCategoryMenu(ctx, "other");
  }
  if (msg === "🙏 Молитовні потреби") {
    return handleAdminPrayersManageList(ctx);
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
  if (msg === "🙏 Виконані молитви") {
    return handleAdminPrayersArchiveList(ctx);
  }
  
  // Обробка кнопок з меню "Біблія та духовна підтримка"
  if (msg === "💬 Молитвенна потреба") {
    return handlePrayStart(ctx);
  }
  if (msg === "📚 Біблійні уроки") {
    return handleLessons(ctx);
  }
  if (msg === "📖 Пошук літератури") {
    return handleLiteratureStart(ctx);
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
    msg === "🏠 Повернутися на головне меню"
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

  // Спробуємо обробити текст відповіді адміна на заявку
  if (await handleNeedReplyText(ctx, msg)) {
    return;
  }

  // Спробуємо обробити текст "виконано + повідомлення" для заявки
  if (await handleAdminNeedDoneText(ctx, msg)) {
    return;
  }

  // Спробуємо обробити текст уточнення адміна на молитву
  if (await handlePrayClarifyText(ctx, msg)) {
    return;
  }

  // Обробка кнопки "Написати уточнення" від користувача (reply keyboard)
  if (msg === "✍️ Написати уточнення") {
    // Перевіряємо, чи це для молитв чи для літератури
    const prayers = await readPrayers();
    const userPrayers = prayers.filter(p => p.userId === ctx.from.id && p.needsClarificationReply === true);
    if (userPrayers.length > 0) {
      return handlePrayClarifyReplyStart(ctx);
    }
    // Спробуємо для літератури
    const requests = await readLiteratureRequests();
    const userRequests = requests.filter(r => r.userId === ctx.from.id && r.needsClarificationReply === true);
    if (userRequests.length > 0) {
      return handleLiteratureClarifyReplyStart(ctx);
    }
    // Якщо нічого не знайдено
    const menu = await createMainMenu(ctx);
    return ctx.reply("⚠️ Не знайдено активних уточнень.", menu);
  }

  // Обробка кнопок адміна для молитвених потреб (reply keyboard)
  if (msg === "🙏 Уточнити") {
    return handlePrayClarifyStart(ctx, msg);
  }
  if (msg === "🙏 Відповісти" || msg === "🙏 Остаточна відповідь") {
    return handlePrayReplyStart(ctx, msg);
  }
  if (msg === "🏠 На головне меню") {
    return handleBackToMainMenu(ctx);
  }

  // (Прибрано) Кнопка "💬 Написати відповідь" більше не показується при нових заявках.

  // Обробка кнопок адміна для запитів на літературу (reply keyboard)
  if (msg === "📚 Уточнити") {
    return handleLiteratureClarifyStart(ctx, msg);
  }
  if (msg === "📚 Відповісти" || msg === "📚 Остаточна відповідь") {
    return handleLiteratureReplyStart(ctx, msg);
  }

  // Обробка вибору уроку через reply keyboard
  if (msg && /^\d+\./.test(msg)) {
    if (await handleLessonSelection(ctx, msg)) {
      return;
    }
  }

  // Спробуємо обробити текст відповіді користувача на уточнення
  if (await handlePrayClarifyReplyText(ctx, msg)) {
    return;
  }

  // Спробуємо обробити текст фінальної відповіді адміна на молитву
  if (await handlePrayReplyText(ctx, msg)) {
    return;
  }

  // Спробуємо обробити текст "виконано + повідомлення" для молитви
  if (await handleAdminPrayerDoneText(ctx, msg)) {
    return;
  }

  // Спробуємо обробити запит на літературу
  if (await handleLiteratureRequest(ctx, msg)) {
    return;
  }

  // Спробуємо обробити текст уточнення адміна на запит літератури
  if (await handleLiteratureClarifyText(ctx, msg)) {
    return;
  }

  // Спробуємо обробити текст відповіді користувача на уточнення літератури
  if (await handleLiteratureClarifyReplyText(ctx, msg)) {
    return;
  }

  // Спробуємо обробити текст відповіді адміна на запит літератури
  if (await handleLiteratureReplyText(ctx, msg)) {
    return;
  }

  // Якщо нічого не підійшло - передаємо далі
  return next();
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

// Уточнення молитвенної потреби (кнопка "Уточнити")
bot.action(/clarify_prayer_(\d+)/, checkAdmin, handlePrayClarifyStart);

// Стара inline кнопка для відповіді на уточнення (залишаємо для сумісності, але тепер використовується reply keyboard)
// bot.action(/reply_clarify_prayer_(\d+)_(\d+)/, handlePrayClarifyReplyStart);

// Відповідь адміна на молитву (кнопка "Відповісти" - остаточна відповідь)
bot.action(/reply_prayer_(\d+)/, checkAdmin, handlePrayReplyStart);

// Керування молитвенними потребами (адмін)
bot.action(/prayer_progress_(\d+)/, checkAdmin, handleAdminPrayerMarkProgress);
bot.action(/prayer_done_(\d+)/, checkAdmin, handleAdminPrayerMarkDone);
bot.action(/prayer_delete_(\d+)/, checkAdmin, handleAdminPrayerDelete);
bot.action(/prayer_delete_confirm_(\d+)/, checkAdmin, handleAdminPrayerDeleteConfirm);
bot.action(/prayer_delete_cancel_(\d+)/, checkAdmin, handleAdminPrayerDeleteCancel);

// Уточнення запиту на літературу (кнопка "Уточнити")
bot.action(/clarify_literature_(\d+)/, checkAdmin, handleLiteratureClarifyStart);

// Відповідь на запит літератури (кнопка "Відповісти")
bot.action(/reply_literature_(\d+)/, checkAdmin, handleLiteratureReplyStart);

// Відповідь користувача на уточнення літератури (кнопка "Відповісти")
bot.action(/reply_clarify_literature_(\d+)_(\d+)/, handleLiteratureClarifyReplyStart);

// Фінальна відповідь адміна на запит літератури (кнопка "Відповісти")
bot.action(/final_reply_literature_(\d+)_(\d+)/, checkAdmin, handleLiteratureFinalReplyStart);

// Вибір формату для заявок
bot.action("needs_show_chat", handleNeedsShowChat);
bot.action("needs_show_excel", handleNeedsShowExcel);

// Вибір формату для молитв
bot.action("prayers_show_chat", handlePrayersShowChat);
bot.action("prayers_show_excel", handlePrayersShowExcel);

// Вибір формату для списку членів
bot.action("members_show_chat", handleMembersShowChat);
bot.action("members_show_excel", handleMembersShowExcel);

// Переміщення members -> candidates (тільки для адмінів, з підтвердженням)
bot.action(/member_to_candidate_(\d+)/, checkAdmin, handleMemberMoveToCandidatesStart);
bot.action(/member_to_candidate_confirm_(\d+)/, checkAdmin, handleMemberMoveToCandidatesConfirm);
bot.action(/member_to_candidate_cancel_(\d+)/, checkAdmin, handleMemberMoveToCandidatesCancel);

// Вибір формату для списку нехрещених
bot.action("candidates_show_chat", handleCandidatesShowChat);
bot.action("candidates_show_excel", handleCandidatesShowExcel);

// Вибір уроку
bot.action(/lesson_(\d+)/, handleLessonCallback);

// Старі inline кнопки для "Біблія та духовна підтримка" (залишаємо для сумісності, але тепер використовується reply keyboard)
// bot.action("bible_lessons", async (ctx) => {
//   await ctx.answerCbQuery("Показую біблійні уроки...");
//   return handleLessons(ctx);
// });
// bot.action("bible_prayer", async (ctx) => {
//   await ctx.answerCbQuery("Відкриваю форму молитвенної потреби...");
//   return handlePrayStart(ctx);
// });

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
  
  // Перевіряємо, чи це адмінська сесія відповіді на запит літератури
  if (ctx.session?.step === "literature_reply_text") {
    const result = await handleLiteratureReplyDocument(ctx);
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
