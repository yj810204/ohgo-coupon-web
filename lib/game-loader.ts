/**
 * 게임 로더
 * cj_game의 game-loader.js를 참고하여 구현
 * 동적으로 game.js와 game.css를 로드하여 게임 실행
 */

export class GameLoader {
  private currentGame: string | null = null;
  private gameInstance: any = null;
  private loadedScripts: Set<string> = new Set();
  private loadedStyles: Set<string> = new Set();
  public onScore?: (score: number, level?: number, moves?: number, time?: number) => void;

  /**
   * 게임 로드
   * @param gameId 게임 ID
   * @param gamePath 게임 경로 (예: "games/bubble_shooter")
   */
  async loadGame(gameId: string, gamePath: string): Promise<any> {
    try {
      // 기존 게임 인스턴스 정리
      if (this.gameInstance) {
        this.stopGame();
      }

      // 게임 설정 파일 로드
      const configResponse = await fetch(`/${gamePath}/config.json`);
      if (!configResponse.ok) {
        throw new Error('게임 설정 파일을 찾을 수 없습니다.');
      }
      const config = await configResponse.json();
      config.game_id = gameId;
      // 게임 경로를 절대 경로로 설정 (에셋 로드용)
      // Next.js에서는 public 폴더가 루트에 매핑되므로 /games/... 형태로 설정
      config.game_path = `/${gamePath}`;
      config.base_path = `/${gamePath}`;
      // 에셋 경로가 올바르게 해석되도록 base URL 설정
      if (typeof window !== 'undefined') {
        config.base_url = window.location.origin;
        // 현재 경로와 상관없이 항상 루트 기준으로 에셋 로드
        config.asset_base_path = `/${gamePath}`;
      }

      // Firestore에서 게임 정보와 에셋 URL 가져오기
      try {
        const { getGame } = await import('./game-service');
        const gameData = await getGame(gameId);
        if (gameData?.asset_urls) {
          // 게임 타입에 따라 이미지 경로 설정
          if (gameId === 'bubble_shooter' || gameId === 'match3') {
            // 블록 이미지 URL 설정
            const blockTypes = config.block_types || [];
            blockTypes.forEach((blockType: any, index: number) => {
              const assetName = `block_${index}`;
              if (gameData.asset_urls[assetName]) {
                blockType.image_path = gameData.asset_urls[assetName];
              }
            });
            config.block_types = blockTypes;
          } else if (gameId === 'flappy_bird') {
            // 플래피 버드 이미지 URL 설정
            if (gameData.asset_urls['bird_0']) {
              config.bird_image_path = gameData.asset_urls['bird_0'];
            }
            if (gameData.asset_urls['coin_0']) {
              config.coin_image_path = gameData.asset_urls['coin_0'];
            }
            if (gameData.asset_urls['pipe_0']) {
              config.pipe_image_path = gameData.asset_urls['pipe_0'];
            }
            if (gameData.asset_urls['pipe_top_0']) {
              config.pipe_top_image_path = gameData.asset_urls['pipe_top_0'];
            }
            if (gameData.asset_urls['pipe_bottom_0']) {
              config.pipe_bottom_image_path = gameData.asset_urls['pipe_bottom_0'];
            }
            if (gameData.asset_urls['background_0']) {
              config.background_image_path = gameData.asset_urls['background_0'];
            }
          }
        }
      } catch (error) {
        console.warn('Failed to load asset URLs from Firestore:', error);
        // 에러가 발생해도 게임은 계속 진행
      }

      // 게임 스타일 로드
      this.loadCSS(`/${gamePath}/game.css`);

      // 게임 스크립트 로드 (중복 방지)
      const scriptPath = `/${gamePath}/game.js`;
      
      // 스크립트 로드 (이미 로드된 경우 재사용)
      await this.loadScript(scriptPath);
      
      // 스크립트 로드 후 전역 변수 초기화 대기
      await new Promise(resolve => setTimeout(resolve, 300));

      // 게임 초기화
      // GameFactory 또는 직접 클래스 이름으로 접근 시도
      let GameClass: any = null;
      
      console.log('Looking for game class:', gameId);
      console.log('GameFactory exists:', !!window.GameFactory);
      console.log('GameFactory content:', window.GameFactory);
      
      if (window.GameFactory && (window.GameFactory as any)[gameId]) {
        GameClass = (window.GameFactory as any)[gameId];
        console.log('Found game class in GameFactory');
      } else {
        // 직접 전역 변수로 접근 시도 (예: BubbleShooterGame)
        const className = gameId.split('_').map((word) => 
          word.charAt(0).toUpperCase() + word.slice(1)
        ).join('') + 'Game';
        
        console.log('Looking for class name:', className);
        console.log('Window has class:', !!(window as any)[className]);
        
        if ((window as any)[className]) {
          GameClass = (window as any)[className];
          console.log('Found game class as global variable');
        }
      }

      if (GameClass) {
        console.log('Creating game instance with config:', config);
        this.gameInstance = new GameClass(config);
        this.currentGame = gameId;
        
        // 전역 변수 업데이트 (게임 스크립트에서 접근 가능하도록)
        // window.gameLoader가 없으면 생성
        if (!window.gameLoader) {
          (window as any).gameLoader = this;
          console.log('Created window.gameLoader');
        }
        // gameInstance를 확실히 설정
        (window.gameLoader as any).gameInstance = this.gameInstance;
        
        // 게임 인스턴스에도 직접 참조 추가 (fallback)
        if (this.gameInstance) {
          (this.gameInstance as any).gameLoader = this;
        }
        
        console.log('Game instance created:', this.gameInstance);
        console.log('window.gameLoader:', window.gameLoader);
        console.log('window.gameLoader.gameInstance:', (window.gameLoader as any).gameInstance);
        console.log('window.gameLoader.gameInstance === this.gameInstance:', (window.gameLoader as any).gameInstance === this.gameInstance);
        return this.gameInstance;
      } else {
        const availableGlobals = Object.keys(window).filter(k => k.includes('Game') || k.includes('game'));
        console.error('Available game-related globals:', availableGlobals);
        throw new Error(`Game class not found for ${gameId}. Make sure the game script is loaded. Available: ${availableGlobals.join(', ')}`);
      }
    } catch (error) {
      console.error('게임 로드 실패:', error);
      throw error;
    }
  }

