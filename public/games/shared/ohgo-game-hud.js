/**
 * 오고피씽 미니게임 공통 HUD (safe area + 통일 디자인)
 */
(function (global) {
  const THEME = {
    barFill: 0x1a1d1f,
    barAlpha: 0.92,
    scoreFill: 0x1b6ff5,
    scoreStroke: 0x1557c7,
    timeFill: 0xff9500,
    timeStroke: 0xe68600,
    timeWarningFill: 0xff3b30,
    timeWarningStroke: 0xd32f2f,
    livesFill: 0xff3b30,
    livesStroke: 0xd50000,
    labelColor: '#9ca3af',
    valueColor: '#ffffff',
    fontFamily: 'Urbanist, system-ui, -apple-system, sans-serif',
  };

  function parseInsetPx(style, name) {
    const raw = style.getPropertyValue(name).trim();
    const value = parseFloat(raw);
    return Number.isFinite(value) ? value : 0;
  }

  function readSafeAreaInsets(host) {
    let top = 0;
    let bottom = 0;
    if (typeof document !== 'undefined') {
      const style = getComputedStyle(document.documentElement);
      top = Math.max(
        parseInsetPx(style, '--ohgo-game-safe-top'),
        parseInsetPx(style, '--ohgo-safe-area-top')
      );
      bottom = Math.max(
        parseInsetPx(style, '--ohgo-game-safe-bottom'),
        parseInsetPx(style, '--ohgo-safe-area-bottom')
      );
      if (typeof global !== 'undefined') {
        if (typeof global.__OHGO_SAFE_AREA_TOP__ === 'number') {
          top = Math.max(top, global.__OHGO_SAFE_AREA_TOP__);
        }
        if (typeof global.__OHGO_SAFE_AREA_BOTTOM__ === 'number') {
          bottom = Math.max(bottom, global.__OHGO_SAFE_AREA_BOTTOM__);
        }
      }
    }
    host.safeAreaTop = top;
    host.safeAreaBottom = bottom;
    return { top, bottom };
  }

  function computeScale(canvasWidth, canvasHeight) {
    const baseWidth = 600;
    const baseHeight = 700;
    return Math.min(canvasWidth / baseWidth, canvasHeight / baseHeight, 1.0);
  }

  function createStatCard(scene, baseDepth, opts) {
    const {
      centerX,
      centerY,
      cardWidth,
      cardHeight,
      fill,
      stroke,
      label,
      scale,
    } = opts;
    const labelFontSize = Math.max(11 * scale, 10);
    const valueFontSize = Math.max(20 * scale, 16);
    const padX = centerX - cardWidth / 2 + Math.max(10 * scale, 8);

    const bg = scene.add.rectangle(centerX, centerY, cardWidth, cardHeight, fill);
    bg.setAlpha(1);
    bg.setDepth(baseDepth + 1);
    if (stroke !== null && stroke !== undefined) {
      bg.setStrokeStyle(1, stroke, 0.55);
    }

    const labelText = scene.add.text(padX, centerY - cardHeight * 0.22, label, {
      fontSize: `${labelFontSize}px`,
      fill: THEME.labelColor,
      fontFamily: THEME.fontFamily,
      fontStyle: '600',
    });
    labelText.setDepth(baseDepth + 2);

    const valueText = scene.add.text(padX, centerY + 2, '0', {
      fontSize: `${valueFontSize}px`,
      fill: THEME.valueColor,
      fontFamily: THEME.fontFamily,
      fontStyle: '700',
    });
    valueText.setDepth(baseDepth + 2);

    return {
      bg,
      label: labelText,
      value: valueText,
      centerX,
      centerY,
      cardWidth,
      cardHeight,
    };
  }

  /**
   * @param {Phaser.Scene} scene
   * @param {object} host 게임 인스턴스 (this)
   * @param {object} options
   */
  function buildHud(scene, host, options) {
    readSafeAreaInsets(host);

    const canvasWidth = options.canvasWidth;
    const canvasHeight = options.canvasHeight;
    const baseDepth = options.baseDepth ?? 10;
    const showLives = !!options.showLives;
    const timeLabel =
      options.timeMode === 'remaining' ? '남은 시간' : '경과 시간';

    const scale = computeScale(canvasWidth, canvasHeight);
    const panelPadding = Math.max(12 * scale, 10);
    const panelHeight = Math.max(56 * scale, 48);
    const panelWidth = canvasWidth - panelPadding * 2;
    const panelX = panelPadding;
    const panelY = (host.safeAreaTop || 0) + Math.max(8 * scale, 6);
    const cardGap = Math.max(8 * scale, 6);
    const innerPad = Math.max(10 * scale, 8);
    const cardCount = showLives ? 3 : 2;
    const available = panelWidth - innerPad * 2 - cardGap * (cardCount - 1);
    const cardWidth = available / cardCount;
    const cardHeight = panelHeight - innerPad * 2;
    const cardY = panelY + panelHeight / 2;

    host.uiPanelBg = scene.add.rectangle(
      panelX + panelWidth / 2,
      panelY + panelHeight / 2,
      panelWidth,
      panelHeight,
      THEME.barFill
    );
    host.uiPanelBg.setAlpha(THEME.barAlpha);
    host.uiPanelBg.setDepth(baseDepth);
    host.uiPanelBottom = panelY + panelHeight;
    host._hudScale = scale;
    host._hudCards = {};

    let cardIndex = 0;
    const nextCardX = () => {
      const x =
        panelX +
        innerPad +
        cardWidth / 2 +
        cardIndex * (cardWidth + cardGap);
      cardIndex += 1;
      return x;
    };

    const scoreCard = createStatCard(scene, baseDepth, {
      centerX: nextCardX(),
      centerY: cardY,
      cardWidth,
      cardHeight,
      fill: THEME.scoreFill,
      stroke: THEME.scoreStroke,
      label: '점수',
      scale,
    });
    host._hudCards.score = scoreCard;
    host.scoreCardBg = scoreCard.bg;
    host.scoreLabel = scoreCard.label;
    host.scoreText = scoreCard.value;

    if (showLives) {
      const livesCard = createStatCard(scene, baseDepth, {
        centerX: nextCardX(),
        centerY: cardY,
        cardWidth,
        cardHeight,
        fill: THEME.livesFill,
        stroke: THEME.livesStroke,
        label: '생명',
        scale,
      });
      host._hudCards.lives = livesCard;
      host.livesCardBg = livesCard.bg;
      host.livesLabel = livesCard.label;
    }

    const timeCard = createStatCard(scene, baseDepth, {
      centerX: nextCardX(),
      centerY: cardY,
      cardWidth,
      cardHeight,
      fill: THEME.timeFill,
      stroke: THEME.timeStroke,
      label: timeLabel,
      scale,
    });
    host._hudCards.time = timeCard;
    host.timeCardBg = timeCard.bg;
    host.timeLabel = timeCard.label;
    host.timeText = timeCard.value;

    return {
      scale,
      panelY,
      panelHeight,
      panelWidth,
      uiPanelBottom: host.uiPanelBottom,
    };
  }

  /** @param {'normal'|'warn30'|'critical10'} level */
  function applyTimeStyle(timeCardBg, level) {
    if (!timeCardBg) return;
    if (level === 'critical10') {
      timeCardBg.setFillStyle(THEME.timeWarningFill, 1);
      timeCardBg.setStrokeStyle(1, THEME.timeWarningStroke, 0.55);
      return;
    }
    if (level === 'warn30') {
      timeCardBg.setFillStyle(THEME.timeFill, 1);
      timeCardBg.setStrokeStyle(1, THEME.timeStroke, 0.55);
      return;
    }
    timeCardBg.setFillStyle(THEME.timeFill, 1);
    timeCardBg.setStrokeStyle(1, THEME.timeStroke, 0.55);
  }

  global.OhgoGameHud = {
    THEME,
    readSafeAreaInsets,
    computeScale,
    buildHud,
    applyTimeStyle,
  };
})(typeof window !== 'undefined' ? window : global);
