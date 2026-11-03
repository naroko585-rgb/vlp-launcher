import { useEffect, useState } from 'react'

const LOADERS = ['vanilla', 'fabric', 'forge', 'neoforge']

function Biblioteca(): React.JSX.Element {
  const [instancias, setInstancias] = useState<Instancia[]>([])
  const [versiones, setVersiones] = useState<string[]>([])
  const [nombre, setNombre] = useState('')
  const [version, setVersion] = useState('')
  const [loader, setLoader] = useState(LOADERS[0])
  const [error, setError] = useState('')
  const [progreso, setProgreso] = useState<Record<string, string>>({})
  const [estados, setEstados] = useState<Record<string, string>>({})
  const [usuario, setUsuario] = useState(() => localStorage.getItem('vlp_usuario') ?? 'Jugador')

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

    return window.api.minecraft.onProgreso((v, p) => {
      setProgreso((prev) => ({
        ...prev,
        [v]: p.fase === 'Listo' ? 'Listo ✓' : `${p.fase}: ${p.hecho}/${p.total}`
      }))
    })
  }, [])

  useEffect(() => {
    return window.api.minecraft.onEstado((id, e) => {
      if (e.estado === 'corriendo') {
        setEstados((p) => ({ ...p, [id]: 'Jugando…' }))
      } else {
        setEstados((p) => {
          const n = { ...p }
          delete n[id]
          return n
        })
        if (e.codigo !== 0) {
          setError(`Minecraft se cerró con código ${e.codigo}.\n${e.salida ?? ''}`)
        }
      }
    })
  }, [])

  function cambiarUsuario(v: string): void {
    setUsuario(v)
    localStorage.setItem('vlp_usuario', v)
  }

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

  async function descargar(i: Instancia): Promise<void> {
    setError('')
    try {
      await window.api.minecraft.descargar(i.version)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function jugar(i: Instancia): Promise<void> {
    setError('')
    setEstados((p) => ({ ...p, [i.id]: 'Preparando…' }))
    try {
      await window.api.minecraft.jugar(i.id, usuario)
    } catch (e) {
      setEstados((p) => {
        const n = { ...p }
        delete n[i.id]
        return n
      })
      setError((e as Error).message)
    }
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

        <div className="fila">
          <input
            placeholder="Usuario sin conexión"
            value={usuario}
            maxLength={16}
            onChange={(e) => cambiarUsuario(e.target.value)}
          />
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
              <h3>
                {i.nombre}
                {i.evento && <span className="insignia">Evento · rev {i.evento.revision}</span>}
              </h3>
              <p className="sub chico">
                Minecraft {i.version} · {i.loader}
                {i.loaderVersion ? ` ${i.loaderVersion}` : ''}
              </p>
              {i.evento?.servidor && (
                <p className="sub chico">
                  Servidor: <span className="seleccionable">{i.evento.servidor}</span>
                </p>
              )}
              {progreso[i.version] && <p className="sub chico">{progreso[i.version]}</p>}
              {estados[i.id] && <p className="sub chico estado">{estados[i.id]}</p>}
            </div>
            <div className="acciones">
              <button
                className="btn primario"
                onClick={() => jugar(i)}
                disabled={!!estados[i.id]}
              >
                Jugar
              </button>
              <button className="btn" onClick={() => descargar(i)}>
                Descargar
              </button>
              <button className="btn" onClick={() => window.api.instancias.abrirCarpeta(i.id)}>
                Carpeta
              </button>
              <button className="btn" onClick={() => duplicar(i.id)}>
                {i.evento ? 'Copia editable' : 'Duplicar'}
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