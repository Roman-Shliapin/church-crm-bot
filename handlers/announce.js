// Обробник оголошень (тільки для адмінів)
import { Markup } from "telegraf";
import { readMembers, readBaptizedMembers, readUnbaptizedMembers } from "../services/storage.js";
import { sanitizeText } from "../utils/validation.js";
import { createConfirmSendMenu } from "./commands.js";

/**
 * Обробник команди /announce - початок створення оголошення (тільки для адмінів)
 */
export function handleAnnounceStart(ctx) {
  ctx.session = { step: "announce_audience", data: {} };
  ctx.reply(
    "📢 Створення оголошення\n\n" +
    "Оберіть цільову аудиторію:",
    Markup.inlineKeyboard([
      [
        Markup.button.callback("✅ Для членів церкви (хрещені)", "announce_baptized"),
      ],
      [
        Markup.button.callback("⏳ Для нехрещених (кандидатів)", "announce_unbaptized"),
      ],
      [
        Markup.button.callback("👥 Для всіх зареєстрованих", "announce_all"),
      ],
    ])
  );
}

/**
 * Обробник вибору цільової аудиторії
 */
export async function handleAnnounceAudience(ctx, audienceType) {
  ctx.session.data.audienceType = audienceType;
  ctx.session.step = "announce_text";
  
  const audienceNames = {
    baptized: "членів церкви (хрещених)",
    unbaptized: "нехрещених (кандидатів)",
    all: "всіх зареєстрованих",
  };
  
  ctx.answerCbQuery(`Обрано: ${audienceNames[audienceType]}`);
  ctx.reply(
    `📢 Оголошення для ${audienceNames[audienceType]}\n\n` +
    "Введіть текст оголошення:"
  );
}

/**
 * Обробка тексту оголошення та розсилка відповідній аудиторії
 */
export async function handleAnnounceText(ctx, msg) {
  const step = ctx.session?.step;
  if (step !== "announce_text") {
    return false;
  }

  const audienceType = ctx.session.data?.audienceType || "all";

  const textToProcess = ctx.session.data?.confirmed ? ctx.session.data.pendingText : msg;
  const sanitizedText = sanitizeText(textToProcess, 4000);
  if (!sanitizedText) {
    await ctx.reply("⚠️ Текст оголошення не може бути порожнім або перевищувати 4000 символів.");
    return true;
  }

  if (!ctx.session.data?.confirmed) {
    const audienceLabels = {
      baptized: "хрещених членів церкви",
      unbaptized: "нехрещених (кандидатів)",
      all: "всіх зареєстрованих",
    };
    ctx.session.data.pendingText = sanitizedText;
    ctx.session.step = "announce_text_confirm";
    await ctx.reply(
      `📋 *Перегляд оголошення для ${audienceLabels[audienceType]}:*\n\n${sanitizedText}`,
      { parse_mode: "Markdown", reply_markup: createConfirmSendMenu().reply_markup }
    );
    return true;
  }
  delete ctx.session.data.confirmed;

  // Отримуємо відповідний список користувачів
  let members = [];
  let audienceName = "";

  if (audienceType === "baptized") {
    members = await readBaptizedMembers();
    audienceName = "хрещених членів церкви";
  } else if (audienceType === "unbaptized") {
    members = await readUnbaptizedMembers();
    audienceName = "нехрещених (кандидатів)";
  } else {
    members = await readMembers();
    audienceName = "всіх зареєстрованих";
  }

  if (members.length === 0) {
    await ctx.reply(`⚠️ Немає ${audienceName} для розсилки.`);
    ctx.session = null;
    return true;
  }

  const announcement = `📢 *Оголошення*\n\n${sanitizedText}`;

  let sentCount = 0;
  let failedCount = 0;

  for (const member of members) {
    try {
      await ctx.telegram.sendMessage(member.id, announcement, {
        parse_mode: "Markdown",
      });
      sentCount++;
    } catch (err) {
      console.error(`Помилка надсилання користувачу ${member.id}:`, err);
      failedCount++;
    }
  }

  await ctx.reply(
    `✅ Оголошення надіслано ${audienceName}!\n\n` +
    `📊 Статистика:\n` +
    `• Відправлено: ${sentCount}\n` +
    `• Не вдалося відправити: ${failedCount}`
  );

  ctx.session = null;
  return true;
}
