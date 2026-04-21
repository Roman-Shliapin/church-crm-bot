// Обробник заявок на допомогу
import { Markup } from "telegraf";
import { readNeeds, readActiveNeeds, readArchivedNeeds, addNeed, addMember, findMemberById, findNeedById, updateNeedStatus, updateNeedFields, deleteNeedById, findLatestHumanitarianNeedByCategory } from "../services/storage.js";
import { createMainMenu, createConfirmSendMenu } from "./commands.js";
import { isAdmin } from "../middlewares/admin.js";
import { ADMIN_IDS, STATUS_MAP, NEED_STATUS } from "../config/constants.js";
import { formatNeedMessage, createAdminNotification, createNeed } from "../utils/helpers.js";
import { validateName, validatePhone, validateBirthDate, sanitizeText } from "../utils/validation.js";
import { generateNeedsExcel, deleteFile } from "../services/excel.js";
import { generateNeedsPdfBuffer } from "../services/pdf.js";

/** Якщо false — кнопка «Хімія» показує повідомлення про недоступність (змініть на true, коли знову буде допомога). */
export const HUMANITARIAN_CHEMISTRY_AVAILABLE = false;

function buildNeedManageKeyboard(need) {
  // Вимога:
  // - після "Відповісти": прибрати "Відповісти", лишити "В процесі" + "Виконано"
  // - після "В процесі": прибрати "В процесі", але лишити "Відповісти" + "Виконано"
  const showReply = !need?.repliedAt;
  const showWaiting = !(need?.waitingAt || need?.inProgressAt);
  const rows = [];

  if (showReply) {
    rows.push([Markup.button.callback("💬 Відповісти", `reply_need_${need.id}`)]);
  }

  const row2 = [Markup.button.callback("✅ Виконано", `need_done_${need.id}`)];
  if (showWaiting) {
    row2.push(Markup.button.callback("🕓 В очікуванні", `need_progress_${need.id}`));
  }
  rows.push(row2);

  rows.push([Markup.button.callback("🗑️ Видалити", `need_delete_${need.id}`)]);

  return Markup.inlineKeyboard(rows);
}

/**
 * Створює меню вибору типу допомоги
 */
export function createNeedTypeMenu() {
  return Markup.keyboard([
    ["🛒 Гуманітарна допомога", "💬 Інше"],
    ["🏠 Повернутися до головного меню"]
  ])
    .resize()
    .persistent();
}

/**
 * Меню категорій гуманітарної допомоги
 */
export function createHumanitarianCategoryMenu() {
  // Вимога: тільки 2 кнопки
  return Markup.keyboard([["Продукти", "Хімія"]]).resize().persistent();
}

export function createGuestRegistrationConfirmMenu() {
  return Markup.keyboard([["Так", "Ні"]]).resize().persistent();
}

/**
 * Обробник команди /need - тільки для створення заявки
 */
export async function handleNeedStart(ctx) {
  const userId = ctx.from.id;
  const member = await findMemberById(userId);

  ctx.session = { step: "need_type_selection", data: {} };
  
  if (member) {
    // Член церкви - зберігаємо дані користувача
    ctx.session.data.user = member;
  }

  return ctx.reply(
    "🙏 Оберіть тип допомоги:",
    createNeedTypeMenu()
  );
}

/**
 * Обробник вибору типу допомоги (через reply keyboard)
 */
export async function handleNeedTypeSelection(ctx, msg) {
  const step = ctx.session?.step;
  if (step !== "need_type_selection") {
    return false;
  }

  const member = ctx.session?.data?.user;
  let needType = null;

  if (msg === "🛒 Гуманітарна допомога") {
    needType = "humanitarian";
  } else if (msg === "💬 Інше") {
    needType = "other";
  } else if (msg === "🏠 Повернутися до головного меню") {
    const menu = await createMainMenu(ctx);
    ctx.session = null;
    return ctx.reply("🏠 Повернулися до головного меню", menu);
  } else {
    return false; // Не наш крок
  }

  ctx.session.data.needType = needType;

  // Гуманітарна допомога: обираємо категорію (Продукти/Хімія)
  if (needType === "humanitarian") {
    ctx.session.step = "need_humanitarian_category";
    return ctx.reply("🛒 Оберіть, будь ласка, що саме потрібно:", createHumanitarianCategoryMenu());
  }

  if (member) {
    // Член церкви - тільки опис
    ctx.session.step = "need_description";
    const menu = await createMainMenu(ctx);
    return ctx.reply("✍️ Опишіть, будь ласка, вашу потребу:", menu);
  } else {
    // Гість - збираємо дані
    ctx.session.step = "need_guest_fullname";
    const menu = await createMainMenu(ctx);
    return ctx.reply("👋 Вкажіть, будь ласка, ваше ПІБ (прізвище, імʼя, по батькові):", menu);
  }
}

