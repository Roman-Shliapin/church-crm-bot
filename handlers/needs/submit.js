import { addNeed, addMember, findMemberById } from "../../services/storage.js";
import { createNeed } from "../../utils/helpers.js";
import { validateName, validatePhone, validateBirthDate, sanitizeText } from "../../utils/validation.js";
import { createMainMenu } from "../commands.js";
import { assertCanSubmitNeed } from "./limits.js";
import {
  HUMANITARIAN_CHEMISTRY_AVAILABLE,
  createNeedTypeMenu,
  createHumanitarianCategoryMenu,
  createGuestRegistrationConfirmMenu,
} from "./menus.js";
import { notifyAdmins } from "./notify.js";

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

  if (!(await assertCanSubmitNeed(ctx, needType))) return true;

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
        "Можете обрати «Продукти» або натисніть кнопку «🏠 Повернутися до головного меню» нижче.",
      createHumanitarianCategoryMenu()
    );
    return true;
  }

  let description = null;
  if (msg === "Продукти") description = "Продукти";
  if (msg === "Хімія") description = "Хімія";
  if (!description) return false;

  if (!(await assertCanSubmitNeed(ctx, "humanitarian"))) return true;

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
      const needType = data.needType || "other";
      if (!(await assertCanSubmitNeed(ctx, needType))) return true;

      const need = createNeed({
        userId,
        name: data.name,
        baptism: "Не член церкви",
        birthday: data.birthday,
        phone: data.phone,
        description: data.description,
        type: needType,
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
    const needType = ctx.session.data.needType || "other";
    if (!(await assertCanSubmitNeed(ctx, needType))) return true;

    const need = createNeed({
      userId: ctx.from.id,
      name: user.name,
      baptism: user.baptism,
      birthday: user.birthday,
      phone: user.phone,
      description: sanitizedDescription,
      type: needType,
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
