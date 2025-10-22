// 仓库管理页面

import React, { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Search,
  MoreHorizontal,
  Edit,
  Trash2,
  ExternalLink,
  FileText,
  Database,
  RefreshCw,
  Filter,
  Download,
  Settings,
  Eye,
  GitBranch,
  Star,
  GitFork,
  AlertCircle,
  CheckCircle,
  Clock,
  Loader2
} from 'lucide-react'
import { type WarehouseInfo, type UpdateRepositoryDto, repositoryService } from '@/services/admin.service'
import { toast } from 'sonner'

const RepositoriesPage: React.FC = () => {
  const { t } = useTranslation()
  const [searchQuery, setSearchQuery] = useState('')
  const [repositories, setRepositories] = useState<WarehouseInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(10)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [selectedRepositories, setSelectedRepositories] = useState<string[]>([])

  const [showEditDialog, setShowEditDialog] = useState(false)
  const [editingRepository, setEditingRepository] = useState<WarehouseInfo | null>(null)
  const [showDeleteAlert, setShowDeleteAlert] = useState(false)
  const [repositoryToDelete, setRepositoryToDelete] = useState<WarehouseInfo | null>(null)

  // 加载仓库数据
  const loadRepositories = useCallback(async () => {
    try {
      setLoading(true)
      const { items, total: totalCount } = await repositoryService.getRepositoryList(
        currentPage,
        pageSize,
        searchQuery || undefined,
        statusFilter === 'all' ? undefined : statusFilter
      )
      setRepositories(items ?? [])
      setTotal(totalCount ?? 0)
      setSelectedRepositories([])
    } catch (error: unknown) {
      console.error('Failed to load repositories:', error)
      const description =
        error && typeof error === 'object' && 'message' in error && typeof (error as { message?: string }).message === 'string'
          ? (error as { message?: string }).message
          : '无法加载仓库列表'
      toast.error('加载失败', {
        description
      })
    } finally {
      setLoading(false)
    }
  }, [currentPage, pageSize, searchQuery, statusFilter])

  useEffect(() => {
    loadRepositories()
  }, [loadRepositories])

  // 搜索和筛选防抖
  useEffect(() => {
    const timer = setTimeout(() => {
      if (currentPage === 1) {
        loadRepositories()
      } else {
        setCurrentPage(1)
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [currentPage, loadRepositories, searchQuery])

  // 状态筛选立即生效
  useEffect(() => {
    if (currentPage === 1) {
      loadRepositories()
    } else {
      setCurrentPage(1)
    }
  }, [currentPage, loadRepositories, statusFilter])

  const getStatusBadge = (status?: string) => {
    const statusConfig = {
      'Pending': {
        variant: 'secondary' as const,
        text: '待处理',
        color: 'text-gray-600 bg-gray-100',
        icon: Clock
      },
      'Processing': {
        variant: 'default' as const,
        text: '处理中',
        color: 'text-blue-600 bg-blue-100',
        icon: Loader2
      },
      'Completed': {
        variant: 'default' as const,
        text: '已完成',
        color: 'text-green-600 bg-green-100',
        icon: CheckCircle
      },
      'Failed': {
        variant: 'destructive' as const,
        text: '失败',
        color: 'text-red-600 bg-red-100',
        icon: AlertCircle
      }
    }

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.Pending
    const Icon = config.icon

    return (
      <Badge variant={config.variant} className={`${config.color} flex items-center gap-1`}>
        <Icon className={`h-3 w-3 ${status === 'Processing' ? 'animate-spin' : ''}`} />
        {config.text}
      </Badge>
    )
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return '未知'
    return new Date(dateString).toLocaleDateString('zh-CN')
  }

  // 选择操作
  const handleSelectRepository = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedRepositories(prev => [...prev, id])
    } else {
      setSelectedRepositories(prev => prev.filter(item => item !== id))
    }
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedRepositories(repositories.map(repo => repo.id))
    } else {
      setSelectedRepositories([])
    }
  }

  // 删除操作
  const handleDeleteRepository = async (repository: WarehouseInfo) => {
    setRepositoryToDelete(repository)
    setShowDeleteAlert(true)
  }

  const confirmDeleteRepository = async () => {
    if (!repositoryToDelete) return

    try {
      await repositoryService.deleteRepository(repositoryToDelete.id)
      toast.success('删除成功', {
        description: `仓库 "${repositoryToDelete.name}" 已被删除`
      })
      loadRepositories()
    } catch (error: unknown) {
      console.error('Failed to delete repository:', error)
      toast.error('删除失败', {
        description: '无法删除仓库'
      })
    } finally {
      setShowDeleteAlert(false)
      setRepositoryToDelete(null)
    }
  }

  // 刷新操作
  const handleRefreshRepository = async (id: string, name: string) => {
    try {
      await repositoryService.refreshRepository(id)
      toast.success('刷新成功', {
        description: `仓库 "${name}" 已开始重新处理`
      })
      loadRepositories()
    } catch (error: unknown) {
      console.error('Failed to refresh repository:', error)
      toast.error('刷新失败', {
        description: '无法刷新仓库'
      })
    }
  }

  // 编辑操作
  const handleEditRepository = (repository: WarehouseInfo) => {
    setEditingRepository(repository)
    setShowEditDialog(true)
  }


  // 计算统计数据
  const getStatusStats = () => {
    const stats = repositories.reduce((acc, repo) => {
      const status = repo.status || 'Pending'
      acc[status] = (acc[status] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    return {
      total: total,
      completed: stats.Completed || 0,
      processing: stats.Processing || 0,
      pending: stats.Pending || 0,
      failed: stats.Failed || 0
    }
  }

  const stats = getStatusStats()

  return (
    <div className="space-y-6">
      {/* 页面标题和操作 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('admin.repositories.title')}</h1>
          <p className="text-muted-foreground">{t('admin.repositories.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedRepositories.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  批量操作 ({selectedRepositories.length})
                </Button>
              </DropdownMenuTrigger>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* 仓库统计卡片 */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总仓库数</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">所有仓库</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">已完成</CardTitle>
            <Database className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
            <p className="text-xs text-muted-foreground">分析完成</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">处理中</CardTitle>
            <Database className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.processing}</div>
            <p className="text-xs text-muted-foreground">正在分析</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">待处理</CardTitle>
            <Database className="h-4 w-4 text-gray-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-600">{stats.pending}</div>
            <p className="text-xs text-muted-foreground">等待分析</p>
          </CardContent>
        </Card>
      </div>

      {/* 搜索和筛选 */}
      <Card>
        <CardHeader>
          <CardTitle>仓库列表</CardTitle>
          <CardDescription>共 {total} 个仓库</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder={t('admin.repositories.search_placeholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="筛选状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="Pending">待处理</SelectItem>
                <SelectItem value="Processing">处理中</SelectItem>
                <SelectItem value="Completed">已完成</SelectItem>
                <SelectItem value="Failed">失败</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 仓库表格 */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">
                    <Checkbox
                      checked={selectedRepositories.length === repositories.length && repositories.length > 0}
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                  <TableHead>{t('admin.repositories.table.name')}</TableHead>
                  <TableHead>{t('admin.repositories.table.organization')}</TableHead>
                  <TableHead>{t('admin.repositories.table.status')}</TableHead>
                  <TableHead className="text-center">统计信息</TableHead>
                  <TableHead>{t('admin.repositories.table.created_at')}</TableHead>
                  <TableHead className="text-right">{t('admin.repositories.table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      {t('admin.messages.loading')}
                    </TableCell>
                  </TableRow>
                ) : repositories.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      {t('admin.messages.no_data')}
                    </TableCell>
                  </TableRow>
                ) : (
                  repositories.map((repo) => (
                    <TableRow key={repo.id} className={selectedRepositories.includes(repo.id) ? 'bg-muted/50' : ''}>
                      <TableCell>
                        <Checkbox
                          checked={selectedRepositories.includes(repo.id)}
                          onCheckedChange={(checked) => handleSelectRepository(repo.id, checked as boolean)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{repo.name}</span>
                            {repo.isRecommended && (
                              <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                            )}
                          </div>
                          {repo.address && (
                            <div className="flex items-center gap-2">
                              <a
                                href={repo.address.replace('.git', '')}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:underline flex items-center"
                              >
                                <ExternalLink className="h-3 w-3 mr-1" />
                                {repo.address.includes('github.com') ? 'GitHub' :
                                  repo.address.includes('gitee.com') ? 'Gitee' : 'Git'}
                              </a>
                              {repo.branch && (
                                <div className="text-xs text-muted-foreground flex items-center">
                                  <GitBranch className="h-3 w-3 mr-1" />
                                  {repo.branch}
                                </div>
                              )}
                            </div>
                          )}
                          {repo.description && (
                            <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {repo.description}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{repo.organizationName}</TableCell>
                      <TableCell>{getStatusBadge(repo.status)}</TableCell>
                      <TableCell className="text-center">
                        <div className="space-y-1">
                          <div className="flex items-center justify-center space-x-1">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">{repo.documentCount || 0}</span>
                          </div>
                          {(repo.stars || repo.forks) && (
                            <div className="flex items-center justify-center space-x-2 text-xs text-muted-foreground">
                              {repo.stars && repo.stars > 0 && (
                                <div className="flex items-center">
                                  <Star className="h-3 w-3 mr-1" />
                                  {repo.stars}
                                </div>
                              )}
                              {repo.forks && repo.forks > 0 && (
                                <div className="flex items-center">
                                  <GitFork className="h-3 w-3 mr-1" />
                                  {repo.forks}
                                </div>
                              )}
                            </div>
                          )}
                          {repo.language && (
                            <div className="text-xs text-muted-foreground">
                              {repo.language}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{formatDate(repo.createdAt)}</div>
                        {repo.version && (
                          <div className="text-xs text-muted-foreground">
                            v{repo.version}
                          </div>
                        )}
                      </TableCell>
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
                            <DropdownMenuItem asChild>
                              <Link to={`/${repo.organizationName}/${repo.name}`}>
                                <Eye className="mr-2 h-4 w-4" />
                                查看仓库
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleEditRepository(repo)}>
                              <Edit className="mr-2 h-4 w-4" />
                              编辑信息
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link to={`/admin/repositories/${repo.id}`}>
                                <Settings className="mr-2 h-4 w-4" />
                                管理内容
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleRefreshRepository(repo.id, repo.name)}>
                              <RefreshCw className="mr-2 h-4 w-4" />
                              重新处理仓库
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Download className="mr-2 h-4 w-4" />
                              导出Markdown
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => handleDeleteRepository(repo)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              删除仓库
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

      {/* 编辑仓库对话框 */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl">
          <EditRepositoryDialog
            repository={editingRepository}
            onSuccess={() => {
              setShowEditDialog(false)
              setEditingRepository(null)
              loadRepositories()
            }}
            onCancel={() => {
              setShowEditDialog(false)
              setEditingRepository(null)
            }}
          />
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除仓库</AlertDialogTitle>
            <AlertDialogDescription>
              您确定要删除仓库 "{repositoryToDelete?.name}" 吗？
              <br />
              <span className="text-red-600 font-medium">
                此操作不可逆转，将删除仓库及其所有文档数据。
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteRepository} className="bg-red-600 hover:bg-red-700">
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}



// 编辑仓库对话框组件
const EditRepositoryDialog: React.FC<{
  repository: WarehouseInfo | null
  onSuccess: () => void
  onCancel: () => void
}> = ({ repository, onSuccess, onCancel }) => {
  const [formData, setFormData] = useState<UpdateRepositoryDto>({
    description: '',
    isRecommended: false,
    prompt: ''
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (repository) {
      setFormData({
        description: repository.description || '',
        isRecommended: repository.isRecommended || false,
        prompt: ''
      })
    }
  }, [repository])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!repository) return

    setLoading(true)
    try {
      await repositoryService.updateRepository(repository.id, formData)
      toast.success('仓库信息更新成功')
      onSuccess()
    } catch (error: unknown) {
      console.error('Update repository failed:', error)
      const description =
        error && typeof error === 'object' && 'message' in error && typeof (error as { message?: string }).message === 'string'
          ? (error as { message?: string }).message
          : '更新仓库信息时发生错误'
      toast.error('更新失败', {
        description
      })
    } finally {
      setLoading(false)
    }
  }

  if (!repository) return null

  return (
    <>
      <DialogHeader>
        <DialogTitle>编辑仓库信息</DialogTitle>
        <DialogDescription>
          编辑 {repository.organizationName}/{repository.name} 的信息
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="description">仓库描述</Label>
          <Textarea
            id="description"
            placeholder="请输入仓库描述..."
            value={formData.description}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            rows={3}
          />
        </div>
        <div className="flex items-center space-x-2">
          <Switch
            id="isRecommended"
            checked={formData.isRecommended}
            onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isRecommended: checked }))}
          />
          <Label htmlFor="isRecommended">推荐仓库</Label>
        </div>
        <div>
          <Label htmlFor="prompt">自定义提示词（可选）</Label>
          <Textarea
            id="prompt"
            placeholder="请输入自定义提示词..."
            value={formData.prompt}
            onChange={(e) => setFormData(prev => ({ ...prev, prompt: e.target.value }))}
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            取消
          </Button>
          <Button type="submit" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            保存更改
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}

export default RepositoriesPage
