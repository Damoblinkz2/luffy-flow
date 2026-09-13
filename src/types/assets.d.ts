/** Lets TypeScript type the shared PNG logo that Vite and Plasmo bundle for UI surfaces. */
declare module "*.png" {
  const assetUrl: string
  export default assetUrl
}
