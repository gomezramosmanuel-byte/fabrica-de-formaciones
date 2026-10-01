import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';
import * as XLSX from 'xlsx';
import { GoogleGenAI, Type } from '@google/genai';
import {
  ClassifiedMaterialImage,
  ExtractedImageCategory,
  ExtractedMaterialPage,
  MaterialAnalysisSummary,
  ReferenceMaterialFormat,
  TrainingMaterial,
} from '../types/lms.ts';

export function detectFormatFromFileNameAndMime(
  fileName: string,
  mimeType?: string,
  fallback?: ReferenceMaterialFormat
): ReferenceMaterialFormat {
  const name = (fileName || '').toLowerCase().trim();
  const mime = (mimeType || '').toLowerCase().trim();

  if (
    mime.includes('spreadsheet') ||
    mime.includes('excel') ||
    mime.includes('csv') ||
    /\.(xlsx|xls|csv|tsv|ods)$/i.test(name)
  ) {
    return 'spreadsheet';
  }
  if (mime.includes('pdf') || /\.pdf$/i.test(name)) {
    return 'pdf';
  }
  if (
    mime.includes('presentation') ||
    mime.includes('powerpoint') ||
    /\.(pptx|ppt|odp|key)$/i.test(name)
  ) {
    return 'presentation';
  }
  if (
    mime.includes('word') ||
    mime.includes('opendocument.text') ||
    mime.includes('rtf') ||
    /\.(docx|doc|odt|rtf)$/i.test(name)
  ) {
    return 'document';
  }
  if (
    mime.startsWith('image/') ||
    /\.(png|jpg|jpeg|webp|gif|bmp|svg|tiff)$/i.test(name)
  ) {
    return 'image';
  }
  if (
    mime.startsWith('audio/') ||
    /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(name)
  ) {
    return 'audio';
  }
  if (
    mime.startsWith('video/') ||
    /\.(mp4|webm|mov|avi|mkv)$/i.test(name)
  ) {
    return 'video';
  }
  if (
    mime.startsWith('text/') ||
    mime.includes('json') ||
    mime.includes('xml') ||
    /\.(txt|md|markdown|json|xml|html|htm|yaml|yml|log|ini|sql)$/i.test(name)
  ) {
    return 'text';
  }

  return fallback || 'document';
}

