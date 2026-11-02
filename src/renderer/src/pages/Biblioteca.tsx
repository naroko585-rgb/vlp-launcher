import { useEffect, useState } from 'react'

const LOADERS = ['vanilla', 'fabric', 'forge', 'neoforge']

function Biblioteca(): React.JSX.Element {
  const [instancias, setInstancias] = useState<Instancia[]>([])
  const [versiones, setVersiones] = useState<string[]>([])
  const [nombre, setNombre] = useState('')
  const [version, setVersion] = useState('')
  const [loader, setLoader] = useState(LOADERS[0])
  const [error, setError] = useState('')

  async function cargar(): Promise<void> {
    setInstancias(await window.api.instancias.listar())
  }

  useEffect(() => {
    cargar()
    window.api.minecraft
      .versiones()
      .then((lista) => {
        setVersiones(lista)
        setVersion(lista[0])
      })
      .catch(() => setError('No se pudo cargar la lista de versiones de Minecraft'))
  }, [])

  async function crear(): Promise<void> {
    setError('')
    try {
      await window.api.instancias.crear({ nombre, version, loader })
      setNombre('')
      await cargar()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function duplicar(id: string): Promise<void> {
    await window.api.instancias.duplicar(id)
    await cargar()
  }

  async function eliminar(i: Instancia): Promise<void> {
    if (!window.confirm(`¿Eliminar "${i.nombre}"? Se borrarán sus mundos y mods.`)) return
    await window.api.instancias.eliminar(i.id)
    await cargar()
  }

  return (
    <section>
      <h2>Biblioteca</h2>
      <p className="sub">Tus instalaciones personales de Minecraft.</p>

      <div className="tarjeta formulario">
        <h3>Nueva instancia</h3>
        <div className="fila">
          <input
            placeholder="Nombre (ej. Survival personal)"
            value={nombre}
            maxLength={40}
            onChange={(e) => setNombre(e.target.value)}
          />
          <select value={version} onChange={(e) => setVersion(e.target.value)}>
            {versiones.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
          <select value={loader} onChange={(e) => setLoader(e.target.value)}>
            {LOADERS.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
          <button className="btn primario" onClick={crear} disabled={!nombre.trim() || !version}>
            Crear
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>

      <div className="lista">
        {instancias.length === 0 && (
          <div className="tarjeta">
            <p>Todavía no tienes instancias.</p>
          </div>
        )}
        {instancias.map((i) => (
          <div key={i.id} className="tarjeta instancia">
            <div>
              <h3>{i.nombre}</h3>
              <p className="sub chico">
                Minecraft {i.version} · {i.loader}
              </p>
            </div>
            <div className="acciones">
              <button className="btn" onClick={() => window.api.instancias.abrirCarpeta(i.id)}>
                Carpeta
              </button>
              <button className="btn" onClick={() => duplicar(i.id)}>
                Duplicar
              </button>
              <button className="btn peligro" onClick={() => eliminar(i)}>
                Eliminar
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export default Biblioteca