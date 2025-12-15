'use client';

import { useState, useEffect } from 'react';
import { getEmojiPacks, EmojiPack, Emoji } from '@/utils/emoji-pack-service';
import { IoCloseOutline } from 'react-icons/io5';

interface EmojiPickerProps {
  onSelect: (emojiId: string) => void;
  onClose: () => void;
}

export default function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const [packs, setPacks] = useState<EmojiPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);

  useEffect(() => {
    const loadPacks = async () => {
      try {
        setLoading(true);
        const emojiPacks = await getEmojiPacks();
        setPacks(emojiPacks);
        
        // 첫 번째 팩 선택
        if (emojiPacks.length > 0) {
          setSelectedPackId(emojiPacks[0].packId);
        }
      } catch (error) {
        console.error('Error loading emoji packs:', error);
      } finally {
        setLoading(false);
      }
    };
    
    loadPacks();
  }, []);

  const selectedPack = packs.find(p => p.packId === selectedPackId);

  const handleEmojiClick = (emojiId: string) => {
    onSelect(emojiId);
  };

  if (loading) {
    return (
      <div
        className="position-fixed top-0 start-0 end-0 bottom-0 bg-dark bg-opacity-75 d-flex align-items-center justify-content-center"
        style={{ zIndex: 9999 }}
        onClick={onClose}
      >
        <div
          className="bg-white rounded-3 p-4"
          style={{ width: '90%', maxWidth: '500px' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-center py-4">
            <div className="spinner-border text-primary mb-3" role="status">
              <span className="visually-hidden">로딩 중...</span>
            </div>
            <p className="text-muted mb-0">이모티콘을 불러오는 중...</p>
          </div>
        </div>
      </div>
    );
  }

  if (packs.length === 0) {
    return (
      <div
        className="position-fixed top-0 start-0 end-0 bottom-0 bg-dark bg-opacity-75 d-flex align-items-center justify-content-center"
        style={{ zIndex: 9999 }}
        onClick={onClose}
      >
        <div
          className="bg-white rounded-3 p-4"
          style={{ width: '90%', maxWidth: '500px' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h5 className="mb-0">이모티콘 선택</h5>
            <button
              type="button"
              className="btn-close"
              onClick={onClose}
            />
          </div>
          <div className="text-center py-4">
            <p className="text-muted mb-0">등록된 이모티콘 팩이 없습니다.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="position-fixed top-0 start-0 end-0 bottom-0 bg-dark bg-opacity-75 d-flex align-items-center justify-content-center"
      style={{ zIndex: 9999 }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3"
        style={{ width: '90%', maxWidth: '500px', maxHeight: '80vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="d-flex justify-content-between align-items-center p-3 border-bottom">
          <h5 className="mb-0">이모티콘 선택</h5>
          <button
            type="button"
            className="btn-close"
            onClick={onClose}
          />
        </div>

        {/* 팩 선택 탭 */}
        {packs.length > 1 && (
          <div className="p-3 border-bottom">
            <div className="d-flex gap-2 flex-wrap">
              {packs.map((pack) => (
                <button
                  key={pack.packId}
                  type="button"
                  className={`btn btn-sm ${
                    selectedPackId === pack.packId
                      ? 'btn-primary'
                      : 'btn-outline-secondary'
                  }`}
                  onClick={() => setSelectedPackId(pack.packId)}
                >
                  {pack.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 이모티콘 그리드 */}
        <div
          className="p-3"
          style={{
            maxHeight: '400px',
            overflowY: 'auto',
          }}
        >
          {selectedPack && selectedPack.emojis.length > 0 ? (
            <div className="row g-2">
              {selectedPack.emojis.map((emoji) => (
                <div key={emoji.emojiId} className="col-3 col-md-2">
                  <button
                    type="button"
                    className="btn btn-outline-light w-100 p-2 d-flex align-items-center justify-content-center"
                    style={{
                      aspectRatio: '1',
                      border: '1px solid #dee2e6',
                      borderRadius: '8px',
                      cursor: 'pointer',
                    }}
                    onClick={() => handleEmojiClick(emoji.emojiId)}
                    title={emoji.name}
                  >
                    <img
                      src={emoji.imageUrl}
                      alt={emoji.name}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                      }}
                    />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-muted mb-0">이모티콘이 없습니다.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
