// 角色创建/编辑对话框组件

import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
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
import { toast } from 'sonner'
import { getErrorMessage } from '@/lib/errors'
import { roleService, type RoleInfo, type CreateRoleDto, type UpdateRoleDto } from '@/services/admin.service'

interface RoleFormData {
  name: string
  description: string
  isActive: boolean
}

interface RoleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  role?: RoleInfo | null // 编辑模式时传入角色信息
  onSuccess?: (role: RoleInfo) => void
}

const RoleDialog: React.FC<RoleDialogProps> = ({
  open,
  onOpenChange,
  role,
  onSuccess
}) => {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState<RoleFormData>({
    name: '',
    description: '',
    isActive: true
  })

  const isEditMode = Boolean(role)
  const dialogTitle = isEditMode ? t('admin.roles.edit') : t('admin.roles.create')

  // 当对话框打开或角色数据变化时，初始化表单
  useEffect(() => {
    if (open) {
      if (role) {
        setFormData({
          name: role.name,
          description: role.description || '',
          isActive: role.isActive
        })
      } else {
        setFormData({
          name: '',
          description: '',
          isActive: true
        })
      }
    }
  }, [open, role])

  // 表单字段变化处理
  const handleFieldChange = <K extends keyof RoleFormData>(
    field: K,
    value: RoleFormData[K]
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

  // 提交表单
  const handleSubmit = async () => {
    if (!validateForm()) {
      return
    }

    setLoading(true)
    try {
      let result: RoleInfo

      if (isEditMode && role) {
        // 编辑模式
        const updateData: UpdateRoleDto = {
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          isActive: formData.isActive
        }
        result = await roleService.updateRole(role.id, updateData)
        toast.success('更新成功', {
          description: '角色信息已更新'
        })
      } else {
        // 创建模式
        const createData: CreateRoleDto = {
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          isActive: formData.isActive
        }
        result = await roleService.createRole(createData)
        toast.success('创建成功', {
          description: '新角色已创建'
        })
      }

      onSuccess?.(result)
      onOpenChange(false)
    } catch (error: unknown) {
      const message = getErrorMessage(error, '操作失败，请稍后重试')
      toast.error(isEditMode ? '更新失败' : '创建失败', {
        description: message
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>
            {isEditMode
              ? '修改角色信息。系统角色不能编辑名称和状态。'
              : '创建新的角色。角色创建后可以为其分配权限。'
            }
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* 角色名称 */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              角色名称 *
            </Label>
            <div className="col-span-3">
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleFieldChange('name', e.target.value)}
                placeholder="请输入角色名称"
                disabled={loading || (isEditMode && role?.isSystemRole)}
                maxLength={50}
              />
              <div className="text-xs text-muted-foreground mt-1">
                {formData.name.length}/50
              </div>
            </div>
          </div>

          {/* 角色描述 */}
          <div className="grid grid-cols-4 items-start gap-4">
            <Label htmlFor="description" className="text-right mt-2">
              角色描述
            </Label>
            <div className="col-span-3">
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => handleFieldChange('description', e.target.value)}
                placeholder="请输入角色描述（可选）"
                disabled={loading}
                maxLength={200}
                rows={3}
              />
              <div className="text-xs text-muted-foreground mt-1">
                {formData.description.length}/200
              </div>
            </div>
          </div>

          {/* 启用状态 */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="isActive" className="text-right">
              启用状态
            </Label>
            <div className="col-span-3 flex items-center space-x-2">
              <Switch
                id="isActive"
                checked={formData.isActive}
                onCheckedChange={(checked) => handleFieldChange('isActive', checked)}
                disabled={loading || (isEditMode && role?.isSystemRole)}
              />
              <span className="text-sm text-muted-foreground">
                {formData.isActive ? '启用' : '禁用'}
              </span>
            </div>
          </div>

          {/* 系统角色提示 */}
          {isEditMode && role?.isSystemRole && (
            <div className="col-span-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
              <div className="text-sm text-yellow-800">
                <strong>注意：</strong> 系统角色不能修改名称和状态，只能修改描述。
              </div>
            </div>
          )}
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
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? (isEditMode ? '更新中...' : '创建中...') : (isEditMode ? '更新' : '创建')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default RoleDialog
