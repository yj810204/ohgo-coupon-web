'use client';

import { IoQrCodeOutline } from 'react-icons/io5';

export const STAMP_PER_COUPON = 10;
export const STAMP_COUPON_TITLE = '스탬프 10개 적립 쿠폰';

const SEAL_NAME = '오고피씽';

/** 스탬프판 한 줄 칸 수. 줄마다 같은 수로 나눠지면 그 수로, 아니면 5칸씩 */
export function stampBoardCols(total: number): number {
  if (total <= 5) return Math.max(1, total);
  for (const cols of [5, 4, 3]) {
    if (total % cols === 0) return cols;
  }
  return 5;
}

/** 도장에 새길 이름. 공백을 빼고 4자까지, 4자면 두 줄 */
function sealLines(name: string): string[] {
  const compact = [...name.replace(/\s+/g, '')].slice(0, 4).join('');
  if (!compact) return ['도장'];
  const chars = [...compact];
  if (chars.length === 4) return [chars.slice(0, 2).join(''), chars.slice(2).join('')];
  return [compact];
}

function GoalIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h15A1.5 1.5 0 0 1 21 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16.5V14a2 2 0 0 0 0-4z" />
      <path d="M15 6v2M15 11v2M15 16v2" />
    </svg>
  );
}

export default function StampProgressCard({
  count,
  onQrScan,
  onCoupons,
  qrOpening = false,
}: {
  count: number;
  onQrScan: () => void;
  onCoupons: () => void;
  qrOpening?: boolean;
}) {
  const filled = Math.max(0, count);
  const onCount = Math.min(filled, STAMP_PER_COUPON);
  const dots = Array.from({ length: STAMP_PER_COUPON }, (_, i) => i + 1);
  const seal = sealLines(SEAL_NAME);

  return (
    <div className="ohgo-stamp-sum">
      <span className="ohgo-stamp-sum__label">모은 스탬프</span>
      <strong>
        {filled}
        <small>/ {STAMP_PER_COUPON}개</small>
      </strong>
      <div
        className="ohgo-stamp-board"
        style={{ ['--cols' as string]: stampBoardCols(STAMP_PER_COUPON) }}
        aria-label={`${onCount}개 / ${STAMP_PER_COUPON}개`}
      >
        {dots.map((i) => {
          const on = i <= onCount;
          const isGoal = i === STAMP_PER_COUPON;
          const isHalf = i === 5;
          return (
            <span
              key={i}
              className={`ohgo-stamp-board__cell${on ? ' is-on' : ''}${isGoal ? ' is-goal' : ''}${isHalf ? ' is-half' : ''}`}
            >
              <span className="ohgo-stamp-board__face">
                {on ? (
                  <span className={`ohgo-stamp-board__seal${isHalf ? ' is-mark' : seal.length > 1 ? ' is-two' : ''}`}>
                    {(isHalf ? ['50%'] : seal).map((line) => (
                      <span key={line}>{line}</span>
                    ))}
                  </span>
                ) : isGoal ? (
                  <GoalIcon />
                ) : isHalf ? (
                  <span className="ohgo-stamp-board__half">50%</span>
                ) : (
                  i
                )}
              </span>
            </span>
          );
        })}
      </div>
      <p className="ohgo-stamp-sum__rule">
        {STAMP_PER_COUPON}개를 모으면 &quot;{STAMP_COUPON_TITLE}&quot;을 드립니다.
      </p>
      <button
        type="button"
        className="ohgo-stamp-sum__qr"
        onClick={onQrScan}
        disabled={qrOpening}
      >
        <IoQrCodeOutline size={20} aria-hidden />
        {qrOpening ? '준비 중…' : 'QR 스캔으로 스탬프 적립'}
      </button>
      <button type="button" className="ohgo-stamp-sum__link" onClick={onCoupons}>
        내 쿠폰 보기
      </button>
    </div>
  );
}
