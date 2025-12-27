// Обробник запитів на літературу
import { Markup } from "telegraf";
import { addLiteratureRequest, findLiteratureRequestById, findMemberById } from "../services/storage.js";
import { createMainMenu } from "./commands.js";
import { createLiteratureRequest, createAdminLiteratureNotification } from "../utils/helpers.js";
import { ADMIN_IDS } from "../config/constants.js";
import { sanitizeText } from "../utils/validation.js";

/**
 * Обробник команди /literature або кнопки "Пошук літератури" - початок запиту
 */
export async function handleLiteratureStart(ctx) {
  const userId = ctx.from.id;
  const member = await findMemberById(userId);
  
  // Визначаємо ім'я користувача
  let userName = null;
  if (member) {
    // Якщо користувач зареєстрований - використовуємо ім'я з профілю
    userName = member.name;
  } else {
    // Якщо не зареєстрований - використовуємо ім'я з Telegram
    userName = ctx.from.last_name 
      ? `${ctx.from.first_name} ${ctx.from.last_name}`
      : ctx.from.first_name;
  }
  
  ctx.session = { step: "literature_request", data: { name: userName } };
  return ctx.reply(
    "📚 Яку літературу ви шукаєте?\n\n" +
    "Опишіть, будь ласка, ваш запит (наприклад: 'створення церкви', 'біблійні коментарі', тощо):",
    createMainMenu()
  );
}

/**
 * Обробка тексту запиту на літературу
 */
export async function handleLiteratureRequest(ctx, msg) {
  const step = ctx.session?.step;
  if (step !== "literature_request") {
    return false;
  }

  const sanitizedRequest = sanitizeText(msg, 5000);
  if (!sanitizedRequest) {
    ctx.reply("⚠️ Запит не може бути порожнім або перевищувати 5000 символів.");
    return true;
  }

  const literatureRequest = createLiteratureRequest({
    userId: ctx.from.id,
    name: ctx.session.data.name || null,
    request: sanitizedRequest,
  });

  try {
    await addLiteratureRequest(literatureRequest);
    await ctx.reply(
      "✅ Ваш запит надіслано! Почекайте, будь ласка, наші брати вам допоможуть 🙏",
      createMainMenu()
    );
    // Повідомлення адмінам
    await notifyAdmins(ctx, literatureRequest);
    ctx.session = null;
  } catch (err) {
    console.error("Помилка збереження запиту на літературу:", err);
    await ctx.reply("⚠️ Помилка збереження запиту. Спробуйте, будь ласка, пізніше.", createMainMenu());
    ctx.session = null;
  }

  return true;
}

/**
 * Надсилає повідомлення адмінам про новий запит на літературу
 */
async function notifyAdmins(ctx, literatureRequest) {
  const adminMessage = createAdminLiteratureNotification(literatureRequest);
  console.log("🟢 Надсилаю повідомлення адмінам про запит на літературу:", ADMIN_IDS);

  const replyKeyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback("❓ Уточнити", `clarify_literature_${literatureRequest.id}`),
      Markup.button.callback("💬 Відповісти", `reply_literature_${literatureRequest.id}`)
    ]
  ]);

  for (const adminId of ADMIN_IDS) {
    try {
      await ctx.telegram.sendMessage(adminId, adminMessage, {
        parse_mode: "Markdown",
        reply_markup: replyKeyboard.reply_markup,
      });
    } catch (err) {
      console.error("❌ Помилка надсилання адміну:", err);
    }
  }
}

/**
 * Обробник кнопки "Уточнити" на запит літератури
 */
export async function handleLiteratureClarifyStart(ctx) {
  const requestId = parseInt(ctx.match[1]);
  const request = await findLiteratureRequestById(requestId);

  if (!request) {
    return ctx.answerCbQuery("⚠️ Запит не знайдений");
  }

  // Зберігаємо в сесії, що адмін хоче уточнити цей запит
  ctx.session = {
    step: "literature_clarify_text",
    data: { requestId, userId: request.userId, adminId: ctx.from.id }
  };

  await ctx.answerCbQuery("✍️ Введіть питання для уточнення:");
  await ctx.reply(
    `✍️ Введіть питання для уточнення до запиту:\n\n` +
    `"${request.request}"\n\n` +
    `(Ви можете використати до 4000 символів)`
  );
}

