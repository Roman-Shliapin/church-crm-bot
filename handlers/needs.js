// Обробник заявок на допомогу
import { Markup } from "telegraf";
import { readNeeds, addNeed, findMemberById, findNeedById, updateNeedStatus } from "../services/storage.js";
import { createMainMenu } from "./commands.js";
import { isAdmin } from "../middlewares/admin.js";
import { ADMIN_IDS, STATUS_MAP, NEED_STATUS } from "../config/constants.js";
import { formatNeedMessage, createAdminNotification, createNeed } from "../utils/helpers.js";
import { validateName, validatePhone, sanitizeText } from "../utils/validation.js";
import { generateNeedsExcel, deleteFile } from "../services/excel.js";

/**
 * Створює меню вибору типу допомоги
 */
export function createNeedTypeMenu() {
  return Markup.keyboard([
    ["🛒 Гуманітарна допомога", "💬 Інше"],
    ["🏠 Повернутися до головного меню"]
  ])
    .resize()
    .persistent();
}

/**
 * Обробник команди /need - тільки для створення заявки
 */
export async function handleNeedStart(ctx) {
  const userId = ctx.from.id;
  const member = await findMemberById(userId);

  ctx.session = { step: "need_type_selection", data: {} };
  
  if (member) {
    // Член церкви - зберігаємо дані користувача
    ctx.session.data.user = member;
  }

  return ctx.reply(
    "🙏 Оберіть тип допомоги:",
    createNeedTypeMenu()
  );
}

/**
 * Обробник вибору типу допомоги (через reply keyboard)
 */
export async function handleNeedTypeSelection(ctx, msg) {
  const step = ctx.session?.step;
  if (step !== "need_type_selection") {
    return false;
  }

  const member = ctx.session?.data?.user;
  let needType = null;

  if (msg === "🛒 Гуманітарна допомога") {
    needType = "humanitarian";
  } else if (msg === "💬 Інше") {
    needType = "other";
  } else if (msg === "🏠 Повернутися до головного меню") {
    const menu = await createMainMenu(ctx);
    ctx.session = null;
    return ctx.reply("🏠 Повернулися до головного меню", menu);
  } else {
    return false; // Не наш крок
  }

  ctx.session.data.needType = needType;

  if (member) {
    // Член церкви - тільки опис
    ctx.session.step = "need_description";
    const menu = await createMainMenu(ctx);
    return ctx.reply("✍️ Опишіть, будь ласка, вашу потребу:", menu);
  } else {
    // Гість - збираємо дані
    ctx.session.step = "need_guest_name";
    const menu = await createMainMenu(ctx);
    return ctx.reply("👋 Вкажіть, будь ласка, ваше ім'я та прізвище:", menu);
  }
}

/**
 * Обробник команди /needs - показує вибір формату (тільки для адмінів)
 */
export async function handleNeedsList(ctx) {
  const needs = await readNeeds();

  if (needs.length === 0) {
    return ctx.reply("📭 Наразі немає заявок на допомогу.");
  }

  ctx.reply(
    "📋 Заявки на допомогу\n\n" +
    `Знайдено заявок: ${needs.length}\n\n` +
    "Оберіть формат відображення:",
    Markup.inlineKeyboard([
      [
        Markup.button.callback("💬 Показати в чаті", "needs_show_chat"),
        Markup.button.callback("📊 Excel файл", "needs_show_excel"),
      ],
    ])
  );
}

/**
 * Показує заявки в чаті
 */
export async function handleNeedsShowChat(ctx) {
  await ctx.answerCbQuery("Показую заявки в чаті...");
  const needs = await readNeeds();

  for (const need of needs) {
    const message = formatNeedMessage(need);
    await ctx.replyWithMarkdown(
      message,
      Markup.inlineKeyboard([
        [
          Markup.button.callback("🕓 В очікуванні", `status_${need.id}_waiting`),
          Markup.button.callback("✅ Виконано", `status_${need.id}_done`),
        ],
      ])
    );
  }
}

/**
 * Генерує та надсилає Excel файл з заявками
 */
export async function handleNeedsShowExcel(ctx) {
  await ctx.answerCbQuery("Генерую Excel файл...");
  const needs = await readNeeds();

  try {
    const filePath = await generateNeedsExcel(needs);
    await ctx.replyWithDocument({ source: filePath });
    deleteFile(filePath);
  } catch (err) {
    console.error("Помилка генерації Excel:", err);
    await ctx.reply("⚠️ Не вдалося згенерувати Excel файл.");
  }
}

