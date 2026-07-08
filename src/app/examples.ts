import welcome from "../../examples/welcome.edd?raw";
import flowchart from "../../examples/flowchart.edd?raw";
import architecture from "../../examples/architecture.edd?raw";
import animatedArrows from "../../examples/animated-arrows.edd?raw";
import mermaidImport from "../../examples/mermaid-import.edd?raw";

export interface Example {
  name: string;
  source: string;
}

export const EXAMPLES: Example[] = [
  { name: "Welcome", source: welcome },
  { name: "Flowchart", source: flowchart },
  { name: "Architecture", source: architecture },
  { name: "Animated Arrows", source: animatedArrows },
  { name: "Mermaid", source: mermaidImport },
];