export function parseDataUrlToBuffer(
  dataUrl?: string
): { buffer: Buffer; mimeType: string; base64: string } | null {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const trimmed = dataUrl.trim();
  const match = trimmed.match(/^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,([\s\S]+)$/i);
  if (match) {
    const mimeType = (match[1] || 'application/octet-stream').trim();
    const base64 = match[2].replace(/\s+/g, '');
    try {
      return {
        buffer: Buffer.from(base64, 'base64'),
        mimeType,
        base64,
      };
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Checks whether a line of text is genuine human-readable content
 * rather than raw PDF operators, glyph codes, or symbol noise.
 */
export function isCleanHumanReadableLine(line: string): boolean {
  const trimmed = (line || '').trim();
  if (!trimmed || trimmed.length < 2) return false;
  if (/^PRIVATE AND CONFIDENTIAL/i.test(trimmed)) return false;
  if (/^page\s+\d+$/i.test(trimmed)) return false;
  if (/^\d{1,3}$/.test(trimmed)) return false;

  // Reject raw PDF operators or streams
  if (
    /\b(?:endstream|endobj|FlateDecode|DCTDecode|FontDescriptor|begincmap|beginbfrange)\b/i.test(
      trimmed
    )
  ) {
    return false;
  }

  // Count letters/digits vs weird symbols
  const letters = (trimmed.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g) || []).length;
  const digits = (trimmed.match(/[0-9]/g) || []).length;
  const weirdSymbols = (trimmed.match(/[@#$^~`\\|<>{}_*+=]/g) || []).length;

  if (letters === 0 && digits < 2) return false;
  if (weirdSymbols > 3 && weirdSymbols / trimmed.length > 0.12) return false;

  // Reject strings like "jzízBxv+kTx/xjKRqzSBB" (high consonant/case-switch gibberish)
  const alphaRatio = (letters + digits) / trimmed.length;
  if (alphaRatio < 0.45) return false;

  // Check vowel presence in longer alphabetic words
  if (letters >= 10) {
    const vowels = (trimmed.match(/[AEIOUÁÉÍÓÚÜaeiouáéíóúü]/g) || []).length;
    if (vowels / letters < 0.16) return false;
  }

  return true;
}

/**
 * Inserts natural spaces into CamelCase or concatenated words from PDF runs
 * e.g. "CierredeempalmetipoDomoparafibraRibbon" -> "Cierre de empalme tipo Domo para fibra Ribbon"
 */
function normalizePdfExtractedLine(line: string): string {
  let s = line
    .replace(/\u0000/g, '')
    .replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g, '$1 $2')
    .replace(/([A-Za-zÁÉÍÓÚÑáéíóúñ])(\d)/g, (m, a, d) => {
      // Keep standard codes like G.652, FOSC400, R1, R3 together if short prefix
      if (/^[A-Z]{1,4}$/.test(a)) return m;
      return `${a} ${d}`;
    })
    .replace(/\s+/g, ' ')
    .trim();

  // Fix common concatenated Spanish prepositions in tight PDF kerning runs
  const commonFixes: Array<[RegExp, string]> = [
    [/\bdeempalme\b/gi, 'de empalme'],
    [/\btipoDomo\b/gi, 'tipo Domo'],
    [/\bparafibra\b/gi, 'para fibra'],
    [/\bpararetenci[oó]nde\b/gi, 'para retención de'],
    [/\bcintasespirales\b/gi, 'cintas espirales'],
    [/\bv[aá]lvuladetest\b/gi, 'válvula de test'],
    [/\byaccesoriopara\b/gi, 'y accesorio para'],
    [/\bfijaci[oó]na\b/gi, 'fijación a'],
    [/\bProcedaa\b/gi, 'Proceda a '],
    [/\balmacenarlasfibras\b/gi, 'almacenar las fibras '],
    [/\bnointervenidasenla\b/gi, 'no intervenidas en la '],
    [/\bBandejadealuminio\b/gi, 'Bandeja de aluminio '],
    [/\bysubaalabandeja\b/gi, 'y suba a la bandeja '],
    [/\balabandejaseg[uú]ncorresponda\b/gi, 'a la bandeja según corresponda'],
    [/\busandoelespiral\b/gi, 'usando el espiral'],
    [/\borganizarlareservade\b/gi, 'organizar la reserva de '],
    [/\benlaparteinferiordelabandeja\b/gi, 'en la parte inferior de la bandeja '],
    [/\bypresenteenel\b/gi, 'y presente en el '],
    [/\bmarqueycorteelexcedentede\b/gi, 'marque y corte el excedente de '],
    [/\bEviteusarlongitudesextra\b/gi, 'Evite usar longitudes extra'],
    [/\bcausarasaturaci[oó]n\b/gi, 'causará saturación'],
    [/\bIngreselas\b/gi, 'Ingrese las '],
    [/\balaBandejadetransici[oó]n\b/gi, 'a la Bandeja de transición '],
    [/\byapartirdeestaderiveacadabandeja\b/gi, 'y a partir de esta derive a cada bandeja'],
    [/\bUnavezcolocadastodaslafusionesenelportafusiones\b/gi, 'Una vez colocadas todas las fusiones en el porta fusiones '],
    [/\bgireelHolder\b/gi, 'gire el Holder '],
    [/\bgradosensupropioejecomosemuestraenlafiguraantesdecolocarloenlabandeja\b/gi, 'grados en su propio eje como se muestra en la figura antes de colocarlo en la bandeja'],
    [/\bFinalicelainstalacioncolocandoelHolderenposici[oó]nyorganizadolafibraenlabandeja\b/gi, 'Finalice la instalación colocando el Holder en posición y organizando la fibra en la bandeja'],
    [/\bLalongitudm[ií]nimadecortesebasaenelcortedelladomuertoalcampoquevadirectamentealabandeja\b/gi, 'La longitud mínima de corte se basa en el corte del lado muerto al campo que va directamente a la bandeja'],
    [/\bLalongitudm[aá]ximadecortesebasaenlaentradadelacestaalabandeja\b/gi, 'La longitud máxima de corte se basa en la entrada de la cesta a la bandeja'],
  ];
  for (const [rgx, rep] of commonFixes) {
    s = s.replace(rgx, rep);
  }
  return s.replace(/\s+/g, ' ').trim();
}

function makePngChunk(typeStr: string, dataBuf: Buffer): Buffer {
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(dataBuf.length, 0);
  const typeBuf = Buffer.from(typeStr, 'ascii');
  const body = Buffer.concat([typeBuf, dataBuf]);
  const crcBuf = Buffer.alloc(4);
  const crcVal = typeof zlib.crc32 === 'function' ? zlib.crc32(body) >>> 0 : 0;
  crcBuf.writeUInt32BE(crcVal, 0);
  return Buffer.concat([lenBuf, body, crcBuf]);
}

function flateImageToPngDataUrl(
  streamBuf: Buffer,
  width: number,
  height: number,
  colors: number,
  hasPredictor: boolean
): string | null {
  try {
    if (width <= 0 || height <= 0 || width > 4096 || height > 4096) return null;
    let idatData = streamBuf;
    if (!hasPredictor) {
      const rawPixels = zlib.inflateSync(streamBuf);
      const rowBytes = width * colors;
      if (rawPixels.length < rowBytes * height) return null;
      const filtered = Buffer.alloc((rowBytes + 1) * height);
      for (let y = 0; y < height; y++) {
        filtered[y * (rowBytes + 1)] = 0;
        rawPixels.copy(
          filtered,
          y * (rowBytes + 1) + 1,
          y * rowBytes,
          (y + 1) * rowBytes
        );
      }
      idatData = zlib.deflateSync(filtered);
    }
    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = colors === 1 ? 0 : 2;
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;
    const pngBuf = Buffer.concat([
      sig,
      makePngChunk('IHDR', ihdr),
      makePngChunk('IDAT', idatData),
      makePngChunk('IEND', Buffer.alloc(0)),
    ]);
    return `data:image/png;base64,${pngBuf.toString('base64')}`;
  } catch {
    return null;
  }
}

function decodePdfLiteralBytes(lit: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < lit.length; i++) {
    if (lit[i] === '\\') {
      i++;
      if (i >= lit.length) break;
      const c = lit[i];
      if (c === 'n') bytes.push(10);
      else if (c === 'r') bytes.push(13);
      else if (c === 't') bytes.push(9);
      else if (c === 'b') bytes.push(8);
      else if (c === 'f') bytes.push(12);
      else if (c === '(' || c === ')' || c === '\\') bytes.push(c.charCodeAt(0));
      else if (/[0-7]/.test(c)) {
        let oct = c;
        if (i + 1 < lit.length && /[0-7]/.test(lit[i + 1])) oct += lit[++i];
        if (i + 1 < lit.length && /[0-7]/.test(lit[i + 1])) oct += lit[++i];
        bytes.push(parseInt(oct, 8));
      } else {
        bytes.push(c.charCodeAt(0));
      }
    } else {
      bytes.push(lit.charCodeAt(i));
    }
  }
  return bytes;
}

/**
 * Extracts structured pages (title, bullet lines, and embedded real images in sequence)
 * from a PDF buffer using ToUnicode CMaps and XObject image streams.
 */
export function extractStructuredPagesFromPdfBuffer(buf: Buffer): {
  text: string;
  pages: ExtractedMaterialPage[];
} {
  const raw = buf.toString('latin1');
  const objects = new Map<number, { dict: string; streamBuf: Buffer | null }>();

  const objRegex = /(\d+)\s+0\s+obj\b([\s\S]*?)endobj/g;
  let m: RegExpExecArray | null;
  while ((m = objRegex.exec(raw)) !== null) {
    const id = Number(m[1]);
    const body = m[2];
    const streamIdx = body.indexOf('stream');
    const dict = streamIdx !== -1 ? body.slice(0, streamIdx) : body;
    let streamBuf: Buffer | null = null;
    if (streamIdx !== -1) {
      let sStart = m.index + m[0].indexOf('stream') + 6;
      if (raw[sStart] === '\r' && raw[sStart + 1] === '\n') sStart += 2;
      else if (raw[sStart] === '\n' || raw[sStart] === '\r') sStart += 1;
      const absEnd = raw.indexOf('endstream', sStart);
      if (absEnd !== -1) {
        let sEnd = absEnd;
        while (sEnd > sStart && (raw[sEnd - 1] === '\n' || raw[sEnd - 1] === '\r')) {
          sEnd--;
        }
        streamBuf = buf.subarray(sStart, sEnd);
      }
    }
    objects.set(id, { dict, streamBuf });
  }

  // 1. Parse all ToUnicode CMaps
  const cmapsByObj = new Map<number, Map<number, string>>();
  for (const [id, obj] of objects.entries()) {
    if (
      !obj.streamBuf ||
      obj.dict.includes('/Image') ||
      obj.dict.includes('/DCTDecode')
    ) {
      continue;
    }
    try {
      const dec = zlib.inflateSync(obj.streamBuf).toString('latin1');
      if (dec.includes('begincmap')) {
        const cmap = new Map<number, string>();
        for (const b of dec.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
          for (const p of b[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
            const code = parseInt(p[1], 16);
            const hexTarget = p[2];
            const chars =
              hexTarget
                .match(/.{1,4}/g)
                ?.map((h) => String.fromCodePoint(parseInt(h, 16)))
                .join('') || '';
            cmap.set(code, chars);
          }
        }
        for (const b of dec.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
          for (const r of b[1].matchAll(
            /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g
          )) {
            const startCode = parseInt(r[1], 16);
            const endCode = parseInt(r[2], 16);
            let targetCode = parseInt(r[3], 16);
            for (let c = startCode; c <= endCode; c++) {
              cmap.set(c, String.fromCodePoint(targetCode++));
            }
          }
        }
        if (cmap.size > 0) {
          cmapsByObj.set(id, cmap);
        }
      }
    } catch {
      // ignore non-flate or malformed stream
    }
  }

  // 2. Map Font Resource names (/R9, /R11, /F1, etc.) to their ToUnicode CMap
  const fontResourceToCmap = new Map<string, Map<number, string>>();
  for (const [id, obj] of objects.entries()) {
    const tuMatch = obj.dict.match(/\/ToUnicode\s+(\d+)\s+0\s+R/);
    if (tuMatch) {
      const cmap = cmapsByObj.get(Number(tuMatch[1]));
      if (cmap) {
        fontResourceToCmap.set(`R${id}`, cmap);
        fontResourceToCmap.set(`F${id}`, cmap);
      }
    }
  }
  for (const [, obj] of objects.entries()) {
    for (const rm of obj.dict.matchAll(
      /\/([A-Za-z0-9_]+)\s+(\d+)\s+0\s+R/g
    )) {
      const resName = rm[1];
      const targetObj = objects.get(Number(rm[2]));
      const tu = targetObj?.dict.match(/\/ToUnicode\s+(\d+)\s+0\s+R/);
      if (tu) {
        const cmap = cmapsByObj.get(Number(tu[1]));
        if (cmap) {
          fontResourceToCmap.set(resName, cmap);
        }
      }
    }
  }

  // 3. Collect page content streams and count image usage to filter repeated template watermarks
  const pageStreams: Array<{ id: number; dec: string; doRefs: string[] }> = [];
  const imgUsageCount = new Map<string, number>();

  for (const [id, obj] of objects.entries()) {
    if (
      !obj.streamBuf ||
      obj.dict.includes('/Image') ||
      obj.dict.includes('/DCTDecode') ||
      obj.dict.includes('/FontFile')
    ) {
      continue;
    }
    try {
      const dec = zlib.inflateSync(obj.streamBuf).toString('latin1');
      if (!dec.includes('BT') || !dec.includes('ET')) continue;
      const doRefs = Array.from(
        new Set(Array.from(dec.matchAll(/\/([A-Za-z0-9_]+)\s+Do/g)).map((x) => x[1]))
      );
      pageStreams.push({ id, dec, doRefs });
      for (const r of doRefs) {
        imgUsageCount.set(r, (imgUsageCount.get(r) || 0) + 1);
      }
    } catch {
      // ignore
    }
  }

  // 4. Decode each page's text and best embedded technical image in exact sequence
  const pages: ExtractedMaterialPage[] = [];

  pageStreams.forEach((ps, idx) => {
    const pageNumber = idx + 1;
    let currentCmap: Map<number, string> | null = null;
    const rawLines: string[] = [];

    const btBlocks = ps.dec.match(/BT[\s\S]*?ET/g) || [];
    for (const bt of btBlocks) {
      const tokenRegex =
        /\/([A-Za-z0-9_]+)\s+[\d.]+\s+Tf|\[((?:\\.|[^\]])*)\]\s*TJ|\(((?:\\.|[^\\()])*)\)\s*(?:Tj|'|"|\b)/g;
      let tm: RegExpExecArray | null;
      const lineParts: string[] = [];

      while ((tm = tokenRegex.exec(bt)) !== null) {
        if (tm[1]) {
          currentCmap = fontResourceToCmap.get(tm[1]) || null;
        } else if (tm[2] !== undefined) {
          for (const litMatch of tm[2].matchAll(/\(((?:\\.|[^\\()])*)\)/g)) {
            const bytes = decodePdfLiteralBytes(litMatch[1]);
            const decoded = bytes
              .map((b) =>
                currentCmap
                  ? currentCmap.get(b) || ''
                  : b >= 32 && b <= 126
                  ? String.fromCharCode(b)
                  : b >= 160
                  ? String.fromCharCode(b)
                  : ''
              )
              .join('');
            lineParts.push(decoded);
          }
        } else if (tm[3] !== undefined) {
          const bytes = decodePdfLiteralBytes(tm[3]);
          const decoded = bytes
            .map((b) =>
              currentCmap
                ? currentCmap.get(b) || ''
                : b >= 32 && b <= 126
                ? String.fromCharCode(b)
                : b >= 160
                ? String.fromCharCode(b)
                : ''
            )
            .join('');
          lineParts.push(decoded);
        }
      }

      const normalized = normalizePdfExtractedLine(lineParts.join(''));
      if (isCleanHumanReadableLine(normalized)) {
        rawLines.push(normalized);
      }
    }

    // Deduplicate consecutive identical lines on the same slide
    const cleanLines: string[] = [];
    for (const line of rawLines) {
      const stripped = line.replace(/^[•\-*]\s*/, '').trim();
      if (!stripped) continue;
      if (!cleanLines.includes(stripped)) {
        cleanLines.push(stripped);
      }
    }

    // Select all valid embedded images on this page (filtering repeated logos, headers/footers, tiny icons, and low-density backgrounds)
    const validPageImages: Array<{ url: string; area: number; w: number; h: number }> = [];

    for (const r of ps.doRefs) {
      const usage = imgUsageCount.get(r) || 0;
      if (pageStreams.length > 4 && usage > 3) {
        // Skip template header/footer logo or background repeated across slides (Section 3)
        continue;
      }
      const numId = Number(r.replace(/\D+/g, ''));
      const target = objects.get(numId);
      if (!target || !target.dict.includes('/Image') || !target.streamBuf) continue;
      const w = Number(target.dict.match(/\/Width\s+(\d+)/)?.[1] || 0);
      const h = Number(target.dict.match(/\/Height\s+(\d+)/)?.[1] || 0);
      // Discard extremely small decorative icons or thin header/footer bars (Section 3)
      if (w < 95 || h < 75) continue;
      const aspectRatio = w / Math.max(1, h);
      if (aspectRatio > 6.8 || aspectRatio < 0.14) continue;
      const area = w * h;

      if (target.dict.includes('/DCTDecode') && target.streamBuf.length > 2800) {
        validPageImages.push({
          url: `data:image/jpeg;base64,${target.streamBuf.toString('base64')}`,
          area,
          w,
          h,
        });
      } else if (target.dict.includes('/FlateDecode') && target.streamBuf.length > 4000) {
        const hasPred = /\/Predictor\s+1[0-5]/.test(target.dict);
        const colors = target.dict.includes('/DeviceGray') ? 1 : 3;
        const pngUrl = flateImageToPngDataUrl(target.streamBuf, w, h, colors, hasPred);
        if (pngUrl) {
          validPageImages.push({
            url: pngUrl,
            area,
            w,
            h,
          });
        }
      }
    }

    validPageImages.sort((a, b) => b.area - a.area);
    const bestImg = validPageImages[0];
    const bestImageUrl = bestImg?.url;
    const additionalImages = validPageImages.slice(1, 4).map((x) => x.url);

    if (cleanLines.length > 0 || bestImageUrl) {
      const title =
        cleanLines[0] || `Diapositiva ${pageNumber} del Material Técnico`;
      const bullets = cleanLines.slice(1);
      pages.push({
        page_number: pageNumber,
        title,
        bullets: bullets.length > 0 ? bullets : [title],
        raw_text: cleanLines.join('\n'),
        image_data_url: bestImageUrl,
        additional_images: additionalImages.length > 0 ? additionalImages : undefined,
        image_width: bestImg?.w,
        image_height: bestImg?.h,
        image_caption: `Figura técnica extraída de la diapositiva ${pageNumber}: ${title.slice(0, 80)}`,
      });
    }
  });

  const formattedPagesText = pages
    .map(
      (p) =>
        `=== DIAPOSITIVA / PÁGINA ${p.page_number}: ${p.title} ===\n` +
        p.bullets.map((b) => `• ${b}`).join('\n')
    )
    .join('\n\n');

  return {
    text: formattedPagesText,
    pages,
  };
}

/**
 * Extracts text AND embedded media images from ZIP-based Office documents (.docx, .pptx, .odt, .odp)
 */
function extractFromZipXmlDocument(
  buf: Buffer,
  fileName: string
): { text: string; pages: ExtractedMaterialPage[] } {
  try {
    const entries = new Map<string, Buffer>();
    let offset = 0;

    while (offset + 30 <= buf.length) {
      const sig = buf.readUInt32LE(offset);
      if (sig !== 0x04034b50) {
        offset++;
        continue;
      }

      const compressionMethod = buf.readUInt16LE(offset + 8);
      const compressedSize = buf.readUInt32LE(offset + 18);
      const fileNameLength = buf.readUInt16LE(offset + 26);
      const extraFieldLength = buf.readUInt16LE(offset + 28);
      const nameStart = offset + 30;
      const nameEnd = nameStart + fileNameLength;
      if (nameEnd > buf.length) break;

      const entryName = buf.subarray(nameStart, nameEnd).toString('utf8');
      const dataStart = nameEnd + extraFieldLength;
      const dataEnd = dataStart + compressedSize;
      if (dataEnd > buf.length || compressedSize === 0) {
        offset = Math.max(offset + 1, dataEnd);
        continue;
      }

      try {
        const rawSlice = buf.subarray(dataStart, dataEnd);
        let contentBuf: Buffer | null = null;
        if (compressionMethod === 0) {
          contentBuf = rawSlice;
        } else if (compressionMethod === 8) {
          contentBuf = zlib.inflateRawSync(rawSlice);
        }
        if (contentBuf) {
          entries.set(entryName, contentBuf);
        }
      } catch {
        // skip entry
      }

      offset = dataEnd;
    }

    // Collect non-duplicate, non-tiny media images inside ppt/media/ or word/media/
    const mediaImages: string[] = [];
    const seenZipHashes = new Set<string>();
    const sortedMediaKeys = Array.from(entries.keys())
      .filter((k) => /(?:ppt|word)\/media\/.*\.(?:png|jpg|jpeg)$/i.test(k))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    for (const mKey of sortedMediaKeys) {
      const imgBuf = entries.get(mKey);
      // Filter out tiny decorative icons or bullets (< 3.5 KB) and duplicates (Section 3)
      if (imgBuf && imgBuf.length > 3500) {
        const hash = crypto.createHash('sha256').update(imgBuf).digest('hex');
        if (seenZipHashes.has(hash)) continue;
        seenZipHashes.add(hash);
        const isPng = /\.png$/i.test(mKey);
        mediaImages.push(
          `data:${isPng ? 'image/png' : 'image/jpeg'};base64,${imgBuf.toString('base64')}`
        );
      }
    }

    const pages: ExtractedMaterialPage[] = [];
    const slideKeys = Array.from(entries.keys())
      .filter((k) => /^ppt\/slides\/slide\d+\.xml$/i.test(k))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    if (slideKeys.length > 0) {
      slideKeys.forEach((sKey, idx) => {
        const xml = entries.get(sKey)?.toString('utf8') || '';
        const textRuns = Array.from(xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g))
          .map((m) =>
            m[1]
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'")
              .trim()
          )
          .filter((t) => isCleanHumanReadableLine(t));

        if (textRuns.length > 0) {
          const title = textRuns[0];
          const bullets = textRuns.slice(1);
          pages.push({
            page_number: idx + 1,
            title,
            bullets: bullets.length > 0 ? bullets : [title],
            raw_text: textRuns.join('\n'),
            image_data_url: idx < mediaImages.length ? mediaImages[idx] : undefined,
            image_caption: `Recurso visual extraído de diapositiva ${idx + 1}: ${title.slice(0, 70)}`,
          });
        }
      });
    } else {
      // Word / ODT XML
      const xmlKeys = Array.from(entries.keys()).filter((k) =>
        /(?:word\/document\.xml|content\.xml)$/i.test(k)
      );
      const allLines: string[] = [];
      for (const xKey of xmlKeys) {
        const xml = entries.get(xKey)?.toString('utf8') || '';
        const paragraphs = xml
          .replace(/<\/w:p>/g, '\n')
          .replace(/<\/text:p>/g, '\n')
          .replace(/<[^>]+>/g, ' ')
          .split('\n')
          .map((l) => l.replace(/\s+/g, ' ').trim())
          .filter((l) => isCleanHumanReadableLine(l));
        allLines.push(...paragraphs);
      }
      // Group into pages of ~6 lines
      for (let i = 0; i < allLines.length; i += 6) {
        const chunk = allLines.slice(i, i + 6);
        const pageNum = Math.floor(i / 6) + 1;
        pages.push({
          page_number: pageNum,
          title: chunk[0] || `${fileName} - Sección ${pageNum}`,
          bullets: chunk.slice(1).length > 0 ? chunk.slice(1) : [chunk[0]],
          raw_text: chunk.join('\n'),
          image_data_url: mediaImages[pageNum - 1],
        });
      }
    }

    const formatted = pages
      .map(
        (p) =>
          `=== DIAPOSITIVA / SECCIÓN ${p.page_number}: ${p.title} ===\n` +
          p.bullets.map((b) => `• ${b}`).join('\n')
      )
      .join('\n\n');

    return { text: formatted, pages };
  } catch {
    return { text: '', pages: [] };
  }
}

/**
 * Extracts structured text from Excel / CSV / ODS spreadsheets using SheetJS (xlsx).
 */
function extractTextFromSpreadsheetBuffer(
  buf: Buffer,
  fileName: string
): { text: string; pages: ExtractedMaterialPage[] } {
  try {
    const workbook = XLSX.read(buf, { type: 'buffer', cellDates: true });
    const pages: ExtractedMaterialPage[] = [];

    workbook.SheetNames.forEach((sheetName, idx) => {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) return;
      const rows = XLSX.utils.sheet_to_json<any[]>(sheet, {
        header: 1,
        defval: '',
        blankrows: false,
      });
      if (!rows || rows.length === 0) return;

      const bullets: string[] = [];
      const maxRows = Math.min(rows.length, 60);
      for (let r = 0; r < maxRows; r++) {
        const rowCells = (rows[r] || [])
          .map((cell) => String(cell ?? '').replace(/\s+/g, ' ').trim())
          .filter(Boolean);
        if (rowCells.length > 0) {
          bullets.push(rowCells.join(' | '));
        }
      }
      if (bullets.length > 0) {
        pages.push({
          page_number: idx + 1,
          title: `Hoja ${idx + 1}: ${sheetName} (${fileName})`,
          bullets: bullets.slice(0, 12),
          raw_text: bullets.join('\n'),
        });
      }
    });

    const text = pages
      .map(
        (p) =>
          `=== ${p.title} ===\n` + p.bullets.map((b) => `• ${b}`).join('\n')
      )
      .join('\n\n');
    return { text, pages };
  } catch {
    return { text: '', pages: [] };
  }
}

const SPANISH_STOPWORDS = new Set([
  'para', 'como', 'este', 'esta', 'estos', 'estas', 'cada', 'todo', 'toda',
  'todos', 'todas', 'donde', 'cuando', 'entre', 'sobre', 'bajo', 'desde',
  'hasta', 'hacia', 'según', 'segun', 'durante', 'mediante', 'dentro',
  'fuera', 'antes', 'después', 'despues', 'solo', 'sólo', 'puede', 'pueden',
  'debe', 'deben', 'tiene', 'tienen', 'hacer', 'forma', 'parte', 'caso',
  'casos', 'tipo', 'tipos', 'uso', 'usar', 'usando', 'mismo', 'misma',
  'otros', 'otras', 'otro', 'otra', 'más', 'mas', 'menos', 'muy', 'sin',
  'con', 'por', 'una', 'uno', 'unos', 'unas', 'del', 'las', 'los', 'que',
]);

export function extractSemanticKeywords(text: string, maxCount = 12): string[] {
  const clean = (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9.\-/\s]/g, ' ');

  const tokens = clean.split(/\s+/).filter((w) => {
    if (w.length < 3) return false;
    if (SPANISH_STOPWORDS.has(w)) return false;
    return true;
  });

  const freq = new Map<string, number>();
  for (const t of tokens) {
    freq.set(t, (freq.get(t) || 0) + 1);
  }

  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxCount)
    .map(([word]) => word);
}

