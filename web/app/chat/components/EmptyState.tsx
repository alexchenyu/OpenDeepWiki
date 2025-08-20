'use client';

import React from 'react';
import { MessageCircle, Sparkles, FileText, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ContentItem, ContentItemType } from '../types';

interface EmptyStateProps {
  onSendMessage?: (content: ContentItem[]) => void;
}

const EmptyState: React.FC<EmptyStateProps> = ({ onSendMessage }) => {
  const handleQuickStart = (text: string) => {
    if (onSendMessage) {
      const content: ContentItem[] = [{
        type: ContentItemType.Text,
        content: text
      }];
      onSendMessage(content);
    }
  };

  const quickStartOptions = [
    {
      icon: <FileText className="w-4 h-4" />,
      title: '代码解释',
      description: '解释代码功能和实现原理',
      prompt: '请帮我解释这段代码的功能和实现原理'
    },
    {
      icon: <Search className="w-4 h-4" />,
      title: '代码审查',
      description: '检查代码质量和潜在问题',
      prompt: '请帮我审查这段代码，指出可能的问题和改进建议'
    },
    {
      icon: <Sparkles className="w-4 h-4" />,
      title: '代码优化',
      description: '提供性能和结构优化建议',
      prompt: '请帮我优化这段代码的性能和结构'
    }
  ];

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <div className="mb-8">
        <div className="w-16 h-16 mx-auto mb-4 bg-primary/10 rounded-full flex items-center justify-center">
          <MessageCircle className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-2xl font-semibold mb-2">开始对话</h2>
        <p className="text-muted-foreground max-w-md">
          我是您的AI编程助手，可以帮助您解释代码、审查代码质量、提供优化建议等。
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-2xl">
        {quickStartOptions.map((option, index) => (
          <Button
            key={index}
            variant="outline"
            className="h-auto p-4 flex flex-col items-start text-left hover:bg-muted/50 transition-colors"
            onClick={() => handleQuickStart(option.prompt)}
          >
            <div className="flex items-center mb-2">
              {option.icon}
              <span className="ml-2 font-medium">{option.title}</span>
            </div>
            <p className="text-sm text-muted-foreground">{option.description}</p>
          </Button>
        ))}
      </div>

      <div className="mt-8 text-sm text-muted-foreground">
        <p>💡 提示：您可以直接输入问题，或者上传图片进行讨论</p>
      </div>
    </div>
  );
};

export default EmptyState;
