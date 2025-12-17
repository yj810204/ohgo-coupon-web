'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
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
import PageHeader from '@/components/PageHeader';
import { useNavigation } from '@/hooks/useNavigation';

function AdminPhotosContent() {
  const router = useRouter();
  const { navigate } = useNavigation();
  const [photos, setPhotos] = useState<CommunityPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
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
  const [showEditModal, setShowEditModal] = useState(false);
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
    return (
      <div className="min-vh-100 bg-light">
        <PageHeader title="조황사진 관리" />
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
      <PageHeader title="조황사진 관리" />
      <div className="container pb-4" style={{ paddingTop: '80px' }}>
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h5 className="mb-0">조황사진 목록</h5>
          <div className="d-flex gap-2">
            <button
              className="btn btn-sm btn-outline-primary"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              {refreshing ? (
                <>
                  <span className="spinner-border spinner-border-sm me-1" role="status" />
                  새로고침
                </>
              ) : (
                '새로고침'
              )}
            </button>
            <button
              className="btn btn-sm btn-primary d-flex align-items-center"
              onClick={() => {
                setTitle('');
                setDescription('');
                setContent('');
                setTemplateFieldValues({});
                setSelectedFiles([]);
                setPreviewUrls([]);
                setEditedImages({});
                setEditingImageIndex(null);
                setShowUploadModal(true);
              }}
            >
              <IoAddOutline size={18} className="me-1 flex-shrink-0" />
              새글 등록
            </button>
          </div>
        </div>

        {photos.length === 0 ? (
          <div className="d-flex flex-column align-items-center justify-content-center py-5" style={{ minHeight: '50vh' }}>
            <IoImageOutline size={64} className="text-muted mb-3" />
            <p className="text-muted mb-0">등록된 사진이 없습니다.</p>
          </div>
        ) : (
          <div className="row g-3">
            {photos.map((photo) => (
              <div key={photo.photoId} className="col-6 col-md-4 col-lg-3">
                <div className="card shadow-sm">
                  <div 
                    style={{ position: 'relative', paddingTop: '100%', overflow: 'hidden', cursor: 'pointer' }}
                    onClick={() => navigate(`/community/${photo.photoId}`)}
                  >
                    <img
                      src={photo.imageUrl}
                      alt={photo.title || '조황사진'}
                      className="card-img-top"
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                      loading="lazy"
                    />
                  </div>
                  <div className="card-body p-2">
                    {photo.title && (
                      <h6 className="card-title mb-1" style={{ fontSize: '14px' }}>
                        {photo.title}
                      </h6>
                    )}
                    <p className="card-text mb-1" style={{ fontSize: '12px', color: '#666' }}>
                      댓글 {photo.commentCount}개
                    </p>
                    <p className="card-text mb-2" style={{ fontSize: '11px', color: '#999' }}>
                      {formatDate(photo.uploadedAt)}
                    </p>
                    <div className="d-flex gap-2">
                      <button
                        className="btn btn-sm btn-primary flex-fill d-flex align-items-center justify-content-center"
                        onClick={() => handleEditPhoto(photo)}
                      >
                        <IoPencilOutline size={16} className="me-1 flex-shrink-0" />
                        수정
                      </button>
                      <button
                        className="btn btn-sm btn-danger flex-fill d-flex align-items-center justify-content-center"
                        onClick={() => handleDelete(photo.photoId)}
                        disabled={deletingPhotoId === photo.photoId}
                      >
                        {deletingPhotoId === photo.photoId ? (
                          <>
                            <span className="spinner-border spinner-border-sm me-1" role="status" />
                            삭제 중...
                          </>
                        ) : (
                          <>
                            <IoTrashOutline size={16} className="me-1 flex-shrink-0" />
                            삭제
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 업로드 모달 */}
      {showUploadModal && (
        <div 
          className="modal show d-block"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={() => !uploading && setShowUploadModal(false)}
        >
          <div 
            className="modal-dialog modal-dialog-centered"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-content border-0 shadow-lg" style={{ borderRadius: '16px', overflow: 'hidden' }}>
              <div className="modal-header border-0" style={{ 
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                padding: '20px',
              }}>
                <h5 className="modal-title text-white fw-bold mb-0">새글 등록</h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => !uploading && setShowUploadModal(false)}
                  disabled={uploading}
                  style={{ opacity: 0.8 }}
                ></button>
              </div>
              <div className="modal-body p-4">
                <div className="mb-3">
                  <label className="form-label">사진 선택 (여러 장 가능)</label>
                  <input
                    type="file"
                    className="form-control"
                    accept="image/*"
                    multiple
                    onChange={handleFileSelect}
                    disabled={uploading}
                  />
                  {previewUrls.length > 0 && (
                    <div className="mt-3">
                      <div className="row g-2">
                        {previewUrls.map((url, index) => (
                          <div key={index} className="col-6 col-md-4">
                            <div className="position-relative">
                              <img
                                src={url}
                                alt={`미리보기 ${index + 1}`}
                                className="img-fluid rounded"
                                style={{ 
                                  width: '100%', 
                                  height: '150px', 
                                  objectFit: 'cover',
                                  cursor: 'pointer'
                                }}
                                onClick={() => setEditingImageIndex(index)}
                              />
                              <button
                                type="button"
                                className="btn btn-sm btn-danger position-absolute top-0 end-0 m-1"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveImage(index);
                                }}
                                style={{ zIndex: 10 }}
                              >
                                <IoTrashOutline size={14} />
                              </button>
                              <div className="position-absolute bottom-0 start-0 end-0 bg-dark bg-opacity-50 text-white text-center p-1">
                                <small>클릭하여 편집</small>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="mb-3">
                  <label className="form-label">제목 (선택사항)</label>
                  <input
                    type="text"
                    className="form-control"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="사진 제목"
                    disabled={uploading}
                  />
                </div>
                {activeTemplateId && showTemplateFields && (
                  <div className="mb-3">
                    <label className="form-label">템플릿 필드</label>
                    {templates.find(t => t.templateId === activeTemplateId)?.fields
                      .sort((a, b) => (a.order || 0) - (b.order || 0))
                      .map((field, index) => (
                      <div key={index} className="mb-2">
                        <label className="form-label small">{field.label}{field.required && <span className="text-danger">*</span>}</label>
                        <TemplateFieldInput
                          field={field}
                          value={templateFieldValues[field.label] || (field.type === 'checkbox' ? [] : '')}
                          onChange={(value) => setTemplateFieldValues(prev => ({ ...prev, [field.label]: value }))}
                          disabled={uploading}
                        />
                      </div>
                    ))}
                  </div>
                )}
                <div className="mb-3">
                  <label className="form-label">내용</label>
                  <CKEditorComponent
                    value={content}
                    onChange={setContent}
                    disabled={uploading}
                    placeholder="내용을 입력하세요..."
                  />
                </div>
              </div>
              <div className="modal-footer border-0 pt-0">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowUploadModal(false)}
                  disabled={uploading}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleUpload}
                  disabled={uploading || selectedFiles.length === 0}
                >
                  {uploading ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status" />
                      업로드 중...
                    </>
                  ) : (
                    '업로드'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 사진 수정 모달 */}
      {showEditModal && editingPhoto && (
        <div 
          className="modal show d-block"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={() => !updatingPhoto && setShowEditModal(false)}
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
                <h5 className="modal-title text-white fw-bold mb-0">사진 수정</h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => !updatingPhoto && setShowEditModal(false)}
                  disabled={updatingPhoto}
                  style={{ opacity: 0.8 }}
                ></button>
              </div>
              <div className="modal-body p-4" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                <div className="mb-3">
                  <label className="form-label">이미지</label>
                  <input
                    type="file"
                    className="form-control mb-2"
                    accept="image/*"
                    multiple
                    onChange={handleEditFileSelect}
                    disabled={updatingPhoto}
                  />
                  {editPreviewUrls.length > 0 && (
                    <div className="row g-2 mt-2">
                      {editPreviewUrls.map((url, index) => {
                        const isExistingImage = index < editPreviewUrls.length - editSelectedFiles.length;
                        return (
                          <div key={index} className="col-6 col-md-4">
                            <div className="position-relative">
                              <img
                                src={url}
                                alt={`이미지 ${index + 1}`}
                                className="img-fluid rounded border"
                                style={{ 
                                  width: '100%', 
                                  height: '150px', 
                                  objectFit: 'cover',
                                  cursor: 'pointer'
                                }}
                                onClick={() => setEditEditingImageIndex(index)}
                              />
                              <button
                                type="button"
                                className="btn btn-sm btn-danger position-absolute top-0 end-0 m-1"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditImageRemove(index);
                                }}
                                disabled={updatingPhoto || (isExistingImage && editPreviewUrls.length - editSelectedFiles.length <= 1)}
                                title="삭제"
                              >
                                <IoTrashOutline size={14} />
                              </button>
                              {isExistingImage && (
                                <span className="badge bg-info position-absolute bottom-0 start-0 m-1">기존</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="mb-3">
                  <label className="form-label">제목</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="사진 제목"
                    disabled={updatingPhoto}
                  />
                </div>
                {editingPhoto?.templateId && showEditTemplateFields && (
                  <div className="mb-3">
                    <label className="form-label">템플릿 필드</label>
                    {templates.find(t => t.templateId === editingPhoto.templateId)?.fields
                      .sort((a, b) => (a.order || 0) - (b.order || 0))
                      .map((field, index) => (
                      <div key={index} className="mb-2">
                        <label className="form-label small">{field.label}{field.required && <span className="text-danger">*</span>}</label>
                        <TemplateFieldInput
                          field={field}
                          value={editTemplateFieldValues[field.label] ?? (field.type === 'checkbox' ? [] : '')}
                          onChange={(value) => setEditTemplateFieldValues(prev => ({ ...prev, [field.label]: value }))}
                          disabled={updatingPhoto}
                        />
                      </div>
                    ))}
                  </div>
                )}
                <div className="mb-3">
                  <label className="form-label">내용</label>
                  <CKEditorComponent
                    value={editContent}
                    onChange={setEditContent}
                    disabled={updatingPhoto}
                    placeholder="내용을 입력하세요..."
                  />
                </div>
              </div>
              <div className="modal-footer border-0 pt-0">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowEditModal(false)}
                  disabled={updatingPhoto}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleUpdatePhoto}
                  disabled={updatingPhoto}
                >
                  {updatingPhoto ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status" />
                      수정 중...
                    </>
                  ) : (
                    '수정'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 이미지 편집 모달 (업로드용) */}
      {editingImageIndex !== null && previewUrls[editingImageIndex] && (
        <ImageEditor
          imageUrl={previewUrls[editingImageIndex]}
          onSave={(editedFile) => handleImageEditSave(editingImageIndex, editedFile)}
          onCancel={() => setEditingImageIndex(null)}
        />
      )}

      {/* 이미지 편집 모달 (수정용) */}
      {editEditingImageIndex !== null && editPreviewUrls[editEditingImageIndex] && (
        <ImageEditor
          imageUrl={editPreviewUrls[editEditingImageIndex]}
          onSave={(editedFile) => handleEditImageEditSave(editEditingImageIndex, editedFile)}
          onCancel={() => setEditEditingImageIndex(null)}
        />
      )}
    </div>
  );
}

export default function AdminPhotosPage() {
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
      <AdminPhotosContent />
    </Suspense>
  );
}

