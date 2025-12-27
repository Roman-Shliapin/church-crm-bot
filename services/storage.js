// Сервіс для роботи з JSON файлами (база даних)
import fs from "fs";
import { MEMBERS_FILE, NEEDS_FILE, PRAYERS_FILE, LESSONS_FILE } from "../config/constants.js";
import { logError, logWarning, logSuccess } from "../utils/logger.js";

/**
 * Читає дані з файлу members.json
 * @returns {Array} Масив членів церкви
 */
export function readMembers() {
  try {
    const data = fs.readFileSync(MEMBERS_FILE, "utf-8");
    return JSON.parse(data || "[]");
  } catch (err) {
    logError("Помилка читання members.json", err);
    return [];
  }
}

/**
 * Зберігає дані у файл members.json
 * @param {Array} members - Масив членів церкви
 */
export function writeMembers(members) {
  try {
    fs.writeFileSync(MEMBERS_FILE, JSON.stringify(members, null, 2));
    logSuccess("Members data saved", { count: members.length });
  } catch (err) {
    logError("Помилка запису members.json", err);
    throw err;
  }
}

/**
 * Знаходить члена церкви за Telegram ID
 * @param {number} userId - Telegram ID користувача
 * @returns {Object|null} Об'єкт члена церкви або null
 */
export function findMemberById(userId) {
  const members = readMembers();
  return members.find((member) => member.id === userId) || null;
}

/**
 * Додає нового члена церкви
 * @param {Object} user - Об'єкт з даними користувача
 */
export function addMember(user) {
  const members = readMembers();
  // Перевіряємо, чи користувач не зареєстрований
  if (members.find((m) => m.id === user.id)) {
    throw new Error("Користувач вже зареєстрований");
  }
  members.push(user);
  writeMembers(members);
}

/**
 * Читає дані з файлу needs.json
 * @returns {Array} Масив заявок на допомогу
 */
export function readNeeds() {
  try {
    const data = fs.readFileSync(NEEDS_FILE, "utf-8");
    return JSON.parse(data || "[]");
  } catch (err) {
    logError("Помилка читання needs.json", err);
    return [];
  }
}

/**
 * Зберігає дані у файл needs.json
 * @param {Array} needs - Масив заявок на допомогу
 */
export function writeNeeds(needs) {
  try {
    fs.writeFileSync(NEEDS_FILE, JSON.stringify(needs, null, 2));
  } catch (err) {
    logError("Помилка запису needs.json", err);
    throw err;
  }
}

/**
 * Додає нову заявку на допомогу
 * @param {Object} need - Об'єкт заявки
 */
export function addNeed(need) {
  const needs = readNeeds();
  needs.push(need);
  writeNeeds(needs);
}

/**
 * Знаходить заявку за ID
 * @param {number|string} needId - ID заявки
 * @returns {Object|null} Об'єкт заявки або null
 */
export function findNeedById(needId) {
  const needs = readNeeds();
  return needs.find((n) => n.id.toString() === needId.toString()) || null;
}

/**
 * Оновлює статус заявки
 * @param {number|string} needId - ID заявки
 * @param {string} newStatus - Новий статус
 * @returns {Object|null} Оновлений об'єкт заявки або null
 */
export function updateNeedStatus(needId, newStatus) {
  const needs = readNeeds();
  const need = needs.find((n) => n.id.toString() === needId.toString());
  if (!need) {
    return null;
  }
  
  // Оновлюємо статус
  need.status = newStatus;
  writeNeeds(needs);
  
  return need;
}

// ==================== МОЛИТВЕННІ ПОТРЕБИ ====================

/**
 * Читає дані з файлу prayers.json
 * @returns {Array} Масив молитвенних потреб
 */
export function readPrayers() {
  try {
    const data = fs.readFileSync(PRAYERS_FILE, "utf-8");
    return JSON.parse(data || "[]");
  } catch (err) {
    logError("Помилка читання prayers.json", err);
    return [];
  }
}

/**
 * Зберігає дані у файл prayers.json
 * @param {Array} prayers - Масив молитвенних потреб
 */
export function writePrayers(prayers) {
  try {
    fs.writeFileSync(PRAYERS_FILE, JSON.stringify(prayers, null, 2));
  } catch (err) {
    logError("Помилка запису prayers.json", err);
    throw err;
  }
}

/**
 * Додає нову молитвенну потребу
 * @param {Object} prayer - Об'єкт молитвенної потреби
 */
export function addPrayer(prayer) {
  const prayers = readPrayers();
  prayers.push(prayer);
  writePrayers(prayers);
}

// ==================== БІБЛІЙНІ УРОКИ ====================

/**
 * Читає дані з файлу lessons.json
 * @returns {Array} Масив біблійних уроків
 */
export function readLessons() {
  try {
    const data = fs.readFileSync(LESSONS_FILE, "utf-8");
    return JSON.parse(data || "[]");
  } catch (err) {
    logError("Помилка читання lessons.json", err);
    // Повертаємо порожній масив, якщо файл не існує або помилка
    return [];
  }
}

/**
 * Зберігає дані у файл lessons.json
 * @param {Array} lessons - Масив біблійних уроків
 */
export function writeLessons(lessons) {
  try {
    fs.writeFileSync(LESSONS_FILE, JSON.stringify(lessons, null, 2));
    logSuccess("Lessons data saved", { count: lessons.length });
  } catch (err) {
    logError("Помилка запису lessons.json", err);
    throw err;
  }
}

/**
 * Знаходить урок за ID
 * @param {number} lessonId - ID уроку
 * @returns {Object|null} Об'єкт уроку або null
 */
export function findLessonById(lessonId) {
  const lessons = readLessons();
  return lessons.find((lesson) => lesson.id === lessonId) || null;
}