  /**
   * CSS 파일 로드
   */
  private loadCSS(href: string): void {
    if (this.loadedStyles.has(href)) {
      return; // 이미 로드된 스타일은 건너뛰기
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
    this.loadedStyles.add(href);
  }

  /**
   * JavaScript 파일 동적 로드
   */
  private loadScript(src: string): Promise<void> {
    // 이미 로드된 스크립트는 건너뛰기 (전역 변수 재사용)
    if (this.loadedScripts.has(src)) {
      console.log('Script already loaded, reusing:', src);
      return Promise.resolve();
    }

    // 스크립트 파일명에서 게임 ID 추출 (예: /games/bubble_shooter/game.js -> bubble_shooter)
    const gameIdMatch = src.match(/\/games\/([^\/]+)\/game\.js/);
    if (gameIdMatch) {
      const gameId = gameIdMatch[1];
      const className = gameId.split('_').map((word) => 
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join('') + 'Game';
      
      // 전역 변수가 이미 존재하면 스크립트를 다시 로드하지 않음
      if ((window as any)[className] || (window.GameFactory && (window.GameFactory as any)[gameId])) {
        console.log(`Game class ${className} already exists, skipping script load:`, src);
        this.loadedScripts.add(src);
        return Promise.resolve();
      }
    }

    // 기존 스크립트 태그 확인
    const existingScripts = document.querySelectorAll(`script[src="${src}"]`);
    
    // 기존 스크립트 태그가 있고 이미 로드된 경우 재사용
    if (existingScripts.length > 0) {
      console.log('Script tag already exists, checking if loaded:', src);
      // 스크립트가 이미 실행되었는지 확인하기 위해 약간 대기
      return new Promise((resolve) => {
        setTimeout(() => {
          // 전역 변수 확인
          if (gameIdMatch) {
            const gameId = gameIdMatch[1];
            const className = gameId.split('_').map((word) => 
              word.charAt(0).toUpperCase() + word.slice(1)
            ).join('') + 'Game';
            
            if ((window as any)[className] || (window.GameFactory && (window.GameFactory as any)[gameId])) {
              console.log('Script already executed, reusing:', src);
              this.loadedScripts.add(src);
              resolve();
              return;
            }
          }
          
          // 전역 변수가 없으면 기존 스크립트 태그 제거 후 다시 로드
          existingScripts.forEach((script) => {
            console.log('Removing existing script tag and reloading:', src);
            script.remove();
          });
          
          // 새 스크립트 로드
          this._loadScriptTag(src).then(resolve);
        }, 100);
      });
    }

    // 새 스크립트 로드
    return this._loadScriptTag(src);
  }

  /**
   * 스크립트 태그 생성 및 로드
   */
  private _loadScriptTag(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.type = 'text/javascript';
      script.async = false; // 동기적으로 로드하여 순서 보장
      
      script.onload = () => {
        console.log('Script loaded successfully:', src);
        this.loadedScripts.add(src);
        // 스크립트 로드 후 잠시 대기 (전역 변수 초기화 시간)
        setTimeout(() => resolve(), 200);
      };
      script.onerror = () => {
        console.error('Script load error:', src);
        reject(new Error(`Failed to load script: ${src}`));
      };
      document.head.appendChild(script);
    });
  }

