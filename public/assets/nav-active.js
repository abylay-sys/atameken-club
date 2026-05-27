/* Подсветка активной вкладки в Чердаке (top-nav).
   Подключается на всех landing-страницах. Ставит aria-current="page" на ссылку,
   совпадающую с location.pathname — стиль навешивается в landing.css. */
(function () {
  var path = location.pathname;
  // Нормализуем «/» → «/index.html», чтобы корень тоже подсвечивался
  if (path === '/' || path === '') path = '/index.html';
  var links = document.querySelectorAll('.nav-links a');
  for (var i = 0; i < links.length; i++) {
    var href = links[i].getAttribute('href');
    if (href === path) {
      links[i].setAttribute('aria-current', 'page');
      break;
    }
  }
})();
