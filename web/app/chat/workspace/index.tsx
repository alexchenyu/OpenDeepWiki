'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, AlertCircle, MessageSquare, Plus, X } from 'lucide-react';
import ChatMessages from '../components/ChatMessages';
import ChatInput from '../components/ChatInput';
import EmptyState from '../components/EmptyState';
import SessionList from '../components/SessionList';
import { ChatStateService } from '../services/chatStateService';
import { Message, ContentItem, ContentItemType, StreamEvent } from '../types';

interface WorkspaceProps {
  appId?: string;
  organizationName: string;
  repositoryName: string;
  chatStateService: ChatStateService;
}

interface WorkspaceState {
  showSessionList: boolean;
}

const Workspace: React.FC<WorkspaceProps> = ({
  appId,
  organizationName,
  repositoryName,
  chatStateService,
}) => {
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSessionList, setShowSessionList] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const initializeWorkspace = async () => {
      try {
        const sessionId = await chatStateService.createSession(
          `${organizationName}/${repositoryName}`,
          { organizationName, repositoryName, appId }
        );
        setCurrentSessionId(sessionId);
        
        const sessionMessages = await chatStateService.getSessionMessages(sessionId);
        setMessages(sessionMessages);
      } catch (error) {
        console.error('初始化工作区失败:', error);
        setError('初始化失败');
      }
    };

    initializeWorkspace();

    const unsubscribeMessage = chatStateService.onMessageUpdate((message) => {
      setMessages(prev => {
        const index = prev.findIndex(m => m.id === message.id);
        if (index >= 0) {
          const newMessages = [...prev];
          newMessages[index] = message;
          return newMessages;
        } else {
          return [...prev, message];
        }
      });
    });

    const unsubscribeStream = chatStateService.onStreamEvent((event) => {
      if (event.type === 'error') {
        setIsLoading(false);
        setError(event.data?.message || '发生未知错误');
      } else if (event.type === 'done') {
        setIsLoading(false);
      }
    });

    return () => {
      unsubscribeMessage();
      unsubscribeStream();
    };
  }, [chatStateService, organizationName, repositoryName, appId]);

  const handleSendMessage = async (content: string, files?: File[]) => {
    if (!currentSessionId || isLoading) return;

    try {
      setIsLoading(true);
      setError(null);

      abortControllerRef.current = new AbortController();

      const contentItems: ContentItem[] = [];

      if (content.trim()) {
        contentItems.push({
          type: ContentItemType.Text,
          content: content.trim()
        });
      }

      if (files && files.length > 0) {
        for (const file of files) {
          if (file.type.startsWith('image/')) {
            const base64 = await fileToBase64(file);
            contentItems.push({
              type: ContentItemType.Image,
              content: base64,
              mimeType: file.type,
              fileName: file.name
            });
          }
        }
      }

      if (contentItems.length === 0) {
        toast({
          title: '消息不能为空',
          description: '请输入文本或上传文件',
          variant: 'destructive',
        });
        setIsLoading(false);
        return;
      }

      const userMessage = await chatStateService.addUserMessage(
        currentSessionId,
        contentItems
      );

      setMessages(prev => [...prev, userMessage]);

      const aiMessage = await chatStateService.createAIMessage(currentSessionId);
      setMessages(prev => [...prev, aiMessage]);

      await chatStateService.sendMessage(
        currentSessionId,
        messages.concat([userMessage]),
        abortControllerRef.current.signal
      );

    } catch (error: any) {
      console.error('发送消息失败:', error);
      if (error.name !== 'AbortError') {
        setError(error.message || '发送消息失败');
        toast({
          title: '发送失败',
          description: error.message || '发送消息时发生错误',
          variant: 'destructive',
        });
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  };

  const handleNewChat = async () => {
    try {
      const sessionId = await chatStateService.createSession(
        `${organizationName}/${repositoryName}`,
        { organizationName, repositoryName, appId }
      );
      setCurrentSessionId(sessionId);
      setMessages([]);
      setError(null);
      setShowSessionList(false);
    } catch (error) {
      console.error('创建新对话失败:', error);
      toast({
        title: '创建失败',
        description: '创建新对话时发生错误',
        variant: 'destructive',
      });
    }
  };

  const handleSessionSelect = async (sessionId: string) => {
    try {
      const sessionMessages = await chatStateService.getSessionMessages(sessionId);
      setCurrentSessionId(sessionId);
      setMessages(sessionMessages);
      setError(null);
      setShowSessionList(false);
    } catch (error) {
      console.error('Failed to load session:', error);
      setError('加载会话失败');
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  if (error && messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <AlertCircle className="w-12 h-12 text-destructive mb-4" />
        <h3 className="text-lg font-semibold mb-2">出现错误</h3>
        <p className="text-muted-foreground mb-4">{error}</p>
        <Button onClick={handleNewChat} variant="outline">
          重新开始
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* 会话列表侧边栏 */}
      {showSessionList && (
        <div className="w-80 border-r bg-gray-50 flex flex-col">
          <div className="p-3 border-b bg-white">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">对话历史</h2>
              <button
                onClick={() => setShowSessionList(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <SessionList
            currentSessionId={currentSessionId}
            onSessionSelect={handleSessionSelect}
            onNewSession={handleNewChat}
          />
        </div>
      )}
      
      {/* 主聊天区域 */}
      <div className="flex-1 flex flex-col">
        {/* 顶部工具栏 */}
        <div className="border-b bg-background p-3">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSessionList(!showSessionList)}
              className="flex items-center gap-2"
            >
              <MessageSquare className="h-4 w-4" />
              对话历史
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={handleNewChat}
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              新建对话
            </Button>
          </div>
        </div>
        
        {messages.length === 0 ? (
          <EmptyState onNewChat={handleNewChat} />
        ) : (
          <div className="flex-1 overflow-hidden">
            <ChatMessages messages={messages} isLoading={isLoading} />
          </div>
        )}
        
        <div className="border-t bg-background">
          <ChatInput
            onSendMessage={handleSendMessage}
            onStopGeneration={handleStopGeneration}
            disabled={!currentSessionId}
            isLoading={isLoading}
          />
        </div>
        
        {error && (
          <div className="px-4 py-2 bg-destructive/10 border-t border-destructive/20">
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="w-4 h-4" />
              <span>{error}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setError(null)}
                className="ml-auto h-6 px-2 text-xs"
              >
                关闭
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Workspace;