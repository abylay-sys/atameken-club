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
    'Участникам':              { kk: 'Қатысушыларға',          en: 'For members' },
    'Верификация':             { kk: 'Тексеру',                en: 'Verification' },
    'Проекты':                 { kk: 'Жобалар',                en: 'Projects' },
    'Услуги':                  { kk: 'Қызметтер',              en: 'Services' },
    'Календарь':               { kk: 'Күнтізбе',               en: 'Calendar' },
    'Тарифы':                  { kk: 'Тарифтер',               en: 'Pricing' },
    'Партнеры':                { kk: 'Серіктестер',            en: 'Partners' },
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
    '© 2025 ТОО «ATAMEKEN Web». Все права защищены.': { kk: '© 2025 «ATAMEKEN Web» ЖШС. Барлық құқықтар қорғалған.', en: '© 2025 ATAMEKEN Web LLP. All rights reserved.' },
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
        // skip script/style/textarea
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
    // 2) Attributes: placeholder, title, aria-label, value (for buttons), alt
    const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
    document.querySelectorAll('[placeholder],[title],[aria-label],[alt]').forEach((el) => {
      ATTRS.forEach((a) => {
        if (!el.hasAttribute(a)) return;
        const key = '__i18n_' + a;
        if (!(key in el.dataset)) el.dataset[key.slice(2)] = el.getAttribute(a);
        const original = el.dataset[key.slice(2)] || el.getAttribute(a);
        el.setAttribute(a, translateText(original, lang));
      });
    });
    // 3) <option> values (selects) — handled by text nodes
  }

  function setActiveButton(lang) {
    document.querySelectorAll('.lang-btn').forEach((b) => {
      const txt = (b.textContent || '').trim();
      let bLang = 'ru';
      if (txt === 'KZ' || txt === 'KK') bLang = 'kk';
      else if (txt === 'EN') bLang = 'en';
      else if (/中/.test(txt)) bLang = 'zh';
      b.classList.toggle('active', bLang === lang);
    });
    document.documentElement.setAttribute('lang', lang === 'kk' ? 'kk' : (lang === 'en' ? 'en' : (lang === 'zh' ? 'zh' : 'ru')));
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
    document.querySelectorAll('.lang-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const txt = (btn.textContent || '').trim();
        if (txt === 'RU') applyLang('ru');
        else if (txt === 'KZ' || txt === 'KK') applyLang('kk');
        else if (txt === 'EN') applyLang('en');
        else if (/中/.test(txt)) applyLang('zh');
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
