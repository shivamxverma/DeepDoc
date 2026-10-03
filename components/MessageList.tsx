import { cn } from "../lib/utils"
import type { Message } from "ai";
import { Loader2, Sparkles, User } from "lucide-react"

type Props = {
  isLoading: boolean
  messages: Message[]
}

const formatTime = (value: Message["createdAt"]) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

const Avatar = ({ isUser }: { isUser: boolean }) => (
  <span
    className={cn(
      "flex size-7 shrink-0 items-center justify-center rounded-md border",
      isUser ? "border-indigo-600/20 bg-indigo-50 text-indigo-600" : "border-slate-900/[.08] bg-white text-indigo-600"
    )}
  >
    {isUser ? <User className="size-3.5" /> : <Sparkles className="size-3.5" />}
  </span>
)

const MessageList = ({ messages, isLoading }: Props) => {
  if (isLoading && messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-5 animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {messages.map((message, index) => {
        const isUser = message.role === "user"
        const time = formatTime(message.createdAt)

        return (
          <div
            key={message.id ?? index}
            className={cn("flex items-start gap-2.5 animate-in fade-in slide-in-from-bottom-1 duration-200", isUser && "flex-row-reverse")}
          >
            <Avatar isUser={isUser} />
            <div className={cn("flex max-w-[85%] flex-col gap-1", isUser ? "items-end" : "items-start")}>
              <div
                className={cn(
                  "rounded-lg px-3.5 py-2.5 text-sm leading-relaxed",
                  isUser
                    ? "rounded-tr-sm bg-indigo-600 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.15),0_1px_2px_rgb(15_23_42/0.1)]"
                    : "rounded-tl-sm border border-slate-900/[.08] bg-white/80 text-slate-800 shadow-[0_1px_2px_rgb(15_23_42/0.04)]"
                )}
              >
                <div className="whitespace-pre-wrap break-words">{message.content}</div>
              </div>
              {time && <span className="px-1 text-[11px] tabular-nums text-slate-400">{time}</span>}
            </div>
          </div>
        )
      })}

      {isLoading && messages.length > 0 && (
        <div className="flex items-start gap-2.5">
          <Avatar isUser={false} />
          <div className="flex items-center gap-1 rounded-lg rounded-tl-sm border border-slate-900/[.08] bg-white/80 px-3.5 py-3.5" aria-label="Assistant is typing">
            {[0, 150, 300].map((delay) => (
              <span key={delay} className="size-1.5 animate-blink rounded-full bg-slate-400" style={{ animationDelay: `${delay}ms` }} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default MessageList
