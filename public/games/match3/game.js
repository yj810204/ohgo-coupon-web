/**
 * 3-Match 게임 (Phaser3) - block.tsx 마이그레이션
 * 
 * 보안 경고: 이 코드는 보호되어 있습니다.
 * 무단 복제, 수정, 배포는 금지됩니다.
 */

// ============================================
// 보안 및 복제 방지 시스템
// ============================================
(function() {
    'use strict';
    
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
                // 경고만 표시하고 계속 실행 (선택적으로 중단 가능)
                // throw new Error('Developer tools are not allowed');
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
    // 개발 환경에서는 무결성 검증을 완화 (Next.js Turbopack과의 호환성을 위해)
    const isDevelopment = window.location.hostname === 'localhost' || 
                          window.location.hostname === '127.0.0.1' ||
                          window.location.hostname.includes('vercel.app') ||
                          window.location.hostname.includes('localhost:');
    
    const codeFingerprint = Date.now().toString(36);
    
    // 개발 환경이 아니거나 기존 값이 없을 때만 설정
    if (!window.__gameIntegrity || isDevelopment) {
        window.__gameIntegrity = codeFingerprint;
    }
    
    function verifyIntegrity() {
        // 개발 환경에서는 무결성 검증을 건너뜀
        if (isDevelopment) {
            return;
        }
        
        // 프로덕션 환경에서만 검증
        if (window.__gameIntegrity && window.__gameIntegrity !== codeFingerprint) {
            console.warn('Code integrity verification warning (non-fatal)');
            // 에러를 throw하지 않고 경고만 표시
        }
    }
    
    // 초기화
    try {
        // 개발자 도구 감지 (주기적 체크)
        setInterval(detectDevTools, 1000);
        
        // 이벤트 리스너 등록 (선택적)
        // document.addEventListener('contextmenu', preventContextMenu);
        // document.addEventListener('keydown', preventShortcuts);
        
        // 무결성 검증 (주기적 체크) - 개발 환경에서는 비활성화
        if (!isDevelopment) {
            setInterval(verifyIntegrity, 5000);
        }
        
    } catch (error) {
        console.error('Security initialization failed:', error);
        // 개발 환경에서는 에러를 throw하지 않음
        if (!isDevelopment) {
            throw error;
        }
    }
})();

