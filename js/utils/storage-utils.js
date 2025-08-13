/**
 * Storage Utility Functions
 * Shared localStorage and sessionStorage operations
 */

/**
 * Storage types enum
 */
export const StorageType = {
  LOCAL: 'localStorage',
  SESSION: 'sessionStorage'
};

/**
 * Get storage object by type
 * @param {string} type - Storage type (local or session)
 * @returns {Storage} Storage object
 */
function getStorage(type = StorageType.LOCAL) {
  return type === StorageType.SESSION ? sessionStorage : localStorage;
}

/**
 * Set item in storage with error handling
 * @param {string} key - Storage key
 * @param {any} value - Value to store
 * @param {string} storageType - Storage type
 * @returns {boolean} Success status
 */
export function setStorageItem(key, value, storageType = StorageType.LOCAL) {
  try {
    const storage = getStorage(storageType);
    const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
    storage.setItem(key, serializedValue);
    return true;
  } catch (error) {
    console.error(`Failed to set ${storageType} item:`, error);
    return false;
  }
}

/**
 * Get item from storage with error handling
 * @param {string} key - Storage key
 * @param {any} defaultValue - Default value if key doesn't exist
 * @param {string} storageType - Storage type
 * @returns {any} Stored value or default value
 */
export function getStorageItem(key, defaultValue = null, storageType = StorageType.LOCAL) {
  try {
    const storage = getStorage(storageType);
    const item = storage.getItem(key);
    
    if (item === null) {
      return defaultValue;
    }
    
    // Try to parse as JSON, fallback to string
    try {
      return JSON.parse(item);
    } catch {
      return item;
    }
  } catch (error) {
    console.error(`Failed to get ${storageType} item:`, error);
    return defaultValue;
  }
}

/**
 * Remove item from storage
 * @param {string} key - Storage key
 * @param {string} storageType - Storage type
 * @returns {boolean} Success status
 */
export function removeStorageItem(key, storageType = StorageType.LOCAL) {
  try {
    const storage = getStorage(storageType);
    storage.removeItem(key);
    return true;
  } catch (error) {
    console.error(`Failed to remove ${storageType} item:`, error);
    return false;
  }
}

/**
 * Clear all items from storage
 * @param {string} storageType - Storage type
 * @returns {boolean} Success status
 */
export function clearStorage(storageType = StorageType.LOCAL) {
  try {
    const storage = getStorage(storageType);
    storage.clear();
    return true;
  } catch (error) {
    console.error(`Failed to clear ${storageType}:`, error);
    return false;
  }
}

/**
 * Check if key exists in storage
 * @param {string} key - Storage key
 * @param {string} storageType - Storage type
 * @returns {boolean} Whether key exists
 */
export function hasStorageItem(key, storageType = StorageType.LOCAL) {
  try {
    const storage = getStorage(storageType);
    return storage.getItem(key) !== null;
  } catch (error) {
    console.error(`Failed to check ${storageType} item:`, error);
    return false;
  }
}

/**
 * Get all keys from storage
 * @param {string} storageType - Storage type
 * @returns {Array<string>} Array of storage keys
 */
export function getStorageKeys(storageType = StorageType.LOCAL) {
  try {
    const storage = getStorage(storageType);
    return Object.keys(storage);
  } catch (error) {
    console.error(`Failed to get ${storageType} keys:`, error);
    return [];
  }
}

/**
 * Get storage usage information
 * @param {string} storageType - Storage type
 * @returns {Object} Storage usage info
 */
export function getStorageInfo(storageType = StorageType.LOCAL) {
  try {
    const storage = getStorage(storageType);
    const keys = Object.keys(storage);
    let totalSize = 0;
    
    // Approximate size calculation
    keys.forEach(key => {
      const item = storage.getItem(key);
      totalSize += key.length + (item ? item.length : 0);
    });
    
    return {
      keyCount: keys.length,
      approximateSize: totalSize,
      formattedSize: `${(totalSize / 1024).toFixed(2)} KB`
    };
  } catch (error) {
    console.error(`Failed to get ${storageType} info:`, error);
    return { keyCount: 0, approximateSize: 0, formattedSize: '0 KB' };
  }
}

/**
 * Typed storage operations for specific data types
 */