/**
 * Обробник вибору категорії гуманітарної допомоги (через reply keyboard)
 */
export async function handleNeedHumanitarianCategorySelection(ctx, msg) {
  const step = ctx.session?.step;
  if (step !== "need_humanitarian_category") return false;

  if (msg === "Хімія" && !HUMANITARIAN_CHEMISTRY_AVAILABLE) {
    await ctx.reply(
      "🧴 Допомога з хімії наразі недоступна.\n\n" +
        "Ми повідомимо вас про зміни, щойно з'явиться можливість.\n\n" +
        "Можете обрати «Продукти» або повернутися в головне меню.",
      createHumanitarianCategoryMenu()
    );
    return true;
  }

  let description = null;
  if (msg === "Продукти") description = "Продукти";
  if (msg === "Хімія") description = "Хімія";
  if (!description) return false;

  // 25-денний ліміт: тільки для гуманітарної допомоги і окремо по категоріям "Продукти"/"Хімія"
  const categoryKey = description === "Продукти" ? "products" : "chemistry";
  const COOLDOWN_DAYS = 25;
  const COOLDOWN_MS = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  const last = await findLatestHumanitarianNeedByCategory(ctx.from.id, categoryKey);
  if (last) {
    const lastTs =
      (typeof last.createdAt === "string" && Date.parse(last.createdAt)) ||
      (typeof last.id === "number" ? last.id : NaN);
    if (!Number.isNaN(lastTs)) {
      const diff = Date.now() - lastTs;
      if (diff < COOLDOWN_MS) {
        const remainingDays = Math.ceil((COOLDOWN_MS - diff) / (24 * 60 * 60 * 1000));
        const menu = await createMainMenu(ctx);
        ctx.session = null;
        await ctx.reply(
          `⛔ Ви вже подавали гуманітарну заявку (*${description}*) нещодавно.\n\n` +
            `Можна подати наступну заявку цієї категорії через *${remainingDays}* дн.`,
          { parse_mode: "Markdown", reply_markup: menu.reply_markup }
        );
        return true;
      }
    }
  }

  ctx.session.data.description = description;

  const member = ctx.session?.data?.user;
  if (member) {
    const need = createNeed({
      userId: ctx.from.id,
      name: member.name,
      baptism: member.baptism,
      birthday: member.birthday,
      phone: member.phone,
      description,
      type: "humanitarian",
    });

    await addNeed(need);
    const menu = await createMainMenu(ctx);
    await ctx.reply("✅ Дякуємо! Заявку збережено 🙏", menu);
    await notifyAdmins(ctx, need);
    ctx.session = null;
    return true;
  }

  // Гість: збираємо дані
  ctx.session.step = "need_guest_fullname";
  const menu = await createMainMenu(ctx);
  await ctx.reply("👋 Вкажіть, будь ласка, ваше ПІБ (прізвище, імʼя, по батькові):", menu);
  return true;
}

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
    const userMessage = `📬 *Повідомлення щодо вашої заявки на допомогу:*\n\n${sanitizedText}`;
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

/**
 * Обробка кроків створення заявки через текст
 */
