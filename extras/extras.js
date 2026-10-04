// Carril "site": se carga con defer al final de la página y nunca toca el tablero.
// Todo corre dentro de try/catch: un error acá no puede afectar el cálculo ni los datos.
(function () {
  try {
    var host = document.getElementById('extras');
    if (!host) return;
    var css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'extras/extras.css';
    document.head.appendChild(css);
    var cafe = document.createElement('div');
    cafe.className = 'x-cafe';
    cafe.innerHTML = '<strong>¿Te ahorró un Excel?</strong>' +
      '<p>Si Curv.ar te sirve, podés bancar el proyecto con un café.</p>' +
      '<a href="https://cafecito.app/dnangelus" target="_blank" rel="noopener">☕ Invitame uno →</a>';
    var egg = document.createElement('p');
    egg.className = 'x-egg';
    egg.textContent = 'El rendimiento pasado no garantiza cafés futuros.';
    host.appendChild(cafe);
    host.appendChild(egg);
  } catch (e) { /* los extras son opcionales */ }
})();
