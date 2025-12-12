/**
 * 버블 슈터 게임 (Phaser3)
 * 
 * 보안 경고: 이 코드는 보호되어 있습니다.
 * 무단 복제, 수정, 배포는 금지됩니다.
 */

// ============================================
// 보안 및 복제 방지 시스템
// ============================================
(function() {
    'use strict';
    
    // 1. 도메인 체크
    const allowedDomains = [
        'localhost',
        '127.0.0.1',
        // 운영 도메인을 여기에 추가하세요
        'codejaka01.cafe24.com',
        // 'www.yourdomain.com'
    ];
    
    function checkDomain() {
        const currentDomain = window.location.hostname;
        const isAllowed = allowedDomains.some(domain => {
            return currentDomain === domain || currentDomain.endsWith('.' + domain);
        });
        
        if (!isAllowed) {
            console.error('Unauthorized domain');
            document.body.innerHTML = '<div style="padding: 50px; text-align: center;"><h1>접근이 제한되었습니다</h1><p>이 게임은 인증된 도메인에서만 실행할 수 있습니다.</p></div>';
            throw new Error('Domain verification failed');
        }
    }
    
    // 2. 안티 디버깅 (개발자 도구 감지)
    let devtoolsOpen = false;
    const threshold = 160;
    
    function detectDevTools() {
        const widthThreshold = window.outerWidth - window.innerWidth > threshold;
        const heightThreshold = window.outerHeight - window.innerHeight > threshold;
        
        if (widthThreshold || heightThreshold) {
            if (!devtoolsOpen) {
                devtoolsOpen = true;
                console.warn('Developer tools detected');
            }
        } else {
            devtoolsOpen = false;
        }
    }
    
    // 3. 콘솔 보호
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    
    // 프로덕션 환경에서만 콘솔 비활성화 (선택적)
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        // console.log = function() {};
        // console.warn = function() {};
        // console.error = function() {};
    }
    
    // 4. 우클릭 및 단축키 방지 (선택적)
    function preventContextMenu(e) {
        if (e.target.closest('.game-container') || e.target.closest('#game-canvas')) {
            e.preventDefault();
            return false;
        }
    }
    
    function preventShortcuts(e) {
        // F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U 방지
        if (e.keyCode === 123 || // F12
            (e.ctrlKey && e.shiftKey && e.keyCode === 73) || // Ctrl+Shift+I
            (e.ctrlKey && e.shiftKey && e.keyCode === 74) || // Ctrl+Shift+J
            (e.ctrlKey && e.keyCode === 85)) { // Ctrl+U
            e.preventDefault();
            return false;
        }
    }
    
    // 5. 무결성 검증 (코드 변조 감지)
    const codeFingerprint = Date.now().toString(36);
    window.__gameIntegrity = codeFingerprint;
    
    function verifyIntegrity() {
        if (window.__gameIntegrity !== codeFingerprint) {
            console.error('Code integrity verification failed');
            throw new Error('Code has been tampered');
        }
    }
    
    // 초기화
    try {
        checkDomain();
        
        // 개발자 도구 감지 (주기적 체크)
        setInterval(detectDevTools, 1000);
        
        // 이벤트 리스너 등록 (선택적)
        // document.addEventListener('contextmenu', preventContextMenu);
        // document.addEventListener('keydown', preventShortcuts);
        
        // 무결성 검증 (주기적 체크)
        setInterval(verifyIntegrity, 5000);
        
    } catch (error) {
        console.error('Security initialization failed:', error);
        throw error;
    }
})();

// ============================================
// 게임 코드 시작
// ============================================
class BubbleShooterGame {
    constructor(config) {
        this.config = config;
        this.game = null;
        this.scene = null;
        this.score = 0;
        this.shots = 0; // 발사 횟수
        this.timeRemaining = 120;
        this.initialTimeLimit = 120;
        this.gameStartTime = null;
        this.isPaused = false;
        this.isProcessing = false;
        this.grid = []; // 육각형 그리드
        this.gridRows = 11; // 하단 그리드 한줄 추가
        this.gridCols = 8; // 기본값 (나중에 createGrid에서 계산)
        this.totalCols = 0; // 전체 그리드 열 수 (캔버스 width 기반)
        this.visibleColStart = 2; // 가시 영역 시작 열
        this.visibleColEnd = 6; // 가시 영역 끝 열
        this.bubbleTypes = [];
        this.bubbleRadius = 25;
        this.canvasWidth = 600;
        this.canvasHeight = 700;
        this.shooterX = 0;
        this.shooterY = 0;
        this.currentBubble = null;
        this.nextBubble = null;
        this.shootingAngle = 0;
        this.isShooting = false;
        this.shotBubble = null;
        this.shotVelocityX = 0;
        this.shotVelocityY = 0;
        this.gameEndModal = null;
        this.gameStartModal = null;
        this.timer = null;
        this.checkCollisionInterval = null;
        this.isAttaching = false; // 부착 중 플래그
        this.hitBubbleInfo = null; // 충돌한 버블 정보 저장
        this.gridStartY = 0; // 그리드 시작 Y 위치 (상단 경계 체크용)
        this.gridStartX = 0; // 그리드 시작 X 위치 (col 계산용)
        this.hexWidth = 0; // 육각형 그리드 가로 간격 (col 계산용)
        this.isAiming = false; // 조준 중 플래그 (모바일 터치 지원)
        this.lastPointerX = 0; // 마지막 포인터 X 위치 (가이드 애니메이션용)
        this.lastPointerY = 0; // 마지막 포인터 Y 위치 (가이드 애니메이션용)
        
        // 게임 설정 기본값
        this.matchPoints = 10; // 버블 매치당 기본 점수
        this.bubblesPerInterval = 3; // 간격마다 추가되는 버블 개수 (기본 3개)
        
        // 레벨 시스템
        this.currentLevel = 1; // 현재 레벨
        this.initialBubbleRows = 3; // 초기 버블 줄 수 (레벨에 따라 증가)
        this.removedBubbleCount = 0; // 전체 제거된 버블 개수 (통계용)
        this.levelRemovedCount = 0; // 현재 레벨에서 제거한 버블 개수 (레벨업 기준)
    }

    /**
     * 게임 시작
     */
    start(containerId) {
        // 게임 설정 파싱
        if (this.config.game_config_json) {
            try {
                let gameConfig = this.config.game_config_json;
                if (typeof gameConfig === 'string') {
                    if (gameConfig.trim() === '' || gameConfig === 'null' || gameConfig === 'undefined') {
                        gameConfig = null;
                    } else {
                        let decoded = gameConfig;
                        if (gameConfig.includes('&quot;') || gameConfig.includes('&amp;')) {
                            const textarea = document.createElement('textarea');
                            textarea.innerHTML = gameConfig;
                            decoded = textarea.value;
                        }
                        try {
                            gameConfig = JSON.parse(decoded);
                        } catch (parseError) {
                            console.error('JSON 파싱 실패:', parseError);
                            gameConfig = null;
                        }
                    }
                }
                
                if (gameConfig && typeof gameConfig === 'object') {
                    if (gameConfig.time_limit) {
                        this.timeRemaining = parseInt(gameConfig.time_limit);
                        this.initialTimeLimit = parseInt(gameConfig.time_limit);
                    }
                    if (gameConfig.grid_rows) this.gridRows = parseInt(gameConfig.grid_rows);
                    if (gameConfig.grid_cols) this.gridCols = parseInt(gameConfig.grid_cols);
                    if (gameConfig.bubble_types && Array.isArray(gameConfig.bubble_types)) {
                        this.bubbleTypes = gameConfig.bubble_types;
                    }
                    if (gameConfig.base_score_per_match) this.matchPoints = parseInt(gameConfig.base_score_per_match);
                    if (gameConfig.bubbles_per_interval) {
                        this.bubblesPerInterval = parseInt(gameConfig.bubbles_per_interval);
                    }
                }
            } catch (e) {
                console.error('게임 설정 파싱 오류:', e);
            }
        }

        // 기본 버블 타입 설정 (색상만 사용)
        if (!this.bubbleTypes || this.bubbleTypes.length === 0) {
            this.bubbleTypes = [
                { id: 0, emoji: '', color: '#FF4444', image_path: '' },
                { id: 1, emoji: '', color: '#4444FF', image_path: '' },
                { id: 2, emoji: '', color: '#44FF44', image_path: '' },
                { id: 3, emoji: '', color: '#FFFF44', image_path: '' },
                { id: 4, emoji: '', color: '#FF44FF', image_path: '' },
                { id: 5, emoji: '', color: '#FF8844', image_path: '' }
            ];
        }
        
        // 버블 타입의 emoji 필드를 빈 문자열로 강제 설정 (색상만 사용)
        if (this.bubbleTypes && Array.isArray(this.bubbleTypes)) {
            this.bubbleTypes.forEach(bubbleType => {
                if (bubbleType) {
                    bubbleType.emoji = '';
                    bubbleType.image_path = '';
                }
            });
        }

        // 화면 크기 감지 및 기기별 설정 적용
        let deviceConfig = null;
        const screenWidth = window.innerWidth;
        
        let gameConfig = null;
        if (this.config.game_config_json) {
            try {
                let configJson = this.config.game_config_json;
                if (typeof configJson === 'string') {
                    if (configJson.trim() !== '' && configJson !== 'null' && configJson !== 'undefined') {
                        let decoded = configJson;
                        if (configJson.includes('&quot;') || configJson.includes('&amp;')) {
                            const textarea = document.createElement('textarea');
                            textarea.innerHTML = configJson;
                            decoded = textarea.value;
                        }
                        try {
                            gameConfig = JSON.parse(decoded);
                        } catch (e) {
                            console.error('JSON 파싱 실패:', e);
                        }
                    }
                } else {
                    gameConfig = configJson;
                }
            } catch (e) {
                console.error('게임 설정 파싱 오류:', e);
            }
        }
        
        if (screenWidth < 768) {
            if (gameConfig && gameConfig.mobile) {
                deviceConfig = gameConfig.mobile;
            } else {
                deviceConfig = { canvas_width: 400, canvas_height: 600 };
            }
        } else if (screenWidth < 1024) {
            if (gameConfig && gameConfig.tablet) {
                deviceConfig = gameConfig.tablet;
            } else {
                deviceConfig = { canvas_width: 500, canvas_height: 700 };
            }
        } else {
            if (gameConfig && gameConfig.desktop) {
                deviceConfig = gameConfig.desktop;
            } else if (gameConfig && gameConfig.canvas_width) {
                deviceConfig = {
                    canvas_width: parseInt(gameConfig.canvas_width) || 600,
                    canvas_height: parseInt(gameConfig.canvas_height) || 700
                };
            } else {
                deviceConfig = { canvas_width: 600, canvas_height: 700 };
            }
        }
        
        if (deviceConfig) {
            this.canvasWidth = parseInt(deviceConfig.canvas_width) || this.canvasWidth;
            this.canvasHeight = parseInt(deviceConfig.canvas_height) || this.canvasHeight;
        }

        const phaserConfig = {
            type: Phaser.AUTO,
            width: this.canvasWidth,
            height: this.canvasHeight,
            parent: containerId,
            scene: {
                preload: this.preload.bind(this),
                create: this.create.bind(this),
                update: this.update.bind(this)
            },
            backgroundColor: '#87CEEB',
            physics: {
                default: 'arcade',
                arcade: {
                    gravity: { y: 0 },
                    debug: false
                }
            },
            render: {
                antialias: true,
                antialiasGL: true,
                pixelArt: false,
                roundPixels: false
            },
            scale: {
                mode: Phaser.Scale.NONE,
                autoCenter: Phaser.Scale.CENTER_BOTH,
                width: this.canvasWidth,
                height: this.canvasHeight
            }
        };

        this.game = new Phaser.Game(phaserConfig);
    }

