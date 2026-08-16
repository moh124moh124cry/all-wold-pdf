"use client";

import { useState, useCallback, useRef } from "react";
import {
  Upload,
  FileText,
  Download,
  Loader2,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  X,
  Sparkles,
  ScanText,
  Languages,
} from "lucide-react";

type Status = "idle" | "processing" | "done" | "error";
type Lang = "ar" | "en";

interface ExtractedPage {
  pageNumber: number;
  text: string;
  usedOCR: boolean;
}

const T = {
  ar: {
    subtitle: "تحويل كتب PDF إلى كتابة يدوية",
    newFile: "ملف جديد",
    badge: "يدعم العربية والإنجليزية + OCR",
    title: "حوّل كتابك إلى كتابة تشبه الخط اليدوي",
    desc: "ارفع ملف PDF نصياً أو ممسوحاً، ثم عاين النص وصدّره كملف PDF جديد.",
    ocr: "تفعيل OCR للملفات الممسوحة (العربية + الإنجليزية)",
    ocrLimit: "حتى 60 صفحة عند استخدام OCR الإجباري",
    drop: "اسحب ملف PDF هنا أو اضغط للاختيار",
    max: "الحد الأقصى 40 ميجا",
    error: "حدث خطأ",
    retry: "حاول مرة أخرى",
    processing: "جاري المعالجة...",
    page: "صفحة",
    processed: "تمت معالجة",
    pagesSoFar: "صفحة حتى الآن...",
    original: "أصلي",
    handwriting: "يدوي",
    export: "تصدير PDF",
    noText: "لا يوجد نص",
    complete: "اكتمل!",
    loading: "جاري تحميل الملف...",
    reading: "جاري قراءة الملف...",
    ocrPage: "OCR للصفحة",
    invalid: "الملف ليس PDF صالحاً.",
    onlyPdf: "يرجى رفع ملف PDF فقط.",
    tooLarge: "حجم الملف كبير جداً (الحد الأقصى 40 ميجا).",
    tooManyOcr:
      "الملف يحتوي على أكثر من 80 صفحة. لا يُنصح بتفعيل OCR الإجباري على الهاتف.",
    noPages: "لا توجد صفحات للتصدير.",
    exportFail: "فشل تصدير ملف PDF. حاول مرة أخرى.",
    exportReady: "تم تجهيز الملف للتنزيل.",
    language: "English",
  },
  en: {
    subtitle: "Convert PDF books into handwriting-style text",
    newFile: "New file",
    badge: "Arabic + English + OCR",
    title: "Turn your book into handwriting-style text",
    desc: "Upload a text or scanned PDF, preview the extracted text, and export a new PDF.",
    ocr: "Enable OCR for scanned files (Arabic + English)",
    ocrLimit: "Up to 60 pages when forced OCR is enabled",
    drop: "Drag a PDF here or click to choose",
    max: "Maximum 40 MB",
    error: "Something went wrong",
    retry: "Try again",
    processing: "Processing...",
    page: "Page",
    processed: "Processed",
    pagesSoFar: "pages so far...",
    original: "Original",
    handwriting: "Handwriting",
    export: "Export PDF",
    noText: "No text",
    complete: "Done!",
    loading: "Loading file...",
    reading: "Reading file...",
    ocrPage: "OCR page",
    invalid: "The file is not a valid PDF.",
    onlyPdf: "Please upload a PDF file only.",
    tooLarge: "File is too large (maximum 40 MB).",
    tooManyOcr:
      "The file has more than 80 pages. Forced OCR is not recommended on mobile.",
    noPages: "There are no pages to export.",
    exportFail: "PDF export failed. Please try again.",
    exportReady: "The file is ready for download.",
    language: "العربية",
  },
} as const;

