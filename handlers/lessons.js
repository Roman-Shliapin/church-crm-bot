// Обробник біблійних уроків
import { readLessons, findLessonById } from "../services/storage.js";
import { Markup } from "telegraf";
import { createMainMenu } from "./commands.js";

/**
 * Обробник команди /lessons - показує тільки кнопки з уроками
 */
export async function handleLessons(ctx) {
  const lessons = await readLessons();

  if (lessons.length === 0) {
    return ctx.reply("📭 Наразі немає доступних уроків.", createMainMenu());
  }

  // Створюємо inline кнопки для вибору уроку (тільки кнопки, без тексту)
  const buttons = [];
  lessons.forEach((lesson) => {
    // Показуємо номер і назву уроку
    const buttonText = `${lesson.id}. ${lesson.title}`;
    buttons.push([
      Markup.button.callback(buttonText, `lesson_${lesson.id}`),
    ]);
  });

  ctx.reply("📚 Оберіть урок:", Markup.inlineKeyboard(buttons));
}

/**
 * Обробка вибору уроку через callback кнопку - надсилає тільки PDF
 */
export async function handleLessonCallback(ctx) {
  const lessonId = parseInt(ctx.match[1]);
  const lesson = await findLessonById(lessonId);

  if (!lesson) {
    await ctx.answerCbQuery("⚠️ Урок не знайдено");
    return;
  }

  // Перевіряємо, чи є PDF файл
  if (!lesson.pdfFileId) {
    await ctx.answerCbQuery("⚠️ PDF файл для цього уроку ще не завантажено");
    return;
  }

  // Надсилаємо тільки PDF файл
  try {
    await ctx.answerCbQuery("📄 Надсилаю PDF файл...");
    await ctx.replyWithDocument(lesson.pdfFileId);
  } catch (err) {
    console.error("Помилка надсилання PDF:", err);
    await ctx.answerCbQuery("⚠️ Помилка надсилання PDF");
    await ctx.reply("⚠️ Не вдалося надіслати PDF файл. Зверніться до адміністратора.");
  }
}

/**
 * Обробка вибору конкретного уроку через текст (застарілий метод, але залишаємо для сумісності)
 */
export async function handleLessonSelection(ctx, msg) {
  const lessonId = parseInt(msg.trim());

  if (isNaN(lessonId) || lessonId < 1) {
    return false;
  }

  const lesson = await findLessonById(lessonId);

  if (!lesson) {
    ctx.reply("⚠️ Урок з таким номером не знайдено.");
    return true;
  }

  // Перевіряємо, чи є PDF файл
  if (!lesson.pdfFileId) {
    ctx.reply("⚠️ PDF файл для цього уроку ще не завантажено");
    return true;
  }

  // Надсилаємо тільки PDF файл
  ctx.replyWithDocument(lesson.pdfFileId).catch(() => {
    ctx.reply("⚠️ Не вдалося надіслати PDF файл. Зверніться до адміністратора.");
  });

  return true;
}
