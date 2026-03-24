// Обробник оголошень (тільки для адмінів)
import { Markup } from "telegraf";
import { readMembers, readBaptizedMembers, readUnbaptizedMembers } from "../services/storage.js";
import { sanitizeText } from "../utils/validation.js";
import { createConfirmSendMenu, createMainMenu } from "./commands.js";

const failedAnnounceReports = new Map();
const FAILED_REPORT_TTL_MS = 5 * 60 * 1000;

/**
 * Обробник команди /announce - початок створення оголошення (тільки для адмінів)
 */
export function handleAnnounceStart(ctx) {
  ctx.session = { step: "announce_audience", data: {} };
  ctx.reply(
    "📢 Створення оголошення\n\n" +
    "Крок 1/3: Оберіть цільову аудиторію:",
    Markup.inlineKeyboard([
      [
        Markup.button.callback("✅ Для членів церкви (хрещені)", "announce_baptized"),
      ],
      [
        Markup.button.callback("⏳ Для нехрещених (кандидатів)", "announce_unbaptized"),
      ],
      [
        Markup.button.callback("👥 Для всіх зареєстрованих", "announce_all"),
      ],
    ])
  );
}

/**
 * Обробник вибору цільової аудиторії
 */
export async function handleAnnounceAudience(ctx, audienceType) {
  ctx.session.data.audienceType = audienceType;
  ctx.session.step = "announce_text";
  
  const audienceNames = {
    baptized: "членів церкви (хрещених)",
    unbaptized: "нехрещених (кандидатів)",
    all: "всіх зареєстрованих",
  };
  
  ctx.answerCbQuery(`Обрано: ${audienceNames[audienceType]}`);
  ctx.reply(
    `📢 Оголошення для ${audienceNames[audienceType]}\n\n` +
    "Крок 2/3: Введіть текст оголошення:"
  );
}

/**
 * Обробка тексту оголошення та розсилка відповідній аудиторії
 */
export async function handleAnnounceText(ctx, msg) {
  const step = ctx.session?.step;
  if (step !== "announce_text") {
    return false;
  }

  const audienceType = ctx.session.data?.audienceType || "all";

  const textToProcess = ctx.session.data?.confirmed ? ctx.session.data.pendingText : msg;
  const sanitizedText = sanitizeText(textToProcess, 4000);
  if (!sanitizedText) {
    await ctx.reply("⚠️ Текст оголошення не може бути порожнім або перевищувати 4000 символів.");
    return true;
  }

  if (!ctx.session.data?.confirmed) {
    const audienceLabels = {
      baptized: "хрещених членів церкви",
      unbaptized: "нехрещених (кандидатів)",
      all: "всіх зареєстрованих",
    };
    ctx.session.data.pendingText = sanitizedText;
    ctx.session.step = "announce_text_confirm";
    await ctx.reply(
      `📋 Крок 3/3: Перевірка перед відправкою\n` +
      `Аудиторія: ${audienceLabels[audienceType]}\n` +
      `Текст: ${sanitizedText.length} символів\n` +
      `Фото: не додано\n\n` +
      `${sanitizedText}\n\n` +
      "🖼 За потреби надішліть фото одним повідомленням.\n" +
      "Потім натисніть ✅ Відправити.",
      { reply_markup: createConfirmSendMenu().reply_markup }
    );
    return true;
  }
  delete ctx.session.data.confirmed;

  // Отримуємо відповідний список користувачів
  let members = [];
  let audienceName = "";

  if (audienceType === "baptized") {
    members = await readBaptizedMembers();
    audienceName = "хрещених членів церкви";
  } else if (audienceType === "unbaptized") {
    members = await readUnbaptizedMembers();
    audienceName = "нехрещених (кандидатів)";
  } else {
    members = await readMembers();
    audienceName = "всіх зареєстрованих";
  }

  if (members.length === 0) {
    const menu = await createMainMenu(ctx);
    await ctx.reply(`⚠️ Немає ${audienceName} для розсилки.`, menu);
    ctx.session = null;
    return true;
  }

  const announcement = `📢 Оголошення\n\n${sanitizedText}`;

  let sentCount = 0;
  let failedCount = 0;
  const failedDetails = [];

  for (const member of members) {
    try {
      if (ctx.session.data?.pendingPhoto) {
        await ctx.telegram.sendPhoto(member.id, ctx.session.data.pendingPhoto, {
          caption: announcement,
        });
      } else {
        await ctx.telegram.sendMessage(member.id, announcement);
      }
      sentCount++;
    } catch (err) {
      console.error(`Помилка надсилання користувачу ${member.id}:`, err);
      failedCount++;
      failedDetails.push({
        id: member.id,
        error: err?.description || err?.message || "unknown_error",
      });
    }
  }

  const menu = await createMainMenu(ctx);
  const replyOptions = failedCount > 0
    ? Markup.inlineKeyboard([
        [Markup.button.callback("📄 Завантажити список невдалих", "announce_failed_report")],
      ])
    : menu;

  if (failedCount > 0) {
    failedAnnounceReports.set(ctx.from.id, {
      createdAt: Date.now(),
      audienceName,
      failedDetails,
    });
    setTimeout(() => {
      failedAnnounceReports.delete(ctx.from.id);
    }, FAILED_REPORT_TTL_MS);
  } else {
    failedAnnounceReports.delete(ctx.from.id);
  }

  await ctx.reply(
    `✅ Оголошення надіслано ${audienceName}!\n\n` +
    `📊 Статистика:\n` +
    `• Відправлено: ${sentCount}\n` +
    `• Не вдалося відправити: ${failedCount}`,
    replyOptions
  );
  await ctx.reply("🏠 Повертаю головне меню.", menu);

  ctx.session = null;
  return true;
}