/**
 * Classifies an extracted image based on slide title, bullets, dimensions, and file metadata
 * into FOTOGRAFÍA, DIAGRAMA, ESQUEMA, ILUSTRACIÓN, TABLA, GRÁFICO, CAPTURA, LOGO, or OTRO.
 * Also detects decorative/non-pedagogical resources (Section 3 & Section 4).
 */
export function classifyExtractedImage(params: {
  pageTitle: string;
  pageBullets: string[];
  fileName: string;
  pageNumber: number;
  totalPages: number;
  width?: number;
  height?: number;
}): {
  category: ExtractedImageCategory;
  isPrimaryPedagogical: boolean;
  isCoverCandidate: boolean;
  isDiscarded: boolean;
  discardReason?: string;
  caption: string;
  keywords: string[];
  associatedConcepts: string[];
  relatedModule: string;
} {
  const combined = `${params.pageTitle} ${(params.pageBullets || []).join(' ')} ${params.fileName}`.toLowerCase();
  const titleLower = (params.pageTitle || '').toLowerCase().trim();

  let category: ExtractedImageCategory = 'ILUSTRACIÓN';
  let isDiscarded = false;
  let discardReason: string | undefined;

  // Section 3: Detect non-pedagogical resources (logos, thank you, headers/footers, decorative slides)
  if (
    /^(?:logo|marca|portada institucional|thank you|gracias|encuesta|contacto|preguntas\s*\??)$/i.test(
      titleLower
    ) ||
    (/(?:logo|marca|thank you|encuesta|contacto|derechos reservados|copyright)/i.test(combined) &&
      (params.pageBullets || []).length <= 1)
  ) {
    category = 'LOGO';
    isDiscarded = true;
    discardReason = 'Logo institucional, portada decorativa o cierre sin valor pedagógico';
  } else if (
    params.width &&
    params.height &&
    (params.width < 100 || params.height < 80)
  ) {
    category = 'OTRO';
    isDiscarded = true;
    discardReason = 'Icono decorativo o imagen extremadamente pequeña';
  } else if (
    /(?:tabla|table|dimensiones|maestra|sap|c[oó]digo|capacidad|rango|matriz|comparaci[oó]n|especificaci[oó]n|longitudes)/i.test(
      combined
    )
  ) {
    category = 'TABLA';
  } else if (
    /(?:gr[aá]fico|curva|estad[ií]stica|atenuaci[oó]n|tendencia|porcentaje|histograma|espectro)/i.test(
      combined
    )
  ) {
    category = 'GRÁFICO';
  } else if (
    /(?:procedimiento|paso a paso|secuencia|preparaci[oó]n|enrutamiento|transici[oó]n|asignando|acomodando|calcule|presente|gire|360|flujo|proceso)/i.test(
      combined
    )
  ) {
    category = /diagrama|flujo|secuencia|paso/i.test(combined) ? 'DIAGRAMA' : 'ESQUEMA';
  } else if (
    /(?:diagrama|esquema|arquitectura|topolog[ií]a|estructura|secci[oó]n transversal|dise[ñn]o|configuraci[oó]n)/i.test(
      combined
    )
  ) {
    category = /esquema|estructura|secci[oó]n/i.test(combined) ? 'ESQUEMA' : 'DIAGRAMA';
  } else if (
    /(?:captura|pantalla|software|sistema|interfaz|otdr|medici[oó]n| visor )/i.test(combined)
  ) {
    category = 'CAPTURA';
  } else if (
    /(?:cierre|domo|cable|bandeja|holder|fusi[oó]n|conector|cto|nap|instalaci[oó]n|campo|herramienta|peladora|espiral|fosc|foto|fibra|ribbon)/i.test(
      combined
    )
  ) {
    category = 'FOTOGRAFÍA';
  } else {
    category = params.pageNumber % 2 === 0 ? 'FOTOGRAFÍA' : 'DIAGRAMA';
  }

  const isPrimaryPedagogical =
    !isDiscarded &&
    (category === 'FOTOGRAFÍA' ||
      category === 'DIAGRAMA' ||
      category === 'ESQUEMA' ||
      category === 'ILUSTRACIÓN' ||
      category === 'TABLA' ||
      category === 'GRÁFICO' ||
      category === 'CAPTURA');

  const isCoverCandidate =
    isPrimaryPedagogical &&
    category !== 'TABLA' &&
    params.pageNumber >= 1 &&
    !/^(?:agenda|contenido|encuesta|thank you|tabla)/i.test(titleLower);

  const cleanTopic = (params.pageTitle || params.fileName || 'Elemento técnico')
    .replace(/\.[^.]+$/, '')
    .slice(0, 90);

  const keywords = extractSemanticKeywords(
    `${params.pageTitle} ${(params.pageBullets || []).join(' ')}`,
    14
  );

  const associatedConcepts = [
    params.pageTitle,
    ...(params.pageBullets || []).slice(0, 3).map((b) => b.slice(0, 80)),
  ].filter(Boolean);

  let relatedModule = 'Fundamentos y Componentes Técnicos';
  if (/(?:preparaci[oó]n|retenci[oó]n|bandeja|holder|360|procedimiento|paso|instalaci[oó]n)/i.test(combined)) {
    relatedModule = 'Procedimiento Operativo Paso a Paso';
  } else if (/(?:tabla|sap|maestra|dimensiones|longitud|rango)/i.test(combined)) {
    relatedModule = 'Especificaciones, Tablas y Maestra de Materiales';
  } else if (/(?:herramienta|equipo|fusi[oó]n|ribonizando|otdr)/i.test(combined)) {
    relatedModule = 'Herramientas, Equipos y Aplicación Práctica';
  }

  const caption = `[${category}] Pág. ${params.pageNumber} (${params.fileName}): ${cleanTopic}`;

  return {
    category,
    isPrimaryPedagogical,
    isCoverCandidate,
    isDiscarded,
    discardReason,
    caption,
    keywords,
    associatedConcepts,
    relatedModule,
  };
}

