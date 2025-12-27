// Сервіс для роботи з MongoDB (замість JSON файлів)
import { getCollection } from "./database.js";
import { logError, logSuccess } from "../utils/logger.js";

// Назви колекцій в MongoDB
const COLLECTIONS = {
  MEMBERS: "members",
  NEEDS: "needs",
  PRAYERS: "prayers",
  LESSONS: "lessons",
};

// ==================== ЧЛЕНИ ЦЕРКВИ ====================

/**
 * Читає всіх членів церкви з MongoDB
 * @returns {Promise<Array>} Масив членів церкви
 */
export async function readMembers() {
  try {
    const collection = await getCollection(COLLECTIONS.MEMBERS);
    const members = await collection.find({}).toArray();
    // Прибираємо MongoDB _id поле для сумісності
    return members.map(({ _id, ...member }) => member);
  } catch (err) {
    logError("Помилка читання members з MongoDB", err);
    return [];
  }
}

/**
 * Зберігає масив членів церкви в MongoDB
 * @param {Array} members - Масив членів церкви
 */
export async function writeMembers(members) {
  try {
    const collection = await getCollection(COLLECTIONS.MEMBERS);
    
    // Очищаємо колекцію та вставляємо нові дані
    await collection.deleteMany({});
    if (members.length > 0) {
      await collection.insertMany(members);
    }
    
    logSuccess("Members data saved to MongoDB", { count: members.length });
  } catch (err) {
    logError("Помилка запису members в MongoDB", err);
    throw err;
  }
}

/**
 * Знаходить члена церкви за Telegram ID
 * @param {number} userId - Telegram ID користувача
 * @returns {Promise<Object|null>} Об'єкт члена церкви або null
 */
export async function findMemberById(userId) {
  try {
    const collection = await getCollection(COLLECTIONS.MEMBERS);
    const member = await collection.findOne({ id: userId });
    if (!member) return null;
    
    // Прибираємо MongoDB _id поле
    const { _id, ...memberData } = member;
    return memberData;
  } catch (err) {
    logError("Помилка пошуку member в MongoDB", err);
    return null;
  }
}

/**
 * Додає нового члена церкви
 * @param {Object} user - Об'єкт з даними користувача
 */
export async function addMember(user) {
  try {
    const collection = await getCollection(COLLECTIONS.MEMBERS);
    
    // Перевіряємо, чи користувач не зареєстрований
    const existing = await collection.findOne({ id: user.id });
    if (existing) {
      throw new Error("Користувач вже зареєстрований");
    }
    
    await collection.insertOne(user);
    logSuccess("Member added to MongoDB", { userId: user.id });
  } catch (err) {
    logError("Помилка додавання member в MongoDB", err);
    throw err;
  }
}

// ==================== ЗАЯВКИ НА ДОПОМОГУ ====================

/**
 * Читає всі заявки на допомогу з MongoDB
 * @returns {Promise<Array>} Масив заявок на допомогу
 */
export async function readNeeds() {
  try {
    const collection = await getCollection(COLLECTIONS.NEEDS);
    const needs = await collection.find({}).toArray();
    // Прибираємо MongoDB _id поле
    return needs.map(({ _id, ...need }) => need);
  } catch (err) {
    logError("Помилка читання needs з MongoDB", err);
    return [];
  }
}

/**
 * Зберігає масив заявок на допомогу в MongoDB
 * @param {Array} needs - Масив заявок на допомогу
 */
export async function writeNeeds(needs) {
  try {
    const collection = await getCollection(COLLECTIONS.NEEDS);
    await collection.deleteMany({});
    if (needs.length > 0) {
      await collection.insertMany(needs);
    }
  } catch (err) {
    logError("Помилка запису needs в MongoDB", err);
    throw err;
  }
}

/**
 * Додає нову заявку на допомогу
 * @param {Object} need - Об'єкт заявки
 */
export async function addNeed(need) {
  try {
    const collection = await getCollection(COLLECTIONS.NEEDS);
    await collection.insertOne(need);
    logSuccess("Need added to MongoDB", { needId: need.id });
  } catch (err) {
    logError("Помилка додавання need в MongoDB", err);
    throw err;
  }
}

/**
 * Знаходить заявку за ID
 * @param {number|string} needId - ID заявки
 * @returns {Promise<Object|null>} Об'єкт заявки або null
 */
