#!/bin/bash
# Flappy Bird 게임 빌드 스크립트 (Linux/Mac)
# 이 스크립트는 game.source.js를 난독화하여 game.js를 생성합니다.

echo "=========================================="
echo "Flappy Bird 게임 빌드 시작"
echo "=========================================="
echo ""

# Node.js 설치 확인
if ! command -v node &> /dev/null; then
    echo "[오류] Node.js가 설치되어 있지 않습니다."
    echo "Node.js를 https://nodejs.org 에서 다운로드하여 설치해주세요."
    exit 1
fi

echo "[1/3] Node.js 버전 확인..."
node --version
echo ""

# npm 패키지 설치 확인
if [ ! -d "node_modules" ]; then
    echo "[2/3] 필요한 패키지 설치 중..."
    npm install
    if [ $? -ne 0 ]; then
        echo "[오류] 패키지 설치 실패"
        exit 1
    fi
else
    echo "[2/3] 패키지가 이미 설치되어 있습니다."
fi
echo ""

# 빌드 실행
echo "[3/3] game.source.js 난독화 중..."
npm run build
if [ $? -ne 0 ]; then
    echo "[오류] 빌드 실패"
    exit 1
fi

echo ""
echo "=========================================="
echo "빌드 완료!"
echo "game.js 파일이 생성되었습니다."
echo "=========================================="
echo ""
echo "이제 game.js 파일을 서버에 업로드하세요."
echo "game.source.js는 개발용이므로 서버에 업로드하지 마세요."
echo ""