    /**
     * 리소스 로드
     */
    preload() {
        // 버블 이미지 로드 (있는 경우)
        this.bubbleTypes.forEach((bubbleType, index) => {
            let imagePath = null;
            
            // image_path가 설정되어 있으면 사용
            if (bubbleType.image_path && bubbleType.image_path.trim() !== '') {
                imagePath = bubbleType.image_path.trim();
            } else {
                // image_path가 없으면 기본 경로 확인 (assets/block_N.png)
                imagePath = 'assets/block_' + index + '.png';
            }
            
            if (imagePath) {
                const imageKey = `bubble_${index}`;
                let finalImagePath = imagePath;
                
                // 경로 처리
                if (finalImagePath.startsWith('http://') || finalImagePath.startsWith('https://') || finalImagePath.startsWith('/')) {
                    // 절대 경로 (그대로 사용)
                } else if (finalImagePath.startsWith('./')) {
                    // 상대 경로 (그대로 사용)
                } else if (finalImagePath.startsWith('assets/')) {
                    // assets/로 시작하는 경우 game_path에 추가
                    finalImagePath = this.config.game_path + '/' + finalImagePath;
                } else if (finalImagePath.startsWith('games/')) {
                    // games/로 시작하는 경우 모듈 경로 추가
                    const gamePathParts = this.config.game_path.split('/');
                    const modulePath = gamePathParts.slice(0, -2).join('/');
                    finalImagePath = modulePath + '/' + finalImagePath;
                } else {
                    // 그 외의 경우 game_path에 추가
                    finalImagePath = this.config.game_path + '/' + finalImagePath;
                }
                
                try {
                    const scene = this.game.scene.scenes[0];
                    scene.load.image(imageKey, finalImagePath);
                    
                    // 이미지 로드 완료 후 텍스처 필터 설정 (고품질 렌더링)
                    scene.load.once(`filecomplete-image-${imageKey}`, () => {
                        try {
                            const texture = scene.textures.get(imageKey);
                            if (texture && texture.setFilter) {
                                // LINEAR 필터 모드로 설정 (부드러운 스케일링)
                                texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
                            }
                        } catch (e) {
                            // 필터 설정 실패는 무시
                        }
                    });
                } catch (e) {
                    // 이미지 로드 실패 시 무시 (색상만 사용)
                }
            }
        });
    }

    /**
     * 게임 생성
     */
    create() {
        this.scene = this.game.scene.scenes[0];
        this.gameStartTime = Date.now();
        
        // 모든 버블 이미지 텍스처에 고품질 필터 설정 (이미지 품질 개선)
        this.bubbleTypes.forEach((bubbleType, index) => {
            const imageKey = `bubble_${index}`;
            if (this.scene.textures.exists(imageKey)) {
                try {
                    const texture = this.scene.textures.get(imageKey);
                    if (texture && texture.setFilter) {
                        texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
                    }
                } catch (e) {
                    // 필터 설정 실패는 무시
                }
            }
        });
        
        // 이전 게임의 버블이 남아있을 수 있으므로 먼저 초기화
        this.clearAllBubbles();
        
        this.createUI();
        this.createGrid();
        this.createShooter();
        this.createBubbles();
        
        this.isPaused = true;
        this.showGameStartModal();
    }

    /**
     * UI 생성
     */
    createUI() {
        const baseWidth = 600;
        const baseHeight = 700;
        const scaleX = this.canvasWidth / baseWidth;
        const scaleY = this.canvasHeight / baseHeight;
        const scale = Math.min(scaleX, scaleY, 1.0);
        
        const panelPadding = 10;
        const panelWidth = Math.max(this.canvasWidth - panelPadding * 2, 280 * scale);
        const panelHeight = Math.max(60 * scale, 50);
        const panelX = panelPadding;
        const panelY = 10;
        
        const labelFontSize = Math.max(12 * scale, 10);
        const valueFontSize = Math.max(24 * scale, 18);
        
        this.uiPanelBg = this.scene.add.rectangle(panelX + panelWidth/2, panelY + panelHeight/2, panelWidth, panelHeight, 0xffffff);
        this.uiPanelBg.setAlpha(0.95);
        this.uiPanelBg.setStrokeStyle(2, 0x4CAF50, 1);
        this.uiPanelBg.setDepth(5);
        
        this.uiPanelBottom = panelY + panelHeight;
        
        // 점수 UI
        const scoreCardWidth = Math.max(120 * scale, 100);
        const scoreCardHeight = Math.max(48 * scale, 40);
        const scoreCardX = panelX + Math.max(15 * scale, 10);
        const scoreCardY = panelY + panelHeight/2;
        
        this.scoreCardBg = this.scene.add.rectangle(scoreCardX + scoreCardWidth/2, scoreCardY, scoreCardWidth, scoreCardHeight, 0x2196F3);
        this.scoreCardBg.setAlpha(0.9);
        this.scoreCardBg.setDepth(6);
        this.scoreCardBg.setStrokeStyle(2, 0x1976D2, 1);
        
        this.scoreLabel = this.scene.add.text(scoreCardX + Math.max(10 * scale, 8), scoreCardY - scoreCardHeight/3, '점수', {
            fontSize: labelFontSize + 'px',
            fill: '#ffffff',
            fontFamily: 'Arial, sans-serif',
            fontWeight: 'bold'
        });
        this.scoreLabel.setDepth(7);
        
        this.scoreText = this.scene.add.text(scoreCardX + Math.max(10 * scale, 8), scoreCardY - 5, '0', {
            fontSize: valueFontSize + 'px',
            fill: '#ffffff',
            fontFamily: 'Arial, sans-serif',
            fontWeight: 'bold'
        });
        this.scoreText.setDepth(7);
        
        // 시간 UI
        const timeCardWidth = Math.max(120 * scale, 100);
        const timeCardHeight = Math.max(48 * scale, 40);
        const timeCardX = panelX + panelWidth - timeCardWidth - Math.max(15 * scale, 10);
        const timeCardY = panelY + panelHeight/2;
        
        this.timeCardBg = this.scene.add.rectangle(timeCardX + timeCardWidth/2, timeCardY, timeCardWidth, timeCardHeight, 0xFF6B35);
        this.timeCardBg.setAlpha(0.95);
        this.timeCardBg.setDepth(6);
        this.timeCardBg.setStrokeStyle(2, 0xE55A2B, 1);
        
        this.timeLabel = this.scene.add.text(timeCardX + Math.max(10 * scale, 8), timeCardY - timeCardHeight/3, '남은 시간', {
            fontSize: labelFontSize + 'px',
            fill: '#ffffff',
            fontFamily: 'Arial, sans-serif',
            fontWeight: 'bold'
        });
        this.timeLabel.setDepth(7);
        
        this.timeText = this.scene.add.text(timeCardX + Math.max(10 * scale, 8), timeCardY - 5, '0:00', {
            fontSize: valueFontSize + 'px',
            fill: '#FFFFFF',
            fontFamily: 'Arial, sans-serif',
            fontWeight: 'bold'
        });
        this.timeText.setDepth(7);
        
        // 레벨 표시 텍스트 (게임판 중앙에 배치)
        const levelFontSize = Math.max(48 * scale, 36);
        const levelX = this.canvasWidth / 2; // 게임판 중앙
        const levelY = this.canvasHeight / 2; // 게임판 중앙
        this.levelText = this.scene.add.text(levelX, levelY, '', {
            fontSize: levelFontSize + 'px',
            fill: '#FFD700',
            fontFamily: 'Arial, sans-serif',
            fontWeight: 'bold',
            stroke: '#000',
            strokeThickness: 6,
            shadow: {
                offsetX: 3,
                offsetY: 3,
                color: '#000',
                blur: 6,
                stroke: true,
                fill: true
            }
        });
        this.levelText.setVisible(false);
        this.levelText.setOrigin(0.5);
        this.levelText.setDepth(1000); // 항상 최상위에 표시
        
        this.updateTimeDisplay();
    }