/**
 * Permanently stores the original uploaded file in /uploads/materials/
 * so original files are conserved on disk in addition to DB metadata.
 */
export function persistOriginalMaterialFile(params: {
  materialId?: string;
  fileName: string;
  buffer?: Buffer;
  rawText?: string;
}): {
  storagePath: string;
  persistentFileUrl?: string;
} {
  const safeName = (params.fileName || 'material_referencia.bin')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(-90);
  const idPrefix = (params.materialId || crypto.randomUUID()).slice(0, 12);
  const diskFileName = `${idPrefix}_${safeName}`;
  const uploadsDir = path.join(process.cwd(), 'uploads', 'materials');

  try {
    fs.mkdirSync(uploadsDir, { recursive: true });
    const fullPath = path.join(uploadsDir, diskFileName);
    if (params.buffer && params.buffer.length > 0) {
      fs.writeFileSync(fullPath, params.buffer);
      return {
        storagePath: `uploads/materials/${diskFileName}`,
        persistentFileUrl: `/uploads/materials/${encodeURIComponent(diskFileName)}`,
      };
    } else if (params.rawText && params.rawText.trim().length > 0) {
      fs.writeFileSync(fullPath, params.rawText, 'utf8');
      return {
        storagePath: `uploads/materials/${diskFileName}`,
        persistentFileUrl: `/uploads/materials/${encodeURIComponent(diskFileName)}`,
      };
    }
  } catch (err) {
    console.warn('Warning persisting original material file:', err);
  }

  return {
    storagePath: `uploads/materials/${diskFileName}`,
  };
}

