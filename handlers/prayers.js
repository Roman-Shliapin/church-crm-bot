// Обробник молитвенних потреб
import { Markup } from "telegraf";
import { readPrayers, readActivePrayers, readArchivedPrayers, addPrayer, findMemberById, findPrayerById, updatePrayerClarification, updatePrayerFields } from "../services/storage.js";
import { getCollection } from "../services/database.js";
import { createMainMenu } from "./commands.js";
import { formatPrayerMessage, createPrayer, createAdminPrayerNotification } from "../utils/helpers.js";
import { ADMIN_IDS } from "../config/constants.js";
import { sanitizeText } from "../utils/validation.js";
import { generatePrayersExcel, deleteFile } from "../services/excel.js";
import { isAdmin } from "../middlewares/admin.js";

/**
 * Обробник команди /pray - додати молитвенну потребу
 */
export async function handlePrayStart(ctx) {
  const userId = ctx.from.id;
  const member = await findMemberById(userId);

  if (member) {
    // Член церкви - можна додати ім'я або залишити анонімно
    ctx.session = { step: "pray_anonymous", data: { name: member.name } };
    const menu = await createMainMenu(ctx);
    return ctx.reply(
      "🙏 Дякуємо за вашу молитвенну потребу!\n\n" +
      "Хочете додати ваше ім'я? (напишіть 'так' або 'ні', або просто введіть опис потребі)",
      menu
    );
  } else {
    // Гість - анонімно
    ctx.session = { step: "pray_description", data: { name: null } };
    const menu = await createMainMenu(ctx);
    return ctx.reply("🙏 Опишіть, будь ласка, молитвенну потребу:", menu);
  }
}

/**
 * Обробник команди /prayers - показує вибір формату (тільки для адмінів)
 */
export async function handlePrayersList(ctx) {
  const prayers = await readPrayers();

  if (prayers.length === 0) {
    return ctx.reply("📭 Наразі немає молитвенних потреб.");
  }

  ctx.reply(
    "🙏 Молитвенні потреби\n\n" +
    `Знайдено потреб: ${prayers.length}\n\n` +
    "Оберіть формат відображення:",
    Markup.inlineKeyboard([
      [
        Markup.button.callback("💬 Показати в чаті", "prayers_show_chat"),
        Markup.button.callback("📊 Excel файл", "prayers_show_excel"),
      ],
    ])
  );
}

/**
 * Показує молитви в чаті
 */
export async function handlePrayersShowChat(ctx) {
  await ctx.answerCbQuery("Показую молитви в чаті...");
  const prayers = await readPrayers();

  for (const prayer of prayers) {
    const message = formatPrayerMessage(prayer);
    await ctx.replyWithMarkdown(message);
  }
}

/**
 * Генерує та надсилає Excel файл з молитвами
 */
export async function handlePrayersShowExcel(ctx) {
  await ctx.answerCbQuery("Генерую Excel файл...");
  const prayers = await readPrayers();

  try {
    const filePath = await generatePrayersExcel(prayers);
    await ctx.replyWithDocument({ source: filePath });
    deleteFile(filePath);
  } catch (err) {
    console.error("Помилка генерації Excel:", err);
    await ctx.reply("⚠️ Не вдалося згенерувати Excel файл.");
  }
}

/**
 * Адмін: показати активні молитвені потреби з меню керування
 * (кожна потреба з 3 inline-кнопками під повідомленням)
 */
