# 코드블록 확대 팝업 설계

**날짜:** 2026-08-18
**상태:** 구현 완료
**관련:** `feat(diagram): per-diagram zoom viewer for mermaid` (1cf49b6) 의 확장

## 배경

`<pre>` 코드블록에 긴 줄이 들어오면 블록 안에서 가로 스크롤을 해야 해서 읽기 불편하다.
mermaid 다이어그램은 이미 확대 팝업(`#diagram-overlay`)이 있으므로, 코드블록도 같은 방식으로
팝업에 띄워 넓은 화면 폭을 그대로 쓰게 한다.

**요구사항:** 팝업에서 코드의 **원본 스타일(하이라이팅 포함)을 유지**하고, 줄바꿈 없이
원본 레이아웃을 그대로 보여준다. UX는 mermaid 뷰어와 동일 (줌·팬·Esc·배경 클릭 닫기).

wrap 토글은 채택하지 않았다 (YAGNI — 넓은 팝업 폭으로 대부분 해소).

## 설계

### 1. 오버레이 일반화

기존 `#diagram-overlay` / `#diagram-viewport` / `#diagram-content`를 그대로 재사용한다.
상태만 일반화:

| 변경 전 | 변경 후 |
|---------|---------|
| `diagramSvg` | `diagramTarget` + `diagramKind` (`'svg' \| 'code'`) |
| — | `diagramBaseFontPx` (코드 확대 기준 폰트 크기) |

`applyDiagramScale()`만 종류별로 분기하고, 줌·팬·Ctrl+휠·키보드 스크롤·Esc·배경 클릭 닫기
로직은 전부 공용으로 둔다.

- **svg**: `style.width = baseWidth × scale` (기존과 동일)
- **code**: stage의 `style.fontSize = basePx × scale`

**폰트 크기 방식을 쓰는 이유** — `pre`는 `white-space: pre`이므로 글자가 커지면 블록의
내재 폭·높이가 함께 커져 뷰포트의 스크롤 범위가 자동으로 정확히 갱신된다.
`transform: scale()`은 스크롤 범위를 갱신하지 않아 별도 보정이 필요하고 고배율에서 선명도도 떨어진다.

### 2. 스타일 보존

- `pre.cloneNode(true)` — highlight.js가 DOM에 심어둔 `<span class="hljs-*">`가 함께 복제되므로
  하이라이팅·색상이 그대로 유지된다. hljs 테마 CSS는 `.hljs` 기준이라 오버레이 안에서도 적용된다.
- 스코프 확장: `#preview pre` → `#preview pre, #diagram-content pre` (동일하게 `pre code`도).
  `pre code`의 `font-size: 0.875em`은 상대값이라 stage의 배율이 그대로 전달된다.
- stage는 `.diagram-stage.code-stage` — `pre`가 배경·테두리를 가지므로 stage는 배경/테두리/패딩 제거.
- 오버레이 내부 `pre`는 `overflow: visible` — 스크롤은 `#diagram-viewport`가 전담해 이중 스크롤바를 막는다.
- 초기 배율 **100% 고정**. mermaid는 "뷰포트 폭 채우기"가 맞지만, 코드는 원본 가독 크기가 기준이고
  넓은 오버레이 폭 자체가 이미 이득이다.

### 3. 버튼 부착

- `attachCodeZoomButtons()`를 `renderMarkdown()` 파이프라인의 `renderKatex()` 뒤에서 호출한다.
  레이아웃이 확정된 뒤여야 넘침 측정이 정확하다.
- 대상 조건: `pre.scrollWidth > pre.clientWidth + 1 || pre.offsetHeight > 240`
  (짧은 샘플 코드에는 버튼을 달지 않아 본문이 지저분해지지 않는다. mermaid는 `div.mermaid`라 자연히 제외)
- `.mermaid-zoom-btn` → `.block-zoom-btn`으로 이름을 일반화해 스타일·hover·`top`/`bottom` 배치·
  print 숨김 규칙을 mermaid와 공유한다.

### 4. `.pre-zoom-host` 래퍼 (필수)

`pre`는 스크롤 컨테이너다. 버튼을 `pre`의 자식으로 넣으면 절대 위치의 컨테이닝 블록이
`pre`의 패딩 박스가 되어 **가로 스크롤 시 버튼이 콘텐츠와 함께 밀려 사라진다.**
가로로 긴 블록이 바로 이 기능의 대상이므로 치명적이다.

→ `pre`를 `div.pre-zoom-host`(`position: relative`)로 감싸고 버튼을 래퍼에 붙인다.
hover 규칙도 `#preview .pre-zoom-host:hover .block-zoom-btn`으로 맞춘다.
재렌더 시 중복 래핑을 막기 위해 `pre.parentNode`가 이미 래퍼인지 검사한다.

### 5. 코드 팝업에서의 텍스트 선택

기존 팬 핸들러는 `mousedown`에서 `preventDefault()`를 호출해 드래그 팬을 구현한다.
코드 팝업에서 이대로면 **코드를 선택·복사할 수 없다.**

→ `diagramKind === 'code'`이고 mousedown 대상이 여백(`#diagram-viewport` / `#diagram-content`)이
아니면 팬을 시작하지 않는다. 본문 위 드래그는 텍스트 선택, 팬은 여백 드래그·휠·스크롤바로 한다.
mermaid 동작은 그대로다. 오버레이 내부 `pre`에는 `cursor: text`를 준다.

## 영향 범위

| 파일 | 변경 |
|------|------|
| `src/app.js` | 상태 일반화, `attachZoomButtons()` 공용화, `attachCodeZoomButtons()`, `openCodeViewer()`, `showViewerStage()` 추출, 팬 핸들러 예외 |
| `src/style.css` | `.block-zoom-btn` 리네임, `.pre-zoom-host`, `#diagram-content pre` / `.code-stage` 규칙, 셀렉터 스코프 확장 |
| `src/index.html` | 변경 없음 (기존 오버레이 마크업 재사용) |

탭 전환·파일 재렌더 시 `renderMarkdown()`을 다시 타므로 버튼 재부착도 mermaid와 동일 경로로 처리된다.

## 수동 검증 항목

1. 짧은 코드블록 → 버튼 없음
2. 가로로 넘치는 블록 → 버튼 표시, 팝업에서 하이라이팅·배경·테두리 유지
3. 세로 240px 초과 블록 → 위·아래 양쪽 버튼
4. 팝업에서 `+`/`-`/`Ctrl+휠` 줌, 배율 클릭 리셋, 방향키/PageUp·Down 스크롤, Esc·여백 클릭 닫기
5. 팝업에서 코드 드래그 선택 → 복사 가능
6. 가로 스크롤 후에도 버튼이 제자리에 있음
7. mermaid 확대 회귀 없음
8. 라이트 테마에서 코드 색상 정상
