import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Instancia {
    id: string
    nombre: string
    version: string
    loader: 'vanilla' | 'fabric' | 'forge' | 'neoforge'
    creada: string
    loaderVersion?: string
    memoriaMB?: number
    evento?: { id: string; revision: number; manifiesto: string; servidor: string }
  }

  interface ResultadoMod {
    project_id: string
    title: string
    description: string
    icon_url: string | null
    downloads: number
    author: string
  }

  interface ModLocal {
    archivo: string
    activo: boolean
    tamano: number
  }

  interface InfoEvento {
    id: string
    nombre: string
    descripcion: string
    minecraft: string
    loader: string
    revision: number
    servidor: string
    archivos: number
    tamano: number
    error: string
    estado: 'no_instalado' | 'al_dia' | 'actualizacion'
    idInstancia: string
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
        ajustarMemoria: (id: string, mb: number) => Promise<Instancia>
      }
      sistema: {
        memoriaMaxima: () => Promise<number>
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
      mods: {
        buscar: (id: string, consulta: string) => Promise<ResultadoMod[]>
        instalar: (
          id: string,
          projectId: string
        ) => Promise<{ instalados: string[]; avisos: string[] }>
        listar: (id: string) => Promise<ModLocal[]>
        alternar: (id: string, archivo: string) => Promise<void>
        eliminar: (id: string, archivo: string) => Promise<void>
      }
      eventos: {
        config: () => Promise<{ catalogoUrl: string }>
        guardarConfig: (url: string) => Promise<string>
        listar: () => Promise<{ lista: InfoEvento[]; sinConexion: boolean }>
        instalar: (id: string) => Promise<Instancia>
        onProgreso: (
          callback: (id: string, p: { fase: string; hecho: number; total: number }) => void
        ) => () => void
      }
    }
  }
}