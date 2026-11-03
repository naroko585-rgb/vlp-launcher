import { Component, useState } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import Inicio from './pages/Inicio'
import Eventos from './pages/Eventos'
import Biblioteca from './pages/Biblioteca'
import Mods from './pages/Mods'

type Seccion = 'inicio' | 'eventos' | 'biblioteca' | 'mods'

const MENU: { id: Seccion; nombre: string }[] = [
  { id: 'inicio', nombre: 'Inicio' },
  { id: 'eventos', nombre: 'Eventos' },
  { id: 'biblioteca', nombre: 'Biblioteca' },
  { id: 'mods', nombre: 'Mods' }
]

// Muestra el error en pantalla en vez de dejar todo en negro
class ProteccionErrores extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Error en la interfaz:', error, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="tarjeta">
          <h3>Algo falló al mostrar esta sección</h3>
          <p className="error">{this.state.error.message}</p>
          <button className="btn" onClick={() => this.setState({ error: null })}>
            Reintentar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function App(): React.JSX.Element {
  const [seccion, setSeccion] = useState<Seccion>('inicio')

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="marca">
          <h1>VLP</h1>
          <span>Launcher</span>
        </div>

        <nav>
          {MENU.map((item) => (
            <button
              key={item.id}
              className={seccion === item.id ? 'nav-btn activo' : 'nav-btn'}
              onClick={() => setSeccion(item.id)}
            >
              {item.nombre}
            </button>
          ))}
        </nav>

        <div className="lema">Tu six, Yo seven</div>
      </aside>

      <main className="contenido">
        <ProteccionErrores key={seccion}>
          {seccion === 'inicio' && <Inicio />}
          {seccion === 'eventos' && <Eventos />}
          {seccion === 'biblioteca' && <Biblioteca />}
          {seccion === 'mods' && <Mods />}
        </ProteccionErrores>
      </main>
    </div>
  )
}

export default App