export async function handleAdminPrayersManageList(ctx) {
  if (!isAdmin(ctx.from?.id)) {
    const menu = await createMainMenu(ctx);
    return ctx.reply("⚠️ Ця функція доступна лише для служителів.", menu);
  }

  const prayers = await readActivePrayers();
  if (prayers.length === 0) {
    return ctx.reply("📭 Немає активних молитвенних потреб.");
  }

  await ctx.reply(`🙏 Активні молитвені потреби: ${prayers.length}`);

  const buildPrayerManageKeyboard = (prayer) => {
    // Вимога (аналогічно needs):
    // - після "Відповісти": прибрати "Відповісти", лишити "В процесі" + "Виконано"
    // - після "В процесі": лишити тільки "Виконано" (і "Відповісти" теж прибрати)
    const showReply = !prayer?.repliedAt && !prayer?.inProgressAt;
    const showProgress = !prayer?.inProgressAt;
    const rows = [];

    if (showReply) {
      rows.push([Markup.button.callback("💬 Відповісти", `reply_prayer_${prayer.id}`)]);
    }

    const row2 = [Markup.button.callback("✅ Виконано", `prayer_done_${prayer.id}`)];
    if (showProgress) {
      row2.push(Markup.button.callback("⏳ В процесі", `prayer_progress_${prayer.id}`));
    }
    rows.push(row2);

    return Markup.inlineKeyboard(rows);
  };

  for (const prayer of prayers) {
    const base = formatPrayerMessage(prayer);
    const statusLine = prayer.status ? `\n⚙️ *Статус:* ${prayer.status}` : "";
    const message = base + statusLine;
    await ctx.replyWithMarkdown(
      message,
      buildPrayerManageKeyboard(prayer)
    );
  }
}

/**
 * Адмін: показати архівні (виконані) молитвені потреби
 */
export async function handleAdminPrayersArchiveList(ctx) {
  if (!isAdmin(ctx.from?.id)) {
    const menu = await createMainMenu(ctx);
    return ctx.reply("⚠️ Ця функція доступна лише для служителів.", menu);
  }

  const prayers = await readArchivedPrayers();
  if (prayers.length === 0) {
    return ctx.reply("📦 Архів порожній: немає виконаних молитвенних потреб.");
  }

  prayers.sort((a, b) => (b.doneAt || b.date || "").localeCompare(a.doneAt || a.date || ""));

  await ctx.reply(`📦 Виконані молитвені потреби: ${prayers.length}`);

  const slice = prayers.slice(0, 50);
  for (const prayer of slice) {
    const base = formatPrayerMessage(prayer);
    const statusLine = `\n⚙️ *Статус:* ${prayer.status || "виконано"}`;
    const doneLine = prayer.doneAt ? `\n✅ *Виконано:* ${prayer.doneAt}` : "";
    await ctx.replyWithMarkdown(base + statusLine + doneLine);
  }

  if (prayers.length > slice.length) {
    await ctx.reply(`ℹ️ Показано ${slice.length} з ${prayers.length}.`);
  }
}

/**
 * Адмін: позначити молитву як "в процесі" + повідомити користувача
 */
export async function handleAdminPrayerMarkProgress(ctx) {
  const prayerId = parseInt(ctx.match[1]);
  const prayer = await findPrayerById(prayerId);
  if (!prayer) {
    return ctx.answerCbQuery("⚠️ Молитвенна потреба не знайдена");
  }

  const now = new Date().toISOString();
  const updated = await updatePrayerFields(prayerId, {
    status: "в процесі",
    inProgressAt: now,
    inProgressBy: ctx.from?.id,
    lastAction: "in_progress",
    lastActionAt: now,
    lastActionBy: ctx.from?.id,
  });
  await ctx.answerCbQuery("⏳ Позначено: в процесі");

  try {
    await ctx.telegram.sendMessage(
      prayer.userId,
      "⏳ Вашу молитвенну потребу взято в роботу. Ми молимося і будемо з вами на звʼязку 🙏"
    );
  } catch (err) {
    // ignore
  }

  try {
    const base = formatPrayerMessage(updated || prayer);
    const statusLine = `\n⚙️ *Статус:* ${(updated || prayer).status || "в процесі"}`;
    // Після "В процесі" лишаємо тільки "✅ Виконано"
    await ctx.editMessageText(base + statusLine + "\n\n⏳ *В процесі*", {
      parse_mode: "Markdown",
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback("✅ Виконано", `prayer_done_${prayerId}`)],
      ]).reply_markup,
    });
  } catch (err) {
    // ignore
  }
}