/**
 * Обробка кроків створення заявки через текст
 */
export async function handleNeedSteps(ctx, msg) {
  const step = ctx.session?.step;
  if (!step || (!step.startsWith("need_") && step !== "need_description")) {
    return false; // Не наш крок
  }

  // === ЗАЯВКА ОТ ГОСТЯ (НЕ ЧЛЕНА ЦЕРКВИ) ===
  if (step === "need_guest_name") {
    const validatedName = validateName(msg);
    if (!validatedName) {
      ctx.reply("⚠️ Будь ласка, введіть коректне ім'я (2-100 символів, тільки букви).");
      return true;
    }
    ctx.session.data.name = validatedName;
    ctx.session.step = "need_guest_phone";
    ctx.reply("📞 Вкажіть ваш номер телефону (+380...):");
    return true;
  }

  if (step === "need_guest_phone") {
    const validatedPhone = validatePhone(msg);
    if (!validatedPhone) {
      ctx.reply("⚠️ Будь ласка, введіть коректний номер телефону у форматі +380XXXXXXXXX або 0XXXXXXXXX.");
      return true;
    }
    ctx.session.data.phone = validatedPhone;
    ctx.session.step = "need_guest_description";
    ctx.reply("✍️ Опишіть вашу потребу:");
    return true;
  }

  if (step === "need_guest_description") {
    const sanitizedDescription = sanitizeText(msg, 5000);
    if (!sanitizedDescription) {
      ctx.reply("⚠️ Опис не може бути порожнім або перевищувати 5000 символів.");
      return true;
    }
    const userData = ctx.session.data;
    const need = createNeed({
      userId: ctx.from.id,
      name: userData.name,
      baptism: "Не член церкви",
      phone: userData.phone,
      description: sanitizedDescription,
      type: ctx.session.data.needType || "other",
    });

    await addNeed(need);
    const menu = await createMainMenu(ctx);
    await ctx.reply("✅ Дякуємо! Ваша заявка збережена. Ми з вами зв'яжемось 🙏", menu);

    // Повідомлення адмінам
    await notifyAdmins(ctx, need);
    ctx.session = null;
    return true;
  }

  // === ЗАЯВКА ОТ ЧЛЕНА ЦЕРКВИ ===
  if (step === "need_description") {
    const sanitizedDescription = sanitizeText(msg, 5000);
    if (!sanitizedDescription) {
      ctx.reply("⚠️ Опис не може бути порожнім або перевищувати 5000 символів.");
      return true;
    }
    const user = ctx.session.data.user;
    const need = createNeed({
      userId: ctx.from.id,
      name: user.name,
      baptism: user.baptism,
      phone: user.phone,
      description: sanitizedDescription,
      type: ctx.session.data.needType || "other",
    });

    await addNeed(need);
    const menu = await createMainMenu(ctx);
    await ctx.reply("✅ Ваша заявка на допомогу збережена 🙏", menu);

    // Повідомлення адмінам
    await notifyAdmins(ctx, need);
    ctx.session = null;
    return true;
  }

  return false;
}

/**
 * Створює меню для адміна при отриманні заявки на допомогу (без ID в тексті)
 */
function createAdminNeedMenu() {
  return Markup.keyboard([
    ["💬 Написати відповідь"]
  ])
    .resize()
    .persistent();
}

/**
 * Надсилає повідомлення адмінам про нову заявку
 */
async function notifyAdmins(ctx, need) {
  const adminMessage = createAdminNotification(need);
  console.log("🟢 Надсилаю повідомлення адмінам:", ADMIN_IDS);

  // Використовуємо reply keyboard меню замість inline кнопок
  const replyKeyboard = createAdminNeedMenu();

  for (const adminId of ADMIN_IDS) {
    try {
      // Відправляємо повідомлення адміну
      await ctx.telegram.sendMessage(adminId, adminMessage, {
        parse_mode: "Markdown",
        reply_markup: replyKeyboard.reply_markup,
      });
      
      // Зберігаємо needId в сесії адміна
      if (!global.adminNeedSessions) {
        global.adminNeedSessions = new Map();
      }
      global.adminNeedSessions.set(adminId, need.id);
    } catch (err) {
      console.error("❌ Помилка надсилання адміну:", err);
    }
  }
}

