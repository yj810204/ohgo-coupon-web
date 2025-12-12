/**
 * 플래피 버드 게임 (Phaser3)
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
            }
        } else {
            devtoolsOpen = false;
        }
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
        // 보안 초기화 실패 시에도 게임은 계속 로드되도록 함
        // throw error;
    }
})();

// ============================================
// 게임 코드 시작
// ============================================
class FlappyBirdGame {
    constructor(config) {
        this.config = config;
        this.game = null;
        this.scene = null;
        this.score = 0;
        this.isPaused = true;
        this.isGameOver = false;
        this.isFalling = false; // 버드가 떨어지는 중인지 여부
        this.lives = 3; // 생명 (기본 3개)
        this.isInvincible = false; // 무적 상태 여부
        this.invincibleTimer = null; // 무적 상태 타이머
        this.gameStartTime = null;
        
        // 게임 설정 기본값
        this.gravity = config.gravity || 800;
        this.jumpVelocity = config.jump_velocity || -400;
        this.pipeSpacing = config.pipe_spacing || 300;
        this.pipeSpeed = config.pipe_speed || 120;
        this.pipeGap = config.pipe_gap || 200; // 버드 크기 증가에 맞춰 간격 확대 (기본: 200)
        this.pipeWidth = config.pipe_width || 60;
        this.birdSize = config.bird_size || 80; // 2배 크기 (기본: 80)
        
        // 레벨 시스템
        this.currentLevel = 1;
        this.basePipeSpeed = config.pipe_speed || 120; // 기본 속도 저장
        
        // 코인 설정
        this.coinBonusScore = config.coin_bonus_score || 5; // 코인 획득 시 추가 점수
        this.coinImagePath = null; // 코인 이미지 경로
        this.coinSize = 60; // 코인 크기 (2배 크기, 기본: 60)
        
        // 버드 이미지 설정
        this.birdImagePath = null; // 버드 이미지 경로
        
        // 파이프 이미지 설정
        this.pipeImagePath = null; // 파이프 이미지 경로 (중간 부분, 반복)
        this.pipeTopImagePath = null; // 파이프 상단 이미지 경로
        this.pipeBottomImagePath = null; // 파이프 하단 이미지 경로
        
        // 배경 이미지 설정
        this.backgroundImagePath = null; // 배경 이미지 경로
        
        // 게임 오브젝트
        this.bird = null;
        this.birdShadow = null; // 새 그림자
        this.pipes = [];
        this.coins = []; // 코인 배열
        this.scoreText = null;
        this.timeText = null;
        this.elapsedTimeTimer = null;
        this.elapsedSeconds = 0;
        this.gameStartModal = null;
        this.gameEndModal = null;
        this.canvasWidth = 600;
        this.canvasHeight = 700;
        this.lastPipeX = 0;
        this.pipesPassed = 0;
        this.uiPanelBottom = 0;
        this.levelText = null; // 레벨업 애니메이션용 텍스트
        this.pipeCount = 0; // 파이프 생성 카운터 (코인 생성용)
        this.lastJumpTime = 0; // 마지막 점프 시간 (터치 유지 시 연속 점프용)
        this.jumpInterval = 100; // 터치 유지 시 점프 간격 (밀리초)
        this.isMobileDevice = false; // 모바일 장치 여부
    }

    /**
     * 게임 시작
     */
    start(containerId) {
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
                            // JSON 파싱 실패
                        }
                    }
                } else {
                    gameConfig = configJson;
                }
            } catch (e) {
                // 게임 설정 파싱 오류
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
        
        // 게임 설정에서 이미지 경로 로드 (preload 전에 설정되어야 함)
        if (gameConfig && typeof gameConfig === 'object') {
            if (gameConfig.bird_image_path) {
                this.birdImagePath = gameConfig.bird_image_path;
            }
            if (gameConfig.coin_image_path) this.coinImagePath = gameConfig.coin_image_path;
            if (gameConfig.pipe_image_path) this.pipeImagePath = gameConfig.pipe_image_path;
            if (gameConfig.pipe_top_image_path) this.pipeTopImagePath = gameConfig.pipe_top_image_path;
            if (gameConfig.pipe_bottom_image_path) this.pipeBottomImagePath = gameConfig.pipe_bottom_image_path;
            if (gameConfig.background_image_path) {
                this.backgroundImagePath = gameConfig.background_image_path;
            }
            if (gameConfig.coin_bonus_score !== undefined) this.coinBonusScore = parseInt(gameConfig.coin_bonus_score) || this.coinBonusScore;
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
                    gravity: { y: this.gravity },
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
        // 버드 이미지 로드
        if (this.birdImagePath) {
            let imagePath = this.birdImagePath.trim();
            const gamePath = this.config.game_path || 'games/flappy_bird';
            
            // 경로 처리 (match3, bubble_shooter와 동일한 로직)
            if (imagePath.startsWith('http://') || imagePath.startsWith('https://') || imagePath.startsWith('/')) {
                // 절대 경로는 그대로 사용
            } else if (imagePath.startsWith('./')) {
                // ./로 시작하는 상대 경로는 그대로 사용 (이미 전체 경로)
            } else if (imagePath.startsWith('games/')) {
                // games/로 시작하는 경우 모듈 경로 추가
                const gamePathParts = gamePath.split('/');
                const modulePath = gamePathParts.slice(0, -2).join('/'); // ./modules/cj_game
                imagePath = modulePath + '/' + imagePath;
            } else {
                // 상대 경로인 경우 game_path 추가
                imagePath = gamePath + '/' + imagePath;
            }
            
            try {
                // 다른 게임들(bubble_shooter, match3)과 동일하게 사용
                this.game.scene.scenes[0].load.image('bird', imagePath);
            } catch (e) {
                // 이미지 로드 실패는 조용히 처리
            }
        }
        
        // 코인 이미지 로드
        if (this.coinImagePath) {
            let imagePath = this.coinImagePath.trim();
            const gamePath = this.config.game_path || 'games/flappy_bird';
            
            // 경로 처리 (match3, bubble_shooter와 동일한 로직)
            if (imagePath.startsWith('http://') || imagePath.startsWith('https://') || imagePath.startsWith('/')) {
                // 절대 경로는 그대로 사용
            } else if (imagePath.startsWith('./')) {
                // ./로 시작하는 상대 경로는 그대로 사용 (이미 전체 경로)
            } else if (imagePath.startsWith('games/')) {
                // games/로 시작하는 경우 모듈 경로 추가
                const gamePathParts = gamePath.split('/');
                const modulePath = gamePathParts.slice(0, -2).join('/'); // ./modules/cj_game
                imagePath = modulePath + '/' + imagePath;
            } else {
                // 상대 경로인 경우 game_path 추가
                imagePath = gamePath + '/' + imagePath;
            }
            
            try {
                // 다른 게임들(bubble_shooter, match3)과 동일하게 사용
                this.game.scene.scenes[0].load.image('coin', imagePath);
            } catch (e) {
                // 코인 이미지 로드 실패는 조용히 처리
            }
        }
        
        // 파이프 이미지 로드
        if (this.pipeImagePath) {
            let imagePath = this.pipeImagePath.trim();
            const gamePath = this.config.game_path || 'games/flappy_bird';
            
            // 경로 처리 (match3, bubble_shooter와 동일한 로직)
            if (imagePath.startsWith('http://') || imagePath.startsWith('https://') || imagePath.startsWith('/')) {
                // 절대 경로는 그대로 사용
            } else if (imagePath.startsWith('./')) {
                // ./로 시작하는 상대 경로는 그대로 사용 (이미 전체 경로)
            } else if (imagePath.startsWith('games/')) {
                // games/로 시작하는 경우 모듈 경로 추가
                const gamePathParts = gamePath.split('/');
                const modulePath = gamePathParts.slice(0, -2).join('/'); // ./modules/cj_game
                imagePath = modulePath + '/' + imagePath;
            } else {
                // 상대 경로인 경우 game_path 추가
                imagePath = gamePath + '/' + imagePath;
            }
            
            try {
                // 다른 게임들(bubble_shooter, match3)과 동일하게 사용
                this.game.scene.scenes[0].load.image('pipe', imagePath);
                
                // 이미지 로드 완료 이벤트 리스너
                this.game.scene.scenes[0].load.once('filecomplete-image-pipe', () => {
                    // 이미지 로드 완료 확인
                });
                
                // 이미지 로드 실패 이벤트 리스너
                this.game.scene.scenes[0].load.once('loaderror', (file) => {
                    if (file && file.key === 'pipe') {
                        console.warn('파이프 이미지 로드 실패:', imagePath);
                    }
                });
            } catch (e) {
                console.warn('파이프 이미지 로드 오류:', imagePath, e);
            }
        }
        
        // 파이프 상단 이미지 로드
        if (this.pipeTopImagePath) {
            let imagePath = this.pipeTopImagePath.trim();
            const gamePath = this.config.game_path || 'games/flappy_bird';
            
            // 경로 처리 (match3, bubble_shooter와 동일한 로직)
            if (imagePath.startsWith('http://') || imagePath.startsWith('https://') || imagePath.startsWith('/')) {
                // 절대 경로는 그대로 사용
            } else if (imagePath.startsWith('./')) {
                // ./로 시작하는 상대 경로는 그대로 사용 (이미 전체 경로)
            } else if (imagePath.startsWith('games/')) {
                // games/로 시작하는 경우 모듈 경로 추가
                const gamePathParts = gamePath.split('/');
                const modulePath = gamePathParts.slice(0, -2).join('/'); // ./modules/cj_game
                imagePath = modulePath + '/' + imagePath;
            } else {
                // 상대 경로인 경우 game_path 추가
                imagePath = gamePath + '/' + imagePath;
            }
            
            try {
                this.game.scene.scenes[0].load.image('pipe_top', imagePath);
            } catch (e) {
                console.warn('파이프 상단 이미지 로드 오류:', imagePath, e);
            }
        }
        
        // 파이프 하단 이미지 로드
        if (this.pipeBottomImagePath) {
            let imagePath = this.pipeBottomImagePath.trim();
            const gamePath = this.config.game_path || 'games/flappy_bird';
            
            // 경로 처리 (match3, bubble_shooter와 동일한 로직)
            if (imagePath.startsWith('http://') || imagePath.startsWith('https://') || imagePath.startsWith('/')) {
                // 절대 경로는 그대로 사용
            } else if (imagePath.startsWith('./')) {
                // ./로 시작하는 상대 경로는 그대로 사용 (이미 전체 경로)
            } else if (imagePath.startsWith('games/')) {
                // games/로 시작하는 경우 모듈 경로 추가
                const gamePathParts = gamePath.split('/');
                const modulePath = gamePathParts.slice(0, -2).join('/'); // ./modules/cj_game
                imagePath = modulePath + '/' + imagePath;
            } else {
                // 상대 경로인 경우 game_path 추가
                imagePath = gamePath + '/' + imagePath;
            }
            
            try {
                this.game.scene.scenes[0].load.image('pipe_bottom', imagePath);
            } catch (e) {
                console.warn('파이프 하단 이미지 로드 오류:', imagePath, e);
            }
        }
        
        // 배경 이미지 로드 (PNG만)
        if (this.backgroundImagePath) {
            let imagePath = this.backgroundImagePath.trim();
            const gamePath = this.config.game_path || 'games/flappy_bird';
            
            // 경로 처리 (match3, bubble_shooter와 동일한 로직)
            if (imagePath.startsWith('http://') || imagePath.startsWith('https://') || imagePath.startsWith('/')) {
                // 절대 경로는 그대로 사용
            } else if (imagePath.startsWith('./')) {
                // ./로 시작하는 상대 경로는 그대로 사용 (이미 전체 경로)
            } else if (imagePath.startsWith('games/')) {
                // games/로 시작하는 경우 모듈 경로 추가
                const gamePathParts = gamePath.split('/');
                const modulePath = gamePathParts.slice(0, -2).join('/'); // ./modules/cj_game
                imagePath = modulePath + '/' + imagePath;
            } else {
                // 상대 경로인 경우 game_path 추가
                imagePath = gamePath + '/' + imagePath;
            }
            
            console.log('배경 이미지 로드 시도:', imagePath);
            
            try {
                this.game.scene.scenes[0].load.image('background', imagePath);
                this.game.scene.scenes[0].load.once('filecomplete-image-background', () => {
                    console.log('배경 이미지 로드 완료:', imagePath);
                });
                this.game.scene.scenes[0].load.once('loaderror', (file) => {
                    if (file && file.key === 'background') {
                        console.error('배경 이미지 로드 실패:', imagePath, file);
                    }
                });
            } catch (e) {
                console.error('배경 이미지 로드 오류:', imagePath, e);
            }
        } else {
            console.log('배경 이미지 경로가 설정되지 않음');
        }
    }

    /**
     * 게임 생성
     */
    create() {
        this.scene = this.game.scene.scenes[0];
        this.gameStartTime = Date.now();
        
        // 모바일 장치 감지
        this.isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                              (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) ||
                              ('ontouchstart' in window);
        
        // 게임 설정 로드 (어드민 설정)
        this.loadGameConfig();
        
        // 배경 생성 (다음 프레임에서 실행하여 게임이 완전히 초기화된 후에 배경 추가)
        this.scene.time.delayedCall(0, () => {
            this.createBackground();
        });
        
        // UI 생성 (먼저 생성하여 패널 높이 확인)
        this.createUI();
        
        // 새 생성
        this.createBird();
        
        // 바닥과 천장 생성
        this.createGround();
        this.createCeiling();
        
        // 입력 이벤트
        this.setupInput();
        
        // 파이프 타이머
        this.lastPipeX = this.canvasWidth + 100;
        
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
                            gameConfig = null;
                        }
                    }
                }
                
                if (gameConfig && typeof gameConfig === 'object') {
                    if (gameConfig.pipe_speed !== undefined) this.pipeSpeed = parseInt(gameConfig.pipe_speed) || this.pipeSpeed;
                    if (gameConfig.pipe_spacing !== undefined) this.pipeSpacing = parseInt(gameConfig.pipe_spacing) || this.pipeSpacing;
                    if (gameConfig.pipe_gap !== undefined) this.pipeGap = parseInt(gameConfig.pipe_gap) || this.pipeGap;
                    if (gameConfig.coin_bonus_score !== undefined) this.coinBonusScore = parseInt(gameConfig.coin_bonus_score) || this.coinBonusScore;
                    // 이미지 경로는 start()에서 이미 설정됨 (preload 전에 필요)
                }
            } catch (e) {
                // 게임 설정 파싱 오류
            }
        }
    }

    /**
     * 배경 생성
     */
    createBackground() {
        // 배경 이미지가 있으면 표시, 없으면 기본 색상 사용
        const hasBackgroundImage = this.backgroundImagePath && this.scene && this.scene.textures && this.scene.textures.exists('background');
        
        if (this.backgroundImagePath && hasBackgroundImage) {
            // 배경 이미지를 세로 길이 기준으로 화면에 가득 차게 조정
            try {
                const texture = this.scene.textures.get('background');
                if (texture && texture.source && texture.source[0]) {
                    const sourceImage = texture.source[0];
                    const originalWidth = sourceImage.width || texture.width || this.canvasWidth;
                    const originalHeight = sourceImage.height || texture.height || this.canvasHeight;
                    
                    // 세로 길이 기준으로 스케일 계산 (화면에 가득 차게)
                    const scaleY = this.canvasHeight / originalHeight;
                    
                    // TileSprite 생성 (가로 반복, 세로는 게임 높이에 맞춤)
                    const bgTile = this.scene.add.tileSprite(0, 0, this.canvasWidth, this.canvasHeight, 'background');
                    bgTile.setOrigin(0, 0);
                    bgTile.setDepth(0);
                    
                    // 타일 스케일 설정 (세로는 scaleY, 가로는 반복을 위해 동일한 스케일 사용)
                    bgTile.setTileScale(scaleY, scaleY);
                    
                    this.backgroundSprite = bgTile;
                    console.log('배경 이미지 생성 완료 (세로 기준 가득 차게):', {
                        originalSize: { width: originalWidth, height: originalHeight },
                        gameSize: { width: this.canvasWidth, height: this.canvasHeight },
                        scaleY: scaleY
                    });
                } else {
                    // 텍스처 정보를 가져올 수 없으면 기본 TileSprite 사용
                    const bg = this.scene.add.tileSprite(0, 0, this.canvasWidth, this.canvasHeight, 'background');
                    bg.setOrigin(0, 0);
                    bg.setDepth(0);
                    bg.setTileScale(1, 1);
                    this.backgroundSprite = bg;
                    console.log('배경 이미지 TileSprite 생성 완료 (기본)');
                }
            } catch (e) {
                console.error('배경 이미지 생성 오류:', e);
                // 오류 발생 시 기본 TileSprite 사용
                const bg = this.scene.add.tileSprite(0, 0, this.canvasWidth, this.canvasHeight, 'background');
                bg.setOrigin(0, 0);
                bg.setDepth(0);
                bg.setTileScale(1, 1);
                this.backgroundSprite = bg;
            }
        } else {
            // 기본 하늘 배경
            const bg = this.scene.add.rectangle(0, 0, this.canvasWidth, this.canvasHeight, 0x87CEEB);
            bg.setOrigin(0, 0);
            bg.setDepth(0);
            console.log('기본 배경 색상 사용');
        }
    }

    /**
     * 새 생성
     */
    createBird() {
        const birdX = this.canvasWidth / 4;
        // UI 패널 아래에 배치
        const birdY = (this.uiPanelBottom > 0 ? this.uiPanelBottom + 100 : this.canvasHeight / 2);
        
        // 버드 이미지가 있으면 이미지 사용, 없으면 원형으로 생성
        if (this.birdImagePath && this.scene.textures.exists('bird')) {
            this.bird = this.scene.add.image(birdX, birdY, 'bird');
            this.bird.setDisplaySize(this.birdSize, this.birdSize);
            this.bird.setDepth(10);
        } else {
            // 새를 원형으로 생성
            this.bird = this.scene.add.circle(birdX, birdY, this.birdSize / 2, 0xFFD700);
            this.bird.setStrokeStyle(2, 0xFFA500, 1);
            this.bird.setDepth(10);
        }
        
        // 물리 바디 추가
        this.scene.physics.add.existing(this.bird);
        this.bird.body.setCollideWorldBounds(true);
        // 게임 시작 전에는 중력 비활성화 (게임 시작 시 활성화됨)
        this.bird.body.setGravityY(0);
        this.bird.body.setVelocity(0, 0);
        this.bird.body.setImmovable(false);
        // 충돌 감지 정확도를 위해 바디 크기를 약간 줄임 (시각적 크기의 85%)
        const bodySize = (this.birdSize / 2) * 0.85;
        this.bird.body.setCircle(bodySize);
        
        // 바닥에 그림자 생성 (반투명)
        const groundHeight = 50;
        const groundYTop = this.canvasHeight - groundHeight; // 바닥의 상단 Y 위치
        const shadowY = groundYTop + 30; // 바닥 상단에 그림자 배치
        const shadowSize = this.birdSize * 0.6; // 그림자 크기는 새의 60%
        
        this.birdShadow = this.scene.add.ellipse(birdX, shadowY, shadowSize, shadowSize * 0.4, 0x000000);
        this.birdShadow.setAlpha(0.4); // 반투명 효과
        this.birdShadow.setDepth(5.5); // 바닥 위에 겹쳐서 표시 (바닥 depth: 5보다 높게)
        this.birdShadow.setVisible(true); // 명시적으로 표시
    }
    
    /**
     * 그림자 위치 업데이트
     */
    updateShadow() {
        if (this.bird && this.birdShadow) {
            const groundHeight = 50;
            const groundYTop = this.canvasHeight - groundHeight; // 바닥의 상단 Y 위치
            const shadowY = groundYTop + 30; // 바닥 상단에 그림자 배치
            
            // 새의 X 위치에 따라 그림자 X 위치 업데이트
            this.birdShadow.setX(this.bird.x);
            this.birdShadow.setY(shadowY);
            
            // 새의 높이에 따라 그림자 크기 조정 (바닥에 가까울수록 그림자가 커짐)
            const birdY = this.bird.y;
            const ceilingHeight = 70;
            const playableTop = ceilingHeight; // 천장의 하단
            
            // 높이 비율 계산 (0: 천장에 가까움, 1: 바닥에 가까움)
            // birdY가 작을수록 (천장에 가까울수록) heightRatio는 0에 가까움
            // birdY가 클수록 (바닥에 가까울수록) heightRatio는 1에 가까움
            const heightRange = groundYTop - playableTop;
            const heightRatio = heightRange > 0 ? Math.max(0, Math.min(1, (birdY - playableTop) / heightRange)) : 0;
            
            // 높이에 따라 그림자 크기 조정 (바닥에 가까울수록 커짐)
            const baseShadowSize = this.birdSize * 0.6;
            const minShadowSize = baseShadowSize * 0.3; // 최소 크기 (30% - 천장에 가까울 때, heightRatio = 0)
            const maxShadowSize = baseShadowSize; // 최대 크기 (100% - 바닥에 가까울 때, heightRatio = 1)
            // heightRatio가 0일 때 (천장) minShadowSize, 1일 때 (바닥) maxShadowSize
            const shadowSize = minShadowSize + (maxShadowSize - minShadowSize) * heightRatio;
            this.birdShadow.setSize(shadowSize, shadowSize * 0.4);
            
            // 높이에 따라 그림자 투명도 조정 (바닥에 가까울수록 진함)
            const minAlpha = 0.1; // 최소 투명도 (10% - 천장에 가까울 때, heightRatio = 0)
            const maxAlpha = 0.4; // 최대 투명도 (40% - 바닥에 가까울 때, heightRatio = 1)
            // heightRatio가 0일 때 (천장) minAlpha, 1일 때 (바닥) maxAlpha
            const alpha = minAlpha + (maxAlpha - minAlpha) * heightRatio;
            this.birdShadow.setAlpha(alpha);
            
            // 그림자가 항상 보이도록 설정
            this.birdShadow.setVisible(true);
        }
    }

    /**
     * 바닥 생성
     */
    createGround() {
        const groundHeight = 50;
        const groundY = this.canvasHeight - groundHeight / 2;
        
        this.ground = this.scene.add.rectangle(
            this.canvasWidth / 2,
            groundY,
            this.canvasWidth,
            groundHeight,
            0x228B22
        );
        this.ground.setDepth(5);
        
        // 물리 바디 추가
        this.scene.physics.add.existing(this.ground, true);
        this.ground.body.setSize(this.canvasWidth, groundHeight);
    }

    /**
     * 천장 생성
     */
    createCeiling() {
        const ceilingHeight = 70;
        const ceilingY = ceilingHeight / 2;
        
        this.ceiling = this.scene.add.rectangle(
            this.canvasWidth / 2,
            ceilingY,
            this.canvasWidth,
            ceilingHeight,
            0x4682B4
        );
        this.ceiling.setDepth(5);
        
        // 물리 바디 추가
        this.scene.physics.add.existing(this.ceiling, true);
        this.ceiling.body.setSize(this.canvasWidth, ceilingHeight);
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
        
        // UI 패널 배경
        this.uiPanelBg = this.scene.add.rectangle(panelX + panelWidth/2, panelY + panelHeight/2, panelWidth, panelHeight, 0xffffff);
        this.uiPanelBg.setAlpha(0.95);
        this.uiPanelBg.setStrokeStyle(2, 0x4CAF50, 1);
        this.uiPanelBg.setDepth(10); // 천장(depth 5)보다 앞에 표시
        
        this.uiPanelBottom = panelY + panelHeight;
        
        // 점수 UI
        const scoreCardWidth = Math.max(120 * scale, 100);
        const scoreCardHeight = Math.max(48 * scale, 40);
        const scoreCardX = panelX + Math.max(15 * scale, 10);
        const scoreCardY = panelY + panelHeight/2;
        
        this.scoreCardBg = this.scene.add.rectangle(scoreCardX + scoreCardWidth/2, scoreCardY, scoreCardWidth, scoreCardHeight, 0x2196F3);
        this.scoreCardBg.setAlpha(0.9);
        this.scoreCardBg.setDepth(11); // UI 패널 배경(depth 10)보다 앞에 표시
        this.scoreCardBg.setStrokeStyle(2, 0x1976D2, 1);
        
        this.scoreLabel = this.scene.add.text(scoreCardX + Math.max(10 * scale, 8), scoreCardY - scoreCardHeight/3, '점수', {
            fontSize: labelFontSize + 'px',
            fill: '#ffffff',
            fontFamily: 'Arial, sans-serif',
            fontWeight: 'bold'
        });
        this.scoreLabel.setDepth(12); // 점수 카드 배경(depth 11)보다 앞에 표시
        
        this.scoreText = this.scene.add.text(scoreCardX + Math.max(10 * scale, 8), scoreCardY - 5, '0', {
            fontSize: valueFontSize + 'px',
            fill: '#ffffff',
            fontFamily: 'Arial, sans-serif',
            fontWeight: 'bold'
        });
        this.scoreText.setDepth(12); // 점수 카드 배경(depth 11)보다 앞에 표시
        
        // 경과 시간 UI
        const timeCardWidth = Math.max(120 * scale, 100);
        const timeCardHeight = Math.max(48 * scale, 40);
        const timeCardX = panelX + panelWidth - timeCardWidth - Math.max(15 * scale, 10);
        const timeCardY = panelY + panelHeight/2;
        
        this.timeCardBg = this.scene.add.rectangle(timeCardX + timeCardWidth/2, timeCardY, timeCardWidth, timeCardHeight, 0xFF6B35);
        this.timeCardBg.setAlpha(0.95);
        this.timeCardBg.setDepth(11); // UI 패널 배경(depth 10)보다 앞에 표시
        this.timeCardBg.setStrokeStyle(2, 0xE55A2B, 1);
        
        this.timeLabel = this.scene.add.text(timeCardX + Math.max(10 * scale, 8), timeCardY - timeCardHeight/3, '경과 시간', {
            fontSize: labelFontSize + 'px',
            fill: '#ffffff',
            fontFamily: 'Arial, sans-serif',
            fontWeight: 'bold'
        });
        this.timeLabel.setDepth(12); // 시간 카드 배경(depth 11)보다 앞에 표시
        
        this.timeText = this.scene.add.text(timeCardX + Math.max(10 * scale, 8), timeCardY - 5, '0:00', {
            fontSize: valueFontSize + 'px',
            fill: '#FFFFFF',
            fontFamily: 'Arial, sans-serif',
            fontWeight: 'bold'
        });
        this.timeText.setDepth(12); // 시간 카드 배경(depth 11)보다 앞에 표시
        
        this.updateElapsedTimeDisplay();
        
        // 생명 게이지 UI (중앙에 배치) - 3칸 아이콘
        const livesCardWidth = Math.max(120 * scale, 100);
        const livesCardHeight = Math.max(48 * scale, 40);
        const livesCardX = panelX + panelWidth / 2 - livesCardWidth / 2;
        const livesCardY = panelY + panelHeight / 2;
        
        this.livesCardBg = this.scene.add.rectangle(livesCardX + livesCardWidth / 2, livesCardY, livesCardWidth, livesCardHeight, 0xFF1744);
        this.livesCardBg.setAlpha(0.95);
        this.livesCardBg.setDepth(11); // UI 패널 배경(depth 10)보다 앞에 표시
        this.livesCardBg.setStrokeStyle(2, 0xD50000, 1);
        
        this.livesLabel = this.scene.add.text(livesCardX + Math.max(10 * scale, 8), livesCardY - livesCardHeight / 3, '생명', {
            fontSize: labelFontSize + 'px',
            fill: '#ffffff',
            fontFamily: 'Arial, sans-serif',
            fontWeight: 'bold'
        });
        this.livesLabel.setDepth(12); // 생명 카드 배경(depth 11)보다 앞에 표시
        
        // 생명 아이콘 배열 (3개) - 꽉 찬 사각형 (글자 아래에 배치, '생' 자와 X 위치 일치)
        this.livesIcons = [];
        
        // 생명 값이 없으면 기본값 3으로 설정
        if (this.lives === undefined || this.lives === null) {
            this.lives = 3;
        }
        
        const iconSize = Math.max(14 * scale, 10);
        const iconSpacing = Math.max(18 * scale, 14);
        const iconStartX = livesCardX + Math.max(10 * scale, 8) + 5; // '생' 자와 동일한 X 위치 + 왼쪽 패딩 5
        const iconY = livesCardY + 8; // 글자 아래로 이동
        
        for (let i = 0; i < 3; i++) {
            // 꽉 찬 사각형 아이콘
            const icon = this.scene.add.rectangle(iconStartX + i * iconSpacing, iconY, iconSize, iconSize, 0xffffff);
            icon.setStrokeStyle(2, 0xffffff, 1);
            icon.setFillStyle(0xffffff, 1); // 꽉 찬 사각형
            icon.setDepth(12);
            this.livesIcons.push(icon);
        }
        
        this.updateLivesDisplay();
        
        // 레벨업 애니메이션용 텍스트 (화면 중앙)
        const levelFontSize = Math.max(48 * scale, 36);
        const levelX = this.canvasWidth / 2;
        const levelY = this.canvasHeight / 2;
        this.levelText = this.scene.add.text(levelX, levelY, '', {
            fontSize: levelFontSize + 'px',
            fill: '#FFD700',
            fontFamily: 'Arial, sans-serif',
            fontWeight: 'bold',
            stroke: '#000000',
            strokeThickness: 4
        });
        this.levelText.setVisible(false);
        this.levelText.setOrigin(0.5);
        this.levelText.setDepth(1000); // 항상 최상위에 표시
    }

    /**
     * 생명 표시 업데이트 (3칸 아이콘)
     */
    updateLivesDisplay() {
        if (this.livesIcons && this.livesIcons.length > 0) {
            // 생명 값이 없으면 기본값 3으로 설정
            const currentLives = (this.lives !== undefined && this.lives !== null) ? this.lives : 3;
            
            for (let i = 0; i < 3; i++) {
                if (this.livesIcons[i]) {
                    // 생명 수보다 많은 칸은 빈 사각형으로 변경
                    if (i < currentLives) {
                        // 꽉 찬 사각형
                        this.livesIcons[i].setFillStyle(0xffffff, 1);
                        this.livesIcons[i].setStrokeStyle(2, 0xffffff, 1);
                        this.livesIcons[i].setVisible(true);
                    } else {
                        // 빈 사각형 (테두리만)
                        this.livesIcons[i].setFillStyle(0xffffff, 0);
                        this.livesIcons[i].setStrokeStyle(2, 0xffffff, 1);
                        this.livesIcons[i].setVisible(true);
                    }
                }
            }
        }
    }

    /**
     * 경과 시간 표시 업데이트
     */
    updateElapsedTimeDisplay() {
        if (this.timeText) {
            const minutes = Math.floor(this.elapsedSeconds / 60);
            const seconds = this.elapsedSeconds % 60;
            this.timeText.setText(`${minutes}:${seconds.toString().padStart(2, '0')}`);
        }
    }

    /**
     * 경과 시간 타이머 시작
     */
    startElapsedTimeTimer() {
        if (this.elapsedTimeTimer) {
            this.elapsedTimeTimer.remove();
        }
        
        this.elapsedSeconds = 0;
        this.updateElapsedTimeDisplay();
        
        this.elapsedTimeTimer = this.scene.time.addEvent({
            delay: 1000,
            callback: () => {
                if (!this.isPaused && !this.isGameOver) {
                    this.elapsedSeconds++;
                    this.updateElapsedTimeDisplay();
                }
            },
            loop: true
        });
    }

    /**
     * 입력 설정
     */
    setupInput() {
        // 마우스 클릭 및 터치 입력 (pointerdown은 데스크톱과 모바일 모두 지원)
        this.scene.input.on('pointerdown', () => {
            if (!this.isPaused && !this.isGameOver && !this.isFalling) {
                this.jump();
            }
        });
    }

    /**
     * 점프
     */
    jump() {
        if (this.bird && this.bird.body) {
            this.bird.body.setVelocityY(this.jumpVelocity);
            
            // 점프 시 회전 애니메이션
            this.scene.tweens.add({
                targets: this.bird,
                angle: -20,
                duration: 100,
                ease: 'Power2',
                yoyo: true
            });
        }
    }

    /**
     * 파이프 생성
     */
    createPipe() {
        const pipeX = this.canvasWidth;
        
        // 지면과 천장 높이 고려 (지면 50픽셀, 천장 70픽셀)
        const groundHeight = 50;
        const ceilingHeight = 70;
        const playableTop = ceilingHeight; // 플레이 가능한 영역 상단
        const playableBottom = this.canvasHeight - groundHeight; // 플레이 가능한 영역 하단
        
        // gapY는 플레이 가능한 영역 내에서만 생성 (천장과 지면 제외)
        const gapY = Phaser.Math.Between(
            playableTop + this.pipeGap / 2 + 20, // 천장 아래 여유 공간
            playableBottom - this.pipeGap / 2 - 20 // 지면 위 여유 공간
        );
        
        // 위쪽 파이프: 천장부터 gapY - pipeGap/2까지 (입체감을 위해 천장 위로 약간 겹치게)
        const overlapAmount = 0; // 천장/바닥과 겹치는 정도 (픽셀)
        const topPipeTop = playableTop - overlapAmount; // 천장 위로 약간 겹치게
        const topPipeBottom = gapY - this.pipeGap / 2;
        const topPipeHeight = topPipeBottom - topPipeTop;
        const topPipeY = topPipeTop + topPipeHeight / 2;
        
        // 파이프 이미지가 있는지 확인 (한 번만 체크)
        const hasPipeImage = this.pipeImagePath && this.scene && this.scene.textures && this.scene.textures.exists('pipe');
        const hasPipeTopImage = this.pipeTopImagePath && this.scene && this.scene.textures && this.scene.textures.exists('pipe_top');
        const hasPipeBottomImage = this.pipeBottomImagePath && this.scene && this.scene.textures && this.scene.textures.exists('pipe_bottom');
        
        // 파이프 이미지가 있으면 원본 이미지 크기 확인하여 타일 스케일 계산
        let pipeTileScaleX = 1;
        let pipeTileScaleY = 1;
        let pipeTopImageHeight = 0;
        let pipeBottomImageHeight = 0;
        
        if (hasPipeImage) {
            try {
                const pipeTexture = this.scene.textures.get('pipe');
                if (pipeTexture && pipeTexture.source && pipeTexture.source[0]) {
                    const sourceImage = pipeTexture.source[0];
                    const originalWidth = sourceImage.width || pipeTexture.width || this.pipeWidth;
                    // 파이프 width에 맞게 타일 스케일 계산 (가로는 파이프 width에 맞춤, 세로는 원본 크기 유지)
                    pipeTileScaleX = this.pipeWidth / originalWidth;
                    pipeTileScaleY = 1; // 세로는 원본 크기로 반복
                }
            } catch (e) {
                // 텍스처 정보 가져오기 실패 시 기본값 사용
                pipeTileScaleX = 1;
                pipeTileScaleY = 1;
            }
        }
        
        // 상단/하단 이미지 높이 확인
        if (hasPipeTopImage) {
            try {
                const pipeTopTexture = this.scene.textures.get('pipe_top');
                if (pipeTopTexture && pipeTopTexture.source && pipeTopTexture.source[0]) {
                    const sourceImage = pipeTopTexture.source[0];
                    const originalWidth = sourceImage.width || pipeTopTexture.width || this.pipeWidth;
                    const originalHeight = sourceImage.height || pipeTopTexture.height || 0;
                    const scaleX = this.pipeWidth / originalWidth;
                    pipeTopImageHeight = originalHeight * scaleX;
                }
            } catch (e) {
                pipeTopImageHeight = 0;
            }
        }
        
        if (hasPipeBottomImage) {
            try {
                const pipeBottomTexture = this.scene.textures.get('pipe_bottom');
                if (pipeBottomTexture && pipeBottomTexture.source && pipeBottomTexture.source[0]) {
                    const sourceImage = pipeBottomTexture.source[0];
                    const originalWidth = sourceImage.width || pipeBottomTexture.width || this.pipeWidth;
                    const originalHeight = sourceImage.height || pipeBottomTexture.height || 0;
                    const scaleX = this.pipeWidth / originalWidth;
                    pipeBottomImageHeight = originalHeight * scaleX;
                }
            } catch (e) {
                pipeBottomImageHeight = 0;
            }
        }
        
        let topPipe;
        // 파이프 이미지가 있으면 Container로 조합, 없으면 rectangle 사용
        // 위쪽 파이프: 천장 → 기둥 반복 → 하단 이미지
        if (hasPipeImage || hasPipeBottomImage) {
            // Container 생성
            topPipe = this.scene.add.container(pipeX, topPipeY);
            // 상단 파이프의 하단 이미지가 천장과 겹칠 때 천장 뒤에 표시되도록 depth를 낮춤
            topPipe.setDepth(4.5);
            
            // Container 내부 좌표계: 위쪽(천장) = -topPipeHeight/2, 아래쪽 = +topPipeHeight/2
            const containerTop = -topPipeHeight / 2;
            const containerBottom = topPipeHeight / 2;
            
            // 중간 이미지 (TileSprite로 반복, 천장부터 하단 이미지 위까지)
            if (hasPipeImage) {
                const middleHeight = topPipeHeight - pipeBottomImageHeight;
                if (middleHeight > 0) {
                    // 천장부터 시작하므로, 원점을 (0.5, 0)으로 설정하고 위치는 containerTop + middleHeight/2
                    const middleY = containerTop + middleHeight / 2;
                    const middleImage = this.scene.add.tileSprite(0, middleY, this.pipeWidth, middleHeight, 'pipe');
                    middleImage.setOrigin(0.5, 0.5);
                    middleImage.setTileScale(pipeTileScaleX, pipeTileScaleY);
                    topPipe.add(middleImage);
                }
            }
            
            // 하단 이미지 (있으면 맨 아래에 배치)
            if (hasPipeBottomImage) {
                // 하단 이미지의 하단이 Container의 하단에 맞춤
                const bottomImageY = containerBottom - pipeBottomImageHeight / 2;
                const bottomImage = this.scene.add.image(0, bottomImageY, 'pipe_bottom');
                bottomImage.setDisplaySize(this.pipeWidth, pipeBottomImageHeight);
                bottomImage.setOrigin(0.5, 0.5);
                topPipe.add(bottomImage);
            }
        } else {
            // 기존 사각형 사용
            topPipe = this.scene.add.rectangle(
                pipeX,
                topPipeY,
                this.pipeWidth,
                topPipeHeight,
                0x8B4513
            );
            topPipe.setStrokeStyle(3, 0x654321, 1);
            // 상단 파이프의 하단 이미지가 천장과 겹칠 때 천장 뒤에 표시되도록 depth를 낮춤
            topPipe.setDepth(4.5);
        }
        
        // 아래쪽 파이프: gapY + pipeGap/2부터 지면까지 (바닥에 겹치지 않도록)
        const bottomPipeTop = gapY + this.pipeGap / 2;
        const bottomPipeBottom = playableBottom; // 지면에 정확히 맞춤 (겹치지 않음)
        const bottomPipeHeight = bottomPipeBottom - bottomPipeTop;
        const bottomPipeY = bottomPipeTop + bottomPipeHeight / 2;
        
        let bottomPipe;
        // 파이프 이미지가 있으면 Container로 조합, 없으면 rectangle 사용
        // 아래쪽 파이프: 바닥 → 상단 이미지 → 기둥 반복 → 지면
        if (hasPipeImage || hasPipeTopImage) {
            // Container 생성
            bottomPipe = this.scene.add.container(pipeX, bottomPipeY);
            // 하단 파이프의 상단 이미지가 바닥과 겹칠 때 바닥 뒤에 표시되도록 depth를 낮춤
            bottomPipe.setDepth(4.5);
            
            // Container 내부 좌표계: 위쪽(바닥) = -bottomPipeHeight/2, 아래쪽(지면) = +bottomPipeHeight/2
            const containerTop = -bottomPipeHeight / 2;
            const containerBottom = bottomPipeHeight / 2;
            
            // 상단 이미지 (있으면 맨 위에 배치 - 바닥 쪽 끝)
            if (hasPipeTopImage) {
                // 상단 이미지의 상단이 Container의 상단에 맞춤
                const topImageY = containerTop + pipeTopImageHeight / 2;
                const topImage = this.scene.add.image(0, topImageY, 'pipe_top');
                topImage.setDisplaySize(this.pipeWidth, pipeTopImageHeight);
                topImage.setOrigin(0.5, 0.5);
                bottomPipe.add(topImage);
            }
            
            // 중간 이미지 (TileSprite로 반복, 상단 이미지 아래부터 지면까지)
            if (hasPipeImage) {
                const middleHeight = bottomPipeHeight - pipeTopImageHeight;
                if (middleHeight > 0) {
                    // 상단 이미지 아래부터 시작하므로, 시작 위치는 containerTop + pipeTopImageHeight
                    const middleStartY = containerTop + pipeTopImageHeight;
                    const middleY = middleStartY + middleHeight / 2;
                    const middleImage = this.scene.add.tileSprite(0, middleY, this.pipeWidth, middleHeight, 'pipe');
                    middleImage.setOrigin(0.5, 0.5);
                    middleImage.setTileScale(pipeTileScaleX, pipeTileScaleY);
                    bottomPipe.add(middleImage);
                }
            }
        } else {
            // 기존 사각형 사용
            bottomPipe = this.scene.add.rectangle(
                pipeX,
                bottomPipeY,
                this.pipeWidth,
                bottomPipeHeight,
                0x8B4513
            );
            bottomPipe.setStrokeStyle(3, 0x654321, 1);
            // 하단 파이프가 바닥과 겹칠 때 바닥 뒤에 표시되도록 depth를 낮춤
            bottomPipe.setDepth(4.5);
        }
        
        // 물리 바디 추가
        // Container에 물리 바디를 추가할 때, Container의 크기를 명시적으로 설정
        if (topPipe.setSize) {
            topPipe.setSize(this.pipeWidth, topPipeHeight);
        }
        // Container의 height 속성을 명시적으로 설정 (충돌 감지에 사용됨)
        if (topPipe.height !== undefined) {
            topPipe.height = topPipeHeight;
        }
        if (topPipe.width !== undefined) {
            topPipe.width = this.pipeWidth;
        }
        
        if (bottomPipe.setSize) {
            bottomPipe.setSize(this.pipeWidth, bottomPipeHeight);
        }
        // Container의 height 속성을 명시적으로 설정 (충돌 감지에 사용됨)
        if (bottomPipe.height !== undefined) {
            bottomPipe.height = bottomPipeHeight;
        }
        if (bottomPipe.width !== undefined) {
            bottomPipe.width = this.pipeWidth;
        }
        
        this.scene.physics.add.existing(topPipe, true);
        this.scene.physics.add.existing(bottomPipe, true);
        topPipe.body.setSize(this.pipeWidth, topPipeHeight);
        bottomPipe.body.setSize(this.pipeWidth, bottomPipeHeight);
        
        // 파이프 객체 저장
        const pipePair = {
            top: topPipe,
            bottom: bottomPipe,
            x: pipeX,
            gapY: gapY,
            passed: false
        };
        
        this.pipes.push(pipePair);
        this.lastPipeX = pipeX;
        
        // 코인은 파이프 생성 시점이 아니라 파이프 사이에 생성됨 (updatePipes에서 처리)
    }
    
    /**
     * 코인 생성 (화면 밖에서 생성되어 흘러오도록)
     */
    createCoin() {
        // 60% 확률로 생성
        if (Math.random() >= 0.6) {
            return;
        }
        
        // 화면 밖(오른쪽)에서 생성되어 왼쪽으로 흘러오도록
        const coinX = this.canvasWidth + 100; // 화면 밖 오른쪽에서 시작
        
        // 화면 전체 높이에서 임의 Y 위치 (천장과 지면, UI 패널 영역 제외)
        const ceilingHeight = 70;
        const groundHeight = 50;
        const coinYMin = ceilingHeight + this.coinSize / 2; // 천장 아래 (반지름 고려)
        const coinYMax = this.canvasHeight - groundHeight - this.coinSize / 2; // 지면 위 (반지름 고려)
        
        // 유효성 검사: coinYMin이 coinYMax보다 크면 코인 생성 불가
        if (coinYMin >= coinYMax) {
            return;
        }
        
        const coinY = Phaser.Math.Between(coinYMin, coinYMax);
        
        let coin;
        
        // 코인 이미지가 있으면 이미지 사용, 없으면 원형으로 생성
        if (this.coinImagePath && this.scene.textures.exists('coin')) {
            coin = this.scene.add.image(coinX, coinY, 'coin');
            coin.setDisplaySize(this.coinSize, this.coinSize);
        } else {
            // 기본 코인 (노란색 원형)
            coin = this.scene.add.circle(coinX, coinY, this.coinSize / 2, 0xFFD700);
            coin.setStrokeStyle(2, 0xFFA500, 1);
        }
        
        coin.setDepth(6);
        
        // 물리 바디 추가
        this.scene.physics.add.existing(coin, true);
        coin.body.setCircle(this.coinSize / 2);
        
        // 코인 객체 저장
        const coinObj = {
            sprite: coin,
            x: coinX,
            y: coinY,
            collected: false
        };
        
        this.coins.push(coinObj);
    }

    /**
     * 파이프 업데이트
     */
    updatePipes() {
        if (this.isPaused || this.isGameOver) {
            return;
        }
        
        // 게임 오버 시 파이프 이동 중지
        if (this.isGameOver) {
            return;
        }
        
        // 떨어지는 중에는 새 파이프 생성하지 않음 (기존 파이프는 계속 이동)
        
        // delta time 기반 속도 계산 (초당 픽셀 이동)
        const delta = this.scene.game.loop.delta;
        const speed = (this.pipeSpeed / 1000) * delta; // 초당 픽셀 속도를 밀리초 기반으로 변환
        
        // 새 파이프 생성 (마지막 파이프가 일정 거리 이내에 있을 때, 떨어지는 중이 아닐 때만)
        if (!this.isFalling && (this.pipes.length === 0 || this.lastPipeX <= this.canvasWidth - this.pipeSpacing)) {
            // 이전 파이프 위치 저장 (코인 생성용)
            const prevPipeX = this.pipes.length > 0 ? this.pipes[this.pipes.length - 1].x : this.canvasWidth;
            
            this.createPipe();
            this.pipeCount++; // 파이프 생성 카운터 증가
            
            // 새 파이프 생성 후, 코인 생성 (파이프 2개마다 시도)
            if (this.pipeCount >= 2 && this.pipeCount % 2 === 0) {
                this.createCoin();
            }
        }
        
        // 파이프 이동 및 제거
        for (let i = this.pipes.length - 1; i >= 0; i--) {
            const pipe = this.pipes[i];
            pipe.x -= speed;
            
            pipe.top.x = pipe.x;
            pipe.bottom.x = pipe.x;
            
            // 점수 체크 (파이프 통과)
            if (!pipe.passed && pipe.x + this.pipeWidth / 2 < this.bird.x - this.birdSize / 2) {
                pipe.passed = true;
                this.pipesPassed++;
                this.score++;
                this.scoreText.setText(this.score.toString());
                
                // 레벨업 체크 (5개 통과할 때마다 레벨 +1)
                if (this.pipesPassed > 0 && this.pipesPassed % 5 === 0) {
                    this.levelUp();
                }
            }
            
            // 화면 밖으로 나간 파이프 제거
            if (pipe.x + this.pipeWidth / 2 < -50) {
                pipe.top.destroy();
                pipe.bottom.destroy();
                this.pipes.splice(i, 1);
            }
        }
        
        // 마지막 파이프 위치 업데이트
        if (this.pipes.length > 0) {
            this.lastPipeX = this.pipes[this.pipes.length - 1].x;
        } else {
            this.lastPipeX = this.canvasWidth + 100;
        }
        
        // 코인 업데이트 (이동 및 제거) - delta와 speed는 위에서 이미 선언됨
        
        for (let i = this.coins.length - 1; i >= 0; i--) {
            const coin = this.coins[i];
            
            // 수집되지 않은 코인만 이동
            if (!coin.collected) {
                coin.x -= speed;
                coin.sprite.x = coin.x;
                
                // 화면 밖으로 나간 코인 제거
                if (coin.x + this.coinSize / 2 < -50) {
                    coin.sprite.destroy();
                    this.coins.splice(i, 1);
                }
            }
        }
    }

    /**
     * 업데이트
     */
    update() {
        // 그림자 위치 업데이트
        this.updateShadow();
        // 일시 정지 중일 때는 새의 물리 비활성화
        if (this.isPaused || this.isGameOver) {
            if (this.bird && this.bird.body) {
                this.bird.body.setVelocity(0, 0);
                this.bird.body.setGravityY(0);
            }
            return;
        }
        
        // 게임이 시작되면 중력 활성화
        if (this.bird && this.bird.body && this.bird.body.gravity.y === 0) {
            this.bird.body.setGravityY(this.gravity);
        }
        
        // 모바일 터치 유지 시 계속 올라가도록 처리 (데스크탑 제외)
        if (!this.isPaused && !this.isGameOver && !this.isFalling && this.scene && this.scene.input && this.isMobileDevice) {
            const currentTime = this.scene.time.now;
            const pointer = this.scene.input.activePointer;
            
            // 터치가 눌려있고, 일정 간격이 지났으면 점프
            if (pointer.isDown && (currentTime - this.lastJumpTime >= this.jumpInterval)) {
                this.jump();
                this.lastJumpTime = currentTime;
            }
        }
        
        // 파이프 업데이트 (게임 오버 시 중지)
        if (!this.isGameOver) {
            this.updatePipes();
        }
        
        // 코인 충돌 체크 (떨어지는 중이 아니고 무적 상태가 아닐 때만)
        if (this.bird && this.bird.body && !this.isGameOver && !this.isFalling && !this.isInvincible) {
            const birdX = this.bird.x;
            const birdY = this.bird.y;
            const birdRadius = (this.birdSize / 2) * 0.85;
            
            for (let i = 0; i < this.coins.length; i++) {
                const coin = this.coins[i];
                
                if (coin.collected || !coin.sprite || !coin.sprite.active) continue;
                
                const coinX = coin.x;
                const coinY = coin.y;
                const coinRadius = this.coinSize / 2;
                
                // 거리 계산
                const dx = birdX - coinX;
                const dy = birdY - coinY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                // 충돌 감지
                if (distance < birdRadius + coinRadius) {
                    // 코인 수집 처리
                    coin.collected = true;
                    this.score += this.coinBonusScore;
                    this.scoreText.setText(this.score.toString());
                    
                    // 코인 제거 애니메이션 (페이드 아웃)
                    if (this.scene && this.scene.tweens) {
                        this.scene.tweens.add({
                            targets: coin.sprite,
                            alpha: 0,
                            scale: 0,
                            duration: 200,
                            ease: 'Power2',
                            onComplete: () => {
                                if (coin.sprite) {
                                    coin.sprite.destroy();
                                }
                                this.coins.splice(i, 1);
                            }
                        });
                    } else {
                        // 애니메이션 없이 즉시 제거
                        coin.sprite.destroy();
                        this.coins.splice(i, 1);
                    }
                    break; // 한 프레임에 하나의 코인만 수집
                }
            }
        }
        
        // 파이프 충돌 체크 (수동 충돌 감지 - bounds 기반, 약간의 여유 공간 허용, 무적 상태가 아닐 때만)
        if (this.bird && this.bird.body && !this.isGameOver && !this.isInvincible) {
            const birdX = this.bird.x;
            const birdY = this.bird.y;
            const birdRadius = (this.birdSize / 2) * 0.85; // 바디 크기 (85%)
            const collisionTolerance = 5; // 충돌 여유 공간 (픽셀) - 약간의 접촉은 허용
            
            for (let i = 0; i < this.pipes.length; i++) {
                const pipe = this.pipes[i];
                
                if (!pipe.top || !pipe.bottom || !pipe.top.active || !pipe.bottom.active) {
                    continue;
                }
                
                const pipeX = pipe.x;
                const pipeHalfWidth = this.pipeWidth / 2;
                
                // 새가 파이프의 X 범위 내에 있는지 확인 (여유 공간 포함)
                if (birdX + birdRadius - collisionTolerance < pipeX - pipeHalfWidth || 
                    birdX - birdRadius + collisionTolerance > pipeX + pipeHalfWidth) {
                    continue; // X 범위 밖이면 충돌 없음
                }
                
                // 위쪽 파이프의 바운드 계산
                const topPipeHeight = pipe.top.height || 0;
                const topPipeY = pipe.top.y;
                const topPipeTop = topPipeY - topPipeHeight / 2;
                const topPipeBottom = topPipeY + topPipeHeight / 2;
                
                // 아래쪽 파이프의 바운드 계산
                const bottomPipeHeight = pipe.bottom.height || 0;
                const bottomPipeY = pipe.bottom.y;
                const bottomPipeTop = bottomPipeY - bottomPipeHeight / 2;
                const bottomPipeBottom = bottomPipeY + bottomPipeHeight / 2;
                
                // 새의 Y 범위 (여유 공간 적용)
                const birdTop = birdY - birdRadius + collisionTolerance;
                const birdBottom = birdY + birdRadius - collisionTolerance;
                
                // 새가 위쪽 파이프와 겹치는지 확인 (여유 공간 고려)
                const hitTopPipe = (birdTop <= topPipeBottom && birdBottom >= topPipeTop);
                
                // 새가 아래쪽 파이프와 겹치는지 확인 (여유 공간 고려)
                const hitBottomPipe = (birdTop <= bottomPipeBottom && birdBottom >= bottomPipeTop);
                
                if (hitTopPipe || hitBottomPipe) {
                    this.startFalling();
                    return;
                }
            }
        }
        
        // 바닥/천장 충돌 체크
        if (this.bird && this.bird.body && !this.isGameOver) {
            const groundHeight = 50;
            const ceilingHeight = 70;
            
            // 무적 상태일 때는 바닥/천장 충돌 무시 (닿으면 그냥 멈춤, 하지만 반대 방향으로 이동 중이면 허용)
            if (this.isInvincible) {
                // 바닥 충돌 처리
                if (this.bird.y >= this.canvasHeight - groundHeight) {
                    // 바닥에 닿았고, 아래로 떨어지는 중일 때만 위치 고정
                    if (this.bird.body && this.bird.body.velocity.y >= 0) {
                        // 아래로 떨어지는 중이거나 정지 상태일 때만 바닥에 고정
                        this.bird.y = this.canvasHeight - groundHeight;
                        this.bird.body.setVelocityY(0);
                    }
                    // 위로 올라가는 중이면 위치 고정하지 않음 (점프 가능)
                }
                // 천장 충돌 처리 (바닥과 동일하게)
                if (this.bird.y <= ceilingHeight) {
                    // 천장에 닿았고, 위로 올라가는 중일 때만 위치 고정
                    if (this.bird.body && this.bird.body.velocity.y <= 0) {
                        // 위로 올라가는 중이거나 정지 상태일 때만 천장에 고정
                        this.bird.y = ceilingHeight;
                        this.bird.body.setVelocityY(0);
                    }
                    // 아래로 떨어지는 중이면 위치 고정하지 않음 (떨어질 수 있음)
                }
            } else {
                // 떨어지는 중이면 바닥 충돌만 체크
                if (this.isFalling) {
                    if (this.bird.y >= this.canvasHeight - groundHeight) {
                        this.checkLivesAndRespawn();
                        return;
                    }
                } else {
                    // 떨어지지 않는 중이면 바닥/천장 모두 체크
                    if (this.bird.y >= this.canvasHeight - groundHeight || this.bird.y <= ceilingHeight) {
                        if (this.bird.y <= ceilingHeight) {
                            // 천장 충돌은 즉시 생명 체크
                            this.checkLivesAndRespawn();
                        } else {
                            // 바닥 충돌은 떨어지는 애니메이션 시작
                            this.startFalling();
                        }
                        return;
                    }
                }
            }
        }
        
        // 새의 회전 (속도에 따라, 떨어지는 중이 아닐 때만)
        if (this.bird && this.bird.body && !this.isFalling) {
            const velocityY = this.bird.body.velocity.y;
            if (velocityY > 0) {
                // 떨어질 때 각도 조절 (더 부드러운 회전, 최대 45도)
                this.bird.angle = Math.min(velocityY / 20, 45);
            } else {
                this.bird.angle = Math.max(velocityY / 10, -20);
            }
        }
        
    }

    /**
     * 게임 시작 모달 표시
     */
    showGameStartModal() {
        const modal = document.createElement('div');
        modal.className = 'game-start-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h2>플래피 버드</h2>
                <p class="game-description">화면을 클릭하거나 터치하여 새를 조종하세요!</p>
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
        
        // 새의 위치와 속도 재설정
        if (this.bird && this.bird.body) {
            const birdX = this.canvasWidth / 4;
            const birdY = this.uiPanelBottom > 0 ? this.uiPanelBottom + 100 : this.canvasHeight / 2;
            
            this.bird.x = birdX;
            this.bird.y = birdY;
            this.bird.angle = 0;
            this.bird.body.setVelocity(0, 0);
            this.bird.body.setGravityY(this.gravity);
        }
        
        // 게임 상태 초기화 (카운트다운 중에는 무적 상태)
        this.isPaused = false;
        this.isGameOver = false;
        this.isFalling = false; // 떨어지는 상태 리셋
        this.lives = 3; // 생명 리셋
        this.isInvincible = true; // 카운트다운 중에는 무적 상태
        this.currentLevel = 1;
        this.pipeSpeed = this.basePipeSpeed; // 기본 속도로 초기화
        this.pipeCount = 0; // 파이프 카운터 리셋
        this.gameStartTime = Date.now();
        this.elapsedSeconds = 0;
        
        // 깜박거림 애니메이션 시작
        if (this.bird && this.scene && this.scene.tweens) {
            // 기존 깜박거림 애니메이션 제거
            this.scene.tweens.killTweensOf(this.bird);
            
            // 깜박거림 애니메이션 (3초 동안)
            const blinkTween = this.scene.tweens.add({
                targets: this.bird,
                alpha: 0.3,
                duration: 100,
                yoyo: true,
                repeat: 15, // 3초 동안 (100ms * 15 * 2 = 3000ms)
                ease: 'Power1',
                onComplete: () => {
                    // 깜박거림 완료 후 무적 상태 해제
                    if (this.bird) this.bird.setAlpha(1);
                    this.isInvincible = false;
                    // 무적 해제 시 중력 다시 활성화
                    if (this.bird && this.bird.body) {
                        this.bird.body.setGravityY(this.gravity);
                    }
                }
            });
        }
        
        // 카운트다운 표시 (3초, 2초, 1초, 시작!)
        this.showInvincibleCountdown(3);
        
        // 카운트다운 타이머 (3초 후 게임 시작)
        if (this.invincibleTimer) {
            this.invincibleTimer.remove();
        }
        
        // 1초마다 카운트다운 표시 (3, 2, 1, 시작!)
        let countdown = 3;
        const countdownInterval = this.scene.time.addEvent({
            delay: 1000,
            callback: () => {
                countdown--;
                if (countdown > 0) {
                    this.showInvincibleCountdown(countdown);
                } else if (countdown === 0) {
                    // 마지막에 "시작!" 표시
                    this.showInvincibleCountdown('start');
                }
            },
            repeat: 3 // 3초, 2초, 1초, 시작! (총 4번)
        });
        
        this.invincibleTimer = this.scene.time.addEvent({
            delay: 3000,
            callback: () => {
                // 카운트다운 완료 후 무적 상태 해제
                this.isInvincible = false;
                if (this.bird) this.bird.setAlpha(1);
                if (this.birdEye) this.birdEye.setAlpha(1);
                if (this.birdBeak) this.birdBeak.setAlpha(1);
                // 무적 해제 시 중력 다시 활성화
                if (this.bird && this.bird.body) {
                    this.bird.body.setGravityY(this.gravity);
                }
                
                // 경과 시간 타이머 시작
                this.startElapsedTimeTimer();
            }
        });
    }

    /**
     * 버드가 떨어지는 애니메이션 시작
     */
    startFalling() {
        if (this.isFalling || this.isGameOver) {
            return;
        }
        
        this.isFalling = true;
        
        // 버드의 점프 입력 비활성화
        // (이미 충돌했으므로 더 이상 점프할 수 없음)
        
        // 버드가 회전하면서 떨어지도록 설정
        if (this.bird && this.bird.body) {
            // 중력은 그대로 유지하여 자연스럽게 떨어지도록
            // 회전 애니메이션 시작 (360도 회전하면서 떨어짐)
            if (this.scene && this.scene.tweens) {
                this.scene.tweens.add({
                    targets: this.bird,
                    angle: 720, // 2바퀴 회전
                    duration: 2000, // 2초 동안
                    ease: 'Power2',
                    onComplete: () => {
                        // 회전 애니메이션 완료 후에도 계속 떨어짐
                    }
                });
            }
            
            // 버드가 아래로 떨어지도록 약간의 속도 추가
            const currentVelocityY = this.bird.body.velocity.y;
            if (currentVelocityY < 0) {
                // 위로 올라가는 중이면 아래로 떨어지도록 속도 조정
                this.bird.body.setVelocityY(200);
            }
        }
        
        // 파이프 이동은 계속되지만, 새 파이프는 생성되지 않도록 함
        // (updatePipes에서 isFalling 체크 추가 필요)
    }

    /**
     * 생명 체크 및 부활 또는 게임 오버
     */
    checkLivesAndRespawn() {
        if (this.lives > 0) {
            // 생명이 있으면 부활
            this.lives--;
            this.updateLivesDisplay(); // 생명 게이지 업데이트
            this.respawn();
        } else {
            // 생명이 없으면 게임 오버
            this.gameOver();
        }
    }

    /**
     * 부활 처리 (무적 상태, 깜박거림, 화면 중앙으로 이동)
     */
    respawn() {
        // 떨어지는 상태 해제
        this.isFalling = false;
        
        // 무적 상태 시작 (3초) - 먼저 설정하여 중력 비활성화가 확실히 적용되도록
        this.isInvincible = true;
        
        // 버드를 첫 게임 시작 위치와 동일하게 이동 (createBird()와 동일한 위치)
        if (this.bird && this.bird.body) {
            const birdX = this.canvasWidth / 4;
            // UI 패널 아래에 배치 (createBird()와 동일한 로직)
            const birdY = (this.uiPanelBottom > 0 ? this.uiPanelBottom + 100 : this.canvasHeight / 2);
            
            // 버드 위치 재설정
            this.bird.x = birdX;
            this.bird.y = birdY;
            this.bird.angle = 0;
            
            // 중력과 속도 초기화 (자동 플레이를 위해 중력 활성화)
            this.bird.body.setVelocity(0, 0);
            this.bird.body.setGravityY(this.gravity);
        }
        
        // 깜박거림 애니메이션 시작
        if (this.bird && this.scene && this.scene.tweens) {
            // 기존 깜박거림 애니메이션 제거
            this.scene.tweens.killTweensOf(this.bird);
            
            // 깜박거림 애니메이션 (3초 동안)
            const blinkTween = this.scene.tweens.add({
                targets: this.bird,
                alpha: 0.3,
                duration: 100,
                yoyo: true,
                repeat: 15, // 3초 동안 (100ms * 15 * 2 = 3000ms)
                ease: 'Power1',
                onComplete: () => {
                    // 깜박거림 완료 후 무적 상태 해제
                    if (this.bird) this.bird.setAlpha(1);
                    this.isInvincible = false;
                    // 무적 해제 시 중력 다시 활성화
                    if (this.bird && this.bird.body) {
                        this.bird.body.setGravityY(this.gravity);
                    }
                }
            });
        }
        
        // 무적 상태 카운트다운 표시 (3초, 2초, 1초, 시작!)
        this.showInvincibleCountdown(3);
        
        // 무적 상태 타이머 (3초 후 자동 해제)
        if (this.invincibleTimer) {
            this.invincibleTimer.remove();
        }
        
        // 1초마다 카운트다운 표시 (3, 2, 1, 시작!)
        let countdown = 3;
        const countdownInterval = this.scene.time.addEvent({
            delay: 1000,
            callback: () => {
                countdown--;
                if (countdown > 0) {
                    this.showInvincibleCountdown(countdown);
                } else if (countdown === 0) {
                    // 마지막에 "시작!" 표시
                    this.showInvincibleCountdown('start');
                }
            },
            repeat: 3 // 3초, 2초, 1초, 시작! (총 4번)
        });
        
        this.invincibleTimer = this.scene.time.addEvent({
            delay: 3000,
            callback: () => {
                this.isInvincible = false;
                if (this.bird) this.bird.setAlpha(1);
                // 무적 해제 시 중력 다시 활성화
                if (this.bird && this.bird.body) {
                    this.bird.body.setGravityY(this.gravity);
                }
            }
        });
    }

    /**
     * 게임 오버
     */
    gameOver() {
        if (this.isGameOver) {
            return;
        }
        
        this.isGameOver = true;
        this.isPaused = true;
        this.isFalling = false;
        
        // 무적 상태 타이머 중지
        if (this.invincibleTimer) {
            this.invincibleTimer.remove();
            this.invincibleTimer = null;
        }
        
        // 경과 시간 타이머 중지
        if (this.elapsedTimeTimer) {
            this.elapsedTimeTimer.remove();
            this.elapsedTimeTimer = null;
        }
        
        // 파이프 이동 중지
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
                <p class="combo-info">통과한 파이프: ${this.pipesPassed}개</p>
                <p class="combo-info">최종 레벨: ${this.currentLevel}</p>
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
        
        // 점수 및 경과 시간 리셋
        this.score = 0;
        this.pipesPassed = 0;
        this.elapsedSeconds = 0;
        this.currentLevel = 1;
        this.pipeSpeed = this.basePipeSpeed; // 기본 속도로 리셋
        this.pipeCount = 0; // 파이프 카운터 리셋
        this.isPaused = true;
        this.isGameOver = false;
        this.isFalling = false; // 떨어지는 상태 리셋
        this.lives = 3; // 생명 리셋
        this.isInvincible = false; // 무적 상태 리셋
        this.gameStartTime = Date.now();
        
        // 무적 상태 타이머 중지
        if (this.invincibleTimer) {
            this.invincibleTimer.remove();
            this.invincibleTimer = null;
        }
        
        // 경과 시간 타이머 중지
        if (this.elapsedTimeTimer) {
            this.elapsedTimeTimer.remove();
            this.elapsedTimeTimer = null;
        }
        
        // 경과 시간 표시 업데이트
        this.updateElapsedTimeDisplay();
        
        // 파이프 제거
        this.pipes.forEach(pipe => {
            pipe.top.destroy();
            pipe.bottom.destroy();
        });
        this.pipes = [];
        this.lastPipeX = this.canvasWidth + 100;
        
        // 코인 제거
        this.coins.forEach(coin => {
            if (coin.sprite) {
                coin.sprite.destroy();
            }
        });
        this.coins = [];
        
        // 새 위치 리셋 및 물리 비활성화
        if (this.bird && this.bird.body) {
            const birdX = this.canvasWidth / 4;
            const birdY = this.uiPanelBottom > 0 ? this.uiPanelBottom + 100 : this.canvasHeight / 2;
            
            this.bird.x = birdX;
            this.bird.y = birdY;
            this.bird.angle = 0;
            this.bird.body.setVelocity(0, 0);
            this.bird.body.setGravityY(0); // 게임 시작 전에는 중력 비활성화
        }
        
        // 그림자 위치 리셋
        if (this.birdShadow) {
            const groundHeight = 50;
            const shadowY = this.canvasHeight - groundHeight;
            this.birdShadow.setX(this.canvasWidth / 4);
            this.birdShadow.setY(shadowY);
        }
        
        // 점수 텍스트 업데이트
        if (this.scoreText) {
            this.scoreText.setText('0');
        }
        
        this.showGameStartModal();
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
     * 레벨업 처리
     */
    levelUp() {
        if (this.isPaused || this.isGameOver) {
            return;
        }
        
        // 레벨 증가
        this.currentLevel++;
        
        // 속도 증가 (레벨당 10% 증가)
        this.pipeSpeed = this.basePipeSpeed * (1 + (this.currentLevel - 1) * 0.1);
        
        // 레벨업 애니메이션 표시
        this.showLevelUp();
    }
    
    /**
     * 무적 상태 카운트다운 표시
     */
    showInvincibleCountdown(seconds) {
        if (!this.levelText) return;
        
        // 기존 애니메이션 중지
        if (this.scene && this.scene.tweens) {
            this.scene.tweens.killTweensOf(this.levelText);
        }
        
        // 카운트다운 색상 및 텍스트 (3초: 파랑, 2초: 노랑, 1초: 빨강, 시작!: 초록)
        let countdownColor = '#2196F3'; // 파랑 (3초)
        let countdownText = `${seconds}`;
        
        if (seconds === 2) {
            countdownColor = '#FFD700'; // 노랑 (2초)
        } else if (seconds === 1) {
            countdownColor = '#FF6B6B'; // 빨강 (1초)
        } else if (seconds === 'start' || seconds === 0) {
            countdownColor = '#4CAF50'; // 초록 (시작!)
            countdownText = '시작!';
        }
        
        this.levelText.setFill(countdownColor);
        this.levelText.setText(countdownText);
        this.levelText.setVisible(true);
        this.levelText.setScale(0);
        this.levelText.setAlpha(1);
        this.levelText.setDepth(1000); // 항상 최상위에 표시
        
        // 부드러운 애니메이션 (제자리에서 스케일만 변경하며 페이드 아웃)
        const originalY = this.levelText.y;
        if (this.scene && this.scene.tweens) {
            this.scene.tweens.add({
                targets: this.levelText,
                scale: 1.2,
                alpha: 0,
                duration: 1000,
                ease: 'Power2',
                onComplete: () => {
                    this.levelText.setVisible(false);
                    // 원래 위치와 스케일로 복귀
                    this.levelText.setScale(1);
                    this.levelText.setAlpha(1);
                    this.levelText.y = originalY; // 위치 고정
                }
            });
        }
    }

    /**
     * 레벨업 표시 (bubble_shooter 참고)
     */
    showLevelUp() {
        if (!this.levelText) return;
        
        // 기존 애니메이션 중지
        if (this.scene && this.scene.tweens) {
            this.scene.tweens.killTweensOf(this.levelText);
        }
        
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
        if (this.scene && this.scene.tweens) {
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
    }
    
    /**
     * 점수 저장
     */
    saveScore() {
        const elapsedTime = Math.floor((Date.now() - this.gameStartTime) / 1000);
        const level = this.currentLevel;
        
        const isLogged = this.config.is_logged !== false && this.config.is_logged !== undefined;
        if (!isLogged) {
            return;
        }

        const params = {
            game_id: this.config.game_id,
            score: this.score,
            level: level,
            moves: this.pipesPassed,
            time: elapsedTime
        };

        if (typeof exec_json === 'function') {
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
    }

    /**
     * 게임 파괴
     */
    destroy() {
        if (this.elapsedTimeTimer) {
            this.elapsedTimeTimer.remove();
            this.elapsedTimeTimer = null;
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
window.GameFactory.flappy_bird = FlappyBirdGame;