export function buildClassifiedImagesFromPages(
  pages: ExtractedMaterialPage[],
  fileName: string,
  materialId?: string
): ClassifiedMaterialImage[] {
  const images: ClassifiedMaterialImage[] = [];
  const totalPages = pages.length;
  const seenDataUrlHashes = new Set<string>();

  for (const page of pages) {
    const pageImageUrls = [
      ...(page.image_data_url ? [page.image_data_url] : []),
      ...(page.additional_images || []),
    ];

    pageImageUrls.forEach((imgUrl, imgIdx) => {
      if (!imgUrl) return;
      const hash = crypto
        .createHash('sha256')
        .update(imgUrl.slice(0, 4096) + imgUrl.length)
        .digest('hex');

      const isDuplicate = seenDataUrlHashes.has(hash);
      seenDataUrlHashes.add(hash);

      const classification = classifyExtractedImage({
        pageTitle: page.title,
        pageBullets: page.bullets,
        fileName,
        pageNumber: page.page_number,
        totalPages,
        width: imgIdx === 0 ? page.image_width : undefined,
        height: imgIdx === 0 ? page.image_height : undefined,
      });

      if (imgIdx === 0) {
        page.image_category = classification.category;
        page.image_caption = classification.caption;
        page.keywords = classification.keywords;
      }

      const discarded = isDuplicate || classification.isDiscarded;
      const discardReason = isDuplicate
        ? 'Imagen duplicada en el mismo material de referencia'
        : classification.discardReason;

      const cleanTitle =
        imgIdx === 0
          ? page.title || `Recurso visual Pág. ${page.page_number}`
          : `${page.title} (Detalle técnico ${imgIdx + 1})`;

      images.push({
        id: `img-${materialId || 'mat'}-p${page.page_number}-${imgIdx + 1}`,
        source_material_id: materialId,
        source_file_name: fileName,
        page_number: page.page_number,
        source_section: `Página / Sección ${page.page_number}: ${page.title}`,
        image_url: imgUrl,
        category: classification.category,
        title: cleanTitle,
        caption: classification.caption,
        description:
          (page.bullets || []).slice(0, 2).join(' · ') || classification.caption,
        related_topic: page.title,
        related_module: classification.relatedModule,
        keywords: classification.keywords,
        associated_concepts: classification.associatedConcepts,
        width: imgIdx === 0 ? page.image_width : undefined,
        height: imgIdx === 0 ? page.image_height : undefined,
        is_cover_candidate: !discarded && classification.isCoverCandidate,
        is_primary_pedagogical: !discarded && classification.isPrimaryPedagogical,
        is_educational_priority: !discarded && classification.isPrimaryPedagogical,
        is_discarded: discarded,
        discard_reason: discardReason,
      });
    });
  }

  return images;
}

