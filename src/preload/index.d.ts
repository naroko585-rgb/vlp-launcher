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
      }
    }
  }
}