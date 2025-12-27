// Обробник молитвенних потреб
import { Markup } from "telegraf";
import { readPrayers, addPrayer, findMemberById, findPrayerById } from "../services/storage.js";
import { createMainMenu } from "./commands.js";
import { formatPrayerMessage, createPrayer, createAdminPrayerNotification } from "../utils/helpers.js";
import { ADMIN_IDS } from "../config/constants.js";
import { sanitizeText } from "../utils/validation.js";
import { generatePrayersExcel, deleteFile } from "../services/excel.js";

/**
 * Обробник команди /pray - додати молитвенну потребу
 */
export async function handlePrayStart(ctx) {
  const userId = ctx.from.id;
  const member = await findMemberById(userId);

  if (member) {
    // Член церкви - можна додати ім'я або залишити анонімно
    ctx.session = { step: "pray_anonymous", data: { name: member.name } };
    return ctx.reply(
      "🙏 Дякуємо за вашу молитвенну потребу!\n\n" +
      "Хочете додати ваше ім'я? (напишіть 'так' або 'ні', або просто введіть опис потребі)",
      createMainMenu()
    );
  } else {
    // Гість - анонімно
    ctx.session = { step: "pray_description", data: { name: null } };
    return ctx.reply("🙏 Опишіть, будь ласка, молитвенну потребу:", createMainMenu());
  }
}

/**
 * Обробник команди /prayers - показує вибір формату (тільки для адмінів)
 */
export async function handlePrayersList(ctx) {
  const prayers = await readPrayers();

  if (prayers.length === 0) {
    return ctx.reply("📭 Наразі немає молитвенних потреб.");
  }

  ctx.reply(
    "🙏 Молитвенні потреби\n\n" +
    `Знайдено потреб: ${prayers.length}\n\n` +
    "Оберіть формат відображення:",
    Markup.inlineKeyboard([
      [
        Markup.button.callback("💬 Показати в чаті", "prayers_show_chat"),
        Markup.button.callback("📊 Excel файл", "prayers_show_excel"),
      ],
    ])
  );
}

/**
 * Показує молитви в чаті
 */
export async function handlePrayersShowChat(ctx) {
  await ctx.answerCbQuery("Показую молитви в чаті...");
  const prayers = await readPrayers();

  for (const prayer of prayers) {
    const message = formatPrayerMessage(prayer);
    await ctx.replyWithMarkdown(message);
  }
}

/**
 * Генерує та надсилає Excel файл з молитвами
 */
export async function handlePrayersShowExcel(ctx) {
  await ctx.answerCbQuery("Генерую Excel файл...");
  const prayers = await readPrayers();

  try {
    const filePath = await generatePrayersExcel(prayers);
    await ctx.replyWithDocument({ source: filePath });
    deleteFile(filePath);
  } catch (err) {
    console.error("Помилка генерації Excel:", err);
    await ctx.reply("⚠️ Не вдалося згенерувати Excel файл.");
  }
}

/**
 * Обробка кроків створення молитвенної потреби через текст
 */
export async function handlePraySteps(ctx, msg) {
  const step = ctx.session?.step;
  if (!step || !step.startsWith("pray_")) {
    return false; // Не наш крок
  }

  // === ВИБІР АНОНІМНОСТІ (для членів церкви) ===
  if (step === "pray_anonymous") {
    const lowerMsg = msg.toLowerCase().trim();
    if (lowerMsg === "так" || lowerMsg === "yes" || lowerMsg === "да") {
      // З ім'ям
      ctx.session.step = "pray_description";
      ctx.reply("✍️ Опишіть, будь ласка, молитвенну потребу:");
      return true;
    } else if (lowerMsg === "ні" || lowerMsg === "no" || lowerMsg === "нет") {
      // Анонімно
      ctx.session.data.name = null;
      ctx.session.step = "pray_description";
      ctx.reply("✍️ Опишіть, будь ласка, молитвенну потребу:");
      return true;
    } else {
      // Якщо просто ввели текст - використовуємо як опис з ім'ям
      const sanitizedDescription = sanitizeText(msg, 5000);
      if (!sanitizedDescription) {
        ctx.reply("⚠️ Опис не може бути порожнім або перевищувати 5000 символів.");
        return true;
      }
      const prayer = createPrayer({
        userId: ctx.from.id,
        name: ctx.session.data.name,
        description: sanitizedDescription,
      });
      await addPrayer(prayer);
      await ctx.reply("✅ Дякуємо! Ваша молитвенна потреба збережена 🙏", createMainMenu());
      // Повідомлення адмінам
      await notifyAdmins(ctx, prayer);
      ctx.session = null;
      return true;
    }
  }

  // === ОПИС ПОТРЕБИ ===
  if (step === "pray_description") {
    const sanitizedDescription = sanitizeText(msg, 5000);
    if (!sanitizedDescription) {
      ctx.reply("⚠️ Опис не може бути порожнім або перевищувати 5000 символів.");
      return true;
    }
    const prayer = createPrayer({
      userId: ctx.from.id,
      name: ctx.session.data.name || null,
      description: sanitizedDescription,
    });

    await addPrayer(prayer);
    await ctx.reply("✅ Дякуємо! Ваша молитвенна потреба збережена 🙏", createMainMenu());
    // Повідомлення адмінам
    await notifyAdmins(ctx, prayer);
    ctx.session = null;
    return true;
  }

  return false;
}

/**
 * Надсилає повідомлення адмінам про нову молитвенну потребу
 */
