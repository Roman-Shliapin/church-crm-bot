// Обробник реєстрації членів церкви
import { Markup } from "telegraf";
import { addMember, findMemberById } from "../services/storage.js";
import { validateName, validatePhone, validateBaptismDate, validateBirthDate } from "../utils/validation.js";
import { createMainMenu } from "./commands.js";

const REGISTRATION_MAX_STEP = 6;

/** Текст для baptism, якщо хрестили в дитинстві (для бота = не усвідомлене хрещення) */
const BAPTISM_INFANT_LABEL = "Хрещений(а) у дитинстві (не усвідомлено)";
const BAPTISM_NONE_LABEL = "Ще не хрещений";

const BAPTISM_QUESTION =
  "🔰 Ви приймали хрещення усвідомлено, за власною вірою, після покаяння та особистого рішення слідувати за Христом?";

function createBaptismStatusKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("Так, я був(ла) хрещений(а) усвідомлено", "register_baptized")],
    [Markup.button.callback("Ні, мене хрестили в дитинстві", "register_infant_baptized")],
    [Markup.button.callback("Ні, я ще не хрестився/хрестилася", "register_unbaptized")],
  ]);
}

async function askBaptismQuestion(ctx) {
  await ctx.reply(BAPTISM_QUESTION, createBaptismStatusKeyboard());
}

/**
 * Класифікація текстової відповіді про хрещення.
 * @returns {"conscious"|"infant"|"none"|null}
 */
function classifyBaptismTextAnswer(msg) {
  const text = (msg || "").toString().toLowerCase().trim();
  if (!text) return null;

  // Дитяче / неусвідомлене хрещення — першим, щоб «хрестили в 2 роки» не пішло як conscious
  const infantPatterns = [
    /младен/,
    /немовля/,
    /немовлят/,
    /дитинств/,
    /в\s*дитинстві/,
    /як\s*дитину/,
    /маленьк/,
    /хрестил[аии]\s*(мене\s*)?(в\s*)?\d/,
    /хрестил[аии].*(місяц|рік|роки|років|год)/,
    /в\s*\d+\s*(місяц|рік|роки|років|год)/,
    /батьк.*(хрести|крести)/,
    /крестил[аии]\s*(меня\s*)?(в\s*)?\d/,
    /крестил.*(месяц|год|лет|детств|младен)/,
    /в\s*детств/,
  ];
  if (infantPatterns.some((re) => re.test(text))) {
    return "infant";
  }

  // Ще не хрестився
  const nonePatterns = [
    /^ні$/,
    /^нет$/,
    /^no$/,
    /ще\s*не/,
    /не\s*хрестив/,
    /не\s*хрестил/,
    /не\s*крестил/,
    /не\s*принимал.*крещ/,
    /не\s*приймав.*хрещ/,
  ];
  if (nonePatterns.some((re) => re.test(text))) {
    return "none";
  }

  // Усвідомлене хрещення
  const consciousPatterns = [
    /^так$/,
    /^да$/,
    /^yes$/,
    /усвідомлен/,
    /осознанн/,
    /за\s*власною\s*вірою/,
    /по\s*вере/,
    /по\s*вірі/,
    /я\s*в\s*христ/,
    /в\s*христ/,
    /хрещений\s*усвідомлен/,
    /хрещена\s*усвідомлен/,
    /^хрещений$/,
    /^хрещена$/,
    /^крещён$/,
    /^крещен$/,
    /^крещёна$/,
    /^крещена$/,
  ];
  if (consciousPatterns.some((re) => re.test(text))) {
    return "conscious";
  }

  return null;
}

const stepLabelsShort = {
  1: "ім'я (наприклад: Тарас)",
  2: "прізвище (наприклад: Шевченко)",
  3: "статус усвідомленого хрещення (кнопки нижче)",
  4: "дату хрещення (ДД-ММ-РРРР)",
  5: "дату народження (ДД-ММ-РРРР)",
  6: "номер телефону (+380...)",
};

const stepLabelsFull = {
  1: "Введіть, будь ласка, ваше ім'я (наприклад: Тарас).",
  2: "Введіть, будь ласка, ваше прізвище (наприклад: Шевченко).",
  3: "Оберіть варіант щодо усвідомленого хрещення кнопками нижче.",
  4: "Вкажіть дату вашого усвідомленого хрещення (у форматі ДД-ММ-РРРР).",
  5: "Вкажіть дату вашого народження (у форматі ДД-ММ-РРРР).",
  6: "Вкажіть ваш номер телефону (+380...).",
};

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

  const isRegistrationStep = ctx.session?.step >= 1 && ctx.session?.step <= REGISTRATION_MAX_STEP;
  if (isRegistrationStep) {
    const currentStep = ctx.session?.step || 1;
    const hint = stepLabelsShort[currentStep] || "";
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
  await ctx.reply("Введіть, будь ласка, ваше ім'я (наприклад: Тарас):");
}

/**
 * Callback: продовжити реєстрацію (нагадування, що ввести)
 */
