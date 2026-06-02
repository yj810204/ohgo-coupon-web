'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSiteSettings, saveSiteSettings, MenuItem } from '@/utils/site-settings-service';
import { getAvailableIcons, getIconComponent } from '@/utils/icon-mapper';
import { IoCheckmarkOutline } from 'react-icons/io5';
import SubPageFrame from '@/components/SubPageFrame';
import { useRequireAdmin } from '@/hooks/useRequireAdmin';
import {
  OHGO_CONFIRM_BTN,
  OHGO_CONFIRM_BTN_CLASS,
  OHGO_DISMISS_BTN,
  OHGO_DISMISS_BTN_CLASS,
  OHGO_FONT,
  OHGO_INPUT,
  OhgoPageLoading,
} from '@/lib/page-styles';

const LABEL: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: '#6F767E',
  fontFamily: OHGO_FONT,
  marginBottom: 6,
  display: 'block',
};

function MenuFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const menuId = searchParams.get('id');
  const { ready } = useRequireAdmin();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [menuItemLabel, setMenuItemLabel] = useState('');
  const [menuItemPath, setMenuItemPath] = useState('');
  const [menuItemIconName, setMenuItemIconName] = useState('');
  const [menuItemColor, setMenuItemColor] = useState('#1B6FF5');
  const [availableIcons, setAvailableIcons] = useState<Array<{ name: string; component: React.ComponentType<{ size?: number; color?: string }> }>>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setAvailableIcons(getAvailableIcons());
  }, []);

  useEffect(() => {
    if (!ready) return;
    const load = async () => {
      setLoading(true);
      try {
        const settings = await getSiteSettings();
        const items = settings.userMenuItems.sort((a, b) => a.order - b.order);
        setMenuItems(items);
        if (menuId) {
          const item = items.find(m => m.id === menuId);
          if (!item) {
            alert('메뉴를 찾을 수 없습니다.');
            router.replace('/admin-site-settings');
            return;
          }
          setMenuItemLabel(item.label);
          setMenuItemPath(item.path);
          setMenuItemIconName(item.iconName);
          setMenuItemColor(item.color);
        }
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [ready, menuId, router]);

  const handleSave = async () => {
    if (!menuItemLabel.trim()) {
      alert('메뉴명을 입력해주세요.');
      return;
    }
    if (!menuItemPath.trim()) {
      alert('경로를 입력해주세요.');
      return;
    }
    if (!menuItemIconName) {
      alert('아이콘을 선택해주세요.');
      return;
    }

    setSaving(true);
    try {
      let updatedMenuItems: MenuItem[];
      if (menuId) {
        updatedMenuItems = menuItems.map(item =>
          item.id === menuId
            ? {
                ...item,
                label: menuItemLabel.trim(),
                path: menuItemPath.trim(),
                iconName: menuItemIconName,
                color: menuItemColor,
              }
            : item
        );
      } else {
        const newItem: MenuItem = {
          id: `menu_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          label: menuItemLabel.trim(),
          path: menuItemPath.trim(),
          iconName: menuItemIconName,
          color: menuItemColor,
          order: menuItems.length,
          isActive: true,
        };
        updatedMenuItems = [...menuItems, newItem];
      }
      await saveSiteSettings({ userMenuItems: updatedMenuItems });
      router.replace('/admin-site-settings');
    } catch (error: unknown) {
      console.error('Error saving menu item:', error);
      const msg = error instanceof Error ? error.message : '메뉴 저장 중 오류가 발생했습니다.';
      alert(msg);
    } finally {
      setSaving(false);
    }
  };

  if (!ready || loading) {
    return <OhgoPageLoading />;
  }

  const PreviewIcon = menuItemIconName ? getIconComponent(menuItemIconName) : null;

  return (
    <SubPageFrame title={menuId ? '메뉴 수정' : '메뉴 추가'}>
      <div className="mb-3">
        <label style={LABEL}>메뉴명 *</label>
        <input
          type="text"
          className="form-control"
          value={menuItemLabel}
          onChange={e => setMenuItemLabel(e.target.value)}
          placeholder="예: 스탬프"
          disabled={saving}
          style={OHGO_INPUT}
        />
      </div>
      <div className="mb-3">
        <label style={LABEL}>경로 *</label>
        <input
          type="text"
          className="form-control"
          value={menuItemPath}
          onChange={e => setMenuItemPath(e.target.value)}
          placeholder="예: /stamp"
          disabled={saving}
          style={OHGO_INPUT}
        />
      </div>
      <div className="mb-3">
        <label style={LABEL}>아이콘 *</label>
        <select
          className="form-select"
          value={menuItemIconName}
          onChange={e => setMenuItemIconName(e.target.value)}
          disabled={saving}
          style={OHGO_INPUT}
        >
          <option value="">아이콘 선택</option>
          {availableIcons.map(icon => (
            <option key={icon.name} value={icon.name}>
              {icon.name}
            </option>
          ))}
        </select>
        {PreviewIcon && (
          <div className="mt-2 d-flex align-items-center gap-2">
            <span style={{ fontSize: 12, color: '#6F767E', fontFamily: OHGO_FONT }}>미리보기</span>
            <PreviewIcon size={24} color={menuItemColor} />
          </div>
        )}
      </div>
      <div className="mb-4">
        <label style={LABEL}>색상 *</label>
        <div className="d-flex gap-2 align-items-center">
          <input
            type="color"
            className="form-control form-control-color"
            value={menuItemColor}
            onChange={e => setMenuItemColor(e.target.value)}
            disabled={saving}
            style={{ width: 56, height: 44, borderRadius: 10, border: '2px solid #EFEFEF' }}
          />
          <input
            type="text"
            className="form-control"
            value={menuItemColor}
            onChange={e => setMenuItemColor(e.target.value)}
            placeholder="#1B6FF5"
            disabled={saving}
            style={OHGO_INPUT}
          />
        </div>
      </div>
      <div className="d-flex gap-2">
        <button
          type="button"
          className={`btn flex-grow-1 fw-semibold ${OHGO_DISMISS_BTN_CLASS}`}
          onClick={() => router.back()}
          disabled={saving}
          style={OHGO_DISMISS_BTN}
        >
          취소
        </button>
        <button
          type="button"
          className={`btn flex-grow-1 fw-semibold d-flex align-items-center justify-content-center gap-2 ${OHGO_CONFIRM_BTN_CLASS}`}
          onClick={() => void handleSave()}
          disabled={saving || !menuItemLabel.trim() || !menuItemPath.trim() || !menuItemIconName}
          style={OHGO_CONFIRM_BTN}
        >
          {saving ? <span className="spinner-border spinner-border-sm" /> : <IoCheckmarkOutline size={18} />}
          저장
        </button>
      </div>
    </SubPageFrame>
  );
}

export default function AdminSiteSettingsMenuFormPage() {
  return (
    <Suspense fallback={<OhgoPageLoading />}>
      <MenuFormContent />
    </Suspense>
  );
}