    /**
     * 육각형 그리드 생성 (어드민 설정한 캔버스 가로 사이즈에 맞게 자동 생성)
     */
    createGrid() {
        this.grid = [];
        
        // 어드민 설정한 캔버스 사이즈 확인 (Phaser 게임 생성 후 실제 캔버스 너비 사용)
        // this.game이 이미 생성된 후이므로 실제 캔버스 너비 사용
        if (this.game && this.game.canvas) {
            const actualCanvasWidth = this.game.canvas.width;
            if (actualCanvasWidth && actualCanvasWidth > 0) {
                this.canvasWidth = actualCanvasWidth;
            }
        }
        
        // 육각형 그리드에서 버블 간 간격 계산 (적절한 여백 포함)
        // 버블 간 여백을 두어 시각적으로 더 넓게 표시
        const hexWidth = this.bubbleRadius * 2.0; // 가로 간격 (원래 1.9, 적당한 간격으로 조정)
        const hexHeight = Math.sqrt(3) * this.bubbleRadius * 0.95; // 세로 간격 (원래 0.9, 적당한 간격으로 조정)
        const startY = this.uiPanelBottom + 30;
        this.gridStartY = startY; // 클래스 변수로 저장 (경계 체크용)
        
        // 캔버스 100%에 맞게 그리드 자동 생성 및 사이즈 조절
        // 좌우 여백 완전 제거: 첫 번째 셀 왼쪽 경계 = 0, 마지막 셀 오른쪽 경계 = canvasWidth
        const startX = this.bubbleRadius; // 첫 번째 셀 중심 위치
        
        // 홀수 행 오프셋 계산
        const oddRowOffset = hexWidth / 2;
        
        // 짝수 행과 홀수 행 모두를 고려하여 최대 열 수 계산
        // 홀수 행이 더 오른쪽으로 나가므로, 홀수 행을 기준으로 최대 열 수 계산
        // 짝수 행 마지막 셀 중심: startX + (cols-1) * hexWidth, 오른쪽: startX + (cols-1) * hexWidth + bubbleRadius
        // 홀수 행 마지막 셀 중심: startX + (cols-1) * hexWidth + oddRowOffset, 오른쪽: startX + (cols-1) * hexWidth + oddRowOffset + bubbleRadius
        // 첫 번째 셀 왼쪽 경계 = 0 (startX - bubbleRadius = 0이므로 startX = bubbleRadius)
        // 마지막 셀 오른쪽 경계 = canvasWidth (최대한 활용)
        let maxCols = 1;
        for (let cols = 1; cols <= 100; cols++) { // 최대 100개 열까지 시도
            // 짝수 행 마지막 셀 오른쪽
            const evenRowLastCellRight = startX + (cols - 1) * hexWidth + this.bubbleRadius;
            // 홀수 행 마지막 셀 오른쪽 (홀수 행이 더 오른쪽으로 나감)
            const oddRowLastCellRight = startX + (cols - 1) * hexWidth + oddRowOffset + this.bubbleRadius;
            
            // 홀수 행이 더 오른쪽으로 나가므로, 홀수 행 기준으로 체크
            // 홀수 행의 마지막 셀 오른쪽이 캔버스 너비를 넘지 않아야 함
            if (oddRowLastCellRight > this.canvasWidth) {
                // 홀수 행이 경계를 넘으면 더 이상 증가 불가
                break;
            }
            
            // 짝수 행도 경계를 넘지 않아야 함
            if (evenRowLastCellRight > this.canvasWidth) {
                // 짝수 행이 경계를 넘으면 더 이상 증가 불가
                break;
            }
            
            // 둘 다 경계 내에 있으면 이 컬럼 수는 유효
            maxCols = cols;
        }
        
        this.totalCols = maxCols;
        
        // 가시 영역 계산 (전체 열 사용, 중앙 5개만 표시)
        const visibleColCount = Math.min(this.totalCols, 5);
        this.visibleColStart = Math.floor((this.totalCols - visibleColCount) / 2);
        this.visibleColEnd = this.visibleColStart + visibleColCount - 1;
        
        // gridCols를 totalCols로 설정 (기존 코드 호환성)
        this.gridCols = this.totalCols;
        
        // gridStartX 저장 (col 계산용)
        this.gridStartX = startX; // 클래스 변수로 저장 (col 계산용)
        this.hexWidth = hexWidth; // 클래스 변수로 저장 (col 계산용)
        
        // 디버그: 첫 번째와 마지막 셀의 위치 확인
        const evenRowFirstCellX = startX;
        const evenRowLastCellX = startX + (this.totalCols - 1) * hexWidth;
        const oddRowFirstCellX = startX + oddRowOffset;
        const oddRowLastCellX = startX + (this.totalCols - 1) * hexWidth + oddRowOffset;
        
        // 그리드 border 그래픽 생성
        this.gridBorders = [];
        const borderGraphics = this.scene.add.graphics();
        borderGraphics.setDepth(1); // 버블보다 뒤에 렌더링
        
        for (let row = 0; row < this.gridRows; row++) {
            this.grid[row] = [];
            // 홀수 행은 오프셋 적용 (육각형 그리드)
            const offsetX = (row % 2) * (hexWidth / 2);
            
            for (let col = 0; col < this.totalCols; col++) {
                // 가로 위치: 전체 그리드를 중앙 정렬
                const x = startX + col * hexWidth + offsetX;
                // 세로 위치: 정확한 육각형 높이 사용
                const y = startY + row * hexHeight;
                
                this.grid[row][col] = {
                    x: x,
                    y: y,
                    bubble: null,
                    row: row,
                    col: col
                };
                
                // 셀 border 추가 (시각화)
                // border 색상 통일 (가시 영역 구분 없이)
                const borderColor = 0x999999; // 모든 그리드 border 색상 통일 (밝은 회색)
                // 마지막 줄은 border 투명으로
                const isLastRow = row === this.gridRows - 1;
                const borderAlpha = isLastRow ? 0 : 0.15; // 마지막 줄: 투명, 나머지: 통일된 투명도 (더 연하게)
                
                // 육각형 border 그리기
                borderGraphics.lineStyle(1, borderColor, borderAlpha);
                borderGraphics.beginPath();
                // 육각형 꼭짓점 계산
                for (let i = 0; i < 6; i++) {
                    const angle = (Math.PI / 3) * i - Math.PI / 6; // 30도 회전
                    const borderX = x + this.bubbleRadius * Math.cos(angle);
                    const borderY = y + this.bubbleRadius * Math.sin(angle);
                    if (i === 0) {
                        borderGraphics.moveTo(borderX, borderY);
                    } else {
                        borderGraphics.lineTo(borderX, borderY);
                    }
                }
                borderGraphics.closePath();
                borderGraphics.strokePath();
            }
        }
        
        this.gridBorders.push(borderGraphics);
        
        // 마지막 그리드 위에 위험선 표시
        const bottomRow = this.gridRows - 1;
        const dangerLineY = startY + bottomRow * hexHeight - hexHeight / 2; // 맨 아래줄 위
        const dangerLineGraphics = this.scene.add.graphics();
        dangerLineGraphics.lineStyle(3, 0xFF0000, 1); // 빨간색, 두께 3px
        dangerLineGraphics.setDepth(4); // 버블보다 앞, UI보다 뒤
        dangerLineGraphics.lineBetween(0, dangerLineY, this.canvasWidth, dangerLineY);
        this.dangerLine = dangerLineGraphics;
        
        // 위험선에 '위험' 텍스트 추가
        const dangerText = this.scene.add.text(this.canvasWidth / 2, dangerLineY - 15, '위험', {
            fontSize: '20px',
            fill: '#FF0000',
            fontFamily: 'Arial',
            fontStyle: 'bold',
            align: 'center'
        });
        dangerText.setOrigin(0.5, 0.5); // 중앙 정렬
        dangerText.setDepth(5); // 위험선보다 앞에 표시
        this.dangerText = dangerText;
    }

    /**
     * 발사대 생성
     */
    createShooter() {
        this.shooterX = this.canvasWidth / 2;
        this.shooterY = this.canvasHeight - 80;
        
        // 발사대 배경 (더 큰 원, 그라데이션 효과)
        this.shooterBg = this.scene.add.circle(this.shooterX, this.shooterY, 40, 0x2C3E50);
        this.shooterBg.setDepth(10);
        this.shooterBg.setStrokeStyle(3, 0x34495E, 1);
        
        // 발사대 내부 원 (장식)
        this.shooterInner = this.scene.add.circle(this.shooterX, this.shooterY, 25, 0x34495E);
        this.shooterInner.setDepth(11);
        this.shooterInner.setAlpha(0.6);
        
        // 발사대 중심 점
        this.shooterCenter = this.scene.add.circle(this.shooterX, this.shooterY, 8, 0xECF0F1);
        this.shooterCenter.setDepth(12);
        
        // 발사대 기반 (발사대 아래 지지대)
        const baseWidth = 60;
        const baseHeight = 15;
        this.shooterBase = this.scene.add.rectangle(
            this.shooterX, 
            this.shooterY + 35, 
            baseWidth, 
            baseHeight, 
            0x34495E
        );
        this.shooterBase.setDepth(9);
        this.shooterBase.setStrokeStyle(2, 0x2C3E50, 1);
        
        // 발사 방향 표시선 (더 두껍고 눈에 띄게)
        this.aimLine = this.scene.add.graphics();
        this.aimLine.setDepth(9);
        
        // 초기 조준 위치 설정 (대기 중 조준선 애니메이션용)
        this.lastPointerX = this.shooterX;
        this.lastPointerY = this.shooterY - 100; // 발사대 위쪽 방향
        this.updateAim(this.lastPointerX, this.lastPointerY);
        
        // 마우스/터치 이벤트 (모바일 지원: 터치로 조준하고 떼면 발사)
        this.scene.input.on('pointerdown', (pointer) => {
            if (this.isPaused || this.isProcessing || this.isShooting) return;
            // 조준 시작
            this.isAiming = true;
            this.lastPointerX = pointer.x;
            this.lastPointerY = pointer.y;
            this.updateAim(pointer.x, pointer.y);
        });
        
        this.scene.input.on('pointermove', (pointer) => {
            if (this.isPaused || this.isProcessing || this.isShooting) return;
            // 조준 중이면 조준 업데이트
            if (this.isAiming) {
                this.lastPointerX = pointer.x;
                this.lastPointerY = pointer.y;
                this.updateAim(pointer.x, pointer.y);
            }
        });
        
        this.scene.input.on('pointerup', (pointer) => {
            if (this.isPaused || this.isProcessing || this.isShooting) return;
            // 조준 중이었으면 발사
            if (this.isAiming) {
                this.isAiming = false;
                this.shootBubble();
            }
        });
    }

    /**
     * 모든 버블 제거 (게임 초기화/재시작 시 사용)
     */
    clearAllBubbles() {
        // 그리드의 모든 버블 제거
        const maxCols = this.totalCols || this.gridCols || 8;
        for (let row = 0; row < this.gridRows; row++) {
            for (let col = 0; col < maxCols; col++) {
                if (this.grid[row] && this.grid[row][col] && this.grid[row][col].bubble) {
                    const bubble = this.grid[row][col].bubble;
                    const emoji = bubble.getData('emoji');
                    if (emoji) {
                        emoji.destroy();
                    }
                    bubble.destroy();
                    this.grid[row][col].bubble = null;
                }
            }
        }
        
        // 발사 중인 버블 제거
        if (this.shotBubble) {
            const emoji = this.shotBubble.getData('emoji');
            if (emoji) {
                emoji.destroy();
            }
            this.shotBubble.destroy();
            this.shotBubble = null;
        }
        
        // 현재 버블 제거
        if (this.currentBubble) {
            const emoji = this.currentBubble.getData('emoji');
            if (emoji) {
                emoji.destroy();
            }
            this.currentBubble.destroy();
            this.currentBubble = null;
        }
        
        // 다음 버블 제거
        if (this.nextBubble) {
            const emoji = this.nextBubble.getData('emoji');
            if (emoji) {
                emoji.destroy();
            }
            this.nextBubble.destroy();
            this.nextBubble = null;
        }
        
        // 충돌 체크 인터벌 제거
        if (this.checkCollisionInterval) {
            this.checkCollisionInterval.remove();
            this.checkCollisionInterval = null;
        }
        
        // 상태 초기화
        this.isShooting = false;
        this.isAttaching = false;
        this.shotVelocityX = 0;
        this.shotVelocityY = 0;
        this.hitBubbleInfo = null;
    }

    /**
     * 버블 생성 (초기 그리드)
     */
    createBubbles() {
        // 상단 몇 줄에 랜덤 버블 배치 (가시 영역에만 배치하여 좌우 여백 확보)
        // initialBubbleRows는 레벨에 따라 증가
        for (let row = 0; row < this.initialBubbleRows; row++) {
            // 가시 영역(col 2-6 또는 계산된 visibleColStart ~ visibleColEnd)에만 버블 배치
            for (let col = this.visibleColStart; col <= this.visibleColEnd; col++) {
                if (this.grid[row] && this.grid[row][col]) {
                    const bubbleTypeIndex = Math.floor(Math.random() * this.bubbleTypes.length);
                    this.createBubbleAtGrid(row, col, bubbleTypeIndex);
                }
            }
        }
        
        // 현재 발사할 버블 (발사대 위)
        this.currentBubble = this.createBubbleSprite(this.shooterX, this.shooterY - 40);
        
        // 다음 버블 (발사대 옆, 보이도록)
        this.nextBubble = this.createBubbleSprite(this.shooterX + 50, this.shooterY);
        
        // 다음 버블 위치 업데이트 함수
        this.updateNextBubblePosition();
    }

