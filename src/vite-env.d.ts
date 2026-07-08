/// <reference types="vite/client" />

declare module "*.edd?raw" {
  const content: string;
  export default content;
}
