import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatRelativeTime(value: string | null | undefined) {
  if (!value) return null

  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) return null

  const diffMs = Date.now() - timestamp
  if (diffMs < 0) return "방금 전"

  const minuteMs = 60 * 1000
  const hourMs = 60 * minuteMs
  const dayMs = 24 * hourMs
  const weekMs = 7 * dayMs
  const monthMs = 30 * dayMs
  const yearMs = 365 * dayMs

  if (diffMs < minuteMs) return "방금 전"
  if (diffMs < hourMs) return `${Math.floor(diffMs / minuteMs)}분 전`
  if (diffMs < dayMs) return `${Math.floor(diffMs / hourMs)}시간 전`
  if (diffMs < weekMs) return `${Math.floor(diffMs / dayMs)}일 전`
  if (diffMs < monthMs) return `${Math.floor(diffMs / weekMs)}주 전`
  if (diffMs < yearMs) return `${Math.floor(diffMs / monthMs)}달 전`
  return `${Math.floor(diffMs / yearMs)}년 전`
}