export default function Home() {
  const [lang, setLang] = useState<Lang>(() =>
    typeof navigator !== "undefined" &&
    navigator.language.toLowerCase().startsWith("ar")
      ? "ar"
      : "en"
  );
  const t = T[lang];
  const rtl = lang === "ar";
  const [status, setStatus] = useState<Status>("idle");
  const [fileName, setFileName] = useState("");
  const [pages, setPages] = useState<ExtractedPage[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("");
  const [previewMode, setPreviewMode] = useState<"original" | "handwriting">(
    "handwriting"
  );
  const [forceOCR, setForceOCR] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStatus("idle");
    setFileName("");
    setPages([]);
    setErrorMsg("");
    setProgress(0);
    setProgressText("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const processPdf = useCallback(
    async (file: File) => {
      setStatus("processing");
      setProgress(5);
      setProgressText(t.loading);
      setFileName(file.name);
      setErrorMsg("");
      setPages([]);
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
        const arrayBuffer = await file.arrayBuffer();
        setProgress(10);
        setProgressText(t.reading);
        const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        const numPages = pdf.numPages;
        if (numPages > 80 && forceOCR) {
          setErrorMsg(t.tooManyOcr);
          setStatus("error");
          return;
        }
        const extracted: ExtractedPage[] = [];
        let Tesseract: any = null;
        for (let i = 1; i <= numPages; i++) {
          setProgressText(
            `${t.page} ${i} ${lang === "ar" ? "من" : "of"} ${numPages}...`
          );
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          let fullText = textContent.items
            .map((item: any) => ("str" in item ? item.str : ""))
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();
          let usedOCR = false;
          if (forceOCR && fullText.length < 30 && numPages <= 60) {
            try {
              setProgressText(
                `${t.ocrPage} ${i} ${lang === "ar" ? "من" : "of"} ${numPages}...`
              );
              if (!Tesseract) Tesseract = await import("tesseract.js");
              const viewport = page.getViewport({ scale: 1.5 });
              const canvas = document.createElement("canvas");
              const context = canvas.getContext("2d");
              if (!context) throw new Error("Canvas error");
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              await (page.render as any)({
                canvasContext: context,
                viewport,
              }).promise;
              const result = await Tesseract.recognize(canvas, "ara+eng", {
                logger: () => {},
              });
              const ocrText = result.data.text.replace(/\s+/g, " ").trim();
              if (ocrText.length > fullText.length) {
                fullText = ocrText;
                usedOCR = true;
              }
            } catch (e) {
              console.warn("OCR failed", i, e);
            }
          }
          extracted.push({ pageNumber: i, text: fullText, usedOCR });
          setPages([...extracted]);
          setProgress(15 + Math.round((i / numPages) * 80));
        }
        setPages(extracted);
        setProgress(100);
        setProgressText(t.complete);
        setStatus("done");
      } catch (err: unknown) {
        console.error(err);
        const message = err instanceof Error ? err.message : "";
        setErrorMsg(message.includes("Invalid PDF") ? t.invalid : t.exportFail);
        setStatus("error");
      }
    },
    [
      forceOCR,
      lang,
      t.complete,
      t.exportFail,
      t.invalid,
      t.loading,
      t.ocrPage,
      t.reading,
      t.tooManyOcr,
    ]
  );

  const handleFile = (file: File | null) => {
    if (!file) return;
    if (file.type !== "application/pdf") {
      setErrorMsg(t.onlyPdf);
      setStatus("error");
      return;
    }
    if (file.size > 40 * 1024 * 1024) {
      setErrorMsg(t.tooLarge);
      setStatus("error");
      return;
    }
    processPdf(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFile(e.dataTransfer.files?.[0] || null);
  };

  const exportPdf = async () => {
    if (!pages.length) {
      setErrorMsg(t.noPages);
      return;
    }
    try {
      setProgressText(t.export);
      const { PDFDocument } = await import("pdf-lib");
      const pdfDoc = await PDFDocument.create();
      const pageWidth = 595.28;
      const pageHeight = 841.89;
      const scale = 2;
      const fontSize = 16;
      const margin = 55;
      const lineHeight = 29;

      for (const pageData of pages) {
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(pageWidth * scale);
        canvas.height = Math.round(pageHeight * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas error");
        ctx.scale(scale, scale);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, pageWidth, pageHeight);
        ctx.fillStyle = "#1f2937";
        ctx.font =
          lang === "ar"
            ? `${fontSize}px "Cairo", "Segoe Print", "Comic Sans MS", sans-serif`
            : `${fontSize}px "Segoe Print", "Bradley Hand", "Comic Sans MS", sans-serif`;
        ctx.textBaseline = "top";
        ctx.direction = rtl ? "rtl" : "ltr";
        ctx.textAlign = rtl ? "right" : "left";

        const maxWidth = pageWidth - margin * 2;
        const words = (pageData.text || " ").split(/\s+/).filter(Boolean);
        const lines: string[] = [];
        let current = "";
        for (const word of words) {
          const test = current ? `${current} ${word}` : word;
          if (ctx.measureText(test).width > maxWidth && current) {
            lines.push(current);
            current = word;
          } else current = test;
        }
        if (current) lines.push(current);

        let y = margin;
        for (const line of lines) {
          if (y > pageHeight - margin - 35) break;
          ctx.fillText(line, rtl ? pageWidth - margin : margin, y, maxWidth);
          y += lineHeight;
        }

        ctx.fillStyle = "#94a3b8";
        ctx.font = "10px Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.direction = "ltr";
        ctx.fillText(String(pageData.pageNumber), pageWidth / 2, pageHeight - 30);

        const png = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (blob) =>
              blob ? resolve(blob) : reject(new Error("PNG conversion failed")),
            "image/png"
          );
        });
        const imageBytes = new Uint8Array(await png.arrayBuffer());
        const image = await pdfDoc.embedPng(imageBytes);
        const page = pdfDoc.addPage([pageWidth, pageHeight]);
        page.drawImage(image, {
          x: 0,
          y: 0,
          width: pageWidth,
          height: pageHeight,
        });
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([new Uint8Array(pdfBytes)], {
        type: "application/pdf",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        (fileName || "book").replace(/\.pdf$/i, "") + "-converted.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setErrorMsg(t.exportFail);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      dir={rtl ? "rtl" : "ltr"}
      lang={lang}
    >
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-sm">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 leading-tight">
                All World PDF
              </h1>
              <p className="text-xs text-slate-500 hidden sm:block">
                {t.subtitle}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLang(lang === "ar" ? "en" : "ar")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm font-medium hover:bg-slate-50"
              aria-label="Change language"
            >
              <Languages className="w-4 h-4" />
              {t.language}
            </button>
            {(status === "done" || status === "processing") && (
              <button
                onClick={reset}
                className="text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1"
              >
                <X className="w-4 h-4" />
                <span className="hidden sm:inline">{t.newFile}</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6 sm:py-10">
        {(status === "idle" || status === "error") && (
          <div className="space-y-6">
            <div className="text-center space-y-3 mb-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-sm font-medium">
                <Sparkles className="w-4 h-4" />
                {t.badge}
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
                {t.title}
              </h2>
              <p className="text-slate-600 max-w-xl mx-auto text-sm sm:text-base">
                {t.desc}
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 bg-white border border-slate-200 rounded-xl p-4">
              <ScanText className="w-5 h-5 text-blue-600" />
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={forceOCR}
                  onChange={(e) => setForceOCR(e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <span>
                  {t.ocr}{" "}
                  <span className="text-slate-400">({t.ocrLimit})</span>
                </span>
              </label>
            </div>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 hover:border-blue-400 bg-white rounded-2xl p-8 sm:p-12 text-center cursor-pointer shadow-sm"
            >
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-50 flex items-center justify-center">
                <Upload className="w-7 h-7 text-blue-600" />
              </div>
              <p className="text-lg font-semibold text-slate-800 mb-1">
                {t.drop}
              </p>
              <p className="text-sm text-slate-500">{t.max}</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0] || null)}
              />
            </div>
            {status === "error" && (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-100 text-red-700">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">{t.error}</p>
                  <p className="text-sm mt-0.5">{errorMsg}</p>
                  <button onClick={reset} className="mt-2 text-sm underline">
                    {t.retry}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {status === "processing" && (
          <div className="mb-8">
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
              <div className="text-center space-y-1">
                <p className="text-lg font-semibold text-slate-800">
                  {t.processing}
                </p>
                <p className="text-sm text-slate-500">{fileName}</p>
                <p className="text-sm text-blue-600 font-medium">
                  {progressText}
                </p>
              </div>
              <div className="w-full max-w-xs">
                <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 rounded-full transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500 text-center mt-2">
                  {progress}%
                </p>
              </div>
            </div>
          </div>
        )}

        {(status === "done" ||
          (status === "processing" && pages.length > 0)) && (
          <div className="space-y-5">
            {status === "done" && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800 truncate max-w-[200px] sm:max-w-md">
                      {fileName}
                    </p>
                    <p className="text-sm text-slate-500">
                      {pages.length} {t.page.toLowerCase()}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm">
                    <button
                      onClick={() => setPreviewMode("original")}
                      className={`px-3 py-1.5 ${
                        previewMode === "original"
                          ? "bg-slate-100 font-medium"
                          : "bg-white text-slate-600"
                      }`}
                    >
                      {t.original}
                    </button>
                    <button
                      onClick={() => setPreviewMode("handwriting")}
                      className={`px-3 py-1.5 ${
                        previewMode === "handwriting"
                          ? "bg-blue-50 text-blue-700 font-medium"
                          : "bg-white text-slate-600"
                      }`}
                    >
                      {t.handwriting}
                    </button>
                  </div>
                  <button
                    onClick={exportPdf}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm"
                  >
                    <Download className="w-4 h-4" />
                    {t.export}
                  </button>
                </div>
              </div>
            )}
            {status === "processing" && pages.length > 0 && (
              <div className="text-center text-sm text-slate-500 mb-2">
                {t.processed} {pages.length} {t.pagesSoFar}
              </div>
            )}
            <div className="space-y-4">
              {pages.map((page) => (
                <div
                  key={page.pageNumber}
                  className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
                >
                  <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-600">
                      {t.page} {page.pageNumber}
                      {page.usedOCR && (
                        <span
                          className={`${
                            rtl ? "mr-2" : "ml-2"
                          } text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full`}
                        >
                          OCR
                        </span>
                      )}
                    </span>
                    <FileText className="w-4 h-4 text-slate-400" />
                  </div>
                  <div
                    className={`p-5 text-slate-800 leading-relaxed whitespace-pre-wrap ${
                      previewMode === "handwriting"
                        ? "handwriting text-[15px]"
                        : "text-sm"
                    }`}
                    dir="auto"
                  >
                    {page.text || (
                      <span className="text-slate-400 italic">{t.noText}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {status === "done" && (
              <>
                <div className="sm:hidden fixed bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur border-t z-10">
                  <button
                    onClick={exportPdf}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 text-white font-semibold shadow-lg"
                  >
                    <Download className="w-5 h-5" />
                    {t.export}
                  </button>
                </div>
                <div className="h-20 sm:hidden" />
              </>
            )}
          </div>
        )}
      </main>
      <footer className="border-t border-slate-200 py-4 text-center text-xs text-slate-500">
        All World PDF
      </footer>
    </div>
  );
}
