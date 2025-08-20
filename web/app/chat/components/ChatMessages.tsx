'use client';

import React, { useEffect, useRef } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Copy, User, Bot, Loader2, Sparkles, Wrench, Clock, Image as ImageIcon, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Message, ContentItem, ContentItemType, MessageStatus } from '../types';

interface ChatMessagesProps {
  messages: Message[];
  isLoading?: boolean;
}

const ChatMessages: React.FC<ChatMessagesProps> = ({
  messages,
  isLoading = false,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleCopyMessage = (content: string) => {
    navigator.clipboard.writeText(content);
    toast.success('已复制到剪贴板');
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  };

  const renderContentItem = (item: ContentItem, index: number) => {
    switch (item.type) {
      case ContentItemType.Text:
        return (
          <div key={`text-${index}`} className="prose prose-sm max-w-none dark:prose-invert">
            <div className="whitespace-pre-wrap break-words">
              {item.content}
            </div>
          </div>
        );

      case ContentItemType.Image:
        return (
          <div key={`image-${index}`} className="max-w-md">
            <img
              src={item.content}
              alt={item.fileName || '图片'}
              className="rounded-lg border max-w-full h-auto"
              loading="lazy"
            />
            {item.fileName && (
              <p className="text-xs text-muted-foreground mt-1">{item.fileName}</p>
            )}
          </div>
        );

      case ContentItemType.ToolCall:
        return (
          <div key={`tool-calls-${index}`} className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Wrench className="h-4 w-4" />
              <span>工具调用</span>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 border">
              <div className="text-sm">
                <div className="font-medium mb-1">{item.toolName}</div>
                {item.toolArgs && (
                  <pre className="text-xs text-muted-foreground whitespace-pre-wrap">
                    {typeof item.toolArgs === 'string' ? item.toolArgs : JSON.stringify(item.toolArgs, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          </div>
        );

      case ContentItemType.ToolResult:
        return (
          <div key={`tool-result-${index}`} className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <FileText className="h-4 w-4" />
              <span>工具结果</span>
            </div>
            <div className="bg-green-50 dark:bg-green-950/20 rounded-lg p-3 border border-green-200 dark:border-green-800">
              <pre className="text-sm whitespace-pre-wrap">
                {typeof item.content === 'string' ? item.content : JSON.stringify(item.content, null, 2)}
              </pre>
            </div>
          </div>
        );

      case ContentItemType.GitIssues:
        return (
          <div key={`git-issues-${index}`} className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Sparkles className="h-4 w-4" />
              <span>相关Issues</span>
            </div>
            <div className="space-y-2">
              {item.gitIssues?.map((issue: any, issueIndex: number) => (
                <Card key={issueIndex} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm truncate">{issue.title}</h4>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {issue.body}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="outline" className="text-xs">
                          #{issue.number}
                        </Badge>
                        <Badge 
                          variant={issue.state === 'open' ? 'default' : 'secondary'}
                          className="text-xs"
                        >
                          {issue.state}
                        </Badge>
                      </div>
                    </div>
                    {issue.html_url && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.open(issue.html_url, '_blank')}
                        className="shrink-0"
                      >
                        查看
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        );

      case ContentItemType.Reasoning:
        return (
          <div key={`reasoning-${index}`} className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Sparkles className="h-4 w-4" />
              <span>思考过程</span>
            </div>
            <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
              <div className="text-sm whitespace-pre-wrap text-blue-900 dark:text-blue-100">
                {item.content}
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const renderMessage = (message: Message) => {
    const isUser = message.role === 'user';
    const isError = message.status === MessageStatus.Error;
    const isLoading = message.status === MessageStatus.Streaming;

    return (
      <div
        key={message.id}
        className={cn(
          "flex gap-3 p-4",
          isUser ? "justify-end" : "justify-start"
        )}
      >
        {!isUser && (
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="bg-primary/10">
              <Bot className="h-4 w-4" />
            </AvatarFallback>
          </Avatar>
        )}
        
        <div className={cn(
          "flex flex-col gap-2 max-w-[80%]",
          isUser ? "items-end" : "items-start"
        )}>
          <div className={cn(
            "rounded-lg px-4 py-3 text-sm",
            isUser 
              ? "bg-primary text-primary-foreground" 
              : isError
                ? "bg-destructive/10 text-destructive border border-destructive/20"
                : "bg-muted"
          )}>
            {isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>正在思考...</span>
              </div>
            ) : (
              <div className="space-y-3">
                {message.content.map((item, index) => renderContentItem(item, index))}
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>{formatTimestamp(message.createAt)}</span>
            {!isUser && !isLoading && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const textContent = message.content
                    .filter(item => item.type === ContentItemType.Text)
                    .map(item => item.content)
                    .join('\n');
                  handleCopyMessage(textContent);
                }}
                className="h-6 px-2 text-xs"
              >
                <Copy className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
        
        {isUser && (
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="bg-secondary">
              <User className="h-4 w-4" />
            </AvatarFallback>
          </Avatar>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-1">
          {messages.map(renderMessage)}
          {isLoading && (
            <div className="flex gap-3 p-4">
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className="bg-primary/10">
                  <Bot className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col gap-2">
                <div className="bg-muted rounded-lg px-4 py-3">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">正在思考...</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};

export default ChatMessages;