export const TypedStorage = {
  /**
   * Store and retrieve arrays
   */
  Array: {
    set: (key, array, storageType = StorageType.LOCAL) => {
      return setStorageItem(key, Array.isArray(array) ? array : [], storageType);
    },
    get: (key, defaultValue = [], storageType = StorageType.LOCAL) => {
      const value = getStorageItem(key, defaultValue, storageType);
      return Array.isArray(value) ? value : defaultValue;
    },
    push: (key, item, storageType = StorageType.LOCAL) => {
      const array = TypedStorage.Array.get(key, [], storageType);
      array.push(item);
      return TypedStorage.Array.set(key, array, storageType);
    },
    remove: (key, predicate, storageType = StorageType.LOCAL) => {
      const array = TypedStorage.Array.get(key, [], storageType);
      const filtered = array.filter(item => !predicate(item));
      return TypedStorage.Array.set(key, filtered, storageType);
    }
  },

  /**
   * Store and retrieve objects
   */
  Object: {
    set: (key, object, storageType = StorageType.LOCAL) => {
      return setStorageItem(key, typeof object === 'object' ? object : {}, storageType);
    },
    get: (key, defaultValue = {}, storageType = StorageType.LOCAL) => {
      const value = getStorageItem(key, defaultValue, storageType);
      return typeof value === 'object' ? value : defaultValue;
    },
    merge: (key, updates, storageType = StorageType.LOCAL) => {
      const existing = TypedStorage.Object.get(key, {}, storageType);
      const merged = { ...existing, ...updates };
      return TypedStorage.Object.set(key, merged, storageType);
    }
  },

  /**
   * Store and retrieve numbers
   */
  Number: {
    set: (key, number, storageType = StorageType.LOCAL) => {
      return setStorageItem(key, typeof number === 'number' ? number : 0, storageType);
    },
    get: (key, defaultValue = 0, storageType = StorageType.LOCAL) => {
      const value = getStorageItem(key, defaultValue, storageType);
      return typeof value === 'number' ? value : defaultValue;
    },
    increment: (key, amount = 1, storageType = StorageType.LOCAL) => {
      const current = TypedStorage.Number.get(key, 0, storageType);
      return TypedStorage.Number.set(key, current + amount, storageType);
    }
  },

  /**
   * Store and retrieve booleans
   */
  Boolean: {
    set: (key, boolean, storageType = StorageType.LOCAL) => {
      return setStorageItem(key, Boolean(boolean), storageType);
    },
    get: (key, defaultValue = false, storageType = StorageType.LOCAL) => {
      const value = getStorageItem(key, defaultValue, storageType);
      return Boolean(value);
    },
    toggle: (key, storageType = StorageType.LOCAL) => {
      const current = TypedStorage.Boolean.get(key, false, storageType);
      return TypedStorage.Boolean.set(key, !current, storageType);
    }
  }
};

/**
 * Application-specific storage keys
 */
export const StorageKeys = {
  LLM_CONFIG: 'llmConfig',
  SELECTED_MODEL: 'selectedModel',
  CUSTOM_PROMPTS: 'customPrompts',
  CHAT_HISTORY: 'chatHistory',
  USER_PREFERENCES: 'userPreferences',
  RECENT_FILES: 'recentFiles',
  SCHEMA_CACHE: 'schemaCache',
  EXPORT_SETTINGS: 'exportSettings'
};

/**
 * Application-specific storage operations
 */
export const AppStorage = {
  /**
   * LLM configuration storage
   */
  setLlmConfig: (config) => TypedStorage.Object.set(StorageKeys.LLM_CONFIG, config),
  getLlmConfig: (defaultConfig = null) => TypedStorage.Object.get(StorageKeys.LLM_CONFIG, defaultConfig),
  
  /**
   * Selected model storage
   */
  setSelectedModel: (model) => setStorageItem(StorageKeys.SELECTED_MODEL, model),
  getSelectedModel: (defaultModel = 'gpt-4.1-mini') => getStorageItem(StorageKeys.SELECTED_MODEL, defaultModel),
  
  /**
   * Custom prompts storage
   */
  setCustomPrompts: (prompts) => TypedStorage.Object.set(StorageKeys.CUSTOM_PROMPTS, prompts),
  getCustomPrompts: (defaultPrompts = {}) => TypedStorage.Object.get(StorageKeys.CUSTOM_PROMPTS, defaultPrompts),
  
  /**
   * Chat history storage
   */
  setChatHistory: (history) => TypedStorage.Array.set(StorageKeys.CHAT_HISTORY, history),
  getChatHistory: () => TypedStorage.Array.get(StorageKeys.CHAT_HISTORY, []),
  addChatMessage: (message) => TypedStorage.Array.push(StorageKeys.CHAT_HISTORY, message),
  clearChatHistory: () => removeStorageItem(StorageKeys.CHAT_HISTORY),
  
  /**
   * User preferences storage
   */
  setUserPreferences: (preferences) => TypedStorage.Object.set(StorageKeys.USER_PREFERENCES, preferences),
  getUserPreferences: () => TypedStorage.Object.get(StorageKeys.USER_PREFERENCES, {}),
  updateUserPreferences: (updates) => TypedStorage.Object.merge(StorageKeys.USER_PREFERENCES, updates),
  
  /**
   * Recent files storage
   */
  addRecentFile: (fileInfo) => {
    const recent = TypedStorage.Array.get(StorageKeys.RECENT_FILES, []);
    // Remove if already exists
    const filtered = recent.filter(f => f.name !== fileInfo.name);
    // Add to beginning and limit to 10
    filtered.unshift(fileInfo);
    return TypedStorage.Array.set(StorageKeys.RECENT_FILES, filtered.slice(0, 10));
  },
  getRecentFiles: () => TypedStorage.Array.get(StorageKeys.RECENT_FILES, [])
};