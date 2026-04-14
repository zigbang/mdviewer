# MD Viewer

Markdown 뷰어 — Electron + marked.js + Mermaid + KaTeX + highlight.js

## 기능
- 📂 폴더 열기 → 파일 트리에서 `.md` 파일 탐색
- 📋 목차(TOC) 자동 생성 — 클릭 시 해당 위치로 이동
- 📊 Mermaid 다이어그램 렌더링 (최신 v11)
- 🧮 KaTeX 수식 렌더링 (`$...$`, `$$...$$`)
- 🎨 코드 하이라이팅 (highlight.js)
- 사이드바 / 목차 패널 접기·펼치기

## 단축키
| 단축키 | 기능 |
|--------|------|
| `Ctrl+Shift+O` | 폴더 열기 |
| `Ctrl+B`       | 파일 목록 사이드바 토글 |
| `Ctrl+T`       | 목차 패널 토글 |

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
