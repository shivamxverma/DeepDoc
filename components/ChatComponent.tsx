"use client"
import React from "react"
import { Input } from "./ui/input"
import { Button } from "./ui/button"
import { ArrowUp } from "lucide-react"
import MessageList from "./MessageList"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import axios from "axios"
import type { Message } from "ai"

type Props = { chatId: number; pdfName?: string }

const SUGGESTIONS = [
  "Summarize this document",
  "What are the key findings?",
  "List the main sections",
]

const ChatComponent = ({ chatId, pdfName }: Props) => {
  const [input, setInput] = React.useState("")
  const queryClient = useQueryClient()

  const { data: messages, isLoading } = useQuery({
    queryKey: ["chat", chatId],
    queryFn: async () => {
      const response = await axios.post<Message[]>("/api/get-messages", {
        chatId,
      })
      return response.data
    },
  })

  const mutation = useMutation({
    mutationFn: async (message: string) => {
      const response = await axios.post("/api/chat", { chatId, message })
      return response.data
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["chat", chatId], (oldData: Message[] | undefined) => {
        return oldData ? [...oldData, { role: "user", content: input }, data] : [{ role: "user", content: input }, data]
      })
      setInput("")
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    mutation.mutate(input)
  }

  // Auto-scroll whenever messages change or while a response is streaming
  React.useEffect(() => {
    const messageContainer = document.getElementById("message-list")
    if (!messageContainer) return

    // wait for DOM to update then scroll
    requestAnimationFrame(() => {
      messageContainer.scrollTo({
        top: messageContainer.scrollHeight,
        behavior: "smooth",
      })
    })
  }, [messages, mutation.isPending])

  const isEmpty = !isLoading && (messages?.length ?? 0) === 0 && !mutation.isPending

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="hairline flex h-12 shrink-0 items-center justify-between gap-3 border-b px-4">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-slate-900">{pdfName ?? "Chat with your PDF"}</h3>
        </div>
        <span className="shrink-0 rounded-full border border-slate-900/[.08] bg-white/70 px-2 py-0.5 text-[11px] tabular-nums text-slate-500">
          #{chatId}
        </span>
      </div>

      <div id="message-list" className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        {isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <div>
              <p className="text-sm font-medium text-slate-800">Ask anything about this document</p>
              <p className="mt-1 text-xs text-slate-500">Answers are based on the PDF’s contents.</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setInput(suggestion)}
                  className="rounded-full border border-slate-900/[.08] bg-white/70 px-3 py-1.5 text-xs text-slate-700 transition-colors hover:border-indigo-500/30 hover:bg-indigo-50 hover:text-indigo-700"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <MessageList messages={messages || []} isLoading={isLoading || mutation.isPending} />
        )}
      </div>

      <form onSubmit={handleSubmit} className="hairline shrink-0 border-t bg-white/50 p-3">
        <div className="relative">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question…"
            className="h-11 pr-12"
          />
          <Button
            type="submit"
            size="icon"
            aria-label="Send message"
            className="absolute right-1.5 top-1/2 size-8 -translate-y-1/2"
            disabled={mutation.isPending || !input.trim()}
          >
            <ArrowUp />
          </Button>
        </div>
      </form>
    </div>
  )
}

export default ChatComponent
