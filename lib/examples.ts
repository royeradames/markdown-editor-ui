// The official challenge's starter documents, verbatim from starter/data.json (the packet's starter-code/data.json).
// Its createdAt "04-01-2022" is 1 April 2022; noon UTC keeps that calendar day in every time zone from UTC-11 to UTC+11.
// UUIDs stand in for the packet's missing IDs; updatedAt 0 marks a record nobody has saved yet.
import { librarySchema } from "./documents.ts";
export const exampleLibrary = librarySchema.parse({
  "version": 1,
  "revision": "00000000-0000-4000-8000-000000000000",
  "documents": [
    {
      "id": "00000000-0000-4000-8000-000000000001",
      "name": "untitled-document.md",
      "content": "",
      "createdAt": 1648814400000,
      "updatedAt": 0
    },
    {
      "id": "00000000-0000-4000-8000-000000000002",
      "name": "welcome.md",
      "content": "# Welcome to Markdown\n\nMarkdown is a lightweight markup language that you can use to add formatting elements to plaintext text documents.\n\n## How to use this?\n\n1. Write markdown in the markdown editor window\n2. See the rendered markdown in the preview window\n\n### Features\n\n- Create headings, paragraphs, links, blockquotes, inline-code, code blocks, and lists\n- Name and save the document to access again later\n- Choose between Light or Dark mode depending on your preference\n\n> This is an example of a blockquote. If you would like to learn more about markdown syntax, you can visit this [markdown cheatsheet](https://www.markdownguide.org/cheat-sheet/).\n\n#### Headings\n\nTo create a heading, add the hash sign (#) before the heading. The number of number signs you use should correspond to the heading level. You'll see in this guide that we've used all six heading levels (not necessarily in the correct way you should use headings!) to illustrate how they should look.\n\n##### Lists\n\nYou can see examples of ordered and unordered lists above.\n\n###### Code Blocks\n\nThis markdown editor allows for inline-code snippets, like this: `<p>I'm inline</p>`. It also allows for larger code blocks like this:\n\n```\n<main>\n  <h1>This is a larger code block</h1>\n</main>\n```",
      "createdAt": 1648814400000,
      "updatedAt": 0
    }
  ],
  "selectedId": "00000000-0000-4000-8000-000000000002",
  "theme": "light"
});
