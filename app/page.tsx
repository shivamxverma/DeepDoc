import { Button } from "../components/ui/button";
import Image from "next/image";
import { ArrowRight, FileText, Quote, Sparkles, Zap } from "lucide-react";
import UploadPDF from "../components/PDFUpload";
import Backdrop from "../components/Backdrop";
import Logo from "../components/Logo";

const FEATURES = [
  { icon: FileText, title: "Long documents", body: "Research papers, contracts and manuals with hundreds of pages." },
  { icon: Zap, title: "Fast answers", body: "Relevant passages are retrieved and answered in seconds." },
  { icon: Quote, title: "Grounded in the source", body: "Answers come from your PDF, not from guesswork." },
];

export default async function Home() {
  return (
    <main className="relative min-h-screen text-slate-900">
      <Backdrop />

      <nav className="glass-strong sticky top-0 z-30 !border-x-0 !border-t-0">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Logo />
          <a href="#upload">
            <Button variant="dark" size="sm">
              Upload a PDF <ArrowRight />
            </Button>
          </a>
        </div>
      </nav>

      <section className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-4 pb-16 pt-16 md:grid-cols-2 md:pt-24">
        <div>
          <div className="glass inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs text-slate-600">
            <Sparkles className="size-3.5 text-indigo-600" /> Faster multi-PDF processing
          </div>
          <h1 className="mt-5 text-4xl font-semibold leading-[1.05] tracking-tight md:text-6xl">
            Chat with{" "}
            <span className="bg-gradient-to-r from-indigo-600 to-sky-500 bg-clip-text text-transparent">any PDF</span>
          </h1>
          <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-slate-600">
            Ask questions, extract insights, and understand research in seconds. Upload a document and start the conversation.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <a href="#upload">
              <Button size="lg">
                Get started <ArrowRight />
              </Button>
            </a>
            <a href="#features">
              <Button size="lg" variant="glass">See how it works</Button>
            </a>
          </div>
        </div>

        <div className="relative hidden md:block">
          <div className="glass overflow-hidden rounded-xl">
            <div className="hairline flex items-center gap-1.5 border-b px-3 py-2.5">
              <span className="size-2.5 rounded-full bg-slate-900/10" />
              <span className="size-2.5 rounded-full bg-slate-900/10" />
              <span className="size-2.5 rounded-full bg-slate-900/10" />
              <span className="ml-3 text-[11px] text-slate-400">research-paper.pdf</span>
            </div>
            <Image
              src="/hero-pdf.jpeg"
              alt="PDF preview"
              width={800}
              height={600}
              priority
              className="h-auto w-full"
            />
          </div>
          <div className="glass-strong absolute -bottom-5 left-6 flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-700">
            <Sparkles className="size-3.5 text-indigo-600" />
            Drop a PDF to start chatting instantly
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-16">
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <li key={title} className="glass rounded-lg p-5">
              <span className="flex size-8 items-center justify-center rounded-md border border-slate-900/[.08] bg-white">
                <Icon className="size-4 text-indigo-600" />
              </span>
              <h3 className="mt-4 text-sm font-semibold">{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-500">{body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section id="upload" className="scroll-mt-20 pb-20">
        <div className="mx-auto max-w-2xl px-4">
          <div className="glass rounded-xl p-6 md:p-8">
            <h2 className="text-lg font-semibold">Upload a PDF</h2>
            <p className="mt-1 text-sm text-slate-500">
              Drag and drop a file or click to select. You’ll be taken to the chat as soon as it’s processed.
            </p>
            <div className="mt-5">
              <UploadPDF />
            </div>
          </div>
        </div>
      </section>

      <footer className="hairline border-t py-6 text-center text-xs text-slate-500">
        Built with Next.js, Drizzle and Tailwind.
      </footer>
    </main>
  );
}