/**
 * Обробник зміни статусу заявки (callback від inline кнопок)
 */
export async function handleNeedStatusChange(ctx) {
  const needId = ctx.match[1];
  const newStatusKey = ctx.match[2];
  const newStatus = STATUS_MAP[newStatusKey];

  // Спочатку перевіряємо поточний статус
  const currentNeed = await findNeedById(needId);

  if (!currentNeed) {
    return ctx.answerCbQuery("⚠️ Не знайдено заявку з цим ID.");
  }

  // Якщо статус вже встановлений
  if (currentNeed.status === newStatus) {
    return ctx.answerCbQuery("⚠️ Цей статус уже встановлено.");
  }

  // Оновлюємо статус
  const updatedNeed = await updateNeedStatus(needId, newStatus);
  if (!updatedNeed) {
    return ctx.answerCbQuery("⚠️ Помилка оновлення статусу.");
  }

  await ctx.answerCbQuery("✅ Статус оновлено!");

  const updatedMessage = formatNeedMessage(updatedNeed);

  try {
    await ctx.editMessageText(updatedMessage, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🕓 В очікуванні",
              callback_data: `status_${updatedNeed.id}_waiting`,
            },
            { text: "✅ Виконано", callback_data: `status_${updatedNeed.id}_done` },
          ],
        ],
      },
    });
  } catch (err) {
    console.error("Помилка оновлення повідомлення:", err);
  }
}

/**
 * Обробник кнопки "Написати відповідь" на заявку (через reply keyboard)
 */
export async function handleNeedReplyStart(ctx, msg = null) {
  let needId;
  
  // Якщо викликано через reply keyboard (msg містить текст кнопки)
  if (msg && msg === "💬 Написати відповідь") {
    // Отримуємо needId з сесії адміна
    if (global.adminNeedSessions && global.adminNeedSessions.has(ctx.from.id)) {
      needId = global.adminNeedSessions.get(ctx.from.id);
    } else {
      await ctx.reply("⚠️ Не знайдено активної заявки. Очікуйте нове повідомлення.");
      return;
    }
  } else if (ctx.match) {
    // Якщо викликано через callback (inline кнопка - для сумісності)
    needId = parseInt(ctx.match[1]);
  } else {
    await ctx.reply("⚠️ Помилка обробки запиту.");
    return;
  }
  
  const need = await findNeedById(needId);

  if (!need) {
    if (msg) {
      await ctx.reply("⚠️ Заявка не знайдена");
    } else {
      await ctx.answerCbQuery("⚠️ Заявка не знайдена");
    }
    return;
  }

  // Зберігаємо в сесії, що адмін хоче відповісти на цю заявку
  ctx.session = {
    step: "need_reply_text",
    data: { needId, userId: need.userId }
  };

  await ctx.reply(
    `✍️ Введіть текст відповіді для ${need.name}:\n\n` +
    `(Ви можете використати до 4000 символів)`
  );
}

/**
 * Обробка тексту відповіді адміна на заявку
 */
export async function handleNeedReplyText(ctx, msg) {
  const step = ctx.session?.step;
  if (step !== "need_reply_text") {
    return false;
  }

  const { needId, userId } = ctx.session.data;
  const sanitizedText = sanitizeText(msg, 4000);
  
  if (!sanitizedText) {
    await ctx.reply("⚠️ Текст не може бути порожнім або перевищувати 4000 символів.");
    return true;
  }

  try {
    // Відправляємо повідомлення користувачу
    const userMessage = `📬 *Відповідь на вашу заявку:*\n\n${sanitizedText}`;
    await ctx.telegram.sendMessage(userId, userMessage, {
      parse_mode: "Markdown",
    });

    // Очищаємо сесію адміна для цієї заявки
    if (global.adminNeedSessions) {
      global.adminNeedSessions.delete(ctx.from.id);
    }

    // Повертаємо головне меню адміну
    const menu = await createMainMenu(ctx);
    await ctx.reply("✅ Відповідь успішно надіслана!", menu);
    ctx.session = null;
  } catch (err) {
    console.error("Помилка надсилання відповіді:", err);
    const menu = await createMainMenu(ctx);
    await ctx.reply("⚠️ Помилка надсилання відповіді. Можливо, користувач заблокував бота.", menu);
    ctx.session = null;
  }

  return true;
}

