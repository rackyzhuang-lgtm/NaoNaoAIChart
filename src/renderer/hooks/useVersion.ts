import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import platform from '../platform'

function getInitialTime() {
  let initialTime = parseInt(localStorage.getItem('initial-time') || '')
  if (!initialTime) {
    initialTime = Date.now()
    localStorage.setItem('initial-time', `${initialTime}`)
  }

  return initialTime
}

export function isFirstDay(): boolean {
  const initialTime = getInitialTime()
  const today = dayjs()
  const installDay = dayjs(initialTime)

  // Compare only the date part (year, month, day) in user's local timezone
  // This ensures the comparison is based on the user's current timezone,
  // which is more intuitive for the user experience
  return today.isSame(installDay, 'day')
}

export default function useVersion() {
  const [version, _setVersion] = useState('')
  const isExceeded = false
  useEffect(() => {
    const handler = async () => {
      const version = await platform.getVersion()
      _setVersion(version)
    }
    void handler()
  }, [])

  // True when all async data needed to evaluate isExceeded has loaded.
  // On non-store platforms this is always true (no defense to evaluate).
  // On store platforms we must wait for both version AND remoteConfig.current_version
  // before the guide-navigation guard in __root.tsx can make a reliable decision.
  const isExceededResolved = true

  return {
    version,
    versionLoaded: !!version,
    isExceeded,
    isExceededResolved,
    needCheckUpdate: false,
  }
}
