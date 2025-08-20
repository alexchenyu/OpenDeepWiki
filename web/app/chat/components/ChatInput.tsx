'use client';

import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Eraser, ImagePlus, Trash2, X, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { ContentItem, ContentItemType } from '../types';

interface ImageContent {
  content: string; // base64 data
  fileName?: string;
  mimeType: string;
}

interface ChatInputProps {
  value?: string;
  placeholder?: string;
  isLoading?: boolean;
  disabled?: boolean;
  onSend?: (content: ContentItem[]) => void;
  onStop?: () => void;
  onChange?: (value: string) => void;
  onClear?: () => void;
}

const ChatInput: React.FC<ChatInputProps> = ({
  value,
  placeholder = '输入消息...',
  isLoading = false,
  disabled = false,
  onSend,
  onStop,
  onChange,
  onClear,
}) => {
  const [inputValue, setInputValue] = useState(value || '');
  const [imageUploading, setImageUploading] = useState(false);
  const [imageList, setImageList] = useState<ImageContent[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInputValue(value);
    onChange?.(value);
  };

  const handleSend = () => {
    if ((inputValue.trim() || imageList.length > 0) && !isLoading && !disabled) {
      const content: ContentItem[] = [];
      
      // 添加文本内容
      if (inputValue.trim()) {
        content.push({
          type: ContentItemType.Text,
          content: inputValue.trim()
        });
      }
      
      // 添加图片内容
      imageList.forEach(image => {
        content.push({
          type: ContentItemType.Image,
          content: `data:${image.mimeType};base64,${image.content}`,
          fileName: image.fileName,
          mimeType: image.mimeType
        });
      });
      
      onSend?.(content);
      setInputValue('');
      setImageList([]);

      // 重置文本区域高度
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleStop = () => {
    onStop?.();
  };

  const handleClear = () => {
    setInputValue('');
    setImageList([]);

    // 重置文本区域高度
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleUploadClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const isImage = file.type.startsWith('image/');
    if (!isImage) {
      toast.error('只能上传图片文件');
      return;
    }

    const isLt5M = file.size / 1024 / 1024 < 5;
    if (!isLt5M) {
      toast.error('图片大小不能超过5MB');
      return;
    }

    try {
      setImageUploading(true);
      const base64Content = await convertFileToBase64(file);
      setImageList([...imageList, {
        content: base64Content,
        fileName: file.name,
        mimeType: file.type
      }]);
      setImageUploading(false);

      // 重置input以便可以再次选择同一文件
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('图片转换失败:', error);
      toast.error('图片处理失败，请重试');
      setImageUploading(false);
    }
  };

  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // 移除 data:image/jpeg;base64, 前缀
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const removeImage = (index: number) => {
    const newImageList = [...imageList];
    newImageList.splice(index, 1);
    setImageList(newImageList);
  };

  // 自动调整文本区域高度
  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  };

  // 监听输入值变化以调整高度
  React.useEffect(() => {
    adjustTextareaHeight();
  }, [inputValue]);

  return (
    <div className="w-full space-y-2">
      {/* 图片预览区域 */}
      {imageList.length > 0 && (
        <div className="flex flex-wrap gap-2 p-2 bg-muted/20 rounded-md border border-dashed animate-in fade-in-50 duration-300">
          {imageList.map((image, index) => (
            <div key={index} className="relative w-20 h-20 rounded-md overflow-hidden border border-border group">
              <img
                src={`data:${image.mimeType};base64,${image.content}`}
                alt={image.fileName || '上传图片'}
                className="w-full h-full object-cover"
              />
              <button
                onClick={() => removeImage(index)}
                className="absolute top-1 right-1 bg-background/80 text-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 输入区域 */}
      <div className="relative flex flex-col rounded-md border bg-background shadow-sm focus-within:ring-1 focus-within:ring-ring focus-within:border-input">
        <Textarea
          ref={textareaRef}
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || isLoading}
          className="min-h-[60px] max-h-[200px] resize-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none p-3 pb-12"
        />

        {/* 工具栏 - 固定在底部 */}
        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between p-2 border-t bg-muted/10">
          <div className="flex items-center gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full"
                    disabled={disabled || isLoading || imageUploading}
                    onClick={handleUploadClick}
                  >
                    {imageUploading ?
                      <Loader2 className="h-4 w-4 animate-spin" /> :
                      <ImagePlus className="h-4 w-4" />
                    }
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">上传图片</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full"
                    disabled={!inputValue && imageList.length === 0}
                    onClick={handleClear}
                  >
                    <Eraser className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">清空输入</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      onClear?.();
                      toast.success('已清空所有消息');
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">清空所有消息</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div>
            {isLoading ? (
              <Button
                size="sm"
                variant="destructive"
                onClick={handleStop}
                className="h-8 px-3 rounded-full"
              >
                <X className="h-4 w-4 mr-1" />
                停止
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleSend}
                disabled={(!inputValue.trim() && imageList.length === 0) || disabled || imageUploading}
                className="h-8 px-3 rounded-full"
              >
                <Send className="h-3.5 w-3.5 mr-1" />
                发送
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* 文件上传输入 */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/*"
        onChange={handleImageUpload}
      />
    </div>
  );
};

export default ChatInput;