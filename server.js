const express = require('express');
const app = express();
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const port = 3000;
const XLSX = require('xlsx');
const TelegramBot = require('node-telegram-bot-api');
const moment = require('moment');

// подключение к базе данных
const db = new sqlite3.Database('./buket.db', (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Подключено к базе данных SQLite.');
});

// ьокен telegram-бота
const token = '7768807025:AAF5nytSrhIXTZaoyURCqsanrTsJHLrhCSE';

// ID чата
const chatId = '559465054';

// создание бота
const bot = new TelegramBot(token, {
  polling: true
});

// выгрузка данных в еxcel
app.get('/export-excel', (req, res) => {
  db.all(`SELECT
    o.id,
    o.name,
    o.phone,
    o.deliveryMethod,
    o.street,
    o.house,
    o.apartment,
    GROUP_CONCAT(p.name || ' (' || oi.quantity || ')'  ) AS product_list,
    o.total_price,
    o.created_at,
    o.status
FROM
    orders o
LEFT JOIN
    order_items oi ON o.id = oi.order_id
LEFT JOIN
    products p ON oi.product_id = p.id
GROUP BY
    o.id, o.name, o.phone, o.deliveryMethod, o.street, o.house, o.apartment, o.total_price, o.created_at, o.status;`, [], (err, rows) => {
    if (err) {
      console.error(err.message);
      res.status(500).json({
        error: err.message
      });
      return;
    }

    // формат подходящий для Excel
    const data = rows.map(row => ({
      ID: row.id,
      Name: row.name,
      Phone: row.phone,
      DeliveryMethod: row.deliveryMethod,
      Street: row.street,
      House: row.house,
      Apartment: row.apartment,
      Products: row.product_list,
      TotalPrice: row.total_price,
      CreatedAt: row.created_at,
      Status: row.status,
    }));

    // рабочий лист еxcel
    const ws = XLSX.utils.json_to_sheet(data);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Orders');

    const buffer = XLSX.write(wb, {
      bookType: 'xlsx',
      type: 'buffer'
    });

    // отправка файла еxcel клиенту
    res.setHeader('Content-Disposition', 'attachment; filename="orders.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  });
});

module.exports = app;

// настройка EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'public'));

app.use(express.static(path.join(__dirname, 'public')));

// middleware для обработки форм
app.use(bodyParser.urlencoded({
  extended: false
}));
app.use(bodyParser.json());

let secret = '444'
// настройка сессий
app.use(cookieParser(secret));
app.use(session({
  secret: secret,
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: false
  }
}));

// middleware для проверки авторизации
function requireLogin(req, res, next) {
  if (req.session.admin) {
    next();
  } else {
    res.redirect('/login');
  }
}

// эндпоинт для страницы логина
app.get('/login', (req, res) => {
  res.render('login');
});

// эндпоинт для обработки запроса логина
app.post('/login', (req, res) => {
  const {
    username,
    password
  } = req.body;

  // проверка учетных данных
  if (username === 'admin' && password === 'qwerty444') {
    req.session.admin = true;
    res.redirect('/admin');
  } else {
    res.render('login', {
      error: 'Неверный логин или пароль'
    });
  }
});

// эндпоинт для выхода из системы
app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error(err.message);
    }
    res.redirect('/login');
  });
});

// эндпоинт для страницы панели администратора с авторизацией
app.get('/admin', requireLogin, (req, res) => {
  db.all("SELECT id, name FROM categories", [], (err, rows) => {
    if (err) {
      console.error(err.message);
      res.status(500).send('Ошибка сервера');
      return;
    }
    res.render('admin', {
      categories: rows
    });
  });
});

// эндпоинт для страницы изменения порядка товаров
app.get('/admin/products', async (req, res) => {
  try {
    const products = await new Promise((resolve, reject) => {
      db.all(`SELECT * FROM products ORDER BY "order" ASC`, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
    res.render('adminProducts', {
      products: products
    });
  } catch (error) {
    console.error('Ошибка при получении списка товаров для админки:', error);
    res.status(500).send('Ошибка при загрузке страницы администрирования товаров');
  }
});
app.get('/admin/products/matrix', (req, res) => {
  db.all('SELECT id, name FROM products ORDER BY sort_order ASC', [], (err, rows) => {
    if (err) {
      console.error(err.message);
      return res.status(500).json({
        error: 'Error fetching products'
      });
    }
    res.json(rows);
  });
});
app.post('/admin/products/reorder', (req, res) => {
  const newOrder = req.body.order;

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    try {
      newOrder.forEach((productId, index) => {
        const sortOrder = index + 1;
        db.run('UPDATE products SET sort_order = ? WHERE id = ?', [sortOrder, productId]);
      });

      db.run('COMMIT');
      console.log('Order saved successfully!');
      res.status(200).send('Order saved successfully!');
    } catch (err) {
      db.run('ROLLBACK');
      console.error('Error saving order:', err.message);
      res.status(500).send('Error saving order');
    }
  });
});

// эндпоинт для получения списка категорий
app.get('/api/categories', (req, res) => {
  const sql = "SELECT id, name FROM categories";
  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error(err.message);
      res.status(500).json({
        error: err.message
      });
      return;
    }
    res.json(rows);
  });
});

