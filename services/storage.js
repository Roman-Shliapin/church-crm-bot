// Сервіс для роботи з MongoDB (замість JSON файлів)
import { getCollection } from "./database.js";
import { logError, logSuccess } from "../utils/logger.js";

// Назви колекцій в MongoDB
const COLLECTIONS = {
  MEMBERS: "members",
  CANDIDATES: "candidates",
  NEEDS: "needs",
  PRAYERS: "prayers",
  LESSONS: "lessons",
  LITERATURE_REQUESTS: "literature_requests",
};

// ==================== ЧЛЕНИ ЦЕРКВИ ====================

/**
 * Читає всіх зареєстрованих користувачів з MongoDB (і членів, і кандидатів)
 * @returns {Promise<Array>} Масив всіх зареєстрованих
 */
export async function readMembers() {
  try {
    // Читаємо хрещених з members
    const membersCollection = await getCollection(COLLECTIONS.MEMBERS);
    const members = await membersCollection.find({}).toArray();
    
    // Читаємо нехрещених з candidates
    const candidatesCollection = await getCollection(COLLECTIONS.CANDIDATES);
    const candidates = await candidatesCollection.find({}).toArray();
    
    // Об'єднуємо та прибираємо MongoDB _id поле
    const all = [...members, ...candidates];
    return all.map(({ _id, ...member }) => member);
  } catch (err) {
    logError("Помилка читання members з MongoDB", err);
    return [];
  }
}

/**
 * Читає тільки хрещених членів церкви з MongoDB
 * @returns {Promise<Array>} Масив хрещених членів церкви
 */
export async function readBaptizedMembers() {
  try {
    const collection = await getCollection(COLLECTIONS.MEMBERS);
    // Знаходимо тільки тих, хто точно хрещений (baptized === true)
    const members = await collection.find({ baptized: true }).toArray();
    
    // Додаткова перевірка на клієнті
    const filteredMembers = members.filter(member => {
      const baptized = member.baptized;
      return baptized === true || baptized === "true";
    });
    
    return filteredMembers.map(({ _id, ...member }) => member);
  } catch (err) {
    logError("Помилка читання хрещених members з MongoDB", err);
    return [];
  }
}

/**
 * Читає тільки нехрещених з MongoDB (з колекції candidates)
 * @returns {Promise<Array>} Масив нехрещених
 */
