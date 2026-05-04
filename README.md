# MD Viewer

[![MDViewer Build](https://github.com/zigbang/at/actions/workflows/mdviewer-build.yml/badge.svg)](https://github.com/zigbang/at/actions/workflows/mdviewer-build.yml)

Markdown 뷰어 — Electron + marked.js + Mermaid + KaTeX + highlight.js

## 기능
- 📂 폴더 열기 → 파일 트리에서 `.md` 파일 탐색
- 📋 목차(TOC) 자동 생성 — 클릭 시 해당 위치로 이동
- 📊 Mermaid 다이어그램 렌더링 (최신 v11)
- 🧮 KaTeX 수식 렌더링 (`$...$`, `$$...$$`)
- 🎨 코드 하이라이팅 (highlight.js)
- 🗂️ 탭 브라우징 — VS Code 스타일 (단일 클릭=preview, 더블클릭=고정)
- 사이드바 / 목차 패널 접기·펼치기

## 단축키
| 단축키 | 기능 |
|--------|------|
| `Ctrl+Shift+O` | 폴더 열기 |
| `Ctrl+B`       | 파일 목록 사이드바 토글 |
| `Ctrl+T`       | 목차 패널 토글 |
| `Ctrl+W`       | 활성 탭 닫기 |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | 탭 순환 (다음/이전) |
| `Ctrl+1..9`    | N번째 탭으로 이동 (Ctrl+9 = 마지막) |

## 실행 방법

```bash
# 1. 의존성 설치
npm install

# 2. 개발 모드 실행
npm start

# 3. Windows 포터블 .exe 빌드
npm run build:win
# → dist/MD Viewer *.exe 생성
```

## 빌드 결과물
`dist/` 폴더에 포터블 `.exe` 하나 생성됨 — 설치 없이 더블클릭으로 바로 실행