export async function handleNeedSteps(ctx, msg) {
  const step = ctx.session?.step;
  if (!step || (!step.startsWith("need_") && step !== "need_description")) {
    return false; // Не наш крок
  }

  // === ПІДТВЕРДЖЕННЯ РЕЄСТРАЦІЇ ДЛЯ ГОСТЯ (інакше заявку анулюємо) ===
  if (step === "need_guest_confirm_registration") {
    const lower = (msg || "").toString().trim().toLowerCase();
    const yes = lower === "так" || lower === "✅ так" || lower === "yes";
    const no = lower === "ні" || lower === "нi" || lower === "нет" || lower === "no" || lower === "❌ ні";

    if (!yes && !no) {
      await ctx.reply("Будь ласка, оберіть: Так або Ні", createGuestRegistrationConfirmMenu());
      return true;
    }

    if (no) {
      const menu = await createMainMenu(ctx);
      ctx.session = null;
      await ctx.reply("❌ Заявку анульовано (реєстрацію не підтверджено).", menu);
      return true;
    }

    // yes: реєструємо як кандидата (нехрещеного) і створюємо заявку
    const data = ctx.session.data || {};
    const userId = ctx.from.id;

    try {
      // якщо раптом вже зареєстрований — не падаємо
      const existing = await findMemberById(userId);
      if (!existing) {
        await addMember({
          id: userId,
          name: data.name,
          phone: data.phone,
          birthday: data.birthday,
          baptized: false,
          baptism: null,
          registeredAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      // якщо дубль — просто продовжуємо (заявка важливіша)
    }

    try {
      const need = createNeed({
        userId,
        name: data.name,
        baptism: "Не член церкви",
        birthday: data.birthday,
        phone: data.phone,
        description: data.description,
        type: data.needType || "other",
      });

      await addNeed(need);
      await notifyAdmins(ctx, need);

      const menu = await createMainMenu(ctx);
      ctx.session = null;
      await ctx.reply("✅ Дякуємо! Реєстрацію підтверджено, заявку збережено 🙏", menu);
      return true;
    } catch (err) {
      const menu = await createMainMenu(ctx);
      ctx.session = null;
      await ctx.reply("⚠️ Не вдалося зберегти заявку. Спробуйте ще раз.", menu);
      return true;
    }
  }

  // === ЗАЯВКА ОТ ГОСТЯ (НЕ ЧЛЕНА ЦЕРКВИ) ===
  if (step === "need_guest_fullname" || step === "need_guest_name") {
    const validatedName = validateName(msg);
    if (!validatedName) {
      ctx.reply("⚠️ Будь ласка, введіть коректне ПІБ (2-100 символів, тільки букви).");
      return true;
    }
    ctx.session.data.name = validatedName;
    ctx.session.step = "need_guest_birthdate";
    ctx.reply("🎂 Вкажіть вашу дату народження у форматі ДД-ММ-РРРР (наприклад 05-01-1998):");
    return true;
  }

  if (step === "need_guest_birthdate") {
    const validatedBirthDate = validateBirthDate(msg);
    if (!validatedBirthDate) {
      ctx.reply("⚠️ Будь ласка, введіть коректну дату у форматі ДД-ММ-РРРР (наприклад 05-01-1998).");
      return true;
    }
    ctx.session.data.birthday = validatedBirthDate;
    ctx.session.step = "need_guest_phone";
    ctx.reply("📞 Вкажіть ваш номер телефону (+380...):");
    return true;
  }

  if (step === "need_guest_phone") {
    const validatedPhone = validatePhone(msg);
    if (!validatedPhone) {
      ctx.reply("⚠️ Будь ласка, введіть коректний номер телефону у форматі +380XXXXXXXXX або 0XXXXXXXXX.");
      return true;
    }
    ctx.session.data.phone = validatedPhone;

    // Якщо це гуманітарна допомога — опис вже обрано (Продукти/Хімія), більше нічого не питаємо
    if (ctx.session.data.needType === "humanitarian" && ctx.session.data.description) {
      // Підтвердження реєстрації перед збереженням заявки
      ctx.session.step = "need_guest_confirm_registration";
      await ctx.reply(
        "✅ Дані отримано.\n\n" +
          "Підтвердіть, будь ласка, реєстрацію.\n" +
          "Якщо ви не підтвердите — заявка буде *анульована*.",
        { parse_mode: "Markdown", reply_markup: createGuestRegistrationConfirmMenu().reply_markup }
      );
      return true;
    }

    // Інше — просимо опис
    ctx.session.step = "need_guest_description";
    ctx.reply("✍️ Опишіть вашу потребу:");
    return true;
  }

  if (step === "need_guest_description") {
    const sanitizedDescription = sanitizeText(msg, 5000);
    if (!sanitizedDescription) {
      ctx.reply("⚠️ Опис не може бути порожнім або перевищувати 5000 символів.");
      return true;
    }

    // Зберігаємо опис у сесії і просимо підтвердження реєстрації
    ctx.session.data.description = sanitizedDescription;
    ctx.session.step = "need_guest_confirm_registration";
    await ctx.reply(
      "✅ Дані отримано.\n\n" +
        "Підтвердіть, будь ласка, реєстрацію.\n" +
        "Якщо ви не підтвердите — заявка буде *анульована*.",
      { parse_mode: "Markdown", reply_markup: createGuestRegistrationConfirmMenu().reply_markup }
    );
    return true;
  }

  // === ЗАЯВКА ОТ ЧЛЕНА ЦЕРКВИ ===
  if (step === "need_description") {
    const sanitizedDescription = sanitizeText(msg, 5000);
    if (!sanitizedDescription) {
      ctx.reply("⚠️ Опис не може бути порожнім або перевищувати 5000 символів.");
      return true;
    }
    const user = ctx.session.data.user;
    const need = createNeed({
      userId: ctx.from.id,
      name: user.name,
      baptism: user.baptism,
      birthday: user.birthday,
      phone: user.phone,
      description: sanitizedDescription,
      type: ctx.session.data.needType || "other",
    });

    await addNeed(need);
    const menu = await createMainMenu(ctx);
    await ctx.reply("✅ Ваша заявка на допомогу збережена 🙏", menu);

    // Повідомлення адмінам
    await notifyAdmins(ctx, need);
    ctx.session = null;
    return true;
  }

  return false;
}

/**
 * Створює меню для адміна при отриманні заявки на допомогу (без ID в тексті)
 */
/**
 * Надсилає повідомлення адмінам про нову заявку
 */
async function notifyAdmins(ctx, need) {
  const adminMessage = createAdminNotification(need);
  console.log("🟢 Надсилаю повідомлення адмінам:", ADMIN_IDS);

  for (const adminId of ADMIN_IDS) {
    try {
      // ВАЖЛИВО: не показуємо кнопку "Написати відповідь" при надходженні нової заявки.
      // Адмін керує заявками через "🛠️ Керувати потребами".
      const menu = await createMainMenu({ from: { id: adminId } });
      await ctx.telegram.sendMessage(adminId, adminMessage, {
        parse_mode: "Markdown",
        reply_markup: menu.reply_markup,
      });
    } catch (err) {
      console.error("❌ Помилка надсилання адміну:", err);
    }
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

// ==================== РОЗДІЛЕННЯ ЗАЯВОК НА 3 СПИСКИ (БОТОМ) ====================

const PRODUCTS_KEYWORDS = [
  "продукт",
  "харч",
  "їж",
  "круп",
  "макарон",
  "консерв",
  "олія",
  "масло",
  "борошн",
  "цукор",
];
const CHEMISTRY_KEYWORDS = [
  "хім",
  "хими",
  "побутова хім",
  "порош",
  "миюч",
  "мило",
  "шампун",
  "зубн",
  "паста",
  "папір",
  "серветк",
];

function normalizeText(s) {
  return (s || "").toString().toLowerCase().trim();
}

function classifyNeedCategory(need) {
  // Явне правило для "Інше"
  if (need?.type === "other") return "other";

  const desc = normalizeText(need?.description);

  // Гуманітарні: визначаємо по ключових словах
  if (need?.type === "humanitarian") {
    if (PRODUCTS_KEYWORDS.some((k) => desc.includes(k))) return "products";
    if (CHEMISTRY_KEYWORDS.some((k) => desc.includes(k))) return "chemistry";
    return "other";
  }

  // fallback (на випадок старих записів без type)
  if (PRODUCTS_KEYWORDS.some((k) => desc.includes(k))) return "products";
  if (CHEMISTRY_KEYWORDS.some((k) => desc.includes(k))) return "chemistry";
  return "other";
}

function getCategoryLabel(key) {
  if (key === "products") return "Продукти";
  if (key === "chemistry") return "Хімія";
  return "Інше";
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

// ==================== АРХІВ: РОЗДІЛЕННЯ НА 3 СПИСКИ + CHAT/PDF ====================

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

