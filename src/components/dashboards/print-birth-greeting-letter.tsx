import { renderToStaticMarkup } from "react-dom/server";
import {
  PrintableA4Letter,
  type PrintableA4LetterProps,
} from "@/components/dashboards/BirthGreetingLetter";

const printStyles = `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; width: 210mm; min-height: 100%; }
  body {
    color: #17211b;
    font-family: "Noto Sans Bengali", "Hind Siliguri", "Nirmala UI", sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .a4-letter {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 210mm;
    min-height: 297mm;
    height: 297mm;
    margin: 0 auto;
    padding: 1in;
    border: 4px double #17633e;
    outline: 1px solid #17633e;
    outline-offset: -7px;
    box-sizing: border-box;
    overflow: hidden;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .letter-content {
    display: flex;
    width: 100%;
    min-height: 0;
    flex: 1;
    padding: 0;
    box-sizing: border-box;
    flex-direction: column;
    justify-content: space-between;
    gap: 2mm;
  }
  .letter-header {
    flex: 0 0 auto;
    text-align: center;
    line-height: 1.4;
  }
  .letter-header p {
    margin: 0;
    font-size: 11pt;
    font-weight: 600;
  }
  .letter-header h1 {
    width: 100%;
    margin: 1mm 0 0;
    color: #065f46;
    font-size: 25pt;
    font-weight: 800;
    letter-spacing: 0.1pt;
  }
  .header-accent {
    display: block;
    width: 58mm;
    height: 1.2mm;
    margin: 1.5mm auto 2mm;
    border-top: 0.45mm solid #047857;
    border-bottom: 0.25mm solid #6ee7b7;
    background: linear-gradient(90deg, transparent, #059669 22%, #059669 78%, transparent);
  }
  .memo-line {
    display: flex;
    justify-content: space-between;
    gap: 8mm;
    padding-bottom: 2mm;
    border-bottom: 1px solid #9aab9e;
    font-size: 9.5pt;
  }
  .recipient {
    font-size: 10pt;
    line-height: 1.45;
  }
  .recipient p {
    margin: 0;
    white-space: nowrap;
  }
  .letter-message { flex: 0 1 auto; }
  .letter-title {
    width: fit-content;
    margin: 0 auto 4mm;
    padding: 1.5mm 6mm;
    border: 2px solid #059669;
    border-radius: 999px;
    background: #ecfdf580;
    color: #065f46;
    font-size: 14pt;
    font-weight: 700;
    text-align: center;
  }
  .letter-body {
    min-height: 0;
    font-size: 11pt;
    line-height: 1.65;
    text-align: justify;
  }
  .letter-body p { margin: 0 0 4.5mm; white-space: pre-line; }
  .letter-body p:last-child { margin-bottom: 0; }
  .required-documents {
    flex: 0 0 auto;
    padding: 4mm;
    border: 1px solid #a7f3d0cc;
    border-radius: 4mm;
    background: #ecfdf54d;
    box-shadow: 0 1px 3px #102a4314;
    font-size: 10.5pt;
  }
  .required-documents h3 { margin: 0 0 2mm; font-size: 11pt; }
  .required-documents ul {
    margin: 0;
    padding-left: 5mm;
    list-style: disc;
    line-height: 1.5;
  }
  .required-documents li { padding-left: 1mm; margin-bottom: 1mm; }
  .required-documents li:last-child { margin-bottom: 0; }
  .letter-footer {
    display: flex;
    justify-content: space-between;
    align-items: end;
    gap: 8mm;
    flex: 0 0 auto;
    padding-top: 4mm;
    border-top: 1px solid #d1e4d8;
    font-size: 9.25pt;
    line-height: 1.5;
  }
  .letter-footer p { margin: 0; }
  .copy-to { max-width: 76mm; }
  .signature { min-width: 62mm; text-align: center; font-weight: 600; }
  .corner {
    position: absolute;
    color: #17633e;
    font-size: 24pt;
    line-height: 1;
  }
  .corner-top-left { top: 5mm; left: 6mm; }
  .corner-top-right { top: 5mm; right: 6mm; transform: scaleX(-1); }
  .corner-bottom-left { bottom: 5mm; left: 6mm; transform: scaleY(-1); }
  .corner-bottom-right { bottom: 5mm; right: 6mm; transform: scale(-1); }
  @media screen {
    html, body { width: auto; }
    body { padding: 16px; background: #eef2ef; }
    .a4-letter { box-shadow: 0 8px 28px #102a431f; }
  }
  @media print {
    html, body { width: 210mm; height: 297mm; margin: 0; overflow: hidden; }
    body { padding: 0; }
    nav, aside, button, [data-print-hide], [data-radix-dialog-overlay] {
      display: none !important;
    }
    .a4-letter {
      width: 210mm;
      min-height: 297mm;
      height: 297mm;
      margin: 0;
      page-break-after: avoid;
      break-after: avoid;
    }
  }
`;

export function printAdministrativeLetter(props: PrintableA4LetterProps) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return false;

  printWindow.document.open();
  printWindow.document.write(
    `<!doctype html><html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${props.title}</title><style>${printStyles}</style></head><body>${renderToStaticMarkup(<PrintableA4Letter {...props} />)}<script>window.addEventListener("load",()=>window.print());</script></body></html>`,
  );
  printWindow.document.close();
  return true;
}