/**
 * Builds a deterministic, expert telecommunications & fiber optics summary from extracted pages/text
 */
function buildHeuristicAnalysisSummary(
  fileName: string,
  format: ReferenceMaterialFormat,
  extractedText: string,
  pages: ExtractedMaterialPage[],
  classifiedImages: ClassifiedMaterialImage[],
  extractionMethod: string
): MaterialAnalysisSummary {
  const cleanName = (fileName || 'Material_Formativo')
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const validLines = extractedText
    .split(/\n+/)
    .map((l) => l.replace(/^[•\-*=]+\s*/, '').trim())
    .filter((l) => l.length > 10 && !l.startsWith('===') && isCleanHumanReadableLine(l));

  const headings = pages.map((p) => p.title).filter((t) => isCleanHumanReadableLine(t));

  const detectedTitle =
    headings.find((h) => h.length >= 10 && h.length <= 85 && !/entrenamiento/i.test(h)) ||
    cleanName;

  const lower = extractedText.toLowerCase();
  let detectedCategory = 'Fibra Óptica y Telecomunicaciones';
  if (/ribbon|fosc|empalme|fusi[oó]n|otdr|ftth|g\.652|g\.657|bandeja|commscope/.test(lower)) {
    detectedCategory = 'Fibra Óptica y Planta Externa (OSP / FTTH)';
  } else if (/altura|sst|epcc|epp|riesgo|seguridad/.test(lower)) {
    detectedCategory = 'Seguridad Operativa y Trabajo en Alturas';
  } else if (/r1|normalizaci[oó]n|marquilla|c[oó]digo de colores/.test(lower)) {
    detectedCategory = 'Normalización de Red Exterior';
  }

  const keyConcepts =
    headings.length >= 3
      ? headings.slice(0, 10)
      : validLines.slice(0, 8).map((l) => l.slice(0, 95));

  const procedures = validLines
    .filter((l) =>
      /(?:proceda|ingrese|coloque|gire|verifique|comprueba|instale|organice|calcule|presente|paso|mm|fibras|bandeja|sap)/i.test(
        l
      )
    )
    .slice(0, 10);

  const realCases = validLines
    .filter((l) =>
      /(?:caso|en caso de|evite|no exceda|saturaci[oó]n|central core|derivaci[oó]n|360|rango de uso|9 a 25)/i.test(
        l
      )
    )
    .slice(0, 6);

  const learningObjectives = [
    `Dominar los fundamentos técnicos, componentes y especificaciones de ${detectedTitle}.`,
    `Ejecutar correctamente los procedimientos paso a paso e inspección visual descritos en ${cleanName}.`,
    `Identificar parámetros críticos, códigos de material y prevención de errores operativos en campo.`,
  ];

  const identifiedCompetencies = [
    `Dominio Técnico y Normativo (${detectedCategory})`,
    'Ejecución de Procedimientos Paso a Paso en Campo',
    'Diagnóstico Visual y Control de Calidad Operativa',
  ];

  const warningsAndBestPractices = validLines
    .filter((l) =>
      /(?:evite|no exceda|importante|nota|atenci[oó]n|saturaci[oó]n|rango|m[ií]nima|m[aá]xima|360)/i.test(
        l
      )
    )
    .slice(0, 6);

  const validImagesCount = classifiedImages.filter((img) => !img.is_discarded).length;
  const discardedCount = classifiedImages.filter((img) => img.is_discarded).length;

  const docSummary =
    pages.length > 0
      ? `Material técnico estructurado en ${pages.length} diapositivas/secciones en secuencia (${validImagesCount} recursos visuales pedagógicos extraídos y clasificados) sobre ${detectedTitle}: ${headings
          .slice(0, 5)
          .join(', ')}.`
      : validLines.slice(0, 3).join(' ').slice(0, 380) ||
        `Material técnico procesado (${cleanName}).`;

  return {
    detected_title: detectedTitle,
    detected_category: detectedCategory,
    document_summary: docSummary,
    summary: docSummary,
    key_concepts:
      keyConcepts.length > 0
        ? keyConcepts
        : [`Fundamentos técnicos de ${cleanName}`],
    detected_procedures:
      procedures.length > 0
        ? procedures
        : validLines.slice(0, 5),
    learning_objectives: learningObjectives,
    identified_competencies: identifiedCompetencies,
    warnings_and_best_practices: warningsAndBestPractices,
    real_cases_found:
      realCases.length > 0
        ? realCases
        : [`Aplicación práctica en campo de ${cleanName}`],
    character_count: extractedText.length,
    page_count: pages.length,
    extracted_images_count: validImagesCount,
    discarded_decorative_count: discardedCount,
    extraction_method: extractionMethod,
  };
}

