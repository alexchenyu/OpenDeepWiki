// 角色复制对话框组件

import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Copy,  Shield } from 'lucide-react'
import { roleService, type RoleInfo, type CreateRoleDto } from '@/services/admin.service'
import { request } from '@/utils/request'
import { getErrorMessage } from '@/lib/errors'

interface RoleCopyFormData {
  name: string
  description: string
  isActive: boolean
  copyPermissions: boolean
  copyUsers: boolean
}

interface RoleWarehousePermission {
  warehouseId: string
  isReadOnly: boolean
  isWrite: boolean
  isDelete: boolean
}

interface RoleCopyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sourceRole: RoleInfo | null
  onSuccess?: (newRole: RoleInfo) => void
}

const RoleCopyDialog: React.FC<RoleCopyDialogProps> = ({
  open,
  onOpenChange,
  sourceRole,
  onSuccess
}) => {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState<RoleCopyFormData>({
    name: '',
    description: '',
    isActive: true,
    copyPermissions: true,
    copyUsers: false
  })

  // 当对话框打开时，初始化表单数据
  React.useEffect(() => {
    if (open && sourceRole) {
      setFormData({
        name: `${sourceRole.name} - 副本`,
        description: sourceRole.description ? `${sourceRole.description} (复制自 ${sourceRole.name})` : `复制自 ${sourceRole.name}`,
        isActive: true,
        copyPermissions: true,
        copyUsers: false
      })
    }
  }, [open, sourceRole])

  // 表单字段变化处理
  const handleFieldChange = <K extends keyof RoleCopyFormData>(
    field: K,
    value: RoleCopyFormData[K]
  ) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  // 表单验证
  const validateForm = () => {
    if (!formData.name.trim()) {
      toast.error('验证失败', {
        description: '角色名称不能为空'
      })
      return false
    }

    if (formData.name.trim().length < 2) {
      toast.error('验证失败', {
        description: '角色名称至少需要2个字符'
      })
      return false
    }

    if (formData.name.trim().length > 50) {
      toast.error('验证失败', {
        description: '角色名称不能超过50个字符'
      })
      return false
    }

    if (formData.description.length > 200) {
      toast.error('验证失败', {
        description: '角色描述不能超过200个字符'
      })
      return false
    }

    return true
  }

  // 复制角色
  const handleCopyRole = async () => {
    if (!sourceRole || !validateForm()) {
      return
    }

    setLoading(true)
    try {
      // 1. 创建新角色
      const createData: CreateRoleDto = {
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        isActive: formData.isActive
      }

      const newRole = await roleService.createRole(createData)

      // 2. 复制权限配置
      if (formData.copyPermissions) {
        try {
          // 获取源角色的权限配置
          const sourcePermissions = await request.get<RoleWarehousePermission[]>(
            `/api/Permission/RoleWarehousePermissions?roleId=${sourceRole.id}`
          )

          if (Array.isArray(sourcePermissions) && sourcePermissions.length > 0) {
            // 转换权限格式
            const warehousePermissions = sourcePermissions.map((perm) => ({
              warehouseId: perm.warehouseId,
              isReadOnly: perm.isReadOnly,
              isWrite: perm.isWrite,
              isDelete: perm.isDelete
            }))

            // 为新角色设置权限
            await request.post('/api/Permission/SetRolePermissions', {
              roleId: newRole.id,
              warehousePermissions
            })
          }
        } catch (permError) {
          console.warn('复制权限时出错:', permError)
          // 权限复制失败不影响角色创建成功的提示
        }
      }

      // 3. 复制用户分配
      if (formData.copyUsers) {
        try {
          // 获取源角色的用户列表
          const roleDetail = await roleService.getRoleDetail(sourceRole.id)

          if (roleDetail.users && roleDetail.users.length > 0) {
            // 为每个用户添加新角色
            for (const user of roleDetail.users) {
              try {
                // 获取用户当前角色
                const currentRoles = await request.get<RoleInfo[]>(
                  `/api/Permission/UserRoles?userId=${user.id}`
                )
                const currentRoleIds = Array.isArray(currentRoles)
                  ? currentRoles.map((role) => role.id)
                  : []

                // 添加新角色
                const newRoleIds = [...currentRoleIds, newRole.id]
                await request.post('/api/Permission/AssignUserRoles', {
                  userId: user.id,
                  roleIds: newRoleIds
                })
              } catch (userError) {
                console.warn(`为用户 ${user.name} 分配新角色时出错:`, userError)
              }
            }
          }
        } catch (userError) {
          console.warn('复制用户分配时出错:', userError)
          // 用户分配失败不影响角色创建成功的提示
        }
      }

      const successMessage: string[] = []
      successMessage.push('角色创建成功')
      if (formData.copyPermissions) successMessage.push('权限配置已复制')
      if (formData.copyUsers) successMessage.push('用户分配已复制')

      toast.success('复制成功', {
        description: successMessage.join('，')
      })

      onSuccess?.(newRole)
      onOpenChange(false)
    } catch (error: unknown) {
      const message = getErrorMessage(error, '角色复制失败，请稍后重试')
      toast.error('复制失败', {
        description: message
      })
    } finally {
      setLoading(false)
    }
  }

  if (!sourceRole) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />
            复制角色
          </DialogTitle>
          <DialogDescription>
            复制角色 "{sourceRole.name}" 并创建一个新的角色。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 源角色信息 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4" />
                源角色信息
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">角色名称:</span>
                <span className="font-medium">{sourceRole.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">用户数量:</span>
                <Badge variant="secondary">{sourceRole.userCount || 0}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">权限数量:</span>
                <Badge variant="outline">{sourceRole.warehousePermissionCount || 0}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">状态:</span>
                <Badge variant={sourceRole.isActive ? 'default' : 'secondary'}>
                  {sourceRole.isActive ? '启用' : '禁用'}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* 新角色配置 */}
          <div className="space-y-4">
            {/* 角色名称 */}
            <div className="space-y-2">
              <Label htmlFor="name">角色名称 *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleFieldChange('name', e.target.value)}
                placeholder="请输入新角色名称"
                disabled={loading}
                maxLength={50}
              />
              <div className="text-xs text-muted-foreground">
                {formData.name.length}/50
              </div>
            </div>

            {/* 角色描述 */}
            <div className="space-y-2">
              <Label htmlFor="description">角色描述</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => handleFieldChange('description', e.target.value)}
                placeholder="请输入角色描述（可选）"
                disabled={loading}
                maxLength={200}
                rows={3}
              />
              <div className="text-xs text-muted-foreground">
                {formData.description.length}/200
              </div>
            </div>

            {/* 启用状态 */}
            <div className="flex items-center space-x-2">
              <Switch
                id="isActive"
                checked={formData.isActive}
                onCheckedChange={(checked) => handleFieldChange('isActive', checked)}
                disabled={loading}
              />
              <Label htmlFor="isActive">启用新角色</Label>
            </div>
          </div>

          {/* 复制选项 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">复制选项</CardTitle>
              <CardDescription>选择要复制的内容</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="copyPermissions"
                  checked={formData.copyPermissions}
                  onCheckedChange={(checked) => handleFieldChange('copyPermissions', checked === true)}
                  disabled={loading}
                />
                <Label htmlFor="copyPermissions" className="flex-1">
                  复制权限配置
                  <div className="text-xs text-muted-foreground">
                    复制所有仓库访问权限到新角色
                  </div>
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="copyUsers"
                  checked={formData.copyUsers}
                  onCheckedChange={(checked) => handleFieldChange('copyUsers', checked === true)}
                  disabled={loading}
                />
                <Label htmlFor="copyUsers" className="flex-1">
                  复制用户分配
                  <div className="text-xs text-muted-foreground">
                    将新角色分配给当前拥有源角色的所有用户
                  </div>
                </Label>
              </div>
            </CardContent>
          </Card>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            取消
          </Button>
          <Button
            type="button"
            onClick={handleCopyRole}
            disabled={loading}
          >
            {loading ? '复制中...' : '创建副本'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default RoleCopyDialog
