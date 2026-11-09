// ✍️  TEXTO DE LA CARTA — edita solo este archivo (carta/contenido.js).
//
// · Cada elemento de `paginas` es una página del libro.
// · Separa los párrafos con una línea en blanco.
// · Si un texto no cabe en su página, la letra se reduce sola; si queda muy
//   pequeña, reparte ese texto en dos páginas.
// · Puedes añadir o quitar páginas libremente.

export const CARTA = {
  destinataria: 'Juana',

  // Título de la escena inicial
  intro: {
    antes: 'Una carta para',
    subtitulo: 'desde el otro lado del espejo',
  },

  // Guarda del libro (primera página interior, a la izquierda)
  exlibris: 'Este libro pertenece a',

  paginas: [
    `Querida Juana:

[Aquí irá el comienzo de tu carta. Este es un texto provisional para ver cómo queda la página con un párrafo de longitud normal.]

[Segundo párrafo de ejemplo.]`,

    `[Página dos. Escribe aquí lo que quieras contarle: un recuerdo, un momento compartido, algo que nunca le hayas dicho.]

[Otro párrafo de ejemplo para comprobar el espaciado entre párrafos.]`,

    `[Página tres. Puedes usar tantas páginas como necesites; el libro se adapta.]`,

    `[Página cuatro. Una última reflexión antes de la despedida.]`,
  ],

  despedida: 'Con todo mi amor,',
  firma: '[Tu nombre]',
};