// эндпоинт для получения товаров с фильтрацией, поиском и пагинацией
app.get('/api/products', (req, res) => {
  let {
    category,
    search,
    offset,
    limit
  } = req.query;
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
    ORDER BY p.sort_order ASC
    LIMIT ? OFFSET ?
  `;
  params.push(limit, offset);

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error(err.message);
      res.status(500).json({
        error: err.message
      });
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

// эндпоинт для получения данных корзины
app.get('/api/cart', (req, res) => {
  const sessionId = req.sessionID;

  const sql = "SELECT product_id as id, name, price, images, quantity FROM cart WHERE session_id = ?";
  db.all(sql, [sessionId], (err, rows) => {
    if (err) {
      console.error(err.message);
      res.status(500).json({
        error: err.message
      });
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

// эндпоинт для добавления товара в корзину
app.post('/api/cart', (req, res) => {
  const {
    id,
    name,
    price,
    images,
    quantity
  } = req.body;
  const sessionId = req.sessionID;

  const sqlSelect = "SELECT quantity FROM cart WHERE product_id = ? AND session_id = ?";
  db.get(sqlSelect, [id, sessionId], (err, row) => {
    if (err) {
      console.error(err.message);
      return res.status(500).json({
        error: err.message
      });
    }
    if (row) {
      const newQuantity = row.quantity + quantity;
      const sqlUpdate = "UPDATE cart SET quantity = ? WHERE product_id = ? AND session_id = ?";
      db.run(sqlUpdate, [newQuantity, id, sessionId], function (err) {
        if (err) {
          console.error(err.message);
          res.status(500).json({
            error: err.message
          });
          return;
        }
        res.json({
          message: "Количество товара обновлено"
        });
      });
    } else {
      const sqlInsert = "INSERT INTO cart (product_id, name, price, images, quantity, session_id) VALUES (?, ?, ?, ?, ?, ?)";
      db.run(sqlInsert, [id, name, price, JSON.stringify(images), quantity, sessionId], function (err) {
        if (err) {
          console.error(err.message);
          res.status(500).json({
            error: err.message
          });
          return;
        }
        res.json({
          message: "Товар добавлен в корзину"
        });
      });
    }
  });
});

// эндпоинт для обновления количества товара в корзине
app.put('/api/cart/:productId', (req, res) => {
  const productId = req.params.productId;
  const {
    quantity
  } = req.body;
  const sessionId = req.sessionID;
  const sql = "UPDATE cart SET quantity = ? WHERE product_id = ? AND session_id = ?";
  db.run(sql, [quantity, productId, sessionId], function (err) {
    if (err) {
      console.error(err.message);
      res.status(500).json({
        error: err.message
      });
      return;
    }

    if (this.changes > 0) {
      res.json({
        message: "Количество товара обновлено"
      });
    } else {
      res.status(404).json({
        message: "Товар не найден в корзине для этой сессии"
      });
    }
  });
});

// эндпоинт для очистки корзины
app.delete('/api/cart/clear', (req, res) => {
  const sessionId = req.sessionID;
  const sql = "DELETE FROM cart WHERE session_id = ?";
  db.run(sql, [sessionId], function (err) {
    if (err) {
      console.error(err.message);
      res.status(500).json({
        error: err.message
      });
      return;
    }
    res.json({
      message: "Корзина очищена"
    });
  });
});

// эндпоинт для удаления товара из корзины
app.delete('/api/cart/:productId', (req, res) => {
  const productId = req.params.productId;
  const sessionId = req.sessionID;
  const sql = "DELETE FROM cart WHERE product_id = ? AND session_id = ?";
  db.run(sql, [productId, sessionId], function (err) {
    if (err) {
      console.error(err.message);
      res.status(500).json({
        error: err.message
      });
      return;
    }

    if (this.changes > 0) {
      res.json({
        message: "Товар удален из корзины"
      });
    } else {
      res.status(404).json({
        message: "Товар не найден в корзине для этой сессии"
      });
    }
  });
});

// эндпоинт для оформления заказа
app.post('/api/order', (req, res) => {
  const now = moment().format('YYYY-MM-DD HH:mm:ss');
  const {
    name,
    phone,
    deliveryMethod,
    street,
    house,
    apartment,
    items
  } = req.body;

  // if (!name || !phone || !deliveryMethod || !products || !total_price) {
  //   return res.status(400).send('Пожалуйста, заполните все обязательные поля');
  // }
  console.log('Получен способ доставки:', deliveryMethod);
  console.log('Получен заказ:', req.body);

  const total_price = items.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const productsArray = items.map(item => item.id);
  const productsJsonString = JSON.stringify(productsArray);

  const sqlInsert =
    `INSERT INTO orders (name, phone, deliveryMethod, street, house, apartment, products, total_price, created_at) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  db.run(sqlInsert,
    [
      name, phone, deliveryMethod, street, house, apartment,
      productsJsonString,
      total_price,
      now
    ],
    function (err) {
      if (err) {
        console.error(err.message);
        return res.status(500).send('Ошибка сервера при оформлении заказа');
      } else {
        const orderId = this.lastID;
        console.log(`Заказ добавлен с ID ${this.lastID}`);
        addOrderItemsFromCart(db, orderId, items);
      }

      const sql = `
      SELECT
          o.id,
          o.name AS customer_name,
          o.phone AS customer_phone,
          o.deliveryMethod AS delivery_method,
          GROUP_CONCAT(p.name || ' (' || oi.quantity || ')' ) AS product_list,
          o.total_price
      FROM
          orders o
      LEFT JOIN
          order_items oi ON o.id = oi.order_id
      LEFT JOIN
          products p ON oi.product_id = p.id
      WHERE
          o.id = ?
      GROUP BY
          o.id, o.name, o.phone, o.deliveryMethod, o.total_price;
  `;
      console.log(`Заказ добавлен с ID ${this.lastID}`);
      const orderId = this.lastID;


      db.get(sql, [orderId], (err, order) => {
        if (err) {
          console.error("Ошибка при получении информации о заказе:", err.message);
          return;
        }

        if (!order) {
          console.warn("Заказ с ID " + orderId + " не найден.");
          return;
        }


        const message = `
Новый заказ!
ID: ${order.id}
Имя: ${order.customer_name}
Телефон: ${order.customer_phone}
Способ доставки: ${order.delivery_method}
Товары: ${order.product_list}
Сумма: ${order.total_price}
    `;

        bot.sendMessage(chatId, message)
          .then(() => {
            console.log('Уведомление отправлено в Telegram');
          })
          .catch((error) => {
            console.error('Ошибка при отправке уведомления в Telegram:', error);
          });
        res.json({
          message: 'Заказ успешно создан.'
        });
      });

    });
});

