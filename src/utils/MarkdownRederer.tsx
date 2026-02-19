import { Marked } from "marked";
import { markedHighlight } from "marked-highlight";
import markedKatex from "marked-katex-extension";
import hljs from "highlight.js";
import DOMPurify from "dompurify";

const marked = new Marked(
  markedHighlight({
    highlight(code, lang) {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value;
      }
      return hljs.highlightAuto(code).value;
    },
  }),
  markedKatex({ throwOnError: false }),
);

export function renderMarkdown(markdown: string): string {
  const raw = marked.parse(markdown) as string;
  return DOMPurify.sanitize(raw, {
    ADD_TAGS: ["semantics", "annotation", "mrow", "mi", "mo", "mn", "msup", "msub", "mfrac", "mover", "munder", "munderover", "msqrt", "mroot", "mtable", "mtr", "mtd", "mtext", "mspace", "mpadded", "mphantom", "menclose", "math"],
    ADD_ATTR: ["xmlns", "mathvariant", "display", "encoding", "stretchy", "fence", "separator", "accent", "accentunder", "columnalign", "rowalign", "columnspacing", "rowspacing", "columnlines", "rowlines", "frame", "framespacing", "equalrows", "equalcolumns", "displaystyle", "scriptlevel", "lspace", "rspace", "movablelimits", "largeop", "symmetric"],
  });
}
