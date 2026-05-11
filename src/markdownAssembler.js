// Assembles the final .md file content from draft data
import matter from 'gray-matter';

export function assembleMarkdown(draft) {
  const { frontMatter, content } = draft;

  // Strip existing front matter from content if present
  const { content: bodyOnly } = matter(content);

  // Build YAML front matter
  const fm = {
    title: frontMatter.title,
    date: frontMatter.date,
    author: frontMatter.author,
    description: frontMatter.description,
    tags: frontMatter.tags,
    image: frontMatter.image,
    og_image: frontMatter.og_image,
    canonical: frontMatter.canonical,
    reading_time: frontMatter.reading_time,
    draft: false,
    schema_type: frontMatter.schema_type || 'Article',
  };

  return matter.stringify(bodyOnly, fm);
}
