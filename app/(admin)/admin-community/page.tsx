'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
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
import { IoTrashOutline, IoAddOutline, IoSettingsOutline, IoCreateOutline, IoChevronUpOutline, IoChevronDownOutline, IoHappyOutline } from 'react-icons/io5';
import PageHeader from '@/components/PageHeader';
import { useNavigation } from '@/hooks/useNavigation';

function AdminCommunityContent() {
  const router = useRouter();
  const [user, setUser] = useState<{ uuid?: string; name?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [pointsPerComment, setPointsPerComment] = useState(1);
  const [dailyLimit, setDailyLimit] = useState(10);
  const [savingSettings, setSavingSettings] = useState(false);
  const [templates, setTemplates] = useState<CommunityTemplate[]>([]);
  const [activeTemplateId, setActiveTemplateIdState] = useState<string | null>(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<CommunityTemplate | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateFields, setTemplateFields] = useState<TemplateField[]>([]);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [fieldOptionInputs, setFieldOptionInputs] = useState<Record<number, string>>({});
  const [emojiPacks, setEmojiPacks] = useState<EmojiPack[]>([]);
  const [showEmojiPackModal, setShowEmojiPackModal] = useState(false);
  const [editingEmojiPack, setEditingEmojiPack] = useState<EmojiPack | null>(null);
  const [emojiPackName, setEmojiPackName] = useState('');
  const [emojiPackDescription, setEmojiPackDescription] = useState('');
  const [emojiPackEmojis, setEmojiPackEmojis] = useState<Emoji[]>([]);
  const [savingEmojiPack, setSavingEmojiPack] = useState(false);
  const [uploadingEmojiImage, setUploadingEmojiImage] = useState(false);
  const [editingEmojiIndex, setEditingEmojiIndex] = useState<number | null>(null);

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
    setShowEmojiPackModal(true);
  };

  const handleEditEmojiPack = (pack: EmojiPack) => {
    setEditingEmojiPack(pack);
    setEmojiPackName(pack.name);
    setEmojiPackDescription(pack.description || '');
    setEmojiPackEmojis([...pack.emojis]);
    setShowEmojiPackModal(true);
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
      setShowEmojiPackModal(false);
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
      setShowTemplateModal(false);
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
    setShowTemplateModal(true);
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
              const date = latestPhoto.photoDate instanceof Date ? latestPhoto.photoDate : (latestPhoto.photoDate as any).toDate?.() || new Date(latestPhoto.photoDate);
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
    
    setShowEditModal(true);
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
      setShowEditModal(false);
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

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadPhotos();
    setRefreshing(false);
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
      setShowUploadModal(false);
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


  if (loading) {
    return (
      <div className="min-vh-100 bg-light">
        <PageHeader title="커뮤니티 관리" />
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
    <div 
      className="min-vh-100 bg-light"
      style={{ 
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        position: 'relative',
      }}
    >
      <PageHeader title="커뮤니티 관리" />
      <div className="container pb-4" style={{ paddingTop: '80px' }}>
        {/* 템플릿 관리 */}
        <div className="card shadow-sm mb-4">
          <div className="card-header d-flex align-items-center justify-content-between">
            <div className="d-flex align-items-center">
              <IoSettingsOutline size={20} className="me-2 flex-shrink-0" />
              <h6 className="mb-0">템플릿 관리</h6>
            </div>
            <button
              className="btn btn-sm btn-primary d-flex align-items-center"
              onClick={() => {
                setEditingTemplate(null);
                setTemplateName('');
                setTemplateFields([]);
                setShowTemplateModal(true);
              }}
            >
              <IoAddOutline size={16} className="me-1 flex-shrink-0" />
              템플릿 추가
            </button>
          </div>
          <div className="card-body">
            <div className="mb-3">
              <label className="form-label">활성 템플릿</label>
              <select
                className="form-select"
                value={activeTemplateId || ''}
                onChange={(e) => handleSetActiveTemplate(e.target.value || null)}
              >
                <option value="">템플릿 없음</option>
                {templates.map((template) => (
                  <option key={template.templateId} value={template.templateId}>
                    {template.name}
                  </option>
                ))}
              </select>
            </div>
            {templates.length > 0 && (
              <div>
                <label className="form-label">템플릿 목록</label>
                <div className="list-group">
                  {templates.map((template) => (
                    <div
                      key={template.templateId}
                      className="list-group-item d-flex justify-content-between align-items-center"
                    >
                      <div>
                        <strong>{template.name}</strong>
                        {activeTemplateId === template.templateId && (
                          <span className="badge bg-success ms-2">활성</span>
                        )}
                        <div className="small text-muted">
                          필드 {template.fields.length}개
                        </div>
                      </div>
                      <div className="d-flex gap-2">
                        <button
                          className="btn btn-sm btn-outline-primary"
                          onClick={() => handleEditTemplate(template)}
                        >
                          <IoCreateOutline size={16} />
                        </button>
                        <button
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => handleDeleteTemplate(template.templateId)}
                        >
                          <IoTrashOutline size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 포인트 설정 */}
        <div className="card shadow-sm mb-4">
          <div className="card-header d-flex align-items-center">
            <IoSettingsOutline size={20} className="me-2 flex-shrink-0" />
            <h6 className="mb-0">댓글 포인트 설정</h6>
          </div>
          <div className="card-body">
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label">댓글 1개당 포인트</label>
                <input
                  type="number"
                  className="form-control"
                  min="1"
                  value={pointsPerComment}
                  onChange={(e) => setPointsPerComment(parseInt(e.target.value) || 1)}
                  disabled={savingSettings}
                />
              </div>
              <div className="col-md-6">
                <label className="form-label">하루 최대 포인트</label>
                <input
                  type="number"
                  className="form-control"
                  min="1"
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(parseInt(e.target.value) || 1)}
                  disabled={savingSettings}
                />
              </div>
            </div>
            <div className="mt-3">
              <button
                className="btn btn-primary"
                onClick={handleSaveSettings}
                disabled={savingSettings}
              >
                {savingSettings ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status" />
                    저장 중...
                  </>
                ) : (
                  '설정 저장'
                )}
              </button>
            </div>
          </div>
        </div>

        {/* 이모티콘 팩 관리 */}
        <div className="card shadow-sm mb-4">
          <div className="card-header d-flex align-items-center justify-content-between">
            <div className="d-flex align-items-center">
              <IoHappyOutline size={20} className="me-2 flex-shrink-0" />
              <h6 className="mb-0">이모티콘 팩 관리</h6>
            </div>
            <button
              className="btn btn-sm btn-primary d-flex align-items-center"
              onClick={handleAddEmojiPack}
            >
              <IoAddOutline size={16} className="me-1 flex-shrink-0" />
              팩 추가
            </button>
          </div>
          <div className="card-body">
            {emojiPacks.length === 0 ? (
              <div className="d-flex flex-column align-items-center justify-content-center py-4">
                <IoHappyOutline size={48} className="text-muted mb-2 flex-shrink-0" />
                <p className="text-muted mb-0">등록된 이모티콘 팩이 없습니다.</p>
              </div>
            ) : (
              <div className="row g-3">
                {emojiPacks.map((pack) => (
                  <div key={pack.packId} className="col-md-6">
                    <div className="card border">
                      <div className="card-body">
                        <div className="d-flex justify-content-between align-items-start mb-2">
                          <div>
                            <h6 className="mb-1">
                              {pack.name}
                              {!pack.isActive && (
                                <span className="badge bg-secondary ms-2">비활성</span>
                              )}
                            </h6>
                            {pack.description && (
                              <small className="text-muted d-block">{pack.description}</small>
                            )}
                            <small className="text-muted d-block">
                              이모티콘 {pack.emojis.length}개
                            </small>
                          </div>
                          <div className="d-flex gap-1">
                            <button
                              className="btn btn-sm btn-outline-primary"
                              onClick={() => handleEditEmojiPack(pack)}
                              title="수정"
                            >
                              <IoPencilOutline size={14} />
                            </button>
                            <button
                              className="btn btn-sm btn-outline-danger"
                              onClick={() => handleDeleteEmojiPack(pack.packId)}
                              title="삭제"
                            >
                              <IoTrashOutline size={14} />
                            </button>
                          </div>
                        </div>
                        <div className="d-flex gap-2">
                          <button
                            className="btn btn-sm btn-outline-secondary"
                            onClick={() => handleToggleEmojiPackActive(pack)}
                          >
                            {pack.isActive ? '비활성화' : '활성화'}
                          </button>
                        </div>
                        {pack.emojis.length > 0 && (
                          <div className="mt-2 d-flex gap-1 flex-wrap">
                            {pack.emojis.slice(0, 8).map((emoji) => (
                              <img
                                key={emoji.emojiId}
                                src={emoji.imageUrl}
                                alt={emoji.name}
                                style={{
                                  width: '32px',
                                  height: '32px',
                                  objectFit: 'contain',
                                  border: '1px solid #dee2e6',
                                  borderRadius: '4px',
                                }}
                              />
                            ))}
                            {pack.emojis.length > 8 && (
                              <div
                                className="d-flex align-items-center justify-content-center"
                                style={{
                                  width: '32px',
                                  height: '32px',
                                  border: '1px solid #dee2e6',
                                  borderRadius: '4px',
                                  fontSize: '12px',
                                }}
                              >
                                +{pack.emojis.length - 8}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* 템플릿 편집 모달 */}
      {showTemplateModal && (
        <div 
          className="modal show d-block"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={() => !savingTemplate && setShowTemplateModal(false)}
        >
          <div 
            className="modal-dialog modal-dialog-centered modal-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-content border-0 shadow-lg" style={{ borderRadius: '16px', overflow: 'hidden' }}>
              <div className="modal-header border-0" style={{ 
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                padding: '20px',
              }}>
                <h5 className="modal-title text-white fw-bold mb-0">
                  {editingTemplate ? '템플릿 수정' : '템플릿 추가'}
                </h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => !savingTemplate && setShowTemplateModal(false)}
                  disabled={savingTemplate}
                  style={{ opacity: 0.8 }}
                ></button>
              </div>
              <div className="modal-body p-4">
                <div className="mb-3">
                  <label className="form-label">템플릿 이름</label>
                  <input
                    type="text"
                    className="form-control"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="예: 조황 정보 템플릿"
                    disabled={savingTemplate}
                  />
                </div>
                <div className="mb-3">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <label className="form-label mb-0">필드</label>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-primary d-flex align-items-center"
                      onClick={handleAddTemplateField}
                      disabled={savingTemplate}
                    >
                      <IoAddOutline size={16} className="me-1 flex-shrink-0" />
                      필드 추가
                    </button>
                  </div>
                  {templateFields.map((field, index) => {
                    const fieldType: TemplateFieldType = field.type || 'text';
                    return (
                      <div key={index} className="card mb-2">
                        <div className="card-body">
                          <div className="d-flex align-items-center mb-2">
                            <div className="me-2">
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-secondary"
                                onClick={() => handleMoveTemplateField(index, 'up')}
                                disabled={savingTemplate || index === 0}
                                title="위로 이동"
                              >
                                <IoChevronUpOutline size={14} />
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-secondary ms-1"
                                onClick={() => handleMoveTemplateField(index, 'down')}
                                disabled={savingTemplate || index === templateFields.length - 1}
                                title="아래로 이동"
                              >
                                <IoChevronDownOutline size={14} />
                              </button>
                            </div>
                            <span className="text-muted small me-2">순서: {index + 1}</span>
                          </div>
                          <div className="row g-2 mb-2">
                            <div className="col-md-3">
                              <input
                                type="text"
                                className="form-control form-control-sm"
                                placeholder="필드명 (예: 인원)"
                                value={field.label}
                                onChange={(e) => handleUpdateTemplateField(index, { label: e.target.value })}
                                disabled={savingTemplate}
                              />
                            </div>
                            <div className="col-md-3">
                              <select
                                className="form-select form-select-sm"
                                value={fieldType}
                                onChange={(e) => {
                                  const newType = e.target.value as TemplateFieldType;
                                  const update: Partial<TemplateField> = { type: newType };
                                  if (newType !== 'radio' && newType !== 'checkbox') {
                                    update.options = undefined;
                                  } else if (!field.options) {
                                    update.options = [];
                                  }
                                  handleUpdateTemplateField(index, update);
                                }}
                                disabled={savingTemplate}
                              >
                                <option value="text">한줄 입력칸</option>
                                <option value="textarea">여러줄 입력칸</option>
                                <option value="date">날짜 선택</option>
                                <option value="radio">단일 선택</option>
                                <option value="checkbox">다중 선택</option>
                              </select>
                            </div>
                            <div className="col-md-3">
                              <input
                                type="text"
                                className="form-control form-control-sm"
                                placeholder="플레이스홀더"
                                value={field.placeholder}
                                onChange={(e) => handleUpdateTemplateField(index, { placeholder: e.target.value })}
                                disabled={savingTemplate}
                              />
                            </div>
                            <div className="col-md-2">
                              <div className="form-check">
                                <input
                                  className="form-check-input"
                                  type="checkbox"
                                  checked={field.required || false}
                                  onChange={(e) => handleUpdateTemplateField(index, { required: e.target.checked })}
                                  disabled={savingTemplate}
                                />
                                <label className="form-check-label small">필수</label>
                              </div>
                            </div>
                            <div className="col-md-1">
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-danger"
                                onClick={() => handleRemoveTemplateField(index)}
                                disabled={savingTemplate}
                                title="삭제"
                              >
                                <IoTrashOutline size={14} />
                              </button>
                            </div>
                          </div>
                          {(fieldType === 'radio' || fieldType === 'checkbox') && (
                            <div className="mb-2">
                              <label className="form-label small">옵션 (콤마로 구분)</label>
                              <input
                                type="text"
                                className="form-control form-control-sm"
                                placeholder="옵션1, 옵션2, 옵션3"
                                value={fieldOptionInputs[index] ?? field.options?.join(', ') ?? ''}
                                onChange={(e) => handleOptionInputChange(index, e.target.value)}
                                disabled={savingTemplate}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {templateFields.length === 0 && (
                    <p className="text-muted text-center py-3">필드를 추가해주세요.</p>
                  )}
                </div>
              </div>
              <div className="modal-footer border-0 pt-0">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowTemplateModal(false)}
                  disabled={savingTemplate}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSaveTemplate}
                  disabled={savingTemplate || !templateName.trim() || templateFields.length === 0}
                >
                  {savingTemplate ? (
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

      {/* 이모티콘 팩 편집 모달 */}
      {showEmojiPackModal && (
        <div 
          className="modal show d-block"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={() => !savingEmojiPack && setShowEmojiPackModal(false)}
        >
          <div 
            className="modal-dialog modal-dialog-centered modal-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-content border-0 shadow-lg" style={{ borderRadius: '16px', overflow: 'hidden' }}>
              <div className="modal-header border-0" style={{ 
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                padding: '20px',
              }}>
                <h5 className="modal-title text-white fw-bold mb-0">
                  {editingEmojiPack ? '이모티콘 팩 수정' : '이모티콘 팩 추가'}
                </h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => !savingEmojiPack && setShowEmojiPackModal(false)}
                  disabled={savingEmojiPack}
                  style={{ opacity: 0.8 }}
                ></button>
              </div>
              <div className="modal-body p-4" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                <div className="mb-3">
                  <label className="form-label">팩 이름</label>
                  <input
                    type="text"
                    className="form-control"
                    value={emojiPackName}
                    onChange={(e) => setEmojiPackName(e.target.value)}
                    placeholder="예: 기본 이모티콘"
                    disabled={savingEmojiPack}
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">설명 (선택사항)</label>
                  <input
                    type="text"
                    className="form-control"
                    value={emojiPackDescription}
                    onChange={(e) => setEmojiPackDescription(e.target.value)}
                    placeholder="팩에 대한 설명"
                    disabled={savingEmojiPack}
                  />
                </div>
                <div className="mb-3">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <label className="form-label mb-0">이모티콘</label>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-primary d-flex align-items-center"
                      onClick={handleAddEmoji}
                      disabled={savingEmojiPack}
                    >
                      <IoAddOutline size={16} className="me-1 flex-shrink-0" />
                      이모티콘 추가
                    </button>
                  </div>
                  {emojiPackEmojis.length === 0 ? (
                    <div className="d-flex flex-column align-items-center justify-content-center py-4 border rounded">
                      <IoHappyOutline size={48} className="text-muted mb-2 flex-shrink-0" />
                      <p className="text-muted mb-0">이모티콘을 추가해주세요.</p>
                    </div>
                  ) : (
                    <div className="d-flex flex-column gap-2">
                      {emojiPackEmojis.map((emoji, index) => (
                        <div key={emoji.emojiId} className="card">
                          <div className="card-body">
                            <div className="d-flex align-items-center gap-3">
                              <div className="d-flex gap-1">
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-secondary"
                                  onClick={() => handleMoveEmoji(index, 'up')}
                                  disabled={savingEmojiPack || index === 0}
                                  title="위로 이동"
                                >
                                  <IoChevronUpOutline size={14} />
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-secondary"
                                  onClick={() => handleMoveEmoji(index, 'down')}
                                  disabled={savingEmojiPack || index === emojiPackEmojis.length - 1}
                                  title="아래로 이동"
                                >
                                  <IoChevronDownOutline size={14} />
                                </button>
                              </div>
                              <div style={{ width: '60px', height: '60px', flexShrink: 0 }}>
                                {emoji.imageUrl ? (
                                  <img
                                    src={emoji.imageUrl}
                                    alt={emoji.name}
                                    style={{
                                      width: '100%',
                                      height: '100%',
                                      objectFit: 'contain',
                                      border: '1px solid #dee2e6',
                                      borderRadius: '4px',
                                    }}
                                  />
                                ) : (
                                  <div
                                    className="d-flex align-items-center justify-content-center border rounded"
                                    style={{
                                      width: '100%',
                                      height: '100%',
                                      backgroundColor: '#f8f9fa',
                                    }}
                                  >
                                    <IoHappyOutline size={24} className="text-muted" />
                                  </div>
                                )}
                              </div>
                              <div className="flex-grow-1">
                                <input
                                  type="text"
                                  className="form-control form-control-sm mb-2"
                                  placeholder="이모티콘 이름"
                                  value={emoji.name}
                                  onChange={(e) => {
                                    const updated = [...emojiPackEmojis];
                                    updated[index] = { ...updated[index], name: e.target.value };
                                    setEmojiPackEmojis(updated);
                                  }}
                                  disabled={savingEmojiPack}
                                />
                                <input
                                  type="file"
                                  className="form-control form-control-sm"
                                  accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      handleEmojiImageUpload(index, file);
                                    }
                                  }}
                                  disabled={savingEmojiPack || uploadingEmojiImage}
                                />
                                <small className="text-muted">PNG, JPG, SVG, WebP (최대 100KB)</small>
                              </div>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-danger"
                                onClick={() => handleDeleteEmoji(index)}
                                disabled={savingEmojiPack}
                                title="삭제"
                              >
                                <IoTrashOutline size={14} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="modal-footer border-0 pt-0">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowEmojiPackModal(false)}
                  disabled={savingEmojiPack}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSaveEmojiPack}
                  disabled={savingEmojiPack || !emojiPackName.trim()}
                >
                  {savingEmojiPack ? (
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

export default function AdminCommunityPage() {
  return (
    <Suspense fallback={
      <div className="d-flex min-vh-100 align-items-center justify-content-center">
        <div className="text-center">
          <div className="spinner-border text-primary mb-3" role="status">
            <span className="visually-hidden">로딩 중...</span>
          </div>
          <p className="text-muted">로딩 중...</p>
        </div>
      </div>
    }>
      <AdminCommunityContent />
    </Suspense>
  );
}

