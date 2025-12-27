// Обробник команди /members (тільки для адмінів)
import { Markup } from "telegraf";
import { readMembers } from "../services/storage.js";
import { generateMembersExcel, deleteFile } from "../services/excel.js";

/**
 * Обробник команди /members - показує вибір формату (тільки для адмінів)
 */
export async function handleMembers(ctx) {
  const members = await readMembers();

  if (members.length === 0) {
    return ctx.reply("📭 Поки що ніхто не зареєстрований.");
  }

  ctx.reply(
    "📋 Список членів церкви\n\n" +
    `Знайдено членів: ${members.length}\n\n` +
    "Оберіть формат відображення:",
    Markup.inlineKeyboard([
      [
        Markup.button.callback("💬 Показати в чаті", "members_show_chat"),
        Markup.button.callback("📊 Excel файл", "members_show_excel"),
      ],
    ])
  );
}

/**
 * Показує список членів в чаті
 */
export async function handleMembersShowChat(ctx) {
  await ctx.answerCbQuery("Показую список членів в чаті...");
  const members = await readMembers();

  let message = "📋 *Список зареєстрованих братів і сестер:*\n\n";
  members.forEach((m, i) => {
    message += `${i + 1}. ${m.name}\n📅 Хрещення: ${m.baptism}\n🎂 День народження: ${m.birthday || "не вказано"}\n📞 ${m.phone}\n\n`;
  });
  await ctx.replyWithMarkdown(message);
}

/**
 * Генерує та надсилає Excel файл зі списком членів
 */
export async function handleMembersShowExcel(ctx) {
  await ctx.answerCbQuery("Генерую Excel файл...");
  const members = await readMembers();

  try {
    const filePath = await generateMembersExcel(members);
    await ctx.replyWithDocument({ source: filePath });
    deleteFile(filePath);
  } catch (err) {
    console.error("Помилка генерації Excel:", err);
    await ctx.reply("⚠️ Не вдалося згенерувати Excel файл.");
  }
}

/**
 * Обробник команди /me - показує профіль користувача
 */
import { findMemberById } from "../services/storage.js";

export async function handleMe(ctx) {
  const member = await findMemberById(ctx.from.id);

  if (!member) {
    await ctx.reply("Вибачте, ви ще не зареєстровані ❌");
  } else {
    const message =
      `👤 *Ваш профіль*\n\n` +
      `📛 Ім'я: ${member.name}\n` +
      `📅 Хрещення: ${member.baptism}\n` +
      `🎂 День народження: ${member.birthday || "не вказано"}\n` +
      `📞 Телефон: ${member.phone}`;
    await ctx.replyWithMarkdown(message);
  }
}

