'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getUser } from '@/lib/storage';
import { getUserByUUID } from '@/lib/firebase-auth';
import { getPhotos, uploadPhoto, deletePhoto, updatePhoto, CommunityPhoto } from '@/utils/community-service';
import { 
  getTemplates, 
  getTemplate,
  getActiveTemplateId,
  CommunityTemplate,
  TemplateField,
} from '@/utils/community-template-service';
import { IoImageOutline, IoTrashOutline, IoAddOutline, IoPencilOutline } from 'react-icons/io5';
import CKEditorComponent from '@/components/CKEditor';
import TemplateFieldInput from '@/components/TemplateFieldInput';
import ImageEditor from '@/components/ImageEditor';
import SubPageFrame from '@/components/SubPageFrame';
import {
  OHGO_CARD,
  OHGO_FONT,
  OHGO_INPUT,
  OHGO_PRIMARY_BTN,
  OHGO_SECONDARY_BTN,
  OhgoPageLoading,
} from '@/lib/page-styles';
import EmptyState from '@/components/EmptyState';
import { useNavigation } from '@/hooks/useNavigation';
import { useNativePullToRefresh } from '@/hooks/useNativePullToRefresh';

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

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ ...CARD, padding: '14px 16px', marginBottom: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT, marginBottom: 12 }}>
        {title}
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
    <div
      className="d-grid gap-2 mt-2"
      style={{ gridTemplateColumns: '1fr 1fr' }}
    >
      <button
        type="button"
        className="btn w-100 fw-semibold"
        style={OHGO_SECONDARY_BTN}
        onClick={onCancel}
        disabled={loading}
      >
        취소
      </button>
      <button
        type="button"
        className="btn w-100 fw-semibold"
        style={{
          ...OHGO_PRIMARY_BTN,
          opacity: disabled || loading ? 0.65 : 1,
        }}
        onClick={onSubmit}
        disabled={disabled || loading}
      >
        {loading ? loadingLabel || '처리 중...' : submitLabel}
      </button>
    </div>
  );
}