  /**
   * 게임 시작
   * @param containerId 게임 컨테이너 ID
   */
  startGame(containerId: string): void {
    console.log('startGame called with containerId:', containerId);
    console.log('Game instance exists:', !!this.gameInstance);
    
    if (!this.gameInstance) {
      console.error('Game instance is null, cannot start game');
      throw new Error('게임 인스턴스가 없습니다. 게임을 먼저 로드해주세요.');
    }

    // 전역 변수 업데이트 (게임 스크립트에서 접근 가능하도록)
    if (window.gameLoader) {
      (window.gameLoader as any).gameInstance = this.gameInstance;
    }

    // 컨테이너 요소 확인
    let container = document.getElementById(containerId);
    
    // 컨테이너를 찾지 못하면 잠시 대기 후 다시 시도
    if (!container) {
      console.warn('Container not found immediately, retrying...');
      setTimeout(() => {
        container = document.getElementById(containerId);
        if (container) {
          this._startGameInContainer(container, containerId);
        } else {
          console.error('Container not found after retry:', containerId);
        }
      }, 100);
      return;
    }

    this._startGameInContainer(container, containerId);
  }

  private _startGameInContainer(container: HTMLElement, containerId: string): void {
    console.log('Container element:', container);
    console.log('Container dimensions:', {
      width: container.offsetWidth,
      height: container.offsetHeight,
      display: window.getComputedStyle(container).display,
    });

    // 컨테이너가 보이도록 설정
    container.style.display = 'block';
    container.style.width = '100%';
    container.style.height = '100%';

    try {
      console.log('Calling gameInstance.start with containerId:', containerId);
      if (typeof this.gameInstance.start === 'function') {
        this.gameInstance.start(containerId);
        console.log('Game started successfully');
      } else {
        console.error('gameInstance.start is not a function:', typeof this.gameInstance.start);
        console.log('Available methods:', Object.keys(this.gameInstance));
        throw new Error('게임 시작 메서드를 찾을 수 없습니다.');
      }
    } catch (error) {
      console.error('Error starting game:', error);
      throw error;
    }
  }

  /**
   * 게임 종료
   */
  stopGame(): void {
    if (this.gameInstance) {
      if (typeof this.gameInstance.destroy === 'function') {
        this.gameInstance.destroy();
      }
      this.gameInstance = null;
    }
    this.currentGame = null;
  }

  /**
   * 모든 게임 리소스 정리
   */
  cleanup(): void {
    this.stopGame();
    // 로드된 스크립트 목록 초기화 (다음 게임 로드를 위해)
    // 하지만 실제 스크립트 태그는 유지 (재사용)
  }

  /**
   * 현재 게임 ID 반환
   */
  getCurrentGame(): string | null {
    return this.currentGame;
  }
}

// 전역 인스턴스 (선택사항)
declare global {
  interface Window {
    GameFactory?: any;
    gameLoader?: GameLoader;
  }
}

