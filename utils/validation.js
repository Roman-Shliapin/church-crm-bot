// Утиліти для валідації та санітизації даних

/**
 * Валідація та санітизація імені
 * @param {string} name - Ім'я для валідації
 * @returns {string|null} Санитизоване ім'я або null якщо невалідне
 */
export function validateName(name) {
  if (!name || typeof name !== "string") return null;
  
  // Обмеження довжини (2-100 символів)
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 100) return null;
  
  // Дозволені символи: букви, апостроф, дефіс, пробіли (кирилиця та латиниця)
  const nameRegex = /^[А-ЯЇІЄҐа-яїієґA-Za-z\s'-]+$/;
  if (!nameRegex.test(trimmed)) return null;
  
  // Прибираємо зайві пробіли
  return trimmed.replace(/\s+/g, " ");
}

/**
 * Валідація номера телефону (український формат)
 * @param {string} phone - Номер телефону для валідації
 * @returns {string|null} Валідний номер або null
 */
export function validatePhone(phone) {
  if (!phone || typeof phone !== "string") return null;
  
  // Видаляємо всі пробіли та дефіси
  const cleaned = phone.replace(/[\s-]/g, "");
  
  // Перевірка формату: +380XXXXXXXXX або 380XXXXXXXXX або 0XXXXXXXXX
  const phoneRegex = /^(\+?380|0)\d{9}$/;
  if (!phoneRegex.test(cleaned)) return null;
  
  // Нормалізуємо до формату +380XXXXXXXXX
  if (cleaned.startsWith("0")) {
    return "+380" + cleaned.substring(1);
  }
  if (cleaned.startsWith("380")) {
    return "+" + cleaned;
  }
  if (cleaned.startsWith("+380")) {
    return cleaned;
  }
  
  return null;
}

/**
 * Валідація дати (формат ДД-ММ-РРРР)
 * @param {string} date - Дата для валідації
 * @param {boolean} allowFuture - Дозволити дати в майбутньому (за замовчуванням false)
 * @returns {string|null} Валідна дата або null
 */
export function validateDate(date, allowFuture = false) {
  if (!date || typeof date !== "string") return null;
  
  // Перевірка формату ДД-ММ-РРРР
  const dateRegex = /^(\d{2})-(\d{2})-(\d{4})$/;
  const match = date.match(dateRegex);
  if (!match) return null;
  
  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);
  
  // Перевірка діапазонів
  if (year < 1900 || year > new Date().getFullYear() + 1) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  
  // Перевірка валідної дати
  const dateObj = new Date(year, month - 1, day);
  if (
    dateObj.getFullYear() !== year ||
    dateObj.getMonth() !== month - 1 ||
    dateObj.getDate() !== day
  ) {
    return null;
  }
  
  // Перевірка, що дата не в майбутньому (якщо не дозволено)
  if (!allowFuture && dateObj > new Date()) return null;
  
  return date; // Формат правильний
}

/**
 * Валідація дати хрещення (формат ДД-ММ-РРРР)
 * @param {string} date - Дата для валідації
 * @returns {string|null} Валідна дата або null
 */
export function validateBaptismDate(date) {
  return validateDate(date, false); // Хрещення не може бути в майбутньому
}

/**
 * Валідація дня народження (формат ДД-ММ-РРРР)
 * @param {string} date - Дата для валідації
 * @returns {string|null} Валідна дата або null
 */
export function validateBirthDate(date) {
  return validateDate(date, false); // День народження не може бути в майбутньому
}

/**
 * Санитизація текстового поля (захист від XSS)
 * @param {string} text - Текст для санітизації
 * @param {number} maxLength - Максимальна довжина (за замовчуванням 5000)
 * @returns {string|null} Санитизований текст або null якщо перевищено ліміт
 */
export function sanitizeText(text, maxLength = 5000) {
  if (!text || typeof text !== "string") return null;
  
  // Перевірка довжини
  if (text.length > maxLength) return null;
  
  // Видаляємо потенційно небезпечні символи
  // Залишаємо: букви, цифри, пробіли, пунктуацію, переноси рядків
  const sanitized = text
    .replace(/[<>]/g, "") // Видаляємо HTML теги
    .trim();
  
  if (sanitized.length === 0) return null;
  
  return sanitized;
}

/**
 * Валідація Telegram ID
 * @param {number} userId - Telegram ID
 * @returns {boolean}
 */
export function validateUserId(userId) {
  return (
    typeof userId === "number" &&
    userId > 0 &&
    userId < Number.MAX_SAFE_INTEGER
  );
}

/**
 * Перевірка розміру повідомлення
 * @param {string} text - Текст для перевірки
 * @param {number} maxLength - Максимальна довжина
 * @returns {boolean}
 */
export function checkMessageLength(text, maxLength = 5000) {
  return typeof text === "string" && text.length <= maxLength;
}

