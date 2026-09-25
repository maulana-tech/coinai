import { useLayoutEffect } from 'react'

// pages with their own scroll container lock the window so no page scrollbar shows
export function useScrollLock(): void {
  useLayoutEffect(() => {
    document.documentElement.classList.add('overflow-hidden')
    document.body.classList.add('overflow-hidden')
    return () => {
      document.documentElement.classList.remove('overflow-hidden')
      document.body.classList.remove('overflow-hidden')
    }
  }, [])
}
