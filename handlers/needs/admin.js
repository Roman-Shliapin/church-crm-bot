import { Markup } from "telegraf";
import { findNeedById, updateNeedStatus, updateNeedFields, deleteNeedById } from "../../services/storage.js";
import { STATUS_MAP, NEED_STATUS } from "../../config/constants.js";
import { formatNeedMessage } from "../../utils/helpers.js";
import { sanitizeText } from "../../utils/validation.js";
import { createMainMenu, createConfirmSendMenu } from "../commands.js";
import { buildNeedManageKeyboard } from "./menus.js";

/**
 * Адмін: позначити заявку як "в процесі" + повідомити користувача
 */
export async function handleAdminNeedMarkProgress(ctx) {
  const needId = parseInt(ctx.match[1]);
  const need = await findNeedById(needId);
  if (!need) {
    return ctx.answerCbQuery("⚠️ Заявка не знайдена");
  }

  // Оновлюємо статус у БД + фіксуємо дію адміна
  const now = new Date().toISOString();
  const updated = await updateNeedFields(needId, {
    status: NEED_STATUS.WAITING,
    inProgressAt: now,
    inProgressBy: ctx.from?.id,
    waitingAt: now,
    waitingBy: ctx.from?.id,
    lastAction: "in_progress",
    lastActionAt: now,
    lastActionBy: ctx.from?.id,
  });
  await ctx.answerCbQuery("🕓 Позначено: в очікуванні");

  // Повідомляємо користувача
  try {
    await ctx.telegram.sendMessage(
      need.userId,
      "⏳ Ваша заявка на допомогу взята в роботу. Ми вже працюємо над цим 🙏"
    );
  } catch (err) {
    // якщо користувач заблокував бота — просто мовчки
  }

  // Оновлюємо повідомлення у чаті адміна і оновлюємо клавіатуру:
  // - якщо "Відповісти" ще не натискали — лишаємо "💬 Відповісти" + "✅ Виконано"
  // - якщо вже відповідали — лишаємо тільки "✅ Виконано"
  try {
    const msg = formatNeedMessage(updated || need);
    const showReply = !(updated || need)?.repliedAt;
    await ctx.editMessageText(msg + "\n\n🕓 *В очікуванні*", {
      parse_mode: "Markdown",
      reply_markup: Markup.inlineKeyboard([
        ...(showReply ? [[Markup.button.callback("💬 Відповісти", `reply_need_${needId}`)]] : []),
        [Markup.button.callback("✅ Виконано", `need_done_${needId}`)],
        [Markup.button.callback("🗑️ Видалити", `need_delete_${needId}`)],
      ]).reply_markup,
    });
  } catch (err) {
    // ignore
  }
}

/**
 * Адмін: позначити заявку як виконану і прибрати зі списку Telegram
 * ВАЖЛИВО: запис НЕ видаляємо з MongoDB — ставимо archived=true
 */
export async function handleAdminNeedMarkDone(ctx) {
  const needId = parseInt(ctx.match[1]);
  const need = await findNeedById(needId);
  if (!need) {
    return ctx.answerCbQuery("⚠️ Заявка не знайдена");
  }

  // Переходимо в режим "виконано + повідомлення"
  ctx.session = {
    step: "need_done_reply_text",
    data: {
      needId,
      userId: need.userId,
      messageChatId: ctx.chat?.id,
      messageId: ctx.update?.callback_query?.message?.message_id,
    },
  };

  await ctx.answerCbQuery("✍️ Напишіть повідомлення і заявка буде виконана");
  await ctx.reply(
    "✍️ Введіть повідомлення для людини.\n\n" +
      "Після відправки заявка буде *виконана* та потрапить в *архів*.",
    { parse_mode: "Markdown" }
  );
}

/**
 * Адмін: текст для сценарію "виконано + повідомлення" (після натискання ✅ Виконано)
 */
