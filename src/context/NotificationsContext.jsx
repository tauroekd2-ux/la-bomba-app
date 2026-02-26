import { createContext, useContext, useState, useCallback } from 'react'

const MAX_LIST = 50

const NotificationsContext = createContext(null)

export function NotificationsProvider({ children }) {
  const [notification, setNotification] = useState(null)
  const [list, setList] = useState([])

  const clearNotification = useCallback(() => {
    setNotification(null)
  }, [])

  const setPendingNotification = useCallback((data) => {
    setNotification(data)
    setList((prev) => [
      { id: Date.now(), ...data, at: new Date().toISOString() },
      ...prev,
    ].slice(0, MAX_LIST))
  }, [])

  const removeFromList = useCallback((id) => {
    setList((prev) => prev.filter((n) => n.id !== id))
  }, [])

  const clearList = useCallback(() => {
    setList([])
  }, [])

  return (
    <NotificationsContext.Provider
      value={{
        notification,
        list,
        setPendingNotification,
        clearNotification,
        removeFromList,
        clearList,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  )
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext)
  if (!ctx) throw new Error('useNotifications must be used within NotificationsProvider')
  return ctx
}
