import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'

export function useResource<T>(path: string) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (showLoading: boolean) => {
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
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => {
    void load(false)
  }, [load])

  const reload = useCallback(() => load(true), [load])

  return { data, loading, error, reload }
}
