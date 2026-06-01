/* Подсветка активной вкладки + мобильное меню в Чердаке (top-nav).
   Подключается на всех landing-страницах. */
(function () {
  // ─── 1) Активная вкладка ───
  // Ставим aria-current="page" на ссылку, совпадающую с location.pathname.
  // Стиль (красный + подчёркивание) — в landing.css.
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

  // ─── 2) Бургер-меню для мобилы (≤900px) ───
  // На десктопе .nav-burger{display:none} (см. landing.css). На мобиле кнопка
  // показывается и переключает .mobile-open на #nav, что раскрывает drawer
  // с nav-links.
  var nav = document.getElementById('nav');
  if (!nav || document.getElementById('navBurger')) return;

  var burger = document.createElement('button');
  burger.id = 'navBurger';
  burger.className = 'nav-burger';
  burger.type = 'button';
  burger.setAttribute('aria-label', 'Открыть меню');
  burger.setAttribute('aria-expanded', 'false');
  burger.innerHTML = '<span></span><span></span><span></span>';

  // Вставляем бургер перед .nav-right (рядом с языком + кнопкой «Войти»)
  var navRight = nav.querySelector('.nav-right');
  if (navRight) {
    nav.insertBefore(burger, navRight);
  } else {
    nav.appendChild(burger);
  }

  burger.addEventListener('click', function () {
    var opened = nav.classList.toggle('mobile-open');
    burger.setAttribute('aria-expanded', opened ? 'true' : 'false');
    burger.setAttribute('aria-label', opened ? 'Закрыть меню' : 'Открыть меню');
  });

  // Тапнули по ссылке внутри drawer → закрываем (UX: после навигации меню не должно висеть)
  for (var j = 0; j < links.length; j++) {
    links[j].addEventListener('click', function () {
      nav.classList.remove('mobile-open');
      burger.setAttribute('aria-expanded', 'false');
      burger.setAttribute('aria-label', 'Открыть меню');
    });
  }

  // Тап вне меню → закрываем (если открыто). Удобно для UX, но не мешает кликам внутри nav.
  document.addEventListener('click', function (e) {
    if (!nav.classList.contains('mobile-open')) return;
    if (nav.contains(e.target)) return;
    nav.classList.remove('mobile-open');
    burger.setAttribute('aria-expanded', 'false');
    burger.setAttribute('aria-label', 'Открыть меню');
  });
})();
