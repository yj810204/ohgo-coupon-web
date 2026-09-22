/** iframe srcDoc 등 부모 CSS를 못 받는 HTML 문서용 */
export const OHGO_ISOLATED_HTML_WORD_BREAK_CSS = `
  html, body, p, h1, h2, h3, h4, h5, h6, li, td, th, dt, dd, span, a, div {
    word-break: keep-all;
    overflow-wrap: break-word;
  }
`;
