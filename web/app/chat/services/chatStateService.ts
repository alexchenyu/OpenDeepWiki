import { Message, Session, StreamEvent, ContentItem, MessageStatus } from '../types';
import { chatStorage } from './storageService';

/**
 * 聊天状态管理服务
 */
export class ChatStateService {
  private currentSession: Session | null = null;
  private listeners: Set<(session: Session | null) => void> = new Set();
  private messageListeners: Set<(message: Message) => void> = new Set();
  private streamListeners: Set<(event: StreamEvent) => void> = new Set();

  /**
   * 初始化服务
   */
  async init(): Promise<void> {
    await chatStorage.init();
  }

  /**
   * 创建新会话
   */
  async createSession(title?: string): Promise<Session> {
    const now = Date.now();
    const session: Session = {
      id: `session_${now}_${Math.random().toString(36).substr(2, 9)}`,
      title: title || '新对话',
      createAt: now,
      updateAt: now,
      messageCount: 0,
      messages: []
    };

    await chatStorage.saveSession(session);
    this.setCurrentSession(session);
    return session;
  }

  /**
   * 加载会话
   */
  async loadSession(sessionId: string): Promise<Session | null> {
    const session = await chatStorage.getSession(sessionId);
    if (session) {
      this.setCurrentSession(session);
    }
    return session;
  }

  /**
   * 获取所有会话列表
   */
  async getSessions() {
    return await chatStorage.getSessions();
  }

  /**
   * 设置当前会话
   */
  private setCurrentSession(session: Session | null): void {
    this.currentSession = session;
    this.notifySessionListeners();
  }

  /**
   * 获取当前会话
   */
  getCurrentSession(): Session | null {
    return this.currentSession;
  }

  /**
   * 添加用户消息
   */
  async addUserMessage(content: ContentItem[]): Promise<Message> {
    if (!this.currentSession) {
      throw new Error('No active session');
    }

    const now = Date.now();
    const message: Message = {
      id: `msg_${now}_${Math.random().toString(36).substr(2, 9)}`,
      sessionId: this.currentSession.id,
      role: 'user',
      content,
      createAt: now,
      updateAt: now,
      status: MessageStatus.Completed
    };

    // 添加到当前会话
    this.currentSession.messages.push(message);
    this.currentSession.updateAt = now;

    // 保存到存储
    await Promise.all([
      chatStorage.saveMessage(message),
      chatStorage.saveSession(this.currentSession)
    ]);

    this.notifyMessageListeners(message);
    this.notifySessionListeners();
    return message;
  }

  /**
   * 创建AI消息（用于流式响应）
   */
  async createAIMessage(): Promise<Message> {
    if (!this.currentSession) {
      throw new Error('No active session');
    }

    const now = Date.now();
    const message: Message = {
      id: `msg_${now}_${Math.random().toString(36).substr(2, 9)}`,
      sessionId: this.currentSession.id,
      role: 'assistant',
      content: [],
      createAt: now,
      updateAt: now,
      status: MessageStatus.Pending
    };

    // 添加到当前会话
    this.currentSession.messages.push(message);
    this.currentSession.updateAt = now;

    // 保存到存储
    await chatStorage.saveMessage(message);
    await chatStorage.saveSession(this.currentSession);

    this.notifyMessageListeners(message);
    this.notifySessionListeners();
    return message;
  }

  /**
   * 处理流事件
   */
  async handleStreamEvent(event: StreamEvent, aiMessage: Message): Promise<void> {
    let shouldUpdate = false;

    switch (event.type) {
      case 'content_delta':
        if (event.data) {
          shouldUpdate = this.handleContentDelta(event.data, aiMessage);
        }
        break;

      case 'tool_calls':
        if (event.data) {
          shouldUpdate = this.handleToolCalls(event.data, aiMessage);
        }
        break;

      case 'git_issues':
        if (event.data) {
          shouldUpdate = this.handleGitIssues(event.data, aiMessage);
        }
        break;

      case 'message_start':
      case 'message_end':
      case 'reasoning_start':
      case 'reasoning_end':
        // 这些事件不需要更新消息内容，只是状态标记
        break;

      case 'done':
        shouldUpdate = true;
        break;
    }

    if (shouldUpdate) {
      aiMessage.updateAt = Date.now();
      if (this.currentSession) {
        this.currentSession.updateAt = aiMessage.updateAt;
      }
      
      await Promise.all([
        chatStorage.updateMessage(aiMessage),
        this.currentSession ? chatStorage.saveSession(this.currentSession) : Promise.resolve()
      ]);

      this.notifyMessageListeners(aiMessage);
      this.notifySessionListeners();
    }

    // 通知流事件监听器
    this.notifyStreamListeners(event);
  }

