// 仓库详情页面 - 概览

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useRepositoryDetailStore } from '@/stores/repositoryDetail.store'
import { WarehouseStatus } from '@/types/repository'
import {
  GitBranch,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Loader2,
  Copy,
  CheckCircle2
} from 'lucide-react'

const RepositoryDetailPage = () => {
  const { t } = useTranslation()
  const { owner, name } = useParams<{ owner: string; name: string }>()
  const [copied, setCopied] = useState(false)

  // 使用store
  const {
    repository,
    error,
    setRepository,
    fetchDocumentCatalog,
  } = useRepositoryDetailStore()

  const [loading, setLoading] = useState(true)

  // 初始化数据
  const initializeData = useCallback(async () => {
    if (!owner || !name) return

    setLoading(true)

    try {
      // 设置仓库信息
      setRepository(owner, name)

      // 获取文档目录（这会同时获取分支列表）
      await fetchDocumentCatalog()
    } finally {
      setLoading(false)
    }
  }, [fetchDocumentCatalog, name, owner, setRepository])

  useEffect(() => {
    initializeData()
  }, [initializeData])

  // 复制Git地址
  const handleCopyAddress = () => {
    if (repository?.address) {
      navigator.clipboard.writeText(repository.address)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // 获取状态颜色
  const getStatusVariant = (status: WarehouseStatus): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case WarehouseStatus.Completed:
        return 'default'
      case WarehouseStatus.Processing:
        return 'secondary'
      case WarehouseStatus.Failed:
        return 'destructive'
      default:
        return 'outline'
    }
  }

  // 获取状态文本
  const getStatusText = (status: WarehouseStatus) => {
    switch (status) {
      case WarehouseStatus.Completed:
        return t('home.repository_card.status.completed')
      case WarehouseStatus.Processing:
        return t('home.repository_card.status.processing')
      case WarehouseStatus.Failed:
        return t('home.repository_card.status.failed')
      case WarehouseStatus.Pending:
        return t('home.repository_card.status.pending')
      default:
        return status
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-3 text-muted-foreground">{t('common.loading')}</span>
      </div>
    )
  }

  if (error || !repository) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error || t('repository.detail.notFound')}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {repository.name}
          </h1>
          {repository.description && (
            <p className="text-muted-foreground mt-2">
              {repository.description}
            </p>
          )}
          <div className="flex items-center gap-2 mt-3">
            {repository.isRecommended && (
              <Badge variant="secondary">
                {t('home.repository_card.recommended')}
              </Badge>
            )}
            <Badge variant={getStatusVariant(repository.status)}>
              {getStatusText(repository.status)}
            </Badge>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={initializeData}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          {t('common.refresh')}
        </Button>
      </div>

      {/* 仓库错误信息 */}
      {repository.error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {repository.error}
          </AlertDescription>
        </Alert>
      )}

      {/* 信息卡片 */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* 基本信息 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('repository.detail.basicInfo')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">
                {t('repository.detail.organization')}
              </p>
              <p className="text-sm">{repository.organizationName}</p>
            </div>

            <Separator />

            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">
                {t('repository.detail.repositoryName')}
              </p>
              <p className="text-sm">{repository.name}</p>
            </div>

            <Separator />

            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">
                {t('repository.detail.createdAt')}
              </p>
              <p className="text-sm">
                {new Date(repository.createdAt).toLocaleString()}
              </p>
            </div>

            {repository.updatedAt && (
              <>
                <Separator />
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">
                    {t('repository.detail.updatedAt')}
                  </p>
                  <p className="text-sm">
                    {new Date(repository.updatedAt).toLocaleString()}
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Git 信息 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('repository.detail.gitInfo')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">
                {t('repository.detail.repositoryUrl')}
              </p>
              <div className="flex items-center gap-2">
                <a
                  href={repository.address}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline flex-1 truncate"
                >
                  {repository.address}
                </a>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={handleCopyAddress}
                >
                  {copied ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => window.open(repository.address, '_blank')}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <Separator />

            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">
                {t('repository.detail.branch')}
              </p>
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm">{repository.branch}</p>
              </div>
            </div>

            <Separator />

            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">
                {t('repository.detail.cloneCommand')}
              </p>
              <div className="bg-muted rounded-md p-2 font-mono text-xs">
                git clone -b {repository.branch} {repository.address}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 统计信息 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('repository.detail.statistics')}</CardTitle>
          <CardDescription>
            {t('repository.detail.statisticsDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 rounded-lg bg-muted/50">
              <p className="text-2xl font-bold">0</p>
              <p className="text-sm text-muted-foreground">{t('repository.detail.documents')}</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-muted/50">
              <p className="text-2xl font-bold">0</p>
              <p className="text-sm text-muted-foreground">{t('repository.detail.commits')}</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-muted/50">
              <p className="text-2xl font-bold">0</p>
              <p className="text-sm text-muted-foreground">{t('repository.detail.contributors')}</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-muted/50">
              <p className="text-2xl font-bold">0</p>
              <p className="text-sm text-muted-foreground">{t('repository.detail.stars')}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default RepositoryDetailPage