function FilePickButton({
  label,
  multiple,
  onChange,
  disabled,
}: {
  label: string;
  multiple?: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className="btn w-100 d-flex align-items-center justify-content-center gap-2 mb-0"
      style={{
        backgroundColor: '#F7F8FA',
        color: '#1A1D1F',
        borderRadius: 10,
        padding: 12,
        border: '2px dashed #EFEFEF',
        fontFamily: FONT,
        fontSize: 14,
        fontWeight: 600,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <IoImageOutline size={18} />
      {label}
      <input
        type="file"
        accept="image/*"
        className="d-none"
        multiple={multiple}
        onChange={onChange}
        disabled={disabled}
      />
    </label>
  );
}

function ImagePreviewGrid({
  urls,
  disabled,
  onRemove,
  onEdit,
  canRemove,
}: {
  urls: string[];
  disabled?: boolean;
  onRemove: (index: number) => void;
  onEdit: (index: number) => void;
  canRemove?: (index: number) => boolean;
}) {
  if (urls.length === 0) return null;
  return (
    <div
      className="mt-3"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 8,
      }}
    >
      {urls.map((url, index) => {
        const removable = canRemove ? canRemove(index) : true;
        return (
          <div key={`${url}-${index}`} className="position-relative">
            <img
              src={url}
              alt={`미리보기 ${index + 1}`}
              className="w-100"
              style={{
                aspectRatio: '1',
                objectFit: 'cover',
                borderRadius: 12,
                border: '1px solid #EFEFEF',
                cursor: disabled ? 'default' : 'pointer',
              }}
              onClick={() => !disabled && onEdit(index)}
            />
            {removable && (
              <button
                type="button"
                className="btn p-0 position-absolute d-flex align-items-center justify-content-center rounded-circle"
                style={{
                  top: 6,
                  right: 6,
                  width: 28,
                  height: 28,
                  backgroundColor: 'rgba(255,255,255,0.95)',
                  border: 'none',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
                  zIndex: 10,
                }}
                onClick={e => {
                  e.stopPropagation();
                  onRemove(index);
                }}
                disabled={disabled}
              >
                <IoTrashOutline size={14} color="#FF3B30" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function photoThumbUrl(photo: CommunityPhoto): string | undefined {
  return photo.imageUrls?.[0] || photo.imageUrl;
}

function AdminPhotosContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = searchParams.get('view');
  const editPhotoId = searchParams.get('photoId');
  const { navigate } = useNavigation();
  const [photos, setPhotos] = useState<CommunityPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [editingImageIndex, setEditingImageIndex] = useState<number | null>(null);
  const [editedImages, setEditedImages] = useState<Record<number, File>>({});
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [templateFieldValues, setTemplateFieldValues] = useState<Record<string, string | string[]>>({});
  const [showTemplateFields, setShowTemplateFields] = useState(false);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const [user, setUser] = useState<{ uuid?: string; name?: string } | null>(null);
  const [templates, setTemplates] = useState<CommunityTemplate[]>([]);
  const [activeTemplateId, setActiveTemplateIdState] = useState<string | null>(null);
  const [editingPhoto, setEditingPhoto] = useState<CommunityPhoto | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editSelectedFiles, setEditSelectedFiles] = useState<File[]>([]);
  const [editPreviewUrls, setEditPreviewUrls] = useState<string[]>([]);
  const [editEditedImages, setEditEditedImages] = useState<Record<number, File>>({});
  const [editEditingImageIndex, setEditEditingImageIndex] = useState<number | null>(null);
  const [updatingPhoto, setUpdatingPhoto] = useState(false);
  const [editTemplateFieldValues, setEditTemplateFieldValues] = useState<Record<string, string | string[]>>({});
  const [showEditTemplateFields, setShowEditTemplateFields] = useState(false);

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
      await Promise.all([loadPhotos(), loadTemplates(), loadActiveTemplate()]);
    };
    checkAuth();
  }, [router]);

  useEffect(() => {
    if (activeTemplateId) {
      const template = templates.find(t => t.templateId === activeTemplateId);
      if (template) {
        setShowTemplateFields(true);
        const initialValues: Record<string, string | string[]> = {};
        template.fields.forEach(field => {
          const fieldType = field.type || 'text';
          if (fieldType === 'checkbox') {
            initialValues[field.label] = [];
          } else {
            initialValues[field.label] = '';
          }
        });
        setTemplateFieldValues(initialValues);
      }
    } else {
      setShowTemplateFields(false);
      setTemplateFieldValues({});
    }
  }, [activeTemplateId, templates]);

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

  const reloadPhotos = async () => {
    try {
      const photosList = await getPhotos();
      setPhotos(photosList);
    } catch (error) {
      console.error('Error loading photos:', error);
      alert('사진을 불러오는 중 오류가 발생했습니다.');
    }
  };

  useNativePullToRefresh(reloadPhotos);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const validFiles: File[] = [];
    const urls: string[] = [];

    files.forEach((file) => {
      if (!file.type.startsWith('image/')) {
        alert(`${file.name}은(는) 이미지 파일이 아닙니다.`);
        return;
      }

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
    
    const newPreviewUrl = URL.createObjectURL(editedFile);
    const newPreviewUrls = [...previewUrls];
    URL.revokeObjectURL(newPreviewUrls[index]);
    newPreviewUrls[index] = newPreviewUrl;
    setPreviewUrls(newPreviewUrls);
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0 || !user?.uuid || !user?.name) {
      alert('이미지를 선택해주세요.');
      return;
    }

    try {
      setUploading(true);
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
      
      const filesToUpload: File[] = [];
      for (let i = 0; i < selectedFiles.length; i++) {
        const fileToUpload = editedImages[i] || selectedFiles[i];
        filesToUpload.push(fileToUpload);
      }
      
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
      router.replace('/admin-photos');
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

  const handleEditPhoto = async (photo: CommunityPhoto) => {
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
    
    setEditSelectedFiles([]);
    const existingImages = latestPhoto.imageUrls || (latestPhoto.imageUrl ? [latestPhoto.imageUrl] : []);
    setEditPreviewUrls(existingImages);
    setEditEditedImages({});
    setEditEditingImageIndex(null);
    
    if (latestPhoto.templateId) {
      let template = templates.find(t => t.templateId === latestPhoto.templateId);
      
      if (!template) {
        try {
          const loadedTemplate = await getTemplate(latestPhoto.templateId);
          if (loadedTemplate) {
            template = loadedTemplate;
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
        const initialValues: Record<string, string | string[]> = {};
        template.fields.forEach(field => {
          const fieldType = field.type || 'text';
          if (latestPhoto.templateFieldValues && latestPhoto.templateFieldValues[field.label] !== undefined) {
            initialValues[field.label] = latestPhoto.templateFieldValues[field.label];
          } else {
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
        setEditTemplateFieldValues(initialValues);
      } else {
        setShowEditTemplateFields(false);
        setEditTemplateFieldValues({});
      }
    } else {
      setShowEditTemplateFields(false);
      setEditTemplateFieldValues({});
    }
    
  };

  useEffect(() => {
    if (view !== 'edit' || !editPhotoId || loading) return;
    if (editingPhoto?.photoId === editPhotoId) return;
    const run = async () => {
      let photo = photos.find(p => p.photoId === editPhotoId);
      if (!photo) {
        try {
          const { getPhoto } = await import('@/utils/community-service');
          photo = (await getPhoto(editPhotoId)) ?? undefined;
        } catch {
          photo = undefined;
        }
      }
      if (photo) {
        await handleEditPhoto(photo);
      } else {
        router.replace('/admin-photos');
      }
    };
    void run();
  }, [view, editPhotoId, loading, photos]);

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

    const newPreviewUrls = [...editPreviewUrls];
    validFiles.forEach(file => {
      newPreviewUrls.push(URL.createObjectURL(file));
    });
    setEditPreviewUrls(newPreviewUrls);

    e.target.value = '';
  };

  const handleEditImageRemove = (index: number) => {
    const isExistingImage = index < editPreviewUrls.length - editSelectedFiles.length;
    
    if (isExistingImage) {
      if (editPreviewUrls.length - editSelectedFiles.length <= 1) {
        alert('최소 1개의 이미지는 유지해야 합니다.');
        return;
      }
      const newPreviewUrls = editPreviewUrls.filter((_, i) => i !== index);
      setEditPreviewUrls(newPreviewUrls);
    } else {
      const fileIndex = index - (editPreviewUrls.length - editSelectedFiles.length);
      const newFiles = editSelectedFiles.filter((_, i) => i !== fileIndex);
      setEditSelectedFiles(newFiles);
      
      URL.revokeObjectURL(editPreviewUrls[index]);
      const newPreviewUrls = editPreviewUrls.filter((_, i) => i !== index);
      setEditPreviewUrls(newPreviewUrls);
      
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
    const isExistingImage = index < editPreviewUrls.length - editSelectedFiles.length;
    
    if (isExistingImage) {
      setEditImageFile(editedFile);
      const newPreviewUrl = URL.createObjectURL(editedFile);
      const newPreviewUrls = [...editPreviewUrls];
      URL.revokeObjectURL(newPreviewUrls[index]);
      newPreviewUrls[index] = newPreviewUrl;
      setEditPreviewUrls(newPreviewUrls);
    } else {
      const fileIndex = index - (editPreviewUrls.length - editSelectedFiles.length);
      setEditEditedImages({ ...editEditedImages, [fileIndex]: editedFile });
      
      const newPreviewUrl = URL.createObjectURL(editedFile);
      const newPreviewUrls = [...editPreviewUrls];
      URL.revokeObjectURL(newPreviewUrls[index]);
      newPreviewUrls[index] = newPreviewUrl;
      setEditPreviewUrls(newPreviewUrls);
    }
    
    setEditEditingImageIndex(null);
  };

  const handleUpdatePhoto = async () => {
    if (!editingPhoto) return;

    try {
      setUpdatingPhoto(true);
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
      
      const existingImageUrls: string[] = [];
      const existingImageCount = editPreviewUrls.length - editSelectedFiles.length;
      for (let i = 0; i < existingImageCount; i++) {
        if (i === 0 && editImageFile) {
          continue;
        }
        existingImageUrls.push(editPreviewUrls[i]);
      }
      
      const newImageFiles: File[] = [];
      if (editImageFile) {
        newImageFiles.push(editImageFile);
      }
      
      for (let i = 0; i < editSelectedFiles.length; i++) {
        const fileToAdd = editEditedImages[i] || editSelectedFiles[i];
        newImageFiles.push(fileToAdd);
      }
      
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

  const formatDate = (date: Date | any | undefined): string => {
    if (!date) return '';
    const d = date instanceof Date ? date : date.toDate ? date.toDate() : new Date(date);
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  };

  if (loading) {
    return <OhgoPageLoading />;
  }

  const uploadForm = (
    <>
      <FormSection title="사진">
        <FilePickButton
          label={previewUrls.length > 0 ? '사진 추가' : '사진 선택'}
          multiple
          onChange={handleFileSelect}
          disabled={uploading}
        />
        <p style={HINT}>여러 장 선택 가능 · 이미지당 5MB 이하 · 탭하여 편집</p>
        <ImagePreviewGrid
          urls={previewUrls}
          disabled={uploading}
          onRemove={handleRemoveImage}
          onEdit={setEditingImageIndex}
        />
      </FormSection>
      <FormSection title="제목">
        <label style={LABEL}>제목 (선택)</label>
        <input
          type="text"
          className="form-control"
          style={OHGO_INPUT}
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="사진 제목"
          disabled={uploading}
        />
      </FormSection>
      {activeTemplateId && showTemplateFields && (
        <FormSection title="템플릿 필드">
          {templates
            .find(t => t.templateId === activeTemplateId)
            ?.fields.sort((a, b) => (a.order || 0) - (b.order || 0))
            .map((field, index) => (
              <div key={index} className={index > 0 ? 'mt-3' : undefined}>
                <label style={LABEL}>
                  {field.label}
                  {field.required && <span style={{ color: '#FF3B30' }}> *</span>}
                </label>
                <TemplateFieldInput
                  field={field}
                  value={templateFieldValues[field.label] || (field.type === 'checkbox' ? [] : '')}
                  onChange={value => setTemplateFieldValues(prev => ({ ...prev, [field.label]: value }))}
                  disabled={uploading}
                />
              </div>
            ))}
        </FormSection>
      )}
      <FormSection title="내용">
        <CKEditorComponent
          value={content}
          onChange={setContent}
          disabled={uploading}
          placeholder="내용을 입력하세요..."
        />
      </FormSection>
      <FormActions
        onCancel={() => router.replace('/admin-photos')}
        onSubmit={() => void handleUpload()}
        submitLabel="등록"
        loading={uploading}
        loadingLabel="등록 중..."
        disabled={selectedFiles.length === 0}
      />
    </>
  );

  const editForm =
    editingPhoto && (
      <>
        <FormSection title="사진">
          <FilePickButton
            label="사진 추가"
            multiple
            onChange={handleEditFileSelect}
            disabled={updatingPhoto}
          />
          <p style={HINT}>탭하여 편집 · 최소 1장 유지</p>
          <ImagePreviewGrid
            urls={editPreviewUrls}
            disabled={updatingPhoto}
            onRemove={handleEditImageRemove}
            onEdit={setEditEditingImageIndex}
            canRemove={index => {
              const isExisting = index < editPreviewUrls.length - editSelectedFiles.length;
              if (!isExisting) return true;
              return editPreviewUrls.length - editSelectedFiles.length > 1;
            }}
          />
        </FormSection>
        <FormSection title="제목">
          <input
            type="text"
            className="form-control"
            style={OHGO_INPUT}
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
            placeholder="사진 제목"
            disabled={updatingPhoto}
          />
        </FormSection>
        {editingPhoto.templateId && showEditTemplateFields && (
          <FormSection title="템플릿 필드">
            {templates
              .find(t => t.templateId === editingPhoto.templateId)
              ?.fields.sort((a, b) => (a.order || 0) - (b.order || 0))
              .map((field, index) => (
                <div key={index} className={index > 0 ? 'mt-3' : undefined}>
                  <label style={LABEL}>
                    {field.label}
                    {field.required && <span style={{ color: '#FF3B30' }}> *</span>}
                  </label>
                  <TemplateFieldInput
                    field={field}
                    value={editTemplateFieldValues[field.label] ?? (field.type === 'checkbox' ? [] : '')}
                    onChange={value => setEditTemplateFieldValues(prev => ({ ...prev, [field.label]: value }))}
                    disabled={updatingPhoto}
                  />
                </div>
              ))}
          </FormSection>
        )}
        <FormSection title="내용">
          <CKEditorComponent value={editContent} onChange={setEditContent} disabled={updatingPhoto} />
        </FormSection>
        <FormActions
          onCancel={() => router.replace('/admin-photos')}
          onSubmit={() => void handleUpdatePhoto()}
          submitLabel="저장"
          loading={updatingPhoto}
          loadingLabel="저장 중..."
        />
      </>
    );

  if (view === 'upload') {
    return (
      <SubPageFrame title="새글 등록" onBack={() => router.replace('/admin-photos')}>
        {uploadForm}
        {editingImageIndex !== null && previewUrls[editingImageIndex] && (
          <ImageEditor
            imageUrl={previewUrls[editingImageIndex]}
            onSave={editedFile => handleImageEditSave(editingImageIndex, editedFile)}
            onCancel={() => setEditingImageIndex(null)}
          />
        )}
      </SubPageFrame>
    );
  }

  if (view === 'edit') {
    return (
      <SubPageFrame title="글 수정" onBack={() => router.replace('/admin-photos')}>
        {editForm || <OhgoPageLoading />}
        {editEditingImageIndex !== null && editPreviewUrls[editEditingImageIndex] && (
          <ImageEditor
            imageUrl={editPreviewUrls[editEditingImageIndex]}
            onSave={editedFile => handleEditImageEditSave(editEditingImageIndex, editedFile)}
            onCancel={() => setEditEditingImageIndex(null)}
          />
        )}
      </SubPageFrame>
    );
  }

  return (
    <SubPageFrame title="조황사진 관리" onRefresh={reloadPhotos}>
      <button
        type="button"
        onClick={() => router.push('/admin-photos?view=upload')}
        className="btn w-100 d-flex align-items-center justify-content-center gap-2 fw-semibold ohgo-modal__btn ohgo-modal__btn--primary mb-3"
        style={OHGO_PRIMARY_BTN}
      >
        <IoAddOutline size={20} aria-hidden />
        새글 등록
      </button>

      {photos.length > 0 && (
        <p className="mb-3" style={{ fontSize: 12, color: '#6F767E', fontFamily: FONT, fontWeight: 600 }}>
          총 {photos.length}건
        </p>
      )}

      {photos.length === 0 ? (
        <div style={{ ...CARD, padding: '20px 16px' }}>
          <EmptyState
            icon={IoImageOutline}
            message="등록된 사진이 없습니다."
            subtitle="위 「+ 새글 등록」 버튼으로 조황을 공유해 보세요."
            compact
          />
        </div>
      ) : (
        <div
          style={{
            borderRadius: 14,
            border: '1px solid #EFEFEF',
            overflow: 'hidden',
            backgroundColor: '#FFFFFF',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          }}
        >
          {photos.map((photo, index) => {
            const thumb = photoThumbUrl(photo);
            const titleText = photo.title?.trim() || '제목 없음';
            const isDeleting = deletingPhotoId === photo.photoId;

            return (
              <div
                key={photo.photoId}
                className="px-3 py-3"
                style={{
                  borderBottom: index < photos.length - 1 ? '1px solid #F7F8FA' : 'none',
                }}
              >
                <div className="d-flex align-items-start gap-3">
                  <button
                    type="button"
                    className="flex-shrink-0 p-0 border-0 overflow-hidden"
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: 12,
                      background: thumb ? `url(${thumb}) center/cover` : '#F2F3F5',
                      border: '1px solid #EFEFEF',
                    }}
                    onClick={() => navigate(`/community/${photo.photoId}`)}
                    aria-label="조황 글 보기"
                  >
                    {!thumb && (
                      <span className="d-flex align-items-center justify-content-center w-100 h-100">
                        <IoImageOutline size={28} color="#B0B8C4" />
                      </span>
                    )}
                  </button>

                  <div className="flex-grow-1 min-w-0">
                    <div className="d-flex align-items-center gap-2 flex-wrap">
                      <span
                        className="badge rounded-pill flex-shrink-0"
                        style={{
                          backgroundColor: '#F7F8FA',
                          color: '#6F767E',
                          fontSize: 10,
                          fontFamily: FONT,
                          fontWeight: 700,
                        }}
                      >
                        {index + 1}
                      </span>
                      <button
                        type="button"
                        className="btn btn-link p-0 text-start flex-grow-1 min-w-0"
                        style={{
                          fontSize: 15,
                          fontWeight: 700,
                          color: '#1A1D1F',
                          fontFamily: FONT,
                          textDecoration: 'none',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        onClick={() => navigate(`/community/${photo.photoId}`)}
                      >
                        {titleText}
                      </button>
                    </div>
                    <div style={{ fontSize: 12, color: '#6F767E', fontFamily: FONT, marginTop: 6 }}>
                      댓글 {photo.commentCount ?? 0}개
                    </div>
                    <div style={{ fontSize: 11, color: '#ABABAB', fontFamily: FONT, marginTop: 4 }}>
                      {formatDate(photo.uploadedAt)}
                    </div>
                  </div>

                  <div className="d-flex flex-row gap-1 flex-shrink-0 align-self-center">
                    <button
                      type="button"
                      onClick={() => router.push(`/admin-photos?view=edit&photoId=${photo.photoId}`)}
                      className="btn p-0 d-flex align-items-center justify-content-center rounded-circle"
                      title="수정"
                      style={{ width: 28, height: 28, backgroundColor: '#EBF1FE', border: 'none' }}
                    >
                      <IoPencilOutline size={14} color="#1B6FF5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(photo.photoId)}
                      className="btn p-0 d-flex align-items-center justify-content-center rounded-circle"
                      title="삭제"
                      disabled={isDeleting}
                      style={{
                        width: 28,
                        height: 28,
                        backgroundColor: '#FFF0F0',
                        border: 'none',
                        opacity: isDeleting ? 0.5 : 1,
                      }}
                    >
                      {isDeleting ? (
                        <span className="spinner-border spinner-border-sm" style={{ width: 14, height: 14 }} role="status" />
                      ) : (
                        <IoTrashOutline size={14} color="#FF3B30" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SubPageFrame>
  );
}

export default function AdminPhotosPage() {
  return (
    <Suspense fallback={<OhgoPageLoading />}>
      <AdminPhotosContent />
    </Suspense>
  );
}