  /**
   * 处理内容增量
   */
  private handleContentDelta(delta: any, message: Message): boolean {
    if (delta.contentType === 'text' && delta.text) {
      // 查找或创建文本内容项
      let textItem = message.content.find(item => item.type === 'text') as any;
      if (!textItem) {
        textItem = { type: 'text', text: '' };
        message.content.push(textItem);
      }
      textItem.text += delta.text;
      return true;
    }

    if (delta.contentType === 'reasoning' && delta.reasoning) {
      // 查找或创建推理内容项
      let reasoningItem = message.content.find(item => item.type === 'reasoning') as any;
      if (!reasoningItem) {
        reasoningItem = { type: 'reasoning', content: '' };
        message.content.push(reasoningItem);
      }
      reasoningItem.content += delta.reasoning;
      return true;
    }

    return false;
  }

  /**
   * 处理工具调用
   */
  private handleToolCalls(delta: any, message: Message): boolean {
    if (delta.contentType === 'tool_calls') {
      // 查找或创建工具调用内容项
      let toolCallsItem = message.content.find(item => item.type === 'tool_calls') as any;
      if (!toolCallsItem) {
        toolCallsItem = { type: 'tool_calls', toolCalls: [] };
        message.content.push(toolCallsItem);
      }

      // 查找或创建特定的工具调用
      let toolCall = toolCallsItem.toolCalls.find((tc: any) => tc.id === delta.toolCallId);
      if (!toolCall) {
        toolCall = {
          id: delta.toolCallId,
          type: 'function',
          function: {
            name: delta.functionName || '',
            arguments: ''
          }
        };
        toolCallsItem.toolCalls.push(toolCall);
      }

      // 更新工具调用信息
      if (delta.functionName) {
        toolCall.function.name = delta.functionName;
      }
      if (delta.functionArguments) {
        toolCall.function.arguments += delta.functionArguments;
      }

      return true;
    }
    return false;
  }

  /**
   * 处理Git问题
   */
  private handleGitIssues(delta: any, message: Message): boolean {
    if (delta.contentType === 'git_issues' && delta.text) {
      try {
        const gitIssues = JSON.parse(delta.text);
        const gitIssuesItem = {
          type: 'git_issues' as const,
          issues: gitIssues
        };
        message.content.push(gitIssuesItem);
        return true;
      } catch (error) {
        console.error('Failed to parse git issues:', error);
      }
    }
    return false;
  }

  /**
   * 删除会话
   */
  async deleteSession(sessionId: string): Promise<void> {
    await chatStorage.deleteSession(sessionId);
    if (this.currentSession?.id === sessionId) {
      this.setCurrentSession(null);
    }
  }

  /**
   * 更新会话标题
   */
  async updateSessionTitle(sessionId: string, title: string): Promise<void> {
    if (this.currentSession?.id === sessionId) {
      this.currentSession.title = title;
      this.currentSession.updateAt = Date.now();
      await chatStorage.saveSession(this.currentSession);
      this.notifySessionListeners();
    }
  }

  /**
   * 订阅会话变化
   */
  onSessionChange(listener: (session: Session | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * 订阅消息变化
   */
  onMessageChange(listener: (message: Message) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  /**
   * 订阅流事件
   */
  onStreamEvent(listener: (event: StreamEvent) => void): () => void {
    this.streamListeners.add(listener);
    return () => this.streamListeners.delete(listener);
  }

  /**
   * 通知会话监听器
   */
  private notifySessionListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.currentSession);
      } catch (error) {
        console.error('Error in session listener:', error);
      }
    });
  }

  /**
   * 通知消息监听器
   */
  private notifyMessageListeners(message: Message): void {
    this.messageListeners.forEach(listener => {
      try {
        listener(message);
      } catch (error) {
        console.error('Error in message listener:', error);
      }
    });
  }

  /**
   * 通知流事件监听器
   */
  private notifyStreamListeners(event: StreamEvent): void {
    this.streamListeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in stream listener:', error);
      }
    });
  }
}

// 单例实例
export const chatState = new ChatStateService();