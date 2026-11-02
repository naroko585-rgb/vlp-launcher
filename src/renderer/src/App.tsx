import { useState } from 'react'
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
        {seccion === 'inicio' && <Inicio />}
        {seccion === 'eventos' && <Eventos />}
        {seccion === 'biblioteca' && <Biblioteca />}
        {seccion === 'mods' && <Mods />}
      </main>
    </div>
  )
}

export default App