import { Markup } from "telegraf";
import { readNeeds, readActiveNeeds, readArchivedNeeds } from "../../services/storage.js";
import { NEED_STATUS } from "../../config/constants.js";
import { formatNeedMessage } from "../../utils/helpers.js";
import { generateNeedsExcel, deleteFile } from "../../services/excel.js";
import { generateNeedsPdfBuffer } from "../../services/pdf.js";
import { isAdmin } from "../../middlewares/admin.js";
import { createMainMenu } from "../commands.js";
import { buildNeedManageKeyboard } from "./menus.js";
import { classifyNeedCategory, getCategoryLabel } from "./category.js";

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
 * Адмін: показати активні заявки на допомогу з меню керування
 * (кожна заявка з 3 inline-кнопками під повідомленням)
 */
export async function handleAdminNeedsManageList(ctx) {
  if (!isAdmin(ctx.from?.id)) {
    const menu = await createMainMenu(ctx);
    return ctx.reply("⚠️ Ця функція доступна лише для служителів.", menu);
  }

  const needs = await readActiveNeeds();
  if (needs.length === 0) {
    return ctx.reply("📭 Немає активних заявок на допомогу.");
  }

  await ctx.reply(`🆘 Активні заявки на допомогу: ${needs.length}`);

  for (const need of needs) {
    const message = formatNeedMessage(need);
    await ctx.replyWithMarkdown(
      message,
      buildNeedManageKeyboard(need)
    );
  }
}

/**
 * Адмін: показати архівні (виконані) заявки на допомогу
 */
