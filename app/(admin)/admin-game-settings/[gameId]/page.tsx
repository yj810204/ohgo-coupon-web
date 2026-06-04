'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { resolveAppUser } from '@/lib/auth-session';
import { getGame, updateGame, Game } from '@/lib/game-service';
import SubPageFrame from '@/components/SubPageFrame';
import { OhgoPageLoading } from '@/lib/page-styles';

function GameEditContent() {
  const router = useRouter();
  const params = useParams();
  const gameId = params.gameId as string;

  const [loading, setLoading] = useState(true);
  const [game, setGame] = useState<Game | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingThumbnail, setUploadingThumbnail] = useState(false);
  
  const [formData, setFormData] = useState({
    game_name: '',
    game_description: '',
    point_rate: 100,
    // 자동 리사이징 사용 여부 (기본값: false = 자동 리사이징)
    use_fixed_size: false,
    // 기기별 캔버스 크기 설정 (고정 크기 사용 시에만 적용)
    mobile_canvas_width: 400,
    mobile_canvas_height: 600,
    tablet_canvas_width: 500,
    tablet_canvas_height: 700,
    desktop_canvas_width: 600,
    desktop_canvas_height: 700,
    // 매치3 전용: 보드 크기
    mobile_board_size: 5,
    tablet_board_size: 6,
    desktop_board_size: 7,
    // 게임별 기본 점수 설정
    base_score_per_match: 10, // match3: 블럭 매칭당 점수
    score_per_pipe: 10, // flappy_bird: 파이프 통과당 점수
    coin_bonus_score: 5, // flappy_bird: 코인 획득당 점수
    score_per_match: 10, // bubble_shooter: 버블 매치당 점수
  });
  
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const init = async () => {
      const appUser = await resolveAppUser();
      if (!appUser) {
        router.replace('/login');
        return;
      }

      if (!appUser.isAdmin) {
        router.replace('/main');
        return;
      }

      await loadGame();
    };
    init();
  }, [router, gameId]);

  const loadGame = async () => {
    try {
      setLoading(true);
      const gameData = await getGame(gameId);
      if (!gameData) {
        alert('게임을 찾을 수 없습니다.');
        router.back();
        return;
      }

      setGame(gameData);
      
      // game_config_json 파싱하여 기기별 설정 로드
      let gameConfig: any = {};
      if (gameData.config_data) {
        try {
          gameConfig = typeof gameData.config_data === 'string' 
            ? JSON.parse(gameData.config_data) 
            : gameData.config_data;
        } catch (e) {
          console.warn('Failed to parse game_config_json:', e);
        }
      }
      
      setFormData({
        game_name: gameData.game_name,
        game_description: gameData.game_description || '',
        point_rate: gameData.point_rate ?? 100,
        // 자동 리사이징 사용 여부 (기본값: false = 자동 리사이징)
        use_fixed_size: gameConfig.use_fixed_size === true,
        // 기기별 캔버스 크기 (고정 크기 사용 시에만 적용)
        mobile_canvas_width: gameConfig.mobile?.canvas_width || 400,
        mobile_canvas_height: gameConfig.mobile?.canvas_height || 600,
        tablet_canvas_width: gameConfig.tablet?.canvas_width || 500,
        tablet_canvas_height: gameConfig.tablet?.canvas_height || 700,
        desktop_canvas_width: gameConfig.desktop?.canvas_width || 600,
        desktop_canvas_height: gameConfig.desktop?.canvas_height || 700,
        // 매치3 전용: 보드 크기
        mobile_board_size: gameConfig.mobile?.board_size || 5,
        tablet_board_size: gameConfig.tablet?.board_size || 6,
        desktop_board_size: gameConfig.desktop?.board_size || 7,
        // 게임별 기본 점수 설정
        base_score_per_match: gameConfig.base_score_per_match || 10,
        score_per_pipe: gameConfig.score_per_pipe || 10,
        coin_bonus_score: gameConfig.coin_bonus_score || 5,
        score_per_match: gameConfig.score_per_match || 10,
      });

      // 썸네일 미리보기 설정
      if (gameData.thumbnail_url) {
        setThumbnailPreview(gameData.thumbnail_url);
      } else if (gameData.thumbnail_path) {
        if (gameData.thumbnail_path.startsWith('http://') || gameData.thumbnail_path.startsWith('https://')) {
          setThumbnailPreview(gameData.thumbnail_path);
        } else {
          setThumbnailPreview(`/${gameData.thumbnail_path}`);
        }
      }
    } catch (error) {
      console.error('Error loading game:', error);
      alert('게임 정보를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleThumbnailSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 이미지 파일인지 확인
    if (!file.type.startsWith('image/')) {
      alert('이미지 파일만 업로드할 수 있습니다.');
      return;
    }

    // 파일 크기 확인 (5MB 제한)
    if (file.size > 5 * 1024 * 1024) {
      alert('이미지 크기는 5MB 이하여야 합니다.');
      return;
    }

    setThumbnailFile(file);

    // 미리보기 생성
    const reader = new FileReader();
    reader.onload = (e) => {
      setThumbnailPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const uploadThumbnail = async (): Promise<{ url?: string; path?: string } | null> => {
    if (!thumbnailFile) return null;

    try {
      setUploadingThumbnail(true);

      const formData = new FormData();
      formData.append('file', thumbnailFile);
      formData.append('gameId', gameId);

      const response = await fetch('/api/games/upload-thumbnail', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || '썸네일 업로드 실패');
      }

      return {
        url: result.thumbnail_url as string | undefined,
        path: result.thumbnail_path as string | undefined,
      };
    } catch (error) {
      console.error('Thumbnail upload error:', error);
      throw error;
    } finally {
      setUploadingThumbnail(false);
    }
  };

  const handleSave = async () => {
    if (!game) return;

    if (!formData.game_name.trim()) {
      alert('게임 이름을 입력해주세요.');
      return;
    }

    try {
      setSaving(true);

      // 썸네일 업로드
      let thumbnailPath: string | undefined = game.thumbnail_path;
      let thumbnailUrl: string | undefined = game.thumbnail_url;
      if (thumbnailFile) {
        const uploaded = await uploadThumbnail();
        if (uploaded?.url) {
          thumbnailUrl = uploaded.url;
          thumbnailPath = uploaded.path ?? thumbnailPath;
        } else if (uploaded?.path) {
          thumbnailPath = uploaded.path;
        }
      }

      const gameConfigJson: Record<string, unknown> = {
        use_fixed_size: formData.use_fixed_size || false,
      };

      // 게임별 기본 점수 설정 추가
      if (gameId === 'match3') {
        gameConfigJson.base_score_per_match = parseInt(String(formData.base_score_per_match)) || 10;
      } else if (gameId === 'flappy_bird') {
        gameConfigJson.score_per_pipe = parseInt(String(formData.score_per_pipe)) || 10;
        gameConfigJson.coin_bonus_score = parseInt(String(formData.coin_bonus_score)) || 5;
      } else if (gameId === 'bubble_shooter') {
        gameConfigJson.score_per_match = parseInt(String(formData.score_per_match)) || 10;
      }

      // match3 게임의 경우, 자동 리사이징 모드에서도 보드 크기 설정 추가
      if (gameId === 'match3') {
        gameConfigJson.mobile = {
          board_size: parseInt(String(formData.mobile_board_size)) || 5,
        };
        gameConfigJson.tablet = {
          board_size: parseInt(String(formData.tablet_board_size)) || 6,
        };
        gameConfigJson.desktop = {
          board_size: parseInt(String(formData.desktop_board_size)) || 7,
        };
      }

      // 고정 크기 사용 시에만 캔버스 크기 설정 추가
      if (formData.use_fixed_size) {
        if (!gameConfigJson.mobile) gameConfigJson.mobile = {};
        if (!gameConfigJson.tablet) gameConfigJson.tablet = {};
        if (!gameConfigJson.desktop) gameConfigJson.desktop = {};
        
        const mobile = gameConfigJson.mobile as Record<string, number>;
        const tablet = gameConfigJson.tablet as Record<string, number>;
        const desktop = gameConfigJson.desktop as Record<string, number>;

        mobile.canvas_width = parseInt(String(formData.mobile_canvas_width)) || 400;
        mobile.canvas_height = parseInt(String(formData.mobile_canvas_height)) || 600;
        tablet.canvas_width = parseInt(String(formData.tablet_canvas_width)) || 500;
        tablet.canvas_height = parseInt(String(formData.tablet_canvas_height)) || 700;
        desktop.canvas_width = parseInt(String(formData.desktop_canvas_width)) || 600;
        desktop.canvas_height = parseInt(String(formData.desktop_canvas_height)) || 700;
      }

      const updateData: Partial<Game> = {
        game_name: formData.game_name,
        game_description: formData.game_description,
        point_rate: formData.point_rate,
        config_data: JSON.stringify(gameConfigJson),
      };

      if (thumbnailUrl) {
        updateData.thumbnail_url = thumbnailUrl;
        if (thumbnailPath) updateData.thumbnail_path = thumbnailPath;
      } else if (thumbnailPath) {
        updateData.thumbnail_path = thumbnailPath;
      }

      await updateGame(gameId, updateData);

      alert('게임 정보가 저장되었습니다.');
      router.back();
    } catch (error: any) {
      console.error('Save error:', error);
      alert(`게임 정보 저장 중 오류가 발생했습니다: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <OhgoPageLoading />;
  }

  if (!game) {
    return null;
  }

  return (
    <SubPageFrame title="게임 정보 수정">
        <div className="ohgo-card">
          <div className="card-body">
            <div className="mb-4">
              <label className="form-label fw-bold">게임 썸네일</label>
              <div className="mb-3">
                {thumbnailPreview ? (
                  <div className="position-relative" style={{ width: '200px', height: '200px', border: '1px solid #ddd', borderRadius: '8px', overflow: 'hidden' }}>
                    <img
                      src={thumbnailPreview}
                      alt="썸네일 미리보기"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </div>
                ) : (
                  <div className="d-flex align-items-center justify-content-center border rounded" style={{ width: '200px', height: '200px', backgroundColor: '#f8f9fa' }}>
                    <span className="text-muted">썸네일 없음</span>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleThumbnailSelect}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                className="btn btn-outline-primary btn-sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingThumbnail}
              >
                {uploadingThumbnail ? '업로드 중...' : '썸네일 선택'}
              </button>
              {thumbnailFile && (
                <span className="ms-2 text-muted small">
                  선택됨: {thumbnailFile.name}
                </span>
              )}
              <p className="text-muted small mt-2 mb-0">
                게임 스프라이트는 <code>public/{game.game_path}/assets/</code> 폴더에 포함합니다. 스캔 등록 시 썸네일은 자동 동기화됩니다.
              </p>
            </div>

            <div className="mb-3">
              <label className="form-label fw-bold">게임 이름 *</label>
              <input
                type="text"
                className="form-control"
                value={formData.game_name}
                onChange={(e) => setFormData({ ...formData, game_name: e.target.value })}
                placeholder="게임 이름을 입력하세요"
              />
            </div>

            <div className="mb-3">
              <label className="form-label fw-bold">게임 설명</label>
              <textarea
                className="form-control"
                rows={4}
                value={formData.game_description}
                onChange={(e) => setFormData({ ...formData, game_description: e.target.value })}
                placeholder="게임 설명을 입력하세요"
              />
            </div>

            <div className="mb-4">
              <label className="form-label fw-bold">포인트 적립 비율 (%)</label>
              <input
                type="number"
                className="form-control"
                min="0"
                max="1000"
                value={formData.point_rate}
                onChange={(e) => setFormData({ ...formData, point_rate: parseInt(e.target.value) || 100 })}
              />
              <small className="text-muted">예: 10 = 10%, 100 = 점수 그대로</small>
            </div>

            {/* 게임별 기본 점수 설정 */}
            {gameId === 'match3' && (
              <div className="mb-4">
                <label className="form-label fw-bold">블럭 매칭당 기본 점수</label>
                <input
                  type="number"
                  className="form-control"
                  min="1"
                  value={formData.base_score_per_match}
                  onChange={(e) => setFormData({ ...formData, base_score_per_match: parseInt(e.target.value) || 10 })}
                />
                <small className="text-muted">블럭을 매칭할 때마다 부여되는 기본 점수입니다. (기본값: 10점)</small>
              </div>
            )}

            {gameId === 'flappy_bird' && (
              <>
                <div className="mb-4">
                  <label className="form-label fw-bold">파이프 통과당 기본 점수</label>
                  <input
                    type="number"
                    className="form-control"
                    min="1"
                    value={formData.score_per_pipe}
                    onChange={(e) => setFormData({ ...formData, score_per_pipe: parseInt(e.target.value) || 10 })}
                  />
                  <small className="text-muted">파이프를 통과할 때마다 부여되는 기본 점수입니다. (기본값: 10점)</small>
                </div>
                <div className="mb-4">
                  <label className="form-label fw-bold">코인 획득당 기본 점수</label>
                  <input
                    type="number"
                    className="form-control"
                    min="1"
                    value={formData.coin_bonus_score}
                    onChange={(e) => setFormData({ ...formData, coin_bonus_score: parseInt(e.target.value) || 5 })}
                  />
                  <small className="text-muted">코인을 획득할 때마다 부여되는 기본 점수입니다. (기본값: 5점)</small>
                </div>
              </>
            )}

            {gameId === 'bubble_shooter' && (
              <div className="mb-4">
                <label className="form-label fw-bold">버블 매치당 기본 점수</label>
                <input
                  type="number"
                  className="form-control"
                  min="1"
                  value={formData.score_per_match}
                  onChange={(e) => setFormData({ ...formData, score_per_match: parseInt(e.target.value) || 10 })}
                />
                <small className="text-muted">버블을 매치할 때마다 부여되는 기본 점수입니다. (기본값: 10점)</small>
              </div>
            )}

            {/* 기기별 캔버스 크기 설정 - 자동 리사이징 사용 (기본값) */}
            <div className="mb-4">
              <label className="form-label fw-bold">캔버스 크기 설정</label>
              <div className="alert alert-info small mb-3">
                <strong>기본값: 자동 리사이징</strong><br />
                게임은 디바이스의 화면 크기에 맞게 자동으로 리사이징됩니다. 고정 크기를 사용하려면 아래 옵션을 활성화하세요.
                {gameId === 'match3' && (
                  <>
                    <br /><br />
                    <strong>참고:</strong> match3 게임의 경우, 캔버스 크기는 자동 리사이징되지만 가로 블럭 수(보드 크기)는 아래에서 지정할 수 있습니다.
                  </>
                )}
              </div>
              <div className="form-check mb-3">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="useFixedSize"
                  checked={formData.use_fixed_size || false}
                  onChange={(e) => setFormData({ ...formData, use_fixed_size: e.target.checked })}
                />
                <label className="form-check-label" htmlFor="useFixedSize">
                  고정 크기 사용 (관리자 설정에서 지정한 크기 사용)
                </label>
              </div>
              
              {/* match3 게임의 경우, 자동 리사이징 모드에서도 보드 크기 설정 표시 */}
              {gameId === 'match3' && !formData.use_fixed_size && (
                <div className="mb-4">
                  <label className="form-label fw-bold">보드 크기 설정 (가로 블럭 수)</label>
                  <p className="text-muted small mb-3">
                    캔버스는 자동 리사이징되지만, 가로 블럭 수는 기기별로 지정할 수 있습니다.
                  </p>
                  
                  {/* 모바일 보드 크기 */}
                  <div className="ohgo-card mb-3">
                    <div className="card-header bg-light">
                      <h6 className="mb-0">📱 스마트폰 (화면 너비 &lt; 768px)</h6>
                    </div>
                    <div className="card-body">
                      <div className="mb-3">
                        <label className="form-label small">보드 크기:</label>
                        <input
                          type="number"
                          className="form-control form-control-sm"
                          min="5"
                          max="10"
                          value={formData.mobile_board_size}
                          onChange={(e) => setFormData({ ...formData, mobile_board_size: parseInt(e.target.value) || 5 })}
                        />
                        <small className="text-muted">게임 보드의 크기 (기본: 5x5)</small>
                      </div>
                    </div>
                  </div>
                  
                  {/* 태블릿 보드 크기 */}
                  <div className="ohgo-card mb-3">
                    <div className="card-header bg-light">
                      <h6 className="mb-0">📱 태블릿 (화면 너비 768px - 1024px)</h6>
                    </div>
                    <div className="card-body">
                      <div className="mb-3">
                        <label className="form-label small">보드 크기:</label>
                        <input
                          type="number"
                          className="form-control form-control-sm"
                          min="5"
                          max="10"
                          value={formData.tablet_board_size}
                          onChange={(e) => setFormData({ ...formData, tablet_board_size: parseInt(e.target.value) || 6 })}
                        />
                        <small className="text-muted">게임 보드의 크기 (기본: 6x6)</small>
                      </div>
                    </div>
                  </div>
                  
                  {/* 데스크톱 보드 크기 */}
                  <div className="ohgo-card mb-3">
                    <div className="card-header bg-light">
                      <h6 className="mb-0">💻 PC (화면 너비 &gt; 1024px)</h6>
                    </div>
                    <div className="card-body">
                      <div className="mb-3">
                        <label className="form-label small">보드 크기:</label>
                        <input
                          type="number"
                          className="form-control form-control-sm"
                          min="5"
                          max="10"
                          value={formData.desktop_board_size}
                          onChange={(e) => setFormData({ ...formData, desktop_board_size: parseInt(e.target.value) || 7 })}
                        />
                        <small className="text-muted">게임 보드의 크기 (기본: 7x7)</small>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {formData.use_fixed_size && (
                <div>
                  <p className="text-muted small mb-3">
                    {gameId === 'match3' 
                      ? '스마트폰, 태블릿, PC 각각에 대해 보드 크기와 캔버스 크기를 개별 설정할 수 있습니다.'
                      : '스마트폰, 태블릿, PC 각각에 대해 캔버스 크기를 개별 설정할 수 있습니다.'}
                  </p>

              {/* 모바일 설정 */}
              <div className="ohgo-card mb-3">
                <div className="card-header bg-light">
                  <h6 className="mb-0">📱 스마트폰 (화면 너비 &lt; 768px)</h6>
                </div>
                <div className="card-body">
                  {gameId === 'match3' && (
                    <div className="mb-3">
                      <label className="form-label small">보드 크기:</label>
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        min="5"
                        max="10"
                        value={formData.mobile_board_size}
                        onChange={(e) => setFormData({ ...formData, mobile_board_size: parseInt(e.target.value) || 5 })}
                      />
                      <small className="text-muted">게임 보드의 크기 (기본: 5x5)</small>
                    </div>
                  )}
                  <div className="row g-2">
                    <div className="col-6">
                      <label className="form-label small">캔버스 너비 (px):</label>
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        min="300"
                        max="800"
                        value={formData.mobile_canvas_width}
                        onChange={(e) => setFormData({ ...formData, mobile_canvas_width: parseInt(e.target.value) || 400 })}
                      />
                      <small className="text-muted">기본: 400px</small>
                    </div>
                    <div className="col-6">
                      <label className="form-label small">캔버스 높이 (px):</label>
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        min="400"
                        max="1000"
                        value={formData.mobile_canvas_height}
                        onChange={(e) => setFormData({ ...formData, mobile_canvas_height: parseInt(e.target.value) || 600 })}
                      />
                      <small className="text-muted">기본: 600px</small>
                    </div>
                  </div>
                </div>
              </div>

              {/* 태블릿 설정 */}
              <div className="ohgo-card mb-3">
                <div className="card-header bg-light">
                  <h6 className="mb-0">📱 태블릿 (화면 너비 768px - 1024px)</h6>
                </div>
                <div className="card-body">
                  {gameId === 'match3' && (
                    <div className="mb-3">
                      <label className="form-label small">보드 크기:</label>
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        min="5"
                        max="10"
                        value={formData.tablet_board_size}
                        onChange={(e) => setFormData({ ...formData, tablet_board_size: parseInt(e.target.value) || 6 })}
                      />
                      <small className="text-muted">게임 보드의 크기 (기본: 6x6)</small>
                    </div>
                  )}
                  <div className="row g-2">
                    <div className="col-6">
                      <label className="form-label small">캔버스 너비 (px):</label>
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        min="400"
                        max="1000"
                        value={formData.tablet_canvas_width}
                        onChange={(e) => setFormData({ ...formData, tablet_canvas_width: parseInt(e.target.value) || 500 })}
                      />
                      <small className="text-muted">기본: 500px</small>
                    </div>
                    <div className="col-6">
                      <label className="form-label small">캔버스 높이 (px):</label>
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        min="500"
                        max="1100"
                        value={formData.tablet_canvas_height}
                        onChange={(e) => setFormData({ ...formData, tablet_canvas_height: parseInt(e.target.value) || 700 })}
                      />
                      <small className="text-muted">기본: 700px</small>
                    </div>
                  </div>
                </div>
              </div>

              {/* 데스크톱 설정 */}
              <div className="ohgo-card mb-3">
                <div className="card-header bg-light">
                  <h6 className="mb-0">💻 PC (화면 너비 &gt; 1024px)</h6>
                </div>
                <div className="card-body">
                  {gameId === 'match3' && (
                    <div className="mb-3">
                      <label className="form-label small">보드 크기:</label>
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        min="5"
                        max="10"
                        value={formData.desktop_board_size}
                        onChange={(e) => setFormData({ ...formData, desktop_board_size: parseInt(e.target.value) || 7 })}
                      />
                      <small className="text-muted">게임 보드의 크기 (기본: 7x7)</small>
                    </div>
                  )}
                  <div className="row g-2">
                    <div className="col-6">
                      <label className="form-label small">캔버스 너비 (px):</label>
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        min="400"
                        max="1200"
                        value={formData.desktop_canvas_width}
                        onChange={(e) => setFormData({ ...formData, desktop_canvas_width: parseInt(e.target.value) || 600 })}
                      />
                      <small className="text-muted">기본: 600px</small>
                    </div>
                    <div className="col-6">
                      <label className="form-label small">캔버스 높이 (px):</label>
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        min="500"
                        max="1200"
                        value={formData.desktop_canvas_height}
                        onChange={(e) => setFormData({ ...formData, desktop_canvas_height: parseInt(e.target.value) || 700 })}
                      />
                      <small className="text-muted">기본: 700px</small>
                    </div>
                  </div>
                </div>
              </div>
                </div>
              )}
            </div>

            <div className="d-flex gap-2">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => router.back()}
                disabled={saving}
              >
                취소
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSave}
                disabled={saving || uploadingThumbnail}
              >
                {saving ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                    저장 중...
                  </>
                ) : (
                  '저장'
                )}
              </button>
            </div>
          </div>
        </div>
    </SubPageFrame>
  );
}

export default function GameEditPage() {
  return (
    <Suspense fallback={<OhgoPageLoading />}>
      <GameEditContent />
    </Suspense>
  );
}

