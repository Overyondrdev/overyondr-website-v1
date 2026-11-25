// Files bundled by wrangler.toml [[rules]].
declare module '*.html' { const text: string; export default text; }
declare module '*.css' { const text: string; export default text; }
declare module '*.svg' { const text: string; export default text; }
declare module '*.txt' { const text: string; export default text; }
declare module '*.woff2' { const data: ArrayBuffer; export default data; }
declare module '*/app.js' { const text: string; export default text; }
declare module '*/render.js' { const text: string; export default text; }
declare module '*/editor.js' { const text: string; export default text; }
