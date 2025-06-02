const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const port = 3000;

const bodyParser = require('body-parser');

const session = require('express-session'); // Для управления сессиями

// Разбор JSON-тела запроса и раздача статических файлов из папки public
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Для корневого URL отдаём index.html
// app.get('/', (req, res) => {
//   res.sendFile(path.join(__dirname, 'public', 'index.html'));
//   // res.sendFile(path.join(__dirname, 'index.html'));

// });

app.get('/', (req, res) => {
  db.all("SELECT id, name FROM categories", [], (err, rows) => {
      if (err) {
          console.error(err.message);
          res.status(500).send('Ошибка сервера');
          return;
      }
      res.render('index', { categories: rows }); // Передаем данные в index.ejs
  });
});

// app.get('/', (req, res) => {
//   res.redirect('/categories');
// });

// Подключение к базе данных SQLite
const db = new sqlite3.Database('./buket.db', (err) => {
  if (err) {
    console.error('Ошибка подключения к БД:', err.message);
  } else {
    console.log('Подключено к базе данных SQLite.');
  }
});

// Настройка EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'public'));

// Middleware для обработки данных из форм
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Настройка сессий
app.use(session({
  secret: '444', // Замените на случайную строку
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // true только для HTTPS
}));

// Middleware для проверки авторизации
function requireLogin(req, res, next) {
  if (req.session.admin) {
      // Администратор авторизован, разрешаем доступ
      next();
  } else {
      // Администратор не авторизован, перенаправляем на страницу логина
      res.redirect('/login');
  }
}

// Маршрут для страницы логина
app.get('/login', (req, res) => {
  res.render('login'); // Создайте login.ejs
});

// Маршрут для обработки POST запроса логина
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  // Проверяем учетные данные (ЗДЕСЬ НУЖНО БУДЕТ ЗАМЕНИТЬ НА РЕАЛЬНУЮ ПРОВЕРКУ!)
  if (username === 'admin' && password === 'password') { 
      // Учетные данные верны, устанавливаем флаг авторизации в сессии
      req.session.admin = true;
      res.redirect('/categories'); // Перенаправляем на страницу категорий
  } else {
      // Учетные данные неверны, показываем сообщение об ошибке
      res.render('login', { error: 'Неверный логин или пароль' });
  }
});

// Маршрут для выхода из системы (logout)
app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
      if (err) {
          console.error(err.message);
      }
      res.redirect('/login'); // Перенаправляем на страницу логина
  });
});

