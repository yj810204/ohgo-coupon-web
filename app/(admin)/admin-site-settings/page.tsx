'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { getUser } from '@/lib/storage';
import { getUserByUUID } from '@/lib/firebase-auth';
import { getSiteSettings, saveSiteSettings, MenuItem, SiteSettings } from '@/utils/site-settings-service';
import { getAvailableIcons, getIconComponent } from '@/utils/icon-mapper';
import { IoChevronUpOutline, IoChevronDownOutline, IoAddOutline, IoTrashOutline, IoPencilOutline, IoSettingsOutline } from 'react-icons/io5';
import PageHeader from '@/components/PageHeader';

function AdminSiteSettingsContent() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [siteName, setSiteName] = useState('');
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [editingMenuItem, setEditingMenuItem] = useState<MenuItem | null>(null);
  const [menuItemLabel, setMenuItemLabel] = useState('');
  const [menuItemPath, setMenuItemPath] = useState('');
  const [menuItemIconName, setMenuItemIconName] = useState('');
  const [menuItemColor, setMenuItemColor] = useState('#007AFF');
  const [availableIcons, setAvailableIcons] = useState<Array<{ name: string; component: React.ComponentType<any> }>>([]);

  useEffect(() => {
    const checkAuth = async () => {
      const user = await getUser();
      if (!user?.uuid) {
        router.replace('/login');
        return;
      }

      const remoteUser = await getUserByUUID(user.uuid);
      if (!remoteUser?.isAdmin) {
        router.replace('/main');
        return;
      }

      await loadSettings();
      setLoading(false);
    };
    checkAuth();
  }, [router]);

  useEffect(() => {
    const icons = getAvailableIcons();
    setAvailableIcons(icons);
  }, []);

  const loadSettings = async () => {
    try {
      const settings = await getSiteSettings();
      setSiteName(settings.siteName);
      setMenuItems(settings.userMenuItems.sort((a, b) => a.order - b.order));
    } catch (error) {
      console.error('Error loading settings:', error);
      alert('설정을 불러오는 중 오류가 발생했습니다.');
    }
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

  const handleAddMenuItem = () => {
    setEditingMenuItem(null);
    setMenuItemLabel('');
    setMenuItemPath('');
    setMenuItemIconName('');
    setMenuItemColor('#007AFF');
    setShowMenuModal(true);
  };

  const handleEditMenuItem = (item: MenuItem) => {
    setEditingMenuItem(item);
    setMenuItemLabel(item.label);
    setMenuItemPath(item.path);
    setMenuItemIconName(item.iconName);
    setMenuItemColor(item.color);
    setShowMenuModal(true);
  };

  const handleSaveMenuItem = async () => {
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

    try {
      setSaving(true);
      let updatedMenuItems: MenuItem[];

      if (editingMenuItem) {
        // 수정
        updatedMenuItems = menuItems.map(item =>
          item.id === editingMenuItem.id
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
        // 추가
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
      await loadSettings();
      setShowMenuModal(false);
      alert(editingMenuItem ? '메뉴가 수정되었습니다.' : '메뉴가 추가되었습니다.');
    } catch (error: any) {
      console.error('Error saving menu item:', error);
      alert(error.message || '메뉴 저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMenuItem = async (itemId: string) => {
    if (!confirm('이 메뉴를 삭제하시겠습니까?')) {
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

  if (loading) {
    return (
      <div className="min-vh-100 bg-light">
        <PageHeader title="사이트 설정" />
        <div className="container pb-4" style={{ paddingTop: '80px' }}>
          <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '50vh' }}>
            <div className="text-center">
              <div className="spinner-border text-primary mb-3" role="status">
                <span className="visually-hidden">로딩 중...</span>
              </div>
              <p className="text-muted">로딩 중...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-vh-100 bg-light">
      <PageHeader title="사이트 설정" />
      <div className="container pb-4" style={{ paddingTop: '80px' }}>
        {/* 사이트 이름 설정 */}
        <div className="card shadow-sm mb-4">
          <div className="card-header d-flex align-items-center">
            <IoSettingsOutline size={20} className="me-2 flex-shrink-0" />
            <h6 className="mb-0">사이트 이름</h6>
          </div>
          <div className="card-body">
            <div className="mb-3">
              <label className="form-label">사이트 이름</label>
              <input
                type="text"
                className="form-control"
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                placeholder="사이트 이름을 입력하세요"
                disabled={saving}
              />
              <small className="text-muted">브라우저 탭 제목과 메인 페이지 헤더에 표시됩니다.</small>
            </div>
            <button
              className="btn btn-primary"
              onClick={handleSaveSiteName}
              disabled={saving || !siteName.trim()}
            >
              {saving ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" />
                  저장 중...
                </>
              ) : (
                '저장'
              )}
            </button>
          </div>
        </div>

        {/* 메뉴 관리 */}
        <div className="card shadow-sm mb-4">
          <div className="card-header d-flex align-items-center justify-content-between">
            <div className="d-flex align-items-center">
              <IoSettingsOutline size={20} className="me-2 flex-shrink-0" />
              <h6 className="mb-0">사용자 메뉴 관리</h6>
            </div>
            <button
              className="btn btn-sm btn-primary d-flex align-items-center"
              onClick={handleAddMenuItem}
              disabled={saving}
            >
              <IoAddOutline size={16} className="me-1 flex-shrink-0" />
              메뉴 추가
            </button>
          </div>
          <div className="card-body">
            {menuItems.length === 0 ? (
              <div className="d-flex flex-column align-items-center justify-content-center py-4">
                <IoSettingsOutline size={48} className="text-muted mb-2 flex-shrink-0" />
                <p className="text-muted mb-0">등록된 메뉴가 없습니다.</p>
              </div>
            ) : (
              <div className="list-group">
                {menuItems.map((item, index) => {
                  const IconComponent = getIconComponent(item.iconName);
                  return (
                    <div
                      key={item.id}
                      className="list-group-item d-flex align-items-center justify-content-between"
                    >
                      <div className="d-flex align-items-center gap-3 flex-grow-1">
                        <div className="d-flex flex-column gap-1">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            onClick={() => handleMoveMenuItem(index, 'up')}
                            disabled={saving || index === 0}
                            title="위로 이동"
                          >
                            <IoChevronUpOutline size={14} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            onClick={() => handleMoveMenuItem(index, 'down')}
                            disabled={saving || index === menuItems.length - 1}
                            title="아래로 이동"
                          >
                            <IoChevronDownOutline size={14} />
                          </button>
                        </div>
                        <div
                          className="rounded-circle d-flex align-items-center justify-content-center"
                          style={{
                            width: '48px',
                            height: '48px',
                            backgroundColor: `${item.color}20`,
                            flexShrink: 0,
                          }}
                        >
                          {IconComponent ? (
                            <IconComponent size={24} style={{ color: item.color }} />
                          ) : (
                            <IoSettingsOutline size={24} style={{ color: item.color }} />
                          )}
                        </div>
                        <div className="flex-grow-1">
                          <div className="d-flex align-items-center gap-2">
                            <strong>{item.label}</strong>
                            {!item.isActive && (
                              <span className="badge bg-secondary">비활성</span>
                            )}
                          </div>
                          <small className="text-muted d-block">{item.path}</small>
                          <small className="text-muted d-block">아이콘: {item.iconName}</small>
                        </div>
                      </div>
                      <div className="d-flex gap-2">
                        <button
                          className="btn btn-sm btn-outline-secondary"
                          onClick={() => handleToggleMenuItemActive(item)}
                          disabled={saving}
                          title={item.isActive ? '비활성화' : '활성화'}
                        >
                          {item.isActive ? '숨김' : '표시'}
                        </button>
                        <button
                          className="btn btn-sm btn-outline-primary"
                          onClick={() => handleEditMenuItem(item)}
                          disabled={saving}
                          title="수정"
                        >
                          <IoPencilOutline size={16} />
                        </button>
                        <button
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => handleDeleteMenuItem(item.id)}
                          disabled={saving}
                          title="삭제"
                        >
                          <IoTrashOutline size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 메뉴 추가/수정 모달 */}
      {showMenuModal && (
        <div
          className="modal show d-block"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={() => !saving && setShowMenuModal(false)}
        >
          <div
            className="modal-dialog modal-dialog-centered"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-content border-0 shadow-lg" style={{ borderRadius: '16px', overflow: 'hidden' }}>
              <div
                className="modal-header border-0"
                style={{
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  padding: '20px',
                }}
              >
                <h5 className="modal-title text-white fw-bold mb-0">
                  {editingMenuItem ? '메뉴 수정' : '메뉴 추가'}
                </h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => !saving && setShowMenuModal(false)}
                  disabled={saving}
                  style={{ opacity: 0.8 }}
                ></button>
              </div>
              <div className="modal-body p-4" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                <div className="mb-3">
                  <label className="form-label">메뉴명 *</label>
                  <input
                    type="text"
                    className="form-control"
                    value={menuItemLabel}
                    onChange={(e) => setMenuItemLabel(e.target.value)}
                    placeholder="예: 스탬프"
                    disabled={saving}
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">경로 *</label>
                  <input
                    type="text"
                    className="form-control"
                    value={menuItemPath}
                    onChange={(e) => setMenuItemPath(e.target.value)}
                    placeholder="예: /stamp"
                    disabled={saving}
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">아이콘 *</label>
                  <select
                    className="form-select"
                    value={menuItemIconName}
                    onChange={(e) => setMenuItemIconName(e.target.value)}
                    disabled={saving}
                  >
                    <option value="">아이콘 선택</option>
                    {availableIcons.map((icon) => {
                      const IconComponent = icon.component;
                      return (
                        <option key={icon.name} value={icon.name}>
                          {icon.name}
                        </option>
                      );
                    })}
                  </select>
                  {menuItemIconName && (
                    <div className="mt-2 d-flex align-items-center gap-2">
                      <span className="text-muted small">미리보기:</span>
                      {(() => {
                        const IconComponent = getIconComponent(menuItemIconName);
                        return IconComponent ? (
                          <IconComponent size={24} style={{ color: menuItemColor }} />
                        ) : null;
                      })()}
                    </div>
                  )}
                </div>
                <div className="mb-3">
                  <label className="form-label">색상 *</label>
                  <div className="d-flex gap-2 align-items-center">
                    <input
                      type="color"
                      className="form-control form-control-color"
                      value={menuItemColor}
                      onChange={(e) => setMenuItemColor(e.target.value)}
                      disabled={saving}
                      style={{ width: '60px', height: '40px' }}
                    />
                    <input
                      type="text"
                      className="form-control"
                      value={menuItemColor}
                      onChange={(e) => setMenuItemColor(e.target.value)}
                      placeholder="#007AFF"
                      disabled={saving}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer border-0 pt-0">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowMenuModal(false)}
                  disabled={saving}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSaveMenuItem}
                  disabled={saving || !menuItemLabel.trim() || !menuItemPath.trim() || !menuItemIconName}
                >
                  {saving ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status" />
                      저장 중...
                    </>
                  ) : (
                    '저장'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminSiteSettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="d-flex min-vh-100 align-items-center justify-content-center">
          <div className="text-center">
            <div className="spinner-border text-primary mb-3" role="status">
              <span className="visually-hidden">로딩 중...</span>
            </div>
            <p className="text-muted">로딩 중...</p>
          </div>
        </div>
      }
    >
      <AdminSiteSettingsContent />
    </Suspense>
  );
}

