// Підключення до MongoDB Atlas
import { MongoClient } from "mongodb";
import { logError, logInfo, logSuccess } from "../utils/logger.js";

let client = null;
let db = null;

/**
 * Підключається до MongoDB Atlas
 * @returns {Promise<MongoClient>}
 */
export async function connectToDatabase() {
  if (client && db) {
    return { client, db };
  }

  const uri = process.env.MONGODB_URI;
  
  if (!uri) {
    throw new Error("MONGODB_URI не встановлено в .env файлі");
  }

  try {
    client = new MongoClient(uri);
    await client.connect();
    db = client.db(); // Використовуємо базу даних з connection string
    
    logSuccess("Підключено до MongoDB", {});
    return { client, db };
  } catch (error) {
    logError("Помилка підключення до MongoDB", error);
    throw error;
  }
}

/**
 * Отримує колекцію з бази даних
 * @param {string} collectionName - Назва колекції
 * @returns {Promise<Collection>}
 */
export async function getCollection(collectionName) {
  if (!db) {
    await connectToDatabase();
  }
  return db.collection(collectionName);
}

/**
 * Закриває підключення до бази даних
 */
export async function closeDatabase() {
  if (client) {
    await client.close();
    client = null;
    db = null;
    logInfo("Підключення до MongoDB закрито", {});
  }
}

/**
 * Перевіряє чи є підключення до БД
 * @returns {boolean}
 */
export function isConnected() {
  return client !== null && db !== null;
}