/**
 * Адмін: позначити молитву як виконану і прибрати зі списку Telegram
 * ВАЖЛИВО: запис НЕ видаляємо з MongoDB — ставимо archived=true
 */
export async function handleAdminPrayerMarkDone(ctx) {
  const prayerId = parseInt(ctx.match[1]);
  const prayer = await findPrayerById(prayerId);
  if (!prayer) {
    return ctx.answerCbQuery("⚠️ Молитвенна потреба не знайдена");
  }

  // Переходимо в режим "виконано + повідомлення"
  ctx.session = {
    step: "prayer_done_reply_text",
    data: {
      prayerId,
      userId: prayer.userId,
      messageChatId: ctx.chat?.id,
      messageId: ctx.update?.callback_query?.message?.message_id,
    },
  };

  await ctx.answerCbQuery("✍️ Напишіть повідомлення і потреба буде виконана");
  await ctx.reply(
    "✍️ Введіть повідомлення для людини.\n\n" +
      "Після відправки молитвена потреба буде *виконана* та потрапить в *архів*.",
    { parse_mode: "Markdown" }
  );
}

/**
 * Адмін: текст для сценарію "виконано + повідомлення" (після натискання ✅ Виконано)
 */
export async function handleAdminPrayerDoneText(ctx, msg) {
  if (ctx.session?.step !== "prayer_done_reply_text") return false;

  const { prayerId, userId, messageChatId, messageId } = ctx.session.data || {};
  const sanitizedText = sanitizeText(msg, 4000);
  if (!sanitizedText) {
    await ctx.reply("⚠️ Текст не може бути порожнім або перевищувати 4000 символів.");
    return true;
  }

  const prayer = await findPrayerById(prayerId);
  if (!prayer) {
    const menu = await createMainMenu(ctx);
    await ctx.reply("⚠️ Молитвенна потреба не знайдена.", menu);
    ctx.session = null;
    return true;
  }

  try {
    const now = new Date().toISOString();
    // 1) Надсилаємо повідомлення користувачу
    const userMessage = `📬 *Повідомлення щодо вашої молитвенної потреби:*\n\n${sanitizedText}`;
    await ctx.telegram.sendMessage(userId, userMessage, { parse_mode: "Markdown" });

    // 2) Архівуємо в БД (НЕ видаляємо) + фіксуємо дію адміна
    const updated = await updatePrayerFields(prayerId, {
      status: "виконано",
      archived: true,
      doneAt: now,
      doneMessage: sanitizedText,
      doneBy: ctx.from?.id,
      lastAction: "done",
      lastActionAt: now,
      lastActionBy: ctx.from?.id,
    });

    // 3) Прибираємо кнопки під повідомленням у Telegram
    try {
      if (messageChatId && messageId) {
        const base = formatPrayerMessage(updated || prayer);
        const statusLine = `\n⚙️ *Статус:* ${(updated || prayer).status || "виконано"}`;
        await ctx.telegram.editMessageText(messageChatId, messageId, undefined, base + statusLine + "\n\n✅ *Виконано*", {
          parse_mode: "Markdown",
        });
      }
    } catch (err) {
      // ignore
    }

    const menu = await createMainMenu(ctx);
    await ctx.reply("✅ Виконано: повідомлення надіслано, потреба додана в архів.", menu);
    ctx.session = null;
    return true;
  } catch (err) {
    const menu = await createMainMenu(ctx);
    await ctx.reply(
      "⚠️ Не вдалося надіслати повідомлення користувачу (можливо, він заблокував бота).",
      menu
    );
    ctx.session = null;
    return true;
  }
}

/**
 * Обробка кроків створення молитвенної потреби через текст
 */
