import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

type Progreso = { fase: string; hecho: number; total: number }
type EstadoJuego = { estado: string; codigo?: number; salida?: string }

const api = {
  instancias: {
    listar: () => ipcRenderer.invoke('instancias:listar'),
    crear: (datos: { nombre: string; version: string; loader: string }) =>
      ipcRenderer.invoke('instancias:crear', datos),
    duplicar: (id: string) => ipcRenderer.invoke('instancias:duplicar', id),
    eliminar: (id: string) => ipcRenderer.invoke('instancias:eliminar', id),
    abrirCarpeta: (id: string) => ipcRenderer.invoke('instancias:abrirCarpeta', id)
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