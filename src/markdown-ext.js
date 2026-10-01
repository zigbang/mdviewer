/* ════════════════════════════════════════════════════════
   MD Viewer — markdown-ext.js
   marked 확장. 브라우저(window.MDV)와 Node 테스트(module.exports) 공용.
   ════════════════════════════════════════════════════════ */
(function (root) {
  // 취소선은 ~~텍스트~~ 만 인정한다.
  // marked 기본 GFM del 규칙(/^(~~?).../)은 단일 ~ 도 취소선으로 받아서
  // "32~183초 ... 00:17~00:47" 같은 범위 표기 사이 전체에 취소선이 그어진다.
  // 여는 ~~ 뒤·닫는 ~~ 앞 공백 금지, ~~~ 이상 제외는 기본 규칙과 동일.
  const DEL_DOUBLE_TILDE = /^~~(?=[^\s~])([\s\S]*?[^\s~])~~(?=[^~]|$)/

  const strikethroughExtension = {
    tokenizer: {
      del(src) {
        const cap = DEL_DOUBLE_TILDE.exec(src)
        if (cap) {
          return { type: 'del', raw: cap[0], text: cap[1], tokens: this.lexer.inlineTokens(cap[1]) }
        }
        // false 를 반환하면 marked 가 기본(단일 ~ 허용) 규칙으로 폴백하므로 undefined 반환
        return undefined
      }
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { strikethroughExtension }
  } else {
    const NS = (root.MDV = root.MDV || {})
    NS.strikethroughExtension = strikethroughExtension
  }
})(typeof window !== 'undefined' ? window : globalThis)