    /**
     * 그리드 위치에 버블 생성
     */
    createBubbleAtGrid(row, col, bubbleTypeIndex) {
        const gridCell = this.grid[row][col];
        if (!gridCell) return null;
        
        const bubbleType = this.bubbleTypes[bubbleTypeIndex];
        let bubble = null;
        const imageKey = `bubble_${bubbleTypeIndex}`;
        
        // 이미지가 로드되어 있으면 이미지를 사용, 없으면 색상 사용
        if (this.scene.textures.exists(imageKey)) {
            const targetSize = this.bubbleRadius * 2;
            // 이미지 생성 및 즉시 크기 설정 (깜빡임 방지)
            bubble = this.scene.add.image(gridCell.x, gridCell.y, imageKey);
            bubble.setVisible(false); // 크기 설정 전에 숨김
            bubble.setOrigin(0.5, 0.5); // 중앙 정렬 먼저 설정
            
            // 이미지 부드럽게 렌더링 (고품질 스케일링)
            // 1. 텍스처 필터를 LINEAR로 설정 (선형 보간)
            if (bubble.texture) {
                bubble.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
            }
            
            // 2. 이미지 스무딩 명시적 활성화
            if (typeof bubble.setSmooth === 'function') {
                bubble.setSmooth(true);
            }
            
            // 3. 고품질 렌더링을 위한 블렌드 모드
            bubble.setBlendMode(Phaser.BlendModes.NORMAL);
            
            // setDisplaySize만 사용하여 크기 설정 (원본 크기와 무관하게 정확한 크기로 설정)
            bubble.setDisplaySize(targetSize, targetSize);
            bubble.setVisible(true); // 크기 설정 완료 후 표시
        } else {
            // 이미지가 없으면 색상 원형 사용
            bubble = this.scene.add.circle(gridCell.x, gridCell.y, this.bubbleRadius, 
                Phaser.Display.Color.HexStringToColor(bubbleType.color).color);
        }
        
        bubble.setDepth(10);
        bubble.setData('row', row);
        bubble.setData('col', col);
        bubble.setData('colorIndex', bubbleTypeIndex);
        
        // 이모지 텍스트 추가하지 않음
        bubble.setData('emoji', null);
        
        gridCell.bubble = bubble;
        return bubble;
    }

    /**
     * 버블 스프라이트 생성
     */
    createBubbleSprite(x, y) {
        const bubbleTypeIndex = Math.floor(Math.random() * this.bubbleTypes.length);
        const bubbleType = this.bubbleTypes[bubbleTypeIndex];
        let bubble = null;
        const imageKey = `bubble_${bubbleTypeIndex}`;
        
        // 이미지가 로드되어 있으면 이미지를 사용, 없으면 색상 사용
        if (this.scene.textures.exists(imageKey)) {
            const targetSize = this.bubbleRadius * 2;
            // 이미지 생성 및 즉시 크기 설정 (깜빡임 방지)
            bubble = this.scene.add.image(x, y, imageKey);
            bubble.setVisible(false); // 크기 설정 전에 숨김
            bubble.setOrigin(0.5, 0.5); // 중앙 정렬 먼저 설정
            
            // 이미지 부드럽게 렌더링 (고품질 스케일링)
            // 1. 텍스처 필터를 LINEAR로 설정 (선형 보간)
            if (bubble.texture) {
                bubble.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
            }
            
            // 2. 이미지 스무딩 명시적 활성화
            if (typeof bubble.setSmooth === 'function') {
                bubble.setSmooth(true);
            }
            
            // 3. 고품질 렌더링을 위한 블렌드 모드
            bubble.setBlendMode(Phaser.BlendModes.NORMAL);
            
            // setDisplaySize만 사용하여 크기 설정 (원본 크기와 무관하게 정확한 크기로 설정)
            bubble.setDisplaySize(targetSize, targetSize);
            bubble.setVisible(true); // 크기 설정 완료 후 표시
        } else {
            // 이미지가 없으면 색상 원형 사용
            bubble = this.scene.add.circle(x, y, this.bubbleRadius,
                Phaser.Display.Color.HexStringToColor(bubbleType.color).color);
        }
        
        bubble.setDepth(10);
        bubble.setData('colorIndex', bubbleTypeIndex);
        
        // 이모지 텍스트 추가하지 않음
        bubble.setData('emoji', null);
        
        return bubble;
    }

    /**
     * 조준 업데이트
     */
    updateAim(pointerX, pointerY) {
        const dx = pointerX - this.shooterX;
        const dy = pointerY - this.shooterY;
        this.shootingAngle = Math.atan2(dy, dx);
        
        // 각도 제한 (-175도 ~ -5도)
        // Phaser 각도: 0 = 오른쪽, Math.PI/2 = 아래, Math.PI = 왼쪽, -Math.PI/2 = 위
        // -175도 ~ -5도 범위로 발사 제한
        const maxAngle = Math.PI * (-5) / 180; // -5도
        const minAngle = Math.PI * (-175) / 180; // -175도
        this.shootingAngle = Math.max(minAngle, Math.min(maxAngle, this.shootingAngle));
        
        // 조준선 그리기
        this.aimLine.clear();
        
        // 모든 레벨에서 간략한 가이드 사용
            this.drawSimpleAimLine();
    }

    /**
     * 간략한 조준선 그리기 (움직이는 점선 효과)
     */
    drawSimpleAimLine() {
        const lineLength = 200;
        const endX = this.shooterX + Math.cos(this.shootingAngle) * lineLength;
        const endY = this.shooterY + Math.sin(this.shootingAngle) * lineLength;
        
        // 움직이는 점선 효과를 위한 시간 기반 offset
        // 아래에서 위로 발사되므로 점선도 아래에서 위로 움직이도록 함
        const currentTime = this.scene.time.now || 0;
        const dashLength = 15; // 점선의 각 선분 길이
        const gapLength = 8; // 점선의 간격
        const dashPattern = dashLength + gapLength; // 점선 패턴의 총 길이
        const speed = 0.03; // 애니메이션 속도 (픽셀/ms) - 느리게 조정
        // 아래에서 위로 움직이므로 offset을 계산 (시작점에서 위로 이동)
        const offset = (currentTime * speed) % dashPattern;
        
        // 점선 그리기
        this.aimLine.lineStyle(4, 0x3498DB, 0.8);
        
        // 아래에서 위로 움직이도록 offset 적용
        // offset이 증가하면 점선이 아래에서 위로 이동하는 효과
        let currentPos = -dashPattern + offset;
        const totalDistance = Math.sqrt(
            (endX - this.shooterX) * (endX - this.shooterX) + 
            (endY - this.shooterY) * (endY - this.shooterY)
        );
        
        while (currentPos < totalDistance) {
            const segmentStart = Math.max(0, currentPos);
            const segmentEnd = Math.min(totalDistance, currentPos + dashLength);
            
            if (segmentEnd > segmentStart) {
                // 점선 선분의 시작점과 끝점 계산
                const startRatio = segmentStart / totalDistance;
                const endRatio = segmentEnd / totalDistance;
                
                const startX = this.shooterX + (endX - this.shooterX) * startRatio;
                const startY = this.shooterY + (endY - this.shooterY) * startRatio;
                const segmentEndX = this.shooterX + (endX - this.shooterX) * endRatio;
                const segmentEndY = this.shooterY + (endY - this.shooterY) * endRatio;
                
                this.aimLine.lineBetween(startX, startY, segmentEndX, segmentEndY);
            }
            
            currentPos += dashPattern;
        }
        
        // 조준선 끝에 화살표 표시 (움직이는 효과)
        const arrowSize = 15;
        const arrowAngle = this.shootingAngle + Math.PI;
        const arrowX1 = endX + Math.cos(arrowAngle + Math.PI / 6) * arrowSize;
        const arrowY1 = endY + Math.sin(arrowAngle + Math.PI / 6) * arrowSize;
        const arrowX2 = endX + Math.cos(arrowAngle - Math.PI / 6) * arrowSize;
        const arrowY2 = endY + Math.sin(arrowAngle - Math.PI / 6) * arrowSize;
        
        this.aimLine.lineStyle(3, 0x3498DB, 0.9);
        this.aimLine.lineBetween(endX, endY, arrowX1, arrowY1);
        this.aimLine.lineBetween(endX, endY, arrowX2, arrowY2);
        
        // 조준선 끝에 원형 표시 (펄스 효과)
        const pulseAlpha = 0.4 + Math.sin(currentTime * 0.005) * 0.2;
        this.aimLine.fillStyle(0x3498DB, Math.max(0.2, Math.min(0.6, pulseAlpha)));
        this.aimLine.fillCircle(endX, endY, 8);
    }
    
    /**
     * 상세한 조준선 그리기 (레벨 1: 버블 예상 도착지점까지)
     */
    drawDetailedAimLine() {
        const speed = 1000; // 발사 속도
        const deltaTime = 0.016; // 16ms
        
        // 버블 경로 시뮬레이션
        let x = this.shooterX;
        let y = this.shooterY;
        let velX = Math.cos(this.shootingAngle) * speed;
        let velY = Math.sin(this.shootingAngle) * speed;
        
        const pathPoints = [{ x: this.shooterX, y: this.shooterY }];
        let hitPoint = null;
        
        // 최대 반복 횟수 제한 (무한 루프 방지)
        for (let i = 0; i < 1000; i++) {
            const newX = x + velX * deltaTime;
            const newY = y + velY * deltaTime;
            
            // UI 패널 영역 체크
            if (newY < this.uiPanelBottom) {
                hitPoint = { x: newX, y: this.uiPanelBottom, isTop: true };
                break;
            }
            
            // 상단 경계 체크
            if (this.gridStartY > 0) {
                const topBoundary = this.gridStartY + this.bubbleRadius;
                if (newY <= topBoundary) {
                    hitPoint = { x: newX, y: topBoundary, isTop: true };
                    break;
                }
            }
            
            // 좌우 벽 경계 체크 (경계에서 멈춤)
            if (newX <= this.bubbleRadius) {
                hitPoint = { x: this.bubbleRadius, y: newY };
                break;
            } else if (newX >= this.canvasWidth - this.bubbleRadius) {
                hitPoint = { x: this.canvasWidth - this.bubbleRadius, y: newY };
                break;
            }
            
            x = newX;
            y = newY;
            
            // 그리드 버블과의 충돌 체크 (간단한 버전)
            const collisionRadius = this.bubbleRadius * 1.5;
            for (let row = 0; row < this.gridRows; row++) {
                for (let col = 0; col < this.totalCols; col++) {
                    if (this.grid[row] && this.grid[row][col] && this.grid[row][col].bubble) {
                        const gridCell = this.grid[row][col];
                        const cellX = gridCell.x;
                        const cellY = gridCell.y;
                        const distance = Math.sqrt((x - cellX) ** 2 + (y - cellY) ** 2);
                        
                        if (distance < collisionRadius) {
                            hitPoint = { x: cellX, y: cellY, isBubble: true };
                            break;
                        }
                    }
                }
                if (hitPoint) break;
            }
            
            if (hitPoint) break;
            
            // 경로 포인트 추가 (일정 간격으로)
            if (i % 10 === 0) {
                pathPoints.push({ x, y });
            }
            
            // 화면 밖으로 나가면 중단
            if (x < -this.bubbleRadius * 2 || x > this.canvasWidth + this.bubbleRadius * 2 ||
                y < -this.bubbleRadius * 2 || y > this.canvasHeight + this.bubbleRadius * 2) {
                break;
            }
        }
        
        // 경로 그리기
        if (pathPoints.length > 1) {
            this.aimLine.lineStyle(3, 0x3498DB, 0.5);
            for (let i = 0; i < pathPoints.length - 1; i++) {
                this.aimLine.lineBetween(
                    pathPoints[i].x, 
                    pathPoints[i].y, 
                    pathPoints[i + 1].x, 
                    pathPoints[i + 1].y
                );
            }
        }
        
        // 예상 도착지점 표시
        if (hitPoint) {
            // 도착지점 원형 표시
            this.aimLine.fillStyle(0xE74C3C, 0.8);
            this.aimLine.fillCircle(hitPoint.x, hitPoint.y, 12);
            
            // 도착지점 테두리
            this.aimLine.lineStyle(2, 0xE74C3C, 1);
            this.aimLine.strokeCircle(hitPoint.x, hitPoint.y, 12);
        } else if (pathPoints.length > 0) {
            // 도착지점이 없으면 마지막 경로 포인트 표시
            const lastPoint = pathPoints[pathPoints.length - 1];
            this.aimLine.fillStyle(0x3498DB, 0.6);
            this.aimLine.fillCircle(lastPoint.x, lastPoint.y, 10);
        }
    }

