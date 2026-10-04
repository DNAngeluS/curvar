// Carril "site": se carga con defer al final de la página y nunca toca el tablero.
// Todo corre dentro de try/catch: un error acá no puede afectar el cálculo ni los datos.
(function () {
  try {
    var host = document.getElementById('extras');
    if (!host) return;
    var cafe = document.createElement('div');
    cafe.className = 'cafe';
    cafe.innerHTML = "<a href='https://cafecito.app/dnangelus' rel='noopener' target='_blank'><img srcset='https://cdn.cafecito.app/imgs/buttons/button_4.png 1x, https://cdn.cafecito.app/imgs/buttons/button_4_2x.png 2x, https://cdn.cafecito.app/imgs/buttons/button_4_3.75x.png 3.75x' src='https://cdn.cafecito.app/imgs/buttons/button_4.png' alt='Invitame un caf\u00e9 en cafecito.app' /></a>";
    host.appendChild(cafe);
  } catch (e) { /* los extras son opcionales */ }
})();
