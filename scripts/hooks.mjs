// خطاف حل الوحدات لأجل المحاكاة: (1) يوجّه "electron" إلى الـ stub،
// (2) يضيف امتداد .ts للاستيرادات النسبية بلا امتداد (نمط TypeScript).
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const stubUrl = new URL('./electron-stub.mjs', import.meta.url).href

export async function resolve(specifier, context, next) {
  if (specifier === 'electron') {
    return { url: stubUrl, shortCircuit: true }
  }
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    if (!/\.[a-zA-Z0-9]+$/.test(specifier) && context.parentURL) {
      try {
        const tsUrl = new URL(specifier + '.ts', context.parentURL).href
        if (existsSync(fileURLToPath(tsUrl))) {
          return { url: tsUrl, shortCircuit: true }
        }
      } catch { /* تجاهل */ }
    }
  }
  return next(specifier, context)
}