module.exports = app;

async function addOrderItemsFromCart(db, orderId, cartItems) {
  for (const cartItem of cartItems) {
    try {

      // Валидация данных
      if (!Number.isInteger(cartItem.id)) {
        console.warn(`Неверный productId ${cartItem.id} в корзине`);
        continue;
      }
      if (!Number.isInteger(cartItem.quantity) || cartItem.quantity <= 0) {
        console.warn(`Неверное количество ${cartItem.quantity} для товара ${cartItem.id}`);
        continue;
      }

      // добавление записи в таблицу order_items
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO order_items (order_id, product_id, quantity) VALUES (?, ?, ?)`,
          [orderId, cartItem.id, cartItem.quantity],
          (err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          }
        );
      });

      console.log(`Товар добавлен в order_items: order_id=${orderId}, product_id=${cartItem.id}, quantity=${cartItem.quantity}`);

    } catch (dbError) {
      console.error(`Ошибка при добавлении товара в order_items: order_id=${orderId}, product_id=${cartItem.id}:`, dbError);
    }
  }

  console.log('Добавление товаров из корзины в order_items завершено!');
}

// эндпоинт для главной страницы
app.get('/', (req, res) => {
  db.all("SELECT id, name FROM categories", [], (err, rows) => {
    if (err) {
      console.error(err.message);
      res.status(500).send('Ошибка сервера');
      return;
    }
    res.render('index', {
      categories: rows
    });
  });
});

app.post('/api/categories', (req, res) => {
  const categoryName = req.body.name;

  if (!categoryName || categoryName.trim() === '') {
    return res.status(400).json({
      message: 'Название категории не может быть пустым.'
    });
  }

  db.get("SELECT id FROM categories WHERE name = ?", [categoryName], (err, row) => {
    if (err) {
      console.error('Ошибка при проверке существования категории:', err.message);
      return res.status(500).json({
        message: 'Ошибка сервера при проверке категории.'
      });
    }

    if (row) {
      return res.status(400).json({
        message: 'Категория с таким названием уже существует.'
      });
    }

    // добавление категории в бд
    db.run("INSERT INTO categories (name) VALUES (?)", [categoryName], function (err) {
      if (err) {
        console.error('Ошибка при добавлении категории:', err.message);
        return res.status(500).json({
          message: 'Ошибка сервера при добавлении категории.'
        });
      }

      const categoryId = this.lastID;
      console.log(`Категория "${categoryName}" успешно добавлена с ID: ${categoryId}`);
      res.status(201).json({
        message: 'Категория успешно добавлена!',
        categoryId: categoryId
      });
    });
  });
});

// эндпоинт для страницы выбора категории 
app.get('/categories', requireLogin, (req, res) => {
  db.all("SELECT id, name FROM categories", [], (err, rows) => {
    if (err) {
      console.error(err.message);
      res.status(500).send('Ошибка сервера');
      return;
    }
    res.render('categories', {
      categories: rows
    });
  });
});


// эндпоинт для страницы заказов
app.get('/orders', (req, res) => {
  const sql = `SELECT
    o.id,
    o.name,
    o.phone,
    o.deliveryMethod,
    o.street,
    o.house,
    o.apartment,
    GROUP_CONCAT(p.name || ' (' || oi.quantity || ')'  ) AS product_names,
    o.total_price,
    o.created_at,
    o.status
FROM
    orders o
LEFT JOIN
    order_items oi ON o.id = oi.order_id
LEFT JOIN
    products p ON oi.product_id = p.id
GROUP BY
    o.id, o.name, o.phone, o.deliveryMethod, o.street, o.house, o.apartment, o.total_price, o.created_at, o.status;
`;

  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error(err.message);
      res.status(500).send('Ошибка сервера');
      return;
    }
    res.render('orders', {
      orders: rows
    });
  });
});

// эндпоинт для обновления статуса заказа
app.put('/api/order/:id/status', async (req, res) => {
  const orderId = req.params.id;
  const newStatus = req.body.status;

  try {
    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE orders SET status = ? WHERE id = ?`,
        [newStatus, orderId],
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });

    console.log(`Статус заказа ${orderId} обновлен на ${newStatus}`);
    res.json({
      message: `Статус заказа обновлен на ${newStatus}`
    });

  } catch (error) {
    console.error('Ошибка при обновлении статуса заказа:', error);
    res.status(500).json({
      message: 'Ошибка при обновлении статуса заказа'
    });
  }
});