/**
 * Обробка тексту уточнення від адміна
 */
export async function handleLiteratureClarifyText(ctx, msg) {
  const step = ctx.session?.step;
  if (step !== "literature_clarify_text") {
    return false;
  }

  const { requestId, userId, adminId } = ctx.session.data;
  const sanitizedText = sanitizeText(msg, 4000);
  
  if (!sanitizedText) {
    await ctx.reply("⚠️ Текст не може бути порожнім або перевищувати 4000 символів.");
    return true;
  }

  try {
    const request = await findLiteratureRequestById(requestId);
    if (!request) {
      await ctx.reply("⚠️ Запит не знайдений.");
      ctx.session = null;
      return true;
    }

    // Відправляємо питання користувачу з кнопкою для відповіді
    const userMessage = `❓ *Уточнення до вашого запиту на літературу:*\n\n${sanitizedText}\n\n_Натисніть кнопку нижче, щоб відповісти:_`;
    await ctx.telegram.sendMessage(userId, userMessage, {
      parse_mode: "Markdown",
      reply_markup: Markup.inlineKeyboard([
        [
          Markup.button.callback("💬 Відповісти", `reply_clarify_literature_${requestId}_${adminId}`)
        ]
      ]).reply_markup,
    });

    await ctx.reply("✅ Питання надіслано користувачу! Очікуємо відповіді.");
    ctx.session = null;
  } catch (err) {
    console.error("Помилка надсилання уточнення:", err);
    await ctx.reply("⚠️ Помилка надсилання уточнення. Можливо, користувач заблокував бота.");
    ctx.session = null;
  }

  return true;
}

/**
 * Обробник кнопки "Відповісти" від користувача на уточнення
 */
export async function handleLiteratureClarifyReplyStart(ctx) {
  const requestId = parseInt(ctx.match[1]);
  const adminId = parseInt(ctx.match[2]);
  const request = await findLiteratureRequestById(requestId);

  if (!request) {
    return ctx.answerCbQuery("⚠️ Запит не знайдений");
  }

  // Зберігаємо в сесії, що користувач хоче відповісти на уточнення
  ctx.session = {
    step: "literature_clarify_reply_text",
    data: { requestId, adminId }
  };

  await ctx.answerCbQuery("✍️ Введіть вашу відповідь:");
  await ctx.reply(
    `✍️ Введіть вашу відповідь на питання:\n\n` +
    `(Ви можете використати до 4000 символів)`
  );
}

/**
 * Обробка тексту відповіді користувача на уточнення
 */
export async function handleLiteratureClarifyReplyText(ctx, msg) {
  const step = ctx.session?.step;
  if (step !== "literature_clarify_reply_text") {
    return false;
  }

  const { requestId, adminId } = ctx.session.data;
  const sanitizedText = sanitizeText(msg, 4000);
  
  if (!sanitizedText) {
    await ctx.reply("⚠️ Текст не може бути порожнім або перевищувати 4000 символів.");
    return true;
  }

  try {
    const request = await findLiteratureRequestById(requestId);
    if (!request) {
      await ctx.reply("⚠️ Запит не знайдений.");
      ctx.session = null;
      return true;
    }

    // Відправляємо відповідь адміну з кнопкою для фінальної відповіді
    const adminMessage = `💬 *Відповідь на уточнення:*\n\n${sanitizedText}\n\n_Запит: ${request.request}_`;
    await ctx.telegram.sendMessage(adminId, adminMessage, {
      parse_mode: "Markdown",
      reply_markup: Markup.inlineKeyboard([
        [
          Markup.button.callback("💬 Відповісти", `final_reply_literature_${requestId}_${ctx.from.id}`)
        ]
      ]).reply_markup,
    });

    await ctx.reply("✅ Ваша відповідь надіслана! 🙏", createMainMenu());
    ctx.session = null;
  } catch (err) {
    console.error("Помилка надсилання відповіді:", err);
    await ctx.reply("⚠️ Помилка надсилання відповіді.");
    ctx.session = null;
  }

  return true;
}