export interface ExtractMaterialInput {
  materialId?: string;
  fileName: string;
  fileType?: ReferenceMaterialFormat;
  mimeType?: string;
  mediaDataUrl?: string;
  rawText?: string;
  courseTitle?: string;
  courseCategory?: string;
}

export interface ExtractMaterialResult {
  file_type: ReferenceMaterialFormat;
  extracted_text: string;
  extracted_pages: ExtractedMaterialPage[];
  extracted_images: ClassifiedMaterialImage[];
  classified_images: ClassifiedMaterialImage[];
  analysis_summary: MaterialAnalysisSummary;
  storage_path: string;
  persistent_file_url?: string;
  processing_status: 'PROCESADO' | 'ERROR';
}

export async function extractAndAnalyzeMaterial(
  input: ExtractMaterialInput
): Promise<ExtractMaterialResult> {
  const format = detectFormatFromFileNameAndMime(
    input.fileName,
    input.mimeType,
    input.fileType
  );

  let localText = (input.rawText || '')
    .split('\n')
    .filter((l) => isCleanHumanReadableLine(l) || l.startsWith('==='))
    .join('\n')
    .trim();
  let extractedPages: ExtractedMaterialPage[] = [];
  let extractionMethod = localText ? 'client_text' : 'local_parser';

  const parsedDataUrl = parseDataUrlToBuffer(input.mediaDataUrl);

  // Permanently conserve original file on disk (Section 2)
  const persisted = persistOriginalMaterialFile({
    materialId: input.materialId,
    fileName: input.fileName,
    buffer: parsedDataUrl?.buffer,
    rawText: input.rawText || localText,
  });

  if (parsedDataUrl && parsedDataUrl.buffer.length > 0) {
    const buf = parsedDataUrl.buffer;

    if (format === 'spreadsheet') {
      const sheetRes = extractTextFromSpreadsheetBuffer(buf, input.fileName);
      if (sheetRes.text) {
        localText = sheetRes.text;
        extractedPages = sheetRes.pages;
        extractionMethod = 'xlsx_spreadsheet_parser';
      }
    } else if (format === 'pdf') {
      const pdfRes = extractStructuredPagesFromPdfBuffer(buf);
      if (pdfRes.pages.length > 0) {
        localText = pdfRes.text;
        extractedPages = pdfRes.pages;
        extractionMethod = 'pdf_cmap_and_image_extractor';
      }
    } else if (format === 'document' || format === 'presentation') {
      if (buf.length >= 4 && buf.readUInt32LE(0) === 0x04034b50) {
        const zipRes = extractFromZipXmlDocument(buf, input.fileName);
        if (zipRes.pages.length > 0) {
          localText = zipRes.text;
          extractedPages = zipRes.pages;
          extractionMethod = 'openxml_zip_and_media_extractor';
        }
      }
    } else if (format === 'image' && input.mediaDataUrl) {
      extractedPages = [
        {
          page_number: 1,
          title: input.fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '),
          bullets: [
            `Recurso visual técnico cargado directamente: ${input.fileName}`,
            'Inspección de componentes, conectores, arquitectura o procedimiento en campo.',
          ],
          raw_text: localText || input.fileName,
          image_data_url: input.mediaDataUrl,
          image_caption: `Evidencia visual cargada: ${input.fileName}`,
        },
      ];
    } else if ((format === 'audio' || format === 'video') && input.mediaDataUrl) {
      extractedPages = [
        {
          page_number: 1,
          title: `Recurso Multimedia Operativo: ${input.fileName.replace(/\.[^.]+$/, '')}`,
          bullets: [
            `Archivo multimedia (${format.toUpperCase()}) integrado a la fuente de conocimiento: ${input.fileName}.`,
            localText || 'Secuencia audiovisual de demostración y verificación operativa.',
          ],
          raw_text: localText || input.fileName,
        },
      ];
    }
  }

  // Classify all extracted images (Sections 2, 3, 4)
  const extractedImages = buildClassifiedImagesFromPages(
    extractedPages,
    input.fileName,
    input.materialId
  );

  const analysisSummary = buildHeuristicAnalysisSummary(
    input.fileName,
    format,
    localText,
    extractedPages,
    extractedImages,
    extractionMethod
  );

  return {
    file_type: format,
    extracted_text: localText,
    extracted_pages: extractedPages,
    extracted_images: extractedImages,
    classified_images: extractedImages,
    analysis_summary: analysisSummary,
    storage_path: persisted.storagePath,
    persistent_file_url: persisted.persistentFileUrl,
    processing_status: 'PROCESADO',
  };
}

