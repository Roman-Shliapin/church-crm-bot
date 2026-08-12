// Обробник команди /members (тільки для адмінів) та редагування профілю
import { Markup } from "telegraf";
import {
  readBaptizedMembers,
  findMemberById,
  moveMemberToCandidates,
  updateMember,
  getHumanitarianReport,
} from "../services/storage.js";
import {
  validateName,
  validatePhone,
  validateBaptismDate,
  validateBirthDate,
} from "../utils/validation.js";
import { generateMembersExcel, generateHumanitarianReportExcel, deleteFile } from "../services/excel.js";
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
 * Меню вибору категорії для звіту по гуманітарній допомозі
 */
export async function handleHumanitarianReportMenu(ctx) {
  return ctx.reply(
    "📊 Звіт по гуманітарній допомозі\n\nОберіть тип допомоги:",
    Markup.inlineKeyboard([
      [Markup.button.callback("🥫 Продукти", "humanitarian_report_products")],
      [Markup.button.callback("🧴 Хімія", "humanitarian_report_chemistry")],
      [Markup.button.callback("💬 Інше", "humanitarian_report_other")],
      [Markup.button.callback("📋 Всі разом", "humanitarian_report_all")],
    ])
  );
}

/**
 * Генерує та надсилає Excel звіт по гуманітарній допомозі
 * @param {Object} ctx
 * @param {"products"|"chemistry"|"other"|"all"} categoryKey
 */
export async function handleHumanitarianReportExcel(ctx, categoryKey) {
  await ctx.answerCbQuery("Генерую звіт...");

  const categoryLabels = {
    products: "продукти",
    chemistry: "хімія",
    other: "інше",
    all: "всі",
  };

  try {
    const records = await getHumanitarianReport(categoryKey);
    if (records.length === 0) {
      return ctx.reply("📭 Немає виконаних заявок у цій категорії.");
    }

    const filePath = await generateHumanitarianReportExcel(
      records,
      categoryLabels[categoryKey]
    );
    await ctx.replyWithDocument({ source: filePath });
    deleteFile(filePath);
  } catch (err) {
    console.error("Помилка генерації звіту по допомозі:", err);
    await ctx.reply("⚠️ Не вдалося згенерувати звіт.");
  }
}

/**
 * Обробник команди /me - показує профіль користувача з можливістю редагування
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
      `📞 Телефон: ${member.phone || "не вказано"}`;
    await ctx.replyWithMarkdown(message, Markup.inlineKeyboard([
      [Markup.button.callback("✏️ Редагувати профіль", "profile_edit_menu")],
    ]));
    await ctx.reply("Оберіть кнопки нижче для навігації:", menu);
  }
}

/**
 * Показує меню редагування профілю (що змінити)
 */
export async function handleProfileEditMenu(ctx) {
  await ctx.answerCbQuery();
  const menu = await createMainMenu(ctx);
  await ctx.reply(
    "✏️ Що хочете змінити? Оберіть поле:",
    Markup.inlineKeyboard([
      [Markup.button.callback("📛 Ім'я", "profile_edit_name")],
      [Markup.button.callback("📅 Дата хрещення", "profile_edit_baptism")],
      [Markup.button.callback("🎂 День народження", "profile_edit_birthday")],
      [Markup.button.callback("📞 Телефон", "profile_edit_phone")],
      [Markup.button.callback("❌ Відмінити", "profile_edit_cancel")],
    ])
  );
  await ctx.reply("Або використовуйте кнопки меню нижче:", menu);
}

/**
 * Callback: почати редагування конкретного поля (встановлює крок, просить ввести)
 */
