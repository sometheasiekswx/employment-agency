export const maxResumeLength = 40_000;
const maxFileBytes = 10 * 1024 * 1024;
const wordNamespace =
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

export function reviewedResume(value: string) {
  const text = value.replace(/\r\n?/g, "\n").trim();
  if (!text || !/[\p{L}\p{N}]/u.test(text) || text.includes("\0"))
    throw new Error("Enter résumé text or choose a file with selectable text.");
  if (text.length > maxResumeLength)
    throw new Error("Keep the résumé below 40,000 characters.");
  return text;
}

async function readPdf(file: File) {
  const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
  GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  const task = getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: "/pdfjs/cmaps/",
    disableFontFace: true,
    useWasm: false,
    stopAtErrors: true,
  });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 20)
      throw new Error("Choose a PDF with 20 pages or fewer.");
    const pages = [];
    let length = 0;
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const { items } = await page.getTextContent();
      const text = items
        .map((item) =>
          "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "",
        )
        .join("")
        .trim();
      length += text.length;
      if (length > maxResumeLength)
        throw new Error("Keep the résumé below 40,000 characters.");
      pages.push(text);
      page.cleanup();
    }
    return pages.join("\n\n");
  } finally {
    await task.destroy().catch(() => {});
  }
}

async function readDocx(file: File) {
  const { unzipSync, strFromU8 } = await import("fflate");
  const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter: (entry) =>
      entry.name === "word/document.xml" && entry.originalSize <= 2_000_000,
  });
  const body = entries["word/document.xml"];
  if (!body) throw new Error("Could not read the Word document.");
  const xml = strFromU8(body);
  if (/<!DOCTYPE/i.test(xml))
    throw new Error("Could not read the Word document.");
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const content = document.getElementsByTagNameNS(wordNamespace, "body")[0];
  if (!content || document.querySelector("parsererror"))
    throw new Error("Could not read the Word document.");
  return [...content.getElementsByTagNameNS(wordNamespace, "p")]
    .map((paragraph) =>
      [...paragraph.getElementsByTagNameNS(wordNamespace, "*")]
        .map((node) => {
          if (node.localName === "t") return node.textContent;
          if (node.localName === "tab") return "\t";
          if (node.localName === "br") return "\n";
          return "";
        })
        .join(""),
    )
    .join("\n");
}

export async function readDemoResume(file: File) {
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  if (!file.size || file.size > maxFileBytes)
    throw new Error("Choose a non-empty résumé file up to 10 MB.");
  if (!["pdf", "docx", "txt", "md"].includes(extension || ""))
    throw new Error("Choose a PDF, DOCX or plain-text résumé.");
  let content;
  try {
    content =
      extension === "pdf"
        ? await readPdf(file)
        : extension === "docx"
          ? await readDocx(file)
          : await file.text();
  } catch {
    throw new Error(
      "Could not read this file. Try an unlocked PDF with selectable text, a DOCX or plain text.",
    );
  }
  return reviewedResume(content);
}
