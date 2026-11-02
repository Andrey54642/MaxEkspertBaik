import { useState, useRef } from 'react';

type Tab = 'setup' | 'roles' | 'commands' | 'code' | 'demo';

export default function App() {
  const [tab, setTab] = useState<Tab>('setup');
  const [copied, setCopied] = useState(false);

  const copyCode = () => {
    fetch('/bot.js')
      .then(r => r.text())
      .then(code => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
  };

  const downloadCode = () => {
    fetch('/bot.js')
      .then(r => r.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'maxbot.js';
        a.click();
        URL.revokeObjectURL(url);
      });
  };

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'setup', label: 'Установка', icon: '🚀' },
    { key: 'roles', label: 'Роли', icon: '👑' },
    { key: 'commands', label: 'Команды', icon: '📋' },
    { key: 'code', label: 'Код бота', icon: '💻' },
    { key: 'demo', label: 'Демо', icon: '🤖' },
  ];

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gradient-to-r from-gray-800 to-gray-900 border-b border-gray-700 px-4 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center text-xl">🤖</div>
            <div>
              <h1 className="text-xl font-bold text-emerald-400">MaxBot</h1>
              <p className="text-xs text-gray-400">Бот для MAX • Аренда электровелосипедов • Система ролей</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={downloadCode} className="bg-emerald-600 hover:bg-emerald-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors">
              📥 Скачать bot.js
            </button>
            <button onClick={copyCode} className="bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded-lg text-sm font-medium transition-colors">
              {copied ? '✅ Скопировано!' : '📋 Копировать'}
            </button>
          </div>
        </div>
      </header>

      <nav className="bg-gray-800/50 border-b border-gray-700 px-4">
        <div className="max-w-5xl mx-auto flex gap-1 overflow-x-auto">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-all border-b-2 ${
                tab === t.key
                  ? 'text-emerald-400 border-emerald-400'
                  : 'text-gray-400 border-transparent hover:text-white'
              }`}
            >
              <span className="mr-2">{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="max-w-5xl mx-auto p-4 sm:p-6">
        {tab === 'setup' && <SetupTab />}
        {tab === 'roles' && <RolesTab />}
        {tab === 'commands' && <CommandsTab />}
        {tab === 'code' && <CodeTab />}
        {tab === 'demo' && <DemoTab />}
      </main>
    </div>
  );
}

// ==================== SETUP ====================
function SetupTab() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">🚀 Установка</h2>
        <p className="text-gray-400">Быстрый старт — 5 минут</p>
      </div>

      <div className="bg-gradient-to-r from-emerald-500/10 to-blue-500/10 rounded-xl p-5 border border-emerald-500/30">
        <h3 className="font-semibold text-lg mb-3">👑 Владелец бота</h3>
        <p className="text-gray-300 text-sm mb-2">Главный администратор — <strong className="text-emerald-400">+79081749088</strong></p>
        <p className="text-gray-400 text-sm">Только владелец может назначать админов, управлять клиентами, велосипедами и настройками.</p>
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold mb-3">📥 1. Создайте бота в MAX</h3>
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div className="bg-gray-700/50 rounded-lg p-3">
            <p className="font-semibold text-emerald-400 mb-1">Через @MasterBot</p>
            <p className="text-gray-400">Найдите @MasterBot в MAX → создайте бота → получите токен</p>
          </div>
          <div className="bg-gray-700/50 rounded-lg p-3">
            <p className="font-semibold text-emerald-400 mb-1">Через платформу</p>
            <p className="text-gray-400"><a href="https://business.max.ru/self" className="text-blue-400 underline">business.max.ru/self</a> → Чат-боты → Настройки → Токен</p>
          </div>
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold mb-3">🖥️ 2. Запустите на сервере</h3>
        <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm space-y-1">
          <div className="text-gray-500"># Сохраните bot.js на сервер</div>
          <div className="text-emerald-400">MAX_BOT_TOKEN="ваш_токен" node bot.js</div>
          <div className="mt-2 text-gray-500"># Или через .env:</div>
          <div className="text-emerald-400">echo 'MAX_BOT_TOKEN=ваш_токен' &gt; .env</div>
          <div className="text-emerald-400">node bot.js</div>
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold mb-3">👑 3. Станьте владельцем</h3>
        <div className="text-sm text-gray-300 space-y-2">
          <p>1. Откройте MAX и напишите боту <code className="bg-gray-700 px-1 rounded">/start</code></p>
          <p>2. Бот попросит ввести номер телефона</p>
          <p>3. Введите <strong className="text-emerald-400">+79081749088</strong></p>
          <p>4. ✅ Теперь вы — владелец с полным доступом!</p>
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold mb-3">💼 4. Назначьте админов</h3>
        <div className="text-sm text-gray-300 space-y-2">
          <p>1. Добавьте арендатора: <code className="bg-gray-700 px-1 rounded">/add_renter</code></p>
          <p>2. Попросите человека написать боту <code className="bg-gray-700 px-1 rounded">/bind</code></p>
          <p>3. Назначьте админом: <code className="bg-gray-700 px-1 rounded">/set_admin</code></p>
          <p>4. Закрепите клиентов: <code className="bg-gray-700 px-1 rounded">/assign_admin</code></p>
        </div>
      </div>
    </div>
  );
}

// ==================== ROLES ====================
function RolesTab() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">👑 Система ролей</h2>
        <p className="text-gray-400">Три уровня доступа с чётким разделением прав</p>
      </div>

      <div className="grid gap-4">
        {/* Owner */}
        <div className="bg-gradient-to-br from-yellow-500/10 to-orange-500/10 rounded-xl p-5 border border-yellow-500/30">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-3xl">👑</span>
            <div>
              <h3 className="text-xl font-bold text-yellow-400">OWNER — Владелец</h3>
              <p className="text-sm text-gray-400">+79081749088 • Полный доступ ко всему</p>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-800/70 rounded-lg p-3">
              <p className="font-semibold text-yellow-300 mb-1">✅ Может:</p>
              <ul className="text-gray-300 space-y-0.5">
                <li>• Назначать/убирать админов</li>
                <li>• Добавлять/удалять арендаторов</li>
                <li>• Добавлять/удалять велосипеды</li>
                <li>• Создавать платежи</li>
                <li>• Закреплять админов за клиентами</li>
                <li>• Менять настройки (время отчётов)</li>
                <li>• Видеть всё и всех</li>
              </ul>
            </div>
            <div className="bg-gray-800/70 rounded-lg p-3">
              <p className="font-semibold text-yellow-300 mb-1">📋 Команды:</p>
              <p className="text-gray-400 font-mono text-xs">/set_admin, /remove_admin, /admins, /assign_admin, /settings, /add_renter, /add_bike, /add_payment, /check_reminders + все остальные</p>
            </div>
          </div>
        </div>

        {/* Admin */}
        <div className="bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-xl p-5 border border-blue-500/30">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-3xl">💼</span>
            <div>
              <h3 className="text-xl font-bold text-blue-400">ADMIN — Админ</h3>
              <p className="text-sm text-gray-400">Назначается владельцем • Управляет закреплёнными клиентами</p>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-800/70 rounded-lg p-3">
              <p className="font-semibold text-blue-300 mb-1">✅ Может:</p>
              <ul className="text-gray-300 space-y-0.5">
                <li>• Видеть только своих клиентов</li>
                <li>• Получать утренние отчёты (09:00)</li>
                <li>• Получать вечерние отчёты (21:00)</li>
                <li>• Видеть статус оплат клиентов</li>
                <li>• Получать уведомления о чеках</li>
              </ul>
            </div>
            <div className="bg-gray-800/70 rounded-lg p-3">
              <p className="font-semibold text-blue-300 mb-1">📋 Команды:</p>
              <p className="text-gray-400 font-mono text-xs">/my_clients, /clients_status, /renters (своих), /payments, /overdue, /stats, /reminders</p>
            </div>
          </div>
          <div className="mt-3 bg-gray-800/70 rounded-lg p-3 text-sm">
            <p className="font-semibold text-blue-300 mb-1">📬 Ежедневные отчёты:</p>
            <div className="grid sm:grid-cols-2 gap-2 text-gray-300">
              <div>🌅 <strong>Утро:</strong> Кто должен оплатить сегодня + ближайшие 3 дня</div>
              <div>🌙 <strong>Вечер:</strong> Кто оплатил + кто НЕ оплатил + завтрашний срок</div>
            </div>
          </div>
        </div>

        {/* Client */}
        <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 rounded-xl p-5 border border-green-500/30">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-3xl">🚲</span>
            <div>
              <h3 className="text-xl font-bold text-green-400">CLIENT — Клиент</h3>
              <p className="text-sm text-gray-400">Арендатор • Только уведомления об оплате</p>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-800/70 rounded-lg p-3">
              <p className="font-semibold text-green-300 mb-1">✅ Может:</p>
              <ul className="text-gray-300 space-y-0.5">
                <li>• Привязать аккаунт (/bind)</li>
                <li>• Отправить чек (/receipt)</li>
                <li>• Посмотреть свою задолженность</li>
                <li>• Получать напоминания об оплате</li>
              </ul>
            </div>
            <div className="bg-gray-800/70 rounded-lg p-3">
              <p className="font-semibold text-green-300 mb-1">📋 Команды:</p>
              <p className="text-gray-400 font-mono text-xs">/bind, /receipt, /my_debt, /start, /help</p>
            </div>
          </div>
        </div>
      </div>

      {/* Схема работы */}
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-lg mb-4">🔄 Схема работы</h3>
        <div className="space-y-3">
          <FlowStep num={1} text="Владелец добавляет арендатора (/add_renter)" />
          <FlowStep num={2} text="Арендатор пишет боту /bind → привязывается MAX-аккаунт" />
          <FlowStep num={3} text="Владелец назначает админа (/set_admin)" />
          <FlowStep num={4} text="Владелец закрепляет клиентов за админом (/assign_admin)" />
          <FlowStep num={5} text="Владелец создаёт платежи (/add_payment) с датой" />
          <FlowStep num={6} text="🔔 Бот автоматически:" />
          <div className="ml-8 bg-gray-700/50 rounded-lg p-3 text-sm space-y-1">
            <p>• За день до оплаты → пишет клиенту</p>
            <p>• В день оплаты → пишет клиенту (если не оплатил)</p>
            <p>• Утром → пишет админу: кто должен оплатить</p>
            <p>• Вечером → пишет админу: кто оплатил / не оплатил</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function FlowStep({ num, text }: { num: number; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="bg-emerald-500/20 text-emerald-400 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">{num}</span>
      <p className="text-gray-300 text-sm">{text}</p>
    </div>
  );
}

// ==================== COMMANDS ====================
function CommandsTab() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">📋 Команды по ролям</h2>
        <p className="text-gray-400">Каждая роль имеет свой набор команд</p>
      </div>

      {/* Owner commands */}
      <div className="bg-yellow-500/5 rounded-xl border border-yellow-500/30 overflow-hidden">
        <div className="px-5 py-3 bg-yellow-500/10 border-b border-yellow-500/30 flex items-center gap-2">
          <span className="text-xl">👑</span>
          <h3 className="font-semibold text-yellow-400">Владелец (Owner)</h3>
        </div>
        <div className="p-4 grid gap-2">
          <CmdRow cmd="/set_admin" desc="Назначить админа" />
          <CmdRow cmd="/remove_admin" desc="Убрать админа" />
          <CmdRow cmd="/admins" desc="Список админов" />
          <CmdRow cmd="/assign_admin" desc="Закрепить админа за клиентом" />
          <CmdRow cmd="/settings" desc="Настройки (время отчётов)" />
          <CmdRow cmd="/add_renter" desc="Добавить арендатора" />
          <CmdRow cmd="/remove_renter" desc="Удалить арендатора" />
          <CmdRow cmd="/add_bike" desc="Добавить велосипед" />
          <CmdRow cmd="/remove_bike" desc="Удалить велосипед" />
          <CmdRow cmd="/add_payment" desc="Создать платёж с датой" />
          <CmdRow cmd="/check_reminders" desc="Проверить напоминания вручную" />
          <CmdRow cmd="/renters /bikes /payments /overdue /stats" desc="Просмотр данных" />
        </div>
      </div>

      {/* Admin commands */}
      <div className="bg-blue-500/5 rounded-xl border border-blue-500/30 overflow-hidden">
        <div className="px-5 py-3 bg-blue-500/10 border-b border-blue-500/30 flex items-center gap-2">
          <span className="text-xl">💼</span>
          <h3 className="font-semibold text-blue-400">Админ (Admin)</h3>
        </div>
        <div className="p-4 grid gap-2">
          <CmdRow cmd="/my_clients" desc="Мои закреплённые клиенты" />
          <CmdRow cmd="/clients_status" desc="Статус оплат моих клиентов" />
          <CmdRow cmd="/renters" desc="Список (только своих клиентов)" />
          <CmdRow cmd="/payments" desc="Платежи (только своих клиентов)" />
          <CmdRow cmd="/overdue" desc="Просрочки (только своих клиентов)" />
          <CmdRow cmd="/stats" desc="Статистика (по своим клиентам)" />
          <CmdRow cmd="/reminders" desc="Статус напоминаний" />
        </div>
      </div>

      {/* Client commands */}
      <div className="bg-green-500/5 rounded-xl border border-green-500/30 overflow-hidden">
        <div className="px-5 py-3 bg-green-500/10 border-b border-green-500/30 flex items-center gap-2">
          <span className="text-xl">🚲</span>
          <h3 className="font-semibold text-green-400">Клиент (Client)</h3>
        </div>
        <div className="p-4 grid gap-2">
          <CmdRow cmd="/bind" desc="Привязать MAX-аккаунт" />
          <CmdRow cmd="/my_debt" desc="Моя задолженность" />
          <CmdRow cmd="/receipt" desc="Отправить чек (фото)" />
          <CmdRow cmd="/help" desc="Помощь" />
        </div>
      </div>

      {/* Auto notifications */}
      <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-xl p-5 border border-purple-500/30">
        <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
          <span>🔔</span> Автоматические уведомления
        </h3>
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div className="bg-gray-800/70 rounded-lg p-3">
            <p className="font-semibold text-yellow-400 mb-1">📩 Клиентам:</p>
            <p className="text-gray-300">• За 1 день до оплаты — напоминание</p>
            <p className="text-gray-300">• В день оплаты — срочное (если не оплатил)</p>
          </div>
          <div className="bg-gray-800/70 rounded-lg p-3">
            <p className="font-semibold text-blue-400 mb-1">📬 Админам:</p>
            <p className="text-gray-300">• 🌅 Утро (09:00) — кто должен оплатить</p>
            <p className="text-gray-300">• 🌙 Вечер (21:00) — кто оплатил / не оплатил</p>
          </div>
        </div>
        <div className="mt-3 text-xs text-gray-400">
          ⚙️ Время отчётов настраивается владельцем через /settings
        </div>
      </div>
    </div>
  );
}

function CmdRow({ cmd, desc }: { cmd: string; desc: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <code className="text-emerald-400 font-mono text-sm min-w-[180px]">{cmd}</code>
      <span className="text-gray-400 text-sm">{desc}</span>
    </div>
  );
}

// ==================== CODE TAB ====================
function CodeTab() {
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);

  useState(() => {
    fetch('/bot.js').then(r => r.text()).then(setCode).catch(() => setCode('// Загрузка...'));
  });

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold mb-1">💻 Код бота</h2>
          <p className="text-gray-400 text-sm">Node.js • MAX Bot API • Без внешних зависимостей</p>
        </div>
        <button onClick={handleCopy} className="bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded-lg text-sm transition-colors">
          {copied ? '✅ Скопировано' : '📋 Копировать'}
        </button>
      </div>

      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <div className="px-4 py-2 bg-gray-700/50 border-b border-gray-700 flex items-center justify-between">
          <span className="text-sm text-gray-400 font-mono">bot.js</span>
          <span className="text-xs text-gray-500">~1100 строк • Полный функционал</span>
        </div>
        <pre className="p-4 overflow-x-auto text-xs font-mono text-gray-300 max-h-[600px] overflow-y-auto leading-relaxed">
          <code>{code || 'Загрузка...'}</code>
        </pre>
      </div>
    </div>
  );
}

// ==================== DEMO ====================
function DemoTab() {
  const [role, setRole] = useState<'owner' | 'admin' | 'client'>('owner');
  const [messages, setMessages] = useState<{from: string; text: string; isBot: boolean}[]>([]);
  const [input, setInput] = useState('');
  const chatRef = useRef<HTMLDivElement>(null);

  const roleNames = { owner: '👑 Владелец', admin: '💼 Админ', client: '🚲 Клиент' };

  const startDemo = () => {
    let welcome = '';
    if (role === 'owner') {
      welcome = '👋 Привет! Вы — ВЛАДЕЛЕЦ MaxBot.\n\n📋 Ваши команды:\n/set_admin — Сделать админа\n/remove_admin — Убрать админа\n/admins — Список админов\n/assign_admin — Закрепить админа\n/settings — Настройки\n/add_renter — Добавить арендатора\n/add_bike — Добавить велосипед\n/add_payment — Создать платёж\n/renters — Арендаторы\n/bikes — Велосипеды\n/payments — Платежи\n/overdue — Просрочки\n/stats — Статистика';
    } else if (role === 'admin') {
      welcome = '👋 Привет! Вы — АДМИН MaxBot.\n\n📋 Ваши команды:\n/my_clients — Мои клиенты\n/clients_status — Статус оплат\n/renters — Арендаторы (мои)\n/payments — Платежи (моих клиентов)\n/overdue — Просрочки\n/stats — Статистика\n\n📬 Вы получаете:\n• 🌅 09:00 — утренний отчёт\n• 🌙 21:00 — вечерний отчёт';
    } else {
      welcome = '👋 Привет! Вы — КЛИЕНТ MaxBot.\n\n📋 Ваши команды:\n/my_debt — Моя задолженность\n/receipt — Отправить чек\n/help — Помощь\n\n🔔 Вы будете получать уведомления об оплате.';
    }
    setMessages([{ from: 'MaxBot', text: welcome, isBot: true }]);
  };

  const handleSend = () => {
    if (!input.trim()) return;
    const cmd = input.trim().toLowerCase();
    setMessages(prev => [...prev, { from: roleNames[role], text: input, isBot: false }]);
    setInput('');

    setTimeout(() => {
      let response = getDemoResponse(cmd, role);
      setMessages(prev => [...prev, { from: 'MaxBot', text: response, isBot: true }]);
    }, 400);

    setTimeout(() => {
      chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' });
    }, 500);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold mb-1">🤖 Демо бота</h2>
        <p className="text-gray-400 text-sm">Выберите роль и попробуйте команды</p>
      </div>

      {/* Role selector */}
      <div className="flex gap-2 flex-wrap">
        {(['owner', 'admin', 'client'] as const).map(r => (
          <button
            key={r}
            onClick={() => { setRole(r); setMessages([]); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              role === r
                ? r === 'owner' ? 'bg-yellow-600 text-white' : r === 'admin' ? 'bg-blue-600 text-white' : 'bg-green-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {roleNames[r]}
          </button>
        ))}
        <button onClick={startDemo} className="bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors ml-auto">
          ▶️ Начать демо
        </button>
      </div>

      {/* Chat */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden flex flex-col" style={{ height: '450px' }}>
        <div className="px-4 py-3 bg-gray-700/50 border-b border-gray-700 flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-500/20 rounded-full flex items-center justify-center text-sm">🤖</div>
          <div>
            <p className="font-semibold text-sm">MaxBot</p>
            <p className="text-xs text-emerald-400">● онлайн • Роль: {roleNames[role]}</p>
          </div>
        </div>

        <div ref={chatRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-center text-gray-500 py-8">
              <p className="text-3xl mb-2">💬</p>
              <p>Нажмите "▶️ Начать демо"</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.isBot ? 'justify-start' : 'justify-end'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${
                msg.isBot
                  ? 'bg-gray-700 text-gray-200 rounded-bl-md'
                  : role === 'owner' ? 'bg-yellow-600/80 text-white rounded-br-md' : role === 'admin' ? 'bg-blue-600/80 text-white rounded-br-md' : 'bg-green-600/80 text-white rounded-br-md'
              }`}>
                {msg.text}
              </div>
            </div>
          ))}
        </div>

        <div className="p-3 border-t border-gray-700 flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="Введите команду..."
            className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button onClick={handleSend} className="bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors">➤</button>
        </div>
      </div>

      {/* Quick commands */}
      <div className="flex flex-wrap gap-2">
        {getQuickCommands(role).map(cmd => (
          <button
            key={cmd}
            onClick={() => setInput(cmd)}
            className="bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded-lg text-sm text-gray-300 transition-colors"
          >
            {cmd}
          </button>
        ))}
      </div>
    </div>
  );
}

