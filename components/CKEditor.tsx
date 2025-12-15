'use client';

import { useEffect, useRef, useState } from 'react';

interface CKEditorComponentProps {
  value: string;
  onChange: (data: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export default function CKEditorComponent({
  value,
  onChange,
  disabled = false,
  placeholder = '내용을 입력하세요...',
}: CKEditorComponentProps) {
  const editorRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [EditorComponent, setEditorComponent] = useState<any>(null);
  const [showSource, setShowSource] = useState(false);
  const [sourceValue, setSourceValue] = useState(value);

  // CKEditor 로드
  useEffect(() => {
    // 클라이언트 사이드에서만 CKEditor 로드
    if (typeof window === 'undefined') return;

    let mounted = true;

    const loadEditor = async () => {
      try {
        const [{ CKEditor }, ClassicEditor] = await Promise.all([
          import('@ckeditor/ckeditor5-react'),
          import('@ckeditor/ckeditor5-build-classic')
        ]);

        if (!mounted) return;

        setEditorComponent(() => (props: any) => (
          <CKEditor
            editor={ClassicEditor.default}
            {...props}
          />
        ));
        setIsReady(true);
      } catch (error) {
        console.error('Error loading CKEditor:', error);
      }
    };

    loadEditor();

    return () => {
      mounted = false;
    };
  }, []);

  // 소스 모드와 에디터 모드 간 값 동기화
  useEffect(() => {
    if (!showSource) {
      setSourceValue(value);
    }
  }, [value, showSource]);

  if (!isReady || !EditorComponent) {
    return (
      <div className="form-control" style={{ minHeight: '200px', padding: '12px' }}>
        <div className="text-muted">에디터 로딩 중...</div>
      </div>
    );
  }

  const handleSourceChange = (newValue: string) => {
    setSourceValue(newValue);
    onChange(newValue);
  };

  const handleToggleSource = () => {
    if (showSource) {
      // 소스 모드에서 에디터 모드로 전환
      onChange(sourceValue);
    } else {
      // 에디터 모드에서 소스 모드로 전환
      if (editorRef.current) {
        setSourceValue(editorRef.current.getData());
      }
    }
    setShowSource(!showSource);
  };

  return (
    <div className="ckeditor-wrapper" ref={containerRef}>
      <div className="d-flex justify-content-end mb-2">
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          onClick={handleToggleSource}
          disabled={disabled}
        >
          {showSource ? '에디터 모드' : 'HTML 소스 모드'}
        </button>
      </div>
      {showSource ? (
        <textarea
          className="form-control"
          style={{ minHeight: '300px', fontFamily: 'monospace', fontSize: '12px' }}
          value={sourceValue}
          onChange={(e) => handleSourceChange(e.target.value)}
          disabled={disabled}
          placeholder="HTML 코드를 직접 입력하세요..."
        />
      ) : (
        <EditorComponent
          data={value}
          disabled={disabled}
          config={{
            placeholder,
            language: 'ko',
            toolbar: [
              'heading',
              '|',
              'bold',
              'italic',
              'link',
              'bulletedList',
              'numberedList',
              '|',
              'blockQuote',
              'insertTable',
              '|',
              'undo',
              'redo',
            ],
          }}
          onChange={(event: any, editor: any) => {
            const data = editor.getData();
            onChange(data);
          }}
          onReady={(editor: any) => {
            editorRef.current = editor;
          }}
        />
      )}
      <style jsx global>{`
        .ckeditor-wrapper .ck-editor__editable {
          min-height: 200px;
        }
        .ckeditor-wrapper .ck-editor__editable:focus {
          border-color: #667eea;
          box-shadow: 0 0 0 0.2rem rgba(102, 126, 234, 0.25);
        }
      `}</style>
    </div>
  );
}

