import ChatComponent from "../../../components/ChatComponent"
import ChatSideBar from "../../../components/ChatSideBar"
import PDFViewer from "../../../components/PDFViewer"
import { db } from "../../../lib/db"
import { chats } from "../../../lib/db/schema"
import { eq } from "drizzle-orm"
import { ScrollArea } from "../../../components/ui/scroll-area"
import { redirect as nextRedirect } from "next/navigation"

type Params = Promise<{ id: string }>

const ChatPage = async ({ params }: { params: Params }) => {
  const { id } = await params

  const _chats = await db.select().from(chats)
  if (!_chats) {
    return redirect("/")
  }
  if (!_chats.find((chat) => chat.id === Number(id))) {
    return redirect("/")
  }
  const currentChat = await db
    .select()
    .from(chats)
    .where(eq(chats.id, Number(id)))

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-900 to-gray-800 text-white">
      <div className="flex w-full h-screen overflow-hidden">
        <div className="flex-[1] max-w-xs bg-gray-800 border-r border-gray-700 transition-all duration-300 ease-in-out hover:max-w-sm">
          <ScrollArea className="h-full">
            <ChatSideBar chats={_chats} chatId={Number.parseInt(id)} />
          </ScrollArea>
        </div>
        <div className="flex-[5] p-4 bg-gray-900">
          <div className="h-full rounded-lg overflow-hidden shadow-lg transition-all duration-300 ease-in-out hover:shadow-2xl">
            <PDFViewer pdf_url={currentChat[0]?.pdfUrl || ""} />
          </div>
        </div>
        <div className="flex-[3] border-l border-gray-700 bg-gray-800">
          <ScrollArea className="h-full">
            <ChatComponent chatId={Number.parseInt(id)} />
          </ScrollArea>
        </div>
      </div>
    </div>
  )
}

export default ChatPage;
function redirect(url: string) {
  nextRedirect(url)
}