// эндпоинт для удаления заказа
app.delete('/api/order/:id', async (req, res) => {
  const orderId = req.params.id;

  try {
    await new Promise((resolve, reject) => {
      db.run(
        `DELETE FROM orders WHERE id = ?`,
        [orderId],
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });

    console.log(`Заказ ${orderId} удален`);
    res.json({
      message: `Заказ удален`
    });

  } catch (error) {
    console.error('Ошибка при удалении заказа:', error);
    res.status(500).json({
      message: 'Ошибка при удалении заказа'
    });
  }
});

// эндпоинт для отображения формы добавления товара
app.get('/products/new', requireLogin, (req, res) => {
  console.log("Запрос на /products/new");
  db.all("SELECT id, name FROM categories", [], (err, rows) => { // получение категории
    if (err) {
      console.error(err.message);
      res.status(500).send('Ошибка сервера при получении категорий');
      return;
    }
    res.render('newProduct', {
      categories: rows
    }); // передача категории в шаблон
  });
});

// эндпоинт для удаления категории
app.delete('/api/categories/:id', (req, res) => {
  const categoryId = req.params.id;

  if (!categoryId || isNaN(categoryId)) {
    return res.status(400).json({
      message: 'Некорректный ID категории.'
    });
  }

  db.get("SELECT id FROM categories WHERE id = ?", [categoryId], (err, row) => {
    if (err) {
      console.error('Ошибка при проверке существования категории:', err.message);
      return res.status(500).json({
        message: 'Ошибка сервера при проверке категории.'
      });
    }

    if (!row) {
      return res.status(404).json({
        message: 'Категория с таким ID не найдена.'
      });
    }

    db.get("SELECT id FROM products WHERE category_id = ?", [categoryId], (err, row) => {
      if (err) {
        console.error('Ошибка при проверке использования категории в товарах:', err.message);
        return res.status(500).json({
          message: 'Ошибка сервера при проверке использования категории в товарах.'
        });
      }

      if (row) {
        return res.status(400).json({
          message: 'Невозможно удалить категорию, так как она используется в товарах. Сначала удалите товары этой категории.'
        });
      }

      // удаление категории из базы данных
      db.run("DELETE FROM categories WHERE id = ?", [categoryId], function (err) {
        if (err) {
          console.error('Ошибка при удалении категории:', err.message);
          return res.status(500).json({
            message: 'Ошибка сервера при удалении категории.'
          });
        }

        if (this.changes === 0) {
          return res.status(404).json({
            message: 'Категория с таким ID не найдена.'
          });
        }

        console.log(`Категория с ID "${categoryId}" успешно удалена.`);
        res.status(200).json({
          message: 'Категория успешно удалена!'
        });
      });
    });
  });
});

// эндпоинт для отображения списка товаров по категории 
app.get('/products/:category_id', requireLogin, (req, res) => {
  const categoryId = req.params.category_id;
  const sql = `
  SELECT
    p.id,
    p.name,
    p.price,
    p.images,
    c.name AS category_name 
  FROM products p
  JOIN categories c ON p.category_id = c.id 
  WHERE p.category_id = ?  
`;
  db.all(sql, [categoryId], (err, rows) => {
    if (err) {
      console.error(err.message);
      res.status(500).send('Ошибка сервера при получении товаров');
      return;
    }

    res.render('products', {
      products: rows,
      category_id: categoryId
    });
  });
});

// эндпоинт для отображения формы редактирования товара
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

    if (row.images) {
      try {
        row.images = JSON.parse(row.images); 
      } catch (e) {
        row.images = [];
      }
    } else {
      row.images = [];
    }

    res.render('editProduct', {
      product: row
    });
  });
});

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, 'public/images'));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage
});

