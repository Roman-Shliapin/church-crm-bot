// Обробник реєстрації членів церкви
import { Markup } from "telegraf";
import { addMember, findMemberById } from "../services/storage.js";
import { validateName, validatePhone, validateBaptismDate, validateBirthDate } from "../utils/validation.js";
import { createMainMenu } from "./commands.js";

/**
 * Початок процесу реєстрації
 */
export async function handleRegisterStart(ctx) {
  const existingMember = await findMemberById(ctx.from.id);
  if (existingMember) {
    const menu = await createMainMenu(ctx);
    return ctx.reply(`✅ ${existingMember.name}, ви вже зареєстровані!`, menu);
  }

  const menu = await createMainMenu(ctx);
  if (ctx.session?.step) {
    return ctx.reply("Ви вже проходите реєстрацію. Будь ласка, завершіть її.", menu);
  }
  ctx.session = { step: 1, data: {} };
  ctx.reply("🟢 Давай скоріш починати!", menu);
  ctx.reply("Введіть, будь ласка, ваше повне ім'я та прізвище:");
}

/**
 * Обробник вибору статусу хрещення
 */
export async function handleRegisterBaptismStatus(ctx, isBaptized) {
  ctx.session.data.baptized = isBaptized;
  
  if (isBaptized) {
    // Якщо хрещений - запитуємо дату хрещення
    ctx.session.step = 3;
    ctx.answerCbQuery("✅ Обрано: у Христі");
    ctx.reply("📅 Вкажіть дату вашого хрещення (у форматі ДД-ММ-РРРР):");
  } else {
    // Якщо не хрещений - пропускаємо дату хрещення, переходимо до дня народження
    ctx.session.data.baptism = "Ще не хрещений";
    ctx.session.step = 4; // Пропускаємо крок 3 (дата хрещення)
    ctx.answerCbQuery("⏳ Обрано: Ще не хрещений");
    ctx.reply("🎂 Вкажіть дату вашого народження (у форматі ДД-ММ-РРРР):");
  }
}

/**
 * Обробка кроків реєстрації через текст
 */
export async function handleRegisterSteps(ctx, msg) {
  const step = ctx.session?.step;
  if (!step || (step !== 1 && step !== 2 && step !== 3 && step !== 4 && step !== 5)) {
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
    ctx.session.step = 2; // Переходимо до вибору статусу
    ctx.reply(
      "🔰 Чи ви вже хрещені?",
      Markup.inlineKeyboard([
        [
          Markup.button.callback("✅ Так, я в Христі", "register_baptized"),
          Markup.button.callback("⏳ Ще не хрещений", "register_unbaptized"),
        ],
      ])
    );
    return true;
  }

  // Крок 2 пропущено - це вибір статусу (обробляється через callback)
  
  if (step === 3) {
    // Крок 3: Дата хрещення (тільки для хрещених) - валідація
    const validatedDate = validateBaptismDate(msg);
    if (!validatedDate) {
      ctx.reply("⚠️ Будь ласка, введіть коректну дату у форматі ДД-ММ-РРРР (наприклад: 15-03-2020).");
      return true;
    }
    ctx.session.data.baptism = validatedDate;
    ctx.session.step = 4;
    ctx.reply("🎂 Вкажіть дату вашого народження (у форматі ДД-ММ-РРРР):");
    return true;
  }

  if (step === 4) {
    // Крок 4: День народження - валідація
    const validatedBirthDate = validateBirthDate(msg);
    if (!validatedBirthDate) {
      ctx.reply("⚠️ Будь ласка, введіть коректну дату у форматі ДД-ММ-РРРР (наприклад: 15-03-1990).");
      return true;
    }
    ctx.session.data.birthday = validatedBirthDate;
    ctx.session.step = 5;
    ctx.reply("📞 Вкажіть ваш номер телефону (+380...):");
    return true;
  }

  if (step === 5) {
    // Крок 4: Телефон - валідація та завершення реєстрації
    const validatedPhone = validatePhone(msg);
    if (!validatedPhone) {
      ctx.reply("⚠️ Будь ласка, введіть коректний номер телефону у форматі +380XXXXXXXXX або 0XXXXXXXXX.");
      return true;
    }

    // Явно встановлюємо baptized - тільки якщо строго true, інакше false
    // Це гарантує, що поле завжди буде булевим значенням в базі даних
    const baptized = Boolean(ctx.session.data.baptized === true);
    
    const user = {
      id: ctx.from.id,
      name: ctx.session.data.name,
      baptized: baptized, // Завжди булеве значення: true або false
      baptism: ctx.session.data.baptism || "Ще не хрещений",
      birthday: ctx.session.data.birthday,
      phone: validatedPhone,
    };

    try {
      await addMember(user);
      const menu = await createMainMenu(ctx);
      const successMessage = user.baptized 
        ? `✅ Дякуємо, ${user.name}! Ви успішно зареєстровані як член церкви.`
        : `✅ Дякуємо, ${user.name}! Ви успішно зареєстровані. Ми молимося за вас! 🙏`;
      ctx.reply(successMessage, menu);
      ctx.session = null;
    } catch (err) {
      const menu = await createMainMenu(ctx);
      ctx.reply(`⚠️ Помилка реєстрації: ${err.message}`, menu);
      ctx.session = null;
    }
    return true;
  }

  return false;
}