    /**
     * 다음 버블 위치 업데이트
     */
    updateNextBubblePosition() {
        if (this.currentBubble) {
            // 현재 버블 위치 업데이트
            this.currentBubble.x = this.shooterX;
            this.currentBubble.y = this.shooterY - 40;
            const currentEmoji = this.currentBubble.getData('emoji');
            if (currentEmoji) {
                currentEmoji.x = this.shooterX;
                currentEmoji.y = this.shooterY - 40;
            }
        }
        
        if (this.nextBubble) {
            // 다음 버블 위치 업데이트
            this.nextBubble.x = this.shooterX + 50;
            this.nextBubble.y = this.shooterY;
            const nextEmoji = this.nextBubble.getData('emoji');
            if (nextEmoji) {
                nextEmoji.x = this.shooterX + 50;
                nextEmoji.y = this.shooterY;
            }
        }
    }

    /**
     * 버블 발사
     */
    shootBubble() {
        if (this.isShooting || !this.currentBubble) return;
        
        this.isShooting = true;
        this.shots++;
        
        const speed = 1300; // UX 개선: 버블 이동 속도 빠르게 (1000 → 1300, 30% 증가)
        this.shotVelocityX = Math.cos(this.shootingAngle) * speed;
        this.shotVelocityY = Math.sin(this.shootingAngle) * speed;
        
        this.shotBubble = this.currentBubble;
        
        // 다음 버블을 현재 버블로 이동
        if (this.nextBubble) {
            this.currentBubble = this.nextBubble;
            // 현재 버블을 발사 위치로 이동
            this.scene.tweens.add({
                targets: this.currentBubble,
                x: this.shooterX,
                y: this.shooterY - 40,
                duration: 200,
                ease: 'Power2',
                onComplete: () => {
                    this.updateNextBubblePosition();
                }
            });
            const currentEmoji = this.currentBubble.getData('emoji');
            if (currentEmoji) {
                this.scene.tweens.add({
                    targets: currentEmoji,
                    x: this.shooterX,
                    y: this.shooterY - 40,
                    duration: 200,
                    ease: 'Power2'
                });
            }
        } else {
            this.currentBubble = this.createBubbleSprite(this.shooterX, this.shooterY - 40);
        }
        
        // 새로운 다음 버블 생성
        this.nextBubble = this.createBubbleSprite(this.shooterX + 50, this.shooterY);
        
        // 물리 엔진 사용하지 않고 수동으로 이동 처리
        // 충돌 감지 및 이동 업데이트
        this.checkCollisionInterval = this.scene.time.addEvent({
            delay: 16, // 60fps
            callback: this.updateShotBubble,
            callbackScope: this,
            loop: true
        });
    }

    /**
     * 발사된 버블 업데이트 (물리 엔진 없이 수동 처리)
     */
    updateShotBubble() {
        if (!this.isShooting || !this.shotBubble || this.isAttaching) return;
        
        const deltaTime = 16 / 1000; // 16ms = 0.016초
        const shotX = this.shotBubble.x;
        const shotY = this.shotBubble.y;
        
        // 위치 업데이트
        let newX = shotX + this.shotVelocityX * deltaTime;
        let newY = shotY + this.shotVelocityY * deltaTime;
        
        // 좌우 벽 경계 체크 (반사 처리)
        if (newX <= this.bubbleRadius) {
            newX = this.bubbleRadius;
            // 좌측 벽 반사: X 속도 반전
            this.shotVelocityX = -this.shotVelocityX;
            // 위치를 벽 경계로 고정하고 다음 프레임부터 반사된 방향으로 이동
            this.shotBubble.x = newX;
            return; // 반사 후 계속 이동 (onBubbleHit 호출하지 않음)
        } else if (newX >= this.canvasWidth - this.bubbleRadius) {
            newX = this.canvasWidth - this.bubbleRadius;
            // 우측 벽 반사: X 속도 반전
            this.shotVelocityX = -this.shotVelocityX;
            // 위치를 벽 경계로 고정하고 다음 프레임부터 반사된 방향으로 이동
            this.shotBubble.x = newX;
            return; // 반사 후 계속 이동 (onBubbleHit 호출하지 않음)
        }
        
        // 화면 밖으로 나갔는지 체크
        if (newX < -this.bubbleRadius * 2 || newX > this.canvasWidth + this.bubbleRadius * 2 ||
            newY < -this.bubbleRadius * 2 || newY > this.canvasHeight + this.bubbleRadius * 2) {
            this.onBubbleHit();
            return;
        }
        
        // 버블 위치 업데이트
        this.shotBubble.x = newX;
        this.shotBubble.y = newY;
        
        // 그리드 버블과의 충돌 체크 (1행 그리드 포함, 즉시 부착)
        let collisionRadius = this.bubbleRadius * 1.5; // 기본 충돌 반경
        
        // 1행(row 0) 버블과의 충돌을 먼저 체크
        for (let col = 0; col < this.totalCols; col++) {
            if (this.grid[0] && this.grid[0][col] && this.grid[0][col].bubble) {
                const gridCell = this.grid[0][col];
                const gridBubble = gridCell.bubble;
                
                const cellX = gridCell.x;
                const cellY = gridCell.y;
                const bubbleX = gridBubble.x;
                const bubbleY = gridBubble.y;
                
                const distanceToCell = Phaser.Math.Distance.Between(newX, newY, cellX, cellY);
                const distanceToBubble = Phaser.Math.Distance.Between(newX, newY, bubbleX, bubbleY);
                const useCellPosition = distanceToCell <= distanceToBubble;
                const collisionX = useCellPosition ? cellX : bubbleX;
                const collisionY = useCellPosition ? cellY : bubbleY;
                const distance = useCellPosition ? distanceToCell : distanceToBubble;
                
                if (distance < collisionRadius) {
                    // 1행 버블과 충돌 시 즉시 부착
                    this.hitBubbleInfo = {
                        row: 0,
                        col: col,
                        x: collisionX,
                        y: collisionY,
                        cellX: cellX,
                        cellY: cellY,
                        shotX: newX,
                        shotY: newY
                    };
                    this.shotBubble.x = newX;
                    this.shotBubble.y = newY;
                    this.onBubbleHit();
                    return;
                }
            }
        }
        
        // 나머지 그리드 버블과의 충돌 체크
        for (let row = 1; row < this.gridRows; row++) {
            for (let col = 0; col < this.gridCols; col++) {
                if (this.grid[row] && this.grid[row][col] && this.grid[row][col].bubble) {
                    const gridCell = this.grid[row][col];
                    const gridBubble = gridCell.bubble;
                    
                    // 버블 이동 중일 수 있으므로 그리드 셀의 위치를 우선 사용
                    // 버블의 실제 위치와 셀 위치가 다르면 셀 위치를 기준으로 계산
                    const cellX = gridCell.x;
                    const cellY = gridCell.y;
                    const bubbleX = gridBubble.x;
                    const bubbleY = gridBubble.y;
                    
                    // 셀 위치와 버블 위치 중 더 가까운 것을 사용
                    const distanceToCell = Phaser.Math.Distance.Between(newX, newY, cellX, cellY);
                    const distanceToBubble = Phaser.Math.Distance.Between(newX, newY, bubbleX, bubbleY);
                    const useCellPosition = distanceToCell <= distanceToBubble;
                    const collisionX = useCellPosition ? cellX : bubbleX;
                    const collisionY = useCellPosition ? cellY : bubbleY;
                    const distance = useCellPosition ? distanceToCell : distanceToBubble;
                    
                    if (distance < collisionRadius) {
                        // 충돌한 버블 정보 저장 (그리드 셀 위치 우선)
                        this.hitBubbleInfo = {
                            row: row,
                            col: col,
                            x: collisionX, // 그리드 셀 위치 또는 버블 위치
                            y: collisionY,
                            cellX: cellX, // 그리드 셀 위치 (항상 저장)
                            cellY: cellY,
                            shotX: newX,
                            shotY: newY
                        };
                        // 버블 위치를 충돌 지점으로 고정
                        this.shotBubble.x = newX;
                        this.shotBubble.y = newY;
                        this.onBubbleHit();
                        return;
                    }
                }
            }
        }
        
        // UI 패널 영역 경계 체크: UI 패널 영역으로 들어가지 않도록
        // uiPanelBottom은 UI 패널의 하단 Y 좌표
        if (newY < this.uiPanelBottom) {
            newY = this.uiPanelBottom;
            // UI 패널 영역으로 들어가면 첫 번째 줄(row 0)에 직접 부착
            const nearestCell = this.findNearestGridCellForRow0(newX, newY);
            if (nearestCell) {
                this.hitBubbleInfo = {
                    row: 0,
                    col: nearestCell.col,
                    x: nearestCell.x,
                    y: nearestCell.y,
                    isTopWall: true
                };
                this.shotBubble.x = newX;
                this.shotBubble.y = newY;
                this.onBubbleHit();
                return;
            }
        }
        
        // 상단 경계 체크: 첫번째 줄(row 0)의 위치를 넘어가지 않도록
        // gridStartY는 그리드의 첫 번째 행(row 0)의 Y 위치
        if (this.gridStartY > 0) {
            const topBoundary = this.gridStartY + this.bubbleRadius; // 첫번째 줄의 버블 반지름까지 허용
            if (newY <= topBoundary) {
                newY = topBoundary;
                // 상단 경계 충돌 시 첫 번째 줄(row 0)에 직접 부착
                const nearestCell = this.findNearestGridCellForRow0(newX, newY);
                if (nearestCell) {
                    this.hitBubbleInfo = {
                        row: 0,
                        col: nearestCell.col,
                        x: nearestCell.x,
                        y: nearestCell.y,
                        isTopWall: true
                    };
                    this.shotBubble.x = newX;
                    this.shotBubble.y = newY;
                    this.onBubbleHit();
                    return;
                }
            }
        }
        
        // 속도가 너무 느려지면 부착
        const speed = Math.sqrt(this.shotVelocityX * this.shotVelocityX + this.shotVelocityY * this.shotVelocityY);
        if (speed < 100) {
            // 속도가 느려졌을 때는 충돌 정보 없이 처리
            this.hitBubbleInfo = null;
            this.onBubbleHit();
            return;
        }
    }