// ============================================
// 게임 코드 시작
// ============================================
class Match3Game {
    constructor(config) {
        this.config = config;
        this.game = null;
        this.scene = null;
        this.score = 0;
        this.comboCount = 0;
        this.maxCombo = 0; // 최대 콤보 추적
        this.timeRemaining = 60;
        this.initialTimeLimit = 60; // 초기 시간 제한 저장
        this.moves = 0; // 블럭 이동(매칭) 횟수
        this.gameStartTime = null; // 게임 시작 시간
        this.isPaused = false;
        this.isProcessing = false;
        this.board = [];
        this.boardSize = 7;
        this.selectedTile = null;
        this.draggedTile = null;
        this.blockTypes = [];
        this.tileSize = 60;
        this.startX = 30; // 초기값 (create에서 재계산됨)
        this.startY = 125; // UI 패널 아래 시작 (패널 높이 70 + 여백 25)
        this.spacing = 4; // 간격 약간 줄임
        this.canvasWidth = 600; // 초기값 (start에서 설정됨)
        this.canvasHeight = 700; // 초기값
        this.hintMove = null;
        this.hintTimeout = null;
        this.hintDelay = 7000;
        this.lastActionTime = Date.now();
        this.gameEndModal = null;
        this.gameStartModal = null; // 게임 시작 모달
        this.comboResetTimer = null; // 콤보 리셋 타이머
        
        // 게임 설정 기본값
        this.matchPoints = 1; // 블럭 매치당 기본 점수
        this.comboMultipliers = {}; // 콤보 배수 설정 (예: {2: 1.5, 3: 2.0})
        this.comboResetTime = 3000; // 콤보 유효 시간 (밀리초)
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
                    // 기기별 설정은 start()에서 이미 적용되었으므로 여기서는 다른 설정만 적용
                    // board_size는 기기별 설정에서 이미 적용됨
                    if (gameConfig.time_limit) {
                        this.timeRemaining = parseInt(gameConfig.time_limit);
                        this.initialTimeLimit = parseInt(gameConfig.time_limit); // 초기 시간 제한 저장
                    }
                    if (gameConfig.block_types && Array.isArray(gameConfig.block_types)) {
                        this.blockTypes = gameConfig.block_types;
                    }
                    if (gameConfig.base_score_per_match) this.matchPoints = parseInt(gameConfig.base_score_per_match);
                    if (gameConfig.combo_multipliers && typeof gameConfig.combo_multipliers === 'object') {
                        this.comboMultipliers = gameConfig.combo_multipliers;
                    }
                    if (gameConfig.combo_timeout) this.comboResetTime = parseFloat(gameConfig.combo_timeout) * 1000; // 초를 밀리초로 변환
                }
            } catch (e) {
                console.error('게임 설정 파싱 오류:', e);
            }
        }

        // config에서 직접 block_types 확인 (Firebase Storage URL이 설정된 경우, 우선순위 높음)
        if (this.config.block_types && Array.isArray(this.config.block_types)) {
            this.blockTypes = this.config.block_types;
        }

        // 기본 블록 타입 설정
        if (!this.blockTypes || this.blockTypes.length === 0) {
            this.blockTypes = [
                { id: 0, emoji: '🍊', color: '#FF8C00', image_path: '' },
                { id: 1, emoji: '🍉', color: '#FF69B4', image_path: '' },
                { id: 2, emoji: '🍑', color: '#FFB6C1', image_path: '' },
                { id: 3, emoji: '🍇', color: '#DDA0DD', image_path: '' },
                { id: 4, emoji: '🍒', color: '#DC143C', image_path: '' },
                { id: 5, emoji: '🥝', color: '#96CEB4', image_path: '' }
            ];
        }

        // 화면 크기 감지 및 자동 리사이징 설정
        const container = document.getElementById(containerId);
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        
        // 컨테이너의 실제 크기 사용 (자동 리사이징)
        let useAutoResize = true;
        let deviceConfig = null;
        
        // 게임 설정에서 기기별 설정 가져오기
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
        
        // 관리자 설정에서 고정 크기를 사용할지 확인
        if (gameConfig && gameConfig.use_fixed_size === true) {
            useAutoResize = false;
            // 고정 크기 사용
            if (screenWidth < 768) {
                if (gameConfig.mobile) {
                    deviceConfig = gameConfig.mobile;
                } else {
                    deviceConfig = { board_size: 5, canvas_width: 400, canvas_height: 600 };
                }
            } else if (screenWidth < 1024) {
                if (gameConfig.tablet) {
                    deviceConfig = gameConfig.tablet;
                } else {
                    deviceConfig = { board_size: 6, canvas_width: 500, canvas_height: 700 };
                }
            } else {
                if (gameConfig.desktop) {
                    deviceConfig = gameConfig.desktop;
                } else if (gameConfig.board_size) {
                    deviceConfig = {
                        board_size: parseInt(gameConfig.board_size) || 7,
                        canvas_width: parseInt(gameConfig.canvas_width) || 600,
                        canvas_height: parseInt(gameConfig.canvas_height) || 700
                    };
                } else {
                    deviceConfig = { board_size: 7, canvas_width: 600, canvas_height: 700 };
                }
            }
            
            if (deviceConfig) {
                this.boardSize = parseInt(deviceConfig.board_size) || this.boardSize;
                this.canvasWidth = parseInt(deviceConfig.canvas_width) || this.canvasWidth;
                this.canvasHeight = parseInt(deviceConfig.canvas_height) || this.canvasHeight;
            }
        } else {
            // 자동 리사이징: 컨테이너의 실제 크기 사용
            if (container) {
                this.canvasWidth = container.offsetWidth || screenWidth;
                this.canvasHeight = container.offsetHeight || screenHeight;
            } else {
                this.canvasWidth = screenWidth;
                this.canvasHeight = screenHeight;
            }
            
            // match3 게임의 경우, 자동 리사이징 모드에서도 보드 크기는 설정에서 가져오기
            if (gameConfig) {
                if (screenWidth < 768) {
                    if (gameConfig.mobile && gameConfig.mobile.board_size) {
                        this.boardSize = parseInt(gameConfig.mobile.board_size) || this.boardSize;
                    }
                } else if (screenWidth < 1024) {
                    if (gameConfig.tablet && gameConfig.tablet.board_size) {
                        this.boardSize = parseInt(gameConfig.tablet.board_size) || this.boardSize;
                    }
                } else {
                    if (gameConfig.desktop && gameConfig.desktop.board_size) {
                        this.boardSize = parseInt(gameConfig.desktop.board_size) || this.boardSize;
                    }
                }
            }
        }

        // 캔버스 크기 설정
        const canvasWidth = this.canvasWidth;
        const canvasHeight = this.canvasHeight;
        
        const phaserConfig = {
            type: Phaser.AUTO,
            width: canvasWidth,
            height: canvasHeight,
            parent: containerId,
            scene: {
                preload: this.preload.bind(this),
                create: this.create.bind(this),
                update: this.update.bind(this)
            },
            backgroundColor: '#f5f5f5',
            render: {
                antialias: true,
                antialiasGL: true,
                pixelArt: false,
                roundPixels: false,
                premultipliedAlpha: true,
                preserveDrawingBuffer: false,
                failIfMajorPerformanceCaveat: false,
                powerPreference: 'high-performance',
                batchSize: 4096,
                maxTextures: 16
            },
            scale: {
                mode: useAutoResize ? Phaser.Scale.RESIZE : Phaser.Scale.NONE,
                autoCenter: Phaser.Scale.CENTER_BOTH,
                width: canvasWidth,
                height: canvasHeight,
                resizeInterval: useAutoResize ? 500 : undefined
            }
        };

        this.game = new Phaser.Game(phaserConfig);
    }

    /**
     * 리소스 로드
     */
    preload() {
        // 텍스처 매니저 설정 - 모든 텍스처에 안티앨리어싱 적용
        if (this.game.scene.scenes[0].textures) {
            const textureManager = this.game.scene.scenes[0].textures;
            // 기본 필터 모드를 LINEAR로 설정
            if (textureManager.defaultFilter) {
                textureManager.defaultFilter = Phaser.Textures.FilterMode.LINEAR;
            }
        }
        
        // 블록 이미지 로드 (있는 경우)
        this.blockTypes.forEach((blockType, index) => {
            if (blockType.image_path && blockType.image_path.trim() !== '') {
                const imageKey = `block_${index}`;
                // image_path가 이미 전체 경로를 포함하고 있으면 그대로 사용
                // 그렇지 않으면 game_path를 앞에 붙임
                let imagePath = blockType.image_path.trim();
                
                // 절대 경로나 http(s)로 시작하면 그대로 사용
                if (imagePath.startsWith('http://') || imagePath.startsWith('https://') || imagePath.startsWith('/')) {
                    // 절대 경로는 그대로 사용
                } else if (imagePath.startsWith('./')) {
                    // ./로 시작하는 상대 경로는 그대로 사용 (이미 전체 경로)
                } else if (imagePath.startsWith('games/')) {
                    // games/로 시작하는 경우 (기존 상대 경로 형식), 모듈 경로 추가
                    // game_path에서 games/match3 부분을 제거하고 모듈 경로만 사용
                    const gamePathParts = this.config.game_path.split('/');
                    const modulePath = gamePathParts.slice(0, -2).join('/'); // ./modules/cj_game
                    imagePath = modulePath + '/' + imagePath;
                } else {
                    // 상대 경로인 경우 game_path 추가
                    imagePath = this.config.game_path + '/' + imagePath;
                }
                
                try {
                    this.game.scene.scenes[0].load.image(imageKey, imagePath);
                    
                    // 이미지 로드 완료 후 안티앨리어싱 적용
                    this.game.scene.scenes[0].load.once('filecomplete-image-' + imageKey, () => {
                        const texture = this.game.scene.scenes[0].textures.get(imageKey);
                        if (texture) {
                            texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
                        }
                    });
                } catch (e) {
                    console.warn('이미지 로드 실패:', imagePath, e);
                }
            }
        });
    }

    /**
     * 게임 생성
     */
    create() {
        this.scene = this.game.scene.scenes[0];
        
        // 게임 시작 시간 기록
        this.gameStartTime = Date.now();
        
        // 캔버스 이미지 렌더링 품질 향상
        if (this.game.canvas) {
            const ctx = this.game.canvas.getContext('2d');
            if (ctx) {
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
            }
            // CSS로 최고 품질 안티앨리어싱
            this.game.canvas.style.imageRendering = 'auto';
            this.game.canvas.style.imageRendering = '-webkit-optimize-contrast';
            this.game.canvas.style.webkitFontSmoothing = 'antialiased';
            // 브라우저별 최적화
            this.game.canvas.style.setProperty('image-rendering', 'high-quality', 'important');
            this.game.canvas.style.setProperty('image-rendering', 'optimizeQuality', 'important');
        }
        
        // 게임 설정 다시 읽기 (create 시점에 확실히 적용)
        this.loadGameConfig();
        
        // UI를 먼저 생성하여 실제 패널 높이 확인
        this.createUI();
        
        // UI 패널의 실제 하단 위치 사용 (createUI에서 저장된 값)
        const uiPanelBottom = this.uiPanelBottom || 80; // createUI에서 저장된 값 또는 기본값
        
        const sidePadding = 15; // 좌우 여백 (최소 보장)
        const panelBottomPadding = 50; // UI 패널과 게임판 사이 간격 (더 넓게)
        const bottomPadding = 15; // 하단 여백
        
        const availableHeight = this.canvasHeight - uiPanelBottom - panelBottomPadding - bottomPadding;
        const availableWidth = this.canvasWidth - sidePadding * 2; // 좌우 여백 제외
        
        // 보드 크기에 맞는 최적 타일 크기 계산
        const maxTileSizeByHeight = Math.floor((availableHeight - (this.boardSize - 1) * this.spacing) / this.boardSize);
        const maxTileSizeByWidth = Math.floor((availableWidth - (this.boardSize - 1) * this.spacing) / this.boardSize);
        const calculatedTileSize = Math.min(maxTileSizeByHeight, maxTileSizeByWidth, 80); // 최대 80px로 제한
        
        // 최소 크기 보장 (너무 작아지지 않도록)
        this.tileSize = Math.max(calculatedTileSize, 30);
        
        // 게임판 너비 계산 (타일은 중앙 원점이므로 실제 너비는 타일 크기 포함)
        const boardWidth = this.boardSize * this.tileSize + (this.boardSize - 1) * this.spacing;
        
        // 게임판을 canvasWidth의 가운데에 위치시키기 위해 startX 계산
        // 타일의 원점이 중앙이므로, 첫 번째 타일의 왼쪽 가장자리는 startX - tileSize/2
        // 따라서 startX는 최소 tileSize/2 + sidePadding 이상이어야 함
        const centerX = (this.canvasWidth - boardWidth) / 2;
        const minStartX = this.tileSize / 2 + sidePadding; // 타일 반 크기 + 여백
        this.startX = Math.max(centerX, minStartX);
        
        // 게임판이 캔버스 오른쪽을 넘지 않도록 조정
        // 마지막 타일의 오른쪽 가장자리는 startX + boardWidth - tileSize/2
        // 이것이 canvasWidth - sidePadding 이하여야 함
        const maxRightEdge = this.canvasWidth - sidePadding;
        const actualRightEdge = this.startX + boardWidth - this.tileSize / 2;
        if (actualRightEdge > maxRightEdge) {
            // 오른쪽을 넘으면 왼쪽으로 이동
            const overflow = actualRightEdge - maxRightEdge;
            this.startX = Math.max(this.startX - overflow, minStartX);
        }
        
        // 게임판을 UI 패널 아래에 적절한 간격으로 배치
        this.startY = uiPanelBottom + panelBottomPadding;
        
        // 콤보 텍스트 위치 업데이트 (게임판 시작 위치 기준)
        if (this.comboText) {
            this.comboText.y = this.startY + (this.tileSize * 0.5); // 게임판 첫 번째 행 중앙
        }
        
        this.createBoard();
        this.updateTimeDisplay(); // UI 생성 후 시간 표시 업데이트
        
        // 게임 시작 전 일시정지
        this.isPaused = true;
        
        // 게임 시작 모달 표시
        this.showGameStartModal();
    }
    
    /**
     * 게임 설정 로드
     */
    loadGameConfig() {
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
                    // 기기별 설정은 start()에서 이미 적용되었으므로 여기서는 다른 설정만 적용
                    // board_size는 기기별 설정에서 이미 적용됨
                    if (gameConfig.time_limit) {
                        this.timeRemaining = parseInt(gameConfig.time_limit);
                        this.initialTimeLimit = parseInt(gameConfig.time_limit); // 초기 시간 제한 저장
                        console.log('시간 제한 설정:', this.timeRemaining);
                    }
                    if (gameConfig.block_types && Array.isArray(gameConfig.block_types)) {
                        this.blockTypes = gameConfig.block_types;
                    }
                    if (gameConfig.base_score_per_match) this.matchPoints = parseInt(gameConfig.base_score_per_match);
                    if (gameConfig.combo_multipliers && typeof gameConfig.combo_multipliers === 'object') {
                        this.comboMultipliers = gameConfig.combo_multipliers;
                    }
                    if (gameConfig.combo_timeout) this.comboResetTime = parseFloat(gameConfig.combo_timeout) * 1000; // 초를 밀리초로 변환
                }
            } catch (e) {
                console.error('게임 설정 파싱 오류:', e);
            }
        }
    }

    /**
     * 게임 상태 저장
     */
    saveGameState() {
        const boardState = [];
        for (let row = 0; row < this.boardSize; row++) {
            boardState[row] = [];
            for (let col = 0; col < this.boardSize; col++) {
                if (this.board[row] && this.board[row][col]) {
                    boardState[row][col] = {
                        colorIndex: this.board[row][col].colorIndex
                    };
                } else {
                    boardState[row][col] = null;
                }
            }
        }
        
        return {
            score: this.score,
            timeRemaining: this.timeRemaining,
            comboCount: this.comboCount,
            maxCombo: this.maxCombo,
            moves: this.moves,
            boardState: boardState,
            boardSize: this.boardSize
        };
    }

    /**
     * 보드 생성
     */
    createBoard() {
        if (!this.blockTypes || this.blockTypes.length === 0) {
            console.error('Block types not initialized!');
            return;
        }
        
        this.board = [];
        for (let row = 0; row < this.boardSize; row++) {
            this.board[row] = [];
            for (let col = 0; col < this.boardSize; col++) {
                const x = this.startX + col * (this.tileSize + this.spacing);
                const y = this.startY + row * (this.tileSize + this.spacing);
                
                let blockTypeIndex = Math.floor(Math.random() * this.blockTypes.length);
                let attempts = 0;
                while (this.wouldMatch(row, col, blockTypeIndex) && attempts < 20) {
                    blockTypeIndex = Math.floor(Math.random() * this.blockTypes.length);
                    attempts++;
                }

                const tileData = this.createTile(x, y, row, col, blockTypeIndex);
                if (tileData) {
                    this.board[row][col] = tileData;
                } else {
                    console.error('Failed to create tile at', row, col);
                    this.board[row][col] = null;
                }
            }
        }

        // 초기 매치 확인 및 처리 (빠른 확인)
        this.scene.time.delayedCall(50, () => {
            const initialMatches = this.findMatches();
            if (initialMatches.length > 0) {
                this.removeMatches(initialMatches);
            } else {
                // 초기 매치가 없으면 처리 완료
                this.isProcessing = false;
            }
        });
    }

    /**
     * 타일 생성 (이미지 또는 색상 사용)
     */
    createTile(x, y, row, col, blockTypeIndex) {
        if (blockTypeIndex < 0 || blockTypeIndex >= this.blockTypes.length) {
            blockTypeIndex = 0;
        }
        
        const blockType = this.blockTypes[blockTypeIndex];
        if (!blockType) {
            console.error('Block type not found at index:', blockTypeIndex);
            return null;
        }
        
        // 컨테이너 생성
        const container = this.scene.add.container(x, y);
        container.setDepth(10); // 기본 depth 설정
        
        let bg = null;
        let imageSprite = null;
        const imageKey = `block_${blockTypeIndex}`;
        
        // 배경은 항상 흰색으로 설정
        const bgColor = Phaser.Display.Color.HexStringToColor('#FFFFFF').color;
        bg = this.scene.add.rectangle(0, 0, this.tileSize - 2, this.tileSize - 2, bgColor);
        bg.setOrigin(0.5);
        bg.setDepth(9); // 이미지보다 뒤에 배치
        container.add(bg);
        
        // 이미지 경로가 있고 이미지가 로드되어 있으면 이미지 사용
        if (blockType.image_path && blockType.image_path.trim() !== '') {
            try {
                // 이미지가 로드되었는지 확인
                if (this.scene.textures.exists(imageKey)) {
                    imageSprite = this.scene.add.image(0, 0, imageKey);
                    imageSprite.setOrigin(0.5);
                    imageSprite.setDepth(10); // 배경보다 앞에 배치
                    
                    // 이미지 부드럽게 렌더링 (안티앨리어싱)
                    // 1. 텍스처 필터를 LINEAR로 설정 (선형 보간)
                    if (imageSprite.texture) {
                        imageSprite.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
                    }
                    
                    // 2. 이미지 스무딩 명시적 활성화
                    if (typeof imageSprite.setSmooth === 'function') {
                        imageSprite.setSmooth(true);
                    }
                    
                    // 3. 고품질 렌더링을 위한 블렌드 모드
                    imageSprite.setBlendMode(Phaser.BlendModes.NORMAL);
                    
                    // 이미지 크기를 타일 크기보다 작게 설정 (여백 추가)
                    const imageSize = this.tileSize - 8;
                    // 원본 텍스처 크기 확인
                    const texture = this.scene.textures.get(imageKey);
                    let textureWidth = imageSize;
                    let textureHeight = imageSize;
                    
                    if (texture && texture.getSourceImage) {
                        const sourceImage = texture.getSourceImage();
                        if (sourceImage) {
                            textureWidth = sourceImage.width || imageSize;
                            textureHeight = sourceImage.height || imageSize;
                        }
                    }
                    
                    // 원본 크기를 기준으로 스케일 계산
                    const baseScale = Math.min(imageSize / textureWidth, imageSize / textureHeight);
                    
                    container.add(imageSprite);
                    
                    // 이미지 줌인/줌아웃 애니메이션 (UX 개선) - 생성 시
                    // 시작 스케일을 0.9로 설정하고 baseScale로 애니메이션
                    const startScale = baseScale * 0.9;
                    imageSprite.setScale(startScale);
                    
                    // 약간의 지연 후 애니메이션 시작 (컨테이너에 추가된 후)
                    this.scene.time.delayedCall(10, () => {
                        if (imageSprite && imageSprite.active) {
                            this.scene.tweens.add({
                                targets: imageSprite,
                                scaleX: baseScale,
                                scaleY: baseScale,
                                duration: 300,
                                ease: 'Back.easeOut'
                            });
                        }
                    });
                } else {
                    // 이미지가 로드되지 않았으면 색상으로 폴백 (배경은 이미 흰색)
                    console.warn('이미지가 로드되지 않음:', imageKey, '색상으로 폴백');
                    const fallbackColor = Phaser.Display.Color.HexStringToColor(blockType.color || '#FFFFFF').color;
                    const fallbackBg = this.scene.add.rectangle(0, 0, this.tileSize - 2, this.tileSize - 2, fallbackColor);
                    fallbackBg.setOrigin(0.5);
                    fallbackBg.setDepth(10);
                    container.add(fallbackBg);
                    bg = fallbackBg; // fallback 배경을 bg로 설정
                }
            } catch (e) {
                console.warn('이미지 사용 실패:', e, '색상으로 폴백');
                const fallbackColor = Phaser.Display.Color.HexStringToColor(blockType.color || '#FFFFFF').color;
                const fallbackBg = this.scene.add.rectangle(0, 0, this.tileSize - 2, this.tileSize - 2, fallbackColor);
                fallbackBg.setOrigin(0.5);
                fallbackBg.setDepth(10);
                container.add(fallbackBg);
                bg = fallbackBg; // fallback 배경을 bg로 설정
            }
        } else {
            // 이미지 경로가 없으면 색상 사용 (배경은 이미 흰색이므로 추가 색상 레이어 사용)
            const colorLayer = Phaser.Display.Color.HexStringToColor(blockType.color || '#FFFFFF').color;
            const colorBg = this.scene.add.rectangle(0, 0, this.tileSize - 2, this.tileSize - 2, colorLayer);
            colorBg.setOrigin(0.5);
            colorBg.setDepth(10);
            container.add(colorBg);
            bg = colorBg; // 색상 배경을 bg로 설정
        }
        
        // 테두리 추가 (구분을 위해) - 더 부드러운 스타일
        const border = this.scene.add.rectangle(0, 0, this.tileSize, this.tileSize);
        border.setStrokeStyle(2, 0xE0E0E0, 0.8);
        border.setOrigin(0.5);
        border.setFillStyle(0, 0); // 투명
        border.setDepth(11);
        container.add(border);
        
        // 컨테이너를 인터랙티브하게 설정
        container.setSize(this.tileSize, this.tileSize);
        container.setInteractive({ draggable: true });
        
        // 데이터 저장
        container.setData('row', row);
        container.setData('col', col);
        container.setData('colorIndex', blockTypeIndex);
        container.setData('originalColor', blockType.color);
        container.setData('background', bg);
        container.setData('imageSprite', imageSprite);
        container.setData('border', border);
        
        // 드래그 이벤트
        this.scene.input.setDraggable(container);
        container.on('dragstart', (pointer) => {
            if (this.isPaused || this.isProcessing) return;
            this.onDragStart(container, pointer);
        });
        container.on('drag', (pointer, dragX, dragY) => {
            if (this.isPaused || this.isProcessing) return;
            this.onDrag(container, pointer, dragX, dragY);
        });
        container.on('dragend', (pointer) => {
            if (this.isPaused || this.isProcessing) return;
            this.onDragEnd(container, pointer);
        });
        
        // 클릭 이벤트
        container.on('pointerdown', () => {
            if (this.isPaused || this.isProcessing) return;
            this.onTileClick(container);
        });

        return {
            container: container,
            background: bg,
            imageSprite: imageSprite,
            border: border,
            colorIndex: blockTypeIndex
        };
    }


    /**
     * 드래그 시작
     */
    onDragStart(container, pointer) {
        this.selectedTile = container;
        this.draggedTile = container;
        this.registerPlayerAction();
        
        container.setScale(1.1);
        container.setDepth(1000); // 드래그 중인 블록을 최상위로
    }

    /**
     * 드래그 중
     */
    onDrag(container, pointer, dragX, dragY) {
        if (this.draggedTile !== container) return;
        container.x = dragX;
        container.y = dragY;
    }

    /**
     * 드래그 종료
     */
    onDragEnd(container, pointer) {
        if (this.draggedTile !== container) return;

        const startRow = container.getData('row');
        const startCol = container.getData('col');
        const originalX = this.startX + startCol * (this.tileSize + this.spacing);
        const originalY = this.startY + startRow * (this.tileSize + this.spacing);
        
        const dragDistance = Phaser.Math.Distance.Between(originalX, originalY, pointer.x, pointer.y);
        const minDragDistance = this.tileSize * 0.3;
        let targetRow = startRow;
        let targetCol = startCol;

        if (dragDistance >= minDragDistance) {
            const dx = pointer.x - originalX;
            const dy = pointer.y - originalY;

            if (Math.abs(dx) > Math.abs(dy)) {
                if (dx > 0 && startCol < this.boardSize - 1) {
                    targetCol = startCol + 1;
                } else if (dx < 0 && startCol > 0) {
                    targetCol = startCol - 1;
                }
            } else {
                if (dy > 0 && startRow < this.boardSize - 1) {
                    targetRow = startRow + 1;
                } else if (dy < 0 && startRow > 0) {
                    targetRow = startRow - 1;
                }
            }
        }

        // 원래 위치로 복귀
        this.scene.tweens.add({
            targets: container,
            x: originalX,
            y: originalY,
            scale: 1.0,
            duration: 150,
            onComplete: () => {
                container.setDepth(10); // 기본 depth로 복귀
            }
        });

        // 인접한 블록이면 교환
        const rowDiff = Math.abs(targetRow - startRow);
        const colDiff = Math.abs(targetCol - startCol);
        
        if ((rowDiff === 1 && colDiff === 0) || (rowDiff === 0 && colDiff === 1)) {
            this.swapTiles(startRow, startCol, targetRow, targetCol);
        }

        this.selectedTile = null;
        this.draggedTile = null;
    }

    /**
     * 타일 클릭 처리
     */
    onTileClick(container) {
        if (this.isPaused || this.isProcessing) return;

        const row = container.getData('row');
        const col = container.getData('col');

        if (this.selectedTile) {
            const prevRow = this.selectedTile.getData('row');
            const prevCol = this.selectedTile.getData('col');
            const isAdjacent = Math.abs(row - prevRow) + Math.abs(col - prevCol) === 1;
            const isSameTile = this.selectedTile === container;

            if (isSameTile) {
                // 같은 블록을 다시 클릭하면 선택 해제만
                this.clearSelection();
            } else if (isAdjacent) {
                // 인접한 블록이면 교환하고 선택 해제
                this.swapTiles(prevRow, prevCol, row, col);
                this.clearSelection();
            } else {
                // 인접하지 않으면 이전 선택 해제하고 새로 선택
                this.selectTile(container);
            }
        } else {
            // 선택된 블록이 없으면 선택
            this.selectTile(container);
        }
    }

    /**
     * 타일 선택
     */
    selectTile(container) {
        // 항상 이전 선택을 먼저 해제
        if (this.selectedTile && this.selectedTile !== container) {
            this.clearSelection();
        }
        
        // 새 타일 선택
        this.selectedTile = container;
        const bg = container.getData('background');
        const border = container.getData('border');
        const imageSprite = container.getData('imageSprite');
        
        // 배경 처리: 이미지가 있으면 흰색 유지, 없으면 원래 색상 사용
        if (bg) {
            if (imageSprite && imageSprite.visible) {
                // 이미지가 있는 경우 배경은 흰색 유지
                bg.setFillStyle(0xFFFFFF);
            } else {
                // 이미지가 없는 경우 원래 색상 사용
                const originalColor = container.getData('originalColor');
                if (originalColor) {
                    bg.setFillStyle(Phaser.Display.Color.HexStringToColor(originalColor).color);
                }
            }
        }
        
        if (border) {
            // 선택 시 흰색 두꺼운 테두리로 강조
            border.setStrokeStyle(3, 0xFFFFFF, 1.0);
        }
        
        // 스케일 확대
        container.setScale(1.05);
    }

    /**
     * 선택 해제
     */
    clearSelection() {
        if (this.selectedTile) {
            const bg = this.selectedTile.getData('background');
            const border = this.selectedTile.getData('border');
            const imageSprite = this.selectedTile.getData('imageSprite');
            
            // 원래 스타일로 복원
            if (bg) {
                // 배경 처리: 이미지가 있으면 흰색 유지, 없으면 원래 색상 사용
                if (imageSprite && imageSprite.visible) {
                    // 이미지가 있는 경우 배경은 흰색 유지
                    bg.setFillStyle(0xFFFFFF);
                } else {
                    // 이미지가 없는 경우 원래 색상 사용
                    const originalColor = this.selectedTile.getData('originalColor');
                    if (originalColor) {
                        bg.setFillStyle(Phaser.Display.Color.HexStringToColor(originalColor).color);
                    }
                }
            }
            if (border) {
                // 원래 테두리 스타일로 복원 (얇은 회색 테두리)
                border.setStrokeStyle(2, 0xE0E0E0, 0.8);
            }
            // 스케일 원래대로
            this.selectedTile.setScale(1.0);
            
            // 선택 해제
            this.selectedTile = null;
        }
    }

    /**
     * 매치 여부 확인 (생성 시)
     */
    wouldMatch(row, col, colorIndex) {
        if (col >= 2) {
            if (this.board[row] && this.board[row][col - 1] && this.board[row][col - 1].colorIndex === colorIndex &&
                this.board[row][col - 2] && this.board[row][col - 2].colorIndex === colorIndex) {
                return true;
            }
        }
        if (row >= 2) {
            if (this.board[row - 1] && this.board[row - 1][col] && this.board[row - 1][col].colorIndex === colorIndex &&
                this.board[row - 2] && this.board[row - 2][col] && this.board[row - 2][col].colorIndex === colorIndex) {
                return true;
            }
        }
        return false;
    }

    /**
     * UI 생성
     */
    createUI() {
        // 캔버스 크기에 비례하여 UI 크기 계산 (기준: 600x700)
        const baseWidth = 600;
        const baseHeight = 700;
        const scaleX = this.canvasWidth / baseWidth;
        const scaleY = this.canvasHeight / baseHeight;
        const scale = Math.min(scaleX, scaleY, 1.0); // 최대 1.0으로 제한 (작은 화면에서만 축소)
        
        // 반응형 UI 크기
        const panelPadding = 10; // 패널 좌우 여백
        const panelWidth = Math.max(this.canvasWidth - panelPadding * 2, 280 * scale);
        const panelHeight = Math.max(60 * scale, 50);
        const panelX = panelPadding; // 좌측 여백
        const panelY = 10;
        
        // 반응형 폰트 크기
        const labelFontSize = Math.max(12 * scale, 10);
        const valueFontSize = Math.max(24 * scale, 18);
        const comboFontSize = Math.max(40 * scale, 32);
        
        // 패널 배경 (게임판과 겹치지 않도록 낮은 depth)
        this.uiPanelBg = this.scene.add.rectangle(panelX + panelWidth/2, panelY + panelHeight/2, panelWidth, panelHeight, 0xffffff);
        this.uiPanelBg.setAlpha(0.95);
        this.uiPanelBg.setStrokeStyle(2, 0x4CAF50, 1);
        this.uiPanelBg.setDepth(5); // 게임 블록(10)보다 낮게
        
        // 패널 하단 위치 저장 (나중에 게임판 위치 계산에 사용)
        this.uiPanelBottom = panelY + panelHeight;
        
        // 그림자 효과
        this.uiPanelShadow = this.scene.add.rectangle(panelX + panelWidth/2 + 2, panelY + panelHeight/2 + 2, panelWidth, panelHeight, 0x000000);
        this.uiPanelShadow.setAlpha(0.2);
        this.uiPanelShadow.setDepth(4); // 패널보다 낮게
        
        // 점수 UI 카드 (반응형)
        const scoreCardWidth = Math.max(120 * scale, 100);
        const scoreCardHeight = Math.max(48 * scale, 40);
        const scoreCardX = panelX + Math.max(15 * scale, 10);
        const scoreCardY = panelY + panelHeight/2;
        
        // 점수 카드 배경
        this.scoreCardBg = this.scene.add.rectangle(scoreCardX + scoreCardWidth/2, scoreCardY, scoreCardWidth, scoreCardHeight, 0x2196F3);
        this.scoreCardBg.setAlpha(0.9);
        this.scoreCardBg.setDepth(6); // 패널 위에 표시
        this.scoreCardBg.setStrokeStyle(2, 0x1976D2, 1);
        
        // 점수 라벨
        const scoreLabelPadding = Math.max(10 * scale, 8);
        this.scoreLabel = this.scene.add.text(scoreCardX + scoreLabelPadding, scoreCardY - scoreCardHeight/3, '점수', {
            fontSize: labelFontSize + 'px',
            fill: '#ffffff',
            fontFamily: 'Arial, sans-serif',
            fontWeight: 'bold'
        });
        this.scoreLabel.setDepth(7);
        
        // 점수 값
        this.scoreText = this.scene.add.text(scoreCardX + scoreLabelPadding, scoreCardY - 5, '0', {
            fontSize: valueFontSize + 'px',
            fill: '#ffffff',
            fontFamily: 'Arial, sans-serif',
            fontWeight: 'bold'
        });
        this.scoreText.setDepth(7);
        
        // 시간 UI 카드 (반응형)
        const timeCardWidth = Math.max(120 * scale, 100);
        const timeCardHeight = Math.max(48 * scale, 40);
        const timeCardX = panelX + panelWidth - timeCardWidth - Math.max(15 * scale, 10);
        const timeCardY = panelY + panelHeight/2;
        
        // 시간 카드 배경
        this.timeCardBg = this.scene.add.rectangle(timeCardX + timeCardWidth/2, timeCardY, timeCardWidth, timeCardHeight, 0xFF6B35);
        this.timeCardBg.setAlpha(0.95);
        this.timeCardBg.setDepth(6); // 패널 위에 표시
        this.timeCardBg.setStrokeStyle(2, 0xE55A2B, 1);
        
        // 시간 라벨
        const timeLabelPadding = Math.max(10 * scale, 8);
        this.timeLabel = this.scene.add.text(timeCardX + timeLabelPadding, timeCardY - timeCardHeight/3, '남은 시간', {
            fontSize: labelFontSize + 'px',
            fill: '#ffffff',
            fontFamily: 'Arial, sans-serif',
            fontWeight: 'bold'
        });
        this.timeLabel.setDepth(7);
        
        // 시간 값
        this.timeText = this.scene.add.text(timeCardX + timeLabelPadding, timeCardY - 5, '0:00', {
            fontSize: valueFontSize + 'px',
            fill: '#FFFFFF',
            fontFamily: 'Arial, sans-serif',
            fontWeight: 'bold'
        });
        this.timeText.setDepth(7);
        
        // 콤보 텍스트를 게임판 중앙 상단에 배치 (위치는 createBoard 후에 업데이트됨)
        const comboX = this.canvasWidth / 2; // 게임판 중앙
        const comboY = 200; // 임시 위치 (나중에 업데이트됨)
        this.comboText = this.scene.add.text(comboX, comboY, '', {
            fontSize: comboFontSize + 'px',
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
        this.comboText.setVisible(false);
        this.comboText.setOrigin(0.5);
        this.comboText.setDepth(1000); // 블록보다 위에 표시
    }

    /**
     * 타이머 시작
     */
    startTimer() {
        this.timer = this.scene.time.addEvent({
            delay: 1000,
            callback: () => {
                // isPaused만 체크 (isProcessing 중에도 시간은 계속 흘러야 함)
                if (!this.isPaused) {
                    this.timeRemaining--;
                    this.updateTimeDisplay();
                    
                    if (this.timeRemaining <= 0) {
                        this.endGame();
                    }
                }
            },
            callbackScope: this,
            loop: true
        });
    }

    /**
     * 시간 표시 업데이트
     */
    updateTimeDisplay() {
        const minutes = Math.floor(this.timeRemaining / 60);
        const seconds = this.timeRemaining % 60;
        const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        this.timeText.setText(timeStr);
        
        // 시간이 10초 이하일 때 경고 효과
        if (this.timeRemaining <= 10) {
            this.timeText.setFill('#FFFFFF');
            this.timeText.setStroke('', 0); // border 제거
            this.timeCardBg.setFillStyle(0xF44336, 0.95);
            this.timeCardBg.setStrokeStyle(2, 0xD32F2F, 1);
            
            // 깜빡이는 효과
            if (this.timeRemaining % 2 === 0) {
                this.timeText.setAlpha(0.8);
            } else {
                this.timeText.setAlpha(1);
            }
        } else if (this.timeRemaining <= 30) {
            this.timeText.setFill('#FFFFFF');
            this.timeText.setStroke('', 0); // border 제거
            this.timeCardBg.setFillStyle(0xFF6B35, 0.95);
            this.timeCardBg.setStrokeStyle(2, 0xE55A2B, 1);
            this.timeText.setAlpha(1);
        } else {
            this.timeText.setFill('#FFFFFF');
            this.timeText.setStroke('', 0); // border 제거
            this.timeCardBg.setFillStyle(0xFF6B35, 0.95);
            this.timeCardBg.setStrokeStyle(2, 0xE55A2B, 1);
            this.timeText.setAlpha(1);
        }
    }

    /**
     * 타일 교환
     */
    swapTiles(row1, col1, row2, col2, isRevert = false) {
        if (this.isProcessing && !isRevert) return;
        if (!this.board[row1] || !this.board[row1][col1] || !this.board[row2] || !this.board[row2][col2]) return;

        const temp = this.board[row1][col1];
        this.board[row1][col1] = this.board[row2][col2];
        this.board[row2][col2] = temp;

        const container1 = this.board[row1][col1].container;
        const container2 = this.board[row2][col2].container;

        const targetX1 = this.startX + col1 * (this.tileSize + this.spacing);
        const targetY1 = this.startY + row1 * (this.tileSize + this.spacing);
        const targetX2 = this.startX + col2 * (this.tileSize + this.spacing);
        const targetY2 = this.startY + row2 * (this.tileSize + this.spacing);

        // 애니메이션으로 교환 (빠른 반응)
        this.scene.tweens.add({
            targets: container1,
            x: targetX1,
            y: targetY1,
            duration: 150,
            ease: 'Power2',
            onComplete: () => {
                // 되돌리기 시 애니메이션 완료 후 깨끗하게 정리
                if (isRevert) {
                    const tile1 = this.board[row1][col1];
                    const tile2 = this.board[row2][col2];
                    
                    // 컨테이너 내부 요소들이 제대로 표시되도록 강제 업데이트
                    if (tile1 && tile1.container && tile1.container.list) {
                        tile1.container.list.forEach(child => {
                            if (child && child.setVisible) {
                                child.setVisible(true);
                                child.setAlpha(1);
                            }
                        });
                    }
                    if (tile2 && tile2.container && tile2.container.list) {
                        tile2.container.list.forEach(child => {
                            if (child && child.setVisible) {
                                child.setVisible(true);
                                child.setAlpha(1);
                            }
                        });
                    }
                }
            }
        });

        this.scene.tweens.add({
            targets: container2,
            x: targetX2,
            y: targetY2,
            duration: 150,
            ease: 'Power2',
            onComplete: () => {
                // 되돌리기 시 애니메이션 완료 후 깨끗하게 정리
                if (isRevert) {
                    const tile1 = this.board[row1][col1];
                    const tile2 = this.board[row2][col2];
                    
                    // 컨테이너 내부 요소들이 제대로 표시되도록 강제 업데이트
                    if (tile1 && tile1.container && tile1.container.list) {
                        tile1.container.list.forEach(child => {
                            if (child && child.setVisible) {
                                child.setVisible(true);
                                child.setAlpha(1);
                            }
                        });
                    }
                    if (tile2 && tile2.container && tile2.container.list) {
                        tile2.container.list.forEach(child => {
                            if (child && child.setVisible) {
                                child.setVisible(true);
                                child.setAlpha(1);
                            }
                        });
                    }
                }
            }
        });

        // 데이터 업데이트
        container1.setData('row', row1);
        container1.setData('col', col1);
        container2.setData('row', row2);
        container2.setData('col', col2);

        // 되돌리기가 아닌 경우에만 매치 확인 및 사용자 액션 등록
        if (!isRevert) {
            this.scene.time.delayedCall(150, () => {
                const matches = this.findMatches();
                if (matches.length > 0) {
                    this.removeMatches(matches);
                } else {
                    // 매치가 없으면 되돌리기
                    this.swapTiles(row1, col1, row2, col2, true);
                    // 매치가 없으므로 처리 완료
                    this.isProcessing = false;
                    // 사용자 액션 등록 (힌트 타이머 재시작)
                    this.registerPlayerAction();
                }
            });
        }
    }

    /**
     * 매치 찾기
     */
    findMatches() {
        const matches = [];
        const matchedSet = new Set(); // 중복 체크를 위한 Set

        // 2x2 정사각형 매치 (가로 x 세로 동일한 4개)
        for (let row = 0; row < this.boardSize - 1; row++) {
            for (let col = 0; col < this.boardSize - 1; col++) {
                if (!this.board[row] || !this.board[row][col] ||
                    !this.board[row][col + 1] ||
                    !this.board[row + 1] || !this.board[row + 1][col] ||
                    !this.board[row + 1][col + 1]) {
                    continue;
                }

                const colorIndex = this.board[row][col].colorIndex;
                
                // 2x2 정사각형의 4개 블록이 모두 같은 색상인지 확인
                if (this.board[row][col + 1].colorIndex === colorIndex &&
                    this.board[row + 1][col].colorIndex === colorIndex &&
                    this.board[row + 1][col + 1].colorIndex === colorIndex) {
                    
                    // 4개 블록을 matches에 추가 (중복 체크)
                    const positions = [
                        { row, col },
                        { row, col: col + 1 },
                        { row: row + 1, col },
                        { row: row + 1, col: col + 1 }
                    ];
                    
                    positions.forEach(pos => {
                        const key = `${pos.row},${pos.col}`;
                        if (!matchedSet.has(key)) {
                            matchedSet.add(key);
                            matches.push(pos);
                        }
                    });
                }
            }
        }

        // 가로 매치
        for (let row = 0; row < this.boardSize; row++) {
            let startCol = 0;
            while (startCol < this.boardSize) {
                if (!this.board[row] || !this.board[row][startCol]) {
                    startCol++;
                    continue;
                }

                const colorIndex = this.board[row][startCol].colorIndex;
                let endCol = startCol;

                while (endCol + 1 < this.boardSize && 
                       this.board[row][endCol + 1] && 
                       this.board[row][endCol + 1].colorIndex === colorIndex) {
                    endCol++;
                }

                if (endCol - startCol >= 2) {
                    for (let col = startCol; col <= endCol; col++) {
                        const key = `${row},${col}`;
                        if (!matchedSet.has(key)) {
                            matchedSet.add(key);
                            matches.push({ row, col });
                        }
                    }
                }

                startCol = endCol + 1;
            }
        }

        // 세로 매치
        for (let col = 0; col < this.boardSize; col++) {
            let startRow = 0;
            while (startRow < this.boardSize) {
                if (!this.board[startRow] || !this.board[startRow][col]) {
                    startRow++;
                    continue;
                }

                const colorIndex = this.board[startRow][col].colorIndex;
                let endRow = startRow;

                while (endRow + 1 < this.boardSize && 
                       this.board[endRow + 1] && 
                       this.board[endRow + 1][col] && 
                       this.board[endRow + 1][col].colorIndex === colorIndex) {
                    endRow++;
                }

                if (endRow - startRow >= 2) {
                    for (let row = startRow; row <= endRow; row++) {
                        const key = `${row},${col}`;
                        if (!matchedSet.has(key)) {
                            matchedSet.add(key);
                            matches.push({ row, col });
                        }
                    }
                }

                startRow = endRow + 1;
            }
        }

        // 매치된 블록과 인접한(상하좌우) 같은 색상 블록도 함께 제거
        const expandedMatches = this.expandConnectedMatches(matches, matchedSet);
        
        return expandedMatches;
    }

    /**
     * 매치된 블록과 인접한 같은 색상 블록 확장
     */
    expandConnectedMatches(initialMatches, matchedSet) {
        const expandedMatches = [...initialMatches];
        const queue = [...initialMatches]; // BFS를 위한 큐
        const processed = new Set(matchedSet); // 이미 처리된 블록
        
        // 방향: 상, 하, 좌, 우 (대각선 제외)
        const directions = [
            { row: -1, col: 0 },  // 상
            { row: 1, col: 0 },   // 하
            { row: 0, col: -1 },  // 좌
            { row: 0, col: 1 }    // 우
        ];
        
        while (queue.length > 0) {
            const current = queue.shift();
            const currentKey = `${current.row},${current.col}`;
            
            // 현재 블록의 색상 확인
            if (!this.board[current.row] || !this.board[current.row][current.col]) {
                continue;
            }
            
            const currentColorIndex = this.board[current.row][current.col].colorIndex;
            
            // 상하좌우 인접 블록 확인
            for (const dir of directions) {
                const newRow = current.row + dir.row;
                const newCol = current.col + dir.col;
                const newKey = `${newRow},${newCol}`;
                
                // 범위 체크
                if (newRow < 0 || newRow >= this.boardSize || 
                    newCol < 0 || newCol >= this.boardSize) {
                    continue;
                }
                
                // 이미 처리된 블록이면 스킵
                if (processed.has(newKey)) {
                    continue;
                }
                
                // 블록이 존재하고 같은 색상인지 확인
                if (this.board[newRow] && 
                    this.board[newRow][newCol] && 
                    this.board[newRow][newCol].colorIndex === currentColorIndex) {
                    
                    // 매치 목록에 추가
                    expandedMatches.push({ row: newRow, col: newCol });
                    processed.add(newKey);
                    queue.push({ row: newRow, col: newCol });
                }
            }
        }
        
        return expandedMatches;
    }

    /**
     * 매치 제거
     */
    removeMatches(matches, isChain = false) {
        // 연쇄 매치가 아닌 경우에만 isProcessing 체크
        if (!isChain && this.isProcessing) return;
        
        // 첫 번째 매치인 경우에만 isProcessing 설정 및 이동 횟수 증가
        if (!isChain) {
            this.isProcessing = true;
            this.moves++; // 블럭 이동(매칭) 횟수 증가
        }
        
        this.registerPlayerAction();

        // 콤보 증가 (모든 매치에서 증가)
        // 첫 번째 매치이고 콤보가 0이면 1로 시작, 아니면 증가
        if (this.comboCount === 0) {
            this.comboCount = 1;
        } else {
            this.comboCount++;
        }
        
        // 최대 콤보 업데이트
        if (this.comboCount > this.maxCombo) {
            this.maxCombo = this.comboCount;
        }
        
        // 콤보 리셋 타이머 취소 및 재설정 (새 매치가 발생했으므로 타이머 재시작)
        if (this.comboResetTimer) {
            this.scene.time.removeEvent(this.comboResetTimer);
            this.comboResetTimer = null;
        }
        
        this.showCombo();

        // 콤보 배수 계산
        let comboMultiplier = 1;
        if (this.comboCount >= 2 && this.comboMultipliers) {
            // 콤보 수에 맞는 배수 찾기 (가장 높은 배수 적용)
            let maxMultiplier = 1;
            for (const [comboThreshold, multiplier] of Object.entries(this.comboMultipliers)) {
                if (this.comboCount >= parseInt(comboThreshold) && multiplier > maxMultiplier) {
                    maxMultiplier = multiplier;
                }
            }
            comboMultiplier = maxMultiplier;
        } else if (this.comboCount > 1) {
            // 기본 배수: 콤보 수만큼
            comboMultiplier = this.comboCount;
        }

        const matchPoints = Math.floor(matches.length * this.matchPoints * comboMultiplier);
        this.score += matchPoints;
        this.scoreText.setText(this.score.toLocaleString());
        
        // 점수 증가 애니메이션
        this.scene.tweens.add({
            targets: this.scoreText,
            scaleX: 1.2,
            scaleY: 1.2,
            duration: 150,
            yoyo: true,
            ease: 'Power2'
        });

        // 매치된 블록 제거 애니메이션 (빠른 제거)
        matches.forEach(match => {
            const tile = this.board[match.row][match.col];
            if (tile && tile.container) {
                this.scene.tweens.add({
                    targets: tile.container,
                    alpha: 0,
                    scale: 0,
                    duration: 150,
                    ease: 'Power2'
                });
            }
        });

        // 애니메이션 완료 후 제거 및 중력 적용 (빠른 중력 적용)
        this.scene.time.delayedCall(150, () => {
            matches.forEach(match => {
                if (this.board[match.row] && this.board[match.row][match.col]) {
                    const tile = this.board[match.row][match.col];
                    if (tile && tile.container) {
                        // 컨테이너 내부 요소들을 명시적으로 제거
                        if (tile.background) {
                            tile.background.destroy();
                        }
                        if (tile.imageSprite) {
                            tile.imageSprite.destroy();
                        }
                        if (tile.border) {
                            tile.border.destroy();
                        }
                        // 컨테이너 제거
                        tile.container.destroy();
                    }
                    this.board[match.row][match.col] = null;
                }
            });

            this.applyGravity();
        });
    }

    /**
     * 중력 적용
     */
    applyGravity() {
        // 애니메이션 완료 추적을 위한 카운터
        let totalAnimations = 0;
        let completedAnimations = 0;
        
        // 애니메이션 완료 체크 함수
        const checkAnimationComplete = () => {
            completedAnimations++;
            if (completedAnimations >= totalAnimations) {
                // 모든 애니메이션 완료 후 추가 매치 확인
                this.scene.time.delayedCall(50, () => {
                    // 안전장치: isProcessing이 true인지 확인
                    if (!this.isProcessing) {
                        console.warn('applyGravity: isProcessing이 이미 false입니다.');
                        return;
                    }
                    
                    const newMatches = this.findMatches();
                    if (newMatches.length > 0) {
                        // 추가 매치가 있으면 연쇄 매치로 처리 (isProcessing은 유지)
                        this.removeMatches(newMatches, true);
                    } else {
                        // 매치가 없으면 처리 완료
                        this.isProcessing = false;
                        
                        // 콤보 텍스트 페이드 아웃 (애니메이션 중이면 그대로 진행)
                        if (this.comboText && this.comboText.visible) {
                            // 이미 애니메이션이 진행 중이면 그대로 두고, 아니면 즉시 숨김
                            const activeTweens = this.scene.tweens.getTweensOf(this.comboText);
                            if (activeTweens.length === 0) {
                                this.comboText.setVisible(false);
                                this.comboText.setScale(1);
                                this.comboText.setAlpha(1);
                                this.comboText.y = this.startY + 20;
                            }
                        }
                        
                        // 콤보 리셋 타이머 설정
                        if (this.comboResetTimer) {
                            this.scene.time.removeEvent(this.comboResetTimer);
                        }
                        this.comboResetTimer = this.scene.time.delayedCall(this.comboResetTime, () => {
                            this.comboCount = 0;
                            this.comboResetTimer = null;
                        });
                    }
                });
            }
        };
        
        for (let col = 0; col < this.boardSize; col++) {
            const column = [];
            
            // 아래에서 위로 수집
            for (let row = this.boardSize - 1; row >= 0; row--) {
                if (this.board[row] && this.board[row][col] && this.board[row][col].container) {
                    column.push(this.board[row][col]);
                    this.board[row][col] = null;
                }
            }

            // 아래에서부터 배치
            for (let i = 0; i < column.length; i++) {
                const row = this.boardSize - 1 - i;
                const tile = column[i];
                this.board[row][col] = tile;

                const targetX = this.startX + col * (this.tileSize + this.spacing);
                const targetY = this.startY + row * (this.tileSize + this.spacing);
                
                totalAnimations++;
                this.scene.tweens.add({
                    targets: tile.container,
                    x: targetX,
                    y: targetY,
                    duration: 200,
                    delay: i * 30,
                    ease: 'Power2',
                    onComplete: () => {
                        tile.container.setData('row', row);
                        tile.container.setData('col', col);
                        checkAnimationComplete();
                    }
                });
            }

            // 빈 공간 채우기
            const emptyRows = this.boardSize - column.length;
            for (let i = 0; i < emptyRows; i++) {
                const row = i;
                let blockTypeIndex = Math.floor(Math.random() * this.blockTypes.length);
                let attempts = 0;
                while (this.wouldMatch(row, col, blockTypeIndex) && attempts < 10) {
                    blockTypeIndex = Math.floor(Math.random() * this.blockTypes.length);
                    attempts++;
                }
                
                const x = this.startX + col * (this.tileSize + this.spacing);
                const startY = this.startY - (emptyRows - i) * (this.tileSize + this.spacing);
                
                const tileData = this.createTile(x, startY, row, col, blockTypeIndex);
                if (tileData) {
                    this.board[row][col] = tileData;

                    const targetY = this.startY + row * (this.tileSize + this.spacing);
                    totalAnimations++;
                    this.scene.tweens.add({
                        targets: tileData.container,
                        y: targetY,
                        duration: 200,
                        delay: (emptyRows - i) * 30,
                        ease: 'Power2',
                        onComplete: () => {
                            checkAnimationComplete();
                            // 새로 생성된 블록의 이미지에 줌인/줌아웃 애니메이션 추가
                            if (tileData.imageSprite && tileData.imageSprite.active) {
                                // 현재 스케일 확인 (이미 createTile에서 설정됨)
                                const currentScale = tileData.imageSprite.scaleX;
                                const startScale = currentScale * 0.9;
                                tileData.imageSprite.setScale(startScale);
                                
                                // 약간의 지연 후 애니메이션 시작
                                this.scene.time.delayedCall(50, () => {
                                    if (tileData.imageSprite && tileData.imageSprite.active) {
                                        this.scene.tweens.add({
                                            targets: tileData.imageSprite,
                                            scaleX: currentScale,
                                            scaleY: currentScale,
                                            duration: 300,
                                            ease: 'Back.easeOut'
                                        });
                                    }
                                });
                            }
                        }
                    });
                }
            }
        }
        
        // 애니메이션이 없는 경우 (빈 보드 등) 즉시 매치 확인
        if (totalAnimations === 0) {
            this.scene.time.delayedCall(50, () => {
                if (!this.isProcessing) {
                    return;
                }
                
                const newMatches = this.findMatches();
                if (newMatches.length > 0) {
                    this.removeMatches(newMatches, true);
                } else {
                    this.isProcessing = false;
                    
                    if (this.comboText && this.comboText.visible) {
                        const activeTweens = this.scene.tweens.getTweensOf(this.comboText);
                        if (activeTweens.length === 0) {
                            this.comboText.setVisible(false);
                            this.comboText.setScale(1);
                            this.comboText.setAlpha(1);
                            this.comboText.y = this.startY + 20;
                        }
                    }
                    
                    if (this.comboResetTimer) {
                        this.scene.time.removeEvent(this.comboResetTimer);
                    }
                    this.comboResetTimer = this.scene.time.delayedCall(this.comboResetTime, () => {
                        this.comboCount = 0;
                        this.comboResetTimer = null;
                    });
                }
            });
        }
    }

    /**
     * 콤보 표시
     */
    showCombo() {
        if (this.comboCount >= 1) {
            // 기존 애니메이션 중지
            this.scene.tweens.killTweensOf(this.comboText);
            
            // 콤보가 1일 때는 표시하지 않음 (2 이상일 때만 표시)
            if (this.comboCount >= 2) {
                // 콤보에 따라 색상 변경
                let comboColor = '#FFD700'; // 기본 골드
                if (this.comboCount >= 5) {
                    comboColor = '#FF6B6B'; // 빨강 (높은 콤보)
                } else if (this.comboCount >= 3) {
                    comboColor = '#FFA500'; // 주황
                }
                
                this.comboText.setFill(comboColor);
                this.comboText.setText(`${this.comboCount}X 콤보!`);
                this.comboText.setVisible(true);
                this.comboText.setScale(0);
                this.comboText.setAlpha(1);
                this.comboText.setDepth(1000); // 항상 최상위에 표시

                // 부드러운 애니메이션 (위로 이동하며 페이드 아웃)
                const originalY = this.comboText.y;
                this.scene.tweens.add({
                    targets: this.comboText,
                    scale: 1.2,
                    y: originalY - 30,
                    alpha: 0,
                    duration: 800,
                    ease: 'Power2',
                    onComplete: () => {
                        this.comboText.setVisible(false);
                        // 원래 위치로 복귀
                        this.comboText.setScale(1);
                        this.comboText.setAlpha(1);
                        this.comboText.y = originalY;
                    }
                });
            }
        }
    }

    /**
     * 힌트 시스템
     */
    startHintTimer() {
        this.resetHintTimer();
    }

    resetHintTimer() {
        if (this.hintTimeout) {
            this.scene.time.removeEvent(this.hintTimeout);
            this.hintTimeout = null;
        }
        this.hideHint();

        if (this.isPaused) {
            // 일시정지 중이면 타이머 시작 안함
            return;
        }

        // isProcessing 상태와 관계없이 타이머 시작
        // showHint()에서 isProcessing 상태를 확인하여 표시 여부 결정
        this.hintTimeout = this.scene.time.delayedCall(this.hintDelay, () => {
            this.showHint();
        });
    }

    showHint() {
        // 게임이 일시정지되어 있거나 처리 중이면 힌트 표시 안함
        if (this.isPaused || this.isProcessing) {
            // 상태가 변경되면 다시 타이머 시작
            this.resetHintTimer();
            return;
        }
        
        const possibleMoves = this.findPossibleMoves();
        if (possibleMoves.length > 0) {
            const move = possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
            this.hintMove = move;
            this.highlightHint(move);
        } else {
            // 가능한 움직임이 없으면 다시 타이머 시작
            this.resetHintTimer();
        }
    }

    hideHint() {
        if (this.hintMove) {
            this.clearHintHighlight();
            this.hintMove = null;
        }
    }

    highlightHint(move) {
        const tile1 = this.board[move.row1][move.col1];
        const tile2 = this.board[move.row2][move.col2];
        
        // 타일1 힌트 애니메이션
        if (tile1 && tile1.container) {
            const imageSprite1 = tile1.imageSprite;
            const border1 = tile1.container.getData('border');
            
            // 이미지가 있으면 이미지에 애니메이션 적용
            if (imageSprite1 && imageSprite1.active) {
                // 기존 애니메이션 제거
                this.scene.tweens.killTweensOf(imageSprite1);
                // 이미지 줌인/줌아웃 애니메이션
                const currentScale = imageSprite1.scaleX;
                this.scene.tweens.add({
                    targets: imageSprite1,
                    scaleX: { from: currentScale, to: currentScale * 1.15 },
                    scaleY: { from: currentScale, to: currentScale * 1.15 },
                    duration: 500,
                    yoyo: true,
                    repeat: -1,
                    ease: 'Sine.easeInOut'
                });
            }
            
            // border에도 애니메이션 적용 (항상 보임)
            if (border1) {
                // 기존 애니메이션 제거
                this.scene.tweens.killTweensOf(border1);
                // 테두리 두께와 색상으로 힌트 표시
                this.scene.tweens.add({
                    targets: border1,
                    alpha: { from: 0.5, to: 1 },
                    scaleX: { from: 1, to: 1.1 },
                    scaleY: { from: 1, to: 1.1 },
                    duration: 500,
                    yoyo: true,
                    repeat: -1,
                    ease: 'Sine.easeInOut',
                    onStart: () => {
                        // 힌트 표시 시 테두리 색상을 밝게 변경
                        border1.setStrokeStyle(4, 0xFFFF00, 1);
                    }
                });
            }
        }

        // 타일2 힌트 애니메이션
        if (tile2 && tile2.container) {
            const imageSprite2 = tile2.imageSprite;
            const border2 = tile2.container.getData('border');
            
            // 이미지가 있으면 이미지에 애니메이션 적용
            if (imageSprite2 && imageSprite2.active) {
                // 기존 애니메이션 제거
                this.scene.tweens.killTweensOf(imageSprite2);
                // 이미지 줌인/줌아웃 애니메이션
                const currentScale = imageSprite2.scaleX;
                this.scene.tweens.add({
                    targets: imageSprite2,
                    scaleX: { from: currentScale, to: currentScale * 1.15 },
                    scaleY: { from: currentScale, to: currentScale * 1.15 },
                    duration: 500,
                    yoyo: true,
                    repeat: -1,
                    ease: 'Sine.easeInOut'
                });
            }
            
            // border에도 애니메이션 적용 (항상 보임)
            if (border2) {
                // 기존 애니메이션 제거
                this.scene.tweens.killTweensOf(border2);
                // 테두리 두께와 색상으로 힌트 표시
                this.scene.tweens.add({
                    targets: border2,
                    alpha: { from: 0.5, to: 1 },
                    scaleX: { from: 1, to: 1.1 },
                    scaleY: { from: 1, to: 1.1 },
                    duration: 500,
                    yoyo: true,
                    repeat: -1,
                    ease: 'Sine.easeInOut',
                    onStart: () => {
                        // 힌트 표시 시 테두리 색상을 밝게 변경
                        border2.setStrokeStyle(4, 0xFFFF00, 1);
                    }
                });
            }
        }
    }

    clearHintHighlight() {
        for (let row = 0; row < this.boardSize; row++) {
            for (let col = 0; col < this.boardSize; col++) {
                if (this.board[row] && this.board[row][col] && this.board[row][col].container) {
                    const tile = this.board[row][col];
                    
                    // 이미지 애니메이션 제거 및 복원
                    if (tile.imageSprite && tile.imageSprite.active) {
                        this.scene.tweens.killTweensOf(tile.imageSprite);
                        // 원래 스케일로 복원 (createTile에서 설정한 baseScale)
                        const imageSize = this.tileSize - 8;
                        const texture = this.scene.textures.get(`block_${tile.colorIndex}`);
                        let textureWidth = imageSize;
                        let textureHeight = imageSize;
                        if (texture && texture.getSourceImage) {
                            const sourceImage = texture.getSourceImage();
                            if (sourceImage) {
                                textureWidth = sourceImage.width || imageSize;
                                textureHeight = sourceImage.height || imageSize;
                            }
                        }
                        const baseScale = Math.min(imageSize / textureWidth, imageSize / textureHeight);
                        tile.imageSprite.setScale(baseScale);
                    }
                    
                    // border 애니메이션 제거 및 복원
                    const border = tile.container.getData('border');
                    if (border) {
                        this.scene.tweens.killTweensOf(border);
                        border.setAlpha(1);
                        border.setScale(1);
                        // 원래 테두리 스타일로 복원
                        border.setStrokeStyle(2, 0xE0E0E0, 0.8);
                    }
                }
            }
        }
    }

    findPossibleMoves() {
        const possibleMoves = [];
        const clonedBoard = [];
        
        // 보드 복제
        for (let row = 0; row < this.boardSize; row++) {
            clonedBoard[row] = [];
            for (let col = 0; col < this.boardSize; col++) {
                if (this.board[row] && this.board[row][col]) {
                    clonedBoard[row][col] = { colorIndex: this.board[row][col].colorIndex };
                } else {
                    clonedBoard[row][col] = null;
                }
            }
        }

        for (let row = 0; row < this.boardSize; row++) {
            for (let col = 0; col < this.boardSize; col++) {
                if (!clonedBoard[row][col]) continue;

                // 오른쪽과 교환 시도
                if (col < this.boardSize - 1 && clonedBoard[row][col + 1]) {
                    const temp = clonedBoard[row][col];
                    clonedBoard[row][col] = clonedBoard[row][col + 1];
                    clonedBoard[row][col + 1] = temp;

                    if (this.hasMatchesInBoard(clonedBoard)) {
                        possibleMoves.push({ row1: row, col1: col, row2: row, col2: col + 1 });
                    }

                    clonedBoard[row][col + 1] = clonedBoard[row][col];
                    clonedBoard[row][col] = temp;
                }

                // 아래와 교환 시도
                if (row < this.boardSize - 1 && clonedBoard[row + 1][col]) {
                    const temp = clonedBoard[row][col];
                    clonedBoard[row][col] = clonedBoard[row + 1][col];
                    clonedBoard[row + 1][col] = temp;

                    if (this.hasMatchesInBoard(clonedBoard)) {
                        possibleMoves.push({ row1: row, col1: col, row2: row + 1, col2: col });
                    }

                    clonedBoard[row + 1][col] = clonedBoard[row][col];
                    clonedBoard[row][col] = temp;
                }
            }
        }

        return possibleMoves;
    }

    hasMatchesInBoard(board) {
        const matches = [];
        const matchedSet = new Set();

        // 2x2 정사각형 매치 (가로 x 세로 동일한 4개)
        for (let row = 0; row < this.boardSize - 1; row++) {
            for (let col = 0; col < this.boardSize - 1; col++) {
                if (!board[row] || !board[row][col] ||
                    !board[row][col + 1] ||
                    !board[row + 1] || !board[row + 1][col] ||
                    !board[row + 1][col + 1]) {
                    continue;
                }

                const colorIndex = board[row][col].colorIndex;
                
                // 2x2 정사각형의 4개 블록이 모두 같은 색상인지 확인
                if (board[row][col + 1].colorIndex === colorIndex &&
                    board[row + 1][col].colorIndex === colorIndex &&
                    board[row + 1][col + 1].colorIndex === colorIndex) {
                    return true; // 매치 발견 시 즉시 반환
                }
            }
        }

        // 가로 매치
        for (let row = 0; row < this.boardSize; row++) {
            let startCol = 0;
            while (startCol < this.boardSize) {
                if (!board[row] || !board[row][startCol]) {
                    startCol++;
                    continue;
                }

                const colorIndex = board[row][startCol].colorIndex;
                let endCol = startCol;

                while (endCol + 1 < this.boardSize && 
                       board[row][endCol + 1] && 
                       board[row][endCol + 1].colorIndex === colorIndex) {
                    endCol++;
                }

                if (endCol - startCol >= 2) {
                    return true; // 매치 발견 시 즉시 반환
                }

                startCol = endCol + 1;
            }
        }

        // 세로 매치
        for (let col = 0; col < this.boardSize; col++) {
            let startRow = 0;
            while (startRow < this.boardSize) {
                if (!board[startRow] || !board[startRow][col]) {
                    startRow++;
                    continue;
                }

                const colorIndex = board[startRow][col].colorIndex;
                let endRow = startRow;

                while (endRow + 1 < this.boardSize && 
                       board[endRow + 1] && 
                       board[endRow + 1][col] && 
                       board[endRow + 1][col].colorIndex === colorIndex) {
                    endRow++;
                }

                if (endRow - startRow >= 2) {
                    return true; // 매치 발견 시 즉시 반환
                }

                startRow = endRow + 1;
            }
        }

        return false;
    }

    /**
     * 사용자 액션 등록
     */
    registerPlayerAction() {
        this.lastActionTime = Date.now();
        this.resetHintTimer();
    }

    /**
     * 게임 종료
     */
    endGame() {
        this.isPaused = true;
        if (this.timer) {
            this.timer.remove();
        }
        if (this.hintTimeout) {
            this.scene.time.removeEvent(this.hintTimeout);
        }

        this.saveScore();
        this.showGameEndModal();
    }

    /**
     * 게임 시작 모달 표시
     */
    showGameStartModal() {
        const modal = document.createElement('div');
        modal.className = 'game-start-modal';
        const self = this; // this 컨텍스트 보존
        modal.innerHTML = `
            <div class="modal-content">
                <h2>게임 준비 완료!</h2>
                <p class="game-description">블록을 맞춰서 점수를 획득하세요!</p>
                <div class="modal-buttons">
                    <button class="btn-start" id="game-start-btn">게임 시작</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        this.gameStartModal = modal;
        
        // 버튼 클릭 이벤트 직접 등록 (onclick 대신)
        setTimeout(() => {
            const startButton = modal.querySelector('#game-start-btn');
            if (startButton) {
                console.log('Registering click event for start button');
                console.log('hasGameLoader:', !!window.gameLoader);
                console.log('hasGameInstance:', !!(window.gameLoader?.gameInstance));
                console.log('hasSelf:', !!self);
                
                startButton.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('Start button clicked!');
                    
                    if (window.gameLoader && window.gameLoader.gameInstance) {
                        console.log('Using window.gameLoader.gameInstance.startGame()');
                        window.gameLoader.gameInstance.startGame();
                    } else if (self && typeof self.startGame === 'function') {
                        console.log('Using self.startGame()');
                        self.startGame();
                    } else {
                        console.error('Game instance not found');
                        alert('게임을 시작할 수 없습니다. 페이지를 새로고침해주세요.');
                    }
                }, { once: true });
            } else {
                console.error('Start button not found in modal');
            }
        }, 100);
    }

    /**
     * 게임 시작 (모달에서 호출)
     */
    startGame() {
        if (this.gameStartModal) {
            this.gameStartModal.remove();
            this.gameStartModal = null;
        }
        
        // 게임 시작
        this.isPaused = false;
        this.startTimer();
        this.startHintTimer();
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
                <p class="combo-info">최대 콤보: ${this.maxCombo}X</p>
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
        if (this.hintTimeout) {
            this.scene.time.removeEvent(this.hintTimeout);
        }
        if (this.comboResetTimer) {
            this.scene.time.removeEvent(this.comboResetTimer);
            this.comboResetTimer = null;
        }
        
        this.score = 0;
        this.comboCount = 0;
        this.maxCombo = 0;
        this.moves = 0; // 이동 횟수 초기화
        this.gameStartTime = Date.now(); // 게임 시작 시간 재설정
        
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
                this.timeRemaining = (gameConfig && gameConfig.time_limit) ? parseInt(gameConfig.time_limit) : 60;
                this.initialTimeLimit = this.timeRemaining; // 초기 시간 제한 저장
            } catch (e) {
                this.timeRemaining = 60;
                this.initialTimeLimit = 60;
            }
        } else {
            this.timeRemaining = 60;
            this.initialTimeLimit = 60;
        }
        
        this.isPaused = false;
        this.isProcessing = false;
        this.selectedTile = null;
        this.draggedTile = null;
        this.hintMove = null;

        // 보드 초기화
        for (let row = 0; row < this.boardSize; row++) {
            for (let col = 0; col < this.boardSize; col++) {
                if (this.board[row] && this.board[row][col] && this.board[row][col].container) {
                    const tile = this.board[row][col];
                    // 컨테이너 내부 요소들을 명시적으로 제거
                    if (tile.background) {
                        tile.background.destroy();
                    }
                    if (tile.imageSprite) {
                        tile.imageSprite.destroy();
                    }
                    if (tile.border) {
                        tile.border.destroy();
                    }
                    // 컨테이너 제거
                    tile.container.destroy();
                }
            }
        }

        this.createBoard();
        this.scoreText.setText('0');
        this.updateTimeDisplay();
        
        // 다시 하기 시 바로 게임 시작 (모달 없이)
        this.isPaused = false;
        this.startTimer();
        this.startHintTimer();
        
        // 게임 설정 다시 로드
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
                if (gameConfig && typeof gameConfig === 'object') {
                    if (gameConfig.match_points) this.matchPoints = parseInt(gameConfig.match_points);
                    if (gameConfig.combo_multipliers && typeof gameConfig.combo_multipliers === 'object') {
                        this.comboMultipliers = gameConfig.combo_multipliers;
                    }
                    if (gameConfig.combo_reset_time) this.comboResetTime = parseInt(gameConfig.combo_reset_time);
                }
            } catch (e) {
                console.error('게임 설정 재로드 오류:', e);
            }
        }
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
        // 실제 경과 시간 계산: 초기 시간 제한 - 남은 시간
        const elapsedTime = this.initialTimeLimit - this.timeRemaining;
        
        // 레벨 계산: 0~10은 레벨 1, 11~20은 레벨 2, 21~30은 레벨 3...
        // moves가 0이면 레벨 1, moves가 10이면 레벨 1, moves가 11이면 레벨 2
        const level = this.moves === 0 ? 1 : Math.floor((this.moves - 1) / 10) + 1;
        
        // 로그인 여부 확인 (비회원은 점수 저장 안됨)
        const isLogged = this.config.is_logged !== false && this.config.is_logged !== undefined;
        if (!isLogged) {
            console.log('비회원은 점수가 저장되지 않습니다.');
            return;
        }

        const params = {
            game_id: this.config.game_id,
            score: this.score,
            level: level,
            moves: this.moves,
            time: elapsedTime
        };

        exec_json(
            'cj_game.procCj_gameSaveScore',
            params,
            function(ret) {
                console.log('점수 저장 완료:', ret);
            },
            function(error) {
                console.error('점수 저장 오류:', error);
            }
        );
    }

    /**
     * 업데이트
     */
    update() {
        // 게임 루프
    }

    /**
     * 게임 파괴
     */
    destroy() {
        if (this.hintTimeout) {
            this.scene.time.removeEvent(this.hintTimeout);
        }
        if (this.timer) {
            this.timer.remove();
        }
        if (this.comboResetTimer) {
            this.scene.time.removeEvent(this.comboResetTimer);
        }
        if (this.gameStartModal) {
            this.gameStartModal.remove();
            this.gameStartModal = null;
        }
        if (this.gameEndModal) {
            this.gameEndModal.remove();
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
window.GameFactory.match3 = Match3Game;