export async function handlePraySteps(ctx, msg) {
  const step = ctx.session?.step;
  if (!step || !step.startsWith("pray_")) {
    return false; // Не наш крок
  }

  // === ВИБІР АНОНІМНОСТІ (для членів церкви) ===
  if (step === "pray_anonymous") {
    const lowerMsg = msg.toLowerCase().trim();
    if (lowerMsg === "так" || lowerMsg === "yes" || lowerMsg === "да") {
      // З ім'ям
      ctx.session.step = "pray_description";
      ctx.reply("✍️ Опишіть, будь ласка, молитвенну потребу:");
      return true;
    } else if (lowerMsg === "ні" || lowerMsg === "no" || lowerMsg === "нет") {
      // Анонімно
      ctx.session.data.name = null;
      ctx.session.step = "pray_description";
      ctx.reply("✍️ Опишіть, будь ласка, молитвенну потребу:");
      return true;
    } else {
      // Якщо просто ввели текст - використовуємо як опис з ім'ям
      const sanitizedDescription = sanitizeText(msg, 5000);
      if (!sanitizedDescription) {
        ctx.reply("⚠️ Опис не може бути порожнім або перевищувати 5000 символів.");
        return true;
      }
      const prayer = createPrayer({
        userId: ctx.from.id,
        name: ctx.session.data.name,
        description: sanitizedDescription,
      });
      await addPrayer(prayer);
      const menu = await createMainMenu(ctx);
      await ctx.reply("✅ Дякуємо! Ваша молитвенна потреба збережена 🙏", menu);
      // Повідомлення адмінам
      await notifyAdmins(ctx, prayer);
      ctx.session = null;
      return true;
    }
  }

  // === ОПИС ПОТРЕБИ ===
  if (step === "pray_description") {
    const sanitizedDescription = sanitizeText(msg, 5000);
    if (!sanitizedDescription) {
      ctx.reply("⚠️ Опис не може бути порожнім або перевищувати 5000 символів.");
      return true;
    }
    const prayer = createPrayer({
      userId: ctx.from.id,
      name: ctx.session.data.name || null,
      description: sanitizedDescription,
    });

    await addPrayer(prayer);
    const menu = await createMainMenu(ctx);
    await ctx.reply("✅ Дякуємо! Ваша молитвенна потреба збережена 🙏", menu);
    // Повідомлення адмінам
    await notifyAdmins(ctx, prayer);
    ctx.session = null;
    return true;
  }

  return false;
}

/**
 * Створює меню для відповіді на уточнення користувача
 */
function createPrayerClarifyReplyMenu() {
  return Markup.keyboard([
    ["✍️ Написати уточнення"]
  ])
    .resize()
    .persistent();
}

/**
 * Створює меню для адміна при отриманні молитвенної потреби (без ID в тексті)
 */
function createAdminPrayerMenu() {
  return Markup.keyboard([
    ["🙏 Уточнити", "🙏 Відповісти"]
  ])
    .resize()
    .persistent();
}

/**
 * Створює меню для адміна після отримання уточнення від користувача
 */
function createAdminPrayerClarifyReplyMenu() {
  return Markup.keyboard([
    ["🙏 Остаточна відповідь", "🏠 На головне меню"]
  ])
    .resize()
    .persistent();
}

/**
 * Надсилає повідомлення адмінам про нову молитвенну потребу
 */
async function notifyAdmins(ctx, prayer) {
  const adminMessage = createAdminPrayerNotification(prayer);
  console.log("🟢 Надсилаю повідомлення адмінам про молитву:", ADMIN_IDS);

  for (const adminId of ADMIN_IDS) {
    try {
      // ВАЖЛИВО: не показуємо кнопки/спец-меню при надходженні нової молитвенної потреби.
      // Адмін керує потребами через "🛠️ Керувати потребами".
      const menu = await createMainMenu({ from: { id: adminId } });
      await ctx.telegram.sendMessage(adminId, adminMessage, {
        parse_mode: "Markdown",
        reply_markup: menu.reply_markup,
      });
    } catch (err) {
      console.error("❌ Помилка надсилання адміну:", err);
    }
  }
}

/**
 * Обробник кнопки "Уточнити" на молитвенну потребу (через reply keyboard)
 */
