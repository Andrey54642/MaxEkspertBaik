// ============================================================
// MaxBot — Бот для мессенджера MAX (VK)
// Управление арендой электровелосипедов курьерами
// ============================================================
// 
// СИСТЕМА РОЛЕЙ:
// - OWNER (главный) — +79081749088 — полный доступ
// - ADMIN (админ) — назначается владельцем, управляет клиентами
// - CLIENT (клиент) — получает только уведомления об оплате
//
// УСТАНОВКА:
// 1. Сохраните файл как bot.js
// 2. Замените YOUR_BOT_TOKEN на токен вашего бота
// 3. node bot.js
//
// КОМАНДЫ ВЛАДЕЛЬЦА (OWNER):
// /start, /help — Помощь
// /set_admin — Сделать пользователя админом
// /remove_admin — Убрать админа
// /admins — Список админов
// /assign_admin — Закрепить админа за клиентом
// /settings — Настройки бота (время рассылок)
// /renters, /add_renter, /remove_renter
// /bikes, /add_bike, /remove_bike
// /add_payment, /payments, /overdue
// /receipt, /stats, /reminders, /check_reminders
//
// КОМАНДЫ АДМИНА:
// /my_clients — Список закреплённых клиентов
// /clients_status — Статус оплат моих клиентов
// /renters, /bikes, /payments, /overdue (только своих клиентов)
//
// КОМАНДЫ КЛИЕНТА:
// /bind — Привязать MAX-аккаунт
// /receipt — Отправить чек
// /my_debt — Моя задолженность
//
// АВТОНАПОМИНАНИЯ:
// - За 1 день до оплаты → клиенту
// - В день оплаты (если не оплачено) → клиенту
// - Утром (09:00) → админу: кто должен оплатить сегодня
// - Вечером (21:00) → админу: кто оплатил сегодня
// ============================================================

const https = require('https');
const fs = require('fs');
const path = require('path');

// ==================== КОНФИГУРАЦИЯ ====================
const BOT_TOKEN = process.env.MAX_BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';
const API_URL = 'https://platform-api2.max.ru';
const DATA_FILE = path.join(__dirname, 'bot_data.json');
const RECEIPTS_DIR = path.join(__dirname, 'receipts');

// ГЛАВНЫЙ АДМИН (владелец)
const OWNER_PHONE = '+79081749088';

// Настройки по умолчанию
const DEFAULT_SETTINGS = {
  morningReportHour: 9,   // Утренний отчёт админам (час)
  eveningReportHour: 21,  // Вечерний отчёт админам (час)
  reminder1DaysBefore: 1, // За сколько дней напоминать (1 = за день)
  reminder2OnDay: true,   // Напоминать в день оплаты
  timezone: 3,            // Часовой пояс (MSK = 3)
};

// Создаём папку для чеков
if (!fs.existsSync(RECEIPTS_DIR)) {
  fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
}

// ==================== ХРАНИЛИЩЕ ДАННЫХ ====================
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const loaded = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      // Миграция: добавляем новые поля если их нет
      if (!loaded.admins) loaded.admins = [];
      if (!loaded.settings) loaded.settings = { ...DEFAULT_SETTINGS };
      if (!loaded.reminderLog) loaded.reminderLog = [];
      if (!loaded.userStates) loaded.userStates = {};
      // Миграция: добавляем role к renter'ам
      loaded.renters = loaded.renters.map(r => ({
        ...r,
        role: r.role || 'client',
        assignedAdminId: r.assignedAdminId || null,
      }));
      return loaded;
    }
  } catch (e) {
    console.error('Ошибка загрузки данных:', e.message);
  }
  return {
    renters: [],
    bikes: [],
    payments: [],
    receipts: [],
    admins: [], // { userId, name, phone, addedAt, assignedRenters: [] }
    settings: { ...DEFAULT_SETTINGS },
    userStates: {},
    reminderLog: [],
    ownerMaxUserId: null, // MAX user_id владельца (определяется при /bind владельца)
  };
}

function saveData(d) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2), 'utf8');
}

let data = loadData();

// ==================== СИСТЕМА РОЛЕЙ ====================
function getUserRole(userId) {
  // Владелец определяется по MAX user_id
  if (data.ownerMaxUserId && userId === data.ownerMaxUserId) {
    return 'owner';
  }
  // Админ
  const admin = data.admins.find(a => a.userId === userId);
  if (admin) return 'admin';
  // Клиент (арендатор с привязанным MAX аккаунтом)
  const renter = data.renters.find(r => r.maxUserId === userId);
  if (renter) return 'client';
  return 'unknown';
}

function isOwner(userId) {
  return getUserRole(userId) === 'owner';
}

function isAdmin(userId) {
  const role = getUserRole(userId);
  return role === 'owner' || role === 'admin';
}

function isClient(userId) {
  return getUserRole(userId) === 'client';
}

// Команды доступные только владельцу
const OWNER_COMMANDS = [
  '/set_admin', '/remove_admin', '/admins', '/assign_admin',
  '/settings', '/add_renter', '/remove_renter', '/add_bike', '/remove_bike',
  '/add_payment', '/check_reminders'
];

// Команды доступные админам (и владельцу)
const ADMIN_COMMANDS = [
  '/my_clients', '/clients_status', '/renters', '/bikes', 
  '/payments', '/overdue', '/reminders', '/stats', '/receipt'
];

// Команды доступные клиентам
const CLIENT_COMMANDS = ['/bind', '/receipt', '/my_debt', '/start', '/help'];

function canExecute(userId, command) {
  const role = getUserRole(userId);
  if (role === 'owner') return true; // Владелец может всё
  if (role === 'admin') {
    return ADMIN_COMMANDS.includes(command) || CLIENT_COMMANDS.includes(command);
  }
  if (role === 'client') {
    return CLIENT_COMMANDS.includes(command);
  }
  // Неизвестный пользователь — может только /start, /help, /bind
  return ['/start', '/help', '/bind'].includes(command);
}

