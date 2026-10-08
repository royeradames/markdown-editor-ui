import Markdown from "react-markdown";
import { safeLink } from "../lib/markdown-policy.ts";

export function MarkdownPreview({ content }: { content: string }) {
  return <div className="rendered-markdown"><Markdown skipHtml urlTransform={(url, key) => key === "href" ? safeLink(url) ?? "" : ""} components={{
    a: ({ href, children }) => {
      const destination = safeLink(href);
      return destination ? <a href={destination} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{children}<span className="link-destination"> ({destination})</span></a> : <span>{children} (link disabled)</span>;
    },
    img: ({ alt }) => <span className="inert-image">[Image: {alt || "No alternative text"} — not loaded]</span>,
  }}>{content}</Markdown></div>;
}