    /**
     * 버블 충돌 처리
     */
    onBubbleHit() {
        if (!this.shotBubble || this.isAttaching) return;
        
        this.isAttaching = true;
        
        // 충돌 체크 즉시 중지
        if (this.checkCollisionInterval) {
            this.checkCollisionInterval.remove();
            this.checkCollisionInterval = null;
        }
        
        this.isShooting = false;
        this.shotVelocityX = 0;
        this.shotVelocityY = 0;
        
        // 현재 위치 저장
        const currentX = this.shotBubble.x;
        const currentY = this.shotBubble.y;
        
        // 버블 위치 고정
        this.shotBubble.x = currentX;
        this.shotBubble.y = currentY;
        
        // 하단에 도달했는지 확인
        if (currentY > this.canvasHeight - 100) {
            this.isAttaching = false;
            this.endGame();
            return;
        }
        
        // hitBubbleInfo가 이미 설정되어 있고 isTopWall이 true이면, 직접 해당 셀에 부착
        if (this.hitBubbleInfo && this.hitBubbleInfo.isTopWall) {
            const targetRow = this.hitBubbleInfo.row;
            const targetCol = this.hitBubbleInfo.col;
            if (this.grid[targetRow] && this.grid[targetRow][targetCol] && !this.grid[targetRow][targetCol].bubble) {
                const targetCell = this.grid[targetRow][targetCol];
                this.attachBubbleToCellImmediate(targetCell);
                return;
            }
        }
        
        // 가장 가까운 그리드 셀 찾기 및 즉시 부착 (줄 추가 중에도 즉시 부착)
        const nearestCell = this.findNearestGridCell(currentX, currentY);
        if (nearestCell) {
            // 즉시 부착 (애니메이션 없이 또는 최소 애니메이션)
            this.attachBubbleToCellImmediate(nearestCell);
        } else {
            // 부착할 수 있는 셀이 없으면 발사된 버블 제거
            this.removeShotBubble();
        }
    }

    /**
     * 가장 가까운 그리드 셀 찾기
     * 충돌 위치에서 가장 가까운 빈 셀을 찾습니다.
     */
    findNearestGridCell(x, y) {
        // 충돌 위치에서 가장 가까운 빈 셀 검색
        let nearestCell = null;
        let minDistance = Infinity;
        const maxSearchDistance = this.bubbleRadius * 4;
        
        for (let row = 0; row < this.gridRows; row++) {
            for (let col = 0; col < this.totalCols; col++) {
                if (this.grid[row] && this.grid[row][col] && !this.grid[row][col].bubble) {
                    const cell = this.grid[row][col];
                    const distance = Phaser.Math.Distance.Between(x, y, cell.x, cell.y);
                    if (distance < minDistance && distance < maxSearchDistance) {
                        minDistance = distance;
                        nearestCell = cell;
                    }
                }
            }
        }
        
        this.hitBubbleInfo = null;
        return nearestCell;
    }

    /**
     * 첫 번째 줄(row 0)에서 가장 가까운 빈 셀 찾기
     * UI 패널 경계나 상단 경계에서 첫 번째 줄에 부착할 때 사용
     */
    findNearestGridCellForRow0(x, y) {
        if (!this.grid[0]) return null;
        
        let nearestCell = null;
        let minDistance = Infinity;
        const maxSearchDistance = this.bubbleRadius * 4;
        
        // row 0의 빈 셀만 검색
        for (let col = 0; col < this.totalCols; col++) {
            if (this.grid[0][col] && !this.grid[0][col].bubble) {
                const cell = this.grid[0][col];
                const distance = Phaser.Math.Distance.Between(x, y, cell.x, cell.y);
                if (distance < minDistance && distance < maxSearchDistance) {
                    minDistance = distance;
                    nearestCell = cell;
                }
            }
        }
        
        return nearestCell;
    }

    /**
     * 버블을 그리드에 즉시 부착 (충돌 시 즉시 부착)
     */
    attachBubbleToCellImmediate(cell) {
        if (!cell || !this.shotBubble) {
            this.isAttaching = false;
            return;
        }
        
        // 셀에 이미 버블이 있으면 부착 실패
        if (cell.bubble) {
            this.isAttaching = false;
            this.removeShotBubble();
            return;
        }
        
        // 즉시 위치로 이동 (애니메이션 최소화)
        this.shotBubble.x = cell.x;
        this.shotBubble.y = cell.y;
        
        // 그리드에 부착
        cell.bubble = this.shotBubble;
        this.shotBubble.setData('row', cell.row);
        this.shotBubble.setData('col', cell.col);
        
        this.isAttaching = false;
        
        // 매칭 확인 (매칭으로 제거될 수 있으므로 먼저 확인)
        this.checkMatches(cell.row, cell.col);
    }

    /**
     * 버블을 그리드에 부착 (애니메이션 포함)
     */
    attachBubbleToCell(cell) {
        if (!cell || !this.shotBubble) {
            this.isAttaching = false;
            return;
        }
        
        // 셀에 이미 버블이 있으면 부착 실패
        if (cell.bubble) {
            this.isAttaching = false;
            this.removeShotBubble();
            return;
        }
        
        // 버블을 셀 위치로 이동 (애니메이션)
        this.scene.tweens.add({
            targets: this.shotBubble,
            x: cell.x,
            y: cell.y,
            duration: 100, // UX 개선: 버블 부착 속도 빠르게 (150ms → 100ms)
            ease: 'Power2',
            onComplete: () => {
                // 정확한 위치로 고정
                this.shotBubble.x = cell.x;
                this.shotBubble.y = cell.y;
                
                // 그리드에 부착
                cell.bubble = this.shotBubble;
                this.shotBubble.setData('row', cell.row);
                this.shotBubble.setData('col', cell.col);
                
                // 이모지 위치도 업데이트
                const emoji = this.shotBubble.getData('emoji');
                if (emoji) {
                    emoji.x = cell.x;
                    emoji.y = cell.y;
                }
                
                this.isAttaching = false;
                
                // 매칭 확인 (매칭으로 제거될 수 있으므로 먼저 확인)
                this.checkMatches(cell.row, cell.col);
            }
        });
        
        // 이모지도 함께 이동
        const emoji = this.shotBubble.getData('emoji');
        if (emoji) {
            this.scene.tweens.add({
                targets: emoji,
                x: cell.x,
                y: cell.y,
                duration: 100, // UX 개선: 버블 부착 속도 빠르게 (150ms → 100ms)
                ease: 'Power2'
            });
        }
    }

    /**
     * 발사된 버블 제거 (부착 불가능한 경우)
     */
    removeShotBubble() {
        if (this.shotBubble) {
            // 이모지 제거
            const emoji = this.shotBubble.getData('emoji');
            if (emoji) {
                emoji.destroy();
            }
            
            // 버블 제거
            this.shotBubble.destroy();
            this.shotBubble = null;
        }
        
        // 상태 초기화
        this.isAttaching = false;
        this.isShooting = false;
        this.shotVelocityX = 0;
        this.shotVelocityY = 0;
        this.hitBubbleInfo = null;
        
        // 충돌 체크 중지
        if (this.checkCollisionInterval) {
            this.checkCollisionInterval.remove();
            this.checkCollisionInterval = null;
        }
        
        // 다음 버블 준비 (이미 currentBubble과 nextBubble이 있으므로 그대로 사용)
    }

    /**
     * 버블을 그리드에 부착 (벽 충돌 시) - 사용 안 함, onBubbleHit에서 처리
     */
    attachBubbleToGrid() {
        // 이 함수는 더 이상 사용하지 않음
        // onBubbleHit에서 직접 처리
    }

    /**
     * 매칭 확인
     */
    checkMatches(row, col) {
        const colorIndex = this.shotBubble.getData('colorIndex');
        const matches = this.findConnectedBubbles(row, col, colorIndex);
        
        if (matches.length >= 3) {
            this.removeMatches(matches);
        } else {
            this.checkFloatingBubbles();
            this.isProcessing = false;
            
            // 매칭 확인 후 맨 아래줄에 버블이 있는지 체크 (매칭으로 제거되지 않은 경우)
            this.checkBottomRowGameOver();
        }
    }

    /**
     * 연결된 버블 찾기
     */
    findConnectedBubbles(row, col, colorIndex, visited = new Set()) {
        const key = `${row},${col}`;
        if (visited.has(key)) return [];
        if (!this.grid[row] || !this.grid[row][col] || !this.grid[row][col].bubble) return [];
        if (this.grid[row][col].bubble.getData('colorIndex') !== colorIndex) return [];
        
        visited.add(key);
        const matches = [{ row, col }];
        
        // 육각형 인접 셀 (6방향)
        const neighbors = [
            { row: row - 1, col: col },     // 위
            { row: row - 1, col: col + (row % 2 === 0 ? -1 : 1) }, // 위 대각선
            { row: row, col: col - 1 },     // 왼쪽
            { row: row, col: col + 1 },     // 오른쪽
            { row: row + 1, col: col },     // 아래
            { row: row + 1, col: col + (row % 2 === 0 ? -1 : 1) }  // 아래 대각선
        ];
        
        for (const neighbor of neighbors) {
            const maxCols = this.totalCols || this.gridCols || 8;
            if (neighbor.row >= 0 && neighbor.row < this.gridRows &&
                neighbor.col >= 0 && neighbor.col < maxCols) {
                const subMatches = this.findConnectedBubbles(neighbor.row, neighbor.col, colorIndex, visited);
                matches.push(...subMatches);
            }
        }
        
        return matches;
    }

    /**
     * 매칭된 버블 제거 (아래로 떨어뜨리기)
     */
    removeMatches(matches) {
        this.isProcessing = true;
        
        const matchPoints = matches.length * this.matchPoints;
        this.score += matchPoints;
        this.scoreText.setText(this.score.toLocaleString());
        
        // 제거된 버블 개수 증가
        this.removedBubbleCount += matches.length; // 전체 통계
        this.levelRemovedCount += matches.length; // 현재 레벨 카운트
        
        // 버블을 아래로 떨어뜨리기 (사라지지 않고 떨어짐)
        matches.forEach((match, index) => {
            const cell = this.grid[match.row][match.col];
            if (cell && cell.bubble) {
                const bubble = cell.bubble;
                const emoji = bubble.getData('emoji');
                const startX = bubble.x;
                const startY = bubble.y;
                const endY = this.canvasHeight + 100; // 화면 밖으로 떨어뜨림
                
                // 그리드에서 제거
                cell.bubble = null;
                
                // 1단계: 아주 빠르게 흔들흔들(덜덜덜) 거리는 효과
                const shakeDuration = 150; // 흔들림 지속 시간 (짧게)
                const shakeAmount = 6; // 흔들림 강도
                const shakeSpeed = 20; // 흔들림 속도 (ms, 작을수록 빠름)
                
                // 흔들림 애니메이션을 위한 반복 함수
                let shakeCount = 0;
                const maxShakeCount = Math.floor(shakeDuration / shakeSpeed);
                const shakeInterval = this.scene.time.addEvent({
                    delay: shakeSpeed,
                    callback: () => {
                        if (shakeCount < maxShakeCount) {
                            // 랜덤한 방향으로 빠르게 이동
                            const offsetX = (Math.random() - 0.5) * shakeAmount * 2;
                            const offsetY = (Math.random() - 0.5) * shakeAmount * 2;
                            
                            bubble.x = startX + offsetX;
                            bubble.y = startY + offsetY;
                            
                            if (emoji) {
                                emoji.x = startX + offsetX;
                                emoji.y = startY + offsetY;
                            }
                            
                            shakeCount++;
                        } else {
                            // 흔들림 종료 후 원래 위치로 복귀
                            shakeInterval.remove();
                            bubble.x = startX;
                            bubble.y = startY;
                            if (emoji) {
                                emoji.x = startX;
                                emoji.y = startY;
                            }
                            
                            // 2단계: 흔들림 후 떨어지는 애니메이션
                            this.scene.tweens.add({
                                targets: bubble,
                                y: endY,
                                duration: 800 + (index * 50),
                                ease: 'Power2',
                                onComplete: () => {
                                    if (bubble && bubble.getData) {
                                        const emoji = bubble.getData('emoji');
                                        if (emoji) {
                                            emoji.destroy();
                                        }
                                    }
                                    if (bubble) {
                                        bubble.destroy();
                                    }
                                }
                            });
                            
                            // 이모지도 함께 떨어뜨리기
                            if (emoji) {
                                this.scene.tweens.add({
                                    targets: emoji,
                                    y: endY,
                                    duration: 800 + (index * 50),
                                    ease: 'Power2'
                                });
                            }
                        }
                    },
                    loop: true
                });
            }
        });
        
        // 고립 버블 제거 (중력 효과 제거 - 타이머 기반으로 새 줄 추가)
        this.scene.time.delayedCall(300, () => {
            this.checkFloatingBubbles();
            this.isProcessing = false;
            
            // 매칭 제거 후 맨 아래줄에 버블이 있는지 체크
            this.checkBottomRowGameOver();
            
            // 레벨업 체크 (각 레벨마다 독립적으로 카운트)
            // 레벨 1: 10개 제거 → 레벨 2
            // 레벨 2: 20개 제거 → 레벨 3
            // 레벨 N: N*10개 제거 → 레벨 N+1
            const requiredBubbles = this.currentLevel * 10;
            if (this.levelRemovedCount >= requiredBubbles) {
                this.levelUp();
            }
        });
    }
    
