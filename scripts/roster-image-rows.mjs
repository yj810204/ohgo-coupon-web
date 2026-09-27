/** draw-roster-image.ts 표 칸. 성명·생년월일만 고른다. */

const A4_WIDTH = 794;
const PAGE_PAD = 40;
const TABLE_W = A4_WIDTH - PAGE_PAD * 2;
const COL_RATIOS = [0.04, 0.1, 0.14, 0.06, 0.32, 0.14, 0.14, 0.06];

export function normalizePersonName(name) {
  return String(name ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

export function personIdentityKey(name, dob) {
  const digits = String(dob ?? '').replace(/\D/g, '');
  return `${normalizePersonName(name)}|${digits}`;
}

export function birthDigits(text) {
  const digits = String(text ?? '').replace(/\D/g, '');
  if (digits.length === 8 || digits.length === 6) return digits;
  return '';
}

export function imageSize(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marker = buf[i + 1];
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      const length = buf.readUInt16BE(i + 2);
      i += 2 + length;
    }
  }
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf.length >= 24) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  return { width: 1588, height: 2246 };
}

export function columnRect(width, column) {
  const scale = width / A4_WIDTH;
  const tableX = PAGE_PAD * scale;
  const tableW = TABLE_W * scale;
  let x = tableX;
  for (let i = 0; i < column; i += 1) x += tableW * COL_RATIOS[i];
  return {
    left: Math.round(x),
    width: Math.max(8, Math.round(tableW * COL_RATIOS[column])),
  };
}

export function rowHeight(width) {
  return Math.max(24, Math.round(40 * (width / A4_WIDTH)));
}

export function cleanName(text) {
  const hangul = String(text ?? '').replace(/[^가-힣]/g, '');
  if (hangul.length < 2 || hangul.length > 5) return '';
  return hangul;
}

export async function recognizeRosterRows(worker, buf) {
  const { width, height } = imageSize(buf);
  await worker.setParameters({ tessedit_pageseg_mode: '6' });
  const page = await worker.recognize(buf, {}, { blocks: true });
  let headerBottom = 0;
  for (const block of page.data.blocks ?? []) {
    for (const para of block.paragraphs ?? []) {
      for (const line of para.lines ?? []) {
        const text = String(line.text ?? '').replace(/\s/g, '');
        if (!text.includes('성명') && !text.includes('생년월일')) continue;
        headerBottom = Math.max(headerBottom, line.bbox.y1);
      }
    }
  }
  if (!headerBottom) return [];

  const nameCol = columnRect(width, 1);
  const birthCol = columnRect(width, 2);
  const rowH = rowHeight(width);
  const inset = Math.max(6, Math.round(rowH * 0.08));
  await worker.setParameters({ tessedit_pageseg_mode: '7' });
  const rows = [];
  let empty = 0;
  for (let i = 0; i < 20; i += 1) {
    const top = headerBottom + 2 + i * rowH;
    if (top + rowH > height) break;
    const cell = (col) => ({
      left: col.left + inset,
      top,
      width: Math.max(8, col.width - inset * 2),
      height: Math.max(8, rowH - inset),
    });
    const nameRec = await worker.recognize(buf, { rectangle: cell(nameCol) });
    const birthRec = await worker.recognize(buf, { rectangle: cell(birthCol) });
    const name = cleanName(nameRec.data.text);
    const birth = birthDigits(birthRec.data.text);
    if (!name) {
      empty += 1;
      if (empty >= 2) break;
      continue;
    }
    empty = 0;
    rows.push({ name, birth });
  }
  return rows;
}

function columnRanges(width) {
  const scale = width / A4_WIDTH;
  const tableX = PAGE_PAD * scale;
  const tableW = TABLE_W * scale;
  let x = tableX;
  return COL_RATIOS.map((ratio) => {
    const start = x;
    x += tableW * ratio;
    return { start, end: x };
  });
}

function headerBox(words, label) {
  const compact = label.replace(/\s/g, '');
  return words.find((word) => String(word.text ?? '').replace(/\s/g, '').includes(compact)) ?? null;
}

function inRange(word, range) {
  const mid = (word.bbox.x0 + word.bbox.x1) / 2;
  return mid >= range.start && mid < range.end;
}

function groupRows(words) {
  const sorted = [...words].sort(
    (a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0
  );
  const groups = [];
  for (const word of sorted) {
    const mid = (word.bbox.y0 + word.bbox.y1) / 2;
    const height = Math.max(8, word.bbox.y1 - word.bbox.y0);
    const group = groups.find((row) => Math.abs(row.mid - mid) < height * 0.7);
    if (group) {
      group.words.push(word);
      group.mid = group.words.reduce((sum, item) => sum + (item.bbox.y0 + item.bbox.y1) / 2, 0) / group.words.length;
    } else {
      groups.push({ mid, words: [word] });
    }
  }
  return groups;
}

function joinText(words) {
  return words
    .slice()
    .sort((a, b) => a.bbox.x0 - b.bbox.x0)
    .map((word) => String(word.text ?? '').trim())
    .filter(Boolean)
    .join('');
}

/**
 * @param {{ text: string, bbox: { x0: number, y0: number, x1: number, y1: number } }[]} words
 * @param {number} width
 * @returns {{ name: string, birth: string }[]}
 */
export function rowsFromRosterWords(words, width) {
  const nameHeader = headerBox(words, '성명');
  const birthHeader = headerBox(words, '생년월일');
  const columns = columnRanges(width);
  const nameRange = nameHeader
    ? { start: nameHeader.bbox.x0 - 8, end: nameHeader.bbox.x1 + 8 }
    : columns[1];
  const birthRange = birthHeader
    ? { start: birthHeader.bbox.x0 - 8, end: birthHeader.bbox.x1 + 8 }
    : columns[2];
  const headerBottom = Math.max(nameHeader?.bbox.y1 ?? 0, birthHeader?.bbox.y1 ?? 0);

  const body = words.filter((word) => word.bbox.y0 > headerBottom + 2);
  const nameWords = body.filter((word) => inRange(word, nameRange));
  const birthWords = body.filter((word) => inRange(word, birthRange));
  const nameRows = groupRows(nameWords);

  return nameRows
    .map((row) => {
      const name = normalizePersonName(joinText(row.words));
      const births = birthWords.filter((word) => {
        const mid = (word.bbox.y0 + word.bbox.y1) / 2;
        return Math.abs(mid - row.mid) < 24;
      });
      return { name, birth: birthDigits(joinText(births)) };
    })
    .filter((row) => row.name && row.name !== '성명');
}