// эндпоинт для обработки отправки формы редактирования товара
app.post('/products/:id', requireLogin, upload.array('images', 10), (req, res) => { 
  const productId = req.params.id;
  const {
    category_id,
    name,
    description,
    price
  } = req.body;
  // let images = req.files ? req.files.map(file => 'images/' + file.filename) : JSON.parse(req.body.existingImages)
  let images;

  if (req.files && req.files.length > 0) {
    // добавление новых изображений
    images = req.files.map(file => 'images/' + file.filename);
  } else {
    // используются старые изображения
    try {
      images = JSON.parse(req.body.existingImage);
    } catch (e) {
      images = [];
    }
  }

  // валидация данных
  if (!category_id || !name || !description || !price) {
    return res.status(400).send('Пожалуйста, заполните все поля');
  }
  if (isNaN(price)) {
    return res.status(400).send('Цена должна быть числом');
  }

  const sqlUpdate = "UPDATE products SET category_id = ?, name = ?, description = ?, price = ?, images = ? WHERE id = ?";

  db.run(sqlUpdate, [category_id, name, description, price, JSON.stringify(images), productId], function (err) {
    if (err) {
      console.error(err.message);
      return res.status(500).send('Ошибка сервера при обновлении товара');
    }
    console.log(`Товар с ID ${productId} обновлен`);
    res.redirect('/products/' + category_id);
  });
});



// эндпоинт для обработки запроса добавления товара
app.post('/products', requireLogin, upload.array('images', 10), (req, res) => { // upload.array
  const {
    category_id,
    name,
    description,
    price
  } = req.body;
  const images = req.files ? req.files.map(file => 'images/' + file.filename) : [];


  // валидация данных
  if (!category_id || !name || !description || !price) {
    return res.status(400).send('Пожалуйста, заполните все поля');
  }
  if (isNaN(price)) {
    return res.status(400).send('Цена должна быть числом');
  }

  const sqlInsert = "INSERT INTO products (category_id, name, description, price, images) VALUES (?, ?, ?, ?, ?)";

  db.run(sqlInsert, [category_id, name, description, price, JSON.stringify(images)], function (err) {
    if (err) {
      console.error(err.message);
      return res.status(500).send('Ошибка сервера при добавлении товара');
    }
    console.log(`Товар добавлен с ID ${this.lastID}`);
    res.redirect('/products/' + category_id);
  });
});

// эндпоинт для удаления товара
app.post('/products/:id/delete', requireLogin, (req, res) => {
  const productId = req.params.id;
  const categoryId = req.body.category_id;

  const sqlDelete = "DELETE FROM products WHERE id = ?";

  db.run(sqlDelete, [productId], function (err) {
    if (err) {
      console.error(err.message);
      return res.status(500).send('Ошибка сервера при удалении товара');
    }
    console.log(`Товар с ID ${productId} удален`);
    res.redirect('/products/' + categoryId);
  });
});


app.listen(3000, () => {
  console.log(`Сервер запущен на http://localhost:${port}`);
});