// ==================== MAX API ====================
function apiRequest(method, endpoint, body = null, params = {}) {
  return new Promise((resolve, reject) => {
    let url = `${API_URL}${endpoint}`;
    const queryParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        queryParams.append(key, value);
      }
    }
    const qs = queryParams.toString();
    if (qs) url += `?${qs}`;

    const options = {
      method: method,
      headers: {
        'Authorization': BOT_TOKEN,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(url, options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => { responseData += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(responseData));
        } catch (e) {
          resolve(responseData);
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function sendMessage(userId, text, keyboard = null) {
  const body = { text };
  if (keyboard) {
    body.attachments = [{ type: 'inline_keyboard', payload: { buttons: keyboard } }];
  }
  return apiRequest('POST', '/messages', body, { user_id: userId });
}

async function sendChatMessage(chatId, text, keyboard = null) {
  const body = { text };
  if (keyboard) {
    body.attachments = [{ type: 'inline_keyboard', payload: { buttons: keyboard } }];
  }
  return apiRequest('POST', '/messages', body, { chat_id: chatId });
}

// ==================== LONG POLLING ====================
let lastMarker = null;

async function getUpdates() {
  const params = { timeout: 30 };
  if (lastMarker) params.marker = lastMarker;

  try {
    const result = await apiRequest('GET', '/updates', null, params);
    if (result.updates && result.updates.length > 0) {
      for (const update of result.updates) {
        await handleUpdate(update);
      }
      lastMarker = result.marker;
    }
  } catch (e) {
    console.error('Ошибка получения обновлений:', e.message);
    await sleep(5000);
  }
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// ==================== ОБРАБОТКА СОБЫТИЙ ====================
async function handleUpdate(update) {
  switch (update.update_type) {
    case 'message_created':
      await handleMessage(update.message, update);
      break;
    case 'bot_started':
      await handleBotStarted(update);
      break;
    case 'message_callback':
      await handleCallback(update);
      break;
  }
}

async function handleBotStarted(update) {
  const userId = update.user.user_id;
  const firstName = update.user.first_name;
  const role = getUserRole(userId);

  let welcomeMsg = `👋 Привет, ${firstName}!\n\n🤖 Я — MaxBot, бот для управления арендой электровелосипедов.\n\n`;

  if (role === 'owner') {
    welcomeMsg += `👑 Вы — *ВЛАДЕЛЕЦ* бота.\n\n📋 Команды:\n/set_admin — Сделать админа\n/remove_admin — Убрать админа\n/admins — Список админов\n/assign_admin — Закрепить админа за клиентом\n/settings — Настройки\n/add_renter — Добавить арендатора\n/add_bike — Добавить велосипед\n/add_payment — Создать платёж\n/renters — Арендаторы\n/bikes — Велосипеды\n/payments — Платежи\n/overdue — Просрочки\n/reminders — Напоминания\n/stats — Статистика\n/help — Помощь`;
  } else if (role === 'admin') {
    welcomeMsg += `💼 Вы — *АДМИН*.\n\n📋 Команды:\n/my_clients — Мои клиенты\n/clients_status — Статус оплат\n/renters — Арендаторы\n/payments — Платежи\n/overdue — Просрочки\n/stats — Статистика\n/help — Помощь`;
  } else if (role === 'client') {
    welcomeMsg += `🚲 Вы — *КЛИЕНТ*.\n\n📋 Команды:\n/my_debt — Моя задолженность\n/receipt — Отправить чек\n/help — Помощь\n\n🔔 Вы будете получать уведомления об оплате.`;
  } else {
    welcomeMsg += `Чтобы пользоваться ботом, попросите владельца привязать ваш аккаунт.\n\nДоступные команды:\n/bind — Привязать аккаунт\n/help — Помощь`;
  }

  await sendMessage(userId, welcomeMsg);
}

async function handleMessage(message, update) {
  if (!message || !message.sender || message.sender.is_bot) return;

  const userId = message.sender.user_id;
  const chatId = message.recipient?.chat_id;
  const text = message.body?.text || '';
  const isGroup = message.recipient?.chat_type !== 'dialog';
  const targetId = isGroup ? chatId : userId;

  // Проверяем состояние пользователя
  const userState = data.userStates[userId];
  if (userState) {
    await handleUserState(userId, targetId, isGroup, text, message);
    return;
  }

  const command = text.toLowerCase().trim().split(' ')[0];

  // Проверка доступа
  if (!canExecute(userId, command)) {
    const role = getUserRole(userId);
    let denyMsg = '🚫 У вас нет доступа к этой команде.\n\n';
    if (role === 'client') {
      denyMsg += 'Вы — клиент. Доступные команды:\n/my_debt — Моя задолженность\n/receipt — Отправить чек\n/help — Помощь';
    } else if (role === 'unknown') {
      denyMsg += 'Ваш аккаунт не привязан. Обратитесь к владельцу или отправьте /bind';
    }
    await send(targetId, isGroup, denyMsg);
    return;
  }

  // Обработка команд
  switch (command) {
    case '/start':
      await handleBotStarted({ user: message.sender });
      break;
    case '/help':
      await handleBotStarted({ user: message.sender });
      break;

    // ===== ВЛАДЕЛЕЦ =====
    case '/set_admin':
      if (!isOwner(userId)) return;
      await startSetAdmin(userId, targetId, isGroup);
      break;
    case '/remove_admin':
      if (!isOwner(userId)) return;
      await startRemoveAdmin(userId, targetId, isGroup);
      break;
    case '/admins':
      if (!isOwner(userId)) return;
      await showAdmins(targetId, isGroup);
      break;
    case '/assign_admin':
      if (!isOwner(userId)) return;
      await startAssignAdmin(userId, targetId, isGroup);
      break;
    case '/settings':
      if (!isOwner(userId)) return;
      await showSettings(targetId, isGroup);
      break;

    // ===== ОБЩИЕ АДМИНСКИЕ =====
    case '/renters':
      await showRenters(userId, targetId, isGroup);
      break;
    case '/add_renter':
      if (!isOwner(userId)) { await send(targetId, isGroup, '🚫 Только владелец может добавлять арендаторов.'); return; }
      await startAddRenter(userId, targetId, isGroup);
      break;
    case '/remove_renter':
      if (!isOwner(userId)) { await send(targetId, isGroup, '🚫 Только владелец может удалять арендаторов.'); return; }
      await startRemoveRenter(userId, targetId, isGroup);
      break;
    case '/bikes':
      await showBikes(targetId, isGroup);
      break;
    case '/add_bike':
      if (!isOwner(userId)) { await send(targetId, isGroup, '🚫 Только владелец может добавлять велосипеды.'); return; }
      await startAddBike(userId, targetId, isGroup);
      break;
    case '/remove_bike':
      if (!isOwner(userId)) { await send(targetId, isGroup, '🚫 Только владелец может удалять велосипеды.'); return; }
      await startRemoveBike(userId, targetId, isGroup);
      break;
    case '/add_payment':
      if (!isOwner(userId)) { await send(targetId, isGroup, '🚫 Только владелец может создавать платежи.'); return; }
      await startAddPayment(userId, targetId, isGroup);
      break;
    case '/payments':
      await showPayments(userId, targetId, isGroup);
      break;
    case '/overdue':
      await showOverdue(userId, targetId, isGroup);
      break;
    case '/stats':
      await showStats(userId, targetId, isGroup);
      break;
    case '/reminders':
      await showReminders(targetId, isGroup);
      break;
    case '/check_reminders':
      if (!isOwner(userId)) return;
      await runReminderCheck(targetId, isGroup, true);
      break;

    // ===== АДМИН: свои клиенты =====
    case '/my_clients':
      if (!isAdmin(userId)) return;
      await showMyClients(userId, targetId, isGroup);
      break;
    case '/clients_status':
      if (!isAdmin(userId)) return;
      await showClientsStatus(userId, targetId, isGroup);
      break;

    // ===== КЛИЕНТ =====
    case '/bind':
      await bindUser(userId, targetId, isGroup, message.sender);
      break;
    case '/receipt':
      await startReceipt(userId, targetId, isGroup);
      break;
    case '/my_debt':
      await showMyDebt(userId, targetId, isGroup);
      break;

    default:
      // Фото чека
      if (message.body?.attachments) {
        const imageAttachment = message.body.attachments.find(a => a.type === 'image');
        if (imageAttachment && data.userStates[userId]?.action === 'awaiting_receipt') {
          await handleReceiptImage(userId, targetId, isGroup, imageAttachment);
          return;
        }
      }
      if (!isGroup) {
        await sendMessage(userId, '❓ Неизвестная команда. Отправьте /help');
      }
      break;
  }
}

async function send(targetId, isGroup, text, keyboard = null) {
  if (isGroup) return sendChatMessage(targetId, text, keyboard);
  return sendMessage(targetId, text, keyboard);
}

// ==================== СОСТОЯНИЯ ПОЛЬЗОВАТЕЛЕЙ ====================
async function handleUserState(userId, targetId, isGroup, text, message) {
  const state = data.userStates[userId];
  if (!state) return;

  switch (state.action) {
    // --- Владелец: добавление арендатора ---
    case 'add_renter_name':
      state.name = text;
      state.action = 'add_renter_phone';
      data.userStates[userId] = state; saveData(data);
      await send(targetId, isGroup, '📱 Введите номер телефона:');
      break;
    case 'add_renter_phone':
      state.phone = text;
      state.action = 'add_renter_bike';
      data.userStates[userId] = state; saveData(data);
      const availableBikes = data.bikes.filter(b => b.status === 'available');
      if (availableBikes.length === 0) {
        state.bikeId = null;
        await finishAddRenter(userId, targetId, isGroup, state);
      } else {
        const buttons = availableBikes.map(b => ([{ type: 'callback', text: `${b.model} (${b.serialNumber})`, payload: `bike_${b.id}` }]));
        buttons.push([{ type: 'callback', text: 'Без велосипеда', payload: 'bike_none' }]);
        await send(targetId, isGroup, '🚲 Выберите велосипед:', buttons);
      }
      break;

    // --- Владелец: добавление велосипеда ---
    case 'add_bike_model':
      state.model = text; state.action = 'add_bike_serial';
      data.userStates[userId] = state; saveData(data);
      await send(targetId, isGroup, '🔢 Введите серийный номер:');
      break;
    case 'add_bike_serial':
      state.serialNumber = text; state.action = 'add_bike_rate';
      data.userStates[userId] = state; saveData(data);
      await send(targetId, isGroup, '💰 Введите дневную ставку (₽/день):');
      break;
    case 'add_bike_rate':
      state.dailyRate = parseInt(text) || 500;
      await finishAddBike(userId, targetId, isGroup, state);
      break;

    // --- Владелец: удаление арендатора ---
    case 'remove_renter_select': {
      const idx = parseInt(text) - 1;
      if (idx >= 0 && idx < data.renters.length) {
        const removed = data.renters[idx];
        if (removed.bikeId) {
          const bike = data.bikes.find(b => b.id === removed.bikeId);
          if (bike) { bike.status = 'available'; bike.renterId = null; }
        }
        data.renters.splice(idx, 1);
        delete data.userStates[userId]; saveData(data);
        await send(targetId, isGroup, `✅ Арендатор "${removed.name}" удалён.`);
      } else {
        await send(targetId, isGroup, '❌ Неверный номер.');
        delete data.userStates[userId]; saveData(data);
      }
      break;
    }

    // --- Владелец: удаление велосипеда ---
    case 'remove_bike_select': {
      const idx = parseInt(text) - 1;
      if (idx >= 0 && idx < data.bikes.length) {
        const removed = data.bikes[idx];
        const renter = data.renters.find(r => r.bikeId === removed.id);
        if (renter) renter.bikeId = null;
        data.bikes.splice(idx, 1);
        delete data.userStates[userId]; saveData(data);
        await send(targetId, isGroup, `✅ Велосипед "${removed.model}" удалён.`);
      } else {
        await send(targetId, isGroup, '❌ Неверный номер.');
        delete data.userStates[userId]; saveData(data);
      }
      break;
    }

    // --- Владелец: создание платежа ---
    case 'add_payment_renter': {
      const idx = parseInt(text) - 1;
      if (idx >= 0 && idx < data.renters.length) {
        state.renterId = data.renters[idx].id;
        state.action = 'add_payment_amount';
        data.userStates[userId] = state; saveData(data);
        await send(targetId, isGroup, '💰 Введите сумму (₽):');
      } else {
        await send(targetId, isGroup, '❌ Неверный номер.');
        delete data.userStates[userId]; saveData(data);
      }
      break;
    }
    case 'add_payment_amount': {
      const amount = parseInt(text);
      if (!amount || amount <= 0) { await send(targetId, isGroup, '❌ Введите число > 0:'); return; }
      state.amount = amount; state.action = 'add_payment_dueDate';
      data.userStates[userId] = state; saveData(data);
      await send(targetId, isGroup, '📅 Введите дату оплаты (ГГГГ-ММ-ДД):');
      break;
    }
    case 'add_payment_dueDate': {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) { await send(targetId, isGroup, '❌ Формат: 2025-02-15'); return; }
      state.dueDate = text;
      const newPayment = {
        id: generateId(), renterId: state.renterId,
        bikeId: data.renters.find(r => r.id === state.renterId)?.bikeId || '',
        amount: state.amount, date: new Date().toISOString().split('T')[0],
        dueDate: state.dueDate, status: 'pending',
        reminder1Sent: null, reminder2Sent: null, notes: '',
      };
      data.payments.push(newPayment);
      delete data.userStates[userId]; saveData(data);
      const pRenter = data.renters.find(r => r.id === state.renterId);
      await send(targetId, isGroup,
        `✅ Платёж создан!\n👤 ${pRenter?.name}\n💰 ${newPayment.amount} ₽\n📅 Срок: ${newPayment.dueDate}\n\n🔔 Напоминания:\n• За 1 день → клиенту\n• В день оплаты → клиенту` +
        (pRenter?.maxUserId ? '' : `\n\n⚠️ У клиента не привязан MAX! Попросите написать /bind`)
      );
      break;
    }

    // --- Владелец: назначение админа ---
    case 'set_admin_phone': {
      const phone = text.trim();
      const renter = data.renters.find(r => r.phone === phone || r.phone.replace(/\D/g, '') === phone.replace(/\D/g, ''));
      if (!renter) {
        await send(targetId, isGroup, '❌ Арендатор с таким телефоном не найден. Сначала добавьте через /add_renter');
        delete data.userStates[userId]; saveData(data);
        return;
      }
      if (!renter.maxUserId) {
        await send(targetId, isGroup, '❌ У этого арендатора не привязан MAX аккаунт. Попросите его написать /bind');
        delete data.userStates[userId]; saveData(data);
        return;
      }
      // Проверяем, не админ ли уже
      if (data.admins.find(a => a.userId === renter.maxUserId)) {
        await send(targetId, isGroup, '❌ Этот пользователь уже админ.');
        delete data.userStates[userId]; saveData(data);
        return;
      }
      // Делаем админом
      data.admins.push({
        userId: renter.maxUserId,
        name: renter.name,
        phone: renter.phone,
        addedAt: new Date().toISOString(),
        assignedRenters: [], // ID арендаторов, закреплённых за этим админом
      });
      renter.role = 'admin';
      delete data.userStates[userId]; saveData(data);

      await send(targetId, isGroup, `✅ *${renter.name}* теперь АДМИН!\n\n📱 ${renter.phone}\nТеперь ему можно закрепить клиентов через /assign_admin`);
      
      // Уведомляем нового админа
      await sendMessage(renter.maxUserId, `🎉 Вы назначены АДМИНОМ в MaxBot!\n\nТеперь вы можете:\n• Видеть статус своих клиентов\n• Получать утренние и вечерние отчёты\n\nКоманды: /my_clients, /clients_status, /help`);
      break;
    }

    // --- Владелец: удаление админа ---
    case 'remove_admin_select': {
      const idx = parseInt(text) - 1;
      if (idx >= 0 && idx < data.admins.length) {
        const removed = data.admins[idx];
        // Убираем роль admin у арендатора
        const renter = data.renters.find(r => r.maxUserId === removed.userId);
        if (renter) renter.role = 'client';
        // Убираем закрепления
        data.renters.forEach(r => {
          if (r.assignedAdminId === removed.userId) r.assignedAdminId = null;
        });
        data.admins.splice(idx, 1);
        delete data.userStates[userId]; saveData(data);
        await send(targetId, isGroup, `✅ Админ "${removed.name}" удалён.`);
        await sendMessage(removed.userId, '⚠️ Ваши права админа в MaxBot отозваны.');
      } else {
        await send(targetId, isGroup, '❌ Неверный номер.');
        delete data.userStates[userId]; saveData(data);
      }
      break;
    }

    // --- Владелец: закрепление админа за клиентом ---
    case 'assign_admin_select': {
      const idx = parseInt(text) - 1;
      if (idx >= 0 && idx < data.admins.length) {
        state.selectedAdminId = data.admins[idx].userId;
        state.selectedAdminName = data.admins[idx].name;
        state.action = 'assign_admin_renter';
        data.userStates[userId] = state; saveData(data);
        
        const clients = data.renters.filter(r => r.role === 'client');
        if (clients.length === 0) {
          await send(targetId, isGroup, '❌ Нет клиентов для закрепления.');
          delete data.userStates[userId]; saveData(data);
          return;
        }
        let msg = `👤 Выберите клиента для админа *${state.selectedAdminName}*:\n\n`;
        clients.forEach((r, i) => {
          const assigned = r.assignedAdminId ? '✅' : '  ';
          msg += `${assigned} ${i + 1}. ${r.name} (${r.phone})\n`;
        });
        await send(targetId, isGroup, msg);
      } else {
        await send(targetId, isGroup, '❌ Неверный номер.');
        delete data.userStates[userId]; saveData(data);
      }
      break;
    }
    case 'assign_admin_renter': {
      const idx = parseInt(text) - 1;
      const clients = data.renters.filter(r => r.role === 'client');
      if (idx >= 0 && idx < clients.length) {
        const client = clients[idx];
        client.assignedAdminId = state.selectedAdminId;
        // Добавляем в список админа
        const admin = data.admins.find(a => a.userId === state.selectedAdminId);
        if (admin && !admin.assignedRenters.includes(client.id)) {
          admin.assignedRenters.push(client.id);
        }
        delete data.userStates[userId]; saveData(data);
        await send(targetId, isGroup, `✅ Клиент *${client.name}* закреплён за админом *${state.selectedAdminName}*!\n\nТеперь админ будет получать:\n• 🌅 Утром (09:00) — кто должен оплатить\n• 🌙 Вечером (21:00) — кто оплатил`);
        
        // Уведомляем админа
        await sendMessage(state.selectedAdminId, `📋 Вам закреплён новый клиент: *${client.name}*\n\nВы будете получать ежедневные отчёты:\n• 🌅 09:00 — кто должен оплатить\n• 🌙 21:00 — кто оплатил`);
      } else {
        await send(targetId, isGroup, '❌ Неверный номер.');
        delete data.userStates[userId]; saveData(data);
      }
      break;
    }

    // --- Владелец: настройки ---
    case 'settings_morning': {
      const hour = parseInt(text);
      if (isNaN(hour) || hour < 0 || hour > 23) {
        await send(targetId, isGroup, '❌ Введите час от 0 до 23:');
        return;
      }
      data.settings.morningReportHour = hour;
      state.action = 'settings_evening';
      data.userStates[userId] = state; saveData(data);
      await send(targetId, isGroup, `✅ Утренний отчёт: ${hour}:00\n\n🌙 Теперь введите час вечернего отчёта (0-23):`);
      break;
    }
    case 'settings_evening': {
      const hour = parseInt(text);
      if (isNaN(hour) || hour < 0 || hour > 23) {
        await send(targetId, isGroup, '❌ Введите час от 0 до 23:');
        return;
      }
      data.settings.eveningReportHour = hour;
      state.action = 'settings_reminder_days';
      data.userStates[userId] = state; saveData(data);
      await send(targetId, isGroup, `✅ Вечерний отчёт: ${hour}:00\n\n📅 За сколько дней напоминать клиенту? (1-7):`);
      break;
    }
    case 'settings_reminder_days': {
      const days = parseInt(text);
      if (isNaN(days) || days < 1 || days > 7) {
        await send(targetId, isGroup, '❌ Введите число от 1 до 7:');
        return;
      }
      data.settings.reminder1DaysBefore = days;
      delete data.userStates[userId]; saveData(data);
      await send(targetId, isGroup, 
        `✅ Настройки сохранены!\n\n` +
        `🌅 Утренний отчёт админам: ${data.settings.morningReportHour}:00\n` +
        `🌙 Вечерний отчёт админам: ${data.settings.eveningReportHour}:00\n` +
        `📅 Напоминание клиенту: за ${days} дн. до оплаты\n` +
        `🔴 В день оплаты: ${data.settings.reminder2OnDay ? '✅ вкл' : '❌ выкл'}`
      );
      break;
    }

    // --- Клиент: привязка ---
    case 'bind_select': {
      const idx = parseInt(text) - 1;
      if (idx >= 0 && idx < state.unboundIds.length) {
        const renter = data.renters.find(r => r.id === state.unboundIds[idx]);
        if (renter) {
          renter.maxUserId = userId;
          renter.role = 'client';
          delete data.userStates[userId]; saveData(data);
          await send(targetId, isGroup, `✅ Привязано к *${renter.name}*!\n\nТеперь вы будете получать уведомления об оплате.`);
        }
      } else {
        await send(targetId, isGroup, '❌ Неверный номер.');
        delete data.userStates[userId]; saveData(data);
      }
      break;
    }

    // --- Клиент: чек ---
    case 'awaiting_receipt':
      if (message.body?.attachments) {
        const img = message.body.attachments.find(a => a.type === 'image');
        if (img) await handleReceiptImage(userId, targetId, isGroup, img);
      } else {
        await send(targetId, isGroup, '📸 Отправьте фото/скриншот чека.');
      }
      break;
  }
}

// ==================== КОМАНДЫ ВЛАДЕЛЬЦА ====================
async function startSetAdmin(userId, targetId, isGroup) {
  const clients = data.renters.filter(r => !data.admins.find(a => a.userId === r.maxUserId) && r.maxUserId);
  if (clients.length === 0) {
    await send(targetId, isGroup, '❌ Нет клиентов с привязанным MAX аккаунтом.\n\nПопросите клиента написать /bind, затем повторите.');
    return;
  }
  data.userStates[userId] = { action: 'set_admin_phone' };
  saveData(data);
  
  let msg = '👑 Назначение АДМИНА.\n\nВведите номер телефона клиента:\n\n';
  msg += 'Клиенты с привязанным MAX:\n';
  clients.forEach((r, i) => {
    msg += `${i + 1}. ${r.name} — ${r.phone}\n`;
  });
  msg += '\nВведите номер телефона (или номер из списка):';
  await send(targetId, isGroup, msg);
}

async function startRemoveAdmin(userId, targetId, isGroup) {
  if (data.admins.length === 0) {
    await send(targetId, isGroup, '📋 Нет админов.');
    return;
  }
  let msg = '🗑️ Выберите админа для удаления:\n\n';
  data.admins.forEach((a, i) => {
    msg += `${i + 1}. ${a.name} (${a.phone})\n`;
  });
  data.userStates[userId] = { action: 'remove_admin_select' };
  saveData(data);
  await send(targetId, isGroup, msg);
}

async function showAdmins(targetId, isGroup) {
  if (data.admins.length === 0) {
    await send(targetId, isGroup, '📋 Нет админов. Используйте /set_admin');
    return;
  }
  let msg = '💼 *Админы:*\n\n';
  data.admins.forEach((a, i) => {
    const assignedClients = data.renters.filter(r => r.assignedAdminId === a.userId);
    msg += `${i + 1}. *${a.name}*\n`;
    msg += `   📱 ${a.phone}\n`;
    msg += `   👥 Клиентов: ${assignedClients.length}\n`;
    if (assignedClients.length > 0) {
      msg += `   📋 ${assignedClients.map(c => c.name).join(', ')}\n`;
    }
    msg += '\n';
  });
  await send(targetId, isGroup, msg);
}

async function startAssignAdmin(userId, targetId, isGroup) {
  if (data.admins.length === 0) {
    await send(targetId, isGroup, '❌ Нет админов. Сначала /set_admin');
    return;
  }
  let msg = '🔗 Выберите админа:\n\n';
  data.admins.forEach((a, i) => {
    const count = data.renters.filter(r => r.assignedAdminId === a.userId).length;
    msg += `${i + 1}. ${a.name} (клиентов: ${count})\n`;
  });
  data.userStates[userId] = { action: 'assign_admin_select' };
  saveData(data);
  await send(targetId, isGroup, msg);
}

async function showSettings(targetId, isGroup) {
  const s = data.settings;
  let msg = `⚙️ *Настройки MaxBot:*\n\n`;
  msg += `🌅 Утренний отчёт админам: *${s.morningReportHour}:00*\n`;
  msg += `🌙 Вечерний отчёт админам: *${s.eveningReportHour}:00*\n`;
  msg += `📅 Напоминание клиенту: за *${s.reminder1DaysBefore} дн.*\n`;
  msg += `🔴 В день оплаты: *${s.reminder2OnDay ? '✅ вкл' : '❌ выкл'}*\n`;
  msg += `🕐 Часовой пояс: UTC+${s.timezone}\n\n`;
  msg += `✏️ Изменить утренний час (0-23):`;

  data.userStates[data.ownerMaxUserId || ''] = { action: 'settings_morning' };
  // Для владельца в ЛС
  const ownerId = data.ownerMaxUserId;
  if (ownerId) {
    data.userStates[ownerId] = { action: 'settings_morning' };
    saveData(data);
  }
  await send(targetId, isGroup, msg);
}

// ==================== КОМАНДЫ АДМИНА ====================
async function showMyClients(userId, targetId, isGroup) {
  const admin = data.admins.find(a => a.userId === userId);
  if (!admin) { await send(targetId, isGroup, '❌ Вы не админ.'); return; }

  const myClients = data.renters.filter(r => r.assignedAdminId === userId);
  if (myClients.length === 0) {
    await send(targetId, isGroup, '📋 У вас нет закреплённых клиентов.\n\nПопросите владельца выполнить /assign_admin');
    return;
  }

  let msg = `👥 *Мои клиенты (${myClients.length}):*\n\n`;
  myClients.forEach((r, i) => {
    const bike = data.bikes.find(b => b.id === r.bikeId);
    const unpaid = data.payments.filter(p => p.renterId === r.id && p.status !== 'paid');
    const totalDebt = unpaid.reduce((s, p) => s + p.amount, 0);
    msg += `${i + 1}. *${r.name}*\n`;
    msg += `   📱 ${r.phone}\n`;
    if (bike) msg += `   🚲 ${bike.model}\n`;
    if (totalDebt > 0) msg += `   💰 Задолженность: ${totalDebt} ₽\n`;
    else msg += `   ✅ Оплата в порядке\n`;
    msg += '\n';
  });
  await send(targetId, isGroup, msg);
}

async function showClientsStatus(userId, targetId, isGroup) {
  const myClients = data.renters.filter(r => r.assignedAdminId === userId);
  if (myClients.length === 0) {
    await send(targetId, isGroup, '📋 У вас нет закреплённых клиентов.');
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  let msg = `📊 *Статус моих клиентов:*\n\n`;

  myClients.forEach(r => {
    const payments = data.payments.filter(p => p.renterId === r.id);
    const pending = payments.filter(p => p.status !== 'paid');
    const paidToday = payments.filter(p => p.status === 'paid' && p.paidDate === today);
    
    msg += `*${r.name}:*\n`;
    if (pending.length > 0) {
      msg += `   ⏳ Ожидает: ${pending.length} плат.\n`;
    }
    if (paidToday.length > 0) {
      msg += `   ✅ Оплатил сегодня: ${paidToday.reduce((s, p) => s + p.amount, 0)} ₽\n`;
    }
    if (pending.length === 0 && paidToday.length === 0) {
      msg += `   ✅ Всё оплачено\n`;
    }
    msg += '\n';
  });

  await send(targetId, isGroup, msg);
}

// ==================== КОМАНДЫ КЛИЕНТА ====================
async function bindUser(userId, targetId, isGroup, sender) {
  if (isGroup) {
    await send(targetId, true, '⚠️ /bind работает только в личных сообщениях.');
    return;
  }

  // Проверяем, не владелец ли это
  const phone = sender.username || '';
  // Если владелец привязывается по номеру
  if (data.renters.length === 0 && !data.ownerMaxUserId) {
    // Первый пользователь — возможно владелец
    await sendMessage(userId, 
      `👑 Вы первый пользователь бота!\n\n` +
      `Введите ваш номер телефона для подтверждения (формат +79081749088):`
    );
    data.userStates[userId] = { action: 'bind_owner_confirm' };
    saveData(data);
    return;
  }

  const unbound = data.renters.filter(r => !r.maxUserId && r.role === 'client');
  if (unbound.length === 0) {
    await sendMessage(userId, '✅ Все клиенты уже привязаны или нет непривязанных.');
    return;
  }
  if (unbound.length === 1) {
    unbound[0].maxUserId = userId;
    unbound[0].role = 'client';
    saveData(data);
    await sendMessage(userId, `✅ Привязано к *${unbound[0].name}*!\n\nТеперь вы будете получать уведомления.`);
    return;
  }

  let msg = '👤 Выберите арендатора:\n\n';
  unbound.forEach((r, i) => { msg += `${i + 1}. ${r.name} (${r.phone})\n`; });
  data.userStates[userId] = { action: 'bind_select', unboundIds: unbound.map(r => r.id) };
  saveData(data);
  await sendMessage(userId, msg);
}

async function showMyDebt(userId, targetId, isGroup) {
  const renter = data.renters.find(r => r.maxUserId === userId);
  if (!renter) {
    await send(targetId, isGroup, '❌ Ваш аккаунт не привязан. Отправьте /bind');
    return;
  }

  const myPayments = data.payments.filter(p => p.renterId === renter.id);
  const pending = myPayments.filter(p => p.status !== 'paid');
  const overdue = pending.filter(p => new Date(p.dueDate) < new Date());

  let msg = `💰 *Моя задолженность:*\n\n`;
  if (pending.length === 0) {
    msg += `✅ У вас нет задолженностей! Всё оплачено.`;
  } else {
    if (overdue.length > 0) {
      msg += `⚠️ *ПРОСРОЧЕНО:*\n`;
      overdue.forEach(p => {
        msg += `   • ${p.amount} ₽ (до ${p.dueDate})\n`;
      });
      msg += '\n';
    }
    const upcoming = pending.filter(p => new Date(p.dueDate) >= new Date());
    if (upcoming.length > 0) {
      msg += `⏳ *Ожидается:*\n`;
      upcoming.forEach(p => {
        msg += `   • ${p.amount} ₽ (до ${p.dueDate})\n`;
      });
      msg += '\n';
    }
    const total = pending.reduce((s, p) => s + p.amount, 0);
    msg += `💰 *Итого: ${total} ₽*\n\n`;
    msg += `📸 После оплаты отправьте чек: /receipt`;
  }
  await send(targetId, isGroup, msg);
}

// ==================== ОБЩИЕ КОМАНДЫ ====================
async function showRenters(userId, targetId, isGroup) {
  let rentersToShow = data.renters;
  // Админ видит только своих клиентов
  if (getUserRole(userId) === 'admin') {
    rentersToShow = data.renters.filter(r => r.assignedAdminId === userId);
  }

  if (rentersToShow.length === 0) {
    await send(targetId, isGroup, '📋 Список пуст.');
    return;
  }

  let msg = '👥 *Арендаторы:*\n\n';
  rentersToShow.forEach((r, i) => {
    const bike = data.bikes.find(b => b.id === r.bikeId);
    const admin = data.admins.find(a => a.userId === r.assignedAdminId);
    msg += `${i + 1}. *${r.name}*\n`;
    msg += `   📱 ${r.phone}\n`;
    if (bike) msg += `   🚲 ${bike.model}\n`;
    if (admin) msg += `   💼 Админ: ${admin.name}\n`;
    msg += `   📅 Начало: ${r.startDate}\n\n`;
  });
  await send(targetId, isGroup, msg);
}

async function startAddRenter(userId, targetId, isGroup) {
  data.userStates[userId] = { action: 'add_renter_name' };
  saveData(data);
  await send(targetId, isGroup, '✏️ Введите имя арендатора:');
}

async function finishAddRenter(userId, targetId, isGroup, state) {
  const newRenter = {
    id: generateId(), name: state.name, phone: state.phone,
    bikeId: state.bikeId || null, startDate: new Date().toISOString().split('T')[0],
    role: 'client', maxUserId: null, assignedAdminId: null,
  };
  if (state.bikeId) {
    const bike = data.bikes.find(b => b.id === state.bikeId);
    if (bike) { bike.status = 'rented'; bike.renterId = newRenter.id; }
  }
  data.renters.push(newRenter);
  delete data.userStates[userId]; saveData(data);
  await send(targetId, isGroup, `✅ Арендатор добавлен!\n👤 ${newRenter.name}\n📱 ${newRenter.phone}\n📅 ${newRenter.startDate}`);
}

async function startRemoveRenter(userId, targetId, isGroup) {
  if (data.renters.length === 0) { await send(targetId, isGroup, '📋 Нет арендаторов.'); return; }
  let msg = '🗑️ Выберите (введите номер):\n\n';
  data.renters.forEach((r, i) => { msg += `${i + 1}. ${r.name} (${r.phone})\n`; });
  data.userStates[userId] = { action: 'remove_renter_select' };
  saveData(data);
  await send(targetId, isGroup, msg);
}

async function showBikes(targetId, isGroup) {
  if (data.bikes.length === 0) { await send(targetId, isGroup, '🚲 Нет велосипедов.'); return; }
  let msg = '🚲 *Велосипеды:*\n\n';
  data.bikes.forEach((b, i) => {
    const emoji = b.status === 'available' ? '✅' : b.status === 'rented' ? '🔵' : '🔧';
    const renter = data.renters.find(r => r.id === b.renterId);
    msg += `${i + 1}. *${b.model}*\n   🔢 ${b.serialNumber}\n   💰 ${b.dailyRate} ₽/день\n   ${emoji} ${b.status === 'rented' ? `В аренде (${renter?.name || '?'})` : b.status === 'available' ? 'Свободен' : 'Обслуживание'}\n\n`;
  });
  await send(targetId, isGroup, msg);
}

async function startAddBike(userId, targetId, isGroup) {
  data.userStates[userId] = { action: 'add_bike_model' };
  saveData(data);
  await send(targetId, isGroup, '✏️ Введите модель:');
}

async function finishAddBike(userId, targetId, isGroup, state) {
  const newBike = {
    id: generateId(), model: state.model, serialNumber: state.serialNumber,
    dailyRate: state.dailyRate, status: 'available', renterId: null,
  };
  data.bikes.push(newBike);
  delete data.userStates[userId]; saveData(data);
  await send(targetId, isGroup, `✅ Велосипед добавлен!\n🚲 ${newBike.model}\n🔢 ${newBike.serialNumber}\n💰 ${newBike.dailyRate} ₽/день`);
}

async function startRemoveBike(userId, targetId, isGroup) {
  if (data.bikes.length === 0) { await send(targetId, isGroup, '🚲 Нет велосипедов.'); return; }
  let msg = '🗑️ Выберите (номер):\n\n';
  data.bikes.forEach((b, i) => { msg += `${i + 1}. ${b.model} (${b.serialNumber})\n`; });
  data.userStates[userId] = { action: 'remove_bike_select' };
  saveData(data);
  await send(targetId, isGroup, msg);
}

async function startAddPayment(userId, targetId, isGroup) {
  if (data.renters.length === 0) { await send(targetId, isGroup, '📋 Сначала /add_renter'); return; }
  let msg = '💰 Выберите арендатора:\n\n';
  data.renters.forEach((r, i) => { msg += `${i + 1}. ${r.name}\n`; });
  data.userStates[userId] = { action: 'add_payment_renter', targetId, isGroup };
  saveData(data);
  await send(targetId, isGroup, msg);
}

async function showPayments(userId, targetId, isGroup) {
  let paymentsToShow = data.payments;
  if (getUserRole(userId) === 'admin') {
    const myClientIds = data.renters.filter(r => r.assignedAdminId === userId).map(r => r.id);
    paymentsToShow = data.payments.filter(p => myClientIds.includes(p.renterId));
  }

  if (paymentsToShow.length === 0) { await send(targetId, isGroup, '💰 Нет платежей.'); return; }

  const pending = paymentsToShow.filter(p => p.status !== 'paid');
  const paid = paymentsToShow.filter(p => p.status === 'paid');
  let msg = '💰 *Платежи:*\n\n';

  const overdue = pending.filter(p => new Date(p.dueDate) < new Date());
  if (overdue.length > 0) {
    msg += '⚠️ *ПРОСРОЧЕНО:*\n';
    overdue.forEach(p => {
      const r = data.renters.find(x => x.id === p.renterId);
      msg += `   • ${r?.name || '?'} — ${p.amount} ₽ (до ${p.dueDate})\n`;
    });
    msg += '\n';
  }
  const upcoming = pending.filter(p => new Date(p.dueDate) >= new Date());
  if (upcoming.length > 0) {
    msg += '⏳ *Ожидаются:*\n';
    upcoming.forEach(p => {
      const r = data.renters.find(x => x.id === p.renterId);
      msg += `   • ${r?.name || '?'} — ${p.amount} ₽ (до ${p.dueDate})\n`;
    });
    msg += '\n';
  }
  if (paid.length > 0) {
    msg += `✅ Оплачено: ${paid.length} (всего ${paid.reduce((s, p) => s + p.amount, 0).toLocaleString()} ₽)\n`;
  }
  await send(targetId, isGroup, msg);
}

async function showOverdue(userId, targetId, isGroup) {
  let paymentsToShow = data.payments.filter(p => p.status !== 'paid' && new Date(p.dueDate) < new Date());
  if (getUserRole(userId) === 'admin') {
    const myClientIds = data.renters.filter(r => r.assignedAdminId === userId).map(r => r.id);
    paymentsToShow = paymentsToShow.filter(p => myClientIds.includes(p.renterId));
  }
  if (paymentsToShow.length === 0) { await send(targetId, isGroup, '✅ Нет просрочек!'); return; }

  let msg = '⚠️ *ПРОСРОЧЕНО:*\n\n';
  let total = 0;
  paymentsToShow.forEach(p => {
    const r = data.renters.find(x => x.id === p.renterId);
    const days = Math.floor((Date.now() - new Date(p.dueDate).getTime()) / 86400000);
    msg += `• *${r?.name || '?'}* — ${p.amount} ₽\n  ⚠️ ${days} дн. просрочки\n\n`;
    total += p.amount;
  });
  msg += `💰 *Итого: ${total.toLocaleString()} ₽*`;
  await send(targetId, isGroup, msg);
}

async function showStats(userId, targetId, isGroup) {
  let rentersToShow = data.renters;
  let paymentsToShow = data.payments;
  if (getUserRole(userId) === 'admin') {
    const myIds = data.renters.filter(r => r.assignedAdminId === userId).map(r => r.id);
    rentersToShow = data.renters.filter(r => myIds.includes(r.id));
    paymentsToShow = data.payments.filter(p => myIds.includes(p.renterId));
  }

  const totalRevenue = paymentsToShow.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
  const pending = paymentsToShow.filter(p => p.status !== 'paid').reduce((s, p) => s + p.amount, 0);
  const overdue = paymentsToShow.filter(p => p.status !== 'paid' && new Date(p.dueDate) < new Date()).length;

  let msg = `📊 *Статистика:*\n\n`;
  msg += `👥 Арендаторов: ${rentersToShow.length}\n`;
  msg += `💼 Админов: ${data.admins.length}\n`;
  msg += `🚲 Велосипедов: ${data.bikes.length}\n`;
  msg += `   ✅ Свободных: ${data.bikes.filter(b => b.status === 'available').length}\n`;
  msg += `   🔵 В аренде: ${data.bikes.filter(b => b.status === 'rented').length}\n\n`;
  msg += `💰 Получено: *${totalRevenue.toLocaleString()} ₽*\n`;
  msg += `⏳ Ожидается: *${pending.toLocaleString()} ₽*\n`;
  msg += `⚠️ Просрочено: *${overdue}*\n`;
  await send(targetId, isGroup, msg);
}

async function showReminders(targetId, isGroup) {
  const pending = data.payments.filter(p => p.status !== 'paid');
  if (pending.length === 0) { await send(targetId, isGroup, '📬 Нет активных платежей.'); return; }

  let msg = '🔔 *Статус напоминаний:*\n\n';
  pending.forEach(p => {
    const r = data.renters.find(x => x.id === p.renterId);
    const days = Math.ceil((new Date(p.dueDate) - new Date()) / 86400000);
    const bound = r?.maxUserId ? '✅' : '❌';
    msg += `• *${r?.name || '?'}* — ${p.amount} ₽ (до ${p.dueDate})\n`;
    msg += `  ${bound} MAX привязан\n`;
    msg += `  📩 За день: ${p.reminder1Sent ? '✅' : '⏳'}\n`;
    msg += `  📩 В день: ${p.reminder2Sent ? '✅' : '⏳'}\n\n`;
  });
  await send(targetId, isGroup, msg);
}

async function startReceipt(userId, targetId, isGroup) {
  data.userStates[userId] = { action: 'awaiting_receipt', targetId, isGroup };
  saveData(data);
  await send(targetId, isGroup, '📸 Отправьте фото/скриншот чека.');
}

async function handleReceiptImage(userId, targetId, isGroup, attachment) {
  const renter = data.renters.find(r => r.maxUserId === userId);
  const receipt = {
    id: generateId(), userId, renterId: renter?.id || null,
    imageUrl: attachment.payload?.url || '', imageToken: attachment.payload?.token || '',
    uploadDate: new Date().toISOString(), description: 'Чек',
  };
  data.receipts.push(receipt);
  delete data.userStates[userId]; saveData(data);
  await send(targetId, isGroup, `✅ Чек сохранён!\n📅 ${new Date().toLocaleDateString('ru')}`);

  // Уведомляем закреплённого админа
  if (renter?.assignedAdminId) {
    await sendMessage(renter.assignedAdminId, 
      `📸 Клиент *${renter.name}* отправил чек об оплате!\n📅 ${new Date().toLocaleString('ru')}`
    );
  }
}

// ==================== CALLBACK ====================
async function handleCallback(update) {
  const payload = update.callback?.payload;
  const userId = update.callback?.user?.user_id;
  const chatId = update.message?.recipient?.chat_id;
  const isGroup = update.message?.recipient?.chat_type !== 'dialog';
  const targetId = isGroup ? chatId : userId;
  if (!payload || !userId) return;

  const state = data.userStates[userId];
  if (state?.action === 'add_renter_bike') {
    if (payload === 'bike_none') state.bikeId = null;
    else if (payload.startsWith('bike_')) state.bikeId = payload.substring(5);
    await finishAddRenter(userId, targetId, isGroup, state);
  }
}

// ==================== НАПОМИНАНИЯ КЛИЕНТАМ ====================
async function runReminderCheck(adminTargetId = null, adminIsGroup = false, manual = false) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let sentCount = 0;

  for (const payment of data.payments) {
    if (payment.status === 'paid') continue;
    const renter = data.renters.find(r => r.id === payment.renterId);
    if (!renter || !renter.maxUserId) continue;

    const dueDate = new Date(payment.dueDate);
    const dueDay = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
    const daysUntil = Math.round((dueDay - today) / 86400000);

    // Напоминание за N дней
    if (daysUntil === data.settings.reminder1DaysBefore && !payment.reminder1Sent) {
      const bike = data.bikes.find(b => b.id === payment.bikeId);
      try {
        await sendMessage(renter.maxUserId,
          `⏰ *Напоминание об оплате*\n\nЗдравствуйте, ${renter.name}!\n\n📅 Через ${daysUntil} ${daysUntil === 1 ? 'день' : 'дн.'} (${payment.dueDate}) срок оплаты.\n\n🚲 ${bike?.model || '?'}\n💰 *${payment.amount} ₽*\n\nНе забудьте оплатить! 🙏\nПосле оплаты: /receipt`
        );
        payment.reminder1Sent = now.toISOString();
        sentCount++;
        data.reminderLog.push({ date: now.toLocaleString('ru'), type: `За ${daysUntil} дн.`, renterName: renter.name });
      } catch (e) { console.error('Reminder error:', e.message); }
    }

    // Напоминание в день оплаты
    if (daysUntil === 0 && data.settings.reminder2OnDay && !payment.reminder2Sent) {
      const bike = data.bikes.find(b => b.id === payment.bikeId);
      try {
        await sendMessage(renter.maxUserId,
          `🔴 *СРОК ОПЛАТЫ СЕГОДНЯ!*\n\n${renter.name}, сегодня последний день!\n\n🚲 ${bike?.model || '?'}\n💰 *${payment.amount} ₽*\n\nОплатите сегодня! /receipt`
        );
        payment.reminder2Sent = now.toISOString();
        sentCount++;
        data.reminderLog.push({ date: now.toLocaleString('ru'), type: 'В день оплаты', renterName: renter.name });
      } catch (e) { console.error('Reminder error:', e.message); }
    }
  }

  if (data.reminderLog.length > 100) data.reminderLog = data.reminderLog.slice(-100);
  saveData(data);

  if (manual && adminTargetId) {
    await send(adminTargetId, adminIsGroup, `🔔 Проверка завершена.\n📬 Отправлено: ${sentCount}`);
  }
  return sentCount;
}

// ==================== УТРЕННИЕ/ВЕЧЕРНИЕ ОТЧЁТЫ АДМИНАМ ====================
async function sendMorningReports() {
  const today = new Date().toISOString().split('T')[0];
  console.log(`🌅 [${new Date().toLocaleString('ru')}] Утренние отчёты админам...`);

  for (const admin of data.admins) {
    const myClients = data.renters.filter(r => r.assignedAdminId === admin.userId);
    if (myClients.length === 0) continue;

    // Кто должен оплатить сегодня
    const dueToday = data.payments.filter(p => 
      p.status !== 'paid' && 
      p.dueDate === today && 
      myClients.some(c => c.id === p.renterId)
    );

    // Кто должен оплатить в ближайшие 3 дня
    const upcoming = data.payments.filter(p => {
      if (p.status === 'paid') return false;
      if (!myClients.some(c => c.id === p.renterId)) return false;
      const due = new Date(p.dueDate);
      const now = new Date();
      const diff = Math.ceil((due - now) / 86400000);
      return diff >= 0 && diff <= 3;
    });

    let msg = `🌅 *Утренний отчёт*\n📅 ${new Date().toLocaleDateString('ru')}\n\n`;
    
    if (dueToday.length > 0) {
      msg += `🔴 *Должны оплатить СЕГОДНЯ:*\n`;
      dueToday.forEach(p => {
        const r = data.renters.find(x => x.id === p.renterId);
        msg += `   • ${r?.name} — ${p.amount} ₽\n`;
      });
      msg += '\n';
    }

    if (upcoming.length > 0) {
      msg += `⏳ *Ближайшие 3 дня:*\n`;
      upcoming.forEach(p => {
        const r = data.renters.find(x => x.id === p.renterId);
        const days = Math.ceil((new Date(p.dueDate) - new Date()) / 86400000);
        msg += `   • ${r?.name} — ${p.amount} ₽ (через ${days} дн.)\n`;
      });
      msg += '\n';
    }

    if (dueToday.length === 0 && upcoming.length === 0) {
      msg += `✅ Сегодня никто не должен оплачивать.\n`;
    }

    const totalDebt = data.payments
      .filter(p => p.status !== 'paid' && myClients.some(c => c.id === p.renterId))
      .reduce((s, p) => s + p.amount, 0);
    
    msg += `\n💰 Общая задолженность клиентов: *${totalDebt.toLocaleString()} ₽*`;

    try {
      await sendMessage(admin.userId, msg);
    } catch (e) {
      console.error(`Morning report error for ${admin.name}:`, e.message);
    }
  }
}

async function sendEveningReports() {
  const today = new Date().toISOString().split('T')[0];
  console.log(`🌙 [${new Date().toLocaleString('ru')}] Вечерние отчёты админам...`);

  for (const admin of data.admins) {
    const myClients = data.renters.filter(r => r.assignedAdminId === admin.userId);
    if (myClients.length === 0) continue;

    // Кто оплатил сегодня
    const paidToday = data.payments.filter(p => 
      p.status === 'paid' && 
      p.paidDate === today && 
      myClients.some(c => c.id === p.renterId)
    );

    // Кто НЕ оплатил сегодня (должен был)
    const missedToday = data.payments.filter(p => 
      p.status !== 'paid' && 
      p.dueDate === today && 
      myClients.some(c => c.id === p.renterId)
    );

    let msg = `🌙 *Вечерний отчёт*\n📅 ${new Date().toLocaleDateString('ru')}\n\n`;

    if (paidToday.length > 0) {
      msg += `✅ *Оплатили сегодня:*\n`;
      paidToday.forEach(p => {
        const r = data.renters.find(x => x.id === p.renterId);
        msg += `   • ${r?.name} — ${p.amount} ₽\n`;
      });
      const total = paidToday.reduce((s, p) => s + p.amount, 0);
      msg += `   💰 Итого: ${total} ₽\n\n`;
    } else {
      msg += `❌ Сегодня никто не оплатил.\n\n`;
    }

    if (missedToday.length > 0) {
      msg += `⚠️ *НЕ ОПЛАТИЛИ (срок сегодня):*\n`;
      missedToday.forEach(p => {
        const r = data.renters.find(x => x.id === p.renterId);
        msg += `   • ${r?.name} — ${p.amount} ₽\n`;
      });
      msg += '\n';
    }

    // Завтра должны оплатить
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const dueTomorrow = data.payments.filter(p => 
      p.status !== 'paid' && 
      p.dueDate === tomorrow && 
      myClients.some(c => c.id === p.renterId)
    );

    if (dueTomorrow.length > 0) {
      msg += `📅 *Завтра срок:*\n`;
      dueTomorrow.forEach(p => {
        const r = data.renters.find(x => x.id === p.renterId);
        msg += `   • ${r?.name} — ${p.amount} ₽\n`;
      });
    }

    try {
      await sendMessage(admin.userId, msg);
    } catch (e) {
      console.error(`Evening report error for ${admin.name}:`, e.message);
    }
  }
}

// ==================== ПЛАНИРОВЩИК ====================
function scheduleReports() {
  const tz = data.settings.timezone || 3;
  
  // Проверяем каждую минуту
  setInterval(() => {
    const now = new Date();
    const utcHour = now.getUTCHours();
    const localHour = (utcHour + tz) % 24;
    const minute = now.getMinutes();

    // Утренний отчёт
    if (localHour === data.settings.morningReportHour && minute === 0) {
      sendMorningReports().catch(console.error);
    }

    // Вечерний отчёт
    if (localHour === data.settings.eveningReportHour && minute === 0) {
      sendEveningReports().catch(console.error);
    }

    // Проверка напоминаний каждый час (в начале часа)
    if (minute === 0) {
      runReminderCheck().catch(console.error);
    }
  }, 60 * 1000); // Каждую минуту

  console.log(`⏰ Планировщик: утро ${data.settings.morningReportHour}:00, вечер ${data.settings.eveningReportHour}:00 (UTC+${tz})`);
}

// ==================== УТИЛИТЫ ====================
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// ==================== ЗАПУСК ====================
async function main() {
  console.log('🤖 MaxBot запускается...');
  console.log(`👑 Владелец (телефон): ${OWNER_PHONE}`);
  console.log(`📁 Данные: ${DATA_FILE}`);

  if (BOT_TOKEN === 'YOUR_BOT_TOKEN_HERE') {
    console.error('❌ Укажите токен! MAX_BOT_TOKEN=... node bot.js');
    process.exit(1);
  }

  try {
    const me = await apiRequest('GET', '/me');
    if (me.is_bot) {
      console.log(`✅ Бот: @${me.username} (${me.first_name})`);
    } else {
      console.error('❌ Неверный токен');
      process.exit(1);
    }
  } catch (e) {
    console.error('❌ Ошибка:', e.message);
    process.exit(1);
  }

  // Планировщик
  scheduleReports();

  // Long Polling
  console.log('🔄 Long Polling...');
  async function poll() {
    while (true) { await getUpdates(); }
  }
  poll();
}

main().catch(console.error);
