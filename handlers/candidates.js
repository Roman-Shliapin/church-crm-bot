// Обробник команди /candidates (нехрещені, тільки для адмінів)
import { Markup } from "telegraf";
import { readUnbaptizedMembers } from "../services/storage.js";
import { generateCandidatesExcel, deleteFile } from "../services/excel.js";

/**
 * Обробник команди /candidates - показує вибір формату (тільки для адмінів)
 */
export async function handleCandidates(ctx) {
  const candidates = await readUnbaptizedMembers();

  if (candidates.length === 0) {
    return ctx.reply("📭 Поки що немає зареєстрованих нехрещених.");
  }

  ctx.reply(
    "👥 Список нехрещених\n\n" +
    `Знайдено: ${candidates.length}\n\n` +
    "Оберіть формат відображення:",
    Markup.inlineKeyboard([
      [
        Markup.button.callback("💬 Показати в чаті", "candidates_show_chat"),
        Markup.button.callback("📊 Excel файл", "candidates_show_excel"),
      ],
    ])
  );
}

/**
 * Показує список нехрещених в чаті
 */
export async function handleCandidatesShowChat(ctx) {
  await ctx.answerCbQuery("Показую список нехрещених в чаті...");
  const candidates = await readUnbaptizedMembers();

  if (candidates.length === 0) {
    return ctx.reply("📭 Наразі немає зареєстрованих нехрещених.");
  }

  let message = "👥 *Список нехрещених:*\n\n";
  candidates.forEach((c, i) => {
    message += `${i + 1}. ${c.name}\n📅 Хрещення: ${c.baptism || "Ще не хрещений"}\n🎂 День народження: ${c.birthday || "не вказано"}\n📞 ${c.phone}\n\n`;
  });
  await ctx.replyWithMarkdown(message);
}

/**
 * Генерує та надсилає Excel файл зі списком нехрещених
 */
export async function handleCandidatesShowExcel(ctx) {
  await ctx.answerCbQuery("Генерую Excel файл...");
  const candidates = await readUnbaptizedMembers();

  if (candidates.length === 0) {
    await ctx.answerCbQuery("Немає нехрещених для експорту");
    return ctx.reply("📭 Наразі немає зареєстрованих нехрещених для експорту.");
  }

  try {
    const filePath = await generateCandidatesExcel(candidates);
    await ctx.replyWithDocument({ source: filePath });
    deleteFile(filePath);
  } catch (err) {
    console.error("Помилка генерації Excel:", err);
    await ctx.reply("⚠️ Не вдалося згенерувати Excel файл.");
  }
}

