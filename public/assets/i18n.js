/* ATAMEKEN Club — i18n
 * Strategy: keep Russian as the source of truth in HTML.
 * On language switch, walk the DOM and replace text nodes / inputs / placeholders
 * using the dictionary below. Unknown strings stay in Russian.
 */
(function () {
  'use strict';

  // ─── Dictionary: russian → { kk, en } ───────────────────────────────────────
  // Rules:
  //   • keys = exact Russian text (trimmed) as it appears in the DOM
  //   • values = translations; missing language falls back to Russian
  //   • for HTML with a <br/> (in headings) we keep it as a key without tags;
  //     the translation may include "\n" which we render as <br> when we
  //     replace via innerHTML for those known headings.
  const D = {
    // ── NAV
    'Главная':                 { kk: 'Басты бет',              en: 'Home' },
    'Резиденты':               { kk: 'Резиденттер',            en: 'Residents' },
    'О нас':                   { kk: 'Біз туралы',             en: 'About us' },
    'Участникам':              { kk: 'Қатысушыларға',          en: 'For members' },
    'Верификация':             { kk: 'Тексеру',                en: 'Verification' },
    'Проекты':                 { kk: 'Жобалар',                en: 'Projects' },
    'Услуги':                  { kk: 'Қызметтер',              en: 'Services' },
    'Дополнительные услуги':   { kk: 'Қосымша қызметтер',      en: 'Additional services' },
    'Календарь':               { kk: 'Күнтізбе',               en: 'Calendar' },
    'Тарифы':                  { kk: 'Тарифтер',               en: 'Pricing' },
    'Партнеры':                { kk: 'Серіктестер',            en: 'Partners' },
    'Партнёры':                { kk: 'Серіктестер',            en: 'Partners' },
    'Войти':                   { kk: 'Кіру',                   en: 'Sign in' },
    'Кабинет':                 { kk: 'Кабинет',                en: 'Account' },
    'Бизнес-сообщество':       { kk: 'Бизнес-қауымдастық',     en: 'Business community' },

    // ── HERO (index)
    'Казахстан · Евразия · Глобальные рынки': { kk: 'Қазақстан · Еуразия · Жаһандық нарықтар', en: 'Kazakhstan · Eurasia · Global markets' },
    'Надёжный доступ':         { kk: 'Іскерлік экожүйеге',     en: 'Reliable access' },
    'к':                       { kk: '',                       en: 'to the' },
    'деловой экосистеме':      { kk: 'сенімді қол жеткізу',    en: 'business ecosystem' },
    'Бизнес-сообщество «ATAMEKEN Club» - платформа для соискателей инвестиций, инвесторов, франчайзеров, продавцов бизнеса, а также покупателей и продавцов товаров и сырья.':
      { kk: '«ATAMEKEN Club» бизнес-қауымдастығы — инвестиция іздеушілерге, инвесторларға, франчайзерлерге, бизнес сатушыларға, сондай-ақ тауарлар мен шикізат сатып алушылар мен сатушыларға арналған платформа.',
        en: 'The «ATAMEKEN Club» business community — a platform for investment seekers, investors, franchisors, business sellers, and buyers and sellers of goods and raw materials.' },
    'Пройти верификацию':      { kk: 'Тексеруден өту',         en: 'Get verified' },
    'Смотреть проекты':        { kk: 'Жобаларды қарау',        en: 'Browse projects' },
    'Личный кабинет':          { kk: 'Жеке кабинет',           en: 'Personal cabinet' },
    'Инвест-проект':           { kk: 'Инвест жоба',            en: 'Investment project' },
    'Агропромышленный хаб «Степной»': { kk: '«Степной» агроөнеркәсіптік хаб', en: '«Stepnoy» agro-industrial hub' },
    'Услуга':                  { kk: 'Қызмет',                 en: 'Service' },
    'Визовая поддержка для иностранных компаний': { kk: 'Шетелдік компаниялар үшін визалық қолдау', en: 'Visa support for foreign companies' },
    'Мероприятие':             { kk: 'Іс-шара',                en: 'Event' },
    'Eurasia деловой ужин для инвесторов - Дубай': { kk: 'Eurasia инвесторларға арналған іскерлік кешкі ас — Дубай', en: 'Eurasia investor business dinner — Dubai' },
    '22 Окт 2025':             { kk: '22 Қаз 2025',            en: 'Oct 22, 2025' },
    'Закрытое':                { kk: 'Жабық',                  en: 'Closed' },
    'Только для участников платформы': { kk: 'Тек платформа қатысушыларына', en: 'Members only' },
    'мин. чек':                { kk: 'мин. чек',               en: 'min. check' },

    // ── TICKER
    'Соискатели инвестиций':   { kk: 'Инвестиция іздеушілер',  en: 'Investment seekers' },
    'Инвесторы':               { kk: 'Инвесторлар',            en: 'Investors' },
    'Франчайзеры':             { kk: 'Франчайзерлер',          en: 'Franchisors' },
    'Франчайзи':               { kk: 'Франчайзи',              en: 'Franchisees' },
    'Продажа бизнеса':         { kk: 'Бизнесті сату',          en: 'Business for sale' },
    'Покупка бизнеса':         { kk: 'Бизнес сатып алу',       en: 'Business buying' },
    'Деловые мероприятия':     { kk: 'Іскерлік іс-шаралар',    en: 'Business events' },

    // ── ДЛЯ КОГО (who)
    'Для кого платформа':      { kk: 'Платформа кімге арналған', en: 'Who is the platform for' },
    'У каждого типа участника - свой личный кабинет': { kk: 'Әрбір қатысушы түріне жеке кабинет беріледі', en: 'Each member type has its own cabinet' },
    'Базовая регистрация':     { kk: 'Базалық тіркелу',        en: 'Basic registration' },
    'бесплатно':               { kk: 'тегін',                  en: 'free' },
    'Доступ к закрытому каталогу после верификации': { kk: 'Тексеруден кейін жабық каталогқа қол жеткізу', en: 'Access to the closed catalog after verification' },
    'Стартапы, инвест-проекты и растущие компании, которые ищут финансирование или партнёров.': { kk: 'Қаржыландыру немесе серіктес іздейтін стартаптар, инвест жобалар және өсіп келе жатқан компаниялар.', en: 'Startups, investment projects and growing companies looking for funding or partners.' },
    'Подробнее':               { kk: 'Толығырақ',              en: 'Details' },
    'Упаковка инвест-проекта': { kk: 'Инвест жобаны қаптамалау', en: 'Investment project packaging' },
    'Пул верифицированных Инвесторов': { kk: 'Тексерілген инвесторлар пулы', en: 'Pool of verified investors' },
    'Сопровождение в переговорах с Инвесторами': { kk: 'Инвесторлармен келіссөздерде сүйемелдеу', en: 'Support in investor negotiations' },
    'Разместить проект':       { kk: 'Жобаны орналастыру',     en: 'Submit a project' },
    'Институциональные инвесторы, частные инвесторы, венчурные инвесторы, фонды, бизнес-ангелы.': { kk: 'Институционалдық инвесторлар, жеке инвесторлар, венчурлық инвесторлар, қорлар, бизнес-періштелер.', en: 'Institutional, private and venture investors, funds and business angels.' },
    'База верифицированных инвест-проектов': { kk: 'Тексерілген инвест жобалардың базасы', en: 'Database of verified investment projects' },
    'Безопасность инвестиций': { kk: 'Инвестиция қауіпсіздігі', en: 'Investment safety' },
    'Сопровождение':           { kk: 'Сүйемелдеу',             en: 'Support' },
    'Войти как инвестор':      { kk: 'Инвестор ретінде кіру',  en: 'Sign in as investor' },
    'Владельцы франшиз, ищущие масштабирование на новых рынках через надёжных партнёров.': { kk: 'Сенімді серіктестер арқылы жаңа нарықтарда масштабтауды іздейтін франшиза иелері.', en: 'Franchise owners looking to scale into new markets through trusted partners.' },
    'Упаковка франшиз':        { kk: 'Франшизаларды қаптамалау', en: 'Franchise packaging' },
    'База верифицированных франчайзи': { kk: 'Тексерілген франчайзилер базасы', en: 'Database of verified franchisees' },
    'Сопровождение и масштабирование': { kk: 'Сүйемелдеу және масштабтау', en: 'Support and scaling' },
    'Разместить франшизу':     { kk: 'Франшизаны орналастыру', en: 'List a franchise' },
    'Предприниматели, выбирающие готовую бизнес-модель и ищущие надёжного франчайзера.': { kk: 'Дайын бизнес-модель таңдайтын және сенімді франчайзер іздейтін кәсіпкерлер.', en: 'Entrepreneurs choosing a ready business model and seeking a trusted franchisor.' },
    'Каталог верифицированных франшиз': { kk: 'Тексерілген франшизалар каталогы', en: 'Catalog of verified franchises' },
    'Юридическое сопровождение сделки': { kk: 'Мәміленің заңдық сүйемелдеуі', en: 'Legal deal support' },
    'Безопасный вход в франшизу': { kk: 'Франшизаға қауіпсіз кіру', en: 'Safe entry into a franchise' },
    'Смотреть франшизы':       { kk: 'Франшизаларды қарау',    en: 'Browse franchises' },
    'Собственники, продающие действующий бизнес с подтверждёнными финансовыми показателями.': { kk: 'Расталған қаржы көрсеткіштері бар жұмыс істеп тұрған бизнесті сататын иелер.', en: 'Owners selling an operating business with verified financials.' },
    'Упаковка и оценка бизнеса': { kk: 'Бизнесті қаптамалау және бағалау', en: 'Business packaging and valuation' },
    'База верифицированных покупателей': { kk: 'Тексерілген сатып алушылар базасы', en: 'Database of verified buyers' },
    'Аудит и сопровождение сделки': { kk: 'Мәмілені аудиттеу және сүйемелдеу', en: 'Deal audit and support' },
    'Разместить бизнес':       { kk: 'Бизнесті орналастыру',   en: 'List a business' },
    'Инвесторы и предприниматели, ищущие действующие компании с подтверждёнными показателями.': { kk: 'Расталған көрсеткіштері бар жұмыс істеп тұрған компанияларды іздейтін инвесторлар мен кәсіпкерлер.', en: 'Investors and entrepreneurs looking for operating companies with verified financials.' },
    'Каталог верифицированных бизнесов': { kk: 'Тексерілген бизнестер каталогы', en: 'Catalog of verified businesses' },
    'Финансовый и юридический аудит': { kk: 'Қаржылық және заңдық аудит', en: 'Financial and legal audit' },
    'Безопасное закрытие сделки': { kk: 'Мәмілені қауіпсіз жабу', en: 'Safe deal closing' },
    'Найти бизнес':            { kk: 'Бизнес табу',            en: 'Find a business' },
    'Производители, дистрибьюторы, трейдеры и брокеры. Товарные позиции и сырьевые партии.': { kk: 'Өндірушілер, дистрибьюторлар, трейдерлер және брокерлер. Тауарлар мен шикізат партиялары.', en: 'Producers, distributors, traders and brokers. Goods and raw-material lots.' },
    'Каталог товарных позиций и сырьевых партий': { kk: 'Тауарлар мен шикізат партияларының каталогы', en: 'Catalog of goods and raw-material lots' },
    'База верифицированных оптовых покупателей и дистрибьюторов': { kk: 'Тексерілген көтерме сатып алушылар мен дистрибьюторлар базасы', en: 'Database of verified wholesale buyers and distributors' },
    'Подготовка и сопровождение сделок': { kk: 'Мәмілелерді дайындау және сүйемелдеу', en: 'Deal preparation and support' },
    'Разместить товар / сырьё': { kk: 'Тауар / шикізат орналастыру', en: 'List goods / raw materials' },
    'Оптовые покупатели, торговые сети, производители, трейдеры и брокеры. Товарные позиции и сырьевые партии.': { kk: 'Көтерме сатып алушылар, сауда желілері, өндірушілер, трейдерлер және брокерлер.', en: 'Wholesale buyers, retail chains, producers, traders and brokers.' },
    'Каталог товарных позиций и сырьевых партий от прямых производителей': { kk: 'Тікелей өндірушілерден тауарлар мен шикізат партияларының каталогы', en: 'Catalog of goods and raw-material lots from direct producers' },
    'База верифицированных производителей и дистрибьюторов': { kk: 'Тексерілген өндірушілер мен дистрибьюторлар базасы', en: 'Database of verified producers and distributors' },
    'Найти поставщика':        { kk: 'Жеткізушіні табу',       en: 'Find a supplier' },

    // ── HOW (steps)
    'Процесс верификации':     { kk: 'Тексеру процесі',        en: 'Verification process' },
    'Шаг 1':                   { kk: '1-қадам',                en: 'Step 1' },
    'Шаг 2':                   { kk: '2-қадам',                en: 'Step 2' },
    'Шаг 3':                   { kk: '3-қадам',                en: 'Step 3' },
    'Шаг 4':                   { kk: '4-қадам',                en: 'Step 4' },
    'Шаг 5':                   { kk: '5-қадам',                en: 'Step 5' },
    'Шаг 6':                   { kk: '6-қадам',                en: 'Step 6' },
    'Регистрация':             { kk: 'Тіркелу',                en: 'Registration' },
    'Заполнение анкеты':       { kk: 'Сауалнаманы толтыру',    en: 'Profile filling' },
    'Проверка и комплаенс':    { kk: 'Тексеру және комплаенс', en: 'Review & compliance' },
    'Публикация карточки':     { kk: 'Карточканы жариялау',    en: 'Card publication' },
    'Верификация и статусы':   { kk: 'Тексеру және мәртебелер', en: 'Verification & badges' },
    'Доступ к Реестру и B2B-встречам': { kk: 'Тізілімге және B2B кездесулерге қол жеткізу', en: 'Access to Registry and B2B meetings' },

    // ── MESSAGE BAR
    'Мы всегда готовы ответить на Ваши вопросы': { kk: 'Сұрақтарыңызға жауап беруге әрқашан дайынбыз', en: 'We are always ready to answer your questions' },
    'Вступайте в наши группы в мессенджерах и будьте в курсе последних новостей платформы': { kk: 'Біздің мессенджерлердегі топтарға қосылып, платформа жаңалықтарынан хабардар болыңыз', en: 'Join our messenger groups and stay up to date with platform news' },
    'Написать менеджеру':      { kk: 'Менеджерге жазу',        en: 'Message a manager' },

    // ── CTA
    'Начало работы':           { kk: 'Жұмысты бастау',         en: 'Get started' },
    'Присоединяйтесь к':       { kk: 'Қосылыңыз',              en: 'Join' },
    'Зарегистрироваться':      { kk: 'Тіркелу',                en: 'Sign up' },
    'Уже есть аккаунт - Войти': { kk: 'Аккаунтыңыз бар — Кіру', en: 'Have an account — Sign in' },
    'Зарегистрироваться и открыть каталог': { kk: 'Тіркеліп, каталогты ашу', en: 'Sign up and open the catalog' },

    // ── FOOTER
    '© 2025 ТОО «ATAMEKEN Club». Все права защищены.': { kk: '© 2025 «ATAMEKEN Club» ЖШС. Барлық құқықтар қорғалған.', en: '© 2025 ATAMEKEN Club LLP. All rights reserved.' },
    'Бизнес-сообщество «ATAMEKEN Club» · Казахстан': { kk: '«ATAMEKEN Club» бизнес-қауымдастығы · Қазақстан', en: '«ATAMEKEN Club» business community · Kazakhstan' },
    'г. Алматы, Казахстан':    { kk: 'Алматы қ., Қазақстан',   en: 'Almaty, Kazakhstan' },

    // ── PARTNERS
    'Партнёрам':               { kk: 'Серіктестерге',          en: 'Partners' },
    'Клубам-партнёрам':        { kk: 'Серіктес клубтарға',     en: 'Partner clubs' },
    'Наши партнёры':           { kk: 'Біздің серіктестер',     en: 'Our partners' },
    'Организации, которые':    { kk: 'Бізбен жұмыс істейтін',  en: 'Organizations that' },
    'работают с нами':         { kk: 'ұйымдар',                en: 'work with us' },
    'Профильные ассоциации, отраслевые объединения, акселераторы и бизнес-клубы, поддерживающие платформу ATAMEKEN Club.':
      { kk: 'ATAMEKEN Club платформасын қолдайтын мамандандырылған қауымдастықтар, салалық бірлестіктер, акселераторлар және бизнес-клубтар.',
        en: 'Industry associations, sector unions, accelerators and business clubs supporting the ATAMEKEN Club platform.' },
    'Партнёрские организации': { kk: 'Серіктес ұйымдар',       en: 'Partner organizations' },
    'Акселератор':             { kk: 'Акселератор',            en: 'Accelerator' },
    'Бизнес-клубы':            { kk: 'Бизнес-клубтар',         en: 'Business clubs' },
    'Подключите ваш клуб':     { kk: 'Клубыңызды платформаға', en: 'Connect your club' },
    'к платформе':             { kk: 'қосыңыз',                en: 'to the platform' },
    'Подключайте ваш бизнес-клуб к платформе и открывайте участникам доступ к деловому каталогу, мероприятиям и инструментам верификации.': { kk: 'Бизнес-клубыңызды платформаға қосып, қатысушыларға іскерлік каталогқа, іс-шараларға және тексеру құралдарына қол жеткізіңіз.', en: 'Connect your business club to the platform and open access to the business catalog, events and verification tools for your members.' },
    'Меморандум не является эксклюзивным. Каждая сторона несёт ответственность за достоверность сведений. Взаимодействие строго по регламенту.': { kk: 'Меморандум эксклюзивті емес. Әр тарап мәліметтердің дұрыстығына жауап береді. Өзара іс-қимыл регламент бойынша жүргізіледі.', en: 'The memorandum is non-exclusive. Each party is responsible for the accuracy of its data. Interaction is strictly per regulations.' },
    'Запрос для клуба-партнёра': { kk: 'Серіктес клубқа сұраныс', en: 'Partner club request' },
    'Оставьте контакты - свяжемся в течение 2 рабочих дней': { kk: 'Байланыс деректеріңізді қалдырыңыз — 2 жұмыс күні ішінде хабарласамыз', en: 'Leave your contacts — we will reach out within 2 business days' },
    'Название клуба':          { kk: 'Клуб атауы',             en: 'Club name' },
    'Страна / город':          { kk: 'Ел / қала',              en: 'Country / city' },
    'Контактное лицо':         { kk: 'Байланыс тұлғасы',       en: 'Contact person' },
    'Телефон / WhatsApp':      { kk: 'Телефон / WhatsApp',     en: 'Phone / WhatsApp' },
    'E-mail':                  { kk: 'E-mail',                 en: 'E-mail' },
    'Кол-во участников':       { kk: 'Қатысушылар саны',       en: 'Members count' },
    'Выберите диапазон':       { kk: 'Ауқымды таңдаңыз',       en: 'Select a range' },
    'До 10':                   { kk: '10-ға дейін',            en: 'Up to 10' },
    'Более 100':               { kk: '100-ден көп',            en: 'Over 100' },
    'Комментарий':             { kk: 'Пікір',                  en: 'Comment' },
    'Расскажите о клубе, задачах и рынках присутствия': { kk: 'Клуб, міндеттер мен қатысатын нарықтар туралы айтыңыз', en: 'Tell us about your club, goals and markets' },
    'Отправить запрос':        { kk: 'Сұранысты жіберу',       en: 'Submit request' },

    // ── EVENTS / CALENDAR
    'Сегодня':                 { kk: 'Бүгін',                  en: 'Today' },
    'Мероприятия за месяц':    { kk: 'Айдағы іс-шаралар',      en: 'Events this month' },
    'Все мероприятия':         { kk: 'Барлық іс-шаралар',      en: 'All events' },
    'Закрытые встречи':        { kk: 'Жабық кездесулер',       en: 'Closed meetings' },
    'и деловые события':       { kk: 'және іскерлік оқиғалар', en: 'and business events' },
    'Открыт':                  { kk: 'Ашық',                   en: 'Open' },
    'Прошло':                  { kk: 'Өтті',                   en: 'Past' },
    'Закрыто':                 { kk: 'Жабық',                  en: 'Closed' },
    'В этом месяце мероприятий нет': { kk: 'Бұл айда іс-шаралар жоқ', en: 'No events this month' },
    'В этом году мероприятий нет': { kk: 'Биыл іс-шаралар жоқ', en: 'No events this year' },

    // ── PRICING
    'Тарифные планы':          { kk: 'Тарифтік жоспарлар',     en: 'Pricing plans' },

    // ── SERVICES
    'Каталог услуг':           { kk: 'Қызметтер каталогы',     en: 'Services catalog' },

    // ── REGISTER
    'Создайте аккаунт - регистрация бесплатна': { kk: 'Аккаунт жасаңыз — тіркелу тегін', en: 'Create an account — registration is free' },
    'Тип участника':           { kk: 'Қатысушы түрі',          en: 'Member type' },
    'Соискатель инвестиций':   { kk: 'Инвестиция іздеуші',     en: 'Investment seeker' },
    'Инвестор':                { kk: 'Инвестор',               en: 'Investor' },
    'Франчайзер / Франчайзи':  { kk: 'Франчайзер / Франчайзи', en: 'Franchisor / Franchisee' },
    'Продавец / Покупатель бизнеса': { kk: 'Бизнес сатушы / сатып алушы', en: 'Business seller / buyer' },
    'ФИО':                     { kk: 'Аты-жөні',               en: 'Full name' },
    'Email':                   { kk: 'Email',                  en: 'Email' },
    'Телефон':                 { kk: 'Телефон',                en: 'Phone' },
    'Пароль':                  { kk: 'Құпиясөз',               en: 'Password' },
    'Минимум 8 символов':      { kk: 'Кемінде 8 таңба',        en: 'At least 8 characters' },
    'Не менее 8 символов.':    { kk: 'Кемінде 8 таңба.',       en: 'At least 8 characters.' },
    'Создать аккаунт':         { kk: 'Аккаунт жасау',          en: 'Create account' },
    'Уже есть аккаунт?':       { kk: 'Аккаунтыңыз бар ма?',    en: 'Already have an account?' },
    'Пользовательское соглашение': { kk: 'Пайдаланушы келісімі', en: 'Terms of Use' },
    'Прежде чем продолжить регистрацию, ознакомьтесь с ключевыми условиями использования платформы «ATAMEKEN Club».': { kk: 'Тіркелуді жалғастырмас бұрын, «ATAMEKEN Club» платформасын пайдаланудың негізгі шарттарымен танысыңыз.', en: 'Before continuing registration, please read the key terms of using the «ATAMEKEN Club» platform.' },
    'Я прочитал(а) и принимаю условия пользовательского соглашения': { kk: 'Пайдаланушы келісімінің шарттарымен таныстым және қабылдаймын', en: 'I have read and accept the terms of the user agreement' },
    'Отмена':                  { kk: 'Бас тарту',              en: 'Cancel' },
    'Согласен и продолжить':   { kk: 'Келісемін, жалғастыру',  en: 'Agree and continue' },

    // ── LOGIN
    'Вход':                    { kk: 'Кіру',                   en: 'Sign in' },
    'Войдите в личный кабинет': { kk: 'Жеке кабинетке кіріңіз', en: 'Sign in to your account' },
    'Запомнить меня':          { kk: 'Мені есте сақтау',       en: 'Remember me' },
    'Забыли пароль?':          { kk: 'Құпиясөзді ұмыттыңыз ба?', en: 'Forgot password?' },
    'Нет аккаунта?':           { kk: 'Аккаунтыңыз жоқ па?',    en: 'No account?' },

    // ════════════════════════════════════════════════════════════════
    // Второй пакет переводов (Сайт4 — переход на EN/KZ для рассылок)
    // ════════════════════════════════════════════════════════════════
    // ── INDEX (hero + meta + ticker + sections)
    'Бизнес-сообщество «ATAMEKEN Club» — универсальная площадка для предпринимателей со всего мира! Надёжный, безопасный и эффективный инструмент международного сотрудничества.':
      { kk: '«ATAMEKEN Club» бизнес-қауымдастығы — бүкіл әлемнің кәсіпкерлеріне арналған әмбебап алаң! Халықаралық ынтымақтастықтың сенімді, қауіпсіз және тиімді құралы.',
        en: 'The «ATAMEKEN Club» business community — a universal platform for entrepreneurs from around the world! A reliable, safe and effective tool for international cooperation.' },
    'универсальная площадка': { kk: 'әмбебап алаң',           en: 'universal platform' },
    'Атамекен':                { kk: 'Атамекен',               en: 'Atameken' },
    'Одна регистрация —':      { kk: 'Бір тіркеу —',           en: 'One registration —' },
    '8 типов активностей':     { kk: '8 түрлі белсенділік',    en: '8 types of activities' },
    'Продолжить':              { kk: 'Жалғастыру',             en: 'Continue' },
    'Без лимита на количество позиций': { kk: 'Позиция санына шектеусіз', en: 'No limit on positions' },
    'Покупатели готового бизнеса': { kk: 'Жұмыс істеп тұрған бизнес сатып алушылары', en: 'Buyers of operating businesses' },
    'Покупатели товаров и сырья': { kk: 'Тауар мен шикізат сатып алушылары', en: 'Buyers of goods and raw materials' },
    'Реестр верифицированных инвест-проектов': { kk: 'Тексерілген инвест жобалардың тізілімі', en: 'Registry of verified investment projects' },
    'Реестр верифицированных франшиз': { kk: 'Тексерілген франшизалар тізілімі', en: 'Registry of verified franchises' },
    'Реестр верифицированных бизнесов': { kk: 'Тексерілген бизнестер тізілімі', en: 'Registry of verified businesses' },
    'Реестр товарных позиций и сырьевых партий от прямых производителей':
      { kk: 'Тікелей өндірушілерден тауар мен шикізат партияларының тізілімі',
        en: 'Registry of goods and raw-material lots from direct producers' },
    'Верификация контрагентов': { kk: 'Контрагенттерді тексеру', en: 'Counterparty verification' },
    '6 шагов от заявки':       { kk: 'Өтінімнен 6 қадам',      en: '6 steps from application' },
    'до полного доступа':      { kk: 'толық қол жеткізуге дейін', en: 'to full access' },
    'и B2B-встречам':          { kk: 'және B2B кездесулерге',  en: 'and B2B meetings' },
    // Корзина услуг (index)
    'Корзина услуг':           { kk: 'Қызметтер себеті',       en: 'Services cart' },
    'Корзина':                 { kk: 'Себет',                  en: 'Cart' },
    'Закрыть':                 { kk: 'Жабу',                   en: 'Close' },
    'Заявка от:':              { kk: 'Өтінім авторы:',         en: 'Request from:' },
    'Ваше имя *':              { kk: 'Сіздің атыңыз *',        en: 'Your name *' },
    'Телефон или email *':     { kk: 'Телефон немесе email *', en: 'Phone or email *' },
    'Комментарий (необязательно)': { kk: 'Пікір (міндетті емес)', en: 'Comment (optional)' },
    'Отправить заявку менеджеру': { kk: 'Менеджерге жіберу',   en: 'Send to manager' },
    'Менеджер свяжется в течение 1 рабочего дня и согласует условия.':
      { kk: 'Менеджер 1 жұмыс күні ішінде хабарласып, шарттарды келіседі.',
        en: 'A manager will contact you within 1 business day to confirm terms.' },
    'Статус заявки':           { kk: 'Өтінім мәртебесі',       en: 'Application status' },
    'Заявка на верификацию рассматривается. Доступ к полным досье откроется после одобрения.':
      { kk: 'Тексеру өтінімі қарастырылуда. Толық дерекқорға қол жеткізу мақұлдағаннан кейін ашылады.',
        en: 'Verification request under review. Full dossier access opens after approval.' },
    'Заполните анкету верификации, чтобы открыть полные досье проектов.':
      { kk: 'Жобалардың толық дерекқорын ашу үшін тексеру сауалнамасын толтырыңыз.',
        en: 'Fill in the verification form to unlock full project dossiers.' },
    'Корзина пуста.':          { kk: 'Себет бос.',             en: 'Cart is empty.' },
    'Добавьте услуги выше.':   { kk: 'Жоғарыдан қызметтер қосыңыз.', en: 'Add services above.' },
    'Цена по запросу':         { kk: 'Баға сұраныс бойынша',    en: 'Price on request' },
    'В корзине':               { kk: 'Себетте',                en: 'In cart' },
    'Добавить в корзину':      { kk: 'Себетке қосу',           en: 'Add to cart' },
    'Корзина пуста':           { kk: 'Себет бос',              en: 'Cart is empty' },
    'Укажите имя и контакт':   { kk: 'Атыңыз бен байланысты көрсетіңіз', en: 'Enter name and contact' },
    'Отправляем...':           { kk: 'Жіберілуде...',          en: 'Sending...' },
    'Заявка отправлена! Менеджер свяжется в ближайшее время.':
      { kk: 'Өтінім жіберілді! Менеджер жуық арада хабарласады.',
        en: 'Request sent! A manager will reach out shortly.' },
    'Не удалось отправить:':   { kk: 'Жіберу мүмкін болмады:', en: 'Failed to send:' },
    'Документы':               { kk: 'Құжаттар',               en: 'Documents' },

    // ── PROJECTS (Registry)
    'Поиск по ключевым словам:': { kk: 'Кілт сөздер бойынша іздеу:', en: 'Keyword search:' },
    'Очистить':                { kk: 'Тазарту',                en: 'Clear' },
    'Все':                     { kk: 'Барлығы',                en: 'All' },
    'Инвест-проекты':          { kk: 'Инвест жобалар',         en: 'Investment projects' },
    'Франшизы':                { kk: 'Франшизалар',            en: 'Franchises' },
    'Продажа готового бизнеса': { kk: 'Жұмыс істеп тұрған бизнес сату', en: 'Operating businesses for sale' },
    'Продажа товаров и сырья': { kk: 'Тауар мен шикізат сату', en: 'Goods and raw materials for sale' },
    'Приоритет':               { kk: 'Басымдық',               en: 'Priority' },
    'Резидент ATAMEKEN Club':  { kk: 'ATAMEKEN Club Резиденті', en: 'ATAMEKEN Club Resident' },
    'Не Резидент Клуба':       { kk: 'Клубтың Резиденті емес', en: 'Not a Club Resident' },
    'Досье':                   { kk: 'Дерекқор',               en: 'Dossier' },
    'Запросить':               { kk: 'Сұрау',                  en: 'Request' },
    'Подать жалобу':           { kk: 'Шағым беру',             en: 'Report' },
    'Избранное':               { kk: 'Таңдаулылар',            en: 'Favorites' },
    'Открыть Реестр':          { kk: 'Тізілімді ашу',          en: 'Open Registry' },
    'Ничего не найдено':       { kk: 'Ештеңе табылмады',       en: 'Nothing found' },
    'В Реестре пока нет публикаций': { kk: 'Тізілімде әзірге жарияланымдар жоқ', en: 'No publications in the Registry yet' },
    'Финансовая модель, команда и контакты - только для верифицированных участников':
      { kk: 'Қаржы моделі, команда және байланыстар — тек тексерілген қатысушылар үшін',
        en: 'Financial model, team and contacts — verified members only' },
    'Финмодель и контакты франчайзера - только для верифицированных участников':
      { kk: 'Қаржы моделі және франчайзер байланыстары — тек тексерілген қатысушылар үшін',
        en: 'Financial model and franchisor contacts — verified members only' },
    'Финотчётность и стоимость - только для верифицированных участников':
      { kk: 'Қаржы есептілігі мен құны — тек тексерілген қатысушылар үшін',
        en: 'Financial reporting and price — verified members only' },
    'Цена, логистика и контакты - только для верифицированных участников':
      { kk: 'Бағасы, логистика және байланыстар — тек тексерілген қатысушылар үшін',
        en: 'Price, logistics and contacts — verified members only' },
    'Прямой производитель':    { kk: 'Тікелей өндіруші',       en: 'Direct producer' },
    'Зарегистрироваться и открыть Реестр': { kk: 'Тіркеліп, Тізілімді ашу', en: 'Sign up and open the Registry' },

    // ── EVENTS / CALENDAR
    'Предыдущий месяц':        { kk: 'Алдыңғы ай',             en: 'Previous month' },
    'Следующий месяц':         { kk: 'Келесі ай',              en: 'Next month' },
    'Пн':                      { kk: 'Дс',                     en: 'Mon' },
    'Вт':                      { kk: 'Сс',                     en: 'Tue' },
    'Ср':                      { kk: 'Ср',                     en: 'Wed' },
    'Чт':                      { kk: 'Бс',                     en: 'Thu' },
    'Пт':                      { kk: 'Жм',                     en: 'Fri' },
    'Сб':                      { kk: 'Сн',                     en: 'Sat' },
    'Вс':                      { kk: 'Жс',                     en: 'Sun' },

    // ── PRICING
    'Подтверждение достоверности информации — залог успеха в поиске надёжных партнёров.':
      { kk: 'Ақпараттың дұрыстығын растау — сенімді серіктестерді табудың кепілі.',
        en: 'Confirming information accuracy is the key to finding reliable partners.' },
    'РЕЗИДЕНТАМ':              { kk: 'РЕЗИДЕНТТЕРГЕ',          en: 'RESIDENTS' },
    'скидка −10% на все платные услуги': { kk: 'барлық ақылы қызметтерге −10% жеңілдік', en: '−10% discount on all paid services' },
    'Для всех Пользователей':  { kk: 'Барлық Пайдаланушыларға', en: 'For all Users' },
    'Бесплатно':               { kk: 'Тегін',                  en: 'Free' },
    'Регистрация на Платформе': { kk: 'Платформаға тіркелу',    en: 'Platform registration' },
    'Доступ к 8 типам активностей': { kk: '8 түрлі белсенділікке қол жеткізу', en: 'Access to 8 activity types' },
    'Доступ к размещению в Реестре': { kk: 'Тізілімде жариялауға қол жеткізу', en: 'Publishing access to Registry' },
    'Верификация компании':    { kk: 'Компанияны тексеру',     en: 'Company verification' },
    'Маркетинговый анализ':    { kk: 'Маркетингтік талдау',    en: 'Marketing analysis' },
    'Аудит Бизнес-плана':      { kk: 'Бизнес-жоспар аудиті',   en: 'Business plan audit' },
    'Аудит фин. модели / бухгалтерский аудит': { kk: 'Қаржы моделі аудиті / бухгалтерлік аудит', en: 'Financial model / accounting audit' },
    'Аудит договоров':         { kk: 'Шарттар аудиті',         en: 'Contracts audit' },
    'Сопровождение сделки':    { kk: 'Мәмілеге сүйемелдеу',    en: 'Deal support' },
    'по запросу':              { kk: 'сұраныс бойынша',        en: 'on request' },
    'от суммы сделки':         { kk: 'мәміле сомасынан',       en: 'of deal amount' },
    'Верификация состава / сертификатов производства': { kk: 'Құрам / өндіріс сертификаттарын тексеру', en: 'Composition / production certificates verification' },
    'Верификация запасов':     { kk: 'Қорларды тексеру',       en: 'Stock verification' },
    'Верификация договоров (для трейдеров / агентов)': { kk: 'Шарттарды тексеру (трейдерлер / агенттер үшін)', en: 'Contracts verification (for traders / agents)' },
    'Развёрнутая информация о контрагенте': { kk: 'Контрагент туралы кең ауқымды ақпарат', en: 'Expanded counterparty information' },
    'за 1 карточку':           { kk: '1 карточка үшін',        en: 'per card' },
    'Развёрнутый отчёт по каждой верификации': { kk: 'Әрбір тексеру бойынша кең ауқымды есеп', en: 'Detailed report per verification' },
    'за 1 пункт':              { kk: '1 тармақ үшін',          en: 'per item' },
    'Пакеты карточек':         { kk: 'Карточкалар пакеттері',  en: 'Card packages' },
    'от $40':                  { kk: '$40-тан',                en: 'from $40' },
    '10 / 25 / 50 / 100 со скидкой': { kk: '10 / 25 / 50 / 100 жеңілдікпен', en: '10 / 25 / 50 / 100 with discount' },
    'Тариф добавлен в корзину. Перейдите на главную, чтобы оформить заявку.':
      { kk: 'Тариф себетке қосылды. Өтінім беру үшін басты бетке өтіңіз.',
        en: 'Tariff added to cart. Go to the main page to submit your request.' },

    // ── SERVICES (catalog)
    'Анализ рынка':            { kk: 'Нарықты талдау',         en: 'Market analysis' },
    'Брендинг и реклама':      { kk: 'Брендинг және жарнама',  en: 'Branding and advertising' },
    'Продажи и каналы':        { kk: 'Сатылымдар мен арналар', en: 'Sales and channels' },
    'Не нашли нужную услугу?': { kk: 'Қажетті қызметті таппадыңыз ба?', en: 'Didn’t find the right service?' },
    'Опишите задачу — подберём конкретного партнёра и сформируем коммерческое предложение за 1–2 рабочих дня.':
      { kk: 'Тапсырманы сипаттаңыз — нақты серіктесті таңдап, 1–2 жұмыс күні ішінде коммерциялық ұсыныс әзірлейміз.',
        en: 'Describe your task — we will select a specific partner and prepare a quote within 1–2 business days.' },
    'Заявка на услугу':        { kk: 'Қызметке өтінім',        en: 'Service request' },
    'Оставьте контакты — менеджер ATAMEKEN Club свяжется с вами, уточнит детали и подберёт конкретного партнёра под задачу.':
      { kk: 'Байланыс деректеріңізді қалдырыңыз — ATAMEKEN Club менеджері сізбен хабарласып, нақты серіктесті таңдайды.',
        en: 'Leave your contacts — an ATAMEKEN Club manager will contact you, clarify details and select a specific partner.' },
    'Имя':                     { kk: 'Аты',                    en: 'Name' },
    'Как к вам обращаться':    { kk: 'Сізге қалай жүгінуге болады', en: 'How to address you' },
    'Контакт':                 { kk: 'Байланыс',               en: 'Contact' },
    'Телефон или e-mail':      { kk: 'Телефон немесе e-mail',  en: 'Phone or e-mail' },
    'Опишите задачу, сроки, ожидаемый бюджет (опционально)': { kk: 'Тапсырманы, мерзімдерді, бюджетті сипаттаңыз (міндетті емес)', en: 'Describe task, timeline, expected budget (optional)' },
    'Отправить заявку':        { kk: 'Өтінімді жіберу',        en: 'Submit request' },
    'Нажимая «Отправить», вы соглашаетесь на обработку контактных данных для связи по этой заявке.':
      { kk: '«Жіберу» түймесін басу арқылы сіз осы өтінім бойынша байланыс үшін деректерді өңдеуге келісім бересіз.',
        en: 'By clicking «Submit», you agree to processing of contact data for this request.' },
    'В этом сегменте пока пусто.': { kk: 'Бұл сегментте әзірге бос.', en: 'This segment is empty for now.' },
    'Маркетинговое исследование рынка': { kk: 'Нарықтың маркетингтік зерттеуі', en: 'Marketing market research' },
    'Анализ ЦА и сегментация': { kk: 'Мақсатты аудиторияны талдау және сегменттеу', en: 'Target audience analysis and segmentation' },
    'Аналитика цен и бенчмаркинг': { kk: 'Бағаны талдау және бенчмаркинг', en: 'Price analytics and benchmarking' },
    'Брендинговая упаковка (комплекс)': { kk: 'Брендингтік қаптамалау (кешен)', en: 'Branding package (complex)' },
    'Брендбук и фирменный стиль': { kk: 'Брендбук және фирмалық стиль', en: 'Brandbook and corporate identity' },
    'Локализация сайта и материалов': { kk: 'Сайт пен материалдарды локализациялау', en: 'Site and materials localization' },
    'Performance-маркетинг':   { kk: 'Performance-маркетинг',  en: 'Performance marketing' },
    'SMM-ведение':             { kk: 'SMM-жүргізу',            en: 'SMM management' },
    'PR и работа с медиа':     { kk: 'PR және БАҚ-пен жұмыс',  en: 'PR and media relations' },
    'Сайт / лендинг':          { kk: 'Сайт / лендинг',         en: 'Website / landing' },
    'Запуск воронки продаж под ключ': { kk: 'Сатылым воронкасын аяқталған күйінде іске қосу', en: 'Turnkey sales funnel launch' },
    'Колл-центр на аутсорсе':  { kk: 'Аутсорстағы колл-орталық', en: 'Outsourced call center' },
    'Выход на маркетплейсы':   { kk: 'Маркетплейстерге шығу',  en: 'Marketplace launch' },
    'Экспортный консалтинг':   { kk: 'Экспорттық консалтинг',  en: 'Export consulting' },
    'Growth Audit (маркетинг и продажи)': { kk: 'Growth Audit (маркетинг және сатылымдар)', en: 'Growth Audit (marketing and sales)' },
    'разово':                  { kk: 'бір рет',                en: 'one-time' },
    'ежемес.':                 { kk: 'ай сайын',               en: 'monthly' },
    'ежемес. + бюджет':        { kk: 'ай сайын + бюджет',      en: 'monthly + budget' },
    'разово + ежемес.':        { kk: 'бір рет + ай сайын',     en: 'one-time + monthly' },
    'Срок':                    { kk: 'Мерзім',                 en: 'Term' },
    'Заказать услугу':         { kk: 'Қызметке тапсырыс беру', en: 'Order service' },
    'Заполните имя и контакт': { kk: 'Атыңыз бен байланысыңызды толтырыңыз', en: 'Fill in name and contact' },
    'Отправляем…':         { kk: 'Жіберілуде…',       en: 'Sending…' },
    'Ошибка отправки':         { kk: 'Жіберу қатесі',          en: 'Send error' },
    'Не удалось отправить — попробуйте ещё раз': { kk: 'Жіберу мүмкін болмады — қайталап көріңіз', en: 'Failed to send — please try again' },

    // ── PARTNERS (cards + form)
    'Партнёры Бизнес-сообщества «ATAMEKEN Club» — это Ассоциации, Палаты, Бизнес-клубы, Акселераторы, Фонды, Объединения юридических лиц и другие коммерческие/некоммерческие организации, в том числе и иностранные, которые представляют бизнес-интересы своих Членов.':
      { kk: '«ATAMEKEN Club» бизнес-қауымдастығының Серіктестері — өз Мүшелерінің бизнес мүдделерін білдіретін Қауымдастықтар, Палаталар, Бизнес-клубтар, Акселераторлар, Қорлар, Заңды тұлғалар бірлестіктері және басқа да коммерциялық/коммерциялық емес ұйымдар (оның ішінде шетелдік).',
        en: 'Partners of the «ATAMEKEN Club» business community are Associations, Chambers, Business Clubs, Accelerators, Funds, Legal Entity Unions and other commercial/non-commercial organizations (including foreign) that represent the business interests of their Members.' },
    'Партнёрские организации получают право доступа для своих Членов на закрытую часть платформы Бизнес-сообщества «ATAMEKEN Club», а также право участия в офлайн B2B-сессиях, нетворкингах и бизнес-мероприятиях.':
      { kk: 'Серіктес ұйымдар өз Мүшелеріне «ATAMEKEN Club» бизнес-қауымдастығы платформасының жабық бөлігіне қол жеткізу құқығын, сондай-ақ офлайн B2B-сессияларға, нетворкингтерге және бизнес-іс-шараларға қатысу құқығын алады.',
        en: 'Partner organizations obtain access for their Members to the closed part of the «ATAMEKEN Club» platform, as well as the right to participate in offline B2B sessions, networking and business events.' },
    'ОЮЛ · Казахстан':         { kk: 'ЗТБ · Қазақстан',        en: 'LEU · Kazakhstan' },
    'ОО · Казахстан':          { kk: 'ҚБ · Қазақстан',         en: 'PO · Kazakhstan' },
    'Бизнес-клуб · Казахстан': { kk: 'Бизнес-клуб · Қазақстан', en: 'Business club · Kazakhstan' },
    'Бизнес-клуб · Республика Кипр': { kk: 'Бизнес-клуб · Кипр Республикасы', en: 'Business club · Republic of Cyprus' },
    'ОАО · Беларусь':          { kk: 'АҚ · Беларусь',          en: 'OJSC · Belarus' },
    'Правительство Москвы · Российская Федерация': { kk: 'Мәскеу үкіметі · Ресей Федерациясы', en: 'Government of Moscow · Russian Federation' },
    'Палата · Казахстан–Китай': { kk: 'Палата · Қазақстан–Қытай', en: 'Chamber · Kazakhstan–China' },
    'Анкета':                  { kk: 'Сауалнама',              en: 'Application' },
    'Чтобы подать заявку на рассмотрение в качестве Партнёра Бизнес-сообщества «ATAMEKEN Club», необходимо заполнить Анкету.':
      { kk: '«ATAMEKEN Club» бизнес-қауымдастығының Серіктесі ретінде қарастыруға өтінім беру үшін Сауалнаманы толтыру қажет.',
        en: 'To apply for consideration as a Partner of the «ATAMEKEN Club» business community, please fill in the Application form.' },
    'Название организации':    { kk: 'Ұйым атауы',             en: 'Organization name' },
    'Страна':                  { kk: 'Ел',                     en: 'Country' },
    'Область / регион':        { kk: 'Облыс / аймақ',          en: 'Region / area' },
    'Город':                   { kk: 'Қала',                   en: 'City' },
    'Форма учреждения':        { kk: 'Мекеме нысаны',          en: 'Form of establishment' },
    'БИН / рег. номер':        { kk: 'БСН / тіркеу нөмірі',    en: 'BIN / registration number' },
    'Дата основания':          { kk: 'Құрылған күні',          en: 'Date founded' },
    'Ф.И.О. руководителя':     { kk: 'Басшының Аты-жөні',      en: 'Director full name' },
    'Контакты руководителя':   { kk: 'Басшының байланыстары',  en: 'Director contacts' },
    'Ф.И.О. менеджера / администратора': { kk: 'Менеджер / әкімшінің Аты-жөні', en: 'Manager / admin full name' },
    'Контакты менеджера':      { kk: 'Менеджер байланыстары',  en: 'Manager contacts' },
    'Обзорная информация об объединении': { kk: 'Бірлестік туралы шолу ақпарат', en: 'About the association' },
    'Кратко: миссия, ключевые направления, география работы': { kk: 'Қысқаша: миссия, негізгі бағыттар, жұмыс географиясы', en: 'Briefly: mission, key directions, geography' },
    'Количество участников / членов': { kk: 'Қатысушылар / мүшелер саны', en: 'Members count' },
    'Условия участия для членов': { kk: 'Мүшелер үшін қатысу шарттары', en: 'Membership terms' },
    'Виды и формат активности для участников': { kk: 'Қатысушыларға арналған белсенділік түрлері', en: 'Activities for members' },
    'Информация (соцсети, сайт и т.д.)': { kk: 'Ақпарат (соцсетьдер, сайт)', en: 'Info (socials, website)' },

    // ── RESIDENTS
    'Резиденты Бизнес-сообщества «ATAMEKEN Club» — это надёжные и проверенные предприниматели, которые прошли строгий отбор. Резидентом может стать только предприниматель, имеющий рекомендацию от Партнёров Бизнес-сообщества «ATAMEKEN Club», а также по рекомендации от: Национальной палаты предпринимателей Республики Казахстан, Палаты предпринимателей города Алматы, или представительств дипломатических служб иностранных государств.':
      { kk: '«ATAMEKEN Club» бизнес-қауымдастығының Резиденттері — қатаң таңдаудан өткен сенімді кәсіпкерлер. Резидент болу үшін «ATAMEKEN Club» Серіктестерінің, ҚР Кәсіпкерлер ұлттық палатасының, Алматы қаласы кәсіпкерлер палатасының немесе шетел дипломатиялық қызметтерінің ұсынысы керек.',
        en: 'Residents of the «ATAMEKEN Club» business community are reliable, verified entrepreneurs selected via a rigorous process. Residency requires a recommendation from «ATAMEKEN Club» Partners, or from the National Chamber of Entrepreneurs of the Republic of Kazakhstan, the Almaty City Chamber of Entrepreneurs, or foreign diplomatic missions.' },
    'Наращивание количества собственных Резидентов не является приоритетной задачей Бизнес-сообщества «ATAMEKEN Club». Основная цель — создание площадки, на которой добросовестные предприниматели смогут найти себе таких же добросовестных контрагентов со всего мира для дальнейшего сотрудничества.':
      { kk: 'Жеке Резиденттер санын ұлғайту «ATAMEKEN Club» басым міндеті емес. Негізгі мақсат — адал кәсіпкерлер бүкіл әлемнен сондай адал контрагенттерді табатын алаң құру.',
        en: 'Growing the Resident count is not a priority for ATAMEKEN Club. The main goal is to create a platform where reputable entrepreneurs can find equally reputable counterparties from around the world.' },
    'Чтобы подать заявку на рассмотрение в качестве Резидента Бизнес-сообщества «ATAMEKEN Club», необходимо заполнить Анкету.':
      { kk: '«ATAMEKEN Club» Резиденті ретінде қарастыруға өтінім беру үшін Сауалнаманы толтыру қажет.',
        en: 'To apply for «ATAMEKEN Club» Residency, please fill in the Application form.' },
    'Название компании':       { kk: 'Компания атауы',         en: 'Company name' },
    'БИН / Регистрационный номер': { kk: 'БСН / тіркеу нөмірі', en: 'BIN / registration number' },
    'ОКЭД (основной)':         { kk: 'ЭҚЖЖ (негізгі)',         en: 'KFEA (main)' },
    'Ф.И.О. менеджера / контактного лица': { kk: 'Менеджер / байланыс тұлғасының Аты-жөні', en: 'Manager / contact full name' },
    'Обзорная информация о компании': { kk: 'Компания туралы шолу', en: 'Company overview' },
    'Количество сотрудников':  { kk: 'Қызметкерлер саны',      en: 'Employees count' },
    'Размер бизнеса':          { kk: 'Бизнес көлемі',          en: 'Business size' },
    'Выберите размер':         { kk: 'Көлемді таңдаңыз',       en: 'Select size' },
    'Микро':                   { kk: 'Микро',                  en: 'Micro' },
    'Малый':                   { kk: 'Шағын',                  en: 'Small' },
    'Средний':                 { kk: 'Орта',                   en: 'Medium' },
    'Крупный':                 { kk: 'Ірі',                    en: 'Large' },
    'Годовой оборот':          { kk: 'Жылдық айналым',         en: 'Annual turnover' },
    'Рекомендация от:':        { kk: 'Ұсынған:',               en: 'Recommended by:' },
    'Полное наименование организации': { kk: 'Ұйымның толық атауы', en: 'Full organization name' },
    'Прикрепить скан Рекомендательного письма (PDF)': { kk: 'Ұсыным хатының сканын тіркеу (PDF)', en: 'Attach Recommendation letter (PDF)' },
    'Заявка на Резидентство «ATAMEKEN Club»': { kk: '«ATAMEKEN Club» Резиденттігіне өтінім', en: 'Application for «ATAMEKEN Club» Residency' },
    'Заявка подготовлена':     { kk: 'Өтінім дайын',           en: 'Application ready' },

    // ── ABOUT
    'Уникальная площадка':     { kk: 'Бірегей алаң',           en: 'A unique platform' },
    'для международного сотрудничества': { kk: 'халықаралық ынтымақтастық үшін', en: 'for international cooperation' },
    'Бизнес-сообщество «ATAMEKEN Club» — это уникальная площадка, которая создавалась на базе Палаты предпринимателей «Атамекен». Основная задача — предоставить надёжный, безопасный и эффективный инструмент для международного сотрудничества компаниям, заинтересованным в этом и имеющим для этого предпосылки.':
      { kk: '«ATAMEKEN Club» — «Атамекен» Кәсіпкерлер палатасының негізінде құрылған бірегей алаң. Негізгі міндет — мүдделі компанияларға халықаралық ынтымақтастық үшін сенімді, қауіпсіз және тиімді құрал ұсыну.',
        en: 'The «ATAMEKEN Club» business community is a unique platform created on the basis of the «Atameken» Chamber of Entrepreneurs. The main task is to provide a reliable, safe and effective tool for international cooperation to companies that are interested and qualified for it.' },
    'Почему отдельная площадка': { kk: 'Неліктен бөлек алаң',   en: 'Why a separate platform' },
    'Что мы делаем':           { kk: 'Біз не істейміз',        en: 'What we do' },
    'Верификация надёжности':  { kk: 'Сенімділікті тексеру',   en: 'Reliability verification' },

    // ── LEGAL
    'Юридический контур':      { kk: 'Заңдық контур',          en: 'Legal framework' },
    'Обязательный пакет':      { kk: 'Міндетті пакет',         en: 'Mandatory package' },
    'документов':              { kk: 'құжаттар',               en: 'of documents' },
    'Меморандум о сотрудничестве': { kk: 'Ынтымақтастық туралы меморандум', en: 'Memorandum of cooperation' },
    'NDA - Соглашение о неразглашении': { kk: 'NDA — Ашпау туралы келісім', en: 'NDA — Non-Disclosure Agreement' },
    'NCNDA - Ненарушение каналов': { kk: 'NCNDA — Арналарды бұзбау', en: 'NCNDA — Non-Circumvention' },
    'Анкета-заявка на верификацию': { kk: 'Тексеру өтінім-сауалнамасы', en: 'Verification application' },
    'Договор на использование информации': { kk: 'Ақпаратты пайдалану туралы шарт', en: 'Information use agreement' },
    'Онлайн-акцепт на сайте':  { kk: 'Сайттағы онлайн-акцепт', en: 'Online acceptance on site' },
    'Порядок подписания':      { kk: 'Қол қою тәртібі',        en: 'Signing procedure' },
    'Защита данных':           { kk: 'Деректерді қорғау',      en: 'Data protection' },

    // ── LOGIN extras
    'Войдите, чтобы продолжить': { kk: 'Жалғастыру үшін кіріңіз', en: 'Sign in to continue' },
    'Входим...':               { kk: 'Кіруде...',              en: 'Signing in...' },
    'Ошибка входа':            { kk: 'Кіру қатесі',            en: 'Sign-in error' },

    // ── REGISTER (UI strings only — long legal text in modal остаётся на RU)
    'Деловая экосистема':      { kk: 'Іскерлік экожүйе',       en: 'Business ecosystem' },
    'Франчайзер':              { kk: 'Франчайзер',             en: 'Franchisor' },
    'Франчайзи':               { kk: 'Франчайзи',              en: 'Franchisee' },
    'Покупатель готового бизнеса': { kk: 'Дайын бизнес сатып алушы', en: 'Buyer of operating business' },
    'Покупатель товаров и сырья': { kk: 'Тауар мен шикізат сатып алушы', en: 'Buyer of goods and raw materials' },
    'Краткая выдержка из ключевых положений.': { kk: 'Негізгі ережелердің қысқаша мазмұны.', en: 'Brief summary of key terms.' },
    'Прочитать полный текст (26 разделов) →': { kk: 'Толық мәтінді оқу (26 бөлім) →', en: 'Read full text (26 sections) →' },
    'Создаём...':              { kk: 'Жасалуда...',            en: 'Creating...' },
    'Подтвердите, что вы не робот': { kk: 'Сіз робот еместігіңізді растаңыз', en: 'Confirm you are not a robot' },
    'Подождите пока загрузится проверка и повторите.': { kk: 'Тексеру жүктелгенше күтіп, қайталаңыз.', en: 'Wait for the check to load and retry.' },
    'Аккаунт создан. Перенаправляем...': { kk: 'Аккаунт жасалды. Бағыттаймыз...', en: 'Account created. Redirecting...' },
    'Этот email уже зарегистрирован': { kk: 'Бұл email бұрыннан тіркелген', en: 'This email is already registered' },
    'Похоже, у вас уже есть аккаунт.': { kk: 'Сізде аккаунт бар сияқты.', en: 'It looks like you already have an account.' },
    'Войти с этим email':      { kk: 'Осы email-мен кіру',     en: 'Sign in with this email' },
    'Не удалось зарегистрироваться. Попробуйте ещё раз.': { kk: 'Тіркелу мүмкін болмады. Қайталап көріңіз.', en: 'Sign-up failed. Please try again.' },

    // ── FORGOT-PASSWORD
    'Восстановление пароля':   { kk: 'Құпиясөзді қалпына келтіру', en: 'Password recovery' },
    'Введите email от вашего аккаунта — отправим ссылку для установки нового пароля. Ссылка действует 1 час.':
      { kk: 'Аккаунтыңыздың email-ін енгізіңіз — жаңа құпиясөз орнату үшін сілтеме жібереміз. Сілтеме 1 сағат әрекет етеді.',
        en: 'Enter your account email — we will send a link to set a new password. The link is valid for 1 hour.' },
    'Отправить ссылку':        { kk: 'Сілтеме жіберу',         en: 'Send link' },
    'Вспомнили пароль?':       { kk: 'Құпиясөзді есіңізге түсірдіңіз бе?', en: 'Remembered your password?' },
    'Введите email':           { kk: 'Email-ді енгізіңіз',     en: 'Enter email' },
    'Отправляем…':        { kk: 'Жіберілуде…',       en: 'Sending…' },
    'Если такой email зарегистрирован — ссылка отправлена. Проверьте почту (включая «Спам»).':
      { kk: 'Егер мұндай email тіркелген болса — сілтеме жіберілді. Поштаңызды тексеріңіз («Спам» қалтасын қоса).',
        en: 'If this email is registered — the link has been sent. Check your inbox (including Spam).' },
    '✓ Отправлено':            { kk: '✓ Жіберілді',            en: '✓ Sent' },
    'Не удалось отправить. Попробуйте позже.': { kk: 'Жіберу мүмкін болмады. Кейінірек көріңіз.', en: 'Failed to send. Please try later.' },

    // ── RESET-PASSWORD
    'Новый пароль':            { kk: 'Жаңа құпиясөз',          en: 'New password' },
    'Установите новый пароль': { kk: 'Жаңа құпиясөз орнатыңыз', en: 'Set a new password' },
    'Минимум 8 символов. После сохранения вы будете автоматически отключены на всех устройствах — войдите заново с новым паролем.':
      { kk: 'Кемінде 8 таңба. Сақтағаннан кейін сіз барлық құрылғылардан автоматты түрде шығасыз — жаңа құпиясөзбен қайта кіріңіз.',
        en: 'At least 8 characters. After saving, you will be logged out on all devices — sign in again with the new password.' },
    'Используйте буквы, цифры и хотя бы один спец-символ.': { kk: 'Әріптерді, сандарды және кем дегенде бір арнайы таңбаны пайдаланыңыз.', en: 'Use letters, digits and at least one special character.' },
    'Повторите пароль':        { kk: 'Құпиясөзді қайталаңыз', en: 'Repeat password' },
    'Сохранить пароль':        { kk: 'Құпиясөзді сақтау',     en: 'Save password' },
    '← Вернуться ко входу':    { kk: '← Кіруге қайту',         en: '← Back to sign in' },
    'Ссылка некорректна. Запросите новую через «Забыли пароль?».': { kk: 'Сілтеме жарамсыз. «Құпиясөзді ұмыттыңыз ба?» арқылы жаңасын сұраңыз.', en: 'Link is invalid. Request a new one via «Forgot password?».' },
    'Сохраняем…':         { kk: 'Сақталуда…',        en: 'Saving…' },
    'Пароль должен быть не короче 8 символов': { kk: 'Құпиясөз кем дегенде 8 таңбадан тұруы керек', en: 'Password must be at least 8 characters' },
    'Пароли не совпадают':     { kk: 'Құпиясөздер сәйкес келмейді', en: 'Passwords do not match' },
    'Пароль обновлён. Перенаправляем на вход…': { kk: 'Құпиясөз жаңартылды. Кіруге бағыттаймыз…', en: 'Password updated. Redirecting to sign in…' },
    'Не удалось сохранить пароль. Запросите новую ссылку.': { kk: 'Құпиясөзді сақтау мүмкін болмады. Жаңа сілтеме сұраңыз.', en: 'Failed to save password. Request a new link.' },

    // ── VERIFY (form labels + industries select)
    'В кабинет':               { kk: 'Кабинетке',              en: 'To cabinet' },
    'Выйти':                   { kk: 'Шығу',                   en: 'Sign out' },
    'Загрузка…':          { kk: 'Жүктелуде…',        en: 'Loading…' },
    'Верификация профиля':     { kk: 'Профильді тексеру',      en: 'Profile verification' },
    'Заполните анкету компании или проекта и отправьте её на проверку оператору': { kk: 'Компания немесе жоба сауалнамасын толтырып, оны операторға тексеруге жіберіңіз', en: 'Fill in the company or project form and submit it to the operator for review' },
    'Назад в кабинет':         { kk: 'Кабинетке оралу',        en: 'Back to cabinet' },
    'Профиль не верифицирован': { kk: 'Профиль тексерілмеген',  en: 'Profile not verified' },
    'Заполните анкету и отправьте её на проверку': { kk: 'Сауалнаманы толтырып, оны тексеруге жіберіңіз', en: 'Fill in the form and submit it for review' },
    'Проверка':                { kk: 'Тексеру',                en: 'Review' },
    'Публикация':              { kk: 'Жариялау',               en: 'Publication' },
    'Заполненность анкеты':    { kk: 'Сауалнаманың толтырылуы', en: 'Form completeness' },
    'Минимум: название компании, отрасль, регион, БИН и описание': { kk: 'Минимум: компания атауы, сала, аймақ, БСН және сипаттама', en: 'Minimum: company name, industry, region, BIN, description' },
    'Основные сведения':       { kk: 'Негізгі мәліметтер',     en: 'Basic information' },
    'Полное наименование компании / проекта *': { kk: 'Компания / жобаның толық атауы *', en: 'Full company / project name *' },
    'ТОО «Название» или Проект «Название»': { kk: 'ЖШС «Атау» немесе Жоба «Атау»', en: 'LLP «Name» or Project «Name»' },
    'Год основания':           { kk: 'Құрылған жылы',          en: 'Year founded' },
    'Отрасль *':               { kk: 'Сала *',                 en: 'Industry *' },
    // Industries
    'Агропромышленный комплекс': { kk: 'Агроөнеркәсіптік кешен', en: 'Agro-industrial complex' },
    'Агропром / растениеводство': { kk: 'Агроөнеркәсіп / өсімдік шаруашылығы', en: 'Agriculture / crop farming' },
    'Животноводство и птицеводство': { kk: 'Мал шаруашылығы және құс шаруашылығы', en: 'Livestock and poultry' },
    'Пищевая промышленность':  { kk: 'Тамақ өнеркәсібі',       en: 'Food industry' },
    'Рыбное хозяйство и аквакультура': { kk: 'Балық шаруашылығы және аквамәдениет', en: 'Fisheries and aquaculture' },
    'Промышленность и сырьё':  { kk: 'Өнеркәсіп және шикізат', en: 'Industry and raw materials' },
    'Нефть, газ и нефтехимия': { kk: 'Мұнай, газ және мұнай-химия', en: 'Oil, gas and petrochemicals' },
    'Горнодобывающая отрасль': { kk: 'Тау-кен өндіру саласы',  en: 'Mining' },
    'Металлургия и металлообработка': { kk: 'Металлургия және металл өңдеу', en: 'Metallurgy and metalworking' },
    'Химия и удобрения':       { kk: 'Химия және тыңайтқыштар', en: 'Chemistry and fertilizers' },
    'Лёгкая промышленность / текстиль': { kk: 'Жеңіл өнеркәсіп / тоқыма', en: 'Light industry / textiles' },
    'Машиностроение':          { kk: 'Машина жасау',           en: 'Mechanical engineering' },
    'Деревообработка и мебель': { kk: 'Ағаш өңдеу және жиһаз',  en: 'Woodworking and furniture' },
    'Строительные материалы':  { kk: 'Құрылыс материалдары',   en: 'Construction materials' },
    'Энергетика и инфраструктура': { kk: 'Энергетика және инфрақұрылым', en: 'Energy and infrastructure' },
    'Энергетика (традиционная)': { kk: 'Энергетика (дәстүрлі)', en: 'Energy (traditional)' },
    'ВИЭ / возобновляемая энергетика': { kk: 'ЖЭК / жаңартылатын энергетика', en: 'RES / renewable energy' },
    'ЖКХ и водоснабжение':     { kk: 'ТКШ және сумен жабдықтау', en: 'Utilities and water supply' },
    'Строительство и девелопмент': { kk: 'Құрылыс және девелопмент', en: 'Construction and development' },
    'Недвижимость (коммерческая)': { kk: 'Жылжымайтын мүлік (коммерциялық)', en: 'Real estate (commercial)' },
    'Недвижимость (жилая)':    { kk: 'Жылжымайтын мүлік (тұрғын)', en: 'Real estate (residential)' },
    'Транспорт и логистика':   { kk: 'Көлік және логистика',   en: 'Transport and logistics' },
    'Складская и портовая инфраструктура': { kk: 'Қойма және порт инфрақұрылымы', en: 'Warehouse and port infrastructure' },
    'Технологии и сервисы':    { kk: 'Технологиялар мен қызметтер', en: 'Technology and services' },
    'IT / разработка ПО':      { kk: 'IT / БҚ әзірлеу',        en: 'IT / software development' },
    'HealthTech / MedTech':    { kk: 'HealthTech / MedTech',   en: 'HealthTech / MedTech' },
    'Кибербезопасность':       { kk: 'Кибер қауіпсіздік',      en: 'Cybersecurity' },
    'Телеком и связь':         { kk: 'Телеком және байланыс',  en: 'Telecom and communications' },
    'Медиа и реклама':         { kk: 'Медиа және жарнама',     en: 'Media and advertising' },
    'Маркетинг / digital':     { kk: 'Маркетинг / digital',    en: 'Marketing / digital' },
    'Консалтинг и аутсорсинг': { kk: 'Консалтинг және аутсорсинг', en: 'Consulting and outsourcing' },
    'Юридические услуги':      { kk: 'Заңдық қызметтер',       en: 'Legal services' },
    'Бухгалтерия и аудит':     { kk: 'Бухгалтерия және аудит', en: 'Accounting and audit' },
    'Потребительский рынок':   { kk: 'Тұтыну нарығы',          en: 'Consumer market' },
    'Ритейл и e-commerce':     { kk: 'Ритейл және e-commerce', en: 'Retail and e-commerce' },
    'HoReCa и общепит':        { kk: 'HoReCa және қоғамдық тамақтану', en: 'HoReCa and catering' },
    'Туризм и гостеприимство': { kk: 'Туризм және қонақжайлылық', en: 'Tourism and hospitality' },
    'Развлечения и спорт':     { kk: 'Ойын-сауық және спорт',  en: 'Entertainment and sports' },
    'Образование (частное)':   { kk: 'Білім беру (жекеменшік)', en: 'Education (private)' },
    'Медицина (частная)':      { kk: 'Медицина (жекеменшік)',  en: 'Medicine (private)' },
    'Фарма и косметика':       { kk: 'Фарма және косметика',   en: 'Pharma and cosmetics' },
    'Бытовые услуги':          { kk: 'Тұрмыстық қызметтер',    en: 'Household services' },
    'Финансы':                 { kk: 'Қаржы',                  en: 'Finance' },
    'Банки и микрофинансы':    { kk: 'Банктер және микрокаржы', en: 'Banks and microfinance' },
    'Страхование':             { kk: 'Сақтандыру',             en: 'Insurance' },
    'Инвестиции и фонды':      { kk: 'Инвестициялар және қорлар', en: 'Investments and funds' },
    'Лизинг и факторинг':      { kk: 'Лизинг және факторинг',  en: 'Leasing and factoring' },
    'Прочее':                  { kk: 'Басқа',                  en: 'Other' },
    'Государственный сектор / GR': { kk: 'Мемлекеттік сектор / GR', en: 'Public sector / GR' },
    'НКО / социальные проекты': { kk: 'КЕҰ / әлеуметтік жобалар', en: 'NPO / social projects' },
    'Другое':                  { kk: 'Басқа',                  en: 'Other' },
    'БИН / регистрационный номер *': { kk: 'БСН / тіркеу нөмірі *', en: 'BIN / registration number *' },
    'Сайт и соцсети':          { kk: 'Сайт және әлеуметтік желілер', en: 'Website and social media' },
    'Сайт':                    { kk: 'Сайт',                   en: 'Website' },
    'Краткая выжимка *':       { kk: 'Қысқаша үзінді *',       en: 'Brief summary *' },
    '(для каталога, видна всем)': { kk: '(каталог үшін, барлығына көрінеді)', en: '(for catalog, visible to all)' },
    'Кратко: что делаете, для кого, какой результат. 1-2 абзаца.': { kk: 'Қысқаша: не істейсіз, кімге, қандай нәтиже. 1-2 абзац.', en: 'Briefly: what you do, for whom, what result. 1-2 paragraphs.' },
    'Минимум 30 символов. Эта версия отображается на сайте.': { kk: 'Кемінде 30 таңба. Бұл нұсқа сайтта көрсетіледі.', en: 'Minimum 30 characters. This version is shown on the site.' },
    'Полное описание *':       { kk: 'Толық сипаттама *',      en: 'Full description *' },
    'только для администраторов': { kk: 'тек әкімшілер үшін',  en: 'admin only' },
    'Это описание видят только администраторы платформы для эффективного размещения по категориям. Не публикуется.': { kk: 'Бұл сипаттаманы тек платформа әкімшілері тиімді санаттарға бөлу үшін көреді. Жарияланбайды.', en: 'This description is only seen by platform admins for effective categorization. Not published.' },
    'Рекомендация':            { kk: 'Ұсыным',                 en: 'Recommendation' },
    'Рекомендация ускоряет верификацию.': { kk: 'Ұсыным тексеруді жылдамдатады.', en: 'A recommendation speeds up verification.' },
    'Инвестиционные параметры': { kk: 'Инвестициялық параметрлер', en: 'Investment parameters' },
    'Годовая выручка':         { kk: 'Жылдық кіріс',           en: 'Annual revenue' },
    'Сотрудников':             { kk: 'Қызметкерлер',           en: 'Employees' },
    'Запрашиваемые инвестиции': { kk: 'Сұралатын инвестициялар', en: 'Requested investment' },
    'Цель инвестиций':         { kk: 'Инвестиция мақсаты',     en: 'Investment purpose' },
    'На что пойдут средства':  { kk: 'Қаражат неге жұмсалады', en: 'Where funds will be used' },
    'Контактное лицо':         { kk: 'Байланыс тұлғасы',       en: 'Contact person' },
    'Имя представителя':       { kk: 'Өкіл аты',               en: 'Representative name' },
    'Контактный телефон':      { kk: 'Байланыс телефоны',      en: 'Contact phone' },
    'Контактный email':        { kk: 'Байланыс email',         en: 'Contact email' },
    'Что происходит дальше?':  { kk: 'Әрі қарай не болады?',   en: 'What happens next?' },
    'Вы отправляете анкету':   { kk: 'Сіз сауалнаманы жібересіз', en: 'You submit the form' },
    'Оператор проверяет данные': { kk: 'Оператор деректерді тексереді', en: 'Operator reviews the data' },
    'В течение 2 рабочих дней мы изучим анкету и свяжемся с вами.': { kk: '2 жұмыс күні ішінде сауалнаманы зерттеп, сізбен хабарласамыз.', en: 'Within 2 business days, we will review the form and contact you.' },
    'Подписание документов':   { kk: 'Құжаттарға қол қою',     en: 'Document signing' },
    'Меморандум, NDA и договор об использовании данных - онлайн или офлайн.': { kk: 'Меморандум, NDA және деректерді пайдалану туралы шарт — онлайн немесе офлайн.', en: 'Memorandum, NDA and data use agreement — online or offline.' },
    'Ваш профиль появляется в каталоге. Полные данные - только для верифицированных инвесторов.': { kk: 'Сіздің профиліңіз каталогта пайда болады. Толық деректер — тек тексерілген инвесторлар үшін.', en: 'Your profile appears in the catalog. Full data — only for verified investors.' },
    'Сохранить черновик':      { kk: 'Жобаны сақтау',          en: 'Save draft' },
    'Отправить на верификацию': { kk: 'Тексеруге жіберу',      en: 'Submit for verification' },
    'Нажимая «Отправить», вы соглашаетесь с обработкой данных и условиями платформы.': { kk: '«Жіберу» түймесін басу арқылы сіз деректерді өңдеу мен платформа шарттарына келісім бересіз.', en: 'By clicking «Submit», you agree to data processing and platform terms.' },
    'Укажите название компании': { kk: 'Компания атауын көрсетіңіз', en: 'Specify company name' },
    'Сохранено ✓':             { kk: 'Сақталды ✓',             en: 'Saved ✓' },
    'Ошибка сохранения':       { kk: 'Сақтау қатесі',          en: 'Save error' },
    'Заполните обязательные поля: название, отрасль, регион, БИН, описание.': { kk: 'Міндетті өрістерді толтырыңыз: атау, сала, аймақ, БСН, сипаттама.', en: 'Fill in required fields: name, industry, region, BIN, description.' },
    'Заявка отправлена! Модераторы свяжутся с вами в течение 2 рабочих дней.': { kk: 'Өтінім жіберілді! Модераторлар сізбен 2 жұмыс күні ішінде хабарласады.', en: 'Application submitted! Moderators will contact you within 2 business days.' },
    'Профиль верифицирован':   { kk: 'Профиль тексерілген',    en: 'Profile verified' },
    'Отправлено - ожидает проверки': { kk: 'Жіберілді — тексеруді күтуде', en: 'Submitted — pending review' },
    'Заявка на проверке':      { kk: 'Өтінім тексерілуде',     en: 'Application under review' },
    'Модераторы рассмотрят заявку в течение 2 рабочих дней.': { kk: 'Модераторлар өтінімді 2 жұмыс күні ішінде қарастырады.', en: 'Moderators will review the application within 2 business days.' },
    'Ваша карточка опубликована в каталоге ATAMEKEN Club.': { kk: 'Сіздің карточкаңыз ATAMEKEN Club каталогында жарияланды.', en: 'Your card is published in the ATAMEKEN Club catalog.' },
    'Заявка отклонена':        { kk: 'Өтінім қабылданбады',    en: 'Application rejected' },
    'Свяжитесь с оператором для уточнения и отправьте заявку повторно.': { kk: 'Нақтылау үшін оператормен хабарласып, өтінімді қайталап жіберіңіз.', en: 'Contact the operator for clarification and resubmit.' },
  };

  // ─── Helpers ────────────────────────────────────────────────────────────────
  const LANGS = ['ru', 'kk', 'en', 'zh'];
  const BTN_LABELS = { ru: 'RU', kk: 'KZ', en: 'EN', zh: '中文' };

  // Cache of original Russian text per text node, keyed by a WeakMap.
  // We rebuild on lang change instead of caching to keep things simple.
  // Original DOM text is always Russian (HTML source of truth).
  // Therefore: when switching lang we read the *current* DOM text — but only
  // if current lang === 'ru'; otherwise we already overwrote it. To handle this
  // we keep an original snapshot per node.
  const ORIG = new WeakMap(); // node → original russian text

  function getOriginal(node, current) {
    if (!ORIG.has(node)) ORIG.set(node, current);
    return ORIG.get(node);
  }

  function translateText(ruText, lang) {
    if (lang === 'ru' || !ruText) return ruText;
    const trimmed = ruText.trim();
    if (!trimmed) return ruText;
    const entry = D[trimmed];
    if (!entry) return ruText;
    const t = entry[lang];
    if (!t) return ruText;
    // preserve leading/trailing whitespace
    const lead = ruText.match(/^\s*/)[0];
    const tail = ruText.match(/\s*$/)[0];
    return lead + t + tail;
  }

  function walkAndTranslate(lang) {
    // 1) Text nodes
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const p = n.parentNode;
        if (!p) return NodeFilter.FILTER_REJECT;
        const tag = p.nodeName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA') return NodeFilter.FILTER_REJECT;
        if (p.closest && p.closest('[data-i18n-skip]')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let node;
    while ((node = walker.nextNode())) {
      const original = getOriginal(node, node.nodeValue);
      const next = translateText(original, lang);
      if (node.nodeValue !== next) node.nodeValue = next;
    }
    // 2) Attributes: placeholder, title, aria-label, alt
    const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
    document.querySelectorAll('[placeholder],[title],[aria-label],[alt]').forEach((el) => {
      ATTRS.forEach((a) => {
        if (!el.hasAttribute(a)) return;
        try {
          const cacheKey = 'i18nOrig' + a.replace(/(^|-)([a-z])/g, (_, _d, c) => c.toUpperCase());
          if (!el.dataset[cacheKey]) el.dataset[cacheKey] = el.getAttribute(a);
          el.setAttribute(a, translateText(el.dataset[cacheKey], lang));
        } catch (_) { /* ignore */ }
      });
    });
  }

  // Buttons are always in fixed order: RU, KZ, EN, 中文
  const LANG_ORDER = ['ru', 'kk', 'en', 'zh'];
  const LANG_LABELS = { ru: 'RU', kk: 'KZ', en: 'EN', zh: '中文' };

  function setActiveButton(lang) {
    const idx = LANG_ORDER.indexOf(lang);
    document.querySelectorAll('.lang-switch').forEach((sw) => {
      const buttons = sw.querySelectorAll('.lang-btn');
      buttons.forEach((b, i) => b.classList.toggle('active', i === idx));
    });
    // Update dropdown current label
    document.querySelectorAll('.lang-dd-current').forEach((el) => {
      el.textContent = LANG_LABELS[lang] || 'RU';
    });
    const htmlLang = lang === 'kk' ? 'kk' : (lang === 'en' ? 'en' : (lang === 'zh' ? 'zh' : 'ru'));
    document.documentElement.setAttribute('lang', htmlLang);
  }

  function applyLang(lang) {
    if (!LANGS.includes(lang)) lang = 'ru';
    if (lang === 'zh') {
      // Chinese is deferred; treat as fallback to RU but mark active button.
      walkAndTranslate('ru');
      setActiveButton('zh');
      try { localStorage.setItem('ac_lang', 'zh'); } catch (_) {}
      return;
    }
    walkAndTranslate(lang);
    setActiveButton(lang);
    try { localStorage.setItem('ac_lang', lang); } catch (_) {}
  }

  function wireUp() {
    // Lang option buttons (inside dropdown menu)
    document.querySelectorAll('.lang-switch').forEach((sw) => {
      const buttons = sw.querySelectorAll('.lang-btn');
      buttons.forEach((btn, i) => {
        btn.addEventListener('click', () => {
          const lang = LANG_ORDER[i] || 'ru';
          applyLang(lang);
          // close any open dropdown
          document.querySelectorAll('.lang-dd.open').forEach((dd) => dd.classList.remove('open'));
          const tgl = sw.parentElement && sw.parentElement.querySelector('.lang-dd-toggle');
          if (tgl) tgl.setAttribute('aria-expanded', 'false');
        });
      });
    });
    // Dropdown toggle
    document.querySelectorAll('.lang-dd-toggle').forEach((tgl) => {
      tgl.addEventListener('click', (e) => {
        e.stopPropagation();
        const dd = tgl.closest('.lang-dd');
        if (!dd) return;
        // Close other dropdowns
        document.querySelectorAll('.lang-dd.open').forEach((d) => { if (d !== dd) d.classList.remove('open'); });
        const open = dd.classList.toggle('open');
        tgl.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    });
    // Click outside closes dropdown
    document.addEventListener('click', (e) => {
      if (e.target.closest && e.target.closest('.lang-dd')) return;
      document.querySelectorAll('.lang-dd.open').forEach((dd) => {
        dd.classList.remove('open');
        const tgl = dd.querySelector('.lang-dd-toggle');
        if (tgl) tgl.setAttribute('aria-expanded', 'false');
      });
    });
    // Esc closes
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      document.querySelectorAll('.lang-dd.open').forEach((dd) => {
        dd.classList.remove('open');
        const tgl = dd.querySelector('.lang-dd-toggle');
        if (tgl) tgl.setAttribute('aria-expanded', 'false');
      });
    });
    let saved = 'ru';
    try { saved = localStorage.getItem('ac_lang') || 'ru'; } catch (_) {}
    if (saved !== 'ru') applyLang(saved); else setActiveButton('ru');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireUp);
  } else {
    wireUp();
  }

  // Expose for debugging / dynamic content
  window.ACLang = { apply: applyLang, dict: D };
})();
