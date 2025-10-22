// 应用管理组件
import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { toast as sonnerToast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import {
  Plus,
  Edit,
  Trash2,
  Copy,
  Settings,
  Globe,
  Key,
  Loader2
} from 'lucide-react'
import { appConfigService } from '@/services/appConfigService'
import type { AppConfigOutput, AppConfigInput } from '@/types'
import { getErrorMessage } from '@/lib/errors'

export const AppManagement: React.FC = () => {
  const toast = (opts: { title: string; description?: string; variant?: 'destructive' | string }) => {
    if (opts.variant === 'destructive') {
      sonnerToast.error(opts.title, { description: opts.description })
    } else {
      sonnerToast.success(opts.title, { description: opts.description })
    }
  }
  const [apps, setApps] = useState<AppConfigOutput[]>([])
  const [loading, setLoading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedApp, setSelectedApp] = useState<AppConfigOutput | null>(null)
  const [formData, setFormData] = useState<AppConfigInput>({
    appId: '',
    name: '',
    organizationName: '',
    repositoryName: '',
    description: '',
    allowedDomains: [],
    enableDomainValidation: false,
    prompt: '',
    introduction: '',
    model: 'gpt-3.5-turbo',
    recommendedQuestions: [],
    mcps: []
  })
  const [newDomain, setNewDomain] = useState('')
  const [newQuestion, setNewQuestion] = useState('')

  // 加载应用列表
  const loadApps = useCallback(async () => {
    setLoading(true)
    try {
      const data = await appConfigService.getAppConfigs()
      setApps(data)
    } catch (error) {
      const message = getErrorMessage(error, '无法加载应用列表')
      toast({
        title: '加载失败',
        description: message,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [])


  useEffect(() => {
    void loadApps()
  }, [loadApps])

  // 生成应用ID
  const generateAppId = () => {
    const id = `app_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    setFormData(prev => ({ ...prev, appId: id }))
  }

  // 处理表单输入
  const handleInputChange = <K extends keyof AppConfigInput>(
    field: K,
    value: AppConfigInput[K]
  ) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  // 添加域名
  const addDomain = () => {
    if (newDomain && !formData.allowedDomains.includes(newDomain)) {
      setFormData(prev => ({
        ...prev,
        allowedDomains: [...prev.allowedDomains, newDomain]
      }))
      setNewDomain('')
    }
  }

  // 移除域名
  const removeDomain = (domain: string) => {
    setFormData(prev => ({
      ...prev,
      allowedDomains: prev.allowedDomains.filter(d => d !== domain)
    }))
  }

  // 添加推荐问题
  const addQuestion = () => {
    if (newQuestion && !formData.recommendedQuestions?.includes(newQuestion)) {
      setFormData(prev => ({
        ...prev,
        recommendedQuestions: [...(prev.recommendedQuestions || []), newQuestion]
      }))
      setNewQuestion('')
    }
  }

  // 移除推荐问题
  const removeQuestion = (question: string) => {
    setFormData(prev => ({
      ...prev,
      recommendedQuestions: prev.recommendedQuestions?.filter(q => q !== question) || []
    }))
  }

  // 打开创建/编辑对话框
  const openDialog = (app?: AppConfigOutput) => {
    if (app) {
      setSelectedApp(app)
      setFormData({
        appId: app.appId,
        name: app.name,
        organizationName: app.organizationName,
        repositoryName: app.repositoryName,
        description: app.description || '',
        allowedDomains: app.allowedDomains || [],
        enableDomainValidation: app.enableDomainValidation || false,
        prompt: app.prompt || '',
        introduction: app.introduction || '',
        model: app.model || 'gpt-3.5-turbo',
        recommendedQuestions: app.recommendedQuestions || [],
        mcps: app.mcps || []
      })
    } else {
      setSelectedApp(null)
      setFormData({
        appId: '',
        name: '',
        organizationName: '',
        repositoryName: '',
        description: '',
        allowedDomains: [],
        enableDomainValidation: false,
        prompt: '',
        introduction: '',
        model: 'gpt-3.5-turbo',
        recommendedQuestions: [],
        mcps: []
      })
      generateAppId()
    }
    setDialogOpen(true)
  }

  // 保存应用
  const handleSave = async () => {
    try {
      if (selectedApp) {
        await appConfigService.updateAppConfig(selectedApp.appId, formData)
        toast({
          title: '更新成功',
          description: '应用配置已更新',
        })
      } else {
        await appConfigService.createAppConfig(formData)
        toast({
          title: '创建成功',
          description: '应用已创建',
        })
      }
      setDialogOpen(false)
      await loadApps()
    } catch (error) {
      const message = getErrorMessage(error, '保存应用配置时出错')
      toast({
        title: '操作失败',
        description: message,
        variant: 'destructive',
      })
    }
  }

  // 删除应用
  const handleDelete = async () => {
    if (!selectedApp) return

    try {
      await appConfigService.deleteAppConfig(selectedApp.appId)
      toast({
        title: '删除成功',
        description: '应用已删除',
      })
      setDeleteDialogOpen(false)
      await loadApps()
    } catch (error) {
      const message = getErrorMessage(error, '删除应用时出错')
      toast({
        title: '删除失败',
        description: message,
        variant: 'destructive',
      })
    }
  }

  // 切换应用启用状态
  const toggleAppStatus = async (appId: string) => {
    try {
      await appConfigService.toggleAppConfig(appId)
      await loadApps()
      toast({
        title: '状态已更新',
        description: '应用状态已切换',
      })
    } catch (error) {
      const message = getErrorMessage(error, '切换状态时出错')
      toast({
        title: '操作失败',
        description: message,
        variant: 'destructive',
      })
    }
  }

  // 复制应用ID
  const copyAppId = (appId: string) => {
    navigator.clipboard.writeText(appId)
    toast({
      title: '复制成功',
      description: '应用ID已复制到剪贴板',
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">我的应用</h3>
          <p className="text-sm text-muted-foreground">
            管理您创建的应用配置
          </p>
        </div>
        <Button onClick={() => openDialog()}>
          <Plus className="h-4 w-4 mr-2" />
          创建应用
        </Button>
      </div>

      {/* 应用列表 */}
      {apps.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="flex flex-col items-center space-y-4">
            <Settings className="h-12 w-12 text-muted-foreground" />
            <div>
              <h3 className="text-lg font-semibold">暂无应用</h3>
              <p className="text-sm text-muted-foreground mt-1">
                点击"创建应用"按钮创建您的第一个应用
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {apps.map((app) => (
            <Card key={app.appId} className="relative">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-base">{app.name}</CardTitle>
                    <CardDescription className="text-xs">
                      {app.organizationName}/{app.repositoryName}
                    </CardDescription>
                  </div>
                  <Badge variant={app.isEnabled ? 'default' : 'secondary'}>
                    {app.isEnabled ? '启用' : '禁用'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center space-x-2 text-sm">
                  <Key className="h-4 w-4 text-muted-foreground" />
                  <code className="flex-1 text-xs bg-muted px-2 py-1 rounded">
                    {app.appId}
                  </code>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyAppId(app.appId)}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>

                {app.enableDomainValidation && (
                  <div className="flex items-center space-x-2 text-sm">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">
                      {app.allowedDomains.length} 个允许的域名
                    </span>
                  </div>
                )}

                {app.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {app.description}
                  </p>
                )}

                {app.lastUsedAt && (
                  <p className="text-xs text-muted-foreground">
                    最后使用: {new Date(app.lastUsedAt).toLocaleDateString('zh-CN')}
                  </p>
                )}
              </CardContent>
              <CardFooter className="flex justify-between">
                <div className="flex space-x-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openDialog(app)}
                  >
                    <Edit className="h-3 w-3 mr-1" />
                    编辑
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSelectedApp(app)
                      setDeleteDialogOpen(true)
                    }}
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    删除
                  </Button>
                </div>
                <Switch
                  checked={app.isEnabled}
                  onCheckedChange={() => toggleAppStatus(app.appId)}
                />
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* 创建/编辑对话框 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedApp ? '编辑应用' : '创建新应用'}
            </DialogTitle>
            <DialogDescription>
              配置应用的基本信息和访问权限
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* 基础信息 */}
            <div className="space-y-2">
              <Label htmlFor="appId">应用ID</Label>
              <div className="flex space-x-2">
                <Input
                  id="appId"
                  value={formData.appId}
                  onChange={(e) => handleInputChange('appId', e.target.value)}
                  disabled={!!selectedApp}
                  placeholder="应用唯一标识"
                />
                {!selectedApp && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={generateAppId}
                  >
                    生成ID
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">应用名称</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="输入应用名称"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="organization">组织名称</Label>
                <Input
                  id="organization"
                  value={formData.organizationName}
                  onChange={(e) => handleInputChange('organizationName', e.target.value)}
                  placeholder="输入组织名称"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="repository">仓库名称</Label>
                <Input
                  id="repository"
                  value={formData.repositoryName}
                  onChange={(e) => handleInputChange('repositoryName', e.target.value)}
                  placeholder="输入仓库名称"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">应用描述</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="描述应用的用途..."
                rows={3}
              />
            </div>

            {/* AI配置 */}
            <div className="space-y-2">
              <Label htmlFor="model">AI模型</Label>
              <Select
                value={formData.model}
                onValueChange={(value) => handleInputChange('model', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择AI模型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
                  <SelectItem value="gpt-4">GPT-4</SelectItem>
                  <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                  <SelectItem value="claude-3">Claude 3</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="prompt">系统提示词</Label>
              <Textarea
                id="prompt"
                value={formData.prompt}
                onChange={(e) => handleInputChange('prompt', e.target.value)}
                placeholder="设置AI助手的系统提示词..."
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="introduction">开场白</Label>
              <Textarea
                id="introduction"
                value={formData.introduction}
                onChange={(e) => handleInputChange('introduction', e.target.value)}
                placeholder="AI助手的开场白..."
                rows={3}
              />
            </div>

            {/* 推荐问题 */}
            <div className="space-y-2">
              <Label>推荐问题</Label>
              <div className="flex space-x-2">
                <Input
                  value={newQuestion}
                  onChange={(e) => setNewQuestion(e.target.value)}
                  placeholder="添加推荐问题"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addQuestion())}
                />
                <Button type="button" variant="outline" onClick={addQuestion}>
                  添加
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.recommendedQuestions?.map((question, index) => (
                  <Badge key={index} variant="secondary">
                    {question}
                    <button
                      className="ml-2 text-xs"
                      onClick={() => removeQuestion(question)}
                    >
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
            </div>

            {/* 域名验证 */}
            <div className="space-y-4 p-4 border rounded-lg">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>域名验证</Label>
                  <p className="text-sm text-muted-foreground">
                    启用后，只有指定域名可以使用此应用
                  </p>
                </div>
                <Switch
                  checked={formData.enableDomainValidation}
                  onCheckedChange={(checked) => handleInputChange('enableDomainValidation', checked)}
                />
              </div>

              {formData.enableDomainValidation && (
                <div className="space-y-2">
                  <div className="flex space-x-2">
                    <Input
                      value={newDomain}
                      onChange={(e) => setNewDomain(e.target.value)}
                      placeholder="example.com"
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addDomain())}
                    />
                    <Button type="button" variant="outline" onClick={addDomain}>
                      添加域名
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {formData.allowedDomains.map((domain, index) => (
                      <Badge key={index} variant="secondary">
                        {domain}
                        <button
                          className="ml-2 text-xs"
                          onClick={() => removeDomain(domain)}
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSave}>
              {selectedApp ? '保存更改' : '创建应用'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              您确定要删除应用 "{selectedApp?.name}" 吗？此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
