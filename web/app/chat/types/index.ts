// 消息内容项类型枚举
export enum ContentItemType {
  Text = 'text',
  Image = 'image',
  ToolCall = 'tool_call',
  ToolResult = 'tool_result',
  GitIssues = 'git_issues',
  Reasoning = 'reasoning'
}

// 消息内容项接口
export interface ContentItem {
  type: ContentItemType;
  content: string;
  toolId?: string;
  toolName?: string;
  toolResult?: any;
  toolArgs?: any;
  gitIssues?: any[];
  fileName?: string;
  mimeType?: string;
}

// 消息状态枚举
export enum MessageStatus {
  Pending = 'pending',
  Streaming = 'streaming',
  Completed = 'completed',
  Error = 'error'
}

// 消息接口
export interface Message {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: ContentItem[];
  createAt: number;
  updateAt: number;
  status: MessageStatus;
  meta?: {
    model?: string;
    tokens?: number;
    [key: string]: any;
  };
}

// 会话接口
export interface Session {
  id: string;
  title: string;
  createAt: number;
  updateAt: number;
  messageCount: number;
  messages: Message[];
}

// 流事件类型枚举
export enum StreamEventType {
  ContentDelta = 'content_delta',
  ToolCall = 'tool_call',
  GitIssues = 'git_issues',
  Error = 'error',
  Done = 'done'
}

// 流事件接口
export interface StreamEvent {
  type: StreamEventType;
  messageId: string;
  data?: any;
  error?: string;
}

// 聊天输入接口
export interface ChatInput {
  sessionId?: string;
  content: ContentItem[];
  appId: string;
  organizationName: string;
  repositoryName: string;
}

// 引用文件接口
export interface ReferenceFile {
  name: string;
  path: string;
  content?: string;
}

// Base64内容接口（向后兼容）
export interface Base64Content {
  data: string;
  mimeType: string;
}

// 聊天消息项接口（向后兼容）
export interface ChatMessageItem {
  id: string;
  role: 'user' | 'assistant';
  content: ContentItem[];
  createAt: number;
  updateAt: number;
  status: MessageStatus;
  meta?: {
    model?: string;
    tokens?: number;
    [key: string]: any;
  };
}