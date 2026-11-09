# Una carta para Juana

Carta de amor interactiva: Alice («Checkmate») en 3D entrega un libro que se abre
en primer plano y se lee pasando páginas.

## Ver la carta

Necesita servirse por HTTP (desde `file://` no funciona) y conexión a internet
(Three.js r160 y las fuentes se cargan desde CDN). Desde esta carpeta:

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

y abre <http://127.0.0.1:8000/>.

## Escribir la carta

Edita solo `contenido.js`: cada elemento de `paginas` es una página; separa los
párrafos con una línea en blanco.

## Archivos

```
index.html            Página
contenido.js          Texto de la carta
css/carta.css         Estilos (paleta, libro, pergamino, animaciones)
js/main.js            Escena, cámara, estados y transiciones
js/decor.js           Luces, tablero, naipes, motas y librito 3D
js/libro.js           Libro con páginas en 3D CSS
js/alice-animator.js  Animación procedural de Alice
assets/Checkmate.glb  Modelo de Alice con esqueleto
```

## Pruebas rápidas

`?test=intro`, `?test=offer`, `?test=read&pos=N` (0 = portada) o `?test=roundtrip`.