export async function readUnbaptizedMembers() {
  try {
    const collection = await getCollection(COLLECTIONS.CANDIDATES);
    const candidates = await collection.find({}).toArray();
    return candidates.map(({ _id, ...candidate }) => candidate);
  } catch (err) {
    logError("Помилка читання нехрещених з MongoDB", err);
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
 * Знаходить члена церкви або кандидата за Telegram ID
 * @param {number} userId - Telegram ID користувача
 * @returns {Promise<Object|null>} Об'єкт члена церкви/кандидата або null
 */
export async function findMemberById(userId) {
  try {
    // Спочатку шукаємо в members (хрещені)
    const membersCollection = await getCollection(COLLECTIONS.MEMBERS);
    let member = await membersCollection.findOne({ id: userId });
    
    if (member) {
      const { _id, ...memberData } = member;
      return memberData;
    }
    
    // Якщо не знайдено в members, шукаємо в candidates (нехрещені)
    const candidatesCollection = await getCollection(COLLECTIONS.CANDIDATES);
    member = await candidatesCollection.findOne({ id: userId });
    
    if (member) {
      const { _id, ...memberData } = member;
      return memberData;
    }
    
    return null;
  } catch (err) {
    logError("Помилка пошуку member/candidate в MongoDB", err);
    return null;
  }
}

/**
 * Додає нового члена церкви або кандидата
 * @param {Object} user - Об'єкт з даними користувача
 */
export async function addMember(user) {
  try {
    // Переконуємося, що baptized завжди булеве значення (не undefined)
    if (user.baptized === undefined) {
      user.baptized = false;
    }
    
    if (user.baptized === true) {
      // Хрещений - зберігаємо в members
      const collection = await getCollection(COLLECTIONS.MEMBERS);
      
      // Перевіряємо, чи користувач не зареєстрований
      const existing = await collection.findOne({ id: user.id });
      if (existing) {
        throw new Error("Користувач вже зареєстрований");
      }
      
      await collection.insertOne(user);
      logSuccess("Member added to MongoDB (members)", { userId: user.id, baptized: user.baptized });
    } else {
      // Нехрещений - зберігаємо в candidates
      const collection = await getCollection(COLLECTIONS.CANDIDATES);
      
      // Перевіряємо, чи користувач не зареєстрований
      const existing = await collection.findOne({ id: user.id });
      if (existing) {
        throw new Error("Користувач вже зареєстрований");
      }
      
      await collection.insertOne(user);
      logSuccess("Candidate added to MongoDB (candidates)", { userId: user.id, baptized: user.baptized });
    }
  } catch (err) {
    logError("Помилка додавання member/candidate в MongoDB", err);
    throw err;
  }
}

// ==================== КАНДИДАТИ (НЕХРЕЩЕНІ) ====================

/**
 * Читає всіх кандидатів (нехрещених) з MongoDB
 * @returns {Promise<Array>} Масив кандидатів
 */
export async function readCandidates() {
  try {
    const collection = await getCollection(COLLECTIONS.CANDIDATES);
    const candidates = await collection.find({}).toArray();
    return candidates.map(({ _id, ...candidate }) => candidate);
  } catch (err) {
    logError("Помилка читання candidates з MongoDB", err);
    return [];
  }
}

/**
 * Знаходить кандидата за Telegram ID
 * @param {number} userId - Telegram ID користувача
 * @returns {Promise<Object|null>} Об'єкт кандидата або null
 */
export async function findCandidateById(userId) {
  try {
    const collection = await getCollection(COLLECTIONS.CANDIDATES);
    const candidate = await collection.findOne({ id: userId });
    if (!candidate) return null;
    
    const { _id, ...candidateData } = candidate;
    return candidateData;
  } catch (err) {
    logError("Помилка пошуку candidate в MongoDB", err);
    return null;
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
 * Читає активні (не заархівовані) заявки на допомогу з MongoDB
 * ВАЖЛИВО: "Виконано" не видаляє запис з БД, а ставить archived=true,
 * щоб він більше не показувався в списку в Telegram.
 * @returns {Promise<Array>} Масив активних заявок
 */
export async function readActiveNeeds() {
  try {
    const collection = await getCollection(COLLECTIONS.NEEDS);
    const needs = await collection.find({ archived: { $ne: true } }).toArray();
    return needs.map(({ _id, ...need }) => need);
  } catch (err) {
    logError("Помилка читання active needs з MongoDB", err);
    return [];
  }
}

/**
 * Читає виконані/заархівовані заявки на допомогу з MongoDB
 * @returns {Promise<Array>}
 */
export async function readArchivedNeeds() {
  try {
    const collection = await getCollection(COLLECTIONS.NEEDS);
    const needs = await collection.find({ archived: true }).toArray();
    return needs.map(({ _id, ...need }) => need);
  } catch (err) {
    logError("Помилка читання archived needs з MongoDB", err);
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
 * Видаляє заявку на допомогу з MongoDB назавжди (hard delete)
 * @param {number|string} needId
 * @returns {Promise<boolean>} true якщо видалено, інакше false
 */
export async function deleteNeedById(needId) {
  try {
    const collection = await getCollection(COLLECTIONS.NEEDS);
    const result = await collection.deleteOne({ id: parseInt(needId) });
    return result.deletedCount === 1;
  } catch (err) {
    logError("Помилка видалення need в MongoDB", err);
    return false;
  }
}

/**
 * Повертає останню гуманітарну заявку користувача в конкретній категорії ("products"|"chemistry")
 * Категорія визначається по description (Продукти/Хімія та ключові слова).
 * @param {number} userId
 * @param {"products"|"chemistry"} categoryKey
 * @returns {Promise<Object|null>}
 */
export async function findLatestHumanitarianNeedByCategory(userId, categoryKey) {
  try {
    const collection = await getCollection(COLLECTIONS.NEEDS);
    const all = await collection
      .find({ userId: parseInt(userId), type: "humanitarian" })
      .toArray();

    const needs = all.map(({ _id, ...need }) => need);
    const descNorm = (s) => (s || "").toString().toLowerCase().trim();

    const isProducts = (n) => {
      const d = descNorm(n.description);
      return d === "продукти" || d.includes("продукт") || d.includes("харч") || d.includes("їж");
    };
    const isChemistry = (n) => {
      const d = descNorm(n.description);
      return d === "хімія" || d.includes("хім") || d.includes("порош") || d.includes("миюч") || d.includes("мило");
    };

    const filtered =
      categoryKey === "products"
        ? needs.filter(isProducts)
        : needs.filter(isChemistry);

    if (filtered.length === 0) return null;

    // id у нас = Date.now(), тому можна сортувати як timestamp
    filtered.sort((a, b) => (b.id || 0) - (a.id || 0));
    return filtered[0] || null;
  } catch (err) {
    logError("Помилка пошуку latest humanitarian need by category в MongoDB", err);
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

/**
 * Оновлює довільні поля заявки (НЕ видаляє запис)
 * @param {number|string} needId
 * @param {Object} fields
 * @returns {Promise<Object|null>}
 */
export async function updateNeedFields(needId, fields) {
  try {
    const collection = await getCollection(COLLECTIONS.NEEDS);
    const result = await collection.findOneAndUpdate(
      { id: parseInt(needId) },
      { $set: fields },
      { returnDocument: "after" }
    );
    if (!result.value) return null;
    const { _id, ...needData } = result.value;
    return needData;
  } catch (err) {
    logError("Помилка оновлення need fields в MongoDB", err);
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
 * Читає активні (не заархівовані) молитвені потреби з MongoDB
 * @returns {Promise<Array>}
 */
export async function readActivePrayers() {
  try {
    const collection = await getCollection(COLLECTIONS.PRAYERS);
    const prayers = await collection.find({ archived: { $ne: true } }).toArray();
    return prayers.map(({ _id, ...prayer }) => prayer);
  } catch (err) {
    logError("Помилка читання active prayers з MongoDB", err);
    return [];
  }
}

/**
 * Читає виконані/заархівовані молитвені потреби з MongoDB
 * @returns {Promise<Array>}
 */
export async function readArchivedPrayers() {
  try {
    const collection = await getCollection(COLLECTIONS.PRAYERS);
    const prayers = await collection.find({ archived: true }).toArray();
    return prayers.map(({ _id, ...prayer }) => prayer);
  } catch (err) {
    logError("Помилка читання archived prayers з MongoDB", err);
    return [];
  }
}

/**
 * Оновлює довільні поля молитви (НЕ видаляє запис)
 * @param {number|string} prayerId
 * @param {Object} fields
 * @returns {Promise<Object|null>}
 */
export async function updatePrayerFields(prayerId, fields) {
  try {
    const collection = await getCollection(COLLECTIONS.PRAYERS);
    const result = await collection.findOneAndUpdate(
      { id: parseInt(prayerId) },
      { $set: fields },
      { returnDocument: "after" }
    );
    if (!result.value) return null;
    const { _id, ...prayerData } = result.value;
    return prayerData;
  } catch (err) {
    logError("Помилка оновлення prayer fields в MongoDB", err);
    return null;
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

/**
 * Знаходить молитву за ID
 * @param {number} prayerId - ID молитви
 * @returns {Promise<Object|null>} Об'єкт молитви або null
 */
export async function findPrayerById(prayerId) {
  try {
    const collection = await getCollection(COLLECTIONS.PRAYERS);
    const prayer = await collection.findOne({ id: parseInt(prayerId) });
    if (!prayer) return null;
    
    const { _id, ...prayerData } = prayer;
    return prayerData;
  } catch (err) {
    logError("Помилка пошуку prayer в MongoDB", err);
    return null;
  }
}

/**
 * Видаляє молитвенну потребу з MongoDB назавжди (hard delete)
 * @param {number|string} prayerId
 * @returns {Promise<boolean>} true якщо видалено, інакше false
 */
export async function deletePrayerById(prayerId) {
  try {
    const collection = await getCollection(COLLECTIONS.PRAYERS);
    const result = await collection.deleteOne({ id: parseInt(prayerId) });
    return result.deletedCount === 1;
  } catch (err) {
    logError("Помилка видалення prayer в MongoDB", err);
    return false;
  }
}

/**
 * Оновлює молитву, додаючи інформацію про уточнення
 * @param {number} prayerId - ID молитви
 * @param {number} adminId - ID адміна, який уточнює
 * @param {string} clarificationText - Текст уточнення
 */
export async function updatePrayerClarification(prayerId, adminId, clarificationText) {
  try {
    const collection = await getCollection(COLLECTIONS.PRAYERS);
    await collection.findOneAndUpdate(
      { id: parseInt(prayerId) },
      { 
        $set: { 
          clarifyingAdminId: adminId,
          clarificationText: clarificationText,
          needsClarificationReply: true
        } 
      }
    );
    logSuccess("Prayer clarification updated", { prayerId, adminId });
  } catch (err) {
    logError("Помилка оновлення clarification в MongoDB", err);
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

// ==================== ЗАПИТИ ЛІТЕРАТУРИ ====================

/**
 * Додає новий запит на літературу
 * @param {Object} request - Об'єкт запиту
 */
export async function addLiteratureRequest(request) {
  try {
    const collection = await getCollection(COLLECTIONS.LITERATURE_REQUESTS);
    await collection.insertOne(request);
    logSuccess("Literature request added to MongoDB", { requestId: request.id });
  } catch (err) {
    logError("Помилка додавання literature request в MongoDB", err);
    throw err;
  }
}

/**
 * Читає всі запити на літературу з MongoDB
 * @returns {Promise<Array>} Масив запитів
 */
export async function readLiteratureRequests() {
  try {
    const collection = await getCollection(COLLECTIONS.LITERATURE_REQUESTS);
    const requests = await collection.find({}).toArray();
    return requests.map(({ _id, ...request }) => request);
  } catch (err) {
    logError("Помилка читання literature requests з MongoDB", err);
    return [];
  }
}

/**
 * Знаходить запит на літературу за ID
 * @param {number} requestId - ID запиту
 * @returns {Promise<Object|null>} Об'єкт запиту або null
 */
export async function findLiteratureRequestById(requestId) {
  try {
    const collection = await getCollection(COLLECTIONS.LITERATURE_REQUESTS);
    const request = await collection.findOne({ id: parseInt(requestId) });
    if (!request) return null;
    
    const { _id, ...requestData } = request;
    return requestData;
  } catch (err) {
    logError("Помилка пошуку literature request в MongoDB", err);
    return null;
  }
}
