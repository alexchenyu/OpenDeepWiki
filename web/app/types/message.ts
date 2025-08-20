// 统一消息格式 - 参考OpenAI标准
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: ContentItem[];
  createdAt: Date;
  updatedAt?: Date;
}

// 内容项基础接口
export interface ContentItem {
  type: ContentType;
}

// 内容类型枚举
export enum ContentType {
  Text = 'text',
  ToolCalls = 'tool_calls',
  ToolResult = 'tool_result',
  Reasoning = 'reasoning',
  Image = 'image',
  Code = 'code',
  Table = 'table',
  Link = 'link',
  File = 'file',
  Audio = 'audio',
  Video = 'video'
}

// 文本内容
export interface TextContent extends ContentItem {
  type: ContentType.Text;
  text: string;
}

// 工具调用内容
export interface ToolCallsContent extends ContentItem {
  type: ContentType.ToolCalls;
  tool_calls: ToolCall[];
}

// 工具调用定义
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

// 工具结果内容
export interface ToolResultContent extends ContentItem {
  type: ContentType.ToolResult;
  tool_call_id: string;
  result: string;
}

// 推理内容
export interface ReasoningContent extends ContentItem {
  type: ContentType.Reasoning;
  reasoning: string;
}

// 图片内容
export interface ImageContent extends ContentItem {
  type: ContentType.Image;
  image_url: {
    url: string;
    detail?: 'low' | 'high' | 'auto';
  };
}

// 代码内容
export interface CodeContent extends ContentItem {
  type: ContentType.Code;
  language: string;
  code: string;
}

// 表格内容
export interface TableContent extends ContentItem {
  type: ContentType.Table;
  headers: string[];
  rows: string[][];
}

// 链接内容
export interface LinkContent extends ContentItem {
  type: ContentType.Link;
  url: string;
  title?: string;
  description?: string;
}

// 文件内容
export interface FileContent extends ContentItem {
  type: ContentType.File;
  filename: string;
  content: string;
  mime_type?: string;
}

// 音频内容
export interface AudioContent extends ContentItem {
  type: ContentType.Audio;
  audio_url: string;
  transcript?: string;
}

// 视频内容
export interface VideoContent extends ContentItem {
  type: ContentType.Video;
  video_url: string;
  thumbnail_url?: string;
}

// 联合类型
export type AnyContentItem = 
  | TextContent
  | ToolCallsContent
  | ToolResultContent
  | ReasoningContent
  | ImageContent
  | CodeContent
  | TableContent
  | LinkContent
  | FileContent
  | AudioContent
  | VideoContent;

// SSE流事件
export interface StreamEvent {
  type: StreamEventType;
  delta?: ContentDelta;
  tool_calls?: ToolCall[];
  error?: StreamError;
}

export enum StreamEventType {
  ContentDelta = 'content_delta',
  ToolCalls = 'tool_calls', 
  Done = 'done',
  Error = 'error'
}

// 内容增量更新
export interface ContentDelta {
  content_type: ContentType;
  text?: string;
  reasoning?: string;
  tool_call_id?: string;
  function_name?: string;
  function_arguments?: string;
}

// 流错误
export interface StreamError {
  code: string;
  message: string;
  details?: any;
}

// 会话输入格式
export interface ChatInput {
  organizationName: string;
  name: string;
  messages: Message[];
  appId?: string;
  deepResearch?: boolean;
}

// 会话状态
export interface ChatSession {
  id: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
  title?: string;
}

// 本地存储格式
export interface StoredChatSession {
  id: string;
  messages: Message[];
  createdAt: string; // ISO string for storage
  updatedAt: string;
  title?: string;
}