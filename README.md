# Checkmate Studio

Visor y editor 3D ligero que funciona por completo en el navegador. Carga modelos reales, inspecciona su jerarquía y materiales, ajusta transformaciones y exporta el resultado, sin instalar nada ni subir archivos a ningún servidor.

El modelo de demostración es **Alice «Checkmate»** de *Alice: Madness Returns*: el `Checkmate.obj` incluido en `CHECKMATE/`, con sus materiales MTL y texturas originales.

## Arranque

El proyecto usa módulos ES y carga los recursos con `fetch`, así que necesita servirse por HTTP (abrirlo con doble clic desde `file://` no funciona).

```powershell
cd C:\Users\popsb\Documents\ALICE_3D
python -m http.server 8000 --bind 127.0.0.1
```

Abre <http://127.0.0.1:8000/>. La demo se carga automáticamente.

También puedes usar cualquier servidor estático (Node, Live Server, etc.). No hay dependencias que instalar: Three.js r169 está incluido en `vendor/`.

## Formatos

| Formato | Importación | Notas |
| --- | --- | --- |
| OBJ + MTL + texturas | Sí | Materiales Phong del MTL convertidos a PBR. |
| GLB / glTF | Sí | Incluye mallas, materiales y texturas incrustadas o externas. |
| DAE (Collada) | Sí | Conserva jerarquía y esqueleto. |
| STL | Sí | Material neutro; calcula normales. |
| PLY | Sí | Respeta colores por vértice si existen. |
| GLB | Exportación | Exporta la escena transformada y los materiales actuales. |
| PNG | Exportación | Captura del visor a resolución del canvas. |

## Uso

- **Abrir archivos**: selecciona el modelo y, si es OBJ, también su `.mtl` y las imágenes. Puedes seleccionar varios archivos a la vez.
- **Abrir carpeta**: elige la carpeta completa del modelo (por ejemplo `CHECKMATE/`).
- **Arrastrar y soltar**: suelta el modelo, el MTL y las texturas sobre la ventana; también admite carpetas.
- **Árbol de escena**: selecciona una malla o un grupo y usa el ojo para ocultarlo.
- **Inspector → Transformar**: posición, rotación y escala por eje, con restablecer y enfocar.
- **Inspector → Material**: color, rugosidad, metalicidad, clearcoat, opacidad, fuerza del normal map, activar/desactivar mapas, wireframe, sombreado plano y doble cara.
- **Inspector → Escena**: exposición, luz principal, intensidad del entorno, fondos, suelo, rejilla, sombras, órbita automática, wireframe global, esqueleto y escala del modelo.
- **Vistas**: frente, 3/4, lado y superior. `F` enfoca la selección; `G` alterna la rejilla; `Esc` deselecciona.
- **Unidades**: al cargar, si la altura está entre 25 y 1000 se interpreta como centímetros y se convierte a metros; por encima de 1000, como milímetros. Puedes forzar otra escala en «Escala del modelo».

## Estructura

```
index.html            Aplicación principal
studio.css            Interfaz del estudio
studio/main.js        Renderer, escena, cámara, selección, importación/exportación
studio/importers.js   Cargadores, conversión PBR, métricas y utilidades
studio/ui.js          Árbol de escena e inspector
procedural.html       Demo anterior de Alice generada por código (extra)
src/                  Módulos de la demo procedural
vendor/three/         Three.js r169 y addons incluidos localmente
CHECKMATE/            Modelo, MTL y texturas de demostración
```

## Detalles técnicos

- Renderer con `ACESFilmicToneMapping`, iluminación IBL (`RoomEnvironment`) y sombras PCF suaves.
- Los materiales MTL se convierten a `MeshPhysicalMaterial` y se ajustan según el tipo de textura (piel, tela, pelo, ojos) cuando las imágenes terminan de cargar.
- Las rutas absolutas de Windows que trae el MTL original se sanean a nombres de archivo para poder cargar las texturas desde la carpeta `images/`.
- `Box3.setFromObject` puede devolver medidas erróneas en algunos DAE con skinning; el estudio calcula la caja envolvente a partir de la geometría en pose de enlace.
- Todo el procesamiento ocurre en el navegador. No se envía nada a Internet.

## Aviso legal

Los archivos de `CHECKMATE/` (modelo, texturas y esqueleto) pertenecen a sus respectivos titulares; *Alice: Madness Returns* es propiedad de Electronic Arts / Spicy Horse. Se incluyen únicamente como material de demostración para uso personal y educativo. No se concede ninguna licencia sobre ellos. Three.js se distribuye bajo licencia MIT.
