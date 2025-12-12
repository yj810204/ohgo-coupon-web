@echo off
REM Bubble Shooter 게임 빌드 스크립트 (Windows)
REM 이 스크립트는 game.source.js를 난독화하여 game.js를 생성합니다.

echo ==========================================
echo Bubble Shooter 게임 빌드 시작
echo ==========================================
echo.

REM Node.js 및 npm 설치 확인
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [오류] Node.js가 설치되어 있지 않습니다.
    echo Node.js를 https://nodejs.org 에서 다운로드하여 설치해주세요.
    pause
    exit /b 1
)

echo [1/3] Node.js 버전 확인...
node --version
echo.

REM npm 패키지 설치 확인
if not exist "node_modules" (
    echo [2/3] 필요한 패키지 설치 중...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [오류] 패키지 설치 실패
        pause
        exit /b 1
    )
) else (
    echo [2/3] 패키지가 이미 설치되어 있습니다.
)
echo.

REM 빌드 실행
echo [3/3] game.source.js 난독화 중...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo [오류] 빌드 실패
    pause
    exit /b 1
)

echo.
echo ==========================================
echo 빌드 완료!
echo game.js 파일이 생성되었습니다.
echo ==========================================
echo.
echo 이제 game.js 파일을 서버에 업로드하세요.
echo game.source.js는 개발용이므로 서버에 업로드하지 마세요.
echo.
pause

