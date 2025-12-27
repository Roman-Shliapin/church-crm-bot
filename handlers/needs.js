// Обробник заявок на допомогу
import { Markup } from "telegraf";
import { readNeeds, addNeed, findMemberById, findNeedById, updateNeedStatus } from "../services/storage.js";
import { isAdmin } from "../middlewares/admin.js";
import { ADMIN_IDS, STATUS_MAP, NEED_STATUS } from "../config/constants.js";
import { formatNeedMessage, createAdminNotification, createNeed } from "../utils/helpers.js";
import { validateName, validatePhone, sanitizeText } from "../utils/validation.js";
import { generateNeedsExcel, deleteFile } from "../services/excel.js";

/**
 * Обробник команди /need - тільки для створення заявки
 */
export async function handleNeedStart(ctx) {
  const userId = ctx.from.id;
  const member = await findMemberById(userId);

  if (member) {
    // Член церкви - тільки опис
    ctx.session = { step: "need_description", data: { user: member } };
    return ctx.reply("✍️ Опишіть, будь ласка, вашу потребу:");
  } else {
    // Гість - збираємо дані
    ctx.session = { step: "need_guest_name", data: {} };
    return ctx.reply("👋 Вкажіть, будь ласка, ваше ім'я та прізвище:");
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
    });

    await addNeed(need);
    await ctx.reply("✅ Дякуємо! Ваша заявка збережена. Ми з вами зв'яжемось 🙏");

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
    });

    await addNeed(need);
    await ctx.reply("✅ Ваша заявка на допомогу збережена 🙏");

    // Повідомлення адмінам
    await notifyAdmins(ctx, need);
    ctx.session = null;
    return true;
  }

  return false;
}

/**
 * Надсилає повідомлення адмінам про нову заявку
 */
async function notifyAdmins(ctx, need) {
  const adminMessage = createAdminNotification(need);
  console.log("🟢 Надсилаю повідомлення адмінам:", ADMIN_IDS);

  for (const adminId of ADMIN_IDS) {
    try {
      await ctx.telegram.sendMessage(adminId, adminMessage, {
        parse_mode: "Markdown",
      });
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

