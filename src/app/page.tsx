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
} from "lucide-react";

type Status = "idle" | "processing" | "done" | "error";

interface ExtractedPage {
  pageNumber: number;
  text: string;
  usedOCR: boolean;
}

export default function Home() {
  const [status, setStatus] = useState<Status>("idle");
  const [fileName, setFileName] = useState("");
  const [pages, setPages] = useState<ExtractedPage[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("");
  const [previewMode, setPreviewMode] = useState<"original" | "handwriting">("handwriting");
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

  const processPdf = useCallback(async (file: File) => {
    setStatus("processing");
    setProgress(3);
    setProgressText("جاري تحميل الملف...");
    setFileName(file.name);
    setErrorMsg("");

    try {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

      const arrayBuffer = await file.arrayBuffer();
      setProgress(8);
      setProgressText("جاري قراءة الملف...");

      const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      const numPages = pdf.numPages;
      setProgress(12);

      const extracted: ExtractedPage[] = [];

      // تحميل Tesseract مرة واحدة
      let Tesseract: typeof import("tesseract.js") | null = null;

      for (let i = 1; i <= numPages; i++) {
        setProgressText(`معالجة الصفحة ${i} من ${numPages}...`);
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();

        // استخراج النص العادي
        let fullText = textContent.items
          .map((item: any) => ("str" in item ? item.str : ""))
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();

        let usedOCR = false;

        // إذا النص قليل جداً أو المستخدم فعّل OCR إجباري → نستخدم OCR
        const needsOCR = forceOCR || fullText.length < 40;

        if (needsOCR) {
          setProgressText(`OCR - قراءة الصفحة ${i} من الصور (قد يستغرق وقتاً)...`);

          if (!Tesseract) {
            Tesseract = await import("tesseract.js");
          }

          // رسم الصفحة كصورة
          const viewport = page.getViewport({ scale: 2.0 });
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Canvas not supported");

          canvas.width = viewport.width;
          canvas.height = viewport.height;

          await page.render({
            canvasContext: context,
            viewport,
            canvas,
          }).promise;

          // تشغيل OCR (عربي + إنجليزي)
          const { data } = await Tesseract.recognize(canvas, "ara+eng", {
            logger: (m) => {
              if (m.status === "recognizing text") {
                setProgressText(`OCR صفحة ${i}: ${Math.round(m.progress * 100)}%`);
              }
            },
          });

          fullText = data.text.replace(/\s+/g, " ").trim();
          usedOCR = true;
        }

        extracted.push({
          pageNumber: i,
          text: fullText,
          usedOCR,
        });

        // تحديث التقدم
        const base = 12;
        const range = 80;
        setProgress(base + Math.round((i / numPages) * range));
      }

      setPages(extracted);
      setProgress(100);
      setProgressText("اكتمل!");
      setStatus("done");
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : "";
      setErrorMsg(
        message.includes("Invalid PDF")
          ? "الملف ليس PDF صالحاً أو تالف."
          : "حدث خطأ أثناء المعالجة. جرب تفعيل OCR أو ملف أصغر."
      );
      setStatus("error");
    }
  }, [forceOCR]);

  const handleFile = (file: File | null) => {
    if (!file) return;
    if (file.type !== "application/pdf") {
      setErrorMsg("يرجى رفع ملف PDF فقط.");
      setStatus("error");
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      setErrorMsg("حجم الملف كبير جداً (الحد الأقصى 30 ميجابايت).");
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
    if (pages.length === 0) return;

    try {
      const { PDFDocument, rgb, StandardFonts } = await import("pdf-lib");
      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);

      for (const pageData of pages) {
        const page = pdfDoc.addPage([595.28, 841.89]);
        const { width, height } = page.getSize();
        const fontSize = 13;
        const margin = 48;
        const maxWidth = width - margin * 2;
        const lineHeight = fontSize * 1.75;

        const words = pageData.text.split(/\s+/).filter(Boolean);
        const lines: string[] = [];
        let currentLine = "";

        for (const word of words) {
          const test = currentLine ? `${currentLine} ${word}` : word;
          const approxWidth = test.length * (fontSize * 0.48);
          if (approxWidth > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = word;
          } else {
            currentLine = test;
          }
        }
        if (currentLine) lines.push(currentLine);

        let y = height - margin - 10;
        for (const line of lines) {
          if (y < margin + 20) break;
          page.drawText(line, {
            x: margin,
            y,
            size: fontSize,
            font,
            color: rgb(0.12, 0.12, 0.18),
          });
          y -= lineHeight;
        }

        page.drawText(String(pageData.pageNumber), {
          x: width / 2 - 8,
          y: 28,
          size: 10,
          font,
          color: rgb(0.45, 0.45, 0.5),
        });
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([new Uint8Array(pdfBytes)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName.replace(/\.pdf$/i, "") + "-handwriting.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setErrorMsg("فشل تصدير ملف PDF.");
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-sm">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 leading-tight">
                All World PDF Main
              </h1>
              <p className="text-xs text-slate-500 hidden sm:block">
                تحويل + OCR للملفات الممسوحة
              </p>
            </div>
          </div>
          {status === "done" && (
            <button onClick={reset} className="text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1">
              <X className="w-4 h-4" />
              <span className="hidden sm:inline">ملف جديد</span>
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6 sm:py-10">
        {status === "idle" || status === "error" ? (
          <div className="space-y-6">
            <div className="text-center space-y-3 mb-8">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-sm font-medium">
                <Sparkles className="w-4 h-4" />
                يدعم الملفات النصية + الممسوحة (OCR)
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
                حوّل كتابك إلى خط يشبه الكتابة باليد
              </h2>
              <p className="text-slate-600 max-w-xl mx-auto text-sm sm:text-base">
                ارفع أي PDF (نصي أو صور). النظام يكتشف تلقائياً ويستخدم OCR عند الحاجة.
              </p>
            </div>

            {/* خيار OCR إجباري */}
            <div className="flex items-center justify-center gap-3 bg-white border border-slate-200 rounded-xl p-4">
              <ScanText className="w-5 h-5 text-blue-600" />
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={forceOCR}
                  onChange={(e) => setForceOCR(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300"
                />
                <span>تفعيل OCR إجباري لكل الصفحات (للبحث عن النص داخل الصور)</span>
              </label>
            </div>

            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 hover:border-blue-400 bg-white rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition-colors shadow-sm hover:shadow-md"
            >
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-50 flex items-center justify-center">
                <Upload className="w-7 h-7 text-blue-600" />
              </div>
              <p className="text-lg font-semibold text-slate-800 mb-1">
                اسحب ملف PDF هنا أو اضغط للاختيار
              </p>
              <p className="text-sm text-slate-500">
                يدعم الملفات العربية والإنجليزية • الحد الأقصى 30 ميجا
              </p>
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
                  <p className="font-medium">حدث خطأ</p>
                  <p className="text-sm mt-0.5">{errorMsg}</p>
                  <button onClick={reset} className="mt-2 text-sm underline">
                    حاول مرة أخرى
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {status === "processing" && (
          <div className="flex flex-col items-center justify-center py-16 space-y-6">
            <Loader2 className="w-14 h-14 text-blue-600 animate-spin" />
            <div className="text-center space-y-2">
              <p className="text-lg font-semibold text-slate-800">جاري المعالجة...</p>
              <p className="text-sm text-slate-500">{fileName}</p>
              <p className="text-sm text-blue-600 font-medium">{progressText}</p>
            </div>
            <div className="w-full max-w-xs">
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 text-center mt-2">{progress}%</p>
            </div>
            <p className="text-xs text-slate-400 text-center max-w-sm">
              ملاحظة: OCR للصور قد يستغرق وقتاً أطول حسب عدد الصفحات وقوة جهازك
            </p>
          </div>
        )}

        {status === "done" && (
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-800 truncate max-w-[220px] sm:max-w-md">
                    {fileName}
                  </p>
                  <p className="text-sm text-slate-500">
                    {pages.length} صفحة •{" "}
                    {pages.filter((p) => p.usedOCR).length > 0
                      ? `${pages.filter((p) => p.usedOCR).length} صفحة استخدمت OCR`
                      : "تم التحويل"}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm">
                  <button
                    onClick={() => setPreviewMode("original")}
                    className={`px-3 py-1.5 ${previewMode === "original" ? "bg-slate-100 font-medium" : "bg-white text-slate-600"}`}
                  >
                    أصلي
                  </button>
                  <button
                    onClick={() => setPreviewMode("handwriting")}
                    className={`px-3 py-1.5 ${previewMode === "handwriting" ? "bg-blue-50 text-blue-700 font-medium" : "bg-white text-slate-600"}`}
                  >
                    يدوي
                  </button>
                </div>
                <button
                  onClick={exportPdf}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  تصدير PDF
                </button>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-sm text-amber-800">
              <strong>ملاحظة:</strong> الصفحات التي استخدمت OCR تم قراءتها من الصور.
              الدقة تعتمد على جودة الصورة في الملف الأصلي.
            </div>

            <div className="space-y-4">
              {pages.map((page) => (
                <div key={page.pageNumber} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-600">
                      صفحة {page.pageNumber}
                      {page.usedOCR && (
                        <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                          OCR
                        </span>
                      )}
                    </span>
                    <FileText className="w-4 h-4 text-slate-400" />
                  </div>
                  <div
                    className={`p-5 sm:p-6 text-slate-800 leading-relaxed whitespace-pre-wrap ${
                      previewMode === "handwriting" ? "handwriting text-[15px] sm:text-base" : "text-sm sm:text-[15px]"
                    }`}
                    dir="auto"
                  >
                    {page.text || (
                      <span className="text-slate-400 italic">لم يتم العثور على نص في هذه الصفحة</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="sm:hidden fixed bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur border-t border-slate-200 z-10">
              <button
                onClick={exportPdf}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 text-white font-semibold shadow-lg"
              >
                <Download className="w-5 h-5" />
                تصدير PDF
              </button>
            </div>
            <div className="h-20 sm:hidden" />
          </div>
        )}
      </main>

      <footer className="border-t border-slate-200 py-4 text-center text-xs text-slate-500">
        All World PDF Main • يدعم OCR للصور • يعمل على المتصفح والجوال
      </footer>
    </div>
  );
}
