// Генерація PDF документів (для друку)
// ВАЖЛИВО: pdfmake має специфічні build-експорти і в Node (ESM) надійніше підключати через createRequire
import { createRequire } from "module";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfMake = require("pdfmake/build/pdfmake");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfFonts = require("pdfmake/build/vfs_fonts");

// Підключаємо вбудовані шрифти (Roboto з підтримкою кирилиці)
// У Node-версії pdfmake (0.2.x) vfs_fonts експортує мапу файлів, яку треба додати через API.
pdfMake.addVirtualFileSystem(pdfFonts);

const ROBOTO_FONTS = {
  Roboto: {
    normal: "Roboto-Regular.ttf",
    bold: "Roboto-Medium.ttf",
    italics: "Roboto-Italic.ttf",
    bolditalics: "Roboto-MediumItalic.ttf",
  },
};
pdfMake.addFonts(ROBOTO_FONTS);
pdfMake.setFonts(ROBOTO_FONTS);

function toPrintable(value) {
  if (value === null || value === undefined) return "—";
  const s = String(value).trim();
  return s.length ? s : "—";
}

export function buildNeedsPdfDoc({ title, needs }) {
  const headerRow = [
    { text: "ПІБ", style: "th" },
    { text: "День народження", style: "th" },
    { text: "Номер телефону", style: "th" },
    { text: "Категорія допомоги", style: "th" },
    { text: "Статус", style: "th" },
    { text: "Дата статусу", style: "th" },
  ];

  const body = [headerRow];

  for (const n of needs) {
    body.push([
      toPrintable(n.name),
      toPrintable(n.birthday),
      toPrintable(n.phone),
      toPrintable(n.categoryLabel),
      toPrintable(n.statusLabel),
      toPrintable(n.statusDate),
    ]);
  }

  return {
    pageOrientation: "landscape",
    pageMargins: [24, 24, 24, 24],
    content: [
      { text: title, style: "title" },
      { text: `Сформовано: ${new Date().toLocaleString("uk-UA")}`, style: "meta" },
      { text: " ", margin: [0, 6] },
      {
        table: {
          headerRows: 1,
          widths: ["*", 90, 110, 140, 90, 110],
          body,
        },
        layout: {
          fillColor: (rowIndex) => (rowIndex === 0 ? "#eeeeee" : null),
        },
      },
    ],
    styles: {
      title: { fontSize: 18, bold: true },
      meta: { fontSize: 10, color: "#555555" },
      th: { bold: true, fontSize: 10 },
    },
    defaultStyle: {
      font: "Roboto",
      fontSize: 10,
    },
  };
}

export async function generateNeedsPdfBuffer({ title, needs }) {
  const docDefinition = buildNeedsPdfDoc({ title, needs });

  return await new Promise((resolve, reject) => {
    try {
      const pdfDoc = pdfMake.createPdf(docDefinition);
      pdfDoc.getBuffer((buffer) => {
        // pdfmake може повернути Uint8Array — Telegraf очікує Node Buffer
        try {
          const out = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
          resolve(out);
        } catch (e) {
          reject(e);
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}


