import ChatComponent from "../../../components/ChatComponent"
import ChatSideBar from "../../../components/ChatSideBar"
import PDFViewer from "../../../components/PDFViewer"
import Backdrop from "../../../components/Backdrop"
import { db } from "../../../lib/db"
import { chats } from "../../../lib/db/schema"
import { eq } from "drizzle-orm"
import { FileText } from "lucide-react"
import { redirect as nextRedirect } from "next/navigation"

type Params = Promise<{ id: string }>

const ChatPage = async ({ params }: { params: Params }) => {
  const { id } = await params

  const _chats = await db.select().from(chats)
  if (_chats.length === 0) nextRedirect("/")
  if (!_chats.find((chat) => chat.id === Number(id))) {
    nextRedirect("/")
  }
  const currentChat = await db
    .select()
    .from(chats)
    .where(eq(chats.id, Number(id)))

  const pdfName = currentChat[0]?.pdfName || "Document"

  return (
    <div className="relative h-screen overflow-hidden text-slate-900">
      <Backdrop />
      <div className="flex h-full gap-3 p-3">
        <aside className="glass hidden w-64 shrink-0 overflow-hidden rounded-xl md:block">
          <ChatSideBar chats={_chats} chatId={Number.parseInt(id)} />
        </aside>

        <section className="glass hidden min-w-0 flex-[5] flex-col overflow-hidden rounded-xl lg:flex">
          <div className="hairline flex h-12 shrink-0 items-center gap-2 border-b px-4">
            <FileText className="size-4 text-slate-400" />
            <span className="truncate text-sm font-medium text-slate-700">{pdfName}</span>
          </div>
          <div className="min-h-0 flex-1 bg-white">
            <PDFViewer pdf_url={currentChat[0]?.pdfUrl || ""} />
          </div>
        </section>

        <section className="glass flex min-w-0 flex-[3] flex-col overflow-hidden rounded-xl">
          <ChatComponent chatId={Number.parseInt(id)} pdfName={pdfName} />
        </section>
      </div>
    </div>
  )
}

export default ChatPage