export async function handlePrayClarifyStart(ctx, msg = null) {
  let prayerId;
  
  // Якщо викликано через reply keyboard (msg містить текст кнопки)
  if (msg && msg === "🙏 Уточнити") {
    // Отримуємо prayerId з сесії адміна
    if (global.adminPrayerSessions && global.adminPrayerSessions.has(ctx.from.id)) {
      prayerId = global.adminPrayerSessions.get(ctx.from.id);
    } else {
      await ctx.reply("⚠️ Не знайдено активної молитвенної потреби. Очікуйте нове повідомлення.");
      return;
    }
  } else if (ctx.match) {
    // Якщо викликано через callback (inline кнопка - для сумісності)
    prayerId = parseInt(ctx.match[1]);
  } else {
    await ctx.reply("⚠️ Помилка обробки запиту.");
    return;
  }
  
  const prayer = await findPrayerById(prayerId);

  if (!prayer) {
    if (msg) {
      await ctx.reply("⚠️ Молитвенна потреба не знайдена");
    } else {
      await ctx.answerCbQuery("⚠️ Молитвенна потреба не знайдена");
    }
    return;
  }

  // Зберігаємо в сесії, що адмін хоче уточнити цю молитву
  ctx.session = {
    step: "pray_clarify_text",
    data: { prayerId, userId: prayer.userId, adminId: ctx.from.id }
  };

  await ctx.reply(
    `✍️ Введіть питання для уточнення до ${prayer.name || "користувача"}:\n\n` +
    `(Ви можете використати до 4000 символів)`
  );
}

/**
 * Обробка тексту уточнення від адміна
 */
export async function handlePrayClarifyText(ctx, msg) {
  const step = ctx.session?.step;
  if (step !== "pray_clarify_text") {
    return false;
  }

  const { prayerId, userId, adminId } = ctx.session.data;
  const sanitizedText = sanitizeText(msg, 4000);
  
  if (!sanitizedText) {
    await ctx.reply("⚠️ Текст не може бути порожнім або перевищувати 4000 символів.");
    return true;
  }

  try {
    const prayer = await findPrayerById(prayerId);
    if (!prayer) {
      await ctx.reply("⚠️ Молитвенна потреба не знайдена.");
      ctx.session = null;
      return true;
    }

    // Зберігаємо в базі даних, що користувач має відповісти на уточнення
    // Оновлюємо prayer, додаючи інформацію про уточнення
    await updatePrayerClarification(prayerId, adminId, sanitizedText);
    
    // Відправляємо питання користувачу з reply keyboard для відповіді (без inline кнопок)
    const userMessage = `❓ *Уточнення до вашої молитвенної потреби:*\n\n${sanitizedText}\n\n_Натисніть кнопку нижче, щоб написати уточнення:_`;
    await ctx.telegram.sendMessage(userId, userMessage, {
      parse_mode: "Markdown",
      reply_markup: createPrayerClarifyReplyMenu().reply_markup,
    });

    await ctx.reply("✅ Питання надіслано користувачу! Очікуємо відповіді.");
    ctx.session = null;
  } catch (err) {
    console.error("Помилка надсилання уточнення:", err);
    await ctx.reply("⚠️ Помилка надсилання уточнення. Можливо, користувач заблокував бота.");
    ctx.session = null;
  }

  return true;
}

/**
 * Обробник кнопки "Написати уточнення" від користувача (через reply keyboard)
 */
export async function handlePrayClarifyReplyStart(ctx) {
  // Перевіряємо, чи є активне уточнення для цього користувача
  // Шукаємо останню молитву користувача, яка має уточнення
  const prayers = await readPrayers();
  const userPrayers = prayers
    .filter(p => p.userId === ctx.from.id && p.needsClarificationReply === true)
    .sort((a, b) => b.id - a.id);
  
  if (userPrayers.length === 0) {
    const menu = await createMainMenu(ctx);
    return ctx.reply("⚠️ Не знайдено активних уточнень для відповіді.", menu);
  }

  // Беремо останню молитву з уточненням
  const prayer = userPrayers[0];
  
  // Зберігаємо в сесії, що користувач хоче відповісти на уточнення
  ctx.session = {
    step: "pray_clarify_reply_text",
    data: { 
      prayerId: prayer.id,
      adminId: prayer.clarifyingAdminId
    }
  };

  // Показуємо reply keyboard меню для введення уточнення
  const menu = createPrayerClarifyReplyMenu();
  await ctx.reply(
    `✍️ Введіть ваше уточнення:\n\n` +
    `(Ви можете використати до 4000 символів)`,
    menu
  );
}

