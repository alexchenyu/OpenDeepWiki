// 仓库详情状态管理Store

import { create } from 'zustand'
import { warehouseService } from '@/services/warehouse.service'
import type { DocumentNode } from '@/components/repository/DocumentTree'
import i18n from '@/i18n/index'

// 监听语言变化事件
i18n.on('languageChanged', (lng) => {
  // 当语言变化时，重新获取文档目录
  const store = useRepositoryDetailStore.getState()
  if (store.owner && store.name) {
    store.fetchDocumentCatalog()
  }
})

interface RepositoryInfo {
  id: string
  organizationName: string
  name: string
  description?: string
  address: string
  branch: string
  status: any
  createdAt: string
  updatedAt?: string
  isRecommended?: boolean
  error?: string
}

interface RepositoryDetailState {
  // 仓库基本信息
  repository: RepositoryInfo | null
  owner: string
  name: string

  // 分支相关
  branches: string[]
  selectedBranch: string
  defaultBranch: string
  loadingBranches: boolean

  // 文档树相关
  documentNodes: DocumentNode[]
  selectedNode: DocumentNode | null
  loadingDocuments: boolean

  // 文档内容
  documentContent: string
  loadingContent: boolean

  // UI状态
  sidebarOpen: boolean
  mobileMenuOpen: boolean

  // 错误状态
  error: string | null

  // Actions
  setRepository: (owner: string, name: string) => void
  fetchBranches: () => Promise<void>
  fetchDocumentCatalog: (branch?: string) => Promise<void>
  fetchDocumentContent: (path: string) => Promise<void>
  selectBranch: (branch: string) => Promise<void>
  selectNode: (node: DocumentNode) => void
  setSidebarOpen: (open: boolean) => void
  setMobileMenuOpen: (open: boolean) => void
  clearError: () => void
  reset: () => void
}

const initialState = {
  repository: null,
  owner: '',
  name: '',
  branches: [],
  selectedBranch: 'main',
  defaultBranch: 'main',
  loadingBranches: false,
  documentNodes: [],
  selectedNode: null,
  loadingDocuments: false,
  documentContent: '',
  loadingContent: false,
  sidebarOpen: true,
  mobileMenuOpen: false,
  error: null,
}

export const useRepositoryDetailStore = create<RepositoryDetailState>((set, get) => ({
  ...initialState,

  setRepository: (owner: string, name: string) => {
    set({ owner, name })
  },

  fetchBranches: async () => {
    const { owner, name } = get()
    if (!owner || !name) return

    set({ loadingBranches: true, error: null })

    try {
      // 获取文档目录来获取分支列表
      const response = await warehouseService.getDocumentCatalog(owner, name)

      if (response) {
        // 从DocumentCatalogs接口提取分支列表
        const branchList = response.branchs || response.branchs || []
        if (branchList.length > 0) {
          // 使用返回的分支列表
          const defaultBranch = branchList[0]
          set({
            branches: branchList,
            selectedBranch: defaultBranch,
            defaultBranch: defaultBranch,
            loadingBranches: false,
            error: null,
          })

          // 获取分支后立即获取文档目录
          get().fetchDocumentCatalog(defaultBranch)
        } else {
          // 使用默认分支
          set({
            branches: ['main', 'master'],
            selectedBranch: 'main',
            defaultBranch: 'main',
            loadingBranches: false,
            error: null,
          })

          // 获取默认分支的文档目录
          get().fetchDocumentCatalog('main')
        }
      } else {
        // 如果没有响应，使用默认值
        set({
          branches: ['main', 'master'],
          selectedBranch: 'main',
          defaultBranch: 'main',
          loadingBranches: false,
          error: null,
        })

        // 尝试获取默认分支的文档目录
        get().fetchDocumentCatalog('main')
      }
    } catch (error: any) {
      console.error('Failed to fetch branches:', error)
      set({
        branches: ['main', 'master'],
        selectedBranch: 'main',
        defaultBranch: 'main',
        loadingBranches: false,
        error: error?.message || 'Failed to fetch branches',
      })
    }
  },

  fetchDocumentCatalog: async (branch?: string) => {
    const { owner, name, selectedBranch } = get()
    if (!owner || !name) return

    const targetBranch = branch || selectedBranch

    set({ loadingDocuments: true })

    try {
      // 传递当前语言代码
      const response = await warehouseService.getDocumentCatalog(owner, name, targetBranch, i18n.language)

      if (response && response.items) {
        const nodes = convertToTreeNodes(response.items)
        set({
          documentNodes: nodes,
          loadingDocuments: false,
          error: null // 成功时清除错误状态
        })

        // 自动选择第一个文件节点
        if (nodes.length > 0) {
          const firstFileNode = findFirstFileNode(nodes)
          if (firstFileNode) {
            get().selectNode(firstFileNode)
          }
        }
      } else {
        set({
          documentNodes: [],
          loadingDocuments: false,
          error: null // 成功时清除错误状态
        })
      }
    } catch (error: any) {
      console.error('Failed to fetch document catalog:', error)
      set({
        documentNodes: [],
        loadingDocuments: false,
        error: error?.message || 'Failed to fetch document catalog'
      })
    }
  },

  fetchDocumentContent: async (path: string) => {
    const { owner, name, selectedBranch } = get()
    if (!owner || !name || !path) return

    set({ loadingContent: true })

    try {
      // 传递当前语言代码
      const response = await warehouseService.getDocumentById(owner, name, path, selectedBranch, i18n.language)
      set({
        documentContent: response?.content || '',
        loadingContent: false,
        error: null // 成功时清除错误状态
      })
    } catch (error: any) {
      console.error('Failed to fetch document content:', error)
      set({
        documentContent: '',
        loadingContent: false,
        error: error?.message || 'Failed to fetch document content',
      })
    }
  },

  selectBranch: async (branch: string) => {
    set({ selectedBranch: branch, error: null }) // 切换分支时清除错误状态
    await get().fetchDocumentCatalog(branch)
  },

  selectNode: (node: DocumentNode) => {
    set({ selectedNode: node, error: null }) // 选择节点时清除错误状态
    if (node.type === 'file') {
      get().fetchDocumentContent(node.path)
    }
  },

  setSidebarOpen: (open: boolean) => {
    set({ sidebarOpen: open })
  },

  setMobileMenuOpen: (open: boolean) => {
    set({ mobileMenuOpen: open })
  },

  clearError: () => {
    set({ error: null })
  },

  reset: () => {
    set(initialState)
  },
}))

// 辅助函数：转换文档数据为树形节点
function convertToTreeNodes(items: any[]): DocumentNode[] {
  if (!items || !Array.isArray(items)) return []

  // 递归转换节点
  const convertNode = (item: any): DocumentNode => {
    const hasChildren = item.children && item.children.length > 0

    return {
      id: item.key || item.id || Math.random().toString(),
      name: item.label || item.name || item.title || 'Untitled',
      type: hasChildren ? 'folder' : 'file',
      path: item.url || item.path || '',
      description: item.description,
      lastUpdate: item.lastUpdate,
      children: hasChildren ? item.children.map(convertNode) : []
    }
  }

  // 转换所有根节点
  return items.map(convertNode)
}

// 辅助函数：查找第一个文件节点
function findFirstFileNode(nodes: DocumentNode[]): DocumentNode | null {
  for (const node of nodes) {
    return node
  }
  return null
}

export default useRepositoryDetailStore