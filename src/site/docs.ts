/**
 * Docs manifest — the markdown guides rendered by the site. This site is the
 * single source of truth: when the engine changes, update the matching guide.
 */

import architecture from "../../docs/ARCHITECTURE.md?raw";
import devStandards from "../../docs/DEVELOPMENT_STANDARDS.md?raw";
import language from "../../docs/DSL_LANGUAGE_GUIDE.md?raw";
import visualizations from "../../docs/VISUALIZATIONS_GUIDE.md?raw";
import styles from "../../docs/STYLES_GUIDE.md?raw";
import cameraTimeline from "../../docs/CAMERA_AND_TIMELINE_GUIDE.md?raw";
import annotations from "../../docs/ANNOTATIONS_GUIDE.md?raw";
import importExport from "../../docs/IMPORT_AND_EXPORT_GUIDE.md?raw";
import extending from "../../docs/EXTENDING_GUIDE.md?raw";
import integration from "../../docs/INTEGRATION_GUIDE.md?raw";

export interface DocPage {
  slug: string;
  title: string;
  group: string;
  content: string;
}

export const DOC_PAGES: DocPage[] = [
  { slug: "language", title: "Language reference", group: "Learn", content: language },
  { slug: "visualizations", title: "Visualizations", group: "Learn", content: visualizations },
  { slug: "styles", title: "Style presets", group: "Learn", content: styles },
  { slug: "camera-timeline", title: "Camera & timeline", group: "Learn", content: cameraTimeline },
  { slug: "annotations", title: "Annotations", group: "Learn", content: annotations },
  { slug: "import-export", title: "Import & export", group: "Learn", content: importExport },
  { slug: "integration", title: "Embed in your app", group: "Build with it", content: integration },
  { slug: "extending", title: "Extend & make plugins", group: "Build with it", content: extending },
  { slug: "architecture", title: "Architecture", group: "Internals", content: architecture },
  { slug: "development", title: "Development standards", group: "Internals", content: devStandards },
];

export const DOC_GROUPS = ["Learn", "Build with it", "Internals"];