    /**
     * 맨 아래줄에 버블이 있는지 확인하고 게임 종료
     */
    checkBottomRowGameOver() {
        const bottomRow = this.gridRows - 1;
        for (let col = 0; col < this.totalCols; col++) {
            if (this.grid[bottomRow] && this.grid[bottomRow][col] && this.grid[bottomRow][col].bubble) {
                this.scene.time.delayedCall(300, () => {
                    this.endGame();
                });
                return;
            }
        }
    }

    /**
     * 그리드에 남아있는 버블 개수 세기
     */
    getRemainingBubbleCount() {
        let count = 0;
        const maxCols = this.totalCols || this.gridCols || 8;
        for (let row = 0; row < this.gridRows; row++) {
            for (let col = 0; col < maxCols; col++) {
                if (this.grid[row] && this.grid[row][col] && this.grid[row][col].bubble) {
                    count++;
                }
            }
        }
        return count;
    }
    
    /**
     * 레벨업 처리
     * 레벨이 올라가도 시간은 추가되지 않음 (같은 게임으로 진행)
     */
    levelUp() {
        // 게임이 일시정지되어 있거나 처리 중이면 스킵
        if (this.isPaused || this.isProcessing || this.isShooting) {
            return;
        }
        
        // 레벨 증가
        this.currentLevel++;
        
        // 초기 버블 줄 수 증가 (한 줄 추가)
        this.initialBubbleRows++;
        
        // 현재 레벨에서 제거한 버블 개수 리셋 (각 레벨마다 독립적으로 카운트)
        this.levelRemovedCount = 0;
        
        // 전체 제거된 버블 개수는 유지 (통계용)
        
        // 시간은 추가하지 않음 (레벨이 올라가도 진행중인 게임은 같은 게임임)
        
        // 모든 버블 제거
        this.clearAllBubbles();
        
        // 새로운 버블 배치 (한 줄 더 추가됨)
        this.createBubbles();
        
        // 발사대 버블 재생성
        if (this.currentBubble) {
            this.currentBubble.destroy();
            const emoji = this.currentBubble.getData('emoji');
            if (emoji) emoji.destroy();
        }
        if (this.nextBubble) {
            this.nextBubble.destroy();
            const emoji = this.nextBubble.getData('emoji');
            if (emoji) emoji.destroy();
        }
        
        this.currentBubble = this.createBubbleSprite(this.shooterX, this.shooterY - 40);
        this.nextBubble = this.createBubbleSprite(this.shooterX + 50, this.shooterY);
        this.updateNextBubblePosition();
        
        // 레벨업 메시지 표시 (match3 게임의 콤보 문구처럼)
        this.showLevelUp();
    }
    
    /**
     * 레벨업 표시 (match3 게임의 콤보 문구처럼)
     */
    showLevelUp() {
        if (!this.levelText) return;
        
        // 기존 애니메이션 중지
        this.scene.tweens.killTweensOf(this.levelText);
        
        // 레벨에 따라 색상 변경
        let levelColor = '#FFD700'; // 기본 골드
        if (this.currentLevel >= 10) {
            levelColor = '#FF6B6B'; // 빨강 (높은 레벨)
        } else if (this.currentLevel >= 5) {
            levelColor = '#FFA500'; // 주황
        }
        
        this.levelText.setFill(levelColor);
        this.levelText.setText(`레벨 ${this.currentLevel}!`);
        this.levelText.setVisible(true);
        this.levelText.setScale(0);
        this.levelText.setAlpha(1);
        this.levelText.setDepth(1000); // 항상 최상위에 표시
        
        // 부드러운 애니메이션 (위로 이동하며 페이드 아웃)
        const originalY = this.levelText.y;
        this.scene.tweens.add({
            targets: this.levelText,
            scale: 1.2,
            y: originalY - 50,
            alpha: 0,
            duration: 1000,
            ease: 'Power2',
            onComplete: () => {
                this.levelText.setVisible(false);
                // 원래 위치로 복귀
                this.levelText.setScale(1);
                this.levelText.setAlpha(1);
                this.levelText.y = originalY;
            }
        });
    }
    
    /**
     * 게임 종료 체크 (발사대 쪽으로 너무 가까워졌는지 확인)
     */
    checkGameOver() {
        // 발사대 위치 확인
        const shooterY = this.shooterY || (this.canvasHeight - 80);
        const dangerZone = shooterY - 100; // 발사대에서 100px 이내
        
        // 모든 버블을 확인하여 발사대 쪽으로 너무 가까워졌는지 체크
        for (let row = 0; row < this.gridRows; row++) {
            for (let col = 0; col < this.totalCols; col++) {
                if (this.grid[row] && this.grid[row][col] && this.grid[row][col].bubble) {
                    const bubble = this.grid[row][col].bubble;
                    if (bubble.y >= dangerZone) {
                        // 발사대 쪽으로 너무 가까워졌으면 게임 종료
                        this.endGame();
                        return;
                    }
                }
            }
        }
    }
    
    /**
     * 중력 효과 적용 (사용 안 함 - 타이머 기반 새 줄 추가로 대체)
     * @deprecated 타이머 기반 새 줄 추가로 대체됨
     */
    applyGravity() {
        // 각 열(column)별로 처리
        for (let col = 0; col < this.gridCols; col++) {
            // 해당 열의 버블들을 아래에서 위로 수집
            const columnBubbles = [];
            for (let row = this.gridRows - 1; row >= 0; row--) {
                if (this.grid[row] && this.grid[row][col] && this.grid[row][col].bubble) {
                    columnBubbles.push({
                        bubble: this.grid[row][col].bubble,
                        originalRow: row,
                        originalCol: col
                    });
                    // 그리드에서 임시로 제거 (재배치를 위해)
                    this.grid[row][col].bubble = null;
                }
            }
            
            // 아래에서부터 버블들을 재배치
            // 한 줄씩만 떨어지도록: 각 버블은 최대 1줄만 아래로 이동 (마지막 줄에서 +1줄만 추가)
            for (let i = 0; i < columnBubbles.length; i++) {
                const bubbleData = columnBubbles[i];
                const bubble = bubbleData.bubble;
                const originalRow = bubbleData.originalRow;
                
                // 원래 위치에서 1줄만 아래로 이동 (또는 그대로 유지)
                // 아래에서부터 채우되, 원래 위치보다 1줄 이상 아래로는 이동하지 않음
                const targetRow = Math.min(this.gridRows - 1 - i, originalRow + 1);
                
                if (targetRow >= 0 && this.grid[targetRow] && this.grid[targetRow][col]) {
                    const targetCell = this.grid[targetRow][col];
                    
                    // 원래 위치와 다른 경우에만 이동 애니메이션
                    if (targetRow !== originalRow) {
                        // 1줄씩 떨어지는 효과
                        this.scene.tweens.add({
                            targets: bubble,
                            x: targetCell.x,
                            y: targetCell.y,
                            duration: 300,
                            delay: i * 30, // 한 줄씩 지연
                            ease: 'Power2',
                            onComplete: () => {
                                if (!bubble || !targetCell) return;
                                
                                // 정확한 위치로 고정 (그리드 셀 위치)
                                bubble.x = targetCell.x;
                                bubble.y = targetCell.y;
                                
                                // 이모지 위치도 업데이트
                                if (bubble.getData) {
                                    const emoji = bubble.getData('emoji');
                                    if (emoji) {
                                        emoji.x = targetCell.x;
                                        emoji.y = targetCell.y;
                                    }
                                }
                            }
                        });
                    } else {
                        // 같은 위치면 정확한 위치로 고정하고 이모지만 업데이트
                        if (bubble && targetCell) {
                            bubble.x = targetCell.x;
                            bubble.y = targetCell.y;
                            if (bubble.getData) {
                                const emoji = bubble.getData('emoji');
                                if (emoji) {
                                    emoji.x = targetCell.x;
                                    emoji.y = targetCell.y;
                                }
                            }
                        }
                    }
                    
                    targetCell.bubble = bubble;
                    bubble.setData('row', targetRow);
                    bubble.setData('col', col);
                }
            }
        }
    }