function getQuickCommands(role: string): string[] {
  if (role === 'owner') return ['/start', '/admins', '/set_admin', '/assign_admin', '/settings', '/add_renter', '/add_payment', '/renters', '/payments', '/overdue', '/stats', '/reminders'];
  if (role === 'admin') return ['/my_clients', '/clients_status', '/renters', '/payments', '/overdue', '/stats'];
  return ['/my_debt', '/receipt', '/help'];
}

function getDemoResponse(cmd: string, role: string): string {
  // Общие ответы
  const responses: Record<string, string> = {
    '/start': '',
    '/help': '',
    '/admins': '💼 Админы:\n\n1. Иван Петров\n   📱 +7 (999) 111-22-33\n   👥 Клиентов: 3\n   📋 Алексей, Дмитрий, Сергей\n\n2. Мария Сидорова\n   📱 +7 (999) 444-55-66\n   👥 Клиентов: 2\n   📋 Ольга, Николай',
    '/renters': '👥 Арендаторы:\n\n1. Алексей К.\n   📱 +7 (999) 123-45-67\n   🚲 Xiaomi Himo C20\n   💼 Админ: Иван Петров\n\n2. Дмитрий В.\n   📱 +7 (999) 234-56-78\n   🚲 Ninebot KickScooter\n   💼 Админ: Иван Петров\n\n3. Ольга М.\n   📱 +7 (999) 345-67-89\n   🚲 Kugoo Kirin G2\n   💼 Админ: Мария Сидорова',
    '/bikes': '🚲 Велосипеды:\n\n1. Xiaomi Himo C20\n   🔢 XHC20-001\n   💰 500 ₽/день\n   🔵 В аренде (Алексей К.)\n\n2. Ninebot KickScooter\n   🔢 NBKS-042\n   💰 600 ₽/день\n   🔵 В аренде (Дмитрий В.)\n\n3. Eltreco XT600\n   🔢 ETXT-008\n   💰 550 ₽/день\n   ✅ Свободен',
    '/payments': '💰 Платежи:\n\n⚠️ ПРОСРОЧЕНО:\n   • Дмитрий В. — 600 ₽ (до 2025-01-15)\n\n⏳ Ожидаются:\n   • Алексей К. — 500 ₽ (до 2025-01-20)\n   • Ольга М. — 450 ₽ (до 2025-01-22)\n\n✅ Оплачено: 15 (45 000 ₽)',
    '/overdue': '⚠️ ПРОСРОЧЕНО:\n\n• Дмитрий В. — 600 ₽\n  ⚠️ 5 дн. просрочки\n\n💰 Итого: 600 ₽',
    '/stats': '📊 Статистика:\n\n👥 Арендаторов: 5\n💼 Админов: 2\n🚲 Велосипедов: 4\n   ✅ Свободных: 1\n   🔵 В аренде: 3\n\n💰 Получено: 45 000 ₽\n⏳ Ожидается: 1 550 ₽\n⚠️ Просрочено: 1',
    '/reminders': '🔔 Статус напоминаний:\n\n• Алексей К. — 500 ₽ (до 2025-01-20)\n  ✅ MAX привязан\n  📩 За день: ⏳\n  📩 В день: ⏳\n\n• Дмитрий В. — 600 ₽ (до 2025-01-15)\n  ✅ MAX привязан\n  📩 За день: ✅\n  📩 В день: ✅',
    '/my_clients': '👥 Мои клиенты (3):\n\n1. Алексей К.\n   📱 +7 (999) 123-45-67\n   🚲 Xiaomi Himo C20\n   💰 Задолженность: 500 ₽\n\n2. Дмитрий В.\n   📱 +7 (999) 234-56-78\n   🚲 Ninebot KickScooter\n   💰 Задолженность: 600 ₽\n\n3. Сергей Л.\n   📱 +7 (999) 567-89-01\n   ✅ Оплата в порядке',
    '/clients_status': '📊 Статус моих клиентов:\n\nАлексей К.:\n   ⏳ Ожидает: 1 плат.\n\nДмитрий В.:\n   ⏳ Ожидает: 1 плат.\n\nСергей Л.:\n   ✅ Всё оплачено',
    '/set_admin': '👑 Назначение АДМИНА.\n\nВведите номер телефона клиента:\n\nКлиенты с привязанным MAX:\n1. Алексей К. — +7 (999) 123-45-67\n2. Дмитрий В. — +7 (999) 234-56-78\n\nВведите номер:',
    '/assign_admin': '🔗 Выберите админа:\n\n1. Иван Петров (клиентов: 3)\n2. Мария Сидорова (клиентов: 2)\n\nВведите номер:',
    '/settings': '⚙️ Настройки MaxBot:\n\n🌅 Утренний отчёт: 9:00\n🌙 Вечерний отчёт: 21:00\n📅 Напоминание: за 1 дн.\n🔴 В день оплаты: ✅ вкл\n🕐 Часовой пояс: UTC+3\n\n✏️ Изменить утренний час (0-23):',
    '/add_renter': '✏️ Введите имя арендатора:',
    '/add_bike': '✏️ Введите модель:',
    '/add_payment': '💰 Выберите арендатора:\n\n1. Алексей К.\n2. Дмитрий В.\n3. Ольга М.\n\nВведите номер:',
    '/my_debt': '💰 Моя задолженность:\n\n⏳ Ожидается:\n   • 500 ₽ (до 2025-01-20)\n\n💰 Итого: 500 ₽\n\n📸 После оплаты: /receipt',
    '/receipt': '📸 Отправьте фото/скриншот чека.',
  };

  if (cmd === '/start' || cmd === '/help') {
    if (role === 'owner') return '👋 Вы — ВЛАДЕЛЕЦ.\n\n📋 Команды:\n/set_admin, /remove_admin, /admins\n/assign_admin, /settings\n/add_renter, /add_bike, /add_payment\n/renters, /bikes, /payments, /overdue\n/reminders, /check_reminders, /stats';
    if (role === 'admin') return '👋 Вы — АДМИН.\n\n📋 Команды:\n/my_clients, /clients_status\n/renters, /payments, /overdue, /stats\n\n📬 Ежедневные отчёты:\n🌅 09:00 — кто должен оплатить\n🌙 21:00 — кто оплатил';
    return '👋 Вы — КЛИЕНТ.\n\n📋 Команды:\n/my_debt — Моя задолженность\n/receipt — Отправить чек\n\n🔔 Уведомления об оплате включены.';
  }

  return responses[cmd] || '❓ Неизвестная команда. /help';
}
