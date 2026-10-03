"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "./ui/button";
import toast from "react-hot-toast";
import { uploadPDF } from "../lib/pdf-process";
import { useRouter } from "next/navigation";
import { UploadCloud, X } from "lucide-react";

export default function UploadPDF() {
  const router = useRouter();
  const inputFileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<{ text?: string; fileUrl?: string } | null>(null);
  const [Id, setId] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);

  // Increase max to 10MB to match the landing page copy
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  const ALLOWED_FORMATS = ["application/pdf"];

  useEffect(() => {
    if (!uploading) setProgress(0);
  }, [uploading]);

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = () => {
    setDragActive(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);

    if (event.dataTransfer.files.length > 0) {
      handleFileChange(event.dataTransfer.files[0]);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const handleFileChange = async (selectedFile: File | null) => {
    if (!selectedFile) return;

    if (selectedFile.size > MAX_FILE_SIZE) {
      toast.error(`File size exceeds ${formatBytes(MAX_FILE_SIZE)} limit.`);
      return;
    }
    if (!ALLOWED_FORMATS.includes(selectedFile.type)) {
      toast.error("Only PDF files are allowed.");
      return;
    }

    setFile(selectedFile);
    setFileName(selectedFile.name);
    setError(null);
  };

  const handleRemove = () => {
    setFile(null);
    setFileName(null);
    setError(null);
  };

  const handleUpload = async (selectedFile: File) => {
    let progressInterval: number | undefined;
    try {
      setUploading(true);
      setProgress(6);

      // simulate progress until server responds
      progressInterval = window.setInterval(() => {
        setProgress((p) => Math.min(90, p + Math.random() * 8));
      }, 400) as unknown as number;

      const response = await uploadPDF(selectedFile);

      if (progressInterval) clearInterval(progressInterval);
      setProgress(100);

      if ("error" in response) {
        throw new Error(response.error);
      }

      setUploadedFile(response);
      setFile(null);
      setFileName(null);
      setError(null);
      toast.success("File uploaded successfully");
      const id = response.chatId;
      setId(id ? id.toString() : null);
      // small delay so users can see the completed progress
      setTimeout(() => {
        if (id) router.push(`/chat/${id}`);
      }, 500);
    } catch (err) {
      if (progressInterval) clearInterval(progressInterval);
      const message = err instanceof Error ? err.message : "Upload failed. Please try again.";
      setError(message);
      toast.error(message);
      setProgress(0);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="w-full">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputFileRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputFileRef.current?.click(); }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-10 transition-colors duration-150
          ${dragActive ? 'border-indigo-500/60 bg-indigo-50/70' : 'border-slate-300 bg-white/50 hover:border-slate-400 hover:bg-white/70'}`}
      >
        <span className={`flex size-10 items-center justify-center rounded-md border bg-white shadow-[0_1px_2px_rgb(15_23_42/0.05)] ${dragActive ? 'border-indigo-500/30' : 'border-slate-900/[.08]'}`}>
          <UploadCloud className={`size-5 ${dragActive ? 'text-indigo-600' : 'text-slate-500'}`} />
        </span>
        <div className="text-center">
          <p className="text-sm font-medium text-slate-800">
            {dragActive ? 'Drop the PDF here' : <>Drag & drop a PDF, or <span className="text-indigo-600">browse</span></>}
          </p>
          <p className="mt-1 text-xs text-slate-500">Max {formatBytes(MAX_FILE_SIZE)} · PDF only · Files removed after session</p>
        </div>
        <input
          ref={inputFileRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
        />
      </div>

      {file && (
        <div className="glass mt-3 flex items-center justify-between gap-3 rounded-lg px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-red-500/15 bg-red-50 text-[10px] font-semibold text-red-600">
              PDF
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-800">{file.name}</p>
              <p className="text-xs text-slate-500">{formatBytes(file.size)}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" type="button" disabled={uploading} onClick={() => file && handleUpload(file)}>
              {uploading ? 'Uploading…' : 'Upload'}
            </Button>
            <Button size="icon" variant="ghost" type="button" aria-label="Remove file" disabled={uploading} onClick={handleRemove} className="size-8">
              <X />
            </Button>
          </div>
        </div>
      )}

      {uploading && (
        <div className="mt-3 flex items-center gap-3">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-900/[.06]">
            <div className="h-full rounded-full bg-indigo-600 transition-[width] duration-300" style={{ width: `${progress}%` }} />
          </div>
          <span className="w-9 text-right text-xs tabular-nums text-slate-500">{Math.round(progress)}%</span>
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-md border border-red-500/15 bg-red-50/80 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {uploadedFile && (
        <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-50/70 p-3 text-sm text-emerald-900">
          <p className="font-medium">File uploaded, opening chat…</p>
          {uploadedFile.fileUrl && (
            <a href={uploadedFile.fileUrl} target="_blank" rel="noreferrer" className="text-indigo-600 underline-offset-4 hover:underline">
              View file
            </a>
          )}
          {uploadedFile.text && (
            <div className="mt-2 max-h-36 overflow-auto text-xs text-slate-600">{uploadedFile.text.slice(0, 800)}{uploadedFile.text.length > 800 ? '…' : ''}</div>
          )}
        </div>
      )}
    </div>
  );
}
