"use client";
import { DrizzleChat } from "../lib/db/schema";
import Link from "next/link";
import React from "react";
import { Button } from "./ui/button";
import { FileText, Plus } from "lucide-react";
import { cn } from "../lib/utils";
import Logo from "./Logo";

type Props = {
  chats: DrizzleChat[];
  chatId: number;
};

const ChatSideBar = ({ chats, chatId }: Props) => {
  return (
    <div className="flex h-full flex-col">
      <div className="hairline flex h-12 shrink-0 items-center border-b px-4">
        <Logo />
      </div>

      <div className="p-3">
        <Button asChild variant="glass" className="w-full justify-start">
          <Link href="/#upload">
            <Plus className="text-indigo-600" />
            New chat
          </Link>
        </Button>
      </div>

      <p className="px-4 pb-2 text-[11px] font-medium uppercase tracking-wider text-slate-400">Documents</p>

      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 pb-3">
        {chats.map((chat) => {
          const active = chat.id === chatId;
          return (
            <Link
              key={chat.id}
              href={`/chat/${chat.id}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex items-center gap-2.5 rounded-md border px-2.5 py-2 text-sm transition-colors",
                active
                  ? "border-slate-900/[.08] bg-white text-slate-900 shadow-[0_1px_2px_rgb(15_23_42/0.06)]"
                  : "border-transparent text-slate-600 hover:bg-slate-900/[.04] hover:text-slate-900"
              )}
            >
              {active && <span className="absolute inset-y-2 -left-[13px] w-0.5 rounded-full bg-indigo-600" />}
              <FileText className={cn("size-4 shrink-0", active ? "text-indigo-600" : "text-slate-400")} />
              <span className="truncate">{chat.pdfName}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
};

export default ChatSideBar;
