import type { RosterItem } from '@/utils/roster-service';

const A4_WIDTH = 794;
const A4_HEIGHT = 1123;
const SCALE = 2;
const PAGE_PAD = 40;
const ROW_H = 40;
const HEADER_H = 40;
const TABLE_GAP = 18;
const LINE_HEIGHT = 1.2;
const MIN_FONT = 6;
const CELL_PAD_X = 4;
const CELL_PAD_Y = 3;

const COL_WIDTHS = [0.04, 0.1, 0.14, 0.06, 0.32, 0.14, 0.14, 0.06];
const COL_ALIGN: Array<'center' | 'left'> = [
  'center',
  'center',
  'center',
  'center',
  'left',
  'center',
  'center',
  'center',
];
const HEADER_LABELS = ['', '성명', '생년월일', '성별', '주소', '전화번호', '비상연락처', '비고'];

export type DrawRosterInput = {
  items: RosterItem[];
  shipName: string;
  shipTon: string;
  desc01: string;
  desc02: string;
  onBoard: boolean;
  dateYear: string;
  dateMonth: string;
  dateDay: string;
  locations: string[];
  arrivalLabel: string;
  cellFontSize: number;
};

function roleLabel(role?: string) {
  if (role === 'captain') return '선장';
  if (role === 'sailor') return '선원';
  return '';
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  if (!text) return [];
  const lines: string[] = [];
  let current = '';
  for (const ch of text) {
    const next = current + ch;
    if (current && ctx.measureText(next).width > maxWidth) {
      lines.push(current);
      current = ch;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function fitLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxHeight: number,
  maxFont: number,
  wrap: boolean
): { lines: string[]; font: number } {
  let font = maxFont;
  while (font >= MIN_FONT) {
    ctx.font = `${font}px sans-serif`;
    const lines = wrap ? wrapText(ctx, text, maxWidth) : text ? [text] : [];
    const blockH = Math.max(lines.length, 1) * font * LINE_HEIGHT;
    const overflowW = lines.some((line) => ctx.measureText(line).width > maxWidth + 0.5);
    if (blockH <= maxHeight && !overflowW) return { lines, font };
    font -= 0.5;
  }
  ctx.font = `${MIN_FONT}px sans-serif`;
  return {
    lines: wrap ? wrapText(ctx, text, maxWidth) : text ? [text] : [],
    font: MIN_FONT,
  };
}

function drawCellText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  maxFont: number,
  align: 'center' | 'left',
  wrap: boolean,
  bold = false
) {
  const innerW = Math.max(8, w - CELL_PAD_X * 2);
  const innerH = Math.max(8, h - CELL_PAD_Y * 2);
  const { lines, font } = fitLines(ctx, text, innerW, innerH, maxFont, wrap);
  ctx.font = `${bold ? '700' : '400'} ${font}px sans-serif`;
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'middle';
  ctx.textAlign = align === 'center' ? 'center' : 'left';

  const lineH = font * LINE_HEIGHT;
  const blockH = lines.length * lineH;
  let ty = y + (h - blockH) / 2 + lineH / 2;
  const tx = align === 'center' ? x + w / 2 : x + CELL_PAD_X;

  for (const line of lines) {
    ctx.fillText(line, tx, ty, innerW);
    ty += lineH;
  }
}

export async function drawRosterImage(input: DrawRosterInput): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = A4_WIDTH * SCALE;
  canvas.height = A4_HEIGHT * SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas context unavailable');

  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, A4_WIDTH, A4_HEIGHT);
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'top';

  let y = PAGE_PAD;

  ctx.font = '400 12px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('■ 낚시 관리 및 육성법 시행규칙 [별지 제16호서식]', PAGE_PAD, y);
  y += 28;

  const title = '승 선 자 명 부';
  const ship = input.shipName ? `(${input.shipName})` : '';
  ctx.font = '700 34px sans-serif';
  const titleW = ctx.measureText(title).width;
  ctx.font = '700 28px sans-serif';
  const shipW = ship ? ctx.measureText(ship).width + 15 : 0;
  const titleX = (A4_WIDTH - titleW - shipW) / 2;
  ctx.font = '700 34px sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, titleX, y + 20);
  if (ship) {
    ctx.font = '700 28px sans-serif';
    ctx.fillText(ship, titleX + titleW + 15, y + 20);
  }
  y += 46;

  ctx.font = '400 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  if (input.desc01) ctx.fillText(input.desc01, A4_WIDTH / 2, y);
  y += 26;

  ctx.font = '400 16px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`(승선일 : ${input.dateYear} 년 ${input.dateMonth} 월 ${input.dateDay} 일)`, PAGE_PAD, y);
  ctx.textAlign = 'right';
  ctx.fillText(input.shipTon || '', A4_WIDTH - PAGE_PAD, y);
  y += 16 + TABLE_GAP;

  const tableX = PAGE_PAD;
  const tableW = A4_WIDTH - PAGE_PAD * 2;
  const colXs: number[] = [];
  const colWs = COL_WIDTHS.map((ratio) => tableW * ratio);
  colXs[0] = tableX;
  for (let i = 1; i < colWs.length; i++) colXs[i] = colXs[i - 1] + colWs[i - 1];

  const captainsAndCrew = input.items.filter((item) => item.role === 'captain' || item.role === 'sailor');
  const passengers = input.items.filter((item) => item.role !== 'captain' && item.role !== 'sailor');
  const rows: string[][] = [
    ...captainsAndCrew.map((item) => [
      '-',
      item.name || '',
      item.birth || '',
      item.gender || '',
      item.address || '',
      item.phone || '',
      item.emergency || '',
      roleLabel(item.role),
    ]),
    ...passengers.map((item, index) => [
      String(index + 1),
      item.name || '',
      item.birth || '',
      item.gender || '',
      item.address || '',
      item.phone || '',
      item.emergency || '',
      roleLabel(item.role),
    ]),
  ];
  while (rows.length < 15) rows.push(['', '', '', '', '', '', '', '']);

  const tableH = HEADER_H + rows.length * ROW_H;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(tableX, y, tableW, HEADER_H);
  ctx.strokeRect(tableX + 0.5, y + 0.5, tableW - 1, tableH - 1);

  ctx.beginPath();
  ctx.moveTo(tableX, y + HEADER_H);
  ctx.lineTo(tableX + tableW, y + HEADER_H);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.lineWidth = 1;

  for (let i = 1; i < colWs.length; i++) {
    ctx.beginPath();
    ctx.moveTo(colXs[i], y);
    ctx.lineTo(colXs[i], y + tableH);
    ctx.stroke();
  }

  HEADER_LABELS.forEach((label, i) => {
    drawCellText(ctx, label, colXs[i], y, colWs[i], HEADER_H, 12, 'center', false, true);
  });

  rows.forEach((cells, rowIndex) => {
    const ry = y + HEADER_H + rowIndex * ROW_H;
    ctx.beginPath();
    ctx.moveTo(tableX, ry + ROW_H);
    ctx.lineTo(tableX + tableW, ry + ROW_H);
    ctx.stroke();
    cells.forEach((value, i) => {
      drawCellText(
        ctx,
        value,
        colXs[i],
        ry,
        colWs[i],
        ROW_H,
        input.cellFontSize,
        COL_ALIGN[i],
        i === 4,
        false
      );
    });
  });

  y += tableH + 20;
  ctx.fillStyle = '#000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  if (input.onBoard) {
    ctx.font = '700 28px sans-serif';
    ctx.fillText('선 상', A4_WIDTH / 2, y);
    y += 44;
  }

  ctx.font = '700 16px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('위       치 :', A4_WIDTH / 2 - 4, y);
  ctx.font = '400 16px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(input.locations.join(', '), A4_WIDTH / 2 + 4, y);
  y += 24;

  ctx.font = '700 16px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('입항시간 :', A4_WIDTH / 2 - 4, y);
  ctx.font = '400 16px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(input.arrivalLabel, A4_WIDTH / 2 + 4, y);
  y += 36;

  if (input.desc02) {
    ctx.font = '400 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(input.desc02, A4_WIDTH / 2, y);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error('이미지 생성에 실패했습니다.'));
      else resolve(blob);
    }, 'image/jpeg', 0.92);
  });
}
