// Обробник біблійних уроків
import { readLessons, findLessonById } from "../services/storage.js";
import { Markup } from "telegraf";
import { createMainMenu } from "./commands.js";

/**
 * Створює меню з уроками (reply keyboard)
 */
function createLessonsMenu(lessons) {
  const buttons = [];
  // Групуємо по 2 уроки в рядок
  for (let i = 0; i < lessons.length; i += 2) {
    const row = [];
    row.push(`${lessons[i].id}. ${lessons[i].title}`);
    if (i + 1 < lessons.length) {
      row.push(`${lessons[i + 1].id}. ${lessons[i + 1].title}`);
    }
    buttons.push(row);
  }
  // Додаємо кнопку повернення
  buttons.push(["🏠 На головне меню"]);
  
  return Markup.keyboard(buttons)
    .resize()
    .persistent();
}

/**
 * Обробник команди /lessons - показує reply keyboard меню з уроками
 */
export async function handleLessons(ctx) {
  const lessons = await readLessons();

  if (lessons.length === 0) {
    const menu = await createMainMenu(ctx);
    return ctx.reply("📭 Наразі немає доступних уроків.", menu);
  }

  // Створюємо reply keyboard меню з уроками
  const menu = createLessonsMenu(lessons);
  await ctx.reply("📚 Оберіть урок:", menu);
}

/**
 * Обробка вибору уроку через reply keyboard або callback кнопку
 */
export async function handleLessonSelection(ctx, msg = null) {
  let lessonId;
  
  // Якщо викликано через reply keyboard (msg містить текст кнопки)
  if (msg) {
    // Виділяємо ID з тексту кнопки "1. Назва уроку"
    const match = msg.match(/^(\d+)\./);
    if (!match) {
      return false;
    }
    lessonId = parseInt(match[1]);
  } else if (ctx.match) {
    // Якщо викликано через callback (inline кнопка - для сумісності)
    lessonId = parseInt(ctx.match[1]);
  } else {
    return false;
  }
  
  const lesson = await findLessonById(lessonId);

  if (!lesson) {
    if (msg) {
      await ctx.reply("⚠️ Урок не знайдено");
    } else {
      await ctx.answerCbQuery("⚠️ Урок не знайдено");
    }
    return true;
  }

  // Перевіряємо, чи є PDF файл
  if (!lesson.pdfFileId) {
    if (msg) {
      await ctx.reply("⚠️ PDF файл для цього уроку ще не завантажено");
    } else {
      await ctx.answerCbQuery("⚠️ PDF файл для цього уроку ще не завантажено");
    }
    return true;
  }

  // Надсилаємо PDF файл
  try {
    if (!msg) {
      await ctx.answerCbQuery("📄 Надсилаю PDF файл...");
    }
    await ctx.replyWithDocument(lesson.pdfFileId);
    // Повертаємо меню з уроками
    const lessons = await readLessons();
    if (lessons.length > 0) {
      const menu = createLessonsMenu(lessons);
      await ctx.reply("📚 Оберіть інший урок або поверніться на головне меню:", menu);
    }
  } catch (err) {
    console.error("Помилка надсилання PDF:", err);
    if (msg) {
      await ctx.reply("⚠️ Не вдалося надіслати PDF файл. Зверніться до адміністратора.");
    } else {
      await ctx.answerCbQuery("⚠️ Помилка надсилання PDF");
      await ctx.reply("⚠️ Не вдалося надіслати PDF файл. Зверніться до адміністратора.");
    }
  }
  
  return true;
}

/**
 * Обробка вибору уроку через callback кнопку (для сумісності)
 */
export async function handleLessonCallback(ctx) {
  return handleLessonSelection(ctx);
}

