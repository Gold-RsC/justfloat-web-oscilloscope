import { ref, watch } from 'vue'
import type { AppConfig, ExportSettings } from '@/types'
import { DEFAULT_CONFIG, DEFAULT_EXPORT_SETTINGS } from '@/types'

const STORAGE_KEY = 'justfloat-oscilloscope-config'
const EXPORT_STORAGE_KEY = 'justfloat-oscilloscope-export-settings'

export function useStorage() {
  // 加载配置
  const loadConfig = (): AppConfig => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const config = JSON.parse(stored) as AppConfig
        return {
          ...DEFAULT_CONFIG,
          ...config,
          // 确保 bufferSize 不小于最小值
          bufferSize: Math.max(1000, config.bufferSize || DEFAULT_CONFIG.bufferSize)
        }
      }
    } catch (error) {
      console.error('加载配置失败:', error)
    }
    return { ...DEFAULT_CONFIG }
  }

  // 保存配置
  const saveConfig = (config: AppConfig) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
    } catch (error) {
      console.error('保存配置失败:', error)
    }
  }

  // 清除配置
  const clearConfig = () => {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch (error) {
      console.error('清除配置失败:', error)
    }
  }

  // 加载导出设置
  const loadExportSettings = (): ExportSettings => {
    try {
      const stored = localStorage.getItem(EXPORT_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<ExportSettings>
        return {
          ...DEFAULT_EXPORT_SETTINGS,
          ...parsed,
          fileName: typeof parsed.fileName === 'string' ? parsed.fileName : DEFAULT_EXPORT_SETTINGS.fileName,
          format: parsed.format === 'csv' ? 'csv' : 'json',
          includeConfig: typeof parsed.includeConfig === 'boolean' ? parsed.includeConfig : true,
          includeTimeColumn: typeof parsed.includeTimeColumn === 'boolean' ? parsed.includeTimeColumn : true,
          precision: Math.max(0, Math.min(10, Math.round(parsed.precision ?? DEFAULT_EXPORT_SETTINGS.precision)))
        }
      }
    } catch (error) {
      console.error('加载导出设置失败:', error)
    }
    return { ...DEFAULT_EXPORT_SETTINGS }
  }

  // 保存导出设置
  const saveExportSettings = (settings: ExportSettings) => {
    try {
      localStorage.setItem(EXPORT_STORAGE_KEY, JSON.stringify(settings))
    } catch (error) {
      console.error('保存导出设置失败:', error)
    }
  }

  // 创建响应式配置
  const createReactiveConfig = () => {
    const config = ref(loadConfig())

    // 监听变化自动保存
    watch(config, (newConfig) => {
      saveConfig(newConfig)
    }, { deep: true })

    return config
  }

  return {
    loadConfig,
    saveConfig,
    clearConfig,
    loadExportSettings,
    saveExportSettings,
    createReactiveConfig
  }
}