export async function handleAdminNeedsArchiveList(ctx) {
  if (!isAdmin(ctx.from?.id)) {
    const menu = await createMainMenu(ctx);
    return ctx.reply("⚠️ Ця функція доступна лише для служителів.", menu);
  }

  const needs = await readArchivedNeeds();
  if (needs.length === 0) {
    return ctx.reply("📦 Архів порожній: немає виконаних заявок.");
  }

  // Найновіші зверху
  needs.sort((a, b) => (b.doneAt || b.date || "").localeCompare(a.doneAt || a.date || ""));

  await ctx.reply(`📦 Виконані заявки: ${needs.length}`);

  // Щоб не засмічувати чат — показуємо максимум 50
  const slice = needs.slice(0, 50);
  for (const need of slice) {
    const doneLine = need.doneAt ? `\n✅ *Виконано:* ${need.doneAt}` : "";
    await ctx.replyWithMarkdown(formatNeedMessage(need) + doneLine);
  }

  if (needs.length > slice.length) {
    await ctx.reply(`ℹ️ Показано ${slice.length} з ${needs.length}.`);
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

export async function handleAdminNeedsCategoryMenu(ctx, categoryKey) {
  if (!isAdmin(ctx.from?.id)) {
    const menu = await createMainMenu(ctx);
    return ctx.reply("⚠️ Ця функція доступна лише для служителів.", menu);
  }

  const label = getCategoryLabel(categoryKey);
  return ctx.reply(`📋 Потреби: *${label}*\n\nОберіть дію:`, {
    parse_mode: "Markdown",
    reply_markup: Markup.inlineKeyboard([
      [
        Markup.button.callback("💬 Показати в чаті", `needs_cat_${categoryKey}_chat`),
        Markup.button.callback("📄 PDF таблиця", `needs_cat_${categoryKey}_pdf`),
      ],
    ]).reply_markup,
  });
}

export async function handleAdminNeedsCategoryShowChat(ctx) {
  const categoryKey = ctx.match[1];
  const label = getCategoryLabel(categoryKey);

  await ctx.answerCbQuery("Показую...");
  const needs = await readActiveNeeds();
  const filtered = needs.filter((n) => classifyNeedCategory(n) === categoryKey);

  if (filtered.length === 0) {
    return ctx.reply(`📭 Немає активних заявок у категорії: ${label}`);
  }

  await ctx.reply(`🆘 Активні заявки (${label}): ${filtered.length}`);
  for (const need of filtered) {
    await ctx.replyWithMarkdown(formatNeedMessage(need), buildNeedManageKeyboard(need));
  }
}

export async function handleAdminNeedsCategoryShowPdf(ctx) {
  const categoryKey = ctx.match[1];
  const label = getCategoryLabel(categoryKey);

  try {
    await ctx.answerCbQuery("Генерую PDF...");
  } catch (err) {
    // ignore
  }

  try {
    const needs = await readActiveNeeds();
    const filtered = needs.filter((n) => classifyNeedCategory(n) === categoryKey);

    const rows = filtered.map((n) => {
      const isDone = n.status === NEED_STATUS.DONE || n.archived === true || !!n.doneAt;
      const isWaiting = n.status === NEED_STATUS.WAITING || !!n.waitingAt || !!n.inProgressAt;
      const statusLabel = isDone ? "виконано" : isWaiting ? "в очікуванні" : "—";
      const statusDate = isDone
        ? (n.doneAt || "—")
        : isWaiting
          ? (n.waitingAt || n.inProgressAt || "—")
          : "—";

      return {
        name: n.name,
        birthday: n.birthday,
        phone: n.phone,
        categoryLabel: label,
        statusLabel,
        statusDate,
      };
    });

    const title = `Таблиця потреб: ${label}`;
    const buffer = await generateNeedsPdfBuffer({ title, needs: rows });
    const filename = `needs-${categoryKey}-${new Date().toISOString().slice(0, 10)}.pdf`;

    if (!buffer || buffer.length === 0) {
      return ctx.reply("⚠️ Не вдалося згенерувати PDF (порожній файл). Спробуйте ще раз.");
    }

    await ctx.replyWithDocument({ source: buffer, filename });
  } catch (err) {
    console.error("Помилка генерації PDF:", err);
    await ctx.reply("⚠️ Не вдалося згенерувати PDF. Спробуйте ще раз.");
  }
}

export async function handleAdminNeedsArchiveCategoryMenu(ctx, categoryKey) {
  if (!isAdmin(ctx.from?.id)) {
    const menu = await createMainMenu(ctx);
    return ctx.reply("⚠️ Ця функція доступна лише для служителів.", menu);
  }

  const label = getCategoryLabel(categoryKey);
  return ctx.reply(`📦 Архів: *${label}*\n\nОберіть дію:`, {
    parse_mode: "Markdown",
    reply_markup: Markup.inlineKeyboard([
      [
        Markup.button.callback("💬 Показати в чаті", `needs_arch_cat_${categoryKey}_chat`),
        Markup.button.callback("📄 PDF таблиця", `needs_arch_cat_${categoryKey}_pdf`),
      ],
    ]).reply_markup,
  });
}

export async function handleAdminNeedsArchiveCategoryShowChat(ctx) {
  const categoryKey = ctx.match[1];
  const label = getCategoryLabel(categoryKey);

  await ctx.answerCbQuery("Показую...");
  const needs = await readArchivedNeeds();
  const filtered = needs.filter((n) => classifyNeedCategory(n) === categoryKey);

  if (filtered.length === 0) {
    return ctx.reply(`📦 Архів порожній для категорії: ${label}`);
  }

  // Найновіші зверху
  filtered.sort((a, b) => (b.doneAt || b.date || "").localeCompare(a.doneAt || a.date || ""));

  await ctx.reply(`📦 Виконані заявки (${label}): ${filtered.length}`);

  const slice = filtered.slice(0, 50);
  for (const need of slice) {
    const doneLine = need.doneAt ? `\n✅ *Виконано:* ${need.doneAt}` : "";
    await ctx.replyWithMarkdown(formatNeedMessage(need) + doneLine);
  }

  if (filtered.length > slice.length) {
    await ctx.reply(`ℹ️ Показано ${slice.length} з ${filtered.length}.`);
  }
}

export async function handleAdminNeedsArchiveCategoryShowPdf(ctx) {
  const categoryKey = ctx.match[1];
  const label = getCategoryLabel(categoryKey);

  try {
    await ctx.answerCbQuery("Генерую PDF...");
  } catch (err) {
    // ignore
  }

  try {
    const needs = await readArchivedNeeds();
    const filtered = needs.filter((n) => classifyNeedCategory(n) === categoryKey);

    const rows = filtered.map((n) => {
      return {
        name: n.name,
        birthday: n.birthday,
        phone: n.phone,
        categoryLabel: label,
        statusLabel: "виконано",
        statusDate: n.doneAt || "—",
      };
    });

    const title = `Таблиця потреб (архів): ${label}`;
    const buffer = await generateNeedsPdfBuffer({ title, needs: rows });
    const filename = `needs-archive-${categoryKey}-${new Date().toISOString().slice(0, 10)}.pdf`;

    if (!buffer || buffer.length === 0) {
      return ctx.reply("⚠️ Не вдалося згенерувати PDF (порожній файл). Спробуйте ще раз.");
    }

    await ctx.replyWithDocument({ source: buffer, filename });
  } catch (err) {
    console.error("Помилка генерації PDF (архів):", err);
    await ctx.reply("⚠️ Не вдалося згенерувати PDF. Спробуйте ще раз.");
  }
}