export async function handleAnnounceFailedReport(ctx) {
  await ctx.answerCbQuery();
  const report = failedAnnounceReports.get(ctx.from.id);
  const menu = await createMainMenu(ctx);

  if (!report || !Array.isArray(report.failedDetails) || report.failedDetails.length === 0) {
    return ctx.reply("ℹ️ Немає збереженого списку невдалих відправок.", menu);
  }

  if (Date.now() - report.createdAt > FAILED_REPORT_TTL_MS) {
    failedAnnounceReports.delete(ctx.from.id);
    return ctx.reply("ℹ️ Звіт уже застарів (старше 5 хвилин). Зробіть нову розсилку.", menu);
  }

  const lines = [
    `Невдалі відправки оголошення`,
    `Аудиторія: ${report.audienceName}`,
    `Час: ${new Date(report.createdAt).toISOString()}`,
    "",
    ...report.failedDetails.map((item, idx) => `${idx + 1}. id=${item.id} | ${item.error}`),
  ];
  const content = `${lines.join("\n")}\n`;

  await ctx.replyWithDocument({
    source: Buffer.from(content, "utf8"),
    filename: `announce-failed-${Date.now()}.txt`,
  });
  return ctx.reply("📎 Файл зі списком невдалих відправок надіслано.", menu);
}

/**
 * Опціональне фото для оголошення (лише на кроці confirm)
 */
export async function handleAnnouncePhoto(ctx) {
  if (ctx.session?.step !== "announce_text_confirm") {
    return false;
  }

  const photos = ctx.message?.photo || [];
  if (photos.length === 0) {
    return false;
  }

  // Беремо найбільший розмір фото
  const bestPhoto = photos[photos.length - 1];
  ctx.session.data.pendingPhoto = bestPhoto.file_id;

  await ctx.reply(
    "✅ Фото додано до оголошення.\nСтатус: Фото додано.\nТепер натисніть ✅ Відправити або ✏️ Переписати."
  );
  return true;
}
