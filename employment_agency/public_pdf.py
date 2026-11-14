"""Read the text of a bounded public PDF in a short-lived process."""

import json
import sys
from io import BytesIO

PDF_BYTE_LIMIT = 4 * 1024 * 1024
PDF_STREAM_LIMIT = 4 * 1024 * 1024
PDF_PAGE_LIMIT = 12
TEXT_LIMIT = 12_000


def read(body):
    from pypdf import PdfReader

    if len(body) > PDF_BYTE_LIMIT:
        return "", "Job description PDF exceeds 4 MiB"
    reader = PdfReader(BytesIO(body), strict=True)
    if reader.is_encrypted:
        return "", "Job description PDF is encrypted"
    if len(reader.pages) > PDF_PAGE_LIMIT:
        return "", f"Job description PDF exceeds {PDF_PAGE_LIMIT} pages"
    stream_bytes = 0
    lines = []
    for page in reader.pages:
        if (content := page.get_contents()) is not None:
            stream_bytes += len(content.get_data())
            if stream_bytes > PDF_STREAM_LIMIT:
                return "", "Job description PDF exceeds the text extraction limit"
        lines.extend(" ".join(line.split()) for line in (page.extract_text() or "").splitlines() if line.strip())
        if sum(len(line) + 1 for line in lines) > TEXT_LIMIT:
            return "\n".join(lines)[:TEXT_LIMIT], "PDF text was truncated"
    text = "\n".join(lines)
    return text, "" if text else "PDF has no readable text. Open the original to review it."


if __name__ == "__main__":
    data = sys.stdin.buffer.read(PDF_BYTE_LIMIT + 1)
    print(json.dumps(read(data)))
