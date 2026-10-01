// 취소선 회귀 시험 — 실행: npm test
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { Marked } = require('marked')
const { strikethroughExtension } = require('../src/markdown-ext.js')

const md = new Marked({ breaks: true, gfm: true }, strikethroughExtension)
const inline = s => md.parseInline(s)

test('단일 ~ 범위·근사 표기는 취소선이 아니다', () => {
  assert.strictEqual(inline('재시도 32~183초 동안, 그 뒤 00:17~00:47 구간'), '재시도 32~183초 동안, 그 뒤 00:17~00:47 구간')
  assert.strictEqual(inline('슬롯 #0~#11 사용'), '슬롯 #0~#11 사용')
  assert.strictEqual(inline('약 ~900초 대기, 그리고 ~1200초'), '약 ~900초 대기, 그리고 ~1200초')
  assert.strictEqual(inline('~단일~ 표기'), '~단일~ 표기')
})

test('~~텍스트~~ 는 취소선', () => {
  assert.strictEqual(inline('~~삭제~~ 정상'), '<del>삭제</del> 정상')
  assert.strictEqual(inline('~~**굵은** 취소선~~ 혼합'), '<del><strong>굵은</strong> 취소선</del> 혼합')
})

test('여는 ~~ 뒤·닫는 ~~ 앞 공백, ~~~ 는 취소선 아님', () => {
  assert.strictEqual(inline('a ~~ b ~~ c'), 'a ~~ b ~~ c')
  assert.strictEqual(inline('~~~ 세 개 ~~~'), '~~~ 세 개 ~~~')
})

test('샘플 문서 전체에 <del> 은 정확히 2개', () => {
  const html = md.parse(fs.readFileSync(path.join(__dirname, 'fixtures/strikethrough.md'), 'utf8'))
  assert.deepStrictEqual(html.match(/<del>.*?<\/del>/g), ['<del>삭제</del>', '<del><strong>굵은</strong> 취소선</del>'])
})