export async function findNeedById(needId) {
  try {
    const collection = await getCollection(COLLECTIONS.NEEDS);
    const need = await collection.findOne({ id: parseInt(needId) });
    if (!need) return null;
    
    const { _id, ...needData } = need;
    return needData;
  } catch (err) {
    logError("Помилка пошуку need в MongoDB", err);
    return null;
  }
}

/**
 * Оновлює статус заявки
 * @param {number|string} needId - ID заявки
 * @param {string} newStatus - Новий статус
 * @returns {Promise<Object|null>} Оновлений об'єкт заявки або null
 */
export async function updateNeedStatus(needId, newStatus) {
  try {
    const collection = await getCollection(COLLECTIONS.NEEDS);
    const result = await collection.findOneAndUpdate(
      { id: parseInt(needId) },
      { $set: { status: newStatus } },
      { returnDocument: "after" }
    );
    
    if (!result.value) {
      return null;
    }
    
    const { _id, ...needData } = result.value;
    return needData;
  } catch (err) {
    logError("Помилка оновлення need в MongoDB", err);
    return null;
  }
}

// ==================== МОЛИТВЕННІ ПОТРЕБИ ====================

/**
 * Читає всі молитвенні потреби з MongoDB
 * @returns {Promise<Array>} Масив молитвенних потреб
 */
export async function readPrayers() {
  try {
    const collection = await getCollection(COLLECTIONS.PRAYERS);
    const prayers = await collection.find({}).toArray();
    return prayers.map(({ _id, ...prayer }) => prayer);
  } catch (err) {
    logError("Помилка читання prayers з MongoDB", err);
    return [];
  }
}

/**
 * Зберігає масив молитвенних потреб в MongoDB
 * @param {Array} prayers - Масив молитвенних потреб
 */
export async function writePrayers(prayers) {
  try {
    const collection = await getCollection(COLLECTIONS.PRAYERS);
    await collection.deleteMany({});
    if (prayers.length > 0) {
      await collection.insertMany(prayers);
    }
  } catch (err) {
    logError("Помилка запису prayers в MongoDB", err);
    throw err;
  }
}

/**
 * Додає нову молитвенну потребу
 * @param {Object} prayer - Об'єкт молитвенної потреби
 */
export async function addPrayer(prayer) {
  try {
    const collection = await getCollection(COLLECTIONS.PRAYERS);
    await collection.insertOne(prayer);
    logSuccess("Prayer added to MongoDB", { prayerId: prayer.id });
  } catch (err) {
    logError("Помилка додавання prayer в MongoDB", err);
    throw err;
  }
}

// ==================== БІБЛІЙНІ УРОКИ ====================

/**
 * Читає всі біблійні уроки з MongoDB
 * @returns {Promise<Array>} Масив біблійних уроків
 */
export async function readLessons() {
  try {
    const collection = await getCollection(COLLECTIONS.LESSONS);
    const lessons = await collection.find({}).toArray();
    // Сортуємо за ID для коректного відображення
    lessons.sort((a, b) => a.id - b.id);
    return lessons.map(({ _id, ...lesson }) => lesson);
  } catch (err) {
    logError("Помилка читання lessons з MongoDB", err);
    return [];
  }
}

/**
 * Зберігає масив біблійних уроків в MongoDB
 * @param {Array} lessons - Масив біблійних уроків
 */
export async function writeLessons(lessons) {
  try {
    const collection = await getCollection(COLLECTIONS.LESSONS);
    await collection.deleteMany({});
    if (lessons.length > 0) {
      await collection.insertMany(lessons);
    }
    logSuccess("Lessons data saved to MongoDB", { count: lessons.length });
  } catch (err) {
    logError("Помилка запису lessons в MongoDB", err);
    throw err;
  }
}

/**
 * Знаходить урок за ID
 * @param {number} lessonId - ID уроку
 * @returns {Promise<Object|null>} Об'єкт уроку або null
 */
export async function findLessonById(lessonId) {
  try {
    const collection = await getCollection(COLLECTIONS.LESSONS);
    const lesson = await collection.findOne({ id: lessonId });
    if (!lesson) return null;
    
    const { _id, ...lessonData } = lesson;
    return lessonData;
  } catch (err) {
    logError("Помилка пошуку lesson в MongoDB", err);
    return null;
  }
}