/**
 * Обробка тексту відповіді користувача на уточнення
 */
export async function handlePrayClarifyReplyText(ctx, msg) {
  const step = ctx.session?.step;
  if (step !== "pray_clarify_reply_text") {
    return false;
  }

  const { prayerId, adminId } = ctx.session.data;
  const sanitizedText = sanitizeText(msg, 4000);
  
  if (!sanitizedText) {
    await ctx.reply("⚠️ Текст не може бути порожнім або перевищувати 4000 символів.");
    return true;
  }

  try {
    const prayer = await findPrayerById(prayerId);
    if (!prayer) {
      await ctx.reply("⚠️ Молитвенна потреба не знайдена.");
      ctx.session = null;
      return true;
    }

    // Оновлюємо prayer - уточнення отримано
    const collection = await getCollection("prayers");
    await collection.findOneAndUpdate(
      { id: prayerId },
      { $set: { needsClarificationReply: false, clarificationReply: sanitizedText } }
    );

    // Оновлюємо сесію адміна з новим prayerId
    if (!global.adminPrayerSessions) {
      global.adminPrayerSessions = new Map();
    }
    global.adminPrayerSessions.set(adminId, prayerId);
    
    // Відправляємо відповідь адміну з меню "Остаточна відповідь" або "На головне меню"
    const adminMessage = `💬 *Відповідь на уточнення:*\n\n${sanitizedText}\n\n_Від: ${prayer.name || "користувача"}_`;
    const adminMenu = createAdminPrayerClarifyReplyMenu();
    await ctx.telegram.sendMessage(adminId, adminMessage, {
      parse_mode: "Markdown",
      reply_markup: adminMenu.reply_markup,
    });

    const menu = await createMainMenu(ctx);
    await ctx.reply("✅ Ваша відповідь надіслана! 🙏", menu);
    ctx.session = null;
  } catch (err) {
    console.error("Помилка надсилання відповіді:", err);
    await ctx.reply("⚠️ Помилка надсилання відповіді.");
    ctx.session = null;
  }

  return true;
}

/**
 * Обробник кнопки "Відповісти" на молитвенну потребу (через reply keyboard)
 */
export async function handlePrayReplyStart(ctx, msg = null) {
  let prayerId;
  
  // Якщо викликано через reply keyboard (msg містить текст кнопки)
  if (msg && (msg === "🙏 Відповісти" || msg === "🙏 Остаточна відповідь")) {
    // Отримуємо prayerId з сесії адміна
    if (global.adminPrayerSessions && global.adminPrayerSessions.has(ctx.from.id)) {
      prayerId = global.adminPrayerSessions.get(ctx.from.id);
    } else {
      await ctx.reply("⚠️ Не знайдено активної молитвенної потреби. Очікуйте нове повідомлення.");
      return;
    }
  } else if (ctx.match) {
    // Якщо викликано через callback (inline кнопка - для сумісності)
    prayerId = parseInt(ctx.match[1]);
  } else {
    await ctx.reply("⚠️ Помилка обробки запиту.");
    return;
  }
  
  const prayer = await findPrayerById(prayerId);

  if (!prayer) {
    if (msg) {
      await ctx.reply("⚠️ Молитвенна потреба не знайдена");
    } else {
      await ctx.answerCbQuery("⚠️ Молитвенна потреба не знайдена");
    }
    return;
  }

  // Зберігаємо в сесії, що адмін хоче відповісти (остаточна відповідь)
  ctx.session = {
    step: "pray_reply_text",
    data: {
      prayerId,
      userId: prayer.userId,
      // щоб після відповіді прибрати кнопки в повідомленні зі списку
      messageChatId: ctx.chat?.id,
      messageId: ctx.update?.callback_query?.message?.message_id,
    }
  };

  await ctx.reply(
    `✍️ Введіть текст остаточної відповіді для ${prayer.name || "користувача"}:\n\n` +
    `(Ви можете використати до 4000 символів)\n\n` +
    `⚠️ Це остаточна відповідь - користувач не зможе відповісти.`
  );
}

