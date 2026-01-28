// Обробник команди /members (тільки для адмінів)
import { Markup } from "telegraf";
import { readBaptizedMembers, findMemberById, moveMemberToCandidates } from "../services/storage.js";
import { generateMembersExcel, deleteFile } from "../services/excel.js";
import { createMainMenu } from "./commands.js";

/**
 * Обробник команди /members - показує вибір формату (тільки для адмінів, тільки хрещені)
 */
export async function handleMembers(ctx) {
  const members = await readBaptizedMembers();

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
  const members = await readBaptizedMembers();

  if (members.length === 0) {
    return ctx.reply("📭 Немає зареєстрованих членів церкви.");
  }

  await ctx.reply(`📋 *Список зареєстрованих братів і сестер:* ${members.length}\n\n(по 1 людині на повідомлення)`, {
    parse_mode: "Markdown",
  });

  const slice = members.slice(0, 50);
  for (const m of slice) {
    const text =
      `👤 *${m.name}*\n` +
      `📅 Хрещення: ${m.baptism || "не вказано"}\n` +
      `🎂 День народження: ${m.birthday || "не вказано"}\n` +
      `📞 ${m.phone || "не вказано"}`;

    await ctx.replyWithMarkdown(
      text,
      Markup.inlineKeyboard([
        [Markup.button.callback("➡️ Перемістити до нехрещених", `member_to_candidate_${m.id}`)],
      ])
    );
  }

  if (members.length > slice.length) {
    await ctx.reply(`ℹ️ Показано ${slice.length} з ${members.length}.`);
  }
}

/**
 * Генерує та надсилає Excel файл зі списком членів
 */
export async function handleMembersShowExcel(ctx) {
  await ctx.answerCbQuery("Генерую Excel файл...");
  const members = await readBaptizedMembers();

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
export async function handleMe(ctx) {
  const member = await findMemberById(ctx.from.id);
  const menu = await createMainMenu(ctx);

  if (!member) {
    await ctx.reply("Вибачте, ви ще не зареєстровані ❌", menu);
  } else {
    const message =
      `👤 *Ваш профіль*\n\n` +
      `📛 Ім'я: ${member.name}\n` +
      `📅 Хрещення: ${member.baptism || (member.baptized === false ? "Ще не хрещений" : "не вказано")}\n` +
      `🎂 День народження: ${member.birthday || "не вказано"}\n` +
      `📞 Телефон: ${member.phone}`;
    await ctx.replyWithMarkdown(message, menu);
  }
}

/**
 * Кнопка: старт переносу members -> candidates (показує підтвердження)
 */
export async function handleMemberMoveToCandidatesStart(ctx) {
  const memberId = parseInt(ctx.match[1], 10);
  try {
    await ctx.answerCbQuery("Підтвердіть дію");
  } catch (err) {
    // ignore
  }

  try {
    await ctx.editMessageReplyMarkup(
      Markup.inlineKeyboard([
        [Markup.button.callback("✅ Підтвердити", `member_to_candidate_confirm_${memberId}`)],
        [Markup.button.callback("❌ Скасувати", `member_to_candidate_cancel_${memberId}`)],
      ]).reply_markup
    );
  } catch (err) {
    // ignore
  }
}

export async function handleMemberMoveToCandidatesCancel(ctx) {
  const memberId = parseInt(ctx.match[1], 10);
  try {
    await ctx.answerCbQuery("Скасовано");
  } catch (err) {
    // ignore
  }

  try {
    await ctx.editMessageReplyMarkup(
      Markup.inlineKeyboard([
        [Markup.button.callback("➡️ Перемістити до нехрещених", `member_to_candidate_${memberId}`)],
      ]).reply_markup
    );
  } catch (err) {
    // ignore
  }
}

export async function handleMemberMoveToCandidatesConfirm(ctx) {
  const memberId = parseInt(ctx.match[1], 10);
  try {
    await ctx.answerCbQuery("Переміщую...");
  } catch (err) {
    // ignore
  }

  const result = await moveMemberToCandidates(memberId);
  if (!result.ok) {
    const msg =
      result.reason === "not_found"
        ? "⚠️ Не знайдено в списку членів (можливо вже переміщено)."
        : "⚠️ Не вдалося перемістити. Спробуйте ще раз.";
    try {
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    } catch (err) {
      // ignore
    }
    try {
      await ctx.reply(msg);
    } catch (err) {
      // ignore
    }
    return;
  }

  try {
    // Додаємо позначку і прибираємо кнопки
    const currentText = ctx.update?.callback_query?.message?.text || "";
    const newText = currentText ? `${currentText}\n\n✅ *Переміщено до нехрещених*` : "✅ *Переміщено до нехрещених*";
    await ctx.editMessageText(newText, { parse_mode: "Markdown" });
  } catch (err) {
    try {
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    } catch (e2) {
      // ignore
    }
  }
}