/**
 * Ensures every TrainingMaterial in an array has clean extracted_text,
 * sequential extracted_pages, and classified real images before course generation.
 */
export async function ensureMaterialsExtracted(
  materials: TrainingMaterial[],
  courseTitle?: string,
  courseCategory?: string
): Promise<TrainingMaterial[]> {
  if (!Array.isArray(materials) || materials.length === 0) return [];

  const enriched: TrainingMaterial[] = [];
  for (const mat of materials) {
    const existingLines = (mat.extracted_text || '')
      .split('\n')
      .filter((l) => l.trim().length > 0);
    const cleanCount = existingLines.filter(
      (l) => isCleanHumanReadableLine(l) || l.startsWith('===')
    ).length;
    const hasCorruptedText =
      existingLines.length > 0 && cleanCount / existingLines.length < 0.6;

    const needsExtraction =
      hasCorruptedText ||
      !mat.extracted_pages ||
      mat.extracted_pages.length === 0 ||
      (mat.extracted_text || '').trim().length < 120;

    if (needsExtraction && mat.media_data_url) {
      try {
        const result = await extractAndAnalyzeMaterial({
          materialId: mat.id,
          fileName: mat.file_name || mat.title || 'material',
          fileType: mat.file_type,
          mimeType: mat.mime_type,
          mediaDataUrl: mat.media_data_url,
          rawText: hasCorruptedText ? '' : mat.extracted_text,
          courseTitle,
          courseCategory,
        });
        enriched.push({
          ...mat,
          file_type: result.file_type,
          storage_path: result.storage_path || mat.storage_path,
          persistent_file_url: result.persistent_file_url || mat.persistent_file_url,
          processing_status: 'PROCESADO',
          extracted_text: result.extracted_text || mat.extracted_text,
          extracted_pages: result.extracted_pages,
          extracted_images: result.extracted_images,
          classified_images: result.classified_images,
          analysis_summary: result.analysis_summary,
        });
      } catch {
        enriched.push({
          ...mat,
          processing_status: mat.processing_status || 'PROCESADO',
        });
      }
    } else {
      const existingImgs =
        (mat.classified_images && mat.classified_images.length > 0
          ? mat.classified_images
          : mat.extracted_images) || [];
      const classifiedImages =
        existingImgs.length > 0
          ? existingImgs
          : buildClassifiedImagesFromPages(
              mat.extracted_pages || [],
              mat.file_name || mat.title || 'material',
              mat.id
            );
      enriched.push({
        ...mat,
        processing_status: mat.processing_status || 'PROCESADO',
        extracted_images: classifiedImages,
        classified_images: classifiedImages,
      });
    }
  }

  return enriched;
}
