/// <reference types="vite/client" />

declare module '*.css?inline' {
  const css: string
  export default css
}

interface Window {
  ipcRenderer: {
    invoke(channel: string, ...args: unknown[]): Promise<unknown>
    on(channel: string, listener: (...args: unknown[]) => void): void
    off(channel: string, listener: (...args: unknown[]) => void): void
    send(channel: string, ...args: unknown[]): void
  }
}