export async function handleRegisterContinue(ctx) {
  await ctx.answerCbQuery("Продовжуйте");
  const currentStep = ctx.session?.step || 1;
  const hint = stepLabelsFull[currentStep] || "";
  await ctx.reply(`➡️ ${hint}`);

  if (currentStep === 3 && ctx.session?.data?.firstName && ctx.session?.data?.lastName) {
    await askBaptismQuestion(ctx);
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
  await ctx.reply("Введіть, будь ласка, ваше ім'я (наприклад: Тарас):");
}

/**
 * @param {boolean} isBaptized - true лише для усвідомленого хрещення
 * @param {"conscious"|"infant"|"none"} [kind] - уточнення гілки
 */
export async function handleRegisterBaptismStatus(ctx, isBaptized, kind = null) {
  if (!ctx.session?.data) {
    await ctx.answerCbQuery("⚠️ Сесія закінчилася. Почніть реєстрацію знову.");
    const menu = await createMainMenu(ctx);
    return ctx.reply("⚠️ Сесія закінчилася. Натисніть 📝 Зареєструватися, щоб почати знову.", menu);
  }

  const choice = kind || (isBaptized ? "conscious" : "none");

  if (choice === "conscious" || isBaptized === true) {
    ctx.session.data.baptized = true;
    ctx.session.step = 4;
    await ctx.answerCbQuery("✅ Обрано: усвідомлене хрещення");
    await ctx.reply("📅 Вкажіть дату вашого усвідомленого хрещення (у форматі ДД-ММ-РРРР):");
    return;
  }

  // infant і none → для логіки бота НЕ хрещений (candidates)
  ctx.session.data.baptized = false;
  if (choice === "infant") {
    ctx.session.data.baptism = BAPTISM_INFANT_LABEL;
    await ctx.answerCbQuery("Обрано: хрещення в дитинстві");
  } else {
    ctx.session.data.baptism = BAPTISM_NONE_LABEL;
    await ctx.answerCbQuery("⏳ Обрано: ще не хрещений(а)");
  }
  ctx.session.step = 5;
  await ctx.reply("🎂 Вкажіть дату вашого народження (у форматі ДД-ММ-РРРР):");
}

/**
 * Обробка кроків реєстрації через текст
 */
export async function handleRegisterSteps(ctx, msg) {
  const step = ctx.session?.step;
  if (!step || step < 1 || step > REGISTRATION_MAX_STEP) {
    return false;
  }

  if (!ctx.session?.data) {
    ctx.session = { step: 1, data: {} };
    const menu = await createMainMenu(ctx);
    await ctx.reply("⚠️ Сесія була втрачена. Почнімо реєстрацію заново.", menu);
    await ctx.reply("Введіть, будь ласка, ваше ім'я (наприклад: Тарас):");
    return true;
  }

  if (step === 1) {
    const validatedFirstName = validateName(msg);
    if (!validatedFirstName) {
      await ctx.reply("⚠️ Будь ласка, введіть коректне ім'я (наприклад: Тарас). Тільки букви, 2–100 символів.");
      return true;
    }
    ctx.session.data.firstName = validatedFirstName;
    ctx.session.step = 2;
    await ctx.reply("Введіть, будь ласка, ваше прізвище (наприклад: Шевченко):");
    return true;
  }

  if (step === 2) {
    const validatedLastName = validateName(msg);
    if (!validatedLastName) {
      await ctx.reply("⚠️ Будь ласка, введіть коректне прізвище (наприклад: Шевченко). Тільки букви, 2–100 символів.");
      return true;
    }
    ctx.session.data.lastName = validatedLastName;
    ctx.session.data.name = `${ctx.session.data.firstName} ${validatedLastName}`;
    ctx.session.step = 3;
    await askBaptismQuestion(ctx);
    return true;
  }

  if (step === 3) {
    const choice = classifyBaptismTextAnswer(msg);
    if (!choice) {
      await ctx.reply(
        "⚠️ Будь ласка, оберіть один із варіантів кнопками нижче — так відповідь буде однозначною.",
        createBaptismStatusKeyboard()
      );
      return true;
    }

    if (choice === "conscious") {
      ctx.session.data.baptized = true;
      ctx.session.step = 4;
      await ctx.reply("📅 Вкажіть дату вашого усвідомленого хрещення (у форматі ДД-ММ-РРРР):");
      return true;
    }

    ctx.session.data.baptized = false;
    ctx.session.data.baptism = choice === "infant" ? BAPTISM_INFANT_LABEL : BAPTISM_NONE_LABEL;
    ctx.session.step = 5;
    await ctx.reply("🎂 Вкажіть дату вашого народження (у форматі ДД-ММ-РРРР):");
    return true;
  }

  if (step === 4) {
    const validatedDate = validateBaptismDate(msg);
    if (!validatedDate) {
      await ctx.reply("⚠️ Будь ласка, введіть коректну дату у форматі ДД-ММ-РРРР (наприклад: 15-03-2020).");
      return true;
    }
    ctx.session.data.baptism = validatedDate;
    ctx.session.step = 5;
    await ctx.reply("🎂 Вкажіть дату вашого народження (у форматі ДД-ММ-РРРР):");
    return true;
  }

  if (step === 5) {
    const validatedBirthDate = validateBirthDate(msg);
    if (!validatedBirthDate) {
      await ctx.reply("⚠️ Будь ласка, введіть коректну дату у форматі ДД-ММ-РРРР (наприклад: 15-03-1990).");
      return true;
    }
    ctx.session.data.birthday = validatedBirthDate;
    ctx.session.step = 6;
    await ctx.reply("📞 Вкажіть ваш номер телефону (+380...):");
    return true;
  }

  if (step === 6) {
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
      baptism: ctx.session.data.baptism || BAPTISM_NONE_LABEL,
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
