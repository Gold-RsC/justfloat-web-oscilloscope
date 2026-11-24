/**
 * 波形分析图表的配色
 *
 * 采用经过色觉无障碍校验的分类色板（蓝 / 橙），
 * 明暗两套颜色分别针对当前主题的图表表面色选取。
 */
export interface AnalysisPalette {
  primary: string
  secondary: string
  muted: string
  grid: string
  axis: string
  ink: string
  inkSecondary: string
  primaryFill: string
  secondaryFill: string
}

const LIGHT_PALETTE: AnalysisPalette = {
  primary: '#2a78d6',
  secondary: '#eb6834',
  muted: '#898781',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  ink: '#0b0b0b',
  inkSecondary: '#52514e',
  primaryFill: 'rgba(42, 120, 214, 0.12)',
  secondaryFill: 'rgba(235, 104, 52, 0.12)'
}

const DARK_PALETTE: AnalysisPalette = {
  primary: '#3987e5',
  secondary: '#d95926',
  muted: '#898781',
  grid: '#2c2c2a',
  axis: '#4b5563',
  ink: '#f0efec',
  inkSecondary: '#c3c2b7',
  primaryFill: 'rgba(57, 135, 229, 0.16)',
  secondaryFill: 'rgba(217, 89, 38, 0.16)'
}

export function getAnalysisPalette(isDark: boolean): AnalysisPalette {
  return isDark ? DARK_PALETTE : LIGHT_PALETTE
}
