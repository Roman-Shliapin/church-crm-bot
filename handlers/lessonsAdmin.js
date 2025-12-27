// Обробник для адмінівського управління уроками
import { readLessons, writeLessons } from "../services/storage.js";

/**
 * Обробник команди /upload_lesson - завантаження PDF уроку (тільки для адмінів)
 */
export function handleUploadLessonStart(ctx) {
  ctx.session = { step: "upload_lesson_name", data: {} };
  ctx.reply(
    "📚 Завантаження нового PDF уроку\n\n" +
    "Введіть назву уроку (наприклад: 'Основи віри' або 'Урок 1: Любов до ближнього'):"
  );
}

/**
 * Обробка назви уроку для завантаження PDF
 */
export function handleUploadLessonName(ctx, msg) {
  const step = ctx.session?.step;
  if (step !== "upload_lesson_name") {
    return false;
  }

  const lessonName = msg.trim();

  if (!lessonName || lessonName.length < 3) {
    ctx.reply("⚠️ Назва уроку повинна містити мінімум 3 символи. Спробуйте ще раз:");
    return true;
  }

  // Перевіряємо, чи такий урок вже існує
  const lessons = readLessons();
  const existingLesson = lessons.find(
    (l) => l.title.toLowerCase() === lessonName.toLowerCase()
  );

  if (existingLesson) {
    // Якщо урок існує - оновлюємо його
    ctx.session.data.lessonId = existingLesson.id;
    ctx.session.data.isUpdate = true;
    ctx.reply(
      `📎 Знайдено існуючий урок: ${existingLesson.title}\n\n` +
      `Тепер надішліть PDF файл для цього уроку:`
    );
  } else {
    // Якщо урок не існує - створюємо новий
    ctx.session.data.lessonName = lessonName;
    ctx.session.data.isUpdate = false;
    
    // Знаходимо наступний доступний ID
    const maxId = lessons.length > 0 
      ? Math.max(...lessons.map(l => l.id || 0))
      : 0;
    ctx.session.data.newLessonId = maxId + 1;
    
    ctx.reply(
      `📎 Створюється новий урок: ${lessonName}\n\n` +
      `Тепер надішліть PDF файл для цього уроку:`
    );
  }

  ctx.session.step = "upload_lesson_file";
  return true;
}

/**
 * Обробка завантаження PDF файлу
 */
export async function handleUploadLessonFile(ctx) {
  const step = ctx.session?.step;
  if (step !== "upload_lesson_file") {
    return false;
  }

  // Перевірка, що це документ
  if (!ctx.message || !ctx.message.document) {
    ctx.reply("⚠️ Будь ласка, надішліть PDF файл як документ.");
    return true;
  }

  const document = ctx.message.document;

  // Перевірка, що це PDF
  if (!document.file_name) {
    ctx.reply("⚠️ Будь ласка, надішліть PDF файл.");
    return true;
  }

  if (!document.file_name.toLowerCase().endsWith(".pdf")) {
    ctx.reply("⚠️ Файл повинен бути PDF формату (.pdf)");
    return true;
  }

  try {
    const lessons = readLessons();
    
    if (ctx.session.data.isUpdate) {
      // Оновлюємо існуючий урок
      const lessonId = ctx.session.data.lessonId;
      const lesson = lessons.find((l) => l.id === lessonId);

      if (!lesson) {
        ctx.reply("⚠️ Помилка: урок не знайдено.");
        ctx.session = null;
        return true;
      }

      // Оновлюємо PDF
      lesson.pdfFileId = document.file_id;
      lesson.pdfFileName = document.file_name;
      lesson.pdfUploadDate = new Date().toLocaleString("uk-UA");

      writeLessons(lessons);

      await ctx.reply(
        `✅ PDF файл успішно оновлено!\n\n` +
        `📖 Урок: ${lesson.title}\n` +
        `📄 Файл: ${document.file_name}`
      );
    } else {
      // Створюємо новий урок
      const newLesson = {
        id: ctx.session.data.newLessonId,
        title: ctx.session.data.lessonName,
        description: "",
        content: "",
        pdfFileId: document.file_id,
        pdfFileName: document.file_name,
        pdfUploadDate: new Date().toLocaleString("uk-UA"),
      };

      lessons.push(newLesson);
      writeLessons(lessons);

      await ctx.reply(
        `✅ Новий урок успішно створено!\n\n` +
        `📖 Урок: ${newLesson.title}\n` +
        `📄 Файл: ${document.file_name}\n` +
        `🆔 ID: ${newLesson.id}\n\n` +
        `Користувачі тепер зможуть отримати цей PDF через команду /lessons.`
      );
    }

    ctx.session = null;
  } catch (err) {
    console.error("Помилка завантаження PDF:", err);
    ctx.reply("⚠️ Помилка при збереженні PDF файлу.");
    ctx.session = null;
  }

  return true;
}

