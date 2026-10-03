import Link from "next/link"
import { FileText } from "lucide-react"

const Logo = () => (
  <Link href="/" className="flex items-center gap-2.5">
    <span className="glass flex size-8 items-center justify-center rounded-md">
      <FileText className="size-4 text-indigo-600" />
    </span>
    <span className="text-[15px] font-semibold tracking-tight text-slate-900">DeepDoc</span>
  </Link>
)

export default Logo
