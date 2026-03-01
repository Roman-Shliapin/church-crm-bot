// Обробник реєстрації членів церкви
import { Markup } from "telegraf";
import { addMember, findMemberById } from "../services/storage.js";
import { validateName, validatePhone, validateBaptismDate, validateBirthDate } from "../utils/validation.js";
import { createMainMenu } from "./commands.js";

/**
 * Початок процесу реєстрації
 */
export async function handleRegisterStart(ctx) {
  try {
    const existingMember = await findMemberById(ctx.from.id);
    if (existingMember) {
      const menu = await createMainMenu(ctx);
      return ctx.reply(`✅ ${existingMember.name}, ви вже зареєстровані!`, menu);
    }
  } catch (err) {
    console.error("Помилка перевірки реєстрації:", err);
  }

  const isRegistrationStep = ctx.session?.step >= 1 && ctx.session?.step <= 5;
  if (isRegistrationStep) {
    const menu = await createMainMenu(ctx);
    const stepLabels = {
      1: "ім'я та прізвище",
      2: "статус хрещення (кнопки нижче)",
      3: "дату хрещення (ДД-ММ-РРРР)",
      4: "дату народження (ДД-ММ-РРРР)",
      5: "номер телефону (+380...)",
    };
    const currentStep = ctx.session?.step || 1;
    const hint = stepLabels[currentStep] || "";
    return ctx.reply(
      `Ви вже проходите реєстрацію (крок ${currentStep}). Що робити?`,
      Markup.inlineKeyboard([
        [Markup.button.callback("➡️ Продовжити (введіть " + hint + ")", "register_continue")],
        [Markup.button.callback("🔄 Почати спочатку", "register_restart")],
      ])
    );
  }

  ctx.session = { step: 1, data: {} };
  const menu = await createMainMenu(ctx);
  await ctx.reply("🟢 Давай скоріш починати!", menu);
  await ctx.reply("Введіть, будь ласка, ваше повне ім'я та прізвище:");
}

/**
 * Обробник вибору статусу хрещення
 */
/**
 * Callback: продовжити реєстрацію (нагадування, що ввести)
 */
export async function handleRegisterContinue(ctx) {
  await ctx.answerCbQuery("Продовжуйте");
  const stepLabels = {
    1: "Введіть, будь ласка, ваше повне ім'я та прізвище.",
    2: "Оберіть статус хрещення кнопками нижче.",
    3: "Вкажіть дату вашого хрещення (у форматі ДД-ММ-РРРР).",
    4: "Вкажіть дату вашого народження (у форматі ДД-ММ-РРРР).",
    5: "Вкажіть ваш номер телефону (+380...).",
  };
  const currentStep = ctx.session?.step || 1;
  const hint = stepLabels[currentStep] || "";
  await ctx.reply(`➡️ ${hint}`);

  if (currentStep === 2 && ctx.session?.data?.name) {
    await ctx.reply(
      "🔰 Чи ви вже хрещені?",
      Markup.inlineKeyboard([
        [
          Markup.button.callback("✅ Так, я в Христі", "register_baptized"),
          Markup.button.callback("⏳ Ще не хрещений", "register_unbaptized"),
        ],
      ])
    );
  }
}

/**
 * Callback: почати реєстрацію спочатку
 */
export async function handleRegisterRestart(ctx) {
  await ctx.answerCbQuery("Починаємо спочатку");
  ctx.session = { step: 1, data: {} };
  const menu = await createMainMenu(ctx);
  await ctx.reply("🔄 Реєстрацію розпочато з початку.", menu);
  await ctx.reply("Введіть, будь ласка, ваше повне ім'я та прізвище:");
}

export async function handleRegisterBaptismStatus(ctx, isBaptized) {
  if (!ctx.session?.data) {
    await ctx.answerCbQuery("⚠️ Сесія закінчилася. Почніть реєстрацію знову.");
    const menu = await createMainMenu(ctx);
    return ctx.reply("⚠️ Сесія закінчилася. Натисніть 📝 Зареєструватися, щоб почати знову.", menu);
  }

  ctx.session.data.baptized = isBaptized;
  
  if (isBaptized) {
    ctx.session.step = 3;
    await ctx.answerCbQuery("✅ Обрано: у Христі");
    await ctx.reply("📅 Вкажіть дату вашого хрещення (у форматі ДД-ММ-РРРР):");
  } else {
    ctx.session.data.baptism = "Ще не хрещений";
    ctx.session.step = 4;
    await ctx.answerCbQuery("⏳ Обрано: Ще не хрещений");
    await ctx.reply("🎂 Вкажіть дату вашого народження (у форматі ДД-ММ-РРРР):");
  }
}

/**
 * Обробка кроків реєстрації через текст
 */
export async function handleRegisterSteps(ctx, msg) {
  const step = ctx.session?.step;
  if (!step || (step !== 1 && step !== 2 && step !== 3 && step !== 4 && step !== 5)) {
    return false;
  }

  if (!ctx.session?.data) {
    ctx.session = { step: 1, data: {} };
    const menu = await createMainMenu(ctx);
    await ctx.reply("⚠️ Сесія була втрачена. Почнімо реєстрацію заново.", menu);
    await ctx.reply("Введіть, будь ласка, ваше повне ім'я та прізвище:");
    return true;
  }

  if (step === 1) {
    const validatedName = validateName(msg);
    if (!validatedName) {
      await ctx.reply("⚠️ Будь ласка, введіть коректне ім'я (2-100 символів, тільки букви, пробіли, дефіси).");
      return true;
    }
    ctx.session.data.name = validatedName;
    ctx.session.step = 2;
    await ctx.reply(
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

  if (step === 3) {
    const validatedDate = validateBaptismDate(msg);
    if (!validatedDate) {
      await ctx.reply("⚠️ Будь ласка, введіть коректну дату у форматі ДД-ММ-РРРР (наприклад: 15-03-2020).");
      return true;
    }
    ctx.session.data.baptism = validatedDate;
    ctx.session.step = 4;
    await ctx.reply("🎂 Вкажіть дату вашого народження (у форматі ДД-ММ-РРРР):");
    return true;
  }

  if (step === 4) {
    const validatedBirthDate = validateBirthDate(msg);
    if (!validatedBirthDate) {
      await ctx.reply("⚠️ Будь ласка, введіть коректну дату у форматі ДД-ММ-РРРР (наприклад: 15-03-1990).");
      return true;
    }
    ctx.session.data.birthday = validatedBirthDate;
    ctx.session.step = 5;
    await ctx.reply("📞 Вкажіть ваш номер телефону (+380...):");
    return true;
  }

  if (step === 5) {
    const validatedPhone = validatePhone(msg);
    if (!validatedPhone) {
      await ctx.reply("⚠️ Будь ласка, введіть коректний номер телефону у форматі +380XXXXXXXXX або 0XXXXXXXXX.");
      return true;
    }

    const baptized = Boolean(ctx.session.data.baptized === true);
    
    const user = {
      id: ctx.from.id,
      name: ctx.session.data.name,
      baptized: baptized,
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
      await ctx.reply(successMessage, menu);
      ctx.session = null;
    } catch (err) {
      const menu = await createMainMenu(ctx);
      await ctx.reply(`⚠️ Помилка реєстрації: ${err.message}`, menu);
      ctx.session = null;
    }
    return true;
  }

  return false;
}