async function notifyAdmins(ctx, prayer) {
  const adminMessage = createAdminPrayerNotification(prayer);
  console.log("🟢 Надсилаю повідомлення адмінам про молитву:", ADMIN_IDS);

  const replyKeyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback("❓ Уточнити", `clarify_prayer_${prayer.id}`)
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
 * Обробник кнопки "Уточнити" на молитвенну потребу
 */
export async function handlePrayClarifyStart(ctx) {
  const prayerId = parseInt(ctx.match[1]);
  const prayer = await findPrayerById(prayerId);

  if (!prayer) {
    return ctx.answerCbQuery("⚠️ Молитвенна потреба не знайдена");
  }

  // Зберігаємо в сесії, що адмін хоче уточнити цю молитву
  ctx.session = {
    step: "pray_clarify_text",
    data: { prayerId, userId: prayer.userId, adminId: ctx.from.id }
  };

  await ctx.answerCbQuery("✍️ Введіть питання для уточнення:");
  await ctx.reply(
    `✍️ Введіть питання для уточнення до ${prayer.name || "користувача"}:\n\n` +
    `(Ви можете використати до 4000 символів)`
  );
}

/**
 * Обробка тексту уточнення від адміна
 */
export async function handlePrayClarifyText(ctx, msg) {
  const step = ctx.session?.step;
  if (step !== "pray_clarify_text") {
    return false;
  }

  const { prayerId, userId, adminId } = ctx.session.data;
  const sanitizedText = sanitizeText(msg, 4000);
  
  if (!sanitizedText) {
    await ctx.reply("⚠️ Текст не може бути порожнім або перевищувати 4000 символів.");
    return true;
  }

  try {
    const prayer = await findPrayerById(prayerId);
    if (!prayer) {
      await ctx.reply("⚠️ Молитвенна потреба не знайдена.");
      ctx.session = null;
      return true;
    }

    // Відправляємо питання користувачу з кнопкою для відповіді
    const userMessage = `❓ *Уточнення до вашої молитвенної потреби:*\n\n${sanitizedText}\n\n_Натисніть кнопку нижче, щоб відповісти:_`;
    await ctx.telegram.sendMessage(userId, userMessage, {
      parse_mode: "Markdown",
      reply_markup: Markup.inlineKeyboard([
        [
          Markup.button.callback("💬 Відповісти", `reply_clarify_prayer_${prayerId}_${adminId}`)
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
export async function handlePrayClarifyReplyStart(ctx) {
  const prayerId = parseInt(ctx.match[1]);
  const adminId = parseInt(ctx.match[2]);
  const prayer = await findPrayerById(prayerId);

  if (!prayer) {
    return ctx.answerCbQuery("⚠️ Молитвенна потреба не знайдена");
  }

  // Зберігаємо в сесії, що користувач хоче відповісти на уточнення
  ctx.session = {
    step: "pray_clarify_reply_text",
    data: { prayerId, adminId }
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
export async function handlePrayClarifyReplyText(ctx, msg) {
  const step = ctx.session?.step;
  if (step !== "pray_clarify_reply_text") {
    return false;
  }

  const { prayerId, adminId } = ctx.session.data;
  const sanitizedText = sanitizeText(msg, 4000);
  
  if (!sanitizedText) {
    await ctx.reply("⚠️ Текст не може бути порожнім або перевищувати 4000 символів.");
    return true;
  }

  try {
    const prayer = await findPrayerById(prayerId);
    if (!prayer) {
      await ctx.reply("⚠️ Молитвенна потреба не знайдена.");
      ctx.session = null;
      return true;
    }

    // Відправляємо відповідь адміну з кнопкою для фінальної відповіді
    const adminMessage = `💬 *Відповідь на уточнення:*\n\n${sanitizedText}\n\n_Від: ${prayer.name || "користувача"}_`;
    await ctx.telegram.sendMessage(adminId, adminMessage, {
      parse_mode: "Markdown",
      reply_markup: Markup.inlineKeyboard([
        [
          Markup.button.callback("💬 Відповісти", `final_reply_prayer_${prayerId}_${ctx.from.id}`)
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
 * Обробник кнопки "Відповісти" від адміна на отриману відповідь
 */
export async function handlePrayReplyStart(ctx) {
  const prayerId = parseInt(ctx.match[1]);
  const userId = parseInt(ctx.match[2]);
  const prayer = await findPrayerById(prayerId);

  if (!prayer) {
    return ctx.answerCbQuery("⚠️ Молитвенна потреба не знайдена");
  }

  // Зберігаємо в сесії, що адмін хоче відповісти
  ctx.session = {
    step: "pray_reply_text",
    data: { prayerId, userId }
  };

  await ctx.answerCbQuery("✍️ Введіть текст відповіді:");
  await ctx.reply(
    `✍️ Введіть текст відповіді для ${prayer.name || "користувача"}:\n\n` +
    `(Ви можете використати до 4000 символів)`
  );
}

/**
 * Обробка тексту фінальної відповіді адміна
 */
export async function handlePrayReplyText(ctx, msg) {
  const step = ctx.session?.step;
  if (step !== "pray_reply_text") {
    return false;
  }

  const { prayerId, userId } = ctx.session.data;
  const sanitizedText = sanitizeText(msg, 4000);
  
  if (!sanitizedText) {
    await ctx.reply("⚠️ Текст не може бути порожнім або перевищувати 4000 символів.");
    return true;
  }

  try {
    // Відправляємо повідомлення користувачу
    const userMessage = `📬 *Відповідь на вашу молитвенну потребу:*\n\n${sanitizedText}`;
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

