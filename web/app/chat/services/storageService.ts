import { Message, Session } from '../types';

/**
 * 聊天存储服务 - 管理本地IndexedDB存储
 */
export class ChatStorageService {
  private dbName = 'KoalaWiki_Chat';
  private dbVersion = 1;
  private db: IDBDatabase | null = null;

  /**
   * 初始化数据库
   */
  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // 创建会话表
        if (!db.objectStoreNames.contains('sessions')) {
          const sessionStore = db.createObjectStore('sessions', { keyPath: 'id' });
          sessionStore.createIndex('createAt', 'createAt', { unique: false });
          sessionStore.createIndex('updateAt', 'updateAt', { unique: false });
        }

        // 创建消息表
        if (!db.objectStoreNames.contains('messages')) {
          const messageStore = db.createObjectStore('messages', { keyPath: 'id' });
          messageStore.createIndex('sessionId', 'sessionId', { unique: false });
          messageStore.createIndex('createAt', 'createAt', { unique: false });
          messageStore.createIndex('role', 'role', { unique: false });
        }
      };
    });
  }

  /**
   * 保存会话
   */
  async saveSession(session: Session): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const storedSession = {
      id: session.id,
      title: session.title,
      createAt: session.createAt,
      updateAt: session.updateAt,
      messageCount: session.messageCount
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['sessions'], 'readwrite');
      const store = transaction.objectStore('sessions');
      const request = store.put(storedSession);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * 保存消息
   */
  async saveMessage(message: Message): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['messages'], 'readwrite');
      const store = transaction.objectStore('messages');
      const request = store.put(message);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * 批量保存消息
   */
  async saveMessages(messages: Message[]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['messages'], 'readwrite');
      const store = transaction.objectStore('messages');
      let completed = 0;
      let hasError = false;

      messages.forEach(message => {
        const request = store.put(message);
        request.onerror = () => {
          if (!hasError) {
            hasError = true;
            reject(request.error);
          }
        };
        request.onsuccess = () => {
          completed++;
          if (completed === messages.length && !hasError) {
            resolve();
          }
        };
      });
    });
  }

  /**
   * 获取所有会话
   */
  async getSessions(): Promise<Session[]> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['sessions'], 'readonly');
      const store = transaction.objectStore('sessions');
      const index = store.index('updatedAt');
      const request = index.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const sessions = request.result.sort((a, b) => b.updatedAt - a.updatedAt);
        resolve(sessions);
      };
    });
  }

  /**
   * 获取会话消息
   */
  async getSessionMessages(sessionId: string): Promise<Message[]> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['messages'], 'readonly');
      const store = transaction.objectStore('messages');
      const index = store.index('sessionId');
      const request = index.getAll(sessionId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const messages = request.result.sort((a, b) => a.createdAt - b.createdAt);
        resolve(messages);
      };
    });
  }

  /**
   * 获取完整会话（包含消息）
   */
  async getSession(sessionId: string): Promise<Session | null> {
    if (!this.db) throw new Error('Database not initialized');

    const [storedSession, messages] = await Promise.all([
      this.getStoredSession(sessionId),
      this.getSessionMessages(sessionId)
    ]);

    if (!storedSession) return null;

    return {
      id: storedSession.id,
      title: storedSession.title,
      createAt: storedSession.createAt,
      updateAt: storedSession.updateAt,
      messageCount: messages.length
    };
  }

  /**
   * 获取存储的会话信息
   */
  private async getStoredSession(sessionId: string): Promise<Session | null> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['sessions'], 'readonly');
      const store = transaction.objectStore('sessions');
      const request = store.get(sessionId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  /**
   * 删除会话及其所有消息
   */
  async deleteSession(sessionId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['sessions', 'messages'], 'readwrite');
      const sessionStore = transaction.objectStore('sessions');
      const messageStore = transaction.objectStore('messages');
      const messageIndex = messageStore.index('sessionId');

      // 删除会话
      const deleteSessionRequest = sessionStore.delete(sessionId);
      
      // 删除所有相关消息
      const deleteMessagesRequest = messageIndex.getAll(sessionId);
      deleteMessagesRequest.onsuccess = () => {
        const messages = deleteMessagesRequest.result;
        messages.forEach(message => {
          messageStore.delete(message.id);
        });
      };

      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve();
    });
  }

  /**
   * 更新消息
   */
  async updateMessage(message: Message): Promise<void> {
    message.updatedAt = Date.now();
    return this.saveMessage(message);
  }

  /**
   * 清空所有数据
   */
  async clearAll(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['sessions', 'messages'], 'readwrite');
      const sessionStore = transaction.objectStore('sessions');
      const messageStore = transaction.objectStore('messages');

      sessionStore.clear();
      messageStore.clear();

      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve();
    });
  }
}

// 单例实例
export const chatStorage = new ChatStorageService();