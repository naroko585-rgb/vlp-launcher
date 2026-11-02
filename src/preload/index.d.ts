import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Instancia {
    id: string
    nombre: string
    version: string
    loader: 'vanilla' | 'fabric' | 'forge' | 'neoforge'
    creada: string
  }

  interface Window {
    electron: ElectronAPI
    api: {
      instancias: {
        listar: () => Promise<Instancia[]>
        crear: (datos: { nombre: string; version: string; loader: string }) => Promise<Instancia>
        duplicar: (id: string) => Promise<Instancia>
        eliminar: (id: string) => Promise<void>
        abrirCarpeta: (id: string) => Promise<void>
      }
      minecraft: {
        versiones: () => Promise<string[]>
        descargar: (version: string) => Promise<void>
        onProgreso: (
          callback: (version: string, p: { fase: string; hecho: number; total: number }) => void
        ) => () => void
        jugar: (id: string, usuario: string) => Promise<void>
        onEstado: (
          callback: (id: string, e: { estado: string; codigo?: number; salida?: string }) => void
        ) => () => void
      }
    }
  }
}