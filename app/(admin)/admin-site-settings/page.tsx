'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from '@/hooks/useAppRouter';
import { resolveAppUser } from '@/lib/auth-session';
import {
  getSiteSettings,
  saveSiteSettings,
  uploadPopupImage,
  MenuItem,
  DEFAULT_HOME_SECTIONS,
  DEFAULT_HOME_SECTION_ORDER,
  DEFAULT_APP_POPUP,
  HOME_SECTION_OPTIONS,
  normalizeHomeSectionOrder,
  isAppPopupContentReady,
  type AppPopupSettings,
  type HomeSectionId,
  type HomeSectionVisibility,
  type ReservationApprovalMode,
} from '@/utils/site-settings-service';
import { useImageEditQueue } from '@/hooks/useImageEditQueue';
import AppPopupSheet from '@/components/AppPopupSheet';
import { getIconComponent } from '@/utils/icon-mapper';
import {
  IoChevronUpOutline,
  IoChevronDownOutline,
  IoAddOutline,
  IoTrashOutline,
  IoSettingsOutline,
  IoMenuOutline,
  IoPhonePortraitOutline,
  IoEyeOutline,
  IoEyeOffOutline,
  IoCheckmarkCircle,
  IoBoatOutline,
  IoGridOutline,
  IoReorderTwoOutline,
  IoMegaphoneOutline,
  IoLockClosedOutline,
  IoWaterOutline,
} from 'react-icons/io5';
import {
  DEFAULT_TIDE_REGION_ID,
  TIDE_REGIONS,
  normalizeTideRegionId,
} from '@/lib/dadaepo-tide';
import { ADMIN_EDIT_ICON } from '@/lib/admin-icons';
import SubPageFrame from '@/components/SubPageFrame';
import {
  OhgoPageLoading,
  OHGO_CARD,
  OHGO_FONT,
  OHGO_INPUT,
  OHGO_CONFIRM_BTN_CLASS,
  OHGO_PRIMARY_BTN,
  OHGO_SECONDARY_BTN,
  OHGO_LIST,
  OHGO_LIST_DIVIDER,
  ohgoListRowStyle,
} from '@/lib/page-styles';
import EmptyState from '@/components/EmptyState';
import { ohgoConfirm } from '@/lib/ohgo-dialog';

const ImageEditor = dynamic(() => import('@/components/ImageEditor'), { ssr: false });

const CARD: React.CSSProperties = { ...OHGO_CARD };

const ADMIN_ICON_TILE_BG = '#F7F8FA';

function MenuIconTile({
  item,
  IconComponent,
  rounded = 'circle',
}: {
  item: MenuItem;
  IconComponent: ReturnType<typeof getIconComponent>;
  rounded?: 'circle' | 'square';
}) {
  const radius = rounded === 'circle' ? '50%' : 12;
  return (
    <div
      className="d-flex align-items-center justify-content-center flex-shrink-0"
      style={{ width: 44, height: 44, borderRadius: radius, backgroundColor: ADMIN_ICON_TILE_BG }}
    >
      {IconComponent ? (
        <IconComponent size={22} color={item.color} />
      ) : (
        <IoSettingsOutline size={22} color={item.color} />
      )}
    </div>
  );
}

const LABEL: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: '#6F767E',
  fontFamily: OHGO_FONT,
  marginBottom: 6,
  display: 'block',
};

const HINT: React.CSSProperties = {
  fontSize: OHGO_LIST.metaSize,
  color: '#6F767E',
  fontFamily: OHGO_FONT,
  lineHeight: 1.5,
};

function moveHomeSectionId(
  order: HomeSectionId[],
  fromId: HomeSectionId,
  toId: HomeSectionId
): HomeSectionId[] {
  if (fromId === toId) return order;
  const from = order.indexOf(fromId);
  const to = order.indexOf(toId);
  if (from < 0 || to < 0) return order;
  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, fromId);
  return next;
}

const HOME_MENU_ITEM: MenuItem = {
  id: 'home',
  label: '홈',
  path: '/main',
  iconName: 'IoHomeOutline',
  color: '#1B6FF5',
  order: -1,
  isActive: true,
};

function SectionHeader({
  icon: Icon,
  title,
  action,
}: {
  icon: React.ComponentType<{ size: number; color: string }>;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="d-flex align-items-center justify-content-between mb-3">
      <div className="d-flex align-items-center gap-2">
        <div
          className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
          style={{ width: 36, height: 36, backgroundColor: '#EBF1FE' }}
        >
          <Icon size={18} color="#1B6FF5" />
        </div>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#1A1D1F', fontFamily: OHGO_FONT }}>{title}</span>
      </div>
      {action}
    </div>
  );
}

