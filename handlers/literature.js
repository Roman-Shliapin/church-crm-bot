// Обробник запитів на літературу
import { Markup } from "telegraf";
import { addLiteratureRequest, findLiteratureRequestById, findMemberById, readLiteratureRequests } from "../services/storage.js";
import { getCollection } from "../services/database.js";
import { createMainMenu, createConfirmSendMenu } from "./commands.js";
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
  const menu = await createMainMenu(ctx);
  return ctx.reply(
    "📚 Яку літературу ви шукаєте?\n\n" +
    "Опишіть, будь ласка, ваш запит (наприклад: 'створення церкви', 'біблійні коментарі', тощо):",
    menu
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
      await createMainMenu(ctx)
    );
    // Повідомлення адмінам
    await notifyAdmins(ctx, literatureRequest);
    ctx.session = null;
  } catch (err) {
    console.error("Помилка збереження запиту на літературу:", err);
    const menu = await createMainMenu(ctx);
    await ctx.reply("⚠️ Помилка збереження запиту. Спробуйте, будь ласка, пізніше.", menu);
    ctx.session = null;
  }

  return true;
}

/**
 * Створює меню для адміна при отриманні запиту на літературу (без ID в тексті)
 */
function createAdminLiteratureMenu() {
  return Markup.keyboard([
    ["📚 Уточнити", "📚 Відповісти"]
  ])
    .resize()
    .persistent();
}

/**
 * Створює меню для адміна після отримання уточнення від користувача
 */
function createAdminLiteratureClarifyReplyMenu() {
  return Markup.keyboard([
    ["📚 Остаточна відповідь", "🏠 На головне меню"]
  ])
    .resize()
    .persistent();
}

/**
 * Надсилає повідомлення адмінам про новий запит на літературу
 */
async function notifyAdmins(ctx, literatureRequest) {
  const adminMessage = createAdminLiteratureNotification(literatureRequest);
  console.log("🟢 Надсилаю повідомлення адмінам про запит на літературу:", ADMIN_IDS);

  // Використовуємо reply keyboard меню замість inline кнопок
  const replyKeyboard = createAdminLiteratureMenu();

  for (const adminId of ADMIN_IDS) {
    try {
      // Відправляємо повідомлення адміну
      await ctx.telegram.sendMessage(adminId, adminMessage, {
        parse_mode: "Markdown",
        reply_markup: replyKeyboard.reply_markup,
      });
      
      // Зберігаємо literatureRequestId в сесії адміна
      if (!global.adminLiteratureSessions) {
        global.adminLiteratureSessions = new Map();
      }
      global.adminLiteratureSessions.set(adminId, literatureRequest.id);
    } catch (err) {
      console.error("❌ Помилка надсилання адміну:", err);
    }
  }
}

/**
 * Створює меню для відповіді на уточнення користувача (література)
 */
function createLiteratureClarifyReplyMenu() {
  return Markup.keyboard([
    ["✍️ Написати уточнення"]
  ])
    .resize()
    .persistent();
}

/**
 * Обробник кнопки "Уточнити" на запит літератури (через reply keyboard)
 */
