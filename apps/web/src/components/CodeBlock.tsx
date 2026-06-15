import React, { useState, useCallback } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";

interface CodeBlockProps {
  language?: string;
  children: string;
  showLineNumbers?: boolean;
  darkMode?: boolean;
}

/**
 * NexaDesk Code Block with syntax highlighting and copy button.
 * Uses react-syntax-highlighter with Prism engine.
 */
export const CodeBlock: React.FC<CodeBlockProps> = ({
  language = "text",
  children,
  showLineNumbers = true,
  darkMode = true,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = children;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [children]);

  return (
    <div className="relative group rounded-lg overflow-hidden my-4 border border-current/10">
      {/* Header bar with language and copy button */}
      <div className="flex items-center justify-between px-4 py-2 bg-black/5 dark:bg-white/5 border-b border-current/10">
        <span className="text-xs font-mono text-secondary">
          {language}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2 py-1 text-xs rounded
                     text-secondary hover:text-primary hover:bg-primary-muted
                     transition-all duration-200 cursor-pointer"
          title="Copy to clipboard"
        >
          {copied ? (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Copied!</span>
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code content */}
      <SyntaxHighlighter
        language={language}
        style={darkMode ? oneDark : oneLight}
        showLineNumbers={showLineNumbers}
        wrapLines={true}
        customStyle={{
          margin: 0,
          padding: "1rem",
          borderRadius: 0,
          fontSize: "0.875rem",
          lineHeight: "1.5",
          background: "transparent",
        }}
        lineNumberStyle={{
          minWidth: "2.5em",
          paddingRight: "1em",
          opacity: 0.4,
        }}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  );
};

/**
 * Inline code component for use within markdown text.
 */
export const InlineCode: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = "",
}) => {
  return (
    <code
      className={`px-1.5 py-0.5 rounded text-sm font-mono bg-black/5 dark:bg-white/10 ${className}`}
    >
      {children}
    </code>
  );
};

export default CodeBlock;
