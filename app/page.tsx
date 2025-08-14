import { Button } from "../components/ui/button";
import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, LogIn, ShieldCheck, FileText, Rocket, Sparkles } from "lucide-react";
import { db } from "../lib/db";
import { chats } from "../lib/db/schema";
import { eq } from "drizzle-orm";
import UploadPDF from "../components/PDFUpload";

export default async function Home() {
  const { userId } = await auth();
  const isAuth = !!userId;

  let firstChat: { id: string } | null = null;
  if (userId) {
    const rows = await db.select().from(chats).where(eq(chats.userId, userId));
    if (rows?.length) firstChat = { id: String(rows[0].id) };
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      {/* Decorative background */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-24 left-1/2 h-72 w-[48rem] -translate-x-1/2 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="absolute -bottom-24 right-1/3 h-72 w-[36rem] rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(60rem_30rem_at_0%_0%,rgba(99,102,241,0.08),transparent),radial-gradient(40rem_20rem_at_100%_100%,rgba(16,185,129,0.06),transparent)]" />
      </div>

      {/* Navbar */}
      <nav className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/50 backdrop-blur supports-[backdrop-filter]:bg-slate-950/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/" className="relative">
            <span className="absolute -inset-1 -z-10 rounded-lg bg-gradient-to-r from-indigo-500/30 via-sky-500/30 to-emerald-500/30 blur-md" />
            <span className="bg-gradient-to-r from-indigo-300 via-sky-300 to-emerald-300 bg-clip-text text-xl font-extrabold tracking-wide text-transparent">
              DeepDoc
            </span>
          </Link>
          <div className="flex items-center gap-3">
            {isAuth ? (
              <UserButton afterSignOutUrl="/" />
            ) : (
              <Link href="/sign-in">
                <Button className="gap-2 bg-indigo-600 hover:bg-indigo-500">
                  Login <LogIn className="size-4" />
                </Button>
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-8 px-4 py-14 md:grid-cols-2">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
              <Sparkles className="size-3.5" /> New: Faster multi-PDF processing
            </div>
            <h1 className="mt-4 text-4xl font-bold leading-tight md:text-5xl">
              Chat with <span className="bg-gradient-to-r from-indigo-400 via-sky-400 to-emerald-400 bg-clip-text text-transparent">any PDF</span>
            </h1>
            <p className="mt-3 max-w-xl text-slate-300">
              Ask questions, extract insights, and understand research in seconds. Secure, accurate, and blazing fast.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              {isAuth && firstChat ? (
                <Link href={`/chat/${firstChat.id}`}>
                  <Button className="gap-2 bg-white text-slate-900 hover:bg-slate-100">
                    Go to Chats <ArrowRight className="size-4" />
                  </Button>
                </Link>
              ) : (
                <Link href={isAuth ? "/chat" : "/sign-in"}>
                  <Button className="gap-2 bg-white text-slate-900 hover:bg-slate-100">
                    {isAuth ? "Start a Chat" : "Login to get started"}
                    <ArrowRight className="size-4" />
                  </Button>
                </Link>
              )}

              <a href="#upload" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition hover:bg-white/10">
                Upload a PDF
              </a>
            </div>

            {/* Feature bullets */}
            <ul className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[{
                icon: <FileText className="size-4" />, title: "Works with long papers",
              }, {
                icon: <ShieldCheck className="size-4" />, title: "Your data stays private",
              }, {
                icon: <Rocket className="size-4" />, title: "Fast, streaming answers",
              }, {
                icon: <Sparkles className="size-4" />, title: "Citations & highlights",
              }].map((f, i) => (
                <li key={i} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200">
                  <span className="rounded-md bg-white/10 p-1 text-slate-200">{f.icon}</span>
                  {f.title}
                </li>
              ))}
            </ul>
          </div>

          {/* Right illustration */}
          <div className="relative hidden md:block">
            <div className="absolute -inset-6 -z-10 rounded-3xl bg-gradient-to-br from-indigo-500/20 to-emerald-500/10 blur-2xl" />
            <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
              <Image
                src="/hero-pdf.jpeg"
                alt="PDF preview"
                width={800}
                height={600}
                className="h-auto w-full"
              />
            </div>
            <div className="pointer-events-none absolute -bottom-4 left-8 rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-xs text-slate-200 backdrop-blur">
              Tip: Drop a PDF to start chatting instantly
            </div>
          </div>
        </div>
      </section>

      {/* Upload Section */}
      <section id="upload" className="border-t border-white/10 bg-slate-900/40 py-10">
        <div className="mx-auto max-w-4xl px-4">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-4 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Upload a PDF</h2>
              {!isAuth && (
                <Link href="/sign-in">
                  <Button className="gap-2 bg-indigo-600 hover:bg-indigo-500">
                    Login <LogIn className="size-4" />
                  </Button>
                </Link>
              )}
            </div>

            {isAuth ? (
              <div className="space-y-3">
                <p className="text-sm text-slate-300">
                  Drag & drop a file or click to select. We process securely and return answers with citations.
                </p>
                <UploadPDF />
                <p className="text-xs text-slate-400">Max 10MB • PDFs only • Data is deleted after your session</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
                <p className="text-sm text-slate-300">Please sign in to upload and chat with your PDFs.</p>
                <Link href="/sign-in">
                  <Button className="mt-3 bg-white text-slate-900 hover:bg-slate-100">Login to continue</Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-6 text-center text-xs text-slate-400">
        Built with ❤️ using Next.js, Clerk, Drizzle, and Tailwind.
      </footer>
    </main>
  );
}
