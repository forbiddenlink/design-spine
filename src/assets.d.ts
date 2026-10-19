interface ImportMeta {
  readonly spineWorker?: string
}

declare module '*.css' {
  const path: string
  export default path
}

declare module '*ui/review.js' {
  const path: string
  export default path
}
