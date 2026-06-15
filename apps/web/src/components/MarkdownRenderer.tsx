import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import { CodeBlock } from "./CodeBlock";
import { MermaidDiagram, isMermaidCode } from "./MermaidDiagram";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  className = "",
}) => {
  return (
    <div className={prose prose-sm max-w-none dark:prose-invert }>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeRaw]}
        components={{
          // Custom code block: Mermaid diagram or syntax-highlighted code
          code({ node, className: codeClassName, children, ...props }) {
            const match = /language-(\w+)/.exec(codeClassName || "");
            const isInline = !match;

            if (isInline) {
              return (
                <code
                  className={${codeClassName} bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded text-sm font-mono}
                  {...props}
                >
                  {children}
                </code>
              );
            }

            const codeString = String(children).replace(/\n$/, "");
            const language = match ? match[1] : "text";

            // Render Mermaid diagrams when language is "mermaid"
            if (language === "mermaid" && isMermaidCode(codeString)) {
              return <MermaidDiagram chart={codeString} />;
            }

            return (
              <CodeBlock language={language} showLineNumbers={codeString.split("\n").length > 2}>
                {codeString}
              </CodeBlock>
            );
          },

          table({ children, ...props }) {
            return (
              <div className="overflow-x-auto my-4">
                <table className="min-w-full border-collapse border border-current/20" {...props}>
                  {children}
                </table>
              </div>
            );
          },

          thead({ children, ...props }) {
            return <thead className="bg-current/5" {...props}>{children}</thead>;
          },

          th({ children, ...props }) {
            return (
              <th className="px-4 py-2 border border-current/20 text-left font-semibold text-sm" {...props}>
                {children}
              </th>
            );
          },

          td({ children, ...props }) {
            return (
              <td className="px-4 py-2 border border-current/20 text-sm" {...props}>
                {children}
              </td>
            );
          },

          blockquote({ children, ...props }) {
            return (
              <blockquote className="border-l-4 border-current/30 pl-4 italic text-secondary my-4" {...props}>
                {children}
              </blockquote>
            );
          },

          a({ children, href, ...props }) {
            return (
              <a href={href} target="_blank" rel="noopener noreferrer"
                className="text-primary underline hover:text-primary-hover transition-colors" {...props}>
                {children}
              </a>
            );
          },

          ul({ children, ...props }) {
            return <ul className="list-disc list-inside space-y-1 my-2" {...props}>{children}</ul>;
          },

          ol({ children, ...props }) {
            return <ol className="list-decimal list-inside space-y-1 my-2" {...props}>{children}</ol>;
          },

          hr(props) {
            return <hr className="my-6 border-t border-current/20" {...props} />;
          },

          h1({ children, ...props }) {
            return <h1 className="text-2xl font-bold mt-6 mb-3 text-primary" {...props}>{children}</h1>;
          },

          h2({ children, ...props }) {
            return <h2 className="text-xl font-bold mt-5 mb-2 text-primary" {...props}>{children}</h2>;
          },

          h3({ children, ...props }) {
            return <h3 className="text-lg font-semibold mt-4 mb-2" {...props}>{children}</h3>;
          },

          p({ children, ...props }) {
            return <p className="my-2 leading-relaxed" {...props}>{children}</p>;
          },

          img({ src, alt, ...props }) {
            return <img src={src} alt={alt || ""} className="max-w-full h-auto rounded-lg my-4" loading="lazy" {...props} />;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;