    /**
     * 고립된 버블 확인 및 제거
     */
    checkFloatingBubbles() {
        const connected = new Set();
        const queue = [];
        // totalCols를 우선적으로 사용 (전체 그리드 열 수)
        const maxCols = this.totalCols || this.gridCols || 8;
        
        // 상단 행(row 0)의 모든 버블을 시작점으로 사용
        // 각 버블에서 BFS를 수행하여 연결된 모든 버블 찾기
        const row0Bubbles = [];
        for (let col = 0; col < maxCols; col++) {
            if (this.grid[0] && this.grid[0][col] && this.grid[0][col].bubble) {
                row0Bubbles.push({ row: 0, col });
            }
        }
        
        // 상단 행에 버블이 없으면, 가장 위쪽 행의 버블을 찾아서 시작점으로 사용
        if (row0Bubbles.length === 0) {
            for (let row = 0; row < this.gridRows; row++) {
                let found = false;
                for (let col = 0; col < maxCols; col++) {
                    if (this.grid[row] && this.grid[row][col] && this.grid[row][col].bubble) {
                        row0Bubbles.push({ row, col });
                        found = true;
                        break;
                    }
                }
                if (found) break;
            }
        }
        
        // 시작점이 없으면 모든 버블이 연결된 것으로 간주 (제거하지 않음)
        if (row0Bubbles.length === 0) {
            return;
        }
        
        // row 0의 모든 버블에서 BFS 수행 (각 버블이 연결된 모든 버블 찾기)
        // row 0의 버블들이 서로 연결되어 있지 않아도 모두 시작점으로 사용
        for (const startBubble of row0Bubbles) {
            const startKey = `${startBubble.row},${startBubble.col}`;
            // 이미 연결된 것으로 확인된 버블은 건너뛰기
            if (connected.has(startKey)) continue;
            
            // 각 시작점에서 BFS 수행
            const localQueue = [startBubble];
            const localConnected = new Set();
            
            while (localQueue.length > 0) {
                const current = localQueue.shift();
                const key = `${current.row},${current.col}`;
                if (localConnected.has(key)) continue;
                
                // 현재 셀에 버블이 있는지 확인
                if (!this.grid[current.row] || !this.grid[current.row][current.col] || !this.grid[current.row][current.col].bubble) {
                    continue;
                }
                
                localConnected.add(key);
                
                const neighbors = this.getNeighbors(current.row, current.col);
                for (const neighbor of neighbors) {
                    const neighborKey = `${neighbor.row},${neighbor.col}`;
                    if (!localConnected.has(neighborKey) && 
                        this.grid[neighbor.row] && 
                        this.grid[neighbor.row][neighbor.col] &&
                        this.grid[neighbor.row][neighbor.col].bubble) {
                        localQueue.push(neighbor);
                    }
                }
            }
            
            // 로컬 연결된 버블들을 전체 connected에 추가
            for (const key of localConnected) {
                connected.add(key);
            }
        }
        
        // 연결되지 않은 버블을 아래로 떨어뜨리기
        const floatingBubbles = [];
        for (let row = 0; row < this.gridRows; row++) {
            for (let col = 0; col < maxCols; col++) {
                if (this.grid[row] && this.grid[row][col] && this.grid[row][col].bubble) {
                    const key = `${row},${col}`;
                    if (!connected.has(key)) {
                        floatingBubbles.push({ row, col });
                    }
                }
            }
        }
        
        if (floatingBubbles.length > 0) {
            // 점수 계산 및 추가 (떨어뜨리기 전에 점수 추가)
            const floatingPoints = floatingBubbles.length * this.matchPoints;
            this.score += floatingPoints;
            this.scoreText.setText(this.score.toLocaleString());
            
            // 연결되지 않은 버블들을 아래로 떨어뜨리기
            floatingBubbles.forEach((bubbleData, index) => {
                const cell = this.grid[bubbleData.row][bubbleData.col];
                if (cell && cell.bubble) {
                    const bubble = cell.bubble;
                    const startY = bubble.y;
                    const endY = this.canvasHeight + 100; // 화면 밖으로 떨어뜨림
                    
                    // 그리드에서 제거
                    cell.bubble = null;
                    
                    // 떨어지는 애니메이션
                    this.scene.tweens.add({
                        targets: bubble,
                        y: endY,
                        duration: 1000 + (index * 50), // 각 버블마다 약간씩 지연
                        delay: index * 30,
                        ease: 'Power2',
                        onComplete: () => {
                            if (bubble && bubble.getData) {
                                const emoji = bubble.getData('emoji');
                                if (emoji) {
                                    emoji.destroy();
                                }
                            }
                            if (bubble) {
                                bubble.destroy();
                            }
                        }
                    });
                    
                    // 이모지도 함께 떨어뜨리기
                    if (bubble.getData) {
                        const emoji = bubble.getData('emoji');
                        if (emoji) {
                            this.scene.tweens.add({
                                targets: emoji,
                                y: endY,
                                duration: 1000 + (index * 50),
                                delay: index * 30,
                                ease: 'Power2'
                            });
                        }
                    }
                }
            });
        }
    }

    /**
     * 인접 셀 가져오기
     */
    getNeighbors(row, col) {
        const neighbors = [];
        const offset = row % 2 === 0 ? -1 : 1;
        
        const directions = [
            { row: row - 1, col: col },
            { row: row - 1, col: col + offset },
            { row: row, col: col - 1 },
            { row: row, col: col + 1 },
            { row: row + 1, col: col },
            { row: row + 1, col: col + offset }
        ];
        
        // totalCols 기준으로 범위 체크 (전체 그리드 범위)
        const maxCols = this.totalCols || this.gridCols || 8;
        
        for (const dir of directions) {
            if (dir.row >= 0 && dir.row < this.gridRows &&
                dir.col >= 0 && dir.col < maxCols) {
                neighbors.push(dir);
            }
        }
        
        return neighbors;
    }

    /**
     * 시간 표시 업데이트
     */
    updateTimeDisplay() {
        const minutes = Math.floor(this.timeRemaining / 60);
        const seconds = this.timeRemaining % 60;
        this.timeText.setText(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    }

    /**
     * 타이머 시작
     */
    startTimer() {
        if (this.timer) {
            this.timer.remove();
        }
        
        this.timer = this.scene.time.addEvent({
            delay: 1000,
            callback: () => {
                if (!this.isPaused && !this.isProcessing) {
                    this.timeRemaining--;
                    this.updateTimeDisplay();
                    
                    if (this.timeRemaining <= 0) {
                        this.endGame();
                    }
                }
            },
            loop: true
        });
        
    }

    /**
     * 게임 시작 모달 표시
     */
    showGameStartModal() {
        const modal = document.createElement('div');
        modal.className = 'game-start-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h2>게임 준비 완료!</h2>
                <p class="game-description">버블을 쏘아 올려 같은 색깔 3개 이상을 매치하세요!</p>
                <div class="modal-buttons">
                    <button class="btn-start" onclick="window.gameLoader.gameInstance.startGame()">게임 시작</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        this.gameStartModal = modal;
    }

    /**
     * 게임 시작 (모달에서 호출)
     */
    startGame() {
        if (this.gameStartModal) {
            this.gameStartModal.remove();
            this.gameStartModal = null;
        }
        
        this.isPaused = false;
        this.startTimer();
    }

    /**
     * 게임 종료
     */
    endGame() {
        this.isPaused = true;
        if (this.timer) {
            this.timer.remove();
        }
        
        this.saveScore();
        this.showGameEndModal();
    }

    /**
     * 게임 종료 모달 표시
     */
    showGameEndModal() {
        const modal = document.createElement('div');
        modal.className = 'game-end-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h2>게임 종료!</h2>
                <p class="final-score">최종 점수: ${this.score.toLocaleString()}</p>
                <div class="modal-buttons">
                    <button class="btn-restart" onclick="window.gameLoader.gameInstance.restartGame()">다시 하기</button>
                    <button class="btn-exit" onclick="window.gameLoader.gameInstance.exitGame()">나가기</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        this.gameEndModal = modal;
    }

    /**
     * 게임 재시작
     */
    restartGame() {
        if (this.gameEndModal) {
            this.gameEndModal.remove();
            this.gameEndModal = null;
        }
        
        if (this.gameStartModal) {
            this.gameStartModal.remove();
            this.gameStartModal = null;
        }
        
        if (this.timer) {
            this.timer.remove();
        }
        
        this.score = 0;
        this.shots = 0;
        this.currentLevel = 1;
        this.initialBubbleRows = 3;
        this.removedBubbleCount = 0; // 전체 제거된 버블 개수 리셋
        this.levelRemovedCount = 0; // 현재 레벨에서 제거한 버블 개수 리셋
        this.levelRemovedCount = 0; // 현재 레벨에서 제거한 버블 개수 리셋
        this.gameStartTime = Date.now();
        
        if (this.config.game_config_json) {
            try {
                let gameConfig = this.config.game_config_json;
                if (typeof gameConfig === 'string') {
                    if (gameConfig.includes('&quot;')) {
                        const textarea = document.createElement('textarea');
                        textarea.innerHTML = gameConfig;
                        gameConfig = JSON.parse(textarea.value);
                    } else {
                        gameConfig = JSON.parse(gameConfig);
                    }
                }
                this.timeRemaining = (gameConfig && gameConfig.time_limit) ? parseInt(gameConfig.time_limit) : 120;
                this.initialTimeLimit = this.timeRemaining;
            } catch (e) {
                this.timeRemaining = 120;
                this.initialTimeLimit = 120;
            }
        } else {
            this.timeRemaining = 120;
            this.initialTimeLimit = 120;
        }
        
        this.isPaused = false;
        this.isProcessing = false;
        this.isShooting = false;
        this.isAttaching = false;
        
        // 모든 버블 초기화
        this.clearAllBubbles();
        
        this.createBubbles();
        this.updateNextBubblePosition();
        this.scoreText.setText('0');
        this.updateTimeDisplay();
        
        this.isPaused = false;
        this.startTimer();
    }

    /**
     * 게임 종료 및 나가기
     */
    exitGame() {
        if (this.gameEndModal) {
            this.gameEndModal.remove();
            this.gameEndModal = null;
        }
        window.location.href = this.config.game_list_url || './';
    }

    /**
     * 점수 저장
     */
    saveScore() {
        const elapsedTime = this.initialTimeLimit - this.timeRemaining;
        const level = this.shots === 0 ? 1 : Math.floor((this.shots - 1) / 20) + 1;
        
        const isLogged = this.config.is_logged !== false && this.config.is_logged !== undefined;
        if (!isLogged) {
            return;
        }

        const params = {
            game_id: this.config.game_id,
            score: this.score,
            level: level,
            moves: this.shots,
            time: elapsedTime
        };

        exec_json(
            'cj_game.procCj_gameSaveScore',
            params,
            function(ret) {
                // 점수 저장 완료
            },
            function(error) {
                // 점수 저장 오류
            }
        );
    }

    /**
     * 업데이트
     */
    update() {
        // 게임 루프
        // 충돌 체크는 checkBubbleCollision에서 처리
        
        if (this.isPaused || this.isProcessing) return;
        
        // 조준 중일 때 가이드 라인 애니메이션 업데이트
        if (this.isAiming && !this.isShooting) {
            this.updateAim(this.lastPointerX, this.lastPointerY);
        }
        
        // 대기 중에도 애니메이션 동작
        if (!this.isShooting) {
            // 조준선 애니메이션 업데이트 (조준 중이거나 마지막 조준 위치가 있을 때)
            if (this.isAiming || (this.lastPointerX !== 0 && this.lastPointerY !== 0)) {
                const pointerX = this.isAiming ? this.lastPointerX : this.lastPointerX;
                const pointerY = this.isAiming ? this.lastPointerY : this.lastPointerY;
                this.updateAim(pointerX, pointerY);
            }
            
            // 발사대 버블 펄스 효과 (currentBubble에만 적용)
            if (!this.isAiming) {
                this.updateWaitingAnimation();
            }
        }
    }
    
    /**
     * 대기 중 발사대 버블 애니메이션 업데이트 (currentBubble에만 적용)
     */
    updateWaitingAnimation() {
        const currentTime = this.scene.time.now || 0;
        
        // currentBubble 펄스 효과만 적용
        if (this.currentBubble && this.currentBubble.active) {
            const pulseScale = 1.0 + Math.sin(currentTime * 0.003) * 0.05; // 부드러운 펄스
            // setDisplaySize를 사용하여 펄스 효과 적용 (setScale과 충돌 방지)
            const pulseSize = this.bubbleRadius * 2 * pulseScale;
            this.currentBubble.setDisplaySize(pulseSize, pulseSize);
        }
        
        // nextBubble은 원래 크기 유지
        if (this.nextBubble && this.nextBubble.active) {
            // setDisplaySize를 사용하여 원래 크기 유지
            this.nextBubble.setDisplaySize(this.bubbleRadius * 2, this.bubbleRadius * 2);
        }
    }

    /**
     * 게임 파괴
     */
    destroy() {
        if (this.checkCollisionInterval) {
            this.checkCollisionInterval.remove();
            this.checkCollisionInterval = null;
        }
        if (this.timer) {
            this.timer.remove();
        }
        if (this.gameEndModal) {
            this.gameEndModal.remove();
        }
        if (this.gameStartModal) {
            this.gameStartModal.remove();
        }
        if (this.game) {
            this.game.destroy(true);
            this.game = null;
        }
    }
}

// 게임 팩토리에 등록
if (!window.GameFactory) {
    window.GameFactory = {};
}
window.GameFactory.bubble_shooter = BubbleShooterGame;

