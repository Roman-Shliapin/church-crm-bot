// Обробник оголошень (тільки для адмінів)
import { readMembers } from "../services/storage.js";
import { checkAdmin } from "../middlewares/admin.js";
import { sanitizeText } from "../utils/validation.js";

/**
 * Обробник команди /announce - створення оголошення (тільки для адмінів)
 */
export function handleAnnounceStart(ctx) {
  ctx.session = { step: "announce_text", data: {} };
  ctx.reply(
    "📢 Створення оголошення для всіх членів церкви.\n\n" +
    "Введіть текст оголошення:"
  );
}

/**
 * Обробка тексту оголошення та розсилка всім членам
 */
export async function handleAnnounceText(ctx, msg) {
  const step = ctx.session?.step;
  if (step !== "announce_text") {
    return false;
  }

  // Валідація та санітизація тексту оголошення
  const sanitizedText = sanitizeText(msg, 4000);
  if (!sanitizedText) {
    await ctx.reply("⚠️ Текст оголошення не може бути порожнім або перевищувати 4000 символів.");
    return true;
  }

  const members = await readMembers();

  if (members.length === 0) {
    await ctx.reply("⚠️ Немає зареєстрованих членів церкви для розсилки.");
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
      console.error(`Помилка надсилання члену ${member.id}:`, err);
      failedCount++;
    }
  }

  await ctx.reply(
    `✅ Оголошення надіслано!\n\n` +
    `📊 Статистика:\n` +
    `• Відправлено: ${sentCount}\n` +
    `• Не вдалося відправити: ${failedCount}`
  );

  ctx.session = null;
  return true;
}