export async function handleLiteratureClarifyStart(ctx, msg = null) {
  let requestId;
  
  // Якщо викликано через reply keyboard (msg містить текст кнопки)
  if (msg && msg === "📚 Уточнити") {
    // Отримуємо requestId з сесії адміна
    if (global.adminLiteratureSessions && global.adminLiteratureSessions.has(ctx.from.id)) {
      requestId = global.adminLiteratureSessions.get(ctx.from.id);
    } else {
      await ctx.reply("⚠️ Не знайдено активного запиту. Очікуйте нове повідомлення.");
      return;
    }
  } else if (ctx.match) {
    // Якщо викликано через callback (inline кнопка - для сумісності)
    requestId = parseInt(ctx.match[1]);
  } else {
    await ctx.reply("⚠️ Помилка обробки запиту.");
    return;
  }
  
  const request = await findLiteratureRequestById(requestId);

  if (!request) {
    if (msg) {
      await ctx.reply("⚠️ Запит не знайдений");
    } else {
      await ctx.answerCbQuery("⚠️ Запит не знайдений");
    }
    return;
  }

  // Зберігаємо в сесії, що адмін хоче уточнити цей запит
  ctx.session = {
    step: "literature_clarify_text",
    data: { requestId, userId: request.userId, adminId: ctx.from.id }
  };

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
  const textToProcess = ctx.session.data?.confirmed ? ctx.session.data.pendingText : msg;
  const sanitizedText = sanitizeText(textToProcess, 4000);
  
  if (!sanitizedText) {
    await ctx.reply("⚠️ Текст не може бути порожнім або перевищувати 4000 символів.");
    return true;
  }

  if (!ctx.session.data?.confirmed) {
    ctx.session.data.pendingText = sanitizedText;
    ctx.session.step = "literature_clarify_text_confirm";
    await ctx.reply(
      `📋 *Перегляд уточнення:*\n\n${sanitizedText}`,
      { parse_mode: "Markdown", reply_markup: createConfirmSendMenu().reply_markup }
    );
    return true;
  }
  delete ctx.session.data.confirmed;

  try {
    const request = await findLiteratureRequestById(requestId);
    if (!request) {
      await ctx.reply("⚠️ Запит не знайдений.");
      ctx.session = null;
      return true;
    }

    // Зберігаємо в базі даних, що користувач має відповісти на уточнення
    const collection = await getCollection("literature_requests");
    await collection.findOneAndUpdate(
      { id: requestId },
      { $set: { 
        clarifyingAdminId: adminId,
        clarificationText: sanitizedText,
        needsClarificationReply: true
      } }
    );
    
    // Відправляємо питання користувачу з reply keyboard для відповіді
    const userMessage = `❓ *Уточнення до вашого запиту на літературу:*\n\n${sanitizedText}\n\n_Натисніть кнопку нижче, щоб написати уточнення:_`;
    await ctx.telegram.sendMessage(userId, userMessage, {
      parse_mode: "Markdown",
      reply_markup: createLiteratureClarifyReplyMenu().reply_markup,
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
 * Обробник кнопки "Написати уточнення" від користувача (через reply keyboard)
 */
export async function handleLiteratureClarifyReplyStart(ctx) {
  // Перевіряємо, чи є активне уточнення для цього користувача
  const requests = await readLiteratureRequests();
  const userRequests = requests
    .filter(r => r.userId === ctx.from.id && r.needsClarificationReply === true)
    .sort((a, b) => b.id - a.id);
  
  if (userRequests.length === 0) {
    const menu = await createMainMenu(ctx);
    return ctx.reply("⚠️ Не знайдено активних уточнень для відповіді.", menu);
  }

  // Беремо останній запит з уточненням
  const request = userRequests[0];
  
  // Зберігаємо в сесії, що користувач хоче відповісти на уточнення
  ctx.session = {
    step: "literature_clarify_reply_text",
    data: { 
      requestId: request.id,
      adminId: request.clarifyingAdminId
    }
  };

  const menu = createLiteratureClarifyReplyMenu();
  await ctx.reply(
    `✍️ Введіть ваше уточнення:\n\n` +
    `(Ви можете використати до 4000 символів)`,
    menu
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

    // Оновлюємо запит - уточнення отримано
    const collection = await getCollection("literature_requests");
    await collection.findOneAndUpdate(
      { id: requestId },
      { $set: { needsClarificationReply: false, clarificationReply: sanitizedText } }
    );
    
    // Оновлюємо сесію адміна з новим requestId
    if (!global.adminLiteratureSessions) {
      global.adminLiteratureSessions = new Map();
    }
    global.adminLiteratureSessions.set(adminId, requestId);
    
    // Відправляємо відповідь адміну з меню "Остаточна відповідь" або "На головне меню"
    const adminMessage = `💬 *Відповідь на уточнення:*\n\n${sanitizedText}\n\n_Запит: ${request.request}_`;
    const adminMenu = createAdminLiteratureClarifyReplyMenu();
    await ctx.telegram.sendMessage(adminId, adminMessage, {
      parse_mode: "Markdown",
      reply_markup: adminMenu.reply_markup,
    });

    const menu = await createMainMenu(ctx);
    await ctx.reply("✅ Ваша відповідь надіслана! 🙏", menu);
    ctx.session = null;
  } catch (err) {
    console.error("Помилка надсилання відповіді:", err);
    await ctx.reply("⚠️ Помилка надсилання відповіді.");
    ctx.session = null;
  }

  return true;
}

/**
 * Обробник кнопки "Відповісти" на запит літератури (через reply keyboard)
 */
export async function handleLiteratureReplyStart(ctx, msg = null) {
  let requestId;
  
  // Якщо викликано через reply keyboard (msg містить текст кнопки)
  if (msg && (msg === "📚 Відповісти" || msg === "📚 Остаточна відповідь")) {
    // Отримуємо requestId з сесії адміна
    if (global.adminLiteratureSessions && global.adminLiteratureSessions.has(ctx.from.id)) {
      requestId = global.adminLiteratureSessions.get(ctx.from.id);
    } else {
      await ctx.reply("⚠️ Не знайдено активного запиту. Очікуйте нове повідомлення.");
      return;
    }
  } else if (ctx.match) {
    // Якщо викликано через callback (inline кнопка - для сумісності)
    requestId = parseInt(ctx.match[1]);
  } else {
    await ctx.reply("⚠️ Помилка обробки запиту.");
    return;
  }
  
  const request = await findLiteratureRequestById(requestId);

  if (!request) {
    if (msg) {
      await ctx.reply("⚠️ Запит не знайдений");
    } else {
      await ctx.answerCbQuery("⚠️ Запит не знайдений");
    }
    return;
  }

  // Зберігаємо в сесії, що адмін хоче відповісти
  ctx.session = {
    step: "literature_reply_text",
    data: { requestId, userId: request.userId }
  };

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
  const textToProcess = ctx.session.data?.confirmed ? ctx.session.data.pendingText : msg;
  const sanitizedText = sanitizeText(textToProcess, 4000);
  
  if (!sanitizedText) {
    await ctx.reply("⚠️ Текст не може бути порожнім або перевищувати 4000 символів.");
    return true;
  }

  if (!ctx.session.data?.confirmed) {
    ctx.session.data.pendingText = sanitizedText;
    ctx.session.step = "literature_reply_text_confirm";
    await ctx.reply(
      `📋 *Перегляд відповіді:*\n\n${sanitizedText}`,
      { parse_mode: "Markdown", reply_markup: createConfirmSendMenu().reply_markup }
    );
    return true;
  }
  delete ctx.session.data.confirmed;

  try {
    // Відправляємо повідомлення користувачу
    const userMessage = `📬 *Відповідь на ваш запит на літературу:*\n\n${sanitizedText}`;
    await ctx.telegram.sendMessage(userId, userMessage, {
      parse_mode: "Markdown",
    });

    // Очищаємо сесію адміна для цього запиту
    if (global.adminLiteratureSessions) {
      global.adminLiteratureSessions.delete(ctx.from.id);
    }

    // Повертаємо головне меню адміну
    const menu = await createMainMenu(ctx);
    await ctx.reply("✅ Відповідь успішно надіслана!", menu);
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

