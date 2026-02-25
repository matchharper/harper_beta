# Blog Authoring Guide

1. Copy `_template.md` and rename it to `YYYY-MM-DD-your-slug.md`.
2. Fill frontmatter fields at the top of the file.
3. Write the body in Markdown.
4. Commit and deploy.

## Rules

- Keep `publishedAt` and `updatedAt` in `YYYY-MM-DD` format.
- Use `is_pinned: "true"` to pin posts in the top blog section.
- The left featured card picks the most recent `is_pinned` post.
- Use image paths from `public/` (example: `/images/usemain.png`).
- Avoid duplicate file names; the file name becomes the URL slug.

## URL Example

`src/content/blog/2026-02-24-seo-playbook.md` -> `/blog/2026-02-24-seo-playbook`
