'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import { IoChevronDownOutline, IoChevronUpOutline, IoPricetagOutline, IoTrashOutline } from 'react-icons/io5';
import { ADMIN_EDIT_ICON } from '@/lib/admin-icons';
import EmptyState from '@/components/EmptyState';
import { ohgoConfirm } from '@/lib/ohgo-dialog';
import {
  OHGO_FONT,
  OHGO_INPUT,
  OHGO_LIST,
  OHGO_LIST_DIVIDER,
  OHGO_PRIMARY_BTN,
} from '@/lib/page-styles';
import {
  createCategoryId,
  normalizeCategoryId,
  reassignCategorySlug,
  type BoardCategory,
  type BoardCategoryScope,
} from '@/utils/board-category-service';

const FONT = OHGO_FONT;

const LIST_CONTAINER: CSSProperties = {
  borderRadius: 14,
  border: '1px solid #EFEFEF',
  overflow: 'hidden',
  backgroundColor: '#FFFFFF',
};

const ROW_ACTION_BTN: CSSProperties = {
  minWidth: 56,
  height: 40,
  padding: '0 12px',
  border: 'none',
  borderRadius: 10,
  fontFamily: FONT,
  fontSize: 13,
  fontWeight: 700,
  lineHeight: 1,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};

type CategoryManagerProps = {
  scope: BoardCategoryScope;
  items: BoardCategory[];
  saving?: boolean;
  emptyMessage?: string;
  onSave: (next: BoardCategory[]) => Promise<void>;
};

