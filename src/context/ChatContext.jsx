import { createContext, useContext, useState } from 'react'

const ChatContext = createContext(null)

export function ChatProvider({ children }) {
  const [chatOpen, setChatOpen] = useState(false)
  const [openWithUser, setOpenWithUser] = useState(null)

  const openChat = () => {
    setOpenWithUser(null)
    setChatOpen(true)
  }

  const openChatWith = (id, full_name) => {
    setOpenWithUser(id ? { id, full_name: full_name || 'Usuario' } : null)
    setChatOpen(true)
  }

  const closeChat = () => {
    setChatOpen(false)
    setOpenWithUser(null)
  }

  const clearOpenWithUser = () => setOpenWithUser(null)

  return (
    <ChatContext.Provider value={{ chatOpen, openChat, openChatWith, closeChat, openWithUser, clearOpenWithUser }}>
      {children}
    </ChatContext.Provider>
  )
}

export function useChat() {
  const ctx = useContext(ChatContext)
  return ctx
}
