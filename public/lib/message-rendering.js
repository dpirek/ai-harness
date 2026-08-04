const CODE_LANGUAGES = {
  html: "HTML",
  css: "CSS",
  js: "JavaScript",
  javascript: "JavaScript",
};

function tokenClass(token, language) {
  if (/^\s+$/.test(token)) return "";
  if (/^\/\*[\s\S]*\*\/$|^\/\//.test(token) || /^<!--[\s\S]*-->$/.test(token)) return "syntax-comment";
  if (/^["'`]/.test(token)) return "syntax-string";
  if (/^\d/.test(token) || /^#[\da-f]{3,8}$/i.test(token)) return "syntax-number";
  if (language === "html" && /^</.test(token)) return "syntax-tag";
  if (language === "css" && /^(?:--)?[\w-]+$/.test(token)) return "syntax-property";
  if (/^(?:const|let|var|function|return|if|else|for|while|class|new|import|export|from|async|await|try|catch|throw|true|false|null|undefined|this|typeof|switch|case|break|continue|extends|static)$/.test(token)) return "syntax-keyword";
  if (/^[{}()[\].,;:]$|^(?:=>|===?|!==?|<=?|>=?|&&|\|\||[+*/%!-])$/.test(token)) return "syntax-operator";
  if (language === "css" && /^@/.test(token)) return "syntax-keyword";
  return "";
}

function highlightCode(code, language) {
  const fragment = document.createDocumentFragment();
  const patterns = {
    html: /<!--[\s\S]*?-->|<!DOCTYPE[^>]*>|<\/?[^>]+>/gi,
    css: /\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|#[\da-f]{3,8}\b|@[\w-]+|--[\w-]+|[\w-]+(?=\s*:)|\b\d+(?:\.\d+)?(?:px|rem|em|vh|vw|%|s|ms)?\b|[{}()[\].,;:]|[>+~*=/!-]/gi,
    javascript: /\/\*[\s\S]*?\*\/|\/\/[^\n]*|`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:const|let|var|function|return|if|else|for|while|class|new|import|export|from|async|await|try|catch|throw|true|false|null|undefined|this|typeof|switch|case|break|continue|extends|static)\b|\b\d+(?:\.\d+)?\b|=>|===?|!==?|<=?|>=?|&&|\|\||[{}()[\].,;:+*/%!-]/g,
  };
  const normalized = language === "js" ? "javascript" : language;
  const pattern = patterns[normalized];
  if (!pattern) {
    fragment.append(document.createTextNode(code));
    return fragment;
  }
  let cursor = 0;
  for (const match of code.matchAll(pattern)) {
    if (match.index > cursor) fragment.append(document.createTextNode(code.slice(cursor, match.index)));
    const span = document.createElement("span");
    span.className = tokenClass(match[0], normalized);
    span.textContent = match[0];
    fragment.append(span);
    cursor = match.index + match[0].length;
  }
  if (cursor < code.length) fragment.append(document.createTextNode(code.slice(cursor)));
  return fragment;
}

function appendMessageText(container, text) {
  const value = String(text);
  const fencePattern = /^```([\w+-]*)[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gm;
  let cursor = 0;
  for (const match of value.matchAll(fencePattern)) {
    if (match.index > cursor) {
      const paragraph = document.createElement("p");
      paragraph.textContent = value.slice(cursor, match.index).replace(/\n+$/, "");
      if (paragraph.textContent) container.append(paragraph);
    }
    const language = match[1].toLowerCase();
    const block = document.createElement("div");
    block.className = "codeBlock";
    const label = document.createElement("div");
    label.className = "codeLanguage";
    label.textContent = CODE_LANGUAGES[language] || language || "Code";
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.className = language ? `language-${language}` : "";
    code.append(highlightCode(match[2].replace(/\r?\n$/, ""), language));
    pre.append(code);
    block.append(label, pre);
    container.append(block);
    cursor = match.index + match[0].length;
  }
  if (cursor < value.length) {
    const paragraph = document.createElement("p");
    paragraph.textContent = value.slice(cursor).replace(/^\n+/, "");
    if (paragraph.textContent) container.append(paragraph);
  }
}

export { appendMessageText, highlightCode };