export default function CategoryManager({
  scope,
  items,
  saving = false,
  emptyMessage = '등록된 카테고리가 없습니다.',
  onSave,
}: CategoryManagerProps) {
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editCode, setEditCode] = useState('');

  const persist = async (next: BoardCategory[]) => {
    await onSave(next.map((item, index) => ({ ...item, order: index })));
  };

  const uniqueCategoryId = (desired: string, exceptId?: string) => {
    let next = desired;
    let n = 2;
    while (items.some((item) => item.id === next && item.id !== exceptId)) {
      next = `${desired}-${n}`;
      n += 1;
    }
    return next;
  };

  const handleAdd = async () => {
    const label = draft.trim();
    if (!label) {
      alert('카테고리 이름을 입력해 주세요.');
      return;
    }
    if (items.some((item) => item.label === label)) {
      alert('이미 같은 이름의 카테고리가 있습니다.');
      return;
    }
    const code = uniqueCategoryId(normalizeCategoryId(label) || createCategoryId());
    setDraft('');
    await persist([
      ...items,
      { id: code, label, order: items.length, isActive: true },
    ]);
  };

  const handleRename = async (id: string) => {
    const label = editLabel.trim();
    const code = normalizeCategoryId(editCode);
    if (!label) {
      alert('카테고리 이름을 입력해 주세요.');
      return;
    }
    if (!code) {
      alert('값을 입력해 주세요.');
      return;
    }
    if (items.some((item) => item.id !== id && item.label === label)) {
      alert('이미 같은 이름의 카테고리가 있습니다.');
      return;
    }
    if (items.some((item) => item.id !== id && item.id === code)) {
      alert('이미 같은 값이 있습니다.');
      return;
    }
    if (code !== id) {
      if (
        !(await ohgoConfirm(
          '이 값을 바꾸면 기존 글의 분류도 함께 수정됩니다. 계속할까요?'
        ))
      ) {
        return;
      }
      await reassignCategorySlug(scope, id, code);
    }
    setEditingId(null);
    await persist(items.map((item) => (item.id === id ? { ...item, id: code, label } : item)));
  };

  const handleDelete = async (id: string) => {
    if (items.length <= 1) {
      alert('카테고리는 최소 1개 이상 있어야 합니다.');
      return;
    }
    if (!(await ohgoConfirm('이 카테고리를 삭제할까요?\n이미 등록된 글의 분류 값은 그대로 남습니다.'))) {
      return;
    }
    await persist(items.filter((item) => item.id !== id));
  };

  const handleToggle = async (id: string) => {
    const target = items.find((item) => item.id === id);
    if (!target) return;
    if (target.isActive && items.filter((item) => item.isActive).length <= 1) {
      alert('활성 카테고리는 최소 1개 이상 있어야 합니다.');
      return;
    }
    await persist(items.map((item) => (item.id === id ? { ...item, isActive: !item.isActive } : item)));
  };

  const handleMove = async (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(nextIndex, 0, moved);
    await persist(next);
  };

  return (
    <div>
      <div className="d-flex gap-2 mb-3">
        <input
          type="text"
          className="form-control"
          style={OHGO_INPUT}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="새 카테고리 이름"
          disabled={saving}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void handleAdd();
            }
          }}
        />
        <button
          type="button"
          className="btn flex-shrink-0 fw-semibold"
          style={{ ...OHGO_PRIMARY_BTN, padding: '10px 14px', opacity: saving ? 0.65 : 1 }}
          disabled={saving}
          onClick={() => void handleAdd()}
        >
          추가
        </button>
      </div>

      {items.length === 0 ? (
        <EmptyState icon={IoPricetagOutline} message={emptyMessage} compact />
      ) : (
        <div style={LIST_CONTAINER}>
          {items.map((item, index) => (
            <div key={item.id}>
              {index > 0 ? <div style={OHGO_LIST_DIVIDER} /> : null}
              <div className="ohgo-menu-list-row justify-content-between" style={{ alignItems: 'center' }}>
                <div className="min-w-0 flex-grow-1">
                  {editingId === item.id ? (
                    <div className="d-flex flex-column" style={{ gap: 8 }}>
                      <input
                        type="text"
                        className="form-control"
                        style={{ ...OHGO_INPUT, minHeight: 40 }}
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        disabled={saving}
                        placeholder="표시 이름"
                        autoFocus
                      />
                      <input
                        type="text"
                        className="form-control"
                        style={{ ...OHGO_INPUT, minHeight: 40 }}
                        value={editCode}
                        onChange={(e) => setEditCode(e.target.value)}
                        disabled={saving}
                        placeholder="gear"
                      />
                      <div className="d-flex gap-2">
                        <button
                          type="button"
                          className="btn flex-shrink-0"
                          style={{ ...ROW_ACTION_BTN, backgroundColor: '#237FFF', color: '#FFFFFF' }}
                          disabled={saving}
                          onClick={() => void handleRename(item.id)}
                        >
                          저장
                        </button>
                        <button
                          type="button"
                          className="btn flex-shrink-0"
                          style={{ ...ROW_ACTION_BTN, backgroundColor: '#EDF5FF', color: '#237FFF' }}
                          onClick={() => setEditingId(null)}
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="d-flex align-items-center gap-2 flex-wrap">
                        <span
                          style={{
                            fontSize: OHGO_LIST.titleSize,
                            fontWeight: OHGO_LIST.titleWeight,
                            color: '#1A1D1F',
                            fontFamily: FONT,
                          }}
                        >
                          {item.label}
                        </span>
                        {!item.isActive ? (
                          <span
                            className="badge rounded-pill"
                            style={{
                              backgroundColor: '#F7F8FA',
                              color: '#6F767E',
                              fontSize: 10,
                              fontFamily: FONT,
                              fontWeight: 700,
                            }}
                          >
                            숨김
                          </span>
                        ) : null}
                      </div>
                      <div style={{ fontSize: 11, color: '#ABABAB', fontFamily: FONT, marginTop: 4 }}>
                        {item.id}
                      </div>
                    </>
                  )}
                </div>
                {editingId === item.id ? null : (
                  <div className="d-flex gap-1 flex-shrink-0">
                    <IconBtn
                      title="위로"
                      disabled={saving || index === 0}
                      onClick={() => void handleMove(index, -1)}
                    >
                      <IoChevronUpOutline size={16} color="#6F767E" />
                    </IconBtn>
                    <IconBtn
                      title="아래로"
                      disabled={saving || index === items.length - 1}
                      onClick={() => void handleMove(index, 1)}
                    >
                      <IoChevronDownOutline size={16} color="#6F767E" />
                    </IconBtn>
                    <IconBtn
                      title={item.isActive ? '숨기기' : '보이기'}
                      disabled={saving}
                      bg={item.isActive ? '#E8F8EE' : '#F2F3F5'}
                      onClick={() => void handleToggle(item.id)}
                    >
                      <span style={{ fontSize: 10, fontWeight: 800, color: item.isActive ? '#2E7D32' : '#8A9199' }}>
                        {item.isActive ? 'ON' : 'OFF'}
                      </span>
                    </IconBtn>
                    <IconBtn
                      title="수정"
                      disabled={saving}
                      bg="#EBF1FE"
                      onClick={() => {
                        setEditingId(item.id);
                        setEditLabel(item.label);
                        setEditCode(item.id);
                      }}
                    >
                      <ADMIN_EDIT_ICON size={16} color="#1B6FF5" />
                    </IconBtn>
                    <IconBtn
                      title="삭제"
                      disabled={saving}
                      bg="#FFF0F0"
                      onClick={() => void handleDelete(item.id)}
                    >
                      <IoTrashOutline size={16} color="#FF3B30" />
                    </IconBtn>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function IconBtn({
  title,
  onClick,
  disabled,
  bg = '#F2F3F5',
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  bg?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="btn p-0 d-flex align-items-center justify-content-center rounded-circle flex-shrink-0"
      style={{ width: 32, height: 32, backgroundColor: bg, border: 'none', opacity: disabled ? 0.45 : 1 }}
    >
      {children}
    </button>
  );
}
