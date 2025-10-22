// 角色管理页面

import React, { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
import { Search, Plus, MoreHorizontal, Edit, Trash2, Shield, Settings, Copy, Users } from 'lucide-react'
import { roleService, type RoleInfo } from '@/services/role.service'
import { toast } from 'sonner'
import { getErrorMessage } from '@/lib/errors'
import RoleDialog from './RoleDialog'
import RolePermissionDialog from './RolePermissionDialog'
import RoleCopyDialog from './RoleCopyDialog'
import RoleMembersDialog from './RoleMembersDialog'

const RolesPage: React.FC = () => {
  const { t } = useTranslation()
  const [searchQuery, setSearchQuery] = useState('')
  const [roles, setRoles] = useState<RoleInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(20)
  const [statusFilter, setStatusFilter] = useState<boolean | undefined>(undefined)

  // 对话框状态
  const [roleDialogOpen, setRoleDialogOpen] = useState(false)
  const [permissionDialogOpen, setPermissionDialogOpen] = useState(false)
  const [copyDialogOpen, setCopyDialogOpen] = useState(false)
  const [membersDialogOpen, setMembersDialogOpen] = useState(false)
  const [selectedRole, setSelectedRole] = useState<RoleInfo | null>(null)

  // 加载角色数据
  const loadRoles = useCallback(async () => {
    try {
      setLoading(true)
      const response = await roleService.getRoleList({
        page: currentPage,
        pageSize,
        keyword: searchQuery.trim() || undefined,
        isActive: statusFilter
      })
      setRoles(response.items ?? [])
      setTotal(response.total ?? 0)
    } catch (error: unknown) {
      const message = getErrorMessage(error, '无法加载角色列表')
      console.error('Failed to load roles:', error)
      toast.error('加载失败', {
        description: message
      })
    } finally {
      setLoading(false)
    }
  }, [currentPage, pageSize, searchQuery, statusFilter])

  useEffect(() => {
    void loadRoles()
  }, [loadRoles])

  // 搜索防抖
  useEffect(() => {
    const timer = setTimeout(() => {
      if (currentPage === 1) {
        void loadRoles()
      } else {
        setCurrentPage(1)
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [searchQuery, currentPage, loadRoles])

  const getStatusBadge = (isActive: boolean) => {
    return (
      <Badge variant={isActive ? 'default' : 'secondary'}>
        {isActive ? '启用' : '禁用'}
      </Badge>
    )
  }

  const getRoleTypeBadge = (isSystemRole: boolean) => {
    return isSystemRole ? (
      <Badge variant="outline" className="text-blue-600 border-blue-600">
        系统角色
      </Badge>
    ) : (
      <Badge variant="outline">
        自定义角色
      </Badge>
    )
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return '未知'
    return new Date(dateString).toLocaleDateString('zh-CN')
  }

  const handleDeleteRole = async (id: string, name: string) => {
    if (!confirm(`确定要删除角色 "${name}" 吗？`)) return

    try {
      await roleService.deleteRole(id)
      toast.success('删除成功', {
        description: '角色已被删除'
      })
      void loadRoles()
    } catch (error: unknown) {
      const message = getErrorMessage(error, '无法删除角色')
      toast.error('删除失败', {
        description: message
      })
    }
  }

  // 处理角色操作
  const handleCreateRole = () => {
    setSelectedRole(null)
    setRoleDialogOpen(true)
  }

  const handleEditRole = (role: RoleInfo) => {
    setSelectedRole(role)
    setRoleDialogOpen(true)
  }

  const handleCopyRole = (role: RoleInfo) => {
    setSelectedRole(role)
    setCopyDialogOpen(true)
  }

  const handleManagePermissions = (role: RoleInfo) => {
    setSelectedRole(role)
    setPermissionDialogOpen(true)
  }

  const handleViewMembers = (role: RoleInfo) => {
    setSelectedRole(role)
    setMembersDialogOpen(true)
  }

  const handleRoleDialogSuccess = () => {
    void loadRoles()
  }

  const handleToggleStatus = async (role: RoleInfo) => {
    try {
      await roleService.batchUpdateRoleStatus([role.id], !role.isActive)
      toast.success('状态更新成功', {
        description: `角色已${role.isActive ? '禁用' : '启用'}`
      })
      void loadRoles()
    } catch (error: unknown) {
      const message = getErrorMessage(error, '无法更新角色状态')
      toast.error('状态更新失败', {
        description: message
      })
    }
  }

  // 计算统计数据
  const stats = {
    total: total,
    active: roles.filter(r => r.isActive).length,
    totalUsers: roles.reduce((sum, role) => sum + (role.userCount || 0), 0)
  }

  return (
    <div className="space-y-6">
      {/* 页面标题和操作 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('admin.roles.title')}</h1>
          <p className="text-muted-foreground">{t('admin.roles.subtitle')}</p>
        </div>
        <Button onClick={handleCreateRole}>
          <Plus className="mr-2 h-4 w-4" />
          {t('admin.roles.create')}
        </Button>
      </div>

      {/* 角色统计卡片 */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总角色数</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">包含系统和自定义角色</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">活跃角色</CardTitle>
            <Shield className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.active}</div>
            <p className="text-xs text-muted-foreground">当前启用的角色</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">分配用户数</CardTitle>
            <Shield className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalUsers}</div>
            <p className="text-xs text-muted-foreground">已分配角色的用户总数</p>
          </CardContent>
        </Card>
      </div>

      {/* 搜索和筛选 */}
      <Card>
        <CardHeader>
          <CardTitle>角色列表</CardTitle>
          <CardDescription>共 {total} 个角色</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder={t('admin.roles.search_placeholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex items-center space-x-2">
              <select
                value={statusFilter === undefined ? 'all' : statusFilter ? 'active' : 'inactive'}
                onChange={(e) => {
                  const value = e.target.value
                  setStatusFilter(
                    value === 'all' ? undefined :
                    value === 'active' ? true : false
                  )
                  setCurrentPage(1)
                }}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">全部状态</option>
                <option value="active">启用</option>
                <option value="inactive">禁用</option>
              </select>
            </div>
          </div>

          {/* 角色表格 */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin.roles.table.name')}</TableHead>
                  <TableHead>{t('admin.roles.table.description')}</TableHead>
                  <TableHead className="text-center">{t('admin.roles.table.users_count')}</TableHead>
                  <TableHead className="text-center">{t('admin.roles.table.permissions_count')}</TableHead>
                  <TableHead>{t('admin.roles.table.status')}</TableHead>
                  <TableHead>{t('admin.roles.table.created_at')}</TableHead>
                  <TableHead className="text-right">{t('admin.roles.table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      {t('admin.messages.loading')}
                    </TableCell>
                  </TableRow>
                ) : roles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      {t('admin.messages.no_data')}
                    </TableCell>
                  </TableRow>
                ) : (
                  roles.map((role) => (
                    <TableRow key={role.id}>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <span className="font-medium">{role.name}</span>
                            {getRoleTypeBadge(role.isSystemRole)}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <span className="text-sm text-muted-foreground">
                          {role.description || '暂无描述'}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">{role.userCount || 0}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline">{role.warehousePermissionCount || 0}</Badge>
                      </TableCell>
                      <TableCell>{getStatusBadge(role.isActive)}</TableCell>
                      <TableCell>{formatDate(role.createdAt)}</TableCell>
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
                            <DropdownMenuItem onClick={() => handleEditRole(role)}>
                              <Edit className="mr-2 h-4 w-4" />
                              {t('admin.roles.edit')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleManagePermissions(role)}>
                              <Settings className="mr-2 h-4 w-4" />
                              {t('admin.roles.permissions')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleViewMembers(role)}>
                              <Users className="mr-2 h-4 w-4" />
                              查看成员
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleCopyRole(role)}>
                              <Copy className="mr-2 h-4 w-4" />
                              复制角色
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleToggleStatus(role)}>
                              <Shield className="mr-2 h-4 w-4" />
                              {role.isActive ? '禁用' : '启用'}
                            </DropdownMenuItem>
                            {!role.isSystemRole && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-red-600"
                                  onClick={() => handleDeleteRole(role.id, role.name)}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  {t('admin.roles.delete')}
                                </DropdownMenuItem>
                              </>
                            )}
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

      {/* 对话框组件 */}
      <RoleDialog
        open={roleDialogOpen}
        onOpenChange={setRoleDialogOpen}
        role={selectedRole}
        onSuccess={handleRoleDialogSuccess}
      />

      <RolePermissionDialog
        open={permissionDialogOpen}
        onOpenChange={setPermissionDialogOpen}
        role={selectedRole}
        onSuccess={loadRoles}
      />

      <RoleCopyDialog
        open={copyDialogOpen}
        onOpenChange={setCopyDialogOpen}
        sourceRole={selectedRole}
        onSuccess={handleRoleDialogSuccess}
      />

      <RoleMembersDialog
        open={membersDialogOpen}
        onOpenChange={setMembersDialogOpen}
        role={selectedRole}
      />
    </div>
  )
}

export default RolesPage
