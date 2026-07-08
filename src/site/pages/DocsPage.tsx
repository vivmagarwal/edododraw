import { useMemo } from "react";
import { marked } from "marked";
import { DOC_GROUPS, DOC_PAGES } from "../docs.js";
import { navigate } from "../router.js";

marked.setOptions({ gfm: true, breaks: false });

export function DocsPage({ slug }: { slug?: string }) {
  const page = DOC_PAGES.find((p) => p.slug === slug) ?? DOC_PAGES[0];
  const html = useMemo(() => marked.parse(page.content) as string, [page.content]);

  return (
    <div className="page docs-layout">
      <nav className="docs-nav">
        <a className="docs-llms" href={`${import.meta.env.BASE_URL}llms-full.txt`} target="_blank" rel="noreferrer" title="All docs + examples in one plain-text file, ideal for pasting into an LLM">
          📄 llms-full.txt
          <span>all docs + examples · one file for LLMs</span>
        </a>
        {DOC_GROUPS.map((group) => (
          <div key={group} className="docs-nav-group">
            <div className="docs-nav-title">{group}</div>
            {DOC_PAGES.filter((p) => p.group === group).map((p) => (
              <a
                key={p.slug}
                href={`#/docs/${p.slug}`}
                className={p.slug === page.slug ? "active" : ""}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(`/docs/${p.slug}`);
                }}
              >
                {p.title}
              </a>
            ))}
          </div>
        ))}
      </nav>
      <article className="docs-content markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
