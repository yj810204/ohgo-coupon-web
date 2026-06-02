'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getUser } from '@/lib/storage';
import { getUserByUUID } from '@/lib/firebase-auth';
import { getPointRules, savePointSettings } from '@/utils/community-point-service';
import { 
  getTemplates, 
  getTemplate, 
  saveTemplate, 
  deleteTemplate, 
  getActiveTemplateId, 
  setActiveTemplateId,
  applyTemplate,
  CommunityTemplate,
  TemplateField,
  TemplateFieldType
} from '@/utils/community-template-service';
import {
  getEmojiPacks,
  saveEmojiPack,
  deleteEmojiPack,
  uploadEmojiImage,
  deleteEmojiImage,
  EmojiPack,
  Emoji
} from '@/utils/emoji-pack-service';
import { IoTrashOutline, IoAddOutline, IoSettingsOutline, IoChevronUpOutline, IoChevronDownOutline, IoHappyOutline } from 'react-icons/io5';
import { ADMIN_EDIT_ICON } from '@/lib/admin-icons';
import type { IconType } from 'react-icons';
import SubPageFrame from '@/components/SubPageFrame';
import {
  OHGO_CARD,
  OHGO_FONT,
  OHGO_INPUT,
  OHGO_CONFIRM_BTN_CLASS,
  OHGO_PRIMARY_BTN,
  OHGO_DISMISS_BTN,
  OHGO_DISMISS_BTN_CLASS,
  OHGO_SECONDARY_BTN,
  OhgoPageLoading,
} from '@/lib/page-styles';
import EmptyState from '@/components/EmptyState';
import { useNavigation } from '@/hooks/useNavigation';
import {
  getPhotos,
  updatePhoto,
  deletePhoto,
  uploadPhoto,
  CommunityPhoto
} from '@/utils/community-service';

const FONT = OHGO_FONT;
const CARD: React.CSSProperties = { ...OHGO_CARD };

const LABEL: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: '#6F767E',
  fontFamily: FONT,
  marginBottom: 6,
  display: 'block',
};

const HINT: React.CSSProperties = {
  fontSize: 11,
  color: '#ABABAB',
  fontFamily: FONT,
  marginTop: 6,
  marginBottom: 0,
};

const LIST_CONTAINER: React.CSSProperties = {
  borderRadius: 14,
  border: '1px solid #EFEFEF',
  overflow: 'hidden',
  backgroundColor: '#FFFFFF',
};

function FormSection({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ ...CARD, padding: '14px 16px', marginBottom: 12 }}>
      <div className="d-flex align-items-center justify-content-between gap-2 mb-3">
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT }}>{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

function FormActions({
  onCancel,
  onSubmit,
  submitLabel,
  loading,
  loadingLabel,
  disabled,
}: {
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel: string;
  loading?: boolean;
  loadingLabel?: string;
  disabled?: boolean;
}) {
  return (
    <div className="d-grid gap-2 mt-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
      <button
        type="button"
        className={`btn w-100 fw-semibold ohgo-modal__btn ohgo-modal__btn--secondary ${OHGO_DISMISS_BTN_CLASS}`}
        style={OHGO_DISMISS_BTN}
        onClick={onCancel}
        disabled={loading}
      >
        취소
      </button>
      <button
        type="button"
        className={`btn w-100 fw-semibold ohgo-modal__btn ohgo-modal__btn--primary ${OHGO_CONFIRM_BTN_CLASS}`}
        style={{ ...OHGO_PRIMARY_BTN, opacity: disabled || loading ? 0.65 : 1 }}
        onClick={onSubmit}
        disabled={disabled || loading}
      >
        {loading ? loadingLabel || '처리 중...' : submitLabel}
      </button>
    </div>
  );
}

function SectionAddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="btn d-flex align-items-center gap-1 flex-shrink-0 ohgo-modal__btn ohgo-modal__btn--primary"
      style={{ ...OHGO_PRIMARY_BTN, padding: '8px 12px', fontSize: 13, borderRadius: 10 }}
      onClick={onClick}
    >
      <IoAddOutline size={16} aria-hidden />
      {label}
    </button>
  );
}

function IconActionButton({
  onClick,
  icon: Icon,
  color,
  bg,
  title,
  disabled,
}: {
  onClick: () => void;
  icon: IconType;
  color: string;
  bg: string;
  title: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="btn p-0 d-flex align-items-center justify-content-center rounded-circle flex-shrink-0"
      style={{ width: 32, height: 32, backgroundColor: bg, border: 'none', opacity: disabled ? 0.5 : 1 }}
    >
      <Icon size={16} color={color} />
    </button>
  );
}

function AdminCommunityContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = searchParams.get('view');
  const templateIdParam = searchParams.get('templateId');
  const emojiPackIdParam = searchParams.get('packId');
  const [user, setUser] = useState<{ uuid?: string; name?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [pointsPerComment, setPointsPerComment] = useState(1);
  const [dailyLimit, setDailyLimit] = useState(10);
  const [savingSettings, setSavingSettings] = useState(false);
  const [templates, setTemplates] = useState<CommunityTemplate[]>([]);
  const [activeTemplateId, setActiveTemplateIdState] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<CommunityTemplate | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateFields, setTemplateFields] = useState<TemplateField[]>([]);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [fieldOptionInputs, setFieldOptionInputs] = useState<Record<number, string>>({});
  const [emojiPacks, setEmojiPacks] = useState<EmojiPack[]>([]);
  const [editingEmojiPack, setEditingEmojiPack] = useState<EmojiPack | null>(null);
  const [emojiPackName, setEmojiPackName] = useState('');
  const [emojiPackDescription, setEmojiPackDescription] = useState('');
  const [emojiPackEmojis, setEmojiPackEmojis] = useState<Emoji[]>([]);
  const [savingEmojiPack, setSavingEmojiPack] = useState(false);
  const [uploadingEmojiImage, setUploadingEmojiImage] = useState(false);
  const [editingEmojiIndex, setEditingEmojiIndex] = useState<number | null>(null);
  
  // 사진 관리 관련 state
  const [photos, setPhotos] = useState<CommunityPhoto[]>([]);
  const [editingPhoto, setEditingPhoto] = useState<CommunityPhoto | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editPreviewUrl, setEditPreviewUrl] = useState<string | null>(null);
  const [editSelectedFiles, setEditSelectedFiles] = useState<File[]>([]);
  const [editPreviewUrls, setEditPreviewUrls] = useState<string[]>([]);
  const [editEditedImages, setEditEditedImages] = useState<Record<number, File>>({});
  const [editEditingImageIndex, setEditEditingImageIndex] = useState<number | null>(null);
  const [editTemplateFieldValues, setEditTemplateFieldValues] = useState<Record<string, string | string[]>>({});
  const [showEditTemplateFields, setShowEditTemplateFields] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [templateFieldValues, setTemplateFieldValues] = useState<Record<string, string | string[]>>({});
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [editedImages, setEditedImages] = useState<Record<number, File>>({});
  const [editingImageIndex, setEditingImageIndex] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [updatingPhoto, setUpdatingPhoto] = useState(false);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const u = await getUser();
      if (!u?.uuid) {
        router.replace('/login');
        return;
      }

      const remoteUser = await getUserByUUID(u.uuid);
      if (!remoteUser?.isAdmin) {
        router.replace('/main');
        return;
      }

      setUser({ uuid: u.uuid, name: u.name || remoteUser.name || '관리자' });
      await Promise.all([loadPointSettings(), loadTemplates(), loadActiveTemplate(), loadEmojiPacks()]);
      setLoading(false);
    };
    checkAuth();
  }, [router]);


  const loadPointSettings = async () => {
    try {
      const rules = await getPointRules();
      setPointsPerComment(rules.pointsPerComment);
      setDailyLimit(rules.dailyLimit);
    } catch (error) {
      console.error('Error loading point settings:', error);
    }
  };

  const loadTemplates = async () => {
    try {
      const templatesList = await getTemplates();
      setTemplates(templatesList);
    } catch (error) {
      console.error('Error loading templates:', error);
    }
  };

  const loadActiveTemplate = async () => {
    try {
      const activeId = await getActiveTemplateId();
      setActiveTemplateIdState(activeId);
    } catch (error) {
      console.error('Error loading active template:', error);
    }
  };

  const loadEmojiPacks = async () => {
    try {
      const packs = await getEmojiPacks(true); // 비활성화된 것도 포함
      setEmojiPacks(packs);
    } catch (error) {
      console.error('Error loading emoji packs:', error);
    }
  };

  const handleAddEmojiPack = () => {
    setEditingEmojiPack(null);
    setEmojiPackName('');
    setEmojiPackDescription('');
    setEmojiPackEmojis([]);
    router.push('/admin-community?view=emoji-form');
  };

  const populateEmojiPackForm = (pack: EmojiPack) => {
    setEditingEmojiPack(pack);
    setEmojiPackName(pack.name);
    setEmojiPackDescription(pack.description || '');
    setEmojiPackEmojis([...pack.emojis]);
  };

  const handleEditEmojiPack = (pack: EmojiPack) => {
    router.push(`/admin-community?view=emoji-form&packId=${pack.packId}`);
  };

  const handleSaveEmojiPack = async () => {
    if (!emojiPackName.trim()) {
      alert('팩 이름을 입력해주세요.');
      return;
    }

    try {
      setSavingEmojiPack(true);
      const packId = editingEmojiPack?.packId || undefined;
      await saveEmojiPack({
        packId,
        name: emojiPackName,
        description: emojiPackDescription,
        emojis: emojiPackEmojis,
        isActive: editingEmojiPack?.isActive !== undefined ? editingEmojiPack.isActive : true,
      });
      
      alert('이모티콘 팩이 저장되었습니다.');
      router.replace('/admin-community');
      setEditingEmojiPack(null);
      await loadEmojiPacks();
    } catch (error: any) {
      console.error('Error saving emoji pack:', error);
      alert(error.message || '이모티콘 팩 저장 중 오류가 발생했습니다.');
    } finally {
      setSavingEmojiPack(false);
    }
  };

  const handleDeleteEmojiPack = async (packId: string) => {
    if (!confirm('이 이모티콘 팩을 삭제하시겠습니까? 모든 이모티콘이 삭제됩니다.')) {
      return;
    }

    try {
      await deleteEmojiPack(packId);
      alert('이모티콘 팩이 삭제되었습니다.');
      await loadEmojiPacks();
    } catch (error: any) {
      console.error('Error deleting emoji pack:', error);
      alert(error.message || '이모티콘 팩 삭제 중 오류가 발생했습니다.');
    }
  };

  const handleToggleEmojiPackActive = async (pack: EmojiPack) => {
    try {
      await saveEmojiPack({
        packId: pack.packId,
        name: pack.name,
        description: pack.description,
        emojis: pack.emojis,
        isActive: !pack.isActive,
      });
      await loadEmojiPacks();
    } catch (error: any) {
      console.error('Error toggling emoji pack active:', error);
      alert('상태 변경 중 오류가 발생했습니다.');
    }
  };

  const handleAddEmoji = () => {
    const emojiId = `emoji_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const newEmoji: Emoji = {
      emojiId,
      name: '',
      imageUrl: '',
      order: emojiPackEmojis.length,
    };
    setEmojiPackEmojis([...emojiPackEmojis, newEmoji]);
    setEditingEmojiIndex(emojiPackEmojis.length);
  };

  const handleEmojiImageUpload = async (index: number, file: File) => {
    if (!editingEmojiPack && !emojiPackName.trim()) {
      alert('먼저 팩 이름을 입력해주세요.');
      return;
    }

    const packId = editingEmojiPack?.packId || `pack_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const emoji = emojiPackEmojis[index];
    
    try {
      setUploadingEmojiImage(true);
      const imageUrl = await uploadEmojiImage(packId, emoji.emojiId, file);
      
      const updatedEmojis = [...emojiPackEmojis];
      updatedEmojis[index] = {
        ...updatedEmojis[index],
        imageUrl,
        name: updatedEmojis[index].name || file.name.split('.')[0],
      };
      setEmojiPackEmojis(updatedEmojis);
    } catch (error: any) {
      console.error('Error uploading emoji image:', error);
      alert(error.message || '이모티콘 이미지 업로드 중 오류가 발생했습니다.');
    } finally {
      setUploadingEmojiImage(false);
    }
  };

  const handleDeleteEmoji = async (index: number) => {
    const emoji = emojiPackEmojis[index];
    if (!confirm(`이모티콘 "${emoji.name || emoji.emojiId}"을(를) 삭제하시겠습니까?`)) {
      return;
    }

    try {
      // 이미지 삭제
      if (editingEmojiPack && emoji.imageUrl) {
        await deleteEmojiImage(editingEmojiPack.packId, emoji.emojiId);
      }
      
      // 목록에서 제거
      const updatedEmojis = emojiPackEmojis.filter((_, i) => i !== index);
      // order 재정렬
      updatedEmojis.forEach((e, i) => {
        e.order = i;
      });
      setEmojiPackEmojis(updatedEmojis);
    } catch (error: any) {
      console.error('Error deleting emoji:', error);
      alert('이모티콘 삭제 중 오류가 발생했습니다.');
    }
  };

  const handleMoveEmoji = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= emojiPackEmojis.length) return;

    const updatedEmojis = [...emojiPackEmojis];
    const temp = updatedEmojis[index];
    updatedEmojis[index] = updatedEmojis[newIndex];
    updatedEmojis[newIndex] = temp;
    
    // order 재정렬
    updatedEmojis.forEach((e, i) => {
      e.order = i;
    });
    
    setEmojiPackEmojis(updatedEmojis);
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
      alert('템플릿 이름을 입력해주세요.');
      return;
    }

    if (templateFields.length === 0) {
      alert('최소 1개 이상의 필드를 추가해주세요.');
      return;
    }

    try {
      setSavingTemplate(true);
      const templateId = editingTemplate?.templateId || undefined;
      // 순서 정보를 포함하여 저장
      const fieldsWithOrder = templateFields.map((field, index) => ({
        ...field,
        order: field.order ?? index,
      }));
      await saveTemplate({
        templateId,
        name: templateName,
        fields: fieldsWithOrder,
      });
      
      alert('템플릿이 저장되었습니다.');
      router.replace('/admin-community');
      setEditingTemplate(null);
      setTemplateName('');
      setTemplateFields([]);
      setFieldOptionInputs({});
      await loadTemplates();
    } catch (error: any) {
      console.error('Error saving template:', error);
      alert(error.message || '템플릿 저장 중 오류가 발생했습니다.');
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!confirm('이 템플릿을 삭제하시겠습니까?')) {
      return;
    }

    try {
      await deleteTemplate(templateId);
      if (activeTemplateId === templateId) {
        await setActiveTemplateId(null);
        setActiveTemplateIdState(null);
      }
      alert('템플릿이 삭제되었습니다.');
      await loadTemplates();
    } catch (error: any) {
      console.error('Error deleting template:', error);
      alert(error.message || '템플릿 삭제 중 오류가 발생했습니다.');
    }
  };

  const handleSetActiveTemplate = async (templateId: string | null) => {
    try {
      await setActiveTemplateId(templateId);
      setActiveTemplateIdState(templateId);
      alert('활성 템플릿이 설정되었습니다.');
    } catch (error: any) {
      console.error('Error setting active template:', error);
      alert(error.message || '활성 템플릿 설정 중 오류가 발생했습니다.');
    }
  };

  const handleEditTemplate = (template: CommunityTemplate) => {
    setEditingTemplate(template);
    setTemplateName(template.name);
    // 순서대로 정렬하여 설정
    const sortedFields = [...template.fields].sort((a, b) => {
      const orderA = a.order ?? template.fields.indexOf(a);
      const orderB = b.order ?? template.fields.indexOf(b);
      return orderA - orderB;
    });
    setTemplateFields(sortedFields);
    // 옵션 입력 필드 초기화
    const optionInputs: Record<number, string> = {};
    sortedFields.forEach((field, index) => {
      if (field.options && field.options.length > 0) {
        optionInputs[index] = field.options.join(', ');
      }
    });
    setFieldOptionInputs(optionInputs);
  };

  const initTemplateFormNew = () => {
    setEditingTemplate(null);
    setTemplateName('');
    setTemplateFields([]);
    setFieldOptionInputs({});
  };

  const handleAddTemplateField = () => {
    const maxOrder = templateFields.length > 0 
      ? Math.max(...templateFields.map(f => f.order || 0))
      : -1;
    const newIndex = templateFields.length;
    setTemplateFields([...templateFields, { 
      label: '', 
      placeholder: '', 
      required: false, 
      type: 'text',
      order: maxOrder + 1
    }]);
    setFieldOptionInputs({ ...fieldOptionInputs, [newIndex]: '' });
  };

  const handleRemoveTemplateField = (index: number) => {
    setTemplateFields(templateFields.filter((_, i) => i !== index));
  };

  const handleUpdateTemplateField = (index: number, field: Partial<TemplateField>) => {
    const newFields = [...templateFields];
    newFields[index] = { ...newFields[index], ...field };
    setTemplateFields(newFields);
    // 타입이 radio나 checkbox가 아니면 옵션 입력 필드 초기화
    if (field.type && field.type !== 'radio' && field.type !== 'checkbox') {
      const newOptionInputs = { ...fieldOptionInputs };
      delete newOptionInputs[index];
      setFieldOptionInputs(newOptionInputs);
    }
  };

  const handleOptionInputChange = (index: number, value: string) => {
    setFieldOptionInputs({ ...fieldOptionInputs, [index]: value });
    // 실시간으로 options 업데이트
    const options = value.split(',').map(o => o.trim()).filter(o => o);
    handleUpdateTemplateField(index, { options: options.length > 0 ? options : undefined });
  };

  const handleMoveTemplateField = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === templateFields.length - 1) return;

    const newFields = [...templateFields];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    // 순서 교환
    const temp = newFields[index].order || index;
    newFields[index].order = newFields[targetIndex].order || targetIndex;
    newFields[targetIndex].order = temp;
    
    // 배열 위치 교환
    [newFields[index], newFields[targetIndex]] = [newFields[targetIndex], newFields[index]];
    
    setTemplateFields(newFields);
  };

  const handleEditPhoto = async (photo: CommunityPhoto) => {
    // 최신 데이터를 다시 불러오기
    let latestPhoto = photo;
    try {
      const { getPhoto } = await import('@/utils/community-service');
      const refreshedPhoto = await getPhoto(photo.photoId);
      if (refreshedPhoto) {
        latestPhoto = refreshedPhoto;
      }
    } catch (error) {
      console.error('Error refreshing photo:', error);
    }
    
    setEditingPhoto(latestPhoto);
    setEditTitle(latestPhoto.title || '');
    setEditContent(latestPhoto.content || '');
    setEditImageFile(null);
    setEditPreviewUrl(null);
    
    // 기존 이미지를 초기 이미지로 설정
    setEditSelectedFiles([]);
    const existingImages = latestPhoto.imageUrls || (latestPhoto.imageUrl ? [latestPhoto.imageUrl] : []);
    setEditPreviewUrls(existingImages);
    setEditEditedImages({});
    setEditEditingImageIndex(null);
    
    // 템플릿 필드 값 복원 - latestPhoto.templateId를 기준으로
    if (latestPhoto.templateId) {
      // 템플릿이 로드되지 않았을 수 있으므로 먼저 확인
      let template = templates.find(t => t.templateId === latestPhoto.templateId);
      
      // 템플릿이 없으면 로드 시도
      if (!template) {
        try {
          const { getTemplate } = await import('@/utils/community-template-service');
          const loadedTemplate = await getTemplate(latestPhoto.templateId);
          if (loadedTemplate) {
            template = loadedTemplate;
            // 템플릿 목록에 추가
            setTemplates(prev => {
              if (prev.find(t => t.templateId === loadedTemplate.templateId)) {
                return prev;
              }
              return [...prev, loadedTemplate];
            });
          }
        } catch (error) {
          console.error('Error loading template:', error);
        }
      }
      
      if (template) {
        setShowEditTemplateFields(true);
        // 저장된 템플릿 필드 값이 있으면 복원, 없으면 초기화
        const initialValues: Record<string, string | string[]> = {};
        template.fields.forEach(field => {
          const fieldType = field.type || 'text';
          if (latestPhoto.templateFieldValues && latestPhoto.templateFieldValues[field.label] !== undefined) {
            // 저장된 값이 있으면 복원
            initialValues[field.label] = latestPhoto.templateFieldValues[field.label];
          } else {
            // 저장된 값이 없으면 초기화
            if (fieldType === 'checkbox') {
              initialValues[field.label] = [];
            } else if (fieldType === 'date' && latestPhoto.photoDate) {
              // 날짜 필드이고 사진 날짜가 있으면 설정
              let date: Date;
              if (latestPhoto.photoDate instanceof Date) {
                date = latestPhoto.photoDate;
              } else if (latestPhoto.photoDate && typeof (latestPhoto.photoDate as any).toDate === 'function') {
                // Firebase Timestamp인 경우
                date = (latestPhoto.photoDate as any).toDate();
              } else {
                // 기타 경우 (문자열, 숫자 등)
                date = new Date(latestPhoto.photoDate as any);
              }
              initialValues[field.label] = date.toISOString().split('T')[0];
            } else {
              initialValues[field.label] = '';
            }
          }
        });
        console.log('Restoring template field values:', initialValues);
        console.log('Latest photo templateFieldValues:', latestPhoto.templateFieldValues);
        setEditTemplateFieldValues(initialValues);
      } else {
        // 템플릿을 찾을 수 없음
        console.warn('Template not found:', latestPhoto.templateId);
        setShowEditTemplateFields(false);
        setEditTemplateFieldValues({});
      }
    } else {
      setShowEditTemplateFields(false);
      setEditTemplateFieldValues({});
    }
    
    router.push(`/admin-photos?view=edit&photoId=${latestPhoto.photoId}`);
  };

  const handleEditFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const validFiles: File[] = [];
    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        alert(`${file.name}은(는) 이미지 파일이 아닙니다.`);
        continue;
      }

      if (file.size > 5 * 1024 * 1024) {
        alert(`${file.name}의 크기는 5MB 이하여야 합니다.`);
        continue;
      }

      validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    const newFiles = [...editSelectedFiles, ...validFiles];
    setEditSelectedFiles(newFiles);

    // 미리보기 URL 생성
    const newPreviewUrls = [...editPreviewUrls];
    validFiles.forEach(file => {
      newPreviewUrls.push(URL.createObjectURL(file));
    });
    setEditPreviewUrls(newPreviewUrls);

    // input 초기화
    e.target.value = '';
  };

  const handleEditImageRemove = (index: number) => {
    // 기존 이미지(URL)인지 새로 추가한 이미지(File)인지 확인
    const isExistingImage = index < editPreviewUrls.length - editSelectedFiles.length;
    
    if (isExistingImage) {
      // 기존 이미지는 삭제 불가 (최소 1개는 유지)
      if (editPreviewUrls.length - editSelectedFiles.length <= 1) {
        alert('최소 1개의 이미지는 유지해야 합니다.');
        return;
      }
      // 기존 이미지 URL 제거
      const newPreviewUrls = editPreviewUrls.filter((_, i) => i !== index);
      setEditPreviewUrls(newPreviewUrls);
    } else {
      // 새로 추가한 이미지 제거
      const fileIndex = index - (editPreviewUrls.length - editSelectedFiles.length);
      const newFiles = editSelectedFiles.filter((_, i) => i !== fileIndex);
      setEditSelectedFiles(newFiles);
      
      // 미리보기 URL 제거 및 정리
      URL.revokeObjectURL(editPreviewUrls[index]);
      const newPreviewUrls = editPreviewUrls.filter((_, i) => i !== index);
      setEditPreviewUrls(newPreviewUrls);
      
      // 편집된 이미지 인덱스 조정
      const newEditedImages: Record<number, File> = {};
      Object.keys(editEditedImages).forEach(key => {
        const oldIndex = parseInt(key);
        if (oldIndex < fileIndex) {
          newEditedImages[oldIndex] = editEditedImages[oldIndex];
        } else if (oldIndex > fileIndex) {
          newEditedImages[oldIndex - 1] = editEditedImages[oldIndex];
        }
      });
      setEditEditedImages(newEditedImages);
      
      if (editEditingImageIndex === index) {
        setEditEditingImageIndex(null);
      } else if (editEditingImageIndex !== null && editEditingImageIndex > index) {
        setEditEditingImageIndex(editEditingImageIndex - 1);
      }
    }
  };

  const handleEditImageEditSave = (index: number, editedFile: File) => {
    // 기존 이미지인지 새로 추가한 이미지인지 확인
    const isExistingImage = index < editPreviewUrls.length - editSelectedFiles.length;
    
    if (isExistingImage) {
      // 기존 이미지는 editImageFile로 설정 (단일 이미지 교체)
      setEditImageFile(editedFile);
      const newPreviewUrl = URL.createObjectURL(editedFile);
      const newPreviewUrls = [...editPreviewUrls];
      URL.revokeObjectURL(newPreviewUrls[index]);
      newPreviewUrls[index] = newPreviewUrl;
      setEditPreviewUrls(newPreviewUrls);
    } else {
      // 새로 추가한 이미지 편집
      const fileIndex = index - (editPreviewUrls.length - editSelectedFiles.length);
      setEditEditedImages({ ...editEditedImages, [fileIndex]: editedFile });
      
      // 편집된 이미지의 미리보기 URL 업데이트
      const newPreviewUrl = URL.createObjectURL(editedFile);
      const newPreviewUrls = [...editPreviewUrls];
      URL.revokeObjectURL(newPreviewUrls[index]);
      newPreviewUrls[index] = newPreviewUrl;
      setEditPreviewUrls(newPreviewUrls);
    }
    
    setEditEditingImageIndex(null);
  };

  // 템플릿 적용은 수정 버튼 클릭 시 자동으로 처리됨

  const handleUpdatePhoto = async () => {
    if (!editingPhoto) return;

    try {
      setUpdatingPhoto(true);
      // 템플릿에서 날짜 필드 찾기 - editingPhoto.templateId 사용
      let photoDate: Date | undefined;
      if (editingPhoto.templateId) {
        const template = templates.find(t => t.templateId === editingPhoto.templateId);
        const dateField = template?.fields.find(f => f.type === 'date');
        if (dateField) {
          const dateValue = editTemplateFieldValues[dateField.label];
          if (typeof dateValue === 'string' && dateValue) {
            photoDate = new Date(dateValue);
          }
        }
      }
      
      // 기존 이미지 URL 추출 (편집되지 않은 기존 이미지)
      const existingImageUrls: string[] = [];
      const existingImageCount = editPreviewUrls.length - editSelectedFiles.length;
      for (let i = 0; i < existingImageCount; i++) {
        // 편집된 기존 이미지가 있으면 제외 (editImageFile이 있으면 첫 번째 기존 이미지는 교체됨)
        if (i === 0 && editImageFile) {
          continue; // 편집된 이미지는 새로 업로드됨
        }
        existingImageUrls.push(editPreviewUrls[i]);
      }
      
      // 새로 추가한 이미지 파일들 (편집된 이미지가 있으면 사용)
      const newImageFiles: File[] = [];
      if (editImageFile) {
        // 기존 첫 번째 이미지가 편집된 경우
        newImageFiles.push(editImageFile);
      }
      
      // 새로 추가한 이미지 파일들 추가
      for (let i = 0; i < editSelectedFiles.length; i++) {
        const fileToAdd = editEditedImages[i] || editSelectedFiles[i];
        newImageFiles.push(fileToAdd);
      }
      
      // 모든 이미지 파일을 하나로 합침
      const allImageFiles = newImageFiles.length > 0 ? newImageFiles : undefined;
      
      await updatePhoto(editingPhoto.photoId, {
        title: editTitle,
        content: editContent,
        photoDate,
        templateId: editingPhoto.templateId || undefined,
        templateFieldValues: editTemplateFieldValues,
        imageFile: allImageFiles,
        imageUrls: existingImageUrls.length > 0 ? existingImageUrls : undefined,
      });
      
      alert('사진이 수정되었습니다.');
      router.replace('/admin-photos');
      setEditingPhoto(null);
      setEditTemplateFieldValues({});
      await loadPhotos();
    } catch (error: any) {
      console.error('Error updating photo:', error);
      alert(error.message || '사진 수정 중 오류가 발생했습니다.');
    } finally {
      setUpdatingPhoto(false);
    }
  };

  const handleSaveSettings = async () => {
    if (pointsPerComment < 1 || dailyLimit < 1) {
      alert('포인트는 1 이상이어야 합니다.');
      return;
    }

    try {
      setSavingSettings(true);
      await savePointSettings(pointsPerComment, dailyLimit);
      alert('포인트 설정이 저장되었습니다.');
    } catch (error: any) {
      console.error('Error saving settings:', error);
      alert(error.message || '설정 저장 중 오류가 발생했습니다.');
    } finally {
      setSavingSettings(false);
    }
  };

  const loadPhotos = async () => {
    try {
      setLoading(true);
      const photosList = await getPhotos();
      setPhotos(photosList);
    } catch (error) {
      console.error('Error loading photos:', error);
      alert('사진을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const validFiles: File[] = [];
    const urls: string[] = [];

    files.forEach((file) => {
      // 이미지 파일 검증
      if (!file.type.startsWith('image/')) {
        alert(`${file.name}은(는) 이미지 파일이 아닙니다.`);
        return;
      }

      // 파일 크기 검증 (5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert(`${file.name}의 크기는 5MB 이하여야 합니다.`);
        return;
      }

      validFiles.push(file);
      urls.push(URL.createObjectURL(file));
    });

    setSelectedFiles([...selectedFiles, ...validFiles]);
    setPreviewUrls([...previewUrls, ...urls]);
  };

  const handleRemoveImage = (index: number) => {
    URL.revokeObjectURL(previewUrls[index]);
    const newFiles = selectedFiles.filter((_, i) => i !== index);
    const newUrls = previewUrls.filter((_, i) => i !== index);
    setSelectedFiles(newFiles);
    setPreviewUrls(newUrls);
    
    // 편집된 이미지 인덱스 재조정
    const newEditedImages: Record<number, File> = {};
    Object.keys(editedImages).forEach(key => {
      const oldIndex = parseInt(key);
      if (oldIndex < index) {
        newEditedImages[oldIndex] = editedImages[oldIndex];
      } else if (oldIndex > index) {
        newEditedImages[oldIndex - 1] = editedImages[oldIndex];
      }
    });
    setEditedImages(newEditedImages);
    
    if (editingImageIndex === index) {
      setEditingImageIndex(null);
    } else if (editingImageIndex !== null && editingImageIndex > index) {
      setEditingImageIndex(editingImageIndex - 1);
    }
  };

  const handleImageEditSave = (index: number, editedFile: File) => {
    setEditedImages({ ...editedImages, [index]: editedFile });
    setEditingImageIndex(null);
    
    // 편집된 이미지의 미리보기 URL 업데이트
    const newPreviewUrl = URL.createObjectURL(editedFile);
    const newPreviewUrls = [...previewUrls];
    URL.revokeObjectURL(newPreviewUrls[index]);
    newPreviewUrls[index] = newPreviewUrl;
    setPreviewUrls(newPreviewUrls);
  };

  // 템플릿 적용은 등록/수정 버튼 클릭 시 자동으로 처리됨

  const handleUpload = async () => {
    if (selectedFiles.length === 0 || !user?.uuid || !user?.name) {
      alert('이미지를 선택해주세요.');
      return;
    }

    try {
      setUploading(true);
      // 템플릿에서 날짜 필드 찾기
      let photoDate: Date | undefined;
      if (activeTemplateId) {
        const template = templates.find(t => t.templateId === activeTemplateId);
        const dateField = template?.fields.find(f => f.type === 'date');
        if (dateField) {
          const dateValue = templateFieldValues[dateField.label];
          if (typeof dateValue === 'string' && dateValue) {
            photoDate = new Date(dateValue);
          }
        }
      }
      
      // 여러 이미지 업로드 (편집된 이미지가 있으면 사용, 없으면 원본 사용)
      const filesToUpload: File[] = [];
      for (let i = 0; i < selectedFiles.length; i++) {
        const fileToUpload = editedImages[i] || selectedFiles[i];
        filesToUpload.push(fileToUpload);
      }
      
      // 모든 이미지를 하나의 게시물로 업로드
      await uploadPhoto(
        filesToUpload, 
        user.uuid, 
        user.name, 
        title || undefined, 
        description || undefined,
        content || undefined,
        photoDate,
        activeTemplateId || undefined,
        templateFieldValues
      );
      
      alert(`${filesToUpload.length}개의 사진이 업로드되었습니다.`);
      router.replace('/admin-photos?view=upload');
      setSelectedFiles([]);
      setPreviewUrls([]);
      setEditedImages({});
      setEditingImageIndex(null);
      setTitle('');
      setDescription('');
      setContent('');
      setTemplateFieldValues({});
      await loadPhotos();
    } catch (error: any) {
      console.error('Error uploading photo:', error);
      alert(error.message || '사진 업로드 중 오류가 발생했습니다.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (photoId: string) => {
    if (!confirm('이 사진을 삭제하시겠습니까?\n댓글도 함께 삭제됩니다.')) {
      return;
    }

    try {
      setDeletingPhotoId(photoId);
      await deletePhoto(photoId);
      alert('사진이 삭제되었습니다.');
      await loadPhotos();
    } catch (error: any) {
      console.error('Error deleting photo:', error);
      alert(error.message || '사진 삭제 중 오류가 발생했습니다.');
    } finally {
      setDeletingPhotoId(null);
    }
  };


  useEffect(() => {
    if (view !== 'template-form' || loading) return;
    if (!templateIdParam) {
      initTemplateFormNew();
      return;
    }
    if (editingTemplate?.templateId === templateIdParam) return;
    const found = templates.find(t => t.templateId === templateIdParam);
    if (found) {
      handleEditTemplate(found);
      return;
    }
    void getTemplate(templateIdParam).then(t => {
      if (t) handleEditTemplate(t);
    });
  }, [view, templateIdParam, loading, templates]);

  useEffect(() => {
    if (view !== 'emoji-form' || loading) return;
    if (!emojiPackIdParam) {
      setEditingEmojiPack(null);
      setEmojiPackName('');
      setEmojiPackDescription('');
      setEmojiPackEmojis([]);
      return;
    }
    if (editingEmojiPack?.packId === emojiPackIdParam) return;
    const pack = emojiPacks.find(p => p.packId === emojiPackIdParam);
    if (pack) populateEmojiPackForm(pack);
  }, [view, emojiPackIdParam, loading, emojiPacks]);

  if (loading) {
    return <OhgoPageLoading />;
  }

  if (view === 'template-form') {
    return (
      <SubPageFrame title={editingTemplate ? '템플릿 수정' : '템플릿 추가'} onBack={() => router.replace('/admin-community')}>
        <FormSection title="기본 정보">
          <label style={LABEL}>템플릿 이름</label>
          <input
            type="text"
            className="form-control"
            style={OHGO_INPUT}
            value={templateName}
            onChange={e => setTemplateName(e.target.value)}
            placeholder="예: 조황 정보 템플릿"
            disabled={savingTemplate}
          />
        </FormSection>
        <FormSection
          title="필드"
          action={
            <SectionAddButton label="필드 추가" onClick={handleAddTemplateField} />
          }
        >
          {templateFields.length === 0 ? (
            <EmptyState icon={IoSettingsOutline} message="필드를 추가해주세요." compact />
          ) : null}
          {templateFields.map((field, index) => {
            const fieldType: TemplateFieldType = field.type || 'text';
            return (
              <div key={index} style={{ ...CARD, padding: 12, marginBottom: 8, boxShadow: 'none', border: '1px solid #EFEFEF' }}>
                <div className="d-flex align-items-center mb-2 gap-1">
                  <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => handleMoveTemplateField(index, 'up')} disabled={savingTemplate || index === 0}><IoChevronUpOutline size={14} /></button>
                  <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => handleMoveTemplateField(index, 'down')} disabled={savingTemplate || index === templateFields.length - 1}><IoChevronDownOutline size={14} /></button>
                  <span className="text-muted small">순서: {index + 1}</span>
                </div>
                <div className="row g-2 mb-2">
                  <div className="col-md-3">
                    <input type="text" className="form-control form-control-sm" placeholder="필드명" value={field.label} onChange={e => handleUpdateTemplateField(index, { label: e.target.value })} disabled={savingTemplate} />
                  </div>
                  <div className="col-md-3">
                    <select className="form-select form-select-sm" value={fieldType} onChange={e => {
                      const newType = e.target.value as TemplateFieldType;
                      const update: Partial<TemplateField> = { type: newType };
                      if (newType !== 'radio' && newType !== 'checkbox') update.options = undefined;
                      else if (!field.options) update.options = [];
                      handleUpdateTemplateField(index, update);
                    }} disabled={savingTemplate}>
                      <option value="text">한줄 입력칸</option>
                      <option value="textarea">여러줄 입력칸</option>
                      <option value="date">날짜 선택</option>
                      <option value="radio">단일 선택</option>
                      <option value="checkbox">다중 선택</option>
                    </select>
                  </div>
                  <div className="col-md-3">
                    <input type="text" className="form-control form-control-sm" placeholder="플레이스홀더" value={field.placeholder} onChange={e => handleUpdateTemplateField(index, { placeholder: e.target.value })} disabled={savingTemplate} />
                  </div>
                  <div className="col-md-2">
                    <div className="form-check">
                      <input className="form-check-input" type="checkbox" checked={field.required || false} onChange={e => handleUpdateTemplateField(index, { required: e.target.checked })} disabled={savingTemplate} />
                      <label className="form-check-label small">필수</label>
                    </div>
                  </div>
                  <div className="col-md-1">
                    <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => handleRemoveTemplateField(index)} disabled={savingTemplate}><IoTrashOutline size={14} /></button>
                  </div>
                </div>
                {(fieldType === 'radio' || fieldType === 'checkbox') && (
                  <input type="text" className="form-control form-control-sm" placeholder="옵션1, 옵션2" value={fieldOptionInputs[index] ?? field.options?.join(', ') ?? ''} onChange={e => handleOptionInputChange(index, e.target.value)} disabled={savingTemplate} />
                )}
              </div>
            );
          })}
        </FormSection>
        <FormActions
          onCancel={() => router.replace('/admin-community')}
          onSubmit={handleSaveTemplate}
          submitLabel="저장"
          loading={savingTemplate}
          loadingLabel="저장 중..."
          disabled={!templateName.trim() || templateFields.length === 0}
        />
      </SubPageFrame>
    );
  }

  if (view === 'emoji-form') {
    return (
      <SubPageFrame title={editingEmojiPack ? '이모티콘 팩 수정' : '이모티콘 팩 추가'} onBack={() => router.replace('/admin-community')}>
        <FormSection title="기본 정보">
          <label style={LABEL}>팩 이름</label>
          <input
            type="text"
            className="form-control mb-3"
            style={OHGO_INPUT}
            value={emojiPackName}
            onChange={e => setEmojiPackName(e.target.value)}
            placeholder="예: 기본 이모티콘"
            disabled={savingEmojiPack}
          />
          <label style={LABEL}>설명 (선택)</label>
          <input
            type="text"
            className="form-control"
            style={OHGO_INPUT}
            value={emojiPackDescription}
            onChange={e => setEmojiPackDescription(e.target.value)}
            placeholder="팩에 대한 설명"
            disabled={savingEmojiPack}
          />
        </FormSection>
        <FormSection
          title="이모티콘"
          action={<SectionAddButton label="추가" onClick={handleAddEmoji} />}
        >
          {emojiPackEmojis.length === 0 ? (
            <EmptyState icon={IoHappyOutline} message="이모티콘을 추가해주세요." compact />
          ) : (
            <div className="d-flex flex-column gap-2">
              {emojiPackEmojis.map((emoji, index) => (
                <div key={emoji.emojiId} style={{ ...CARD, padding: 12, boxShadow: 'none', border: '1px solid #EFEFEF' }}>
                  <div className="d-flex align-items-center gap-3">
                    <div className="d-flex gap-1">
                      <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => handleMoveEmoji(index, 'up')} disabled={savingEmojiPack || index === 0}><IoChevronUpOutline size={14} /></button>
                      <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => handleMoveEmoji(index, 'down')} disabled={savingEmojiPack || index === emojiPackEmojis.length - 1}><IoChevronDownOutline size={14} /></button>
                    </div>
                    <div style={{ width: 60, height: 60, flexShrink: 0 }}>
                      {emoji.imageUrl ? (
                        <img src={emoji.imageUrl} alt={emoji.name} style={{ width: '100%', height: '100%', objectFit: 'contain', border: '1px solid #dee2e6', borderRadius: 4 }} />
                      ) : (
                        <div className="d-flex align-items-center justify-content-center border rounded" style={{ width: '100%', height: '100%', backgroundColor: '#f8f9fa' }}>
                          <IoHappyOutline size={24} className="text-muted" />
                        </div>
                      )}
                    </div>
                    <div className="flex-grow-1">
                      <input type="text" className="form-control form-control-sm mb-2" placeholder="이모티콘 이름" value={emoji.name} onChange={e => {
                        const updated = [...emojiPackEmojis];
                        updated[index] = { ...updated[index], name: e.target.value };
                        setEmojiPackEmojis(updated);
                      }} disabled={savingEmojiPack} />
                      <input type="file" className="form-control form-control-sm" accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp" onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) void handleEmojiImageUpload(index, file);
                      }} disabled={savingEmojiPack || uploadingEmojiImage} />
                      <small className="text-muted">PNG, JPG, SVG, WebP (최대 100KB)</small>
                    </div>
                    <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => handleDeleteEmoji(index)} disabled={savingEmojiPack}><IoTrashOutline size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </FormSection>
        <FormActions
          onCancel={() => router.replace('/admin-community')}
          onSubmit={handleSaveEmojiPack}
          submitLabel="저장"
          loading={savingEmojiPack}
          loadingLabel="저장 중..."
          disabled={!emojiPackName.trim()}
        />
      </SubPageFrame>
    );
  }

  return (
    <SubPageFrame title="커뮤니티 관리">
      <FormSection
        title="템플릿 관리"
        action={
          <SectionAddButton
            label="템플릿 추가"
            onClick={() => router.push('/admin-community?view=template-form')}
          />
        }
      >
        <label style={LABEL}>활성 템플릿</label>
        <select
          className="form-select mb-3"
          style={OHGO_INPUT}
          value={activeTemplateId || ''}
          onChange={e => handleSetActiveTemplate(e.target.value || null)}
        >
          <option value="">템플릿 없음</option>
          {templates.map(template => (
            <option key={template.templateId} value={template.templateId}>
              {template.name}
            </option>
          ))}
        </select>

        {templates.length === 0 ? (
          <EmptyState icon={IoSettingsOutline} message="등록된 템플릿이 없습니다." subtitle="템플릿 추가로 조황 글 양식을 만드세요." compact />
        ) : (
          <>
            <label style={LABEL}>템플릿 목록</label>
            <div style={LIST_CONTAINER}>
              {templates.map((template, index) => (
                <div
                  key={template.templateId}
                  className="d-flex align-items-center justify-content-between gap-2 px-3 py-3"
                  style={{
                    borderBottom: index < templates.length - 1 ? '1px solid #F7F8FA' : 'none',
                  }}
                >
                  <div className="min-w-0 flex-grow-1">
                    <div className="d-flex align-items-center gap-2 flex-wrap">
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT }}>
                        {template.name}
                      </span>
                      {activeTemplateId === template.templateId && (
                        <span
                          className="badge rounded-pill"
                          style={{
                            backgroundColor: '#E8F8EE',
                            color: '#2DA44E',
                            fontSize: 10,
                            fontFamily: FONT,
                            fontWeight: 700,
                          }}
                        >
                          활성
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: '#6F767E', fontFamily: FONT, marginTop: 4 }}>
                      필드 {template.fields.length}개
                    </div>
                  </div>
                  <div className="d-flex gap-1 flex-shrink-0">
                    <IconActionButton
                      title="수정"
                      icon={ADMIN_EDIT_ICON}
                      color="#1B6FF5"
                      bg="#EBF1FE"
                      onClick={() =>
                        router.push(`/admin-community?view=template-form&templateId=${template.templateId}`)
                      }
                    />
                    <IconActionButton
                      title="삭제"
                      icon={IoTrashOutline}
                      color="#FF3B30"
                      bg="#FFF0F0"
                      onClick={() => handleDeleteTemplate(template.templateId)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </FormSection>

      <FormSection title="댓글 포인트 설정">
        <div className="row g-2">
          <div className="col-6">
            <label style={LABEL}>댓글 1개당 포인트</label>
            <input
              type="number"
              className="form-control"
              style={OHGO_INPUT}
              min={1}
              value={pointsPerComment}
              onChange={e => setPointsPerComment(parseInt(e.target.value, 10) || 1)}
              disabled={savingSettings}
            />
          </div>
          <div className="col-6">
            <label style={LABEL}>하루 최대 포인트</label>
            <input
              type="number"
              className="form-control"
              style={OHGO_INPUT}
              min={1}
              value={dailyLimit}
              onChange={e => setDailyLimit(parseInt(e.target.value, 10) || 1)}
              disabled={savingSettings}
            />
          </div>
        </div>
        <p style={HINT}>댓글 작성 시 지급되는 포인트와 일일 상한입니다.</p>
        <button
          type="button"
          className={`btn w-100 fw-semibold ohgo-modal__btn ohgo-modal__btn--primary ${OHGO_CONFIRM_BTN_CLASS} mt-2`}
          style={{ ...OHGO_PRIMARY_BTN, opacity: savingSettings ? 0.65 : 1 }}
          onClick={handleSaveSettings}
          disabled={savingSettings}
        >
          {savingSettings ? '저장 중...' : '설정 저장'}
        </button>
      </FormSection>

      <FormSection
        title="이모티콘 팩 관리"
        action={<SectionAddButton label="팩 추가" onClick={handleAddEmojiPack} />}
      >
        {emojiPacks.length === 0 ? (
          <EmptyState
            icon={IoHappyOutline}
            message="등록된 이모티콘 팩이 없습니다."
            subtitle="팩 추가로 댓글 이모티콘을 등록하세요."
            compact
          />
        ) : (
          <div style={LIST_CONTAINER}>
            {emojiPacks.map((pack, index) => (
              <div
                key={pack.packId}
                className="px-3 py-3"
                style={{
                  borderBottom: index < emojiPacks.length - 1 ? '1px solid #F7F8FA' : 'none',
                }}
              >
                <div className="d-flex align-items-start justify-content-between gap-2">
                  <div className="min-w-0 flex-grow-1">
                    <div className="d-flex align-items-center gap-2 flex-wrap">
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT }}>
                        {pack.name}
                      </span>
                      {!pack.isActive && (
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
                          비활성
                        </span>
                      )}
                    </div>
                    {pack.description ? (
                      <div
                        className="text-truncate"
                        style={{ fontSize: 12, color: '#6F767E', fontFamily: FONT, marginTop: 4 }}
                      >
                        {pack.description}
                      </div>
                    ) : null}
                    <div style={{ fontSize: 11, color: '#ABABAB', fontFamily: FONT, marginTop: 4 }}>
                      이모티콘 {pack.emojis.length}개
                    </div>
                  </div>
                  <div className="d-flex gap-1 flex-shrink-0">
                    <IconActionButton
                      title="수정"
                      icon={ADMIN_EDIT_ICON}
                      color="#1B6FF5"
                      bg="#EBF1FE"
                      onClick={() => handleEditEmojiPack(pack)}
                    />
                    <IconActionButton
                      title="삭제"
                      icon={IoTrashOutline}
                      color="#FF3B30"
                      bg="#FFF0F0"
                      onClick={() => handleDeleteEmojiPack(pack.packId)}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-sm mt-2"
                  style={{
                    ...OHGO_SECONDARY_BTN,
                    padding: '6px 12px',
                    fontSize: 12,
                    borderRadius: 8,
                  }}
                  onClick={() => handleToggleEmojiPackActive(pack)}
                >
                  {pack.isActive ? '비활성화' : '활성화'}
                </button>
                {pack.emojis.length > 0 && (
                  <div className="mt-2 d-flex gap-1 flex-wrap">
                    {pack.emojis.slice(0, 8).map(emoji => (
                      <img
                        key={emoji.emojiId}
                        src={emoji.imageUrl}
                        alt={emoji.name}
                        style={{
                          width: 32,
                          height: 32,
                          objectFit: 'contain',
                          border: '1px solid #EFEFEF',
                          borderRadius: 8,
                          backgroundColor: '#F7F8FA',
                        }}
                      />
                    ))}
                    {pack.emojis.length > 8 && (
                      <div
                        className="d-flex align-items-center justify-content-center"
                        style={{
                          width: 32,
                          height: 32,
                          border: '1px solid #EFEFEF',
                          borderRadius: 8,
                          fontSize: 11,
                          color: '#6F767E',
                          fontFamily: FONT,
                          fontWeight: 600,
                          backgroundColor: '#F7F8FA',
                        }}
                      >
                        +{pack.emojis.length - 8}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </FormSection>
    </SubPageFrame>
  );
}

export default function AdminCommunityPage() {
  return (
    <Suspense fallback={<OhgoPageLoading />}>
      <AdminCommunityContent />
    </Suspense>
  );
}

