// Обробник реєстрації членів церкви
import { addMember } from "../services/storage.js";
import { validateName, validatePhone, validateBaptismDate, validateBirthDate } from "../utils/validation.js";

/**
 * Початок процесу реєстрації
 */
export function handleRegisterStart(ctx) {
  if (ctx.session?.step) {
    return ctx.reply("Ви вже проходите реєстрацію. Будь ласка, завершіть її.");
  }
  ctx.session = { step: 1, data: {} };
  ctx.reply("🟢 Давай скоріш починати!");
  ctx.reply("Введіть, будь ласка, ваше повне ім'я та прізвище:");
}

/**
 * Обробка кроків реєстрації через текст
 */
export function handleRegisterSteps(ctx, msg) {
  const step = ctx.session?.step;
  if (!step || (step !== 1 && step !== 2 && step !== 3 && step !== 4)) {
    return false; // Не наш крок
  }

  if (step === 1) {
    // Крок 1: Ім'я - валідація
    const validatedName = validateName(msg);
    if (!validatedName) {
      ctx.reply("⚠️ Будь ласка, введіть коректне ім'я (2-100 символів, тільки букви, пробіли, дефіси).");
      return true;
    }
    ctx.session.data.name = validatedName;
    ctx.session.step = 2;
    ctx.reply("📅 Вкажіть дату вашого хрещення (у форматі ДД-ММ-РРРР):");
    return true;
  }

  if (step === 2) {
    // Крок 2: Дата хрещення - валідація
    const validatedDate = validateBaptismDate(msg);
    if (!validatedDate) {
      ctx.reply("⚠️ Будь ласка, введіть коректну дату у форматі ДД-ММ-РРРР (наприклад: 15-03-2020).");
      return true;
    }
    ctx.session.data.baptism = validatedDate;
    ctx.session.step = 3;
    ctx.reply("🎂 Вкажіть дату вашого народження (у форматі ДД-ММ-РРРР):");
    return true;
  }

  if (step === 3) {
    // Крок 3: День народження - валідація
    const validatedBirthDate = validateBirthDate(msg);
    if (!validatedBirthDate) {
      ctx.reply("⚠️ Будь ласка, введіть коректну дату у форматі ДД-ММ-РРРР (наприклад: 15-03-1990).");
      return true;
    }
    ctx.session.data.birthday = validatedBirthDate;
    ctx.session.step = 4;
    ctx.reply("📞 Вкажіть ваш номер телефону (+380...):");
    return true;
  }

  if (step === 4) {
    // Крок 4: Телефон - валідація та завершення реєстрації
    const validatedPhone = validatePhone(msg);
    if (!validatedPhone) {
      ctx.reply("⚠️ Будь ласка, введіть коректний номер телефону у форматі +380XXXXXXXXX або 0XXXXXXXXX.");
      return true;
    }

    const user = {
      id: ctx.from.id,
      name: ctx.session.data.name,
      baptism: ctx.session.data.baptism,
      birthday: ctx.session.data.birthday,
      phone: validatedPhone,
    };

    try {
      addMember(user);
      ctx.reply(`✅ Дякуємо, ${user.name}! Ви успішно зареєстровані.`);
      ctx.session = null;
    } catch (err) {
      ctx.reply(`⚠️ Помилка реєстрації: ${err.message}`);
      ctx.session = null;
    }
    return true;
  }

  return false;
}