/**
 * Обробник кнопки "Відповісти" від адміна на запит літератури
 */
export async function handleLiteratureReplyStart(ctx) {
  const requestId = parseInt(ctx.match[1]);
  const request = await findLiteratureRequestById(requestId);

  if (!request) {
    return ctx.answerCbQuery("⚠️ Запит не знайдений");
  }

  // Зберігаємо в сесії, що адмін хоче відповісти
  ctx.session = {
    step: "literature_reply_text",
    data: { requestId, userId: request.userId }
  };

  await ctx.answerCbQuery("✍️ Введіть текст відповіді або надішліть файл:");
  await ctx.reply(
    `✍️ Введіть текст відповіді для запиту:\n\n` +
    `"${request.request}"\n\n` +
    `(Ви можете надіслати текст або файл. Можна надіслати кілька файлів підряд)`
  );
}

/**
 * Обробка тексту відповіді адміна на запит літератури
 */
export async function handleLiteratureReplyText(ctx, msg) {
  const step = ctx.session?.step;
  if (step !== "literature_reply_text") {
    return false;
  }

  const { requestId, userId } = ctx.session.data;
  const sanitizedText = sanitizeText(msg, 4000);
  
  if (!sanitizedText) {
    await ctx.reply("⚠️ Текст не може бути порожнім або перевищувати 4000 символів.");
    return true;
  }

  try {
    // Відправляємо повідомлення користувачу
    const userMessage = `📬 *Відповідь на ваш запит на літературу:*\n\n${sanitizedText}`;
    await ctx.telegram.sendMessage(userId, userMessage, {
      parse_mode: "Markdown",
    });

    await ctx.reply("✅ Відповідь успішно надіслана!");
    ctx.session = null;
  } catch (err) {
    console.error("Помилка надсилання відповіді:", err);
    await ctx.reply("⚠️ Помилка надсилання відповіді. Можливо, користувач заблокував бота.");
    ctx.session = null;
  }

  return true;
}

/**
 * Обробник кнопки "Відповісти" від адміна після отримання уточнення
 */
export async function handleLiteratureFinalReplyStart(ctx) {
  const requestId = parseInt(ctx.match[1]);
  const userId = parseInt(ctx.match[2]);
  const request = await findLiteratureRequestById(requestId);

  if (!request) {
    return ctx.answerCbQuery("⚠️ Запит не знайдений");
  }

  // Зберігаємо в сесії, що адмін хоче відповісти фінальною відповіддю
  ctx.session = {
    step: "literature_reply_text",
    data: { requestId, userId }
  };

  await ctx.answerCbQuery("✍️ Введіть текст відповіді або надішліть файл:");
  await ctx.reply(
    `✍️ Введіть текст відповіді:\n\n` +
    `(Ви можете надіслати текст або файл. Можна надіслати кілька файлів підряд)`
  );
}

/**
 * Обробка документів від адміна для відповіді на запит літератури
 */
export async function handleLiteratureReplyDocument(ctx) {
  const step = ctx.session?.step;
  if (step !== "literature_reply_text") {
    return false;
  }

  const { requestId, userId } = ctx.session.data;

  try {
    const document = ctx.message.document;
    const fileId = document.file_id;

    // Відправляємо файл користувачу з повідомленням
    const caption = `📎 *Файл відповідно до вашого запиту на літературу*`;
    await ctx.telegram.sendDocument(userId, fileId, {
      caption: caption,
      parse_mode: "Markdown",
    });

    await ctx.reply("✅ Файл успішно надіслано!");
    // Не очищаємо сесію, щоб адмін міг надіслати ще файли
  } catch (err) {
    console.error("Помилка надсилання файлу:", err);
    await ctx.reply("⚠️ Помилка надсилання файлу. Можливо, користувач заблокував бота.");
  }

  return true;
}

