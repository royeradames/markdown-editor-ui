import Markdown from "react-markdown";
import { safeLink } from "../lib/markdown-policy.ts";

// Raw HTML is skipped, only absolute http(s)/mailto links survive, and images never load (they show their alt text).
export function MarkdownPreview({ content }: { content: string }) {
  return <div className="rendered-markdown"><Markdown skipHtml urlTransform={(url, key) => key === "href" ? safeLink(url) ?? "" : ""} components={{
    a: ({ href, children }) => {
      const destination = safeLink(href);
      return destination ? <a href={destination} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" title={destination}>{children}<span className="sr-only"> (opens in a new tab)</span></a> : <span>{children}</span>;
    },
    img: ({ alt }) => <span className="inert-image">[Image: {alt || "no description"}]</span>,
  }}>{content}</Markdown></div>;
}