export async function handleProfileEditField(ctx, field) {
  await ctx.answerCbQuery();
  ctx.session = { step: `profile_edit_${field}`, data: {} };
  const prompts = {
    name: "📛 Введіть нове ім'я та прізвище (2-100 символів, тільки букви, пробіли, дефіси):",
    baptism:
      "📅 Введіть дату хрещення (ДД-ММ-РРРР) або напишіть «Ще не хрещений»:",
    birthday: "🎂 Введіть дату народження (ДД-ММ-РРРР):",
    phone: "📞 Введіть номер телефону (+380XXXXXXXXX або 0XXXXXXXXX):",
  };
  await ctx.reply(prompts[field] || "Введіть нове значення:");
}

/**
 * Callback: скасувати редагування профілю
 */
export async function handleProfileEditCancel(ctx) {
  await ctx.answerCbQuery("Скасовано");
  ctx.session = null;
  const menu = await createMainMenu(ctx);
  await ctx.reply("Редагування скасовано.", menu);
}

/**
 * Обробляє текст під час редагування профілю
 * @returns {Promise<boolean>} true якщо оброблено
 */
export async function handleProfileEditText(ctx, msg) {
  const step = ctx.session?.step;
  if (!step || typeof step !== "string" || !step.startsWith("profile_edit_")) {
    return false;
  }
  const field = step.replace("profile_edit_", "");
  const menu = await createMainMenu(ctx);

  if (field === "name") {
    const validated = validateName(msg);
    if (!validated) {
      await ctx.reply(
        "⚠️ Будь ласка, введіть коректне ім'я (2-100 символів, тільки букви, пробіли, дефіси)."
      );
      return true;
    }
    const result = await updateMember(ctx.from.id, { name: validated });
    if (!result.ok) {
      await ctx.reply("⚠️ Не вдалося оновити. Спробуйте ще раз.", menu);
    } else {
      await ctx.reply(`✅ Ім'я оновлено: ${validated}`, menu);
    }
  } else if (field === "baptism") {
    const lower = msg.trim().toLowerCase();
    if (lower === "ще не хрещений" || lower === "ще не хрещена") {
      const result = await updateMember(ctx.from.id, {
        baptism: "Ще не хрещений",
        baptized: false,
      });
      if (!result.ok) {
        await ctx.reply("⚠️ Не вдалося оновити. Спробуйте ще раз.", menu);
      } else {
        await ctx.reply("✅ Дата хрещення оновлена: Ще не хрещений", menu);
      }
    } else {
      const validated = validateBaptismDate(msg);
      if (!validated) {
        await ctx.reply(
          "⚠️ Введіть коректну дату (ДД-ММ-РРРР) або «Ще не хрещений»."
        );
        return true;
      }
      const result = await updateMember(ctx.from.id, {
        baptism: validated,
        baptized: true,
      });
      if (!result.ok) {
        await ctx.reply("⚠️ Не вдалося оновити. Спробуйте ще раз.", menu);
      } else {
        await ctx.reply(`✅ Дата хрещення оновлена: ${validated}`, menu);
      }
    }
  } else if (field === "birthday") {
    const validated = validateBirthDate(msg);
    if (!validated) {
      await ctx.reply("⚠️ Введіть коректну дату (ДД-ММ-РРРР).");
      return true;
    }
    const result = await updateMember(ctx.from.id, { birthday: validated });
    if (!result.ok) {
      await ctx.reply("⚠️ Не вдалося оновити. Спробуйте ще раз.", menu);
    } else {
      await ctx.reply(`✅ День народження оновлено: ${validated}`, menu);
    }
  } else if (field === "phone") {
    const validated = validatePhone(msg);
    if (!validated) {
      await ctx.reply("⚠️ Введіть коректний номер (+380XXXXXXXXX або 0XXXXXXXXX).");
      return true;
    }
    const result = await updateMember(ctx.from.id, { phone: validated });
    if (!result.ok) {
      await ctx.reply("⚠️ Не вдалося оновити. Спробуйте ще раз.", menu);
    } else {
      await ctx.reply(`✅ Телефон оновлено: ${validated}`, menu);
    }
  } else {
    ctx.session = null;
    return true;
  }

  ctx.session = null;
  return true;
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

