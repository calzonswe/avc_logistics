// The translation bundles are plain JSON (imported by Vite).
declare module '*.json' {
  const value: Record<string, unknown>;
  export default value;
}
