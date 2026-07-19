/**
 * Public entry point for the character library. The implementation lives in
 * ./characters/* (one module per axis + the renderer); this thin barrel keeps
 * the historical `@engine/viz/characters.js` import path stable.
 */
export * from "./characters/index.js";
