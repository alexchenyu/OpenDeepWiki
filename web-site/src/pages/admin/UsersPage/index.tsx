// 用户管理页面

import React, { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Search, Plus, MoreHorizontal, Edit, Trash2, UserPlus, Filter, Key } from 'lucide-react'
import { userService, roleService, type UserInfo, type RoleInfo } from '@/services/admin.service'
import { toast } from 'sonner'
import { getErrorMessage } from '@/lib/errors'
import UserDialog from '@/components/admin/UserDialog'
import UserRoleDialog from '@/components/admin/UserRoleDialog'
import UserPasswordDialog from '@/components/admin/UserPasswordDialog'
import BatchDeleteDialog from '@/components/admin/BatchDeleteDialog'

const UsersPage: React.FC = () => {
  const { t } = useTranslation()
  const [searchQuery, setSearchQuery] = useState('')
  const [users, setUsers] = useState<UserInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(10)
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [roles, setRoles] = useState<RoleInfo[]>([])

  // 对话框状态
  const [userDialogOpen, setUserDialogOpen] = useState(false)
  const [userRoleDialogOpen, setUserRoleDialogOpen] = useState(false)
  const [userPasswordDialogOpen, setUserPasswordDialogOpen] = useState(false)
  const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<UserInfo | null>(null)

  // 加载用户数据
  const loadUsers = useCallback(async () => {
    try {
      setLoading(true)
      const response = await userService.getUserList(currentPage, pageSize, searchQuery || undefined)
      setUsers(response.items || [])
      setTotal(response.total || 0)
    } catch (error) {
      const message = getErrorMessage(error, '无法加载用户列表')
      console.error('Failed to load users:', error)
      toast.error('加载失败', {
        description: message
      })
    } finally {
      setLoading(false)
    }
  }, [currentPage, pageSize, searchQuery])

  // 加载角色列表
  const loadRoles = useCallback(async () => {
    try {
      const response = await roleService.getAllRoles()
      setRoles(Array.isArray(response) ? response : [])
    } catch (error) {
      console.error('Failed to load roles:', error)
    }
  }, [])

  useEffect(() => {
    void loadUsers()
    void loadRoles()
  }, [loadUsers, loadRoles])

  // 搜索防抖
  useEffect(() => {
    const timer = setTimeout(() => {
      if (currentPage === 1) {
        void loadUsers()
      } else {
        setCurrentPage(1)
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [searchQuery, currentPage, loadUsers])

  const getRoleBadge = (role?: string) => {
    if (!role) return null

    const colors: Record<string, string> = {
      admin: 'bg-red-100 text-red-800',
      moderator: 'bg-blue-100 text-blue-800',
      user: 'bg-green-100 text-green-800'
    }

    const roles = role.split(',').filter(Boolean)

    return (
      <div className="flex gap-1">
        {roles.map((r, index) => (
          <Badge key={index} className={colors[r.trim()] || 'bg-gray-100 text-gray-800'}>
            {r.trim()}
          </Badge>
        ))}
      </div>
    )
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return '未知'
    return new Date(dateString).toLocaleDateString('zh-CN')
  }

  const handleDeleteUser = async (id: string) => {
    if (!confirm('确定要删除该用户吗？')) return

    try {
      await userService.deleteUser(id)
      toast.success('删除成功', {
        description: '用户已被删除'
      })
      await loadUsers()
      setSelectedUserIds(prev => prev.filter(userId => userId !== id))
    } catch (error) {
      const message = getErrorMessage(error, '无法删除用户')
      toast.error('删除失败', {
        description: message
      })
    }
  }

  // 处理全选
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedUserIds(users.map(user => user.id))
    } else {
      setSelectedUserIds([])
    }
  }

  // 处理单个用户选择
  const handleSelectUser = (userId: string, checked: boolean) => {
    setSelectedUserIds(prev => {
      if (checked) {
        return [...prev, userId]
      } else {
        return prev.filter(id => id !== userId)
      }
    })
  }

  // 处理创建用户
  const handleCreateUser = () => {
    setSelectedUser(null)
    setUserDialogOpen(true)
  }

  // 处理编辑用户
  const handleEditUser = (user: UserInfo) => {
    setSelectedUser(user)
    setUserDialogOpen(true)
  }

  // 处理角色分配
  const handleAssignRoles = (user: UserInfo) => {
    setSelectedUser(user)
    setUserRoleDialogOpen(true)
  }

  // 处理密码重置
  const handleResetPassword = (user: UserInfo) => {
    setSelectedUser(user)
    setUserPasswordDialogOpen(true)
  }

  // 处理批量删除
  const handleBatchDelete = () => {
    if (selectedUserIds.length === 0) {
      toast.error('请选择要删除的用户')
      return
    }
    setBatchDeleteDialogOpen(true)
  }

  // 获取选中的用户列表
  const getSelectedUsers = () => {
    return users.filter(user => selectedUserIds.includes(user.id))
  }

  // 重置选择
  const resetSelection = () => {
    setSelectedUserIds([])
  }

  // 过滤用户
  const filteredUsers = users.filter(user => {
    if (roleFilter && roleFilter !== 'all') {
      // 如果用户没有角色（空字符串或null/undefined），则不匹配任何角色过滤
      if (!user.role || user.role.trim() === '') {
        return false
      }
      // 检查角色字符串中是否包含所选角色（支持逗号分隔的多个角色）
      const userRoles = user.role.split(',').map(r => r.trim()).filter(Boolean)
      return userRoles.includes(roleFilter)
    }
    return true
  })

  return (
    <div className="space-y-6">
      {/* 页面标题和操作 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('admin.users.title')}</h1>
          <p className="text-muted-foreground">{t('admin.users.subtitle')}</p>
        </div>
        <div className="flex space-x-2">
          {selectedUserIds.length > 0 && (
            <Button
              variant="destructive"
              onClick={handleBatchDelete}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              删除选中 ({selectedUserIds.length})
            </Button>
          )}
          <Button onClick={handleCreateUser}>
            <Plus className="mr-2 h-4 w-4" />
            {t('admin.users.create')}
          </Button>
        </div>
      </div>

      {/* 搜索和筛选 */}
      <Card>
        <CardHeader>
          <CardTitle>用户列表</CardTitle>
          <CardDescription>共 {total} 个用户</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder={t('admin.users.search_placeholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-48">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="按角色筛选" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">所有角色</SelectItem>
                {Array.isArray(roles) && roles.map((role) => (
                  <SelectItem key={role.id} value={role.name}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedUserIds.length > 0 && (
              <Button
                variant="outline"
                onClick={resetSelection}
              >
                取消选择
              </Button>
            )}
          </div>

          {/* 用户表格 */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={users.length > 0 && selectedUserIds.length === users.length}
                      onCheckedChange={handleSelectAll}
                      aria-label="全选"
                    />
                  </TableHead>
                  <TableHead>{t('admin.users.table.username')}</TableHead>
                  <TableHead>{t('admin.users.table.email')}</TableHead>
                  <TableHead>{t('admin.users.table.role')}</TableHead>
                  <TableHead>{t('admin.users.table.created_at')}</TableHead>
                  <TableHead>{t('admin.users.table.updated_at')}</TableHead>
                  <TableHead className="text-right">{t('admin.users.table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      {t('admin.messages.loading')}
                    </TableCell>
                  </TableRow>
                ) : filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      {t('admin.messages.no_data')}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => (
                    <TableRow
                      key={user.id}
                      className={selectedUserIds.includes(user.id) ? 'bg-blue-50' : ''}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selectedUserIds.includes(user.id)}
                          onCheckedChange={(checked) => handleSelectUser(user.id, checked as boolean)}
                          aria-label={`选择用户 ${user.name}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={user.avatar} />
                            <AvatarFallback>{user.name[0]?.toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{user.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>{getRoleBadge(user.role)}</TableCell>
                      <TableCell>{formatDate(user.createdAt)}</TableCell>
                      <TableCell>{formatDate(user.updatedAt || user.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <span className="sr-only">打开菜单</span>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>操作</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleEditUser(user)}>
                              <Edit className="mr-2 h-4 w-4" />
                              {t('admin.users.edit')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleAssignRoles(user)}>
                              <UserPlus className="mr-2 h-4 w-4" />
                              {t('admin.users.assign_roles')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleResetPassword(user)}>
                              <Key className="mr-2 h-4 w-4" />
                              重置密码
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => handleDeleteUser(user.id)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              {t('admin.users.delete')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* 分页 */}
          {total > pageSize && (
            <div className="flex items-center justify-end space-x-2 py-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
              >
                上一页
              </Button>
              <div className="text-sm text-muted-foreground">
                第 {currentPage} 页 / 共 {Math.ceil(total / pageSize)} 页
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => prev + 1)}
                disabled={currentPage >= Math.ceil(total / pageSize)}
              >
                下一页
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 对话框 */}
      <UserDialog
        open={userDialogOpen}
        onOpenChange={setUserDialogOpen}
        user={selectedUser}
        onSuccess={() => {
          void loadUsers()
          resetSelection()
        }}
      />

      <UserRoleDialog
        open={userRoleDialogOpen}
        onOpenChange={setUserRoleDialogOpen}
        user={selectedUser}
        onSuccess={() => {
          void loadUsers()
          resetSelection()
        }}
      />

      <UserPasswordDialog
        open={userPasswordDialogOpen}
        onOpenChange={setUserPasswordDialogOpen}
        user={selectedUser}
        onSuccess={() => {
          void loadUsers()
          resetSelection()
        }}
      />

      <BatchDeleteDialog
        open={batchDeleteDialogOpen}
        onOpenChange={setBatchDeleteDialogOpen}
        users={getSelectedUsers()}
        onSuccess={() => {
          void loadUsers()
          resetSelection()
        }}
      />
    </div>
  )
}

export default UsersPage
