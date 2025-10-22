// i18n 配置和初始化

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

// 导入语言资源
import enUS from './locales/en-US.json'
import zhCN from './locales/zh-CN.json'

const baseResources = {
  'en-US': {
    translation: enUS,
  },
  'zh-CN': {
    translation: zhCN,
  },
} satisfies Record<string, { translation: typeof enUS }>

const languageAliases: Record<string, keyof typeof baseResources> = {
  en: 'en-US',
  'en-US': 'en-US',
  zh: 'zh-CN',
  'zh-CN': 'zh-CN',
}

const resources = Object.entries(languageAliases).reduce<Record<string, { translation: typeof enUS }>>(
  (acc, [alias, target]) => {
    acc[alias] = baseResources[target]
    return acc
  },
  {}
)

i18n
  // 检测用户语言
  .use(LanguageDetector)
  // 传递 i18n 实例给 react-i18next
  .use(initReactI18next)
  // 初始化 i18next
  .init({
    resources,
    fallbackLng: 'zh-CN',
    debug: import.meta.env.DEV,

    // 语言检测选项
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
    },

    interpolation: {
      escapeValue: false, // React 已经默认转义了
    },

    // 支持的语言
    supportedLngs: Object.keys(languageAliases),
    nonExplicitSupportedLngs: true,

    // 命名空间
    ns: ['translation'],
    defaultNS: 'translation',
  })

// 暴露到全局对象，方便调试
if (typeof window !== 'undefined') {
  window.i18n = i18n
}

export default i18n

// 导出语言列表
export interface LanguageOption {
  code: string
  name: string
  flag: string
}

export const languages: LanguageOption[] = [
  {
    code: 'zh-CN',
    name: '中文(简体)',
    flag: '🇨🇳',
  },
  {
    code: 'en-US',
    name: 'English',
    flag: '🇺🇸',
  },
]

// 获取当前语言
export const getCurrentLanguage = () => i18n.language

// 切换语言
export const changeLanguage = (lng: string) => {
  return i18n.changeLanguage(lng)
}
