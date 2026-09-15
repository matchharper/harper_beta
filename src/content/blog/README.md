# Legacy Blog Content

Blog posts are now stored in the Supabase `blog_posts` table and managed at
`/ops/blog`. Files in this directory are retained only as migration source and
are not read by the public blog.

- Korean and English versions share one database row.
- A version is public only when its category, title, excerpt, and Markdown body
  are all present.
- Publishing, pinning, thumbnail, related jobs, and related posts are managed in
  Ops.
