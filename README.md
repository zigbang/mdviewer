# MD Viewer

[![MDViewer Build](https://github.com/zigbang/mdviewer/actions/workflows/build.yml/badge.svg)](https://github.com/zigbang/mdviewer/actions/workflows/build.yml)

Markdown 뷰어 — Electron + marked.js + Mermaid + KaTeX + highlight.js

## 기능
- 📂 폴더 열기 → 파일 트리에서 `.md` 파일 탐색
- 📋 목차(TOC) 자동 생성 — 클릭 시 해당 위치로 이동
- 📊 Mermaid 다이어그램 렌더링 (최신 v11)
- 🧮 KaTeX 수식 렌더링 (`$...$`, `$$...$$`)
- 🎨 코드 하이라이팅 (highlight.js)
- 🗂️ 탭 브라우징 — VS Code 스타일 (단일 클릭=preview, 더블클릭=고정)
- 🔎 파일 이름 검색 — 사이드바 트리를 `.md`/`.markdown` 파일명으로 필터링, Regex 옵션 지원
- ✨ 본문 검색 — 탭별 검색 상태, 하이라이트, 이전/다음 이동, Markdown 원문 검색 옵션
- 사이드바 / 목차 패널 접기·펼치기

## 단축키
| 단축키 | 기능 |
|--------|------|
| `Ctrl+Shift+O` | 폴더 열기 |
| `Ctrl+B`       | 파일 목록 사이드바 토글 |
| `Ctrl+T`       | 목차 패널 토글 |
| `Ctrl+F`       | 현재 탭에서 본문 검색 |
| `Enter` / `Shift+Enter` | 검색 결과 다음/이전 이동 |
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

## macOS — Finder에서 `.md` 더블클릭으로 열기

릴리스 zip의 `MD Viewer.app`은 Apple Developer ID로 정식 서명·공증되지 않아 (GitHub Actions에서 ad-hoc 서명만 함) 다운로드 시 `com.apple.quarantine` 속성이 붙는다. 이 상태로 `.md`를 MDViewer로 열려고 하면 Gatekeeper가 `'<파일>.md'을(를) 열지 않음 — Apple은 ... 악성 코드가 없음을 확인할 수 없습니다.` 다이얼로그를 띄운다.

설치 후 한 번만 실행하면 해결된다:

```bash
# .app을 /Applications에 복사한 뒤
./scripts/macos-install.sh
# 또는 직접:
xattr -dr com.apple.quarantine "/Applications/MD Viewer.app"
```

그 다음 Finder에서 `.md` → 우클릭 → 다음으로 열기 → MD Viewer 한 번 선택하거나, "정보 가져오기 → 다음으로 열기 → MD Viewer → 모두 변경"으로 기본 핸들러를 지정한다. 이후 더블클릭이면 바로 열린다.

이미 다운로드한 `.md` 파일 자체에 quarantine이 붙어 있다면 (예: 브라우저로 받은 첨부) 그 파일도 같이 풀어준다:

```bash
xattr -d com.apple.quarantine /path/to/file.md
```
