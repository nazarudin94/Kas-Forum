import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'

export function useResource<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(path !== null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (showLoading: boolean) => {
    if (path === null) return
    if (showLoading) {
      setLoading(true)
      setError(null)
    }
    try {
      setData(await api<T>(path))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Data tidak dapat dimuat.')
    } finally {
      setLoading(false)
    }
  }, [path])

  // Synchronize this resource with its API endpoint on mount/path changes.
  // oxlint-disable react/set-state-in-effect
  useEffect(() => {
    if (path !== null) void load(false)
  }, [load, path])
  // oxlint-enable react/set-state-in-effect

  const reload = useCallback(() => path === null ? Promise.resolve() : load(true), [load, path])

  return { data, loading, error, reload }
}
