// Repository types based on backend DTOs

export enum WarehouseStatus {
  Pending = 0,
  Processing = 1,
  Completed = 2,
  Canceled = 3,
  Unauthorized = 4,
  Failed = 99
}
export interface RepositoryInfo {
  id: string
  organizationName: string
  name: string
  description: string
  address: string
  type?: string
  branch?: string
  status: WarehouseStatus
  error?: string
  prompt?: string
  version?: string
  isEmbedded: boolean
  isRecommended: boolean
  createdAt: string
}

export interface CreateGitRepositoryDto {
  address: string
  branch: string
  gitUserName?: string
  gitPassword?: string
  email?: string
}

export interface UpdateRepositoryDto {
  description?: string
  isRecommended?: boolean
  prompt?: string
}

export interface PageDto<T> {
  total: number
  items: T[]
}

export interface RepositoryListParams {
  page: number
  pageSize: number
  keyword?: string
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

export interface ResultDto<T> {
  code: number
  message?: string
  data?: T
  success?: boolean
}

export interface WarehouseListResponse {
  total: number
  items: RepositoryInfo[]
}

export interface DocumentCatalogItem {
  key?: string
  id?: string
  label?: string
  name?: string
  title?: string
  url?: string
  path?: string
  description?: string
  lastUpdate?: string
  children?: DocumentCatalogItem[]
}

export interface DocumentCatalogResponse {
  items: DocumentCatalogItem[]
  branchs?: string[]
  branches?: string[]
  lastUpdate?: string
  description?: string
  progress?: number
  git?: string
  warehouseId?: string
  likeCount?: number
  status?: WarehouseStatus
  commentCount?: number
  supportedLanguages?: string[]
  hasI18nSupport?: boolean
  currentLanguage?: string
}

export interface DocumentDetailResponse {
  content: string
  title?: string
  description?: string
  path?: string
  languageCode?: string
  lastUpdate?: string
  address?: string
  branch?: string
  documentCatalogId?: string
  currentLanguage?: string
  fileSource?: DocumentFileSource[]
  [key: string]: unknown
}

export interface DocumentFileSource {
  id?: string
  name?: string
  address?: string
  url?: string
  createdAt?: string
  commitId?: string
  commitMessage?: string
}

export interface BranchListResponse {
  success: boolean
  data: string[]
  defaultBranch?: string
  error?: string
}

export interface LastWarehouseSummary {
  name: string
  address: string
  description?: string
  version?: string
  status?: WarehouseStatus
  error?: string
}

export interface DocumentCommitRecord {
  commitId: string
  commitMessage: string
  title: string
  author?: string
  lastUpdate: string
  warehouseId: string
  createdAt?: string
}

export interface MiniMapResult {
  title: string
  url: string
  nodes: MiniMapResult[]
}

export interface RepositoryFileNode {
  title: string
  key: string
  isLeaf?: boolean
  children?: RepositoryFileNode[]
}
