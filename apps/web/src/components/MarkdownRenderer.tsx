import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import { CodeBlock } from "./CodeBlock";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

/**
 * NexaDesk Markdown Renderer
 * Renders markdown content with GFM (tables, strikethrough, etc.),
 * math equations (KaTeX), and raw HTML support.
 */
export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  className = "",
}) => {
  return (
    <div className={`prose prose-sm max-w-none dark:prose-invert ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeRaw]}
        components={{
          // Custom code block rendering with syntax highlighting
          code({ node, className: codeClassName, children, ...props }) {
            const match = /language-(\w+)/.exec(codeClassName || "");
            const isInline = !match;

            if (isInline) {
              return (
                <code
                  className={`${codeClassName} bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded text-sm font-mono`}
                  {...props}
                >
                  {children}
                </code>
              );
            }

            const codeString = String(children).replace(/\n$/, "");
            const language = match ? match[1] : "text";

            return (
              <CodeBlock language={language} showLineNumbers={codeString.split("\n").length > 2}>
                {codeString}
              </CodeBlock>
            );
          },

          // Custom table rendering
          table({ children, ...props }) {
            return (
              <div className="overflow-x-auto my-4">
                <table
                  className="min-w-full border-collapse border border-current/20"
                  {...props}
                >
                  {children}
                </table>
              </div>
            );
          },

          thead({ children, ...props }) {
            return (
              <thead className="bg-current/5" {...props}>
                {children}
              </thead>
            );
          },

          th({ children, ...props }) {
            return (
              <th
                className="px-4 py-2 border border-current/20 text-left font-semibold text-sm"
                {...props}
              >
                {children}
              </th>
            );
          },

          td({ children, ...props }) {
            return (
              <td
                className="px-4 py-2 border border-current/20 text-sm"
                {...props}
              >
                {children}
              </td>
            );
          },

          // Custom blockquote
          blockquote({ children, ...props }) {
            return (
              <blockquote
                className="border-l-4 border-current/30 pl-4 italic text-secondary my-4"
                {...props}
              >
                {children}
              </blockquote>
            );
          },

          // Custom link rendering
          a({ children, href, ...props }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline hover:text-primary-hover transition-colors"
                {...props}
              >
                {children}
              </a>
            );
          },

          // Custom list rendering
          ul({ children, ...props }) {
            return (
              <ul className="list-disc list-inside space-y-1 my-2" {...props}>
                {children}
              </ul>
            );
          },

          ol({ children, ...props }) {
            return (
              <ol
                className="list-decimal list-inside space-y-1 my-2"
                {...props}
              >
                {children}
              </ol>
            );
          },

          // Custom horizontal rule
          hr(props) {
            return (
              <hr
                className="my-6 border-t border-current/20"
                {...props}
              />
            );
          },

          // Custom heading rendering
          h1({ children, ...props }) {
            return (
              <h1
                className="text-2xl font-bold mt-6 mb-3 text-primary"
                {...props}
              >
                {children}
              </h1>
            );
          },

          h2({ children, ...props }) {
            return (
              <h2
                className="text-xl font-bold mt-5 mb-2 text-primary"
                {...props}
              >
                {children}
              </h2>
            );
          },

          h3({ children, ...props }) {
            return (
              <h3
                className="text-lg font-semibold mt-4 mb-2"
                {...props}
              >
                {children}
              </h3>
            );
          },

          // Custom paragraph
          p({ children, ...props }) {
            return (
              <p className="my-2 leading-relaxed" {...props}>
                {children}
              </p>
            );
          },

          // Custom image rendering
          img({ src, alt, ...props }) {
            return (
              <img
                src={src}
                alt={alt || ""}
                className="max-w-full h-auto rounded-lg my-4"
                loading="lazy"
                {...props}
              />
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;