// Создание таблицы для корзины, если она не существует
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS cart (
    product_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    images TEXT,
    quantity INTEGER NOT NULL DEFAULT 1
  )`);
});

// Эндпоинт для получения списка категорий
app.get('/api/categories', (req, res) => {
  const sql = "SELECT id, name FROM categories";
  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error(err.message);
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// Эндпоинт для получения товаров с фильтрацией, поиском и пагинацией
app.get('/api/products', (req, res) => {
  let { category, search, offset, limit } = req.query;
  offset = offset ? parseInt(offset) : 0;
  limit = limit ? parseInt(limit) : 6;

  let params = [];
  let whereClauses = [];

  if (search) {
    whereClauses.push("p.name LIKE ?");
    params.push(`%${search}%`);
  }

  if (category && category !== 'Все' && category !== 'all') {
    whereClauses.push("c.name = ?");
    params.push(category);
  }

  const where = whereClauses.length ? "WHERE " + whereClauses.join(" AND ") : "";

  const sql = `
    SELECT 
      p.id, 
      p.name, 
      p.description, 
      p.price, 
      p.images, 
      c.name as category
    FROM products p
    JOIN categories c ON p.category_id = c.id
    ${where}
    LIMIT ? OFFSET ?
  `;
  params.push(limit, offset);

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error(err.message);
      res.status(500).json({ error: err.message });
      return;
    }
    // Преобразуем поле images из JSON-строки в массив
    rows = rows.map(row => {
      try {
        row.images = JSON.parse(row.images);
      } catch (e) {
        row.images = [];
      }
      return row;
    });
    res.json(rows);
  });
});

// Эндпоинт для получения данных корзины
app.get('/api/cart', (req, res) => {
  // Здесь product_id переименовывается в id для удобства на клиенте
  const sql = "SELECT product_id as id, name, price, images, quantity FROM cart";
  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error(err.message);
      res.status(500).json({ error: err.message });
      return;
    }
    rows = rows.map(row => {
      try {
        row.images = JSON.parse(row.images);
      } catch (e) {
        row.images = [];
      }
      return row;
    });
    res.json(rows);
  });
});

// Эндпоинт для добавления товара в корзину
app.post('/api/cart', (req, res) => {
  const { id, name, price, images, quantity } = req.body;
  // Проверяем, существует ли товар уже в корзине
  const sqlSelect = "SELECT quantity FROM cart WHERE product_id = ?";
  db.get(sqlSelect, [id], (err, row) => {
    if (err) {
      console.error(err.message);
      res.status(500).json({ error: err.message });
      return;
    }
    if (row) {
      // Если товар уже есть, увеличиваем количество
      const newQuantity = row.quantity + quantity;
      const sqlUpdate = "UPDATE cart SET quantity = ? WHERE product_id = ?";
      db.run(sqlUpdate, [newQuantity, id], function(err) {
        if (err) {
          console.error(err.message);
          res.status(500).json({ error: err.message });
          return;
        }
        res.json({ message: "Количество товара обновлено" });
      });
    } else {
      // Если товара нет – добавляем новую запись
      const sqlInsert = "INSERT INTO cart (product_id, name, price, images, quantity) VALUES (?, ?, ?, ?, ?)";
      db.run(sqlInsert, [id, name, price, JSON.stringify(images), quantity], function(err) {
        if (err) {
          console.error(err.message);
          res.status(500).json({ error: err.message });
          return;
        }
        res.json({ message: "Товар добавлен в корзину" });
      });
    }
  });
});

// Эндпоинт для обновления количества товара в корзине
app.put('/api/cart/:productId', (req, res) => {
  const productId = req.params.productId;
  const { quantity } = req.body;
  const sql = "UPDATE cart SET quantity = ? WHERE product_id = ?";
  db.run(sql, [quantity, productId], function(err) {
    if (err) {
      console.error(err.message);
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ message: "Количество товара обновлено" });
  });
});

// Эндпоинт для удаления товара из корзины
app.delete('/api/cart/:productId', (req, res) => {
  const productId = req.params.productId;
  const sql = "DELETE FROM cart WHERE product_id = ?";
  db.run(sql, [productId], function(err) {
    if (err) {
      console.error(err.message);
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ message: "Товар удален из корзины" });
  });
});

// Эндпоинт для очистки корзины
app.delete('/api/cart/clear', (req, res) => {
  const sql = "DELETE FROM cart";
  db.run(sql, [], function(err) {
    if (err) {
      console.error(err.message);
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ message: "Корзина очищена" });
  });
});

// Эндпоинт для оформления заказа
app.post('/api/order', (req, res) => {
  const { items, customerName, customerPhone } = req.body;
  console.log('Получен заказ:', req.body);
  // Здесь можно добавить сохранение заказа в БД
  res.json({ message: "Заказ оформлен" });
});

// 
// Маршрут для страницы выбора категории
app.get('/categories', requireLogin, (req, res) => {
  db.all("SELECT id, name FROM categories", [], (err, rows) => {
      if (err) {
          console.error(err.message);
          res.status(500).send('Ошибка сервера');
          return;
      }
      res.render('categories', { categories: rows }); // Рендерим шаблон categories.ejs
  });
});

// Маршрут для отображения списка товаров по категории
app.get('/products/:category_id', requireLogin, (req, res) => {
  const categoryId = req.params.category_id;

  db.all("SELECT id, name, description, price, images FROM products WHERE category_id = ?", [categoryId], (err, rows) => {
      if (err) {
          console.error(err.message);
          res.status(500).send('Ошибка сервера при получении товаров');
          return;
      }

      res.render('products', { products: rows, category_id: categoryId });
  });
});

// Маршрут для отображения формы редактирования товара
app.get('/products/:id/edit', requireLogin, (req, res) => {
  const productId = req.params.id;

  db.get("SELECT id, category_id, name, description, price, images FROM products WHERE id = ?", [productId], (err, row) => {
      if (err) {
          console.error(err.message);
          res.status(500).send('Ошибка сервера при получении информации о товаре');
          return;
      }

      if (!row) {
          res.status(404).send('Товар не найден');
          return;
      }

      res.render('editProduct', { product: row });
  });
});

// Маршрут для обработки отправки формы редактирования товара
app.post('/products/:id', requireLogin, (req, res) => {
  const productId = req.params.id;
  const { category_id, name, description, price, images } = req.body;

  // Валидация данных
  if (!category_id || !name || !description || !price || !images) {
      return res.status(400).send('Пожалуйста, заполните все поля');
  }
  if (isNaN(price)) {
      return res.status(400).send('Цена должна быть числом');
  }

  const sqlUpdate = "UPDATE products SET category_id = ?, name = ?, description = ?, price = ?, images = ? WHERE id = ?";

  db.run(sqlUpdate, [category_id, name, description, price, images, productId], function(err) {
      if (err) {
          console.error(err.message);
          return res.status(500).send('Ошибка сервера при обновлении товара');
      }
      console.log(`Товар с ID ${productId} обновлен`);
      res.redirect('/products/' + category_id); // Перенаправляем на страницу товаров
  });
});

// Запуск сервера
app.listen(port, () => {
  console.log(`Сервер запущен на http://localhost:${port}`);
});