export async function handleAdminNeedDoneText(ctx, msg) {
  if (ctx.session?.step !== "need_done_reply_text") return false;

  const { needId, userId, messageChatId, messageId } = ctx.session.data || {};
  const textToProcess = ctx.session.data?.confirmed ? ctx.session.data.pendingText : msg;
  const sanitizedText = sanitizeText(textToProcess, 4000);
  if (!sanitizedText) {
    await ctx.reply("⚠️ Текст не може бути порожнім або перевищувати 4000 символів.");
    return true;
  }

  if (!ctx.session.data?.confirmed) {
    ctx.session.data.pendingText = sanitizedText;
    ctx.session.step = "need_done_reply_text_confirm";
    await ctx.reply(
      `📋 *Перегляд повідомлення (заявка буде виконана):*\n\n${sanitizedText}`,
      { parse_mode: "Markdown", reply_markup: createConfirmSendMenu().reply_markup }
    );
    return true;
  }
  delete ctx.session.data.confirmed;

  const need = await findNeedById(needId);
  if (!need) {
    const menu = await createMainMenu(ctx);
    await ctx.reply("⚠️ Заявка не знайдена.", menu);
    ctx.session = null;
    return true;
  }

  try {
    // 1) Надсилаємо повідомлення користувачу
    const userMessage =
      `📬 *Повідомлення щодо вашої заявки на допомогу:*\n\n${sanitizedText}`;
    await ctx.telegram.sendMessage(userId, userMessage, { parse_mode: "Markdown" });

    // 2) Архівуємо в БД (НЕ видаляємо) + фіксуємо дію адміна
    const now = new Date().toISOString();
    const updated = await updateNeedFields(needId, {
      status: NEED_STATUS.DONE,
      archived: true,
      doneAt: now,
      doneMessage: sanitizedText,
      doneBy: ctx.from?.id,
      lastAction: "done",
      lastActionAt: now,
      lastActionBy: ctx.from?.id,
    });

    // 3) Прибираємо кнопки під повідомленням у Telegram (щоб зникло зі списку)
    try {
      if (messageChatId && messageId) {
        const text = formatNeedMessage(updated || need) + "\n\n✅ *Виконано*";
        await ctx.telegram.editMessageText(messageChatId, messageId, undefined, text, {
          parse_mode: "Markdown",
        });
      }
    } catch (err) {
      // ignore
    }

    const menu = await createMainMenu(ctx);
    await ctx.reply("✅ Виконано: повідомлення надіслано, заявка додана в архів.", menu);
    ctx.session = null;
    return true;
  } catch (err) {
    const menu = await createMainMenu(ctx);
    await ctx.reply(
      "⚠️ Не вдалося надіслати повідомлення користувачу (можливо, він заблокував бота).",
      menu
    );
    ctx.session = null;
    return true;
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

/**
 * Обробник кнопки "Написати відповідь" на заявку (через reply keyboard)
 */
export async function handleNeedReplyStart(ctx, msg = null) {
  let needId;
  
  // Якщо викликано через reply keyboard (msg містить текст кнопки)
  if (msg && msg === "💬 Написати відповідь") {
    // Отримуємо needId з сесії адміна
    if (global.adminNeedSessions && global.adminNeedSessions.has(ctx.from.id)) {
      needId = global.adminNeedSessions.get(ctx.from.id);
    } else {
      await ctx.reply("⚠️ Не знайдено активної заявки. Очікуйте нове повідомлення.");
      return;
    }
  } else if (ctx.match) {
    // Якщо викликано через callback (inline кнопка - для сумісності)
    needId = parseInt(ctx.match[1]);
  } else {
    await ctx.reply("⚠️ Помилка обробки запиту.");
    return;
  }
  
  const need = await findNeedById(needId);

  if (!need) {
    if (msg) {
      await ctx.reply("⚠️ Заявка не знайдена");
    } else {
      await ctx.answerCbQuery("⚠️ Заявка не знайдена");
    }
    return;
  }

  // Зберігаємо в сесії, що адмін хоче відповісти на цю заявку
  ctx.session = {
    step: "need_reply_text",
    data: {
      needId,
      userId: need.userId,
      // щоб після відповіді прибрати кнопки в повідомленні зі списку
      messageChatId: ctx.chat?.id,
      messageId: ctx.update?.callback_query?.message?.message_id,
    }
  };

  await ctx.reply(
    `✍️ Введіть текст відповіді для ${need.name}:\n\n` +
    `(Ви можете використати до 4000 символів)`
  );
}

/**
 * Обробка тексту відповіді адміна на заявку
 */
export async function handleNeedReplyText(ctx, msg) {
  const step = ctx.session?.step;
  if (step !== "need_reply_text") {
    return false;
  }

  const { needId, userId, messageChatId, messageId } = ctx.session.data;
  const textToProcess = ctx.session.data?.confirmed ? ctx.session.data.pendingText : msg;
  const sanitizedText = sanitizeText(textToProcess, 4000);
  
  if (!sanitizedText) {
    await ctx.reply("⚠️ Текст не може бути порожнім або перевищувати 4000 символів.");
    return true;
  }

  if (!ctx.session.data?.confirmed) {
    ctx.session.data.pendingText = sanitizedText;
    ctx.session.step = "need_reply_text_confirm";
    await ctx.reply(
      `📋 *Перегляд відповіді:*\n\n${sanitizedText}`,
      { parse_mode: "Markdown", reply_markup: createConfirmSendMenu().reply_markup }
    );
    return true;
  }
  delete ctx.session.data.confirmed;

  try {
    const now = new Date().toISOString();
    // Відправляємо повідомлення користувачу
    const userMessage = `📬 *Відповідь на вашу заявку:*\n\n${sanitizedText}`;
    await ctx.telegram.sendMessage(userId, userMessage, {
      parse_mode: "Markdown",
    });

    // Фіксуємо відповідь адміна в БД (НЕ архівуємо)
    await updateNeedFields(needId, {
      repliedAt: now,
      repliedBy: ctx.from?.id,
      replyMessage: sanitizedText,
      lastAction: "replied",
      lastActionAt: now,
      lastActionBy: ctx.from?.id,
    });

    // Оновлюємо кнопки під повідомленням у списку:
    // після "Відповісти" прибираємо тільки "💬 Відповісти", лишаємо "🕓 В очікуванні" + "✅ Виконано"
    try {
      if (messageChatId && messageId) {
        const currentNeed = await findNeedById(needId);
        const safeNeed =
          currentNeed ||
          { id: needId, status: "оновлено", name: "-", baptism: "-", phone: "-", description: "-", type: "other", date: "-" };
        const text = formatNeedMessage(safeNeed) + "\n\n✅ *Відповідь надіслана*";

        // Якщо заявка вже "в очікуванні" — кнопку "🕓 В очікуванні" не показуємо.
        // Після відповіді "💬 Відповісти" вже не показуємо, тож:
        // - якщо waitingAt/inProgressAt є: показуємо тільки "✅ Виконано"
        // - якщо нема: "✅ Виконано" + "🕓 В очікуванні"
        // В обох випадках додаємо "🗑️ Видалити".
        const alreadyWaiting = !!(safeNeed?.waitingAt || safeNeed?.inProgressAt);
        const keyboardRows = alreadyWaiting
          ? [
              [Markup.button.callback("✅ Виконано", `need_done_${needId}`)],
              [Markup.button.callback("🗑️ Видалити", `need_delete_${needId}`)],
            ]
          : [
              [
                Markup.button.callback("✅ Виконано", `need_done_${needId}`),
                Markup.button.callback("🕓 В очікуванні", `need_progress_${needId}`),
              ],
              [Markup.button.callback("🗑️ Видалити", `need_delete_${needId}`)],
            ];

        await ctx.telegram.editMessageText(messageChatId, messageId, undefined, text, {
          parse_mode: "Markdown",
          reply_markup: Markup.inlineKeyboard(keyboardRows).reply_markup,
        });
      }
    } catch (err) {
      // ignore
    }

    // Очищаємо сесію адміна для цієї заявки
    if (global.adminNeedSessions) {
      global.adminNeedSessions.delete(ctx.from.id);
    }

    // Повертаємо головне меню адміну
    const menu = await createMainMenu(ctx);
    await ctx.reply("✅ Відповідь успішно надіслана!", menu);
    ctx.session = null;
  } catch (err) {
    console.error("Помилка надсилання відповіді:", err);
    const menu = await createMainMenu(ctx);
    await ctx.reply("⚠️ Помилка надсилання відповіді. Можливо, користувач заблокував бота.", menu);
    ctx.session = null;
  }

  return true;
}

/**
 * Адмін: видалити заявку назавжди (з Telegram і з MongoDB)
 */
export async function handleAdminNeedDelete(ctx) {
  const needId = parseInt(ctx.match[1]);

  try {
    await ctx.answerCbQuery("⚠️ Підтвердіть видалення");
  } catch (err) {
    // ignore
  }

  try {
    await ctx.editMessageReplyMarkup(
      Markup.inlineKeyboard([
        [Markup.button.callback("✅ Підтвердити видалення", `need_delete_confirm_${needId}`)],
        [Markup.button.callback("❌ Скасувати", `need_delete_cancel_${needId}`)],
      ]).reply_markup
    );
  } catch (err) {
    // ignore
  }
}

export async function handleAdminNeedDeleteCancel(ctx) {
  const needId = parseInt(ctx.match[1]);
  const need = await findNeedById(needId);
  if (!need) {
    try {
      await ctx.answerCbQuery("⚠️ Уже не існує");
    } catch (err) {
      // ignore
    }
    try {
      await ctx.deleteMessage();
      return;
    } catch (err) {
      // ignore
    }
    return;
  }

  try {
    await ctx.answerCbQuery("✅ Скасовано");
  } catch (err) {
    // ignore
  }

  try {
    await ctx.editMessageReplyMarkup(buildNeedManageKeyboard(need).reply_markup);
  } catch (err) {
    // ignore
  }
}

export async function handleAdminNeedDeleteConfirm(ctx) {
  const needId = parseInt(ctx.match[1]);

  try {
    await ctx.answerCbQuery("🗑️ Видаляю...");
  } catch (err) {
    // ignore
  }

  const deleted = await deleteNeedById(needId);
  if (!deleted) {
    try {
      await ctx.answerCbQuery("⚠️ Не знайдено (можливо вже видалено)");
    } catch (err) {
      // ignore
    }
  }

  // Прибираємо повідомлення зі списку, або міняємо текст
  try {
    await ctx.deleteMessage();
    return;
  } catch (err) {
    // fallback
  }

  try {
    await ctx.editMessageText("🗑️ *Заявку видалено*", { parse_mode: "Markdown" });
  } catch (err) {
    // ignore
  }
}
