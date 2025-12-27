// Обробник молитвенних потреб
import { Markup } from "telegraf";
import { readPrayers, addPrayer, findMemberById } from "../services/storage.js";
import { formatPrayerMessage, createPrayer } from "../utils/helpers.js";
import { sanitizeText } from "../utils/validation.js";
import { generatePrayersExcel, deleteFile } from "../services/excel.js";

/**
 * Обробник команди /pray - додати молитвенну потребу
 */
export function handlePrayStart(ctx) {
  const userId = ctx.from.id;
  const member = findMemberById(userId);

  if (member) {
    // Член церкви - можна додати ім'я або залишити анонімно
    ctx.session = { step: "pray_anonymous", data: { name: member.name } };
    return ctx.reply(
      "🙏 Дякуємо за вашу молитвенну потребу!\n\n" +
      "Хочете додати ваше ім'я? (напишіть 'так' або 'ні', або просто введіть опис потребі)"
    );
  } else {
    // Гість - анонімно
    ctx.session = { step: "pray_description", data: { name: null } };
    return ctx.reply("🙏 Опишіть, будь ласка, молитвенну потребу:");
  }
}

/**
 * Обробник команди /prayers - показує вибір формату (тільки для адмінів)
 */
export function handlePrayersList(ctx) {
  const prayers = readPrayers();

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
  const prayers = readPrayers();

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
  const prayers = readPrayers();

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
      addPrayer(prayer);
      await ctx.reply("✅ Дякуємо! Ваша молитвенна потреба збережена 🙏");
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

    addPrayer(prayer);
    await ctx.reply("✅ Дякуємо! Ваша молитвенна потреба збережена 🙏");
    ctx.session = null;
    return true;
  }

  return false;
}

