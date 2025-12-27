// Обробник команди /members (тільки для адмінів)
import { readMembers } from "../services/storage.js";
import { generateMembersExcel, deleteFile } from "../services/excel.js";

/**
 * Обробник команди /members - показує список членів та генерує Excel
 */
export async function handleMembers(ctx) {
  ctx.reply("✅ Команда отримана, перевіряю доступ...");

  const members = readMembers();

  if (members.length === 0) {
    return ctx.reply("📭 Поки що ніхто не зареєстрований.");
  }

  // Форматування текстового списку
  let message = "📋 *Список зареєстрованих братів і сестер:*\n\n";
  members.forEach((m, i) => {
    message += `${i + 1}. ${m.name}\n📅 Хрещення: ${m.baptism}\n🎂 День народження: ${m.birthday || "не вказано"}\n📞 ${m.phone}\n\n`;
  });
  ctx.reply(message, { parse_mode: "Markdown" });

  // Генерація та надсилання Excel файлу
  try {
    const filePath = await generateMembersExcel(members);
    await ctx.replyWithDocument({ source: filePath });
    deleteFile(filePath);
  } catch (err) {
    console.error("Помилка генерації Excel:", err);
    ctx.reply("⚠️ Не вдалося згенерувати Excel файл.");
  }
}

/**
 * Обробник команди /me - показує профіль користувача
 */
import { findMemberById } from "../services/storage.js";

export function handleMe(ctx) {
  const member = findMemberById(ctx.from.id);

  if (!member) {
    ctx.reply("Вибачте, ви ще не зареєстровані ❌");
  } else {
    const message =
      `👤 *Ваш профіль*\n\n` +
      `📛 Ім'я: ${member.name}\n` +
      `📅 Хрещення: ${member.baptism}\n` +
      `🎂 День народження: ${member.birthday || "не вказано"}\n` +
      `📞 Телефон: ${member.phone}`;
    ctx.replyWithMarkdown(message);
  }
}

