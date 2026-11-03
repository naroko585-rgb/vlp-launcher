import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

type Progreso = { fase: string; hecho: number; total: number }
type EstadoJuego = { estado: string; codigo?: number; salida?: string }
type EstadoActualizacion = {
  estado: string
  version?: string
  porcentaje?: number
  mensaje?: string
}

const api = {
  instancias: {
    listar: () => ipcRenderer.invoke('instancias:listar'),
    crear: (datos: { nombre: string; version: string; loader: string }) =>
      ipcRenderer.invoke('instancias:crear', datos),
    duplicar: (id: string) => ipcRenderer.invoke('instancias:duplicar', id),
    eliminar: (id: string) => ipcRenderer.invoke('instancias:eliminar', id),
    abrirCarpeta: (id: string) => ipcRenderer.invoke('instancias:abrirCarpeta', id),
    ajustarMemoria: (id: string, mb: number) => ipcRenderer.invoke('instancias:memoria', id, mb)
  },
  sistema: {
    memoriaMaxima: (): Promise<number> => ipcRenderer.invoke('sistema:memoria')
  },
  minecraft: {
    versiones: (): Promise<string[]> => ipcRenderer.invoke('minecraft:versiones'),
    descargar: (version: string): Promise<void> =>
      ipcRenderer.invoke('minecraft:descargar', version),
    onProgreso: (callback: (version: string, p: Progreso) => void): (() => void) => {
      const manejador = (_e: unknown, version: string, p: Progreso): void => callback(version, p)
      ipcRenderer.on('minecraft:progreso', manejador)
      return () => ipcRenderer.removeListener('minecraft:progreso', manejador)
    },
    jugar: (id: string, usuario: string): Promise<void> =>
      ipcRenderer.invoke('minecraft:jugar', id, usuario),
    onEstado: (callback: (id: string, e: EstadoJuego) => void): (() => void) => {
      const manejador = (_e: unknown, id: string, e: EstadoJuego): void => callback(id, e)
      ipcRenderer.on('minecraft:estado', manejador)
      return () => ipcRenderer.removeListener('minecraft:estado', manejador)
    }
  },
  mods: {
    buscar: (id: string, consulta: string) => ipcRenderer.invoke('mods:buscar', id, consulta),
    instalar: (id: string, projectId: string) =>
      ipcRenderer.invoke('mods:instalar', id, projectId),
    listar: (id: string) => ipcRenderer.invoke('mods:listar', id),
    alternar: (id: string, archivo: string) => ipcRenderer.invoke('mods:alternar', id, archivo),
    eliminar: (id: string, archivo: string) => ipcRenderer.invoke('mods:eliminar', id, archivo)
  },
  eventos: {
    config: () => ipcRenderer.invoke('eventos:config'),
    guardarConfig: (url: string) => ipcRenderer.invoke('eventos:guardarConfig', url),
    listar: () => ipcRenderer.invoke('eventos:listar'),
    instalar: (id: string) => ipcRenderer.invoke('eventos:instalar', id),
    onProgreso: (callback: (id: string, p: Progreso) => void): (() => void) => {
      const manejador = (_e: unknown, id: string, p: Progreso): void => callback(id, p)
      ipcRenderer.on('eventos:progreso', manejador)
      return () => ipcRenderer.removeListener('eventos:progreso', manejador)
    }
  },
  app: {
    version: (): Promise<string> => ipcRenderer.invoke('app:version'),
    estadoActualizacion: (): Promise<EstadoActualizacion> =>
      ipcRenderer.invoke('app:estadoActualizacion'),
    buscarActualizacion: (): Promise<void> => ipcRenderer.invoke('app:buscarActualizacion'),
    descargarActualizacion: (): Promise<void> => ipcRenderer.invoke('app:descargarActualizacion'),
    instalarActualizacion: (): Promise<void> => ipcRenderer.invoke('app:instalarActualizacion'),
    onActualizacion: (callback: (e: EstadoActualizacion) => void): (() => void) => {
      const manejador = (_e: unknown, estado: EstadoActualizacion): void => callback(estado)
      ipcRenderer.on('app:actualizacion', manejador)
      return () => ipcRenderer.removeListener('app:actualizacion', manejador)
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}