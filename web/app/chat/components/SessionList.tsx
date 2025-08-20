'use client';

import React, { useState, useEffect } from 'react';
import { Session } from '../types';
import { chatState } from '../services/chatStateService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
// import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  MessageSquare, 
  Plus, 
  Trash2, 
  Edit2, 
  Check, 
  X 
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface SessionListProps {
  currentSessionId?: string;
  onSessionSelect: (sessionId: string) => void;
  onNewSession: () => void;
}

export function SessionList({ 
  currentSessionId, 
  onSessionSelect, 
  onNewSession 
}: SessionListProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSessions();
    
    // 监听会话变化
    const unsubscribe = chatState.onSessionChange(() => {
      loadSessions();
    });
    
    return unsubscribe;
  }, []);

  const loadSessions = async () => {
    try {
      setLoading(true);
      const allSessions = await chatState.getSessions();
      setSessions(allSessions.sort((a, b) => b.updateAt - a.updateAt));
    } catch (error) {
      console.error('Failed to load sessions:', error);
      toast.error('加载会话列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      await chatState.deleteSession(sessionId);
      toast.success('会话已删除');
    } catch (error) {
      console.error('Failed to delete session:', error);
      toast.error('删除会话失败');
    }
  };

  const handleEditStart = (session: Session) => {
    setEditingId(session.id);
    setEditTitle(session.title);
  };

  const handleEditSave = async () => {
    if (!editingId || !editTitle.trim()) return;
    
    try {
      await chatState.updateSessionTitle(editingId, editTitle.trim());
      setEditingId(null);
      setEditTitle('');
      toast.success('会话标题已更新');
    } catch (error) {
      console.error('Failed to update session title:', error);
      toast.error('更新会话标题失败');
    }
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditTitle('');
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) {
      return date.toLocaleTimeString('zh-CN', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } else if (days === 1) {
      return '昨天';
    } else if (days < 7) {
      return `${days}天前`;
    } else {
      return date.toLocaleDateString('zh-CN', {
        month: 'short',
        day: 'numeric'
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 新建会话按钮 */}
      <div className="p-3 border-b">
        <Button 
          onClick={onNewSession}
          className="w-full justify-start gap-2"
          variant="outline"
        >
          <Plus className="h-4 w-4" />
          新建对话
        </Button>
      </div>

      {/* 会话列表 */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-2 space-y-1">
          {sessions.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">暂无对话</p>
            </div>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                className={cn(
                  "group relative p-3 rounded-lg cursor-pointer transition-colors",
                  "hover:bg-gray-50 border",
                  currentSessionId === session.id 
                    ? "bg-blue-50 border-blue-200" 
                    : "border-transparent"
                )}
                onClick={() => onSessionSelect(session.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    {editingId === session.id ? (
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <Input
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="h-6 text-sm"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleEditSave();
                            if (e.key === 'Escape') handleEditCancel();
                          }}
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0"
                          onClick={handleEditSave}
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0"
                          onClick={handleEditCancel}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <h3 className="font-medium text-sm truncate mb-1">
                          {session.title}
                        </h3>
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <span>{session.messageCount} 条消息</span>
                          <span>{formatDate(session.updateAt)}</span>
                        </div>
                      </>
                    )}
                  </div>
                  
                  {editingId !== session.id && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditStart(session);
                        }}
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSession(session.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}