/**
 * Обробка тексту фінальної відповіді адміна
 */
export async function handlePrayReplyText(ctx, msg) {
  const step = ctx.session?.step;
  if (step !== "pray_reply_text") {
    return false;
  }

  const { prayerId, userId, messageChatId, messageId } = ctx.session.data;
  const sanitizedText = sanitizeText(msg, 4000);
  
  if (!sanitizedText) {
    await ctx.reply("⚠️ Текст не може бути порожнім або перевищувати 4000 символів.");
    return true;
  }

  try {
    const now = new Date().toISOString();
    // Оновлюємо prayer - відповідь надіслано
    const collection = await getCollection("prayers");
    await collection.findOneAndUpdate(
      { id: prayerId },
      {
        $set: {
          needsClarificationReply: false,
          finalReply: sanitizedText,
          repliedAt: now,
          repliedBy: ctx.from?.id,
          lastAction: "replied",
          lastActionAt: now,
          lastActionBy: ctx.from?.id,
        },
      }
    );

    // Очищаємо сесію адміна для цієї молитви
    if (global.adminPrayerSessions) {
      global.adminPrayerSessions.delete(ctx.from.id);
    }

    // Відправляємо повідомлення користувачу (остаточна відповідь, без можливості відповісти)
    // Повертаємо головне меню користувачу
    const userMessage = `📬 *Відповідь на вашу молитвенну потребу:*\n\n${sanitizedText}`;
    const userMenu = await createMainMenu({ from: { id: userId } });
    await ctx.telegram.sendMessage(userId, userMessage, {
      parse_mode: "Markdown",
      reply_markup: userMenu.reply_markup,
    });

    // Оновлюємо кнопки під повідомленням у списку:
    // після "Відповісти" прибираємо тільки "💬 Відповісти", лишаємо "⏳ В процесі" + "✅ Виконано"
    try {
      if (messageChatId && messageId) {
        const current = await findPrayerById(prayerId);
        const base = formatPrayerMessage(current || { name: "Анонімно", description: "-", date: "-" });
        const statusLine = current?.status ? `\n⚙️ *Статус:* ${current.status}` : "";

        // Якщо молитва вже "в процесі" — лишаємо тільки "✅ Виконано"
        const keyboardRows = current?.inProgressAt
          ? [[Markup.button.callback("✅ Виконано", `prayer_done_${prayerId}`)]]
          : [[
              Markup.button.callback("✅ Виконано", `prayer_done_${prayerId}`),
              Markup.button.callback("⏳ В процесі", `prayer_progress_${prayerId}`),
            ]];

        await ctx.telegram.editMessageText(
          messageChatId,
          messageId,
          undefined,
          base + statusLine + "\n\n✅ *Відповідь надіслана*",
          {
            parse_mode: "Markdown",
            reply_markup: Markup.inlineKeyboard(keyboardRows).reply_markup,
          }
        );
      }
    } catch (err) {
      // ignore
    }

    // Повертаємо головне меню адміну
    const menu = await createMainMenu(ctx);
    await ctx.reply("✅ Остаточна відповідь успішно надіслана!", menu);
    ctx.session = null;
  } catch (err) {
    console.error("Помилка надсилання відповіді:", err);
    await ctx.reply("⚠️ Помилка надсилання відповіді. Можливо, користувач заблокував бота.");
    ctx.session = null;
  }

  return true;
}

