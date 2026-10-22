import { createContext, useContext } from 'react'
import { translate, type Lang } from './i18n'

export type { Lang }

interface I18nValue {
  lang: Lang
  t: (key: string, params?: Record<string, string | number>) => string
}

export const I18nContext = createContext<I18nValue>({
  lang: 'zh',
  t: (key, params) => translate('zh', key, params)
})

export function useI18n(): I18nValue {
  return useContext(I18nContext)
}
