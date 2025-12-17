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
  const [bottomTabMenuIds, setBottomTabMenuIds] = useState<string[]>([]);

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
      setBottomTabMenuIds(settings.bottomTabMenuIds || []);
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
        <div className="container">
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
      <div className="container">
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
              <div className="d-flex flex-column gap-3">
                {menuItems.map((item, index) => {
                  const IconComponent = getIconComponent(item.iconName);
                  return (
                    <div
                      key={item.id}
                      className="card border shadow-sm"
                      style={{
                        opacity: item.isActive ? 1 : 0.7,
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <div className="card-body p-3">
                        <div className="d-flex align-items-center gap-3">
                          {/* 재정렬 버튼 */}
                          <div className="d-flex flex-column gap-1">
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-secondary d-flex align-items-center justify-content-center"
                              onClick={() => handleMoveMenuItem(index, 'up')}
                              disabled={saving || index === 0}
                              title="위로 이동"
                              style={{ width: '32px', height: '32px', padding: '0' }}
                            >
                              <IoChevronUpOutline size={14} />
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-secondary d-flex align-items-center justify-content-center"
                              onClick={() => handleMoveMenuItem(index, 'down')}
                              disabled={saving || index === menuItems.length - 1}
                              title="아래로 이동"
                              style={{ width: '32px', height: '32px', padding: '0' }}
                            >
                              <IoChevronDownOutline size={14} />
                            </button>
                          </div>
                          
                          {/* 아이콘 */}
                          <div
                            className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                            style={{
                              width: '56px',
                              height: '56px',
                              backgroundColor: `${item.color}15`,
                              border: `2px solid ${item.color}40`,
                            }}
                          >
                            {IconComponent ? (
                              <IconComponent size={28} style={{ color: item.color }} />
                            ) : (
                              <IoSettingsOutline size={28} style={{ color: item.color }} />
                            )}
                          </div>
                          
                          {/* 메뉴 정보 */}
                          <div className="flex-grow-1">
                            <div className="d-flex align-items-center gap-2 mb-1">
                              <h6 className="mb-0 fw-semibold">{item.label}</h6>
                              {!item.isActive && (
                                <span className="badge bg-secondary" style={{ fontSize: '0.7rem' }}>비활성</span>
                              )}
                            </div>
                            <div className="d-flex flex-column gap-1">
                              <div className="d-flex align-items-center gap-2">
                                <span className="text-muted small" style={{ minWidth: '50px' }}>경로:</span>
                                <code className="small bg-light px-2 py-1 rounded" style={{ fontSize: '0.75rem' }}>{item.path}</code>
                              </div>
                              <div className="d-flex align-items-center gap-2">
                                <span className="text-muted small" style={{ minWidth: '50px' }}>아이콘:</span>
                                <code className="small bg-light px-2 py-1 rounded" style={{ fontSize: '0.75rem' }}>{item.iconName}</code>
                              </div>
                              {/* 액션 버튼 */}
                              <div className="d-flex gap-2 mt-2">
                                <button
                                  className={`btn btn-sm ${item.isActive ? 'btn-outline-warning' : 'btn-outline-success'}`}
                                  onClick={() => handleToggleMenuItemActive(item)}
                                  disabled={saving}
                                  title={item.isActive ? '비활성화' : '활성화'}
                                  style={{ minWidth: '60px' }}
                                >
                                  {item.isActive ? '숨김' : '표시'}
                                </button>
                                <button
                                  className="btn btn-sm btn-outline-primary d-flex align-items-center justify-content-center"
                                  onClick={() => handleEditMenuItem(item)}
                                  disabled={saving}
                                  title="수정"
                                  style={{ width: '40px', padding: '0' }}
                                >
                                  <IoPencilOutline size={16} />
                                </button>
                                <button
                                  className="btn btn-sm btn-outline-danger d-flex align-items-center justify-content-center"
                                  onClick={() => handleDeleteMenuItem(item.id)}
                                  disabled={saving}
                                  title="삭제"
                                  style={{ width: '40px', padding: '0' }}
                                >
                                  <IoTrashOutline size={16} />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 하단 탭 메뉴 설정 */}
        <div className="card shadow-sm mb-4">
          <div className="card-header d-flex align-items-center">
            <IoSettingsOutline size={20} className="me-2 flex-shrink-0" />
            <h6 className="mb-0">하단 탭 메뉴 설정</h6>
          </div>
          <div className="card-body">
            <p className="text-muted small mb-3">
              메인 메뉴 항목 중 최대 5개를 선택하여 하단 고정 탭으로 표시할 수 있습니다.
            </p>
            {menuItems.filter(item => item.isActive).length === 0 ? (
              <div className="alert alert-info mb-0">
                활성화된 메뉴 항목이 없습니다. 먼저 메뉴를 추가하고 활성화해주세요.
              </div>
            ) : (
              <>
                <div className="d-flex flex-column gap-2 mb-3">
                  {/* 홈 메뉴 항목 (하단 탭 메뉴 설정에서만 표시) */}
                  {(() => {
                    const homeItem: MenuItem = {
                      id: 'home',
                      label: '홈',
                      path: '/main',
                      iconName: 'IoHomeOutline',
                      color: '#1E88E5',
                      order: -1,
                      isActive: true,
                    };
                    const IconComponent = getIconComponent(homeItem.iconName);
                    const isSelected = bottomTabMenuIds.includes(homeItem.id);
                    const canSelect = isSelected || bottomTabMenuIds.length < 5;
                    
                    return (
                      <div
                        key={homeItem.id}
                        className={`card border ${isSelected ? 'border-primary' : ''}`}
                        style={{
                          opacity: canSelect ? 1 : 0.5,
                          backgroundColor: isSelected ? '#f0f8ff' : '#fff',
                          transition: 'all 0.2s ease',
                          cursor: canSelect ? 'pointer' : 'not-allowed',
                        }}
                        onClick={() => {
                          if (canSelect && !isSelected && bottomTabMenuIds.length < 5) {
                            setBottomTabMenuIds([...bottomTabMenuIds, homeItem.id]);
                          } else if (isSelected) {
                            setBottomTabMenuIds(bottomTabMenuIds.filter(id => id !== homeItem.id));
                          }
                        }}
                      >
                        <div className="card-body p-3">
                          <div className="form-check d-flex align-items-center gap-3 mb-0">
                            <input
                              className="form-check-input"
                              type="checkbox"
                              id={`bottom-tab-${homeItem.id}`}
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  if (bottomTabMenuIds.length < 5) {
                                    setBottomTabMenuIds([...bottomTabMenuIds, homeItem.id]);
                                  }
                                } else {
                                  setBottomTabMenuIds(bottomTabMenuIds.filter(id => id !== homeItem.id));
                                }
                              }}
                              disabled={!canSelect && !isSelected}
                              onClick={(e) => e.stopPropagation()}
                            />
                            {IconComponent && (
                              <div
                                className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                                style={{
                                  width: '40px',
                                  height: '40px',
                                  backgroundColor: `${homeItem.color}15`,
                                }}
                              >
                                <IconComponent size={20} style={{ color: homeItem.color }} />
                              </div>
                            )}
                            <label
                              className="form-check-label flex-grow-1 mb-0 d-flex align-items-center justify-content-between"
                              htmlFor={`bottom-tab-${homeItem.id}`}
                              style={{ cursor: canSelect ? 'pointer' : 'not-allowed' }}
                            >
                              <span className="fw-semibold">{homeItem.label}</span>
                              <div className="d-flex gap-2">
                                {isSelected && (
                                  <span className="badge bg-primary">선택됨</span>
                                )}
                                {!canSelect && !isSelected && (
                                  <span className="badge bg-secondary">최대 5개</span>
                                )}
                              </div>
                            </label>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                  
                  {/* 사용자 메뉴 항목들 */}
                  {menuItems
                    .filter(item => item.isActive)
                    .sort((a, b) => a.order - b.order)
                    .map((item) => {
                      const IconComponent = getIconComponent(item.iconName);
                      const isSelected = bottomTabMenuIds.includes(item.id);
                      const canSelect = isSelected || bottomTabMenuIds.length < 5;
                      
                      return (
                        <div
                          key={item.id}
                          className={`card border ${isSelected ? 'border-primary' : ''}`}
                          style={{
                            opacity: canSelect ? 1 : 0.5,
                            backgroundColor: isSelected ? '#f0f8ff' : '#fff',
                            transition: 'all 0.2s ease',
                            cursor: canSelect ? 'pointer' : 'not-allowed',
                          }}
                          onClick={() => {
                            if (canSelect && !isSelected && bottomTabMenuIds.length < 5) {
                              setBottomTabMenuIds([...bottomTabMenuIds, item.id]);
                            } else if (isSelected) {
                              setBottomTabMenuIds(bottomTabMenuIds.filter(id => id !== item.id));
                            }
                          }}
                        >
                          <div className="card-body p-3">
                            <div className="form-check d-flex align-items-center gap-3 mb-0">
                              <input
                                className="form-check-input"
                                type="checkbox"
                                id={`bottom-tab-${item.id}`}
                                checked={isSelected}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    if (bottomTabMenuIds.length < 5) {
                                      setBottomTabMenuIds([...bottomTabMenuIds, item.id]);
                                    }
                                  } else {
                                    setBottomTabMenuIds(bottomTabMenuIds.filter(id => id !== item.id));
                                  }
                                }}
                                disabled={!canSelect && !isSelected}
                                onClick={(e) => e.stopPropagation()}
                              />
                              {IconComponent && (
                                <div
                                  className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                                  style={{
                                    width: '40px',
                                    height: '40px',
                                    backgroundColor: `${item.color}15`,
                                  }}
                                >
                                  <IconComponent size={20} style={{ color: item.color }} />
                                </div>
                              )}
                              <label
                                className="form-check-label flex-grow-1 mb-0 d-flex align-items-center justify-content-between"
                                htmlFor={`bottom-tab-${item.id}`}
                                style={{ cursor: canSelect ? 'pointer' : 'not-allowed' }}
                              >
                                <span className="fw-semibold">{item.label}</span>
                                <div className="d-flex gap-2">
                                  {isSelected && (
                                    <span className="badge bg-primary">선택됨</span>
                                  )}
                                  {!canSelect && !isSelected && (
                                    <span className="badge bg-secondary">최대 5개</span>
                                  )}
                                </div>
                              </label>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
                {bottomTabMenuIds.length > 0 && (
                  <div className="mb-3">
                    <label className="form-label fw-semibold mb-2">하단 탭 순서</label>
                    <div className="d-flex flex-column gap-2">
                      {bottomTabMenuIds.map((menuId, index) => {
                        // 홈 메뉴 항목 처리
                        let item: MenuItem | undefined;
                        if (menuId === 'home') {
                          item = {
                            id: 'home',
                            label: '홈',
                            path: '/main',
                            iconName: 'IoHomeOutline',
                            color: '#1E88E5',
                            order: -1,
                            isActive: true,
                          };
                        } else {
                          item = menuItems.find(m => m.id === menuId);
                        }
                        if (!item) return null;
                        const IconComponent = getIconComponent(item.iconName);
                        
                        return (
                          <div
                            key={menuId}
                            className="card border shadow-sm"
                          >
                            <div className="card-body p-3">
                              <div className="d-flex align-items-center gap-3">
                                <div className="d-flex flex-column gap-1">
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-outline-secondary d-flex align-items-center justify-content-center"
                                    onClick={() => {
                                      if (index > 0) {
                                        const newIds = [...bottomTabMenuIds];
                                        [newIds[index], newIds[index - 1]] = [newIds[index - 1], newIds[index]];
                                        setBottomTabMenuIds(newIds);
                                      }
                                    }}
                                    disabled={index === 0}
                                    title="위로 이동"
                                    style={{ width: '32px', height: '32px', padding: '0' }}
                                  >
                                    <IoChevronUpOutline size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-outline-secondary d-flex align-items-center justify-content-center"
                                    onClick={() => {
                                      if (index < bottomTabMenuIds.length - 1) {
                                        const newIds = [...bottomTabMenuIds];
                                        [newIds[index], newIds[index + 1]] = [newIds[index + 1], newIds[index]];
                                        setBottomTabMenuIds(newIds);
                                      }
                                    }}
                                    disabled={index === bottomTabMenuIds.length - 1}
                                    title="아래로 이동"
                                    style={{ width: '32px', height: '32px', padding: '0' }}
                                  >
                                    <IoChevronDownOutline size={14} />
                                  </button>
                                </div>
                                {IconComponent && (
                                  <div
                                    className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                                    style={{
                                      width: '48px',
                                      height: '48px',
                                      backgroundColor: `${item.color}15`,
                                      border: `2px solid ${item.color}40`,
                                    }}
                                  >
                                    <IconComponent size={24} style={{ color: item.color }} />
                                  </div>
                                )}
                                <div className="flex-grow-1">
                                  <h6 className="mb-0 fw-semibold">{item.label}</h6>
                                  <small className="text-muted">{item.path}</small>
                                </div>
                                <span className="badge bg-primary" style={{ fontSize: '0.9rem', minWidth: '30px' }}>{index + 1}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <button
                  className="btn btn-primary"
                  onClick={async () => {
                    try {
                      setSaving(true);
                      await saveSiteSettings({ bottomTabMenuIds });
                      alert('하단 탭 메뉴 설정이 저장되었습니다.');
                    } catch (error: any) {
                      console.error('Error saving bottom tab menu:', error);
                      alert(error.message || '하단 탭 메뉴 저장 중 오류가 발생했습니다.');
                    } finally {
                      setSaving(false);
                    }
                  }}
                  disabled={saving || bottomTabMenuIds.length === 0}
                >
                  {saving ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status" />
                      저장 중...
                    </>
                  ) : (
                    '하단 탭 메뉴 저장'
                  )}
                </button>
              </>
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

