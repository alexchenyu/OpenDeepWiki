// 角色权限配置对话框组件

import React, { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import {
  ChevronDown,
  ChevronRight,
  Shield,
  Building,
  Database,
  Eye,
  Edit,
  Trash2
} from 'lucide-react'
import type { RoleInfo } from '@/services/admin.service'
import { request } from '@/utils/request'
import { getErrorMessage } from '@/lib/errors'

// 权限树节点数据结构
interface WarehousePermissionTreeNode {
  id: string
  name: string
  type: 'organization' | 'warehouse'
  isSelected: boolean
  permission?: {
    warehouseId: string
    isReadOnly: boolean
    isWrite: boolean
    isDelete: boolean
  }
  children?: WarehousePermissionTreeNode[]
}

// 权限配置数据
interface PermissionConfig {
  roleId: string
  warehousePermissions: {
    warehouseId: string
    isReadOnly: boolean
    isWrite: boolean
    isDelete: boolean
  }[]
}

interface RolePermissionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  role: RoleInfo | null
  onSuccess?: () => void
}

const RolePermissionDialog: React.FC<RolePermissionDialogProps> = ({
  open,
  onOpenChange,
  role,
  onSuccess
}) => {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [permissionTree, setPermissionTree] = useState<WarehousePermissionTreeNode[]>([])
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())

  // 加载权限树数据
  const loadPermissionTree = useCallback(async () => {
    if (!role?.id) return

    setLoading(true)
    try {
      const tree = await request.get<WarehousePermissionTreeNode[]>(
        `/api/Permission/WarehousePermissionTree?roleId=${role.id}`
      )

      const nodes = tree || []
      setPermissionTree(nodes)

      // 默认展开所有组织节点
      const orgNodes = nodes
        .filter(node => node.type === 'organization')
        .map(node => node.id)
      setExpandedNodes(new Set(orgNodes))
    } catch (error: unknown) {
      const message = getErrorMessage(error, '无法加载权限配置')
      toast.error('加载失败', {
        description: message
      })
    } finally {
      setLoading(false)
    }
  }, [role?.id])

  // 当对话框打开时加载数据
  useEffect(() => {
    if (open && role) {
      void loadPermissionTree()
    }
  }, [open, role, loadPermissionTree])

  // 切换节点展开状态
  const toggleNodeExpansion = (nodeId: string) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev)
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId)
      } else {
        newSet.add(nodeId)
      }
      return newSet
    })
  }

  // 更新节点选中状态
  const updateNodeSelection = (
    tree: WarehousePermissionTreeNode[],
    nodeId: string,
    isSelected: boolean,
    permission?: WarehousePermissionTreeNode['permission']
  ): WarehousePermissionTreeNode[] => {
    return tree.map(node => {
      if (node.id === nodeId) {
        return {
          ...node,
          isSelected,
          permission: isSelected ? (permission || {
            warehouseId: node.id,
            isReadOnly: true,
            isWrite: false,
            isDelete: false
          }) : undefined
        }
      }

      if (node.children) {
        const updatedChildren = updateNodeSelection(node.children, nodeId, isSelected, permission)

        // 如果是组织节点，检查子节点选中状态
        if (node.type === 'organization') {
          const selectedChildren = updatedChildren.filter(child => child.isSelected).length
          const totalChildren = updatedChildren.length

          return {
            ...node,
            children: updatedChildren,
            isSelected: selectedChildren > 0 && selectedChildren === totalChildren
          }
        }

        return {
          ...node,
          children: updatedChildren
        }
      }

      return node
    })
  }

  // 更新权限配置
  const updatePermission = (nodeId: string, field: 'isReadOnly' | 'isWrite' | 'isDelete', value: boolean) => {
    const updateNodePermission = (tree: WarehousePermissionTreeNode[]): WarehousePermissionTreeNode[] => {
      return tree.map(node => {
        if (node.id === nodeId && node.permission) {
          return {
            ...node,
            permission: {
              ...node.permission,
              [field]: value
            }
          }
        }

        if (node.children) {
          return {
            ...node,
            children: updateNodePermission(node.children)
          }
        }

        return node
      })
    }

    setPermissionTree(prev => updateNodePermission(prev))
  }

  // 处理节点选中状态变化
  const handleNodeSelectionChange = (node: WarehousePermissionTreeNode, isSelected: boolean) => {
    if (node.type === 'organization') {
      // 组织节点：批量设置子仓库
      const updateOrgPermissions = (tree: WarehousePermissionTreeNode[]): WarehousePermissionTreeNode[] =>
        tree.map(treeNode => {
          if (treeNode.id === node.id) {
            const updatedChildren = treeNode.children?.map(child => ({
              ...child,
              isSelected,
              permission: isSelected
                ? {
                    warehouseId: child.id,
                    isReadOnly: true,
                    isWrite: false,
                    isDelete: false
                  }
                : undefined
            })) ?? []

            return {
              ...treeNode,
              isSelected,
              children: updatedChildren
            }
          }
          return treeNode
        })

      setPermissionTree(prev => updateOrgPermissions(prev))
    } else {
      // 仓库节点：单独设置
      setPermissionTree(prev => updateNodeSelection(prev, node.id, isSelected))
    }
  }

  // 保存权限配置
  const handleSave = async () => {
    if (!role?.id) return

    setSaving(true)
    try {
      // 收集所有选中的仓库权限
      const warehousePermissions: PermissionConfig['warehousePermissions'] = []

      const collectPermissions = (nodes: WarehousePermissionTreeNode[]) => {
        nodes.forEach(node => {
          if (node.type === 'warehouse' && node.isSelected && node.permission) {
            warehousePermissions.push(node.permission)
          }

          if (node.children) {
            collectPermissions(node.children)
          }
        })
      }

      collectPermissions(permissionTree)

      const config: PermissionConfig = {
        roleId: role.id,
        warehousePermissions
      }

      await request.post('/api/Permission/SetRolePermissions', config)

      toast.success('保存成功', {
        description: '角色权限配置已更新'
      })

      onSuccess?.()
      onOpenChange(false)
    } catch (error: unknown) {
      const message = getErrorMessage(error, '无法保存权限配置')
      toast.error('保存失败', {
        description: message
      })
    } finally {
      setSaving(false)
    }
  }

  // 渲染权限配置项
  const renderPermissionControls = (permission: WarehousePermissionTreeNode['permission']) => {
    if (!permission) return null

    return (
      <div className="flex flex-wrap items-center gap-2 mt-2">
        <div className="flex items-center space-x-1">
          <Switch
            checked={permission.isReadOnly}
            onCheckedChange={(checked) => updatePermission(permission.warehouseId, 'isReadOnly', checked)}
          />
          <Label className="text-xs flex items-center gap-1">
            <Eye className="h-3 w-3" />
            查看
          </Label>
        </div>

        <div className="flex items-center space-x-1">
          <Switch
            checked={permission.isWrite}
            onCheckedChange={(checked) => updatePermission(permission.warehouseId, 'isWrite', checked)}
          />
          <Label className="text-xs flex items-center gap-1">
            <Edit className="h-3 w-3" />
            编辑
          </Label>
        </div>

        <div className="flex items-center space-x-1">
          <Switch
            checked={permission.isDelete}
            onCheckedChange={(checked) => updatePermission(permission.warehouseId, 'isDelete', checked)}
          />
          <Label className="text-xs flex items-center gap-1">
            <Trash2 className="h-3 w-3" />
            删除
          </Label>
        </div>
      </div>
    )
  }

  // 渲染权限树节点
  const renderTreeNode = (node: WarehousePermissionTreeNode, level: number = 0) => {
    const isExpanded = expandedNodes.has(node.id)
    const hasChildren = node.children && node.children.length > 0

    return (
      <div key={node.id} className={`${level > 0 ? 'ml-4' : ''}`}>
        <div className="flex items-start space-x-2 py-2">
          {/* 展开/收起按钮 */}
          {hasChildren ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => toggleNodeExpansion(node.id)}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          ) : (
            <div className="w-6" />
          )}

          {/* 选择框 */}
          <Checkbox
            checked={node.isSelected}
            onCheckedChange={(checked) => handleNodeSelectionChange(node, checked === true)}
            disabled={role?.isSystemRole}
          />

          {/* 节点信息 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2">
              {node.type === 'organization' ? (
                <Building className="h-4 w-4 text-blue-600" />
              ) : (
                <Database className="h-4 w-4 text-green-600" />
              )}
              <span className="text-sm font-medium">{node.name}</span>
              <Badge variant={node.type === 'organization' ? 'default' : 'secondary'}>
                {node.type === 'organization' ? '组织' : '仓库'}
              </Badge>
            </div>

            {/* 权限配置 */}
            {node.type === 'warehouse' && node.isSelected && renderPermissionControls(node.permission)}
          </div>
        </div>

        {/* 子节点 */}
        {hasChildren && isExpanded && (
          <div className="border-l border-gray-200 ml-3">
            {node.children!.map(child => renderTreeNode(child, level + 1))}
          </div>
        )}
      </div>
    )
  }

  // 计算权限统计
  const getPermissionStats = () => {
    let totalWarehouses = 0
    let selectedWarehouses = 0

    const count = (nodes: WarehousePermissionTreeNode[]) => {
      nodes.forEach(node => {
        if (node.type === 'warehouse') {
          totalWarehouses++
          if (node.isSelected) selectedWarehouses++
        }
        if (node.children) {
          count(node.children)
        }
      })
    }

    count(permissionTree)

    return { totalWarehouses, selectedWarehouses }
  }

  const stats = getPermissionStats()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            配置角色权限
          </DialogTitle>
          <DialogDescription>
            为角色 "{role?.name}" 配置仓库访问权限。选择仓库并设置相应的操作权限。
          </DialogDescription>
        </DialogHeader>

        {role?.isSystemRole && (
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
            <div className="text-sm text-yellow-800">
              <strong>注意：</strong> 系统角色的权限配置是只读的，不能修改。
            </div>
          </div>
        )}

        {/* 权限统计 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">权限概览</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  已选择 {stats.selectedWarehouses} / {stats.totalWarehouses} 个仓库
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 权限树 */}
        <div className="flex-1 min-h-0">
          <ScrollArea className="h-full border rounded-md p-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-muted-foreground">加载权限配置中...</div>
              </div>
            ) : permissionTree.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-muted-foreground">暂无可配置的权限</div>
              </div>
            ) : (
              <div className="space-y-2">
                {permissionTree.map(node => renderTreeNode(node))}
              </div>
            )}
          </ScrollArea>
        </div>

        <Separator />

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            取消
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || loading || role?.isSystemRole}
          >
            {saving ? '保存中...' : '保存配置'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default RolePermissionDialog
