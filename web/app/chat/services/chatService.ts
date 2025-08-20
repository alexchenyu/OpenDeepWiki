import { ChatInput, StreamEvent } from '../types';

/**
 * 聊天服务 - 处理与后端API的通信
 */
export class ChatService {
  private baseUrl: string;
  private abortController: AbortController | null = null;

  constructor(baseUrl: string = '') {
    this.baseUrl = baseUrl;
  }

  /**
   * 发送消息并处理流式响应
   */
  async sendMessage(
    input: ChatInput,
    onStreamEvent: (event: StreamEvent) => void,
    onError?: (error: Error) => void
  ): Promise<void> {
    // 取消之前的请求
    if (this.abortController) {
      this.abortController.abort();
    }

    this.abortController = new AbortController();

    try {
      const response = await fetch(`${this.baseUrl}/api/Responses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify(input),
        signal: this.abortController.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      await this.processStream(response.body, onStreamEvent);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Request was aborted');
        return;
      }
      
      console.error('Chat service error:', error);
      if (onError) {
        onError(error instanceof Error ? error : new Error('Unknown error'));
      }
    } finally {
      this.abortController = null;
    }
  }

  /**
   * 处理SSE流
   */
  private async processStream(
    body: ReadableStream<Uint8Array>,
    onStreamEvent: (event: StreamEvent) => void
  ): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        // 处理完整的事件
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // 保留最后一个不完整的行

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data && data !== '[DONE]') {
              try {
                const event: StreamEvent = JSON.parse(data);
                onStreamEvent(event);
              } catch (error) {
                console.error('Failed to parse SSE event:', error, 'Data:', data);
              }
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * 取消当前请求
   */
  cancelRequest(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * 验证域名
   */
  async validateDomain(domain: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/validate-domain`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ domain })
      });
      
      return response.ok;
    } catch (error) {
      console.error('Domain validation error:', error);
      return false;
    }
  }

  /**
   * 获取应用配置
   */
  async getAppConfig(): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/api/app-config`);
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Failed to fetch app config:', error);
    }
    return null;
  }
}

// 单例实例
export const chatService = new ChatService();