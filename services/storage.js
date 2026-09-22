// Сервіс для роботи з MongoDB (замість JSON файлів)
import { getCollection } from "./database.js";
import { logError, logSuccess } from "../utils/logger.js";

// Назви колекцій в MongoDB
const COLLECTIONS = {
  MEMBERS: "members",
  CANDIDATES: "candidates",
  NEEDS: "needs",
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

/**
 * Оновлює поля члена церкви або кандидата
 * @param {number} userId - Telegram ID користувача
 * @param {Object} updates - Об'єкт з полями для оновлення (name, baptism, baptized, birthday, phone)
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function updateMember(userId, updates) {
  try {
    const id = parseInt(userId, 10);
    if (!id) return { ok: false, reason: "invalid_id" };
    if (!updates || typeof updates !== "object" || Object.keys(updates).length === 0) {
      return { ok: true };
    }

    const membersCollection = await getCollection(COLLECTIONS.MEMBERS);
    const candidatesCollection = await getCollection(COLLECTIONS.CANDIDATES);

    let member = await membersCollection.findOne({ id });
    const collection = member ? membersCollection : candidatesCollection;
    if (!member) member = await candidatesCollection.findOne({ id });
    if (!member) return { ok: false, reason: "not_found" };

    await collection.updateOne({ id }, { $set: updates });
    logSuccess("Member updated", { userId: id, fields: Object.keys(updates) });
    return { ok: true };
  } catch (err) {
    logError("Помилка оновлення member/candidate в MongoDB", err);
    return { ok: false, reason: "error" };
  }
}

/**
 * Переміщує користувача з members -> candidates (тільки в цей бік)
 * @param {number} userId - Telegram ID користувача
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function moveMemberToCandidates(userId) {
  try {
    const id = parseInt(userId, 10);
    if (!id) return { ok: false, reason: "invalid_id" };

    const membersCollection = await getCollection(COLLECTIONS.MEMBERS);
    const candidatesCollection = await getCollection(COLLECTIONS.CANDIDATES);

    const member = await membersCollection.findOne({ id });
    if (!member) return { ok: false, reason: "not_found" };

    const existingCandidate = await candidatesCollection.findOne({ id });
    if (!existingCandidate) {
      const { _id, ...memberData } = member;
      const candidateDoc = {
        ...memberData,
        baptized: false,
        baptism: null,
        movedToCandidatesAt: new Date().toISOString(),
      };
      await candidatesCollection.insertOne(candidateDoc);
    }

    await membersCollection.deleteOne({ id });
    return { ok: true };
  } catch (err) {
    logError("Помилка переміщення member -> candidates в MongoDB", err);
    return { ok: false, reason: "error" };
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
 * Повертає активну (не заархівовану) заявку користувача заданого типу.
 * @param {number} userId
 * @param {"humanitarian"|"other"} type
 * @returns {Promise<Object|null>}
 */
export async function findActiveNeedByType(userId, type) {
  try {
    const collection = await getCollection(COLLECTIONS.NEEDS);
    const need = await collection.findOne({
      userId: parseInt(userId),
      type,
      archived: { $ne: true },
    });
    if (!need) return null;
    const { _id, ...rest } = need;
    return rest;
  } catch (err) {
    logError("Помилка пошуку active need by type в MongoDB", err);
    return null;
  }
}

/**
 * Звіт по гуманітарній допомозі: люди, які отримали допомогу, з кількістю видач.
 * @param {"products"|"chemistry"|"other"|"all"} categoryKey
 * @returns {Promise<Array<{name: string, phone: string, birthday: string, baptized: boolean, telegramId: number, count: number, lastDate: string, category: string}>>}
 */
export async function getHumanitarianReport(categoryKey) {
  try {
    const collection = await getCollection(COLLECTIONS.NEEDS);
    const all = await collection.find({ archived: true }).toArray();
    let needs = all.map(({ _id, ...need }) => need);

    const descNorm = (s) => (s || "").toString().toLowerCase().trim();
    const isProducts = (n) => {
      const d = descNorm(n.description);
      return d === "продукти" || d.includes("продукт") || d.includes("харч") || d.includes("їж");
    };
    const isChemistry = (n) => {
      const d = descNorm(n.description);
      return d === "хімія" || d.includes("хім") || d.includes("порош") || d.includes("миюч") || d.includes("мило");
    };

    if (categoryKey === "products") {
      needs = needs.filter(isProducts);
    } else if (categoryKey === "chemistry") {
      needs = needs.filter(isChemistry);
    } else if (categoryKey === "other") {
      needs = needs.filter((n) => n.type === "other");
    } else if (categoryKey === "all") {
      needs = needs.filter((n) => n.type === "humanitarian" || n.type === "other");
    } else {
      return [];
    }

    const categoryLabels = {
      products: "продукти",
      chemistry: "хімія",
      other: "інше",
      all: "всі",
    };
    const categoryLabel = categoryLabels[categoryKey] || categoryKey;

    const formatDoneAt = (iso) => {
      if (!iso) return "";
      const ts = Date.parse(iso);
      if (Number.isNaN(ts)) return String(iso);
      const d = new Date(ts);
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yyyy = d.getFullYear();
      return `${dd}.${mm}.${yyyy}`;
    };

    // Групуємо по userId
    const byUser = new Map();
    for (const need of needs) {
      const uid = need.userId;
      if (uid == null) continue;
      const existing = byUser.get(uid) || { count: 0, lastDoneAt: null, denormalized: need };
      existing.count += 1;
      const doneTs = Date.parse(need.doneAt || 0);
      const lastTs = Date.parse(existing.lastDoneAt || 0);
      if (!existing.lastDoneAt || (!Number.isNaN(doneTs) && doneTs >= lastTs)) {
        existing.lastDoneAt = need.doneAt || existing.lastDoneAt;
        existing.denormalized = need;
      }
      byUser.set(uid, existing);
    }

    const records = [];
    for (const [userId, stats] of byUser.entries()) {
      const person = await findMemberById(userId);
      const fallback = stats.denormalized || {};
      records.push({
        name: person?.name || fallback.name || "",
        phone: person?.phone || fallback.phone || "",
        birthday: person?.birthday || fallback.birthday || "",
        baptized: person
          ? person.baptized === true || person.baptized === "true"
          : false,
        telegramId: userId,
        count: stats.count,
        lastDate: formatDoneAt(stats.lastDoneAt),
        category: categoryLabel,
      });
    }

    records.sort((a, b) => (a.name || "").localeCompare(b.name || "", "uk"));
    return records;
  } catch (err) {
    logError("Помилка формування звіту по гуманітарній допомозі в MongoDB", err);
    return [];
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