function AdminSiteSettingsContent() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [siteName, setSiteName] = useState('');
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [bottomTabMenuIds, setBottomTabMenuIds] = useState<string[]>([]);
  const [reservationEnabled, setReservationEnabled] = useState(false);
  const [reservationApprovalMode, setReservationApprovalMode] =
    useState<ReservationApprovalMode>('manual');
  const [homeSections, setHomeSections] = useState<HomeSectionVisibility>({
    ...DEFAULT_HOME_SECTIONS,
  });
  const [homeSectionOrder, setHomeSectionOrder] = useState<HomeSectionId[]>([
    ...DEFAULT_HOME_SECTION_ORDER,
  ]);
  const [appPopup, setAppPopup] = useState<AppPopupSettings>({ ...DEFAULT_APP_POPUP });
  const [tideRegionId, setTideRegionId] = useState(DEFAULT_TIDE_REGION_ID);
  const [adminGateEnabled, setAdminGateEnabled] = useState(true);
  const [adminGatePasswordConfigured, setAdminGatePasswordConfigured] = useState(true);
  const [adminGatePassword, setAdminGatePassword] = useState('');
  const [adminGatePasswordConfirm, setAdminGatePasswordConfirm] = useState('');
  const [popupPreview, setPopupPreview] = useState(false);
  const [popupUploading, setPopupUploading] = useState(false);
  const [draggingSectionId, setDraggingSectionId] = useState<HomeSectionId | null>(null);
  const homeSectionOrderRef = useRef(homeSectionOrder);
  const draggingSectionIdRef = useRef<HomeSectionId | null>(null);
  const homeSectionRowRefs = useRef<Partial<Record<HomeSectionId, HTMLDivElement | null>>>({});
  homeSectionOrderRef.current = homeSectionOrder;

  useEffect(() => {
    const checkAuth = async () => {
      const appUser = await resolveAppUser();
      if (!appUser) {
        router.replace('/login');
        return;
      }

      if (!appUser.isAdmin) {
        router.replace('/main');
        return;
      }

      await loadSettings();
      setLoading(false);
    };
    checkAuth();
  }, [router]);

  const loadSettings = async () => {
    try {
      const settings = await getSiteSettings();
      setSiteName(settings.siteName);
      setMenuItems(settings.userMenuItems.sort((a, b) => a.order - b.order));
      setBottomTabMenuIds([...(new Set(settings.bottomTabMenuIds || []))]);
      setReservationEnabled(Boolean(settings.reservationEnabled));
      setReservationApprovalMode(settings.reservationApprovalMode ?? 'manual');
      setHomeSections(settings.homeSections);
      setHomeSectionOrder(normalizeHomeSectionOrder(settings.homeSectionOrder));
      setAppPopup(settings.appPopup);
      setTideRegionId(normalizeTideRegionId(settings.tideRegionId));
      try {
        const res = await fetch('/api/admin-gate', { credentials: 'include' });
        const data = (await res.json()) as { enabled?: boolean; passwordConfigured?: boolean };
        setAdminGatePasswordConfigured(data.passwordConfigured !== false);
        if (typeof settings.adminGateEnabled === 'boolean') {
          setAdminGateEnabled(settings.adminGateEnabled);
        } else {
          setAdminGateEnabled(data.enabled === true);
        }
      } catch {
        if (typeof settings.adminGateEnabled === 'boolean') {
          setAdminGateEnabled(settings.adminGateEnabled);
        }
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      alert('설정을 불러오는 중 오류가 발생했습니다.');
    }
  };

  const uploadPopupFiles = useCallback(async (edited: File[]) => {
    const file = edited[0];
    if (!file) return;
    setPopupUploading(true);
    try {
      const url = await uploadPopupImage(file);
      setAppPopup((prev) => ({ ...prev, imageUrl: url }));
    } catch (err) {
      console.error(err);
      alert('이미지 업로드에 실패했습니다.');
    } finally {
      setPopupUploading(false);
    }
  }, []);

  const popupEditQueue = useImageEditQueue((edited) => {
    void uploadPopupFiles(edited);
  });

  const applyHomeSectionDrop = (clientY: number) => {
    const draggingId = draggingSectionIdRef.current;
    if (!draggingId) return;
    const order = homeSectionOrderRef.current;
    let targetId = draggingId;
    for (const id of order) {
      const el = homeSectionRowRefs.current[id];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        targetId = id;
        break;
      }
      targetId = id;
    }
    const next = moveHomeSectionId(order, draggingId, targetId);
    if (next !== order) setHomeSectionOrder(next);
  };

  const handleHomeSectionPointerDown = (sectionId: HomeSectionId, event: React.PointerEvent<HTMLButtonElement>) => {
    if (saving) return;
    if (event.pointerType === 'mouse') return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingSectionIdRef.current = sectionId;
    setDraggingSectionId(sectionId);
  };

  const handleHomeSectionPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!draggingSectionIdRef.current) return;
    applyHomeSectionDrop(event.clientY);
  };

  const handleHomeSectionPointerEnd = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    draggingSectionIdRef.current = null;
    setDraggingSectionId(null);
  };

  const handleHomeSectionDragStart = (sectionId: HomeSectionId, event: React.DragEvent<HTMLButtonElement>) => {
    if (saving) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', sectionId);
    draggingSectionIdRef.current = sectionId;
    setDraggingSectionId(sectionId);
  };

  const handleHomeSectionDragOver = (sectionId: HomeSectionId, event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const fromId = draggingSectionIdRef.current;
    if (!fromId) return;
    const next = moveHomeSectionId(homeSectionOrderRef.current, fromId, sectionId);
    if (next !== homeSectionOrderRef.current) setHomeSectionOrder(next);
  };

  const handleHomeSectionDrop = (sectionId: HomeSectionId, event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const fromId = (event.dataTransfer.getData('text/plain') as HomeSectionId) || draggingSectionIdRef.current;
    if (fromId) {
      setHomeSectionOrder(prev => moveHomeSectionId(prev, fromId, sectionId));
    }
    draggingSectionIdRef.current = null;
    setDraggingSectionId(null);
  };

  const handleHomeSectionDragEnd = () => {
    draggingSectionIdRef.current = null;
    setDraggingSectionId(null);
  };

  const handleSaveSiteName = async () => {
    if (!siteName.trim()) {
      alert('사이트 이름을 입력해주세요.');
      return;
    }

    try {
      setSaving(true);
      await saveSiteSettings({ siteName: siteName.trim() });
      alert('사이트 이름이 저장되었습니다.');
    } catch (error: any) {
      console.error('Error saving site name:', error);
      alert(error.message || '사이트 이름 저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMenuItem = async (itemId: string) => {
    if (!(await ohgoConfirm('이 메뉴를 삭제하시겠습니까?'))) {
      return;
    }

    try {
      setSaving(true);
      const updatedMenuItems = menuItems.filter(item => item.id !== itemId);
      await saveSiteSettings({ userMenuItems: updatedMenuItems });
      await loadSettings();
      alert('메뉴가 삭제되었습니다.');
    } catch (error: any) {
      console.error('Error deleting menu item:', error);
      alert(error.message || '메뉴 삭제 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleMenuItemActive = async (item: MenuItem) => {
    try {
      setSaving(true);
      const updatedMenuItems = menuItems.map(menuItem =>
        menuItem.id === item.id
          ? { ...menuItem, isActive: !menuItem.isActive }
          : menuItem
      );
      await saveSiteSettings({ userMenuItems: updatedMenuItems });
      await loadSettings();
    } catch (error: any) {
      console.error('Error toggling menu item active:', error);
      alert('상태 변경 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleMoveMenuItem = async (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= menuItems.length) return;

    try {
      setSaving(true);
      const updatedMenuItems = [...menuItems];
      const temp = updatedMenuItems[index];
      updatedMenuItems[index] = updatedMenuItems[newIndex];
      updatedMenuItems[newIndex] = temp;

      // order 재정렬
      updatedMenuItems.forEach((item, i) => {
        item.order = i;
      });

      await saveSiteSettings({ userMenuItems: updatedMenuItems });
      await loadSettings();
    } catch (error: any) {
      console.error('Error moving menu item:', error);
      alert('순서 변경 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const activeMenuItems = menuItems.filter(item => item.isActive).sort((a, b) => a.order - b.order);

  const toggleBottomTab = (id: string, checked: boolean) => {
    if (checked) {
      if (bottomTabMenuIds.length < 5 && !bottomTabMenuIds.includes(id)) {
        setBottomTabMenuIds([...bottomTabMenuIds, id]);
      }
    } else {
      setBottomTabMenuIds(bottomTabMenuIds.filter(x => x !== id));
    }
  };

  // 홈은 하단 탭 전용 고정 항목. 사용자 메뉴에 같은 id가 있어도 한 번만 노출한다.
  const tabPickerItems = [
    HOME_MENU_ITEM,
    ...activeMenuItems.filter(item => item.id !== HOME_MENU_ITEM.id),
  ];

  const renderTabPickerRow = (item: MenuItem, index: number) => {
    const IconComponent = getIconComponent(item.iconName);
    const isSelected = bottomTabMenuIds.includes(item.id);
    const canSelect = isSelected || bottomTabMenuIds.length < 5;

    return (
      <div key={item.id}>
        {index > 0 && <div style={OHGO_LIST_DIVIDER} />}
      <label
        htmlFor={`bottom-tab-${item.id}`}
        className="ohgo-menu-list-row mb-0"
        style={{
          ...ohgoListRowStyle({ selected: isSelected, muted: !isSelected }),
          opacity: canSelect ? 1 : 0.5,
          cursor: canSelect || isSelected ? 'pointer' : 'not-allowed',
        }}
      >
        <input
          className="form-check-input flex-shrink-0 m-0"
          type="checkbox"
          id={`bottom-tab-${item.id}`}
          checked={isSelected}
          onChange={e => toggleBottomTab(item.id, e.target.checked)}
          disabled={!canSelect && !isSelected}
          style={{ width: 18, height: 18, accentColor: '#1B6FF5' }}
        />
        <MenuIconTile item={item} IconComponent={IconComponent} rounded="square" />
        <div className="flex-grow-1 min-w-0 py-1">
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1D1F', fontFamily: OHGO_FONT }}>{item.label}</div>
          <div style={{ fontSize: 12, color: '#6F767E', fontFamily: OHGO_FONT }}>{item.path}</div>
        </div>
        {isSelected ? (
          <IoCheckmarkCircle size={22} color="#1B6FF5" className="flex-shrink-0" />
        ) : !canSelect ? (
          <span
            className="badge rounded-pill flex-shrink-0"
            style={{ backgroundColor: '#F7F8FA', color: '#6F767E', fontSize: 10, fontFamily: OHGO_FONT }}
          >
            최대 5개
          </span>
        ) : null}
      </label>
      </div>
    );
  };

  const resolveOrderItem = (menuId: string): MenuItem | undefined => {
    if (menuId === 'home') return HOME_MENU_ITEM;
    return menuItems.find(m => m.id === menuId);
  };

  if (loading) {
    return <OhgoPageLoading />;
  }

  return (
    <SubPageFrame title="사이트 설정">
        <div className="p-4 mb-4" style={CARD}>
          <SectionHeader icon={IoSettingsOutline} title="사이트 이름" />
          <label htmlFor="site-name" style={LABEL}>
            표시 이름
          </label>
          <input
            id="site-name"
            type="text"
            className="form-control"
            value={siteName}
            onChange={e => setSiteName(e.target.value)}
            placeholder="사이트 이름을 입력하세요"
            disabled={saving}
            style={OHGO_INPUT}
          />
          <p className="mb-0 mt-2" style={HINT}>
            브라우저 탭 제목과 메인 페이지 헤더에 표시됩니다.
          </p>
          <button
            type="button"
            className={`btn w-100 fw-semibold mt-3 ${OHGO_CONFIRM_BTN_CLASS}`}
            onClick={handleSaveSiteName}
            disabled={saving || !siteName.trim()}
            style={OHGO_PRIMARY_BTN}
          >
            {saving ? (
              <>
                <span className="spinner-border spinner-border-sm me-2 text-white" role="status" />
                저장 중...
              </>
            ) : (
              '사이트 이름 저장'
            )}
          </button>
        </div>

        <div className="p-4 mb-4" style={CARD}>
          <SectionHeader icon={IoLockClosedOutline} title="관리자 확인" />
          <p className="mb-3" style={HINT}>
            켜면 관리자 메뉴에 들어갈 때 비밀번호를 한 번 더 묻습니다. 비밀번호는 이 화면에서 정합니다.
          </p>
          <div className="form-check form-switch mb-3">
            <input
              className="form-check-input"
              type="checkbox"
              role="switch"
              id="admin-gate-enabled"
              checked={adminGateEnabled}
              onChange={(e) => {
                const next = e.target.checked;
                setAdminGateEnabled(next);
                if (!next) {
                  setAdminGatePassword('');
                  setAdminGatePasswordConfirm('');
                }
              }}
              disabled={saving}
            />
            <label
              className="form-check-label"
              htmlFor="admin-gate-enabled"
              style={{ fontFamily: OHGO_FONT, fontSize: 14 }}
            >
              관리자 확인 사용
            </label>
          </div>
          {adminGateEnabled ? (
            <>
              <label htmlFor="admin-gate-password" style={LABEL}>
                비밀번호
              </label>
              <input
                id="admin-gate-password"
                type="password"
                className="form-control mb-3"
                value={adminGatePassword}
                onChange={(e) => setAdminGatePassword(e.target.value)}
                autoComplete="new-password"
                placeholder={adminGatePasswordConfigured ? '변경할 때만 입력' : '비밀번호 입력'}
                disabled={saving}
                style={OHGO_INPUT}
              />
              <label htmlFor="admin-gate-password-confirm" style={LABEL}>
                비밀번호 확인
              </label>
              <input
                id="admin-gate-password-confirm"
                type="password"
                className="form-control mb-3"
                value={adminGatePasswordConfirm}
                onChange={(e) => setAdminGatePasswordConfirm(e.target.value)}
                autoComplete="new-password"
                placeholder={adminGatePasswordConfigured ? '변경할 때만 입력' : '비밀번호 다시 입력'}
                disabled={saving}
                style={OHGO_INPUT}
              />
              <p className="mb-3" style={HINT}>
                {adminGatePasswordConfigured
                  ? '이미 비밀번호가 있습니다. 바꿀 때만 입력하고 저장하세요.'
                  : '켜 둔 상태로 저장하려면 비밀번호를 입력하세요. 4자 이상.'}
              </p>
            </>
          ) : null}
          <button
            type="button"
            className={`btn w-100 fw-semibold ${OHGO_CONFIRM_BTN_CLASS}`}
            onClick={async () => {
              try {
                if (adminGateEnabled) {
                  if (adminGatePassword || adminGatePasswordConfirm) {
                    if (adminGatePassword !== adminGatePasswordConfirm) {
                      alert('비밀번호 확인이 일치하지 않습니다.');
                      return;
                    }
                    if (adminGatePassword.trim().length < 4) {
                      alert('비밀번호는 4자 이상이어야 합니다.');
                      return;
                    }
                  } else if (!adminGatePasswordConfigured) {
                    alert('관리자 확인을 켜려면 비밀번호를 입력해 주세요.');
                    return;
                  }
                }
                setSaving(true);
                const res = await fetch('/api/admin-gate', {
                  method: 'PUT',
                  credentials: 'include',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    enabled: adminGateEnabled,
                    password: adminGatePassword,
                    passwordConfirm: adminGatePasswordConfirm,
                  }),
                });
                const data = (await res.json()) as { error?: string; passwordConfigured?: boolean };
                if (!res.ok) {
                  alert(data.error || '저장 중 오류가 발생했습니다.');
                  return;
                }
                setAdminGatePasswordConfigured(data.passwordConfigured !== false);
                setAdminGatePassword('');
                setAdminGatePasswordConfirm('');
                alert(
                  adminGateEnabled
                    ? adminGatePassword.trim()
                      ? '관리자 확인과 비밀번호를 저장했습니다. 다음부터 이 비밀번호를 묻습니다.'
                      : '관리자 확인을 사용합니다. 다음부터 비밀번호를 묻습니다.'
                    : '관리자 확인을 끄었습니다. 관리자 메뉴에 바로 들어갑니다.'
                );
              } catch (error) {
                console.error(error);
                alert('저장 중 오류가 발생했습니다.');
              } finally {
                setSaving(false);
              }
            }}
            disabled={saving}
            style={OHGO_PRIMARY_BTN}
          >
            {saving ? '저장 중...' : '관리자 확인 저장'}
          </button>
        </div>

        <div className="p-4 mb-4" style={CARD}>
          <SectionHeader icon={IoMegaphoneOutline} title="앱 팝업" />
          <p className="mb-3" style={HINT}>
            로그인 후 하단 패널로 보여 줍니다. 내용을 저장하면 이전에 닫았던 사용자에게도 다시 표시됩니다.
          </p>
          <div className="form-check form-switch mb-3">
            <input
              className="form-check-input"
              type="checkbox"
              role="switch"
              id="app-popup-enabled"
              checked={appPopup.enabled}
              onChange={(e) => setAppPopup((prev) => ({ ...prev, enabled: e.target.checked }))}
              disabled={saving}
            />
            <label
              className="form-check-label"
              htmlFor="app-popup-enabled"
              style={{ fontFamily: OHGO_FONT, fontSize: 14 }}
            >
              팝업 사용
            </label>
          </div>
          <label htmlFor="app-popup-title" style={LABEL}>
            제목
          </label>
          <input
            id="app-popup-title"
            type="text"
            className="form-control mb-3"
            value={appPopup.title}
            onChange={(e) => setAppPopup((prev) => ({ ...prev, title: e.target.value }))}
            placeholder="예: 조황 정보 안내"
            disabled={saving}
            style={OHGO_INPUT}
          />
          <label htmlFor="app-popup-body" style={LABEL}>
            내용
          </label>
          <textarea
            id="app-popup-body"
            className="form-control mb-3"
            value={appPopup.body}
            onChange={(e) => setAppPopup((prev) => ({ ...prev, body: e.target.value }))}
            placeholder="회원에게 보여줄 안내 문구"
            disabled={saving}
            rows={4}
            style={{ ...OHGO_INPUT, minHeight: 96, resize: 'vertical' }}
          />
          <label style={LABEL}>이미지 (선택)</label>
          {appPopup.imageUrl ? (
            <div className="mb-3">
              <div className="overflow-hidden mb-2" style={{ borderRadius: 14, backgroundColor: '#F2F3F5' }}>
                <img
                  src={appPopup.imageUrl}
                  alt=""
                  style={{ width: '100%', height: 'auto', display: 'block', objectFit: 'contain' }}
                />
              </div>
              <button
                type="button"
                className="btn btn-sm"
                style={OHGO_SECONDARY_BTN}
                disabled={saving || popupUploading}
                onClick={() => setAppPopup((prev) => ({ ...prev, imageUrl: '' }))}
              >
                이미지 삭제
              </button>
            </div>
          ) : (
            <label className="btn mb-3" style={{ ...OHGO_SECONDARY_BTN, display: 'inline-block' }}>
              {popupUploading ? '업로드 중...' : '이미지 선택'}
              <input
                type="file"
                accept="image/*"
                hidden
                disabled={saving || popupUploading || popupEditQueue.isEditing}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) popupEditQueue.startWithFiles([file]);
                }}
              />
            </label>
          )}
          <label htmlFor="app-popup-cta-label" style={LABEL}>
            버튼 문구 (선택)
          </label>
          <input
            id="app-popup-cta-label"
            type="text"
            className="form-control mb-3"
            value={appPopup.ctaLabel}
            onChange={(e) => setAppPopup((prev) => ({ ...prev, ctaLabel: e.target.value }))}
            placeholder="예: 자세히 보기"
            disabled={saving}
            style={OHGO_INPUT}
          />
          <label htmlFor="app-popup-cta-path" style={LABEL}>
            이동 경로 (선택)
          </label>
          <input
            id="app-popup-cta-path"
            type="text"
            className="form-control mb-2"
            value={appPopup.ctaPath}
            onChange={(e) => setAppPopup((prev) => ({ ...prev, ctaPath: e.target.value }))}
            placeholder="/community 또는 https://..."
            disabled={saving}
            style={OHGO_INPUT}
          />
          <p className="mb-3" style={HINT}>
            앱 안 페이지는 `/community`처럼, 외부 사이트는 https 주소로 넣으세요.
          </p>
          <div className="d-flex gap-2">
            <button
              type="button"
              className="btn flex-fill fw-semibold"
              style={OHGO_SECONDARY_BTN}
              disabled={saving || !isAppPopupContentReady(appPopup)}
              onClick={() => setPopupPreview(true)}
            >
              미리보기
            </button>
            <button
              type="button"
              className={`btn flex-fill fw-semibold ${OHGO_CONFIRM_BTN_CLASS}`}
              onClick={async () => {
                if (appPopup.enabled && !isAppPopupContentReady(appPopup)) {
                  alert('제목, 내용, 이미지 중 하나 이상 입력해 주세요.');
                  return;
                }
                try {
                  setSaving(true);
                  await saveSiteSettings({
                    appPopup: {
                      ...appPopup,
                      title: appPopup.title.trim(),
                      body: appPopup.body.trim(),
                      ctaLabel: appPopup.ctaLabel.trim(),
                      ctaPath: appPopup.ctaPath.trim(),
                      version: Date.now(),
                    },
                  });
                  await loadSettings();
                  alert('앱 팝업이 저장되었습니다.');
                } catch (error) {
                  console.error(error);
                  alert('저장 중 오류가 발생했습니다.');
                } finally {
                  setSaving(false);
                }
              }}
              disabled={saving || popupUploading}
              style={OHGO_PRIMARY_BTN}
            >
              {saving ? '저장 중...' : '팝업 저장'}
            </button>
          </div>
        </div>

        <div className="p-4 mb-4" style={CARD}>
          <SectionHeader icon={IoGridOutline} title="메인 화면 섹션" />
          <p className="mb-3" style={HINT}>
            홈 화면에 노출할 섹션을 켜고 끕니다. 왼쪽 핸들을 드래그하면 순서를 바꿀 수 있습니다. 꺼도 해당 메뉴·하단 탭은 그대로 유지됩니다.
          </p>
          <div
            className="mb-3"
            style={{
              borderRadius: 14,
              border: '1px solid #EFEFEF',
              overflow: 'hidden',
              backgroundColor: '#FFFFFF',
              userSelect: draggingSectionId ? 'none' : undefined,
            }}
          >
            {homeSectionOrder.map((sectionId, index) => {
              const section = HOME_SECTION_OPTIONS.find(item => item.id === sectionId);
              if (!section) return null;
              const isDragging = draggingSectionId === section.id;
              return (
                <div
                  key={section.id}
                  ref={el => {
                    homeSectionRowRefs.current[section.id] = el;
                  }}
                  onDragOver={event => handleHomeSectionDragOver(section.id, event)}
                  onDrop={event => handleHomeSectionDrop(section.id, event)}
                >
                  {index > 0 && <div style={OHGO_LIST_DIVIDER} />}
                  <div
                    className="ohgo-menu-list-row mb-0"
                    style={{
                      ...ohgoListRowStyle({ muted: !homeSections[section.id] }),
                      opacity: isDragging ? 0.55 : 1,
                    }}
                  >
                    <button
                      type="button"
                      aria-label={`${section.label} 순서 변경`}
                      disabled={saving}
                      draggable={!saving}
                      onDragStart={event => handleHomeSectionDragStart(section.id, event)}
                      onDragEnd={handleHomeSectionDragEnd}
                      onPointerDown={event => handleHomeSectionPointerDown(section.id, event)}
                      onPointerMove={handleHomeSectionPointerMove}
                      onPointerUp={handleHomeSectionPointerEnd}
                      onPointerCancel={handleHomeSectionPointerEnd}
                      onLostPointerCapture={handleHomeSectionPointerEnd}
                      className="btn p-0 d-flex align-items-center justify-content-center flex-shrink-0"
                      style={{
                        width: 32,
                        height: 32,
                        border: 'none',
                        backgroundColor: '#F7F8FA',
                        borderRadius: 8,
                        cursor: saving ? 'default' : isDragging ? 'grabbing' : 'grab',
                        touchAction: 'none',
                      }}
                    >
                      <IoReorderTwoOutline size={18} color="#8A9199" />
                    </button>
                    <label
                      htmlFor={`home-section-${section.id}`}
                      className="flex-grow-1 min-w-0 py-1 mb-0"
                      style={{ cursor: saving ? 'default' : 'pointer' }}
                    >
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 700,
                          color: '#1A1D1F',
                          fontFamily: OHGO_FONT,
                        }}
                      >
                        {section.label}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: '#6F767E',
                          fontFamily: OHGO_FONT,
                          marginTop: 2,
                          lineHeight: 1.45,
                        }}
                      >
                        {section.hint}
                      </div>
                    </label>
                    <div className="form-check form-switch mb-0 flex-shrink-0">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        role="switch"
                        id={`home-section-${section.id}`}
                        checked={homeSections[section.id]}
                        onChange={e =>
                          setHomeSections(prev => ({
                            ...prev,
                            [section.id]: e.target.checked,
                          }))
                        }
                        disabled={saving}
                        style={{ width: 40, height: 22, cursor: 'pointer' }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            className={`btn w-100 fw-semibold ${OHGO_CONFIRM_BTN_CLASS}`}
            onClick={async () => {
              try {
                setSaving(true);
                await saveSiteSettings({ homeSections, homeSectionOrder });
                alert('메인 화면 섹션 설정이 저장되었습니다.');
              } catch (error: unknown) {
                console.error('Error saving home sections:', error);
                const msg =
                  error instanceof Error ? error.message : '메인 화면 섹션 저장 중 오류가 발생했습니다.';
                alert(msg);
              } finally {
                setSaving(false);
              }
            }}
            disabled={saving}
            style={OHGO_PRIMARY_BTN}
          >
            {saving ? (
              <>
                <span className="spinner-border spinner-border-sm me-2 text-white" role="status" />
                저장 중...
              </>
            ) : (
              '메인 화면 섹션 저장'
            )}
          </button>
        </div>

        <div className="p-4 mb-4" style={CARD}>
          <SectionHeader
            icon={IoMenuOutline}
            title="사용자 메뉴"
            action={
              <button
                type="button"
                className="btn btn-sm d-flex align-items-center gap-1"
                onClick={() => router.push('/admin-site-settings/menu/form')}
                disabled={saving}
                style={{
                  backgroundColor: '#1B6FF5',
                  color: '#fff',
                  borderRadius: 10,
                  border: 'none',
                  fontFamily: OHGO_FONT,
                  fontWeight: 600,
                  fontSize: 13,
                  padding: '8px 12px',
                }}
              >
                <IoAddOutline size={16} />
                추가
              </button>
            }
          />
          <p className="mb-3" style={HINT}>
            메인 화면에 표시할 메뉴를 등록하고 순서를 조정합니다. 아이콘 색만 메뉴별로 지정되며, 앱·하단 탭 아이콘에 반영됩니다.
          </p>

          {menuItems.length === 0 ? (
            <EmptyState icon={IoMenuOutline} message="등록된 메뉴가 없습니다." compact />
          ) : (
            <div
              style={{
                borderRadius: 14,
                border: '1px solid #EFEFEF',
                overflow: 'hidden',
                backgroundColor: '#FFFFFF',
              }}
            >
              {menuItems.map((item, index) => {
                const IconComponent = getIconComponent(item.iconName);
                return (
                  <div key={item.id}>
                    {index > 0 && <div style={OHGO_LIST_DIVIDER} />}
                  <div
                    className="ohgo-menu-list-row"
                    style={{
                      opacity: item.isActive ? 1 : 0.72,
                      ...ohgoListRowStyle({ muted: !item.isActive }),
                    }}
                  >
                    <div className="d-flex flex-column gap-1 flex-shrink-0">
                      <button
                        type="button"
                        className="btn p-0 d-flex align-items-center justify-content-center"
                        onClick={() => handleMoveMenuItem(index, 'up')}
                        disabled={saving || index === 0}
                        title="위로"
                        style={{ width: 28, height: 26, backgroundColor: '#F7F8FA', borderRadius: 8, border: 'none' }}
                      >
                        <IoChevronUpOutline size={14} color="#6F767E" />
                      </button>
                      <button
                        type="button"
                        className="btn p-0 d-flex align-items-center justify-content-center"
                        onClick={() => handleMoveMenuItem(index, 'down')}
                        disabled={saving || index === menuItems.length - 1}
                        title="아래로"
                        style={{ width: 28, height: 26, backgroundColor: '#F7F8FA', borderRadius: 8, border: 'none' }}
                      >
                        <IoChevronDownOutline size={14} color="#6F767E" />
                      </button>
                    </div>

                    <MenuIconTile item={item} IconComponent={IconComponent} />

                    <div className="flex-grow-1 min-w-0 py-1">
                      <div className="d-flex align-items-center gap-2">
                        <span
                          className="badge rounded-pill flex-shrink-0"
                          style={{
                            backgroundColor: '#F7F8FA',
                            color: '#6F767E',
                            fontSize: 10,
                            fontFamily: OHGO_FONT,
                            fontWeight: 700,
                            minWidth: 20,
                          }}
                        >
                          {index + 1}
                        </span>
                        <span
                          style={{
                            fontSize: OHGO_LIST.titleSize,
                            fontWeight: OHGO_LIST.titleWeight,
                            color: '#1A1D1F',
                            fontFamily: OHGO_FONT,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {item.label}
                        </span>
                        {!item.isActive && (
                          <span
                            className="badge rounded-pill flex-shrink-0"
                            style={{ backgroundColor: '#6F767E', color: '#fff', fontSize: 9, fontFamily: OHGO_FONT }}
                          >
                            숨김
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: OHGO_LIST.metaSize,
                          color: '#6F767E',
                          fontFamily: OHGO_FONT,
                          marginTop: 2,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.path}
                      </div>
                    </div>

                    <div className="d-flex flex-row gap-1 flex-shrink-0 align-self-center">
                      <button
                        type="button"
                        className="btn p-0 d-flex align-items-center justify-content-center rounded-circle"
                        onClick={() => handleToggleMenuItemActive(item)}
                        disabled={saving}
                        title={item.isActive ? '메뉴 숨기기' : '메뉴 표시'}
                        style={{
                          width: 28,
                          height: 28,
                          border: 'none',
                          backgroundColor: item.isActive ? '#F7F8FA' : '#E8F8EE',
                        }}
                      >
                        {item.isActive ? (
                          <IoEyeOutline size={15} color="#6F767E" />
                        ) : (
                          <IoEyeOffOutline size={15} color="#34C759" />
                        )}
                      </button>
                      <button
                        type="button"
                        className="btn p-0 d-flex align-items-center justify-content-center rounded-circle"
                        onClick={() => router.push(`/admin-site-settings/menu/form?id=${item.id}`)}
                        disabled={saving}
                        title="수정"
                        style={{ width: 28, height: 28, backgroundColor: '#EBF1FE', border: 'none' }}
                      >
                        <ADMIN_EDIT_ICON size={14} color="#1B6FF5" />
                      </button>
                      <button
                        type="button"
                        className="btn p-0 d-flex align-items-center justify-content-center rounded-circle"
                        onClick={() => handleDeleteMenuItem(item.id)}
                        disabled={saving}
                        title="삭제"
                        style={{ width: 28, height: 28, backgroundColor: '#FFF0F0', border: 'none' }}
                      >
                        <IoTrashOutline size={14} color="#FF3B30" />
                      </button>
                    </div>
                  </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-4 mb-4" style={CARD}>
          <SectionHeader
            icon={IoPhonePortraitOutline}
            title="하단 탭 메뉴"
            action={
              <span
                className="badge rounded-pill"
                style={{
                  backgroundColor: bottomTabMenuIds.length >= 5 ? '#FFF3E0' : '#EBF1FE',
                  color: bottomTabMenuIds.length >= 5 ? '#E65100' : '#1B6FF5',
                  fontSize: 12,
                  fontFamily: OHGO_FONT,
                  fontWeight: 700,
                }}
              >
                {bottomTabMenuIds.length}/5
              </span>
            }
          />
          <p className="mb-3" style={HINT}>
            표시할 메뉴를 고른 뒤 순서를 정합니다. 저장 후 앱 하단 탭에 반영됩니다.
          </p>

          {activeMenuItems.length === 0 ? (
            <div className="p-3 rounded-3" style={{ backgroundColor: '#F7F8FA', border: '1px solid #EFEFEF' }}>
              <p className="mb-0" style={{ ...HINT, color: '#6F767E' }}>
                활성화된 메뉴가 없습니다. 먼저 사용자 메뉴를 추가하고 표시 상태로 전환해주세요.
              </p>
            </div>
          ) : (
            <>
              <span style={{ ...LABEL, marginBottom: 8 }}>탭에 표시할 메뉴</span>
              <div
                className="mb-4"
                style={{
                  borderRadius: 14,
                  border: '1px solid #EFEFEF',
                  overflow: 'hidden',
                  backgroundColor: '#FFFFFF',
                }}
              >
                {tabPickerItems.map((item, index) => renderTabPickerRow(item, index))}
              </div>

              {bottomTabMenuIds.length > 0 && (
                <>
                  <span style={{ ...LABEL, marginBottom: 8 }}>탭 표시 순서</span>
                  <p className="mb-2" style={{ ...HINT, fontSize: 11 }}>
                    위·아래 화살표로 순서를 바꿉니다. 왼쪽부터 하단 탭에 표시됩니다.
                  </p>
                  <div
                    className="mb-3"
                    style={{
                      borderRadius: 14,
                      border: '1px solid #EFEFEF',
                      overflow: 'hidden',
                      backgroundColor: '#FFFFFF',
                    }}
                  >
                    {bottomTabMenuIds.map((menuId, index) => {
                      const item = resolveOrderItem(menuId);
                      if (!item) return null;
                      const IconComponent = getIconComponent(item.iconName);

                      return (
                        <div key={menuId}>
                          {index > 0 && <div style={OHGO_LIST_DIVIDER} />}
                        <div
                          className="ohgo-menu-list-row"
                          style={{ backgroundColor: '#FFFFFF' }}
                        >
                          <div className="d-flex flex-column gap-1 flex-shrink-0">
                            <button
                              type="button"
                              className="btn p-0 d-flex align-items-center justify-content-center"
                              onClick={() => {
                                if (index > 0) {
                                  const newIds = [...bottomTabMenuIds];
                                  [newIds[index], newIds[index - 1]] = [newIds[index - 1], newIds[index]];
                                  setBottomTabMenuIds(newIds);
                                }
                              }}
                              disabled={index === 0}
                              title="위로"
                              style={{
                                width: 28,
                                height: 26,
                                backgroundColor: '#F7F8FA',
                                borderRadius: 8,
                                border: 'none',
                              }}
                            >
                              <IoChevronUpOutline size={14} color="#6F767E" />
                            </button>
                            <button
                              type="button"
                              className="btn p-0 d-flex align-items-center justify-content-center"
                              onClick={() => {
                                if (index < bottomTabMenuIds.length - 1) {
                                  const newIds = [...bottomTabMenuIds];
                                  [newIds[index], newIds[index + 1]] = [newIds[index + 1], newIds[index]];
                                  setBottomTabMenuIds(newIds);
                                }
                              }}
                              disabled={index === bottomTabMenuIds.length - 1}
                              title="아래로"
                              style={{
                                width: 28,
                                height: 26,
                                backgroundColor: '#F7F8FA',
                                borderRadius: 8,
                                border: 'none',
                              }}
                            >
                              <IoChevronDownOutline size={14} color="#6F767E" />
                            </button>
                          </div>
                          <MenuIconTile item={item} IconComponent={IconComponent} rounded="square" />
                          <div className="flex-grow-1 min-w-0 py-1">
                            <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1D1F', fontFamily: OHGO_FONT }}>
                              {item.label}
                            </div>
                            <div style={{ fontSize: 12, color: '#6F767E', fontFamily: OHGO_FONT }}>{item.path}</div>
                          </div>
                          <span
                            className="badge rounded-pill flex-shrink-0"
                            style={{
                              backgroundColor: '#1B6FF5',
                              color: '#fff',
                              fontSize: 11,
                              fontFamily: OHGO_FONT,
                              fontWeight: 700,
                              minWidth: 26,
                              padding: '4px 8px',
                            }}
                          >
                            {index + 1}
                          </span>
                        </div>
                        </div>
                      );
                    })}
                  </div>

                  <span style={{ ...LABEL, marginBottom: 8 }}>하단 탭 미리보기</span>
                  <div
                    className="mb-4"
                    style={{
                      borderRadius: 14,
                      border: '1px solid #EFEFEF',
                      backgroundColor: '#FFFFFF',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                      padding: '10px 6px 8px',
                    }}
                  >
                    <div className="d-flex align-items-center justify-content-around">
                      {bottomTabMenuIds.map((menuId, index) => {
                        const item = resolveOrderItem(menuId);
                        if (!item) return null;
                        const IconComponent = getIconComponent(item.iconName);
                        const previewActive = index === 0;

                        return (
                          <div
                            key={menuId}
                            className="d-flex flex-column align-items-center"
                            style={{ flex: 1, minWidth: 0, gap: 3 }}
                          >
                            <span
                              className="d-flex align-items-center justify-content-center"
                              style={{
                                width: 48,
                                height: 28,
                                borderRadius: 14,
                                backgroundColor: previewActive ? '#EBF1FE' : 'transparent',
                              }}
                            >
                              {IconComponent ? (
                                <IconComponent
                                  size={20}
                                  style={{ color: previewActive ? '#1B6FF5' : '#9CA3AF' }}
                                />
                              ) : null}
                            </span>
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: previewActive ? 700 : 500,
                                color: previewActive ? '#1B6FF5' : '#6F767E',
                                fontFamily: OHGO_FONT,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                maxWidth: '100%',
                                padding: '0 2px',
                              }}
                            >
                              {item.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <p className="mb-0 mt-2 text-center" style={{ fontSize: 10, color: '#ABABAB', fontFamily: OHGO_FONT }}>
                      첫 번째 탭을 선택된 상태로 표시한 예시입니다
                    </p>
                  </div>
                </>
              )}

              <button
                type="button"
                className={`btn w-100 fw-semibold ${OHGO_CONFIRM_BTN_CLASS}`}
                onClick={async () => {
                  try {
                    setSaving(true);
                    await saveSiteSettings({ bottomTabMenuIds });
                    alert('하단 탭 메뉴 설정이 저장되었습니다.');
                  } catch (error: unknown) {
                    console.error('Error saving bottom tab menu:', error);
                    const msg = error instanceof Error ? error.message : '하단 탭 메뉴 저장 중 오류가 발생했습니다.';
                    alert(msg);
                  } finally {
                    setSaving(false);
                  }
                }}
                disabled={saving || bottomTabMenuIds.length === 0}
                style={OHGO_PRIMARY_BTN}
              >
                {saving ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2 text-white" role="status" />
                    저장 중...
                  </>
                ) : (
                  '하단 탭 메뉴 저장'
                )}
              </button>
            </>
          )}
        </div>

        <div className="p-4 mb-4" style={CARD}>
          <SectionHeader icon={IoWaterOutline} title="물때 지역" />
          <p className="mb-3" style={HINT}>
            홈 위젯·출조 상세의 몇물·만조/간조 근거지를 고릅니다. 전용 관측소가 없으면 가장 가까운 조위관측소(다대포→부산 등) 기준입니다.
          </p>
          <label htmlFor="tide-region" style={LABEL}>지역</label>
          <select
            id="tide-region"
            className="form-select mb-3"
            value={tideRegionId}
            onChange={(e) => setTideRegionId(e.target.value)}
            disabled={saving}
            style={OHGO_INPUT}
          >
            {Array.from(new Set(TIDE_REGIONS.map((region) => region.area))).map((area) => (
              <optgroup key={area} label={area}>
                {TIDE_REGIONS.filter((region) => region.area === area).map((region) => (
                  <option key={region.id} value={region.id}>
                    {region.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <button
            type="button"
            className={`btn w-100 fw-semibold ${OHGO_CONFIRM_BTN_CLASS}`}
            onClick={async () => {
              try {
                setSaving(true);
                await saveSiteSettings({ tideRegionId: normalizeTideRegionId(tideRegionId) });
                alert('물때 지역이 저장되었습니다.');
              } catch (error: unknown) {
                console.error(error);
                alert('저장 중 오류가 발생했습니다.');
              } finally {
                setSaving(false);
              }
            }}
            disabled={saving}
            style={OHGO_PRIMARY_BTN}
          >
            {saving ? '저장 중...' : '물때 지역 저장'}
          </button>
        </div>

        <div className="p-4 mb-4" style={CARD}>
          <SectionHeader icon={IoBoatOutline} title="출조 예약" />
          <div className="form-check form-switch mb-3">
            <input
              className="form-check-input"
              type="checkbox"
              role="switch"
              id="reservation-enabled"
              checked={reservationEnabled}
              onChange={e => setReservationEnabled(e.target.checked)}
              disabled={saving}
            />
            <label className="form-check-label" htmlFor="reservation-enabled" style={{ fontFamily: OHGO_FONT, fontSize: 14 }}>
              예약 기능 사용
            </label>
          </div>
          <p className="mb-3" style={HINT}>
            켜면 출조 안내에서 회원이 온라인 예약할 수 있습니다. 결제는 없으며 예약·승인만 처리됩니다.
          </p>
          <label style={LABEL}>승인 방식</label>
          <div className="d-flex flex-column gap-2 mb-3">
            <label className="d-flex align-items-center gap-2" style={{ fontFamily: OHGO_FONT, fontSize: 14 }}>
              <input
                type="radio"
                name="approval-mode"
                checked={reservationApprovalMode === 'manual'}
                onChange={() => setReservationApprovalMode('manual')}
                disabled={saving || !reservationEnabled}
              />
              수동 승인 (관리자 확인 후 확정)
            </label>
            <label className="d-flex align-items-center gap-2" style={{ fontFamily: OHGO_FONT, fontSize: 14 }}>
              <input
                type="radio"
                name="approval-mode"
                checked={reservationApprovalMode === 'auto'}
                onChange={() => setReservationApprovalMode('auto')}
                disabled={saving || !reservationEnabled}
              />
              자동 확정 (정원 내 즉시 확정)
            </label>
          </div>
          <button
            type="button"
            className={`btn w-100 fw-semibold ${OHGO_CONFIRM_BTN_CLASS}`}
            onClick={async () => {
              try {
                setSaving(true);
                await saveSiteSettings({
                  reservationEnabled,
                  reservationApprovalMode,
                });
                alert('출조 예약 설정이 저장되었습니다.');
              } catch (error: unknown) {
                console.error(error);
                alert('저장 중 오류가 발생했습니다.');
              } finally {
                setSaving(false);
              }
            }}
            disabled={saving}
            style={OHGO_PRIMARY_BTN}
          >
            {saving ? '저장 중...' : '예약 설정 저장'}
          </button>
        </div>

        {popupEditQueue.current ? (
          <ImageEditor
            imageUrl={popupEditQueue.current.previewUrl}
            title="팝업 이미지 편집"
            onSave={(file) => popupEditQueue.acceptCurrent(file)}
            onCancel={popupEditQueue.skipCurrent}
          />
        ) : null}
        <AppPopupSheet
          open={popupPreview}
          popup={appPopup}
          onClose={() => setPopupPreview(false)}
          onDismissForever={() => setPopupPreview(false)}
          onCta={appPopup.ctaLabel.trim() ? () => setPopupPreview(false) : undefined}
        />
    </SubPageFrame>
  );
}

export default function AdminSiteSettingsPage() {
  return (
    <Suspense fallback={<OhgoPageLoading />}>
      <AdminSiteSettingsContent />
    </Suspense>
  );
}

