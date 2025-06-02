document.addEventListener('DOMContentLoaded', () => {
  const categoriesList = document.querySelector('.categories ul');
  const productsContainer = document.querySelector('.products');
  const searchInput = document.getElementById('search-input');
  const modal = document.getElementById('product-modal');
  const closeModalButton = document.getElementById('close-modal');
  const loadMoreButton = document.getElementById('load-more-button');
  const cartCount = document.getElementById('cart-count');
  const cartContainer = document.querySelector('.cart-container');
  const cartModal = document.getElementById('cart-modal');
  const closeCartModalButton = document.getElementById('close-cart-modal');
  const cartItemsContainer = document.getElementById('cart-items');
  const cartTotalPrice = document.getElementById('cart-total-price');
  const cartTotalPriceForm = document.getElementById('cart-total-price-form');
  const checkoutButton = document.getElementById('checkout-button');

  let visibleProducts = 6;
  let loadedProducts = 0;
  let currentCategory = 'Все';
  let currentSearch = '';

  // Получение товаров с сервера с поддержкой фильтрации, поиска и пагинации
  async function fetchProducts(category, search, offset, limit) {
    const params = new URLSearchParams({
      offset: offset,
      limit: limit
    });
    if (category && category !== 'Все' && category !== 'all') {
      params.append('category', category);
    }
    if (search) {
      params.append('search', search);
    }
    const response = await fetch(`/api/products?${params.toString()}`);
    return await response.json();
  }

  // Загрузка и отображение товаров
  async function loadProducts(offset, limit) {
    // productsContainer.innerHTML = '';
    const products = await fetchProducts(currentCategory, currentSearch, offset, limit);

    products.forEach(product => {
      const card = createProductCard(product);
      productsContainer.appendChild(card);
    });
    loadedProducts += products.length;
    loadMoreButton.style.display = products.length < limit ? 'none' : 'block';
  }

  function createProductCard(product) {
    const card = document.createElement('div');
    const cardInformation = document.createElement('div');

    card.classList.add('product-card');
    cardInformation.classList.add('product-inf');

    const image = document.createElement('img');
    image.src = product.images[0];
    image.alt = product.name;
    card.appendChild(image);

    const h2 = document.createElement('h2');
    h2.textContent = product.name;
    cardInformation.appendChild(h2);

    const price = document.createElement('p');
    price.classList.add('price');
    price.textContent = product.price + ' р.';
    cardInformation.appendChild(price);

    card.appendChild(cardInformation);

    const buttonContainer = document.createElement('div');
    buttonContainer.classList.add('button-container');

    const buyButton = document.createElement('button');
    buyButton.classList.add('buy-button');
    buyButton.textContent = 'Добавить в корзину';
    buyButton.addEventListener('click', () => addToCart(product));
    buttonContainer.appendChild(buyButton);

    const detailsButton = document.createElement('button');
    detailsButton.classList.add('details-button');
    detailsButton.textContent = 'Подробнее';
    detailsButton.addEventListener('click', () => showModal(product));
    buttonContainer.appendChild(detailsButton);

    card.appendChild(buttonContainer);
    return card;
  }

  // Фильтрация по категориям
  async function filterProducts(category) {
    currentCategory = category;
    currentSearch = '';
    productsContainer.innerHTML = '';
    loadedProducts = 0;
    await loadProducts(0, visibleProducts);
    loadMoreButton.dataset.currentCategory = category;
  }

  categoriesList.querySelectorAll('li').forEach(categoryLi => {
    categoryLi.addEventListener('click', () => {
      const category = categoryLi.getAttribute('data-category');
      filterProducts(category);
    });
  });

  // Поиск товаров
  searchInput.addEventListener('input', async () => {
    currentSearch = searchInput.value.toLowerCase();
    currentCategory = 'all';
    productsContainer.innerHTML = '';
    loadedProducts = 0;
    await loadProducts(0, visibleProducts);
    loadMoreButton.dataset.currentCategory = 'all';
  });

  loadMoreButton.addEventListener('click', async () => {
    await loadProducts(loadedProducts, visibleProducts);
  });

  // Модальное окно товара
  let currentProduct;

  function showModal(product) {
    currentProduct = product;
    const modalTitle = document.getElementById('modal-title');
    const modalDescription = document.getElementById('modal-description');
    const modalPrice = document.getElementById('modal-price');
    const modalSlides = document.getElementById('modal-slides');
    const modalPreviews = document.getElementById('modal-previews');
    const prevSlideButton = document.getElementById('prev-slide');
    const nextSlideButton = document.getElementById('next-slide');
    const modalBuyButton = document.getElementById('buy-button');

    modalSlides.innerHTML = '';
    modalPreviews.innerHTML = '';
    let currentSlide = 0;

    modalTitle.textContent = product.name;
    modalDescription.textContent = product.description;
    modalPrice.textContent = product.price + ' р.';

    product.images.forEach((imgUrl, index) => {
      const slide = document.createElement('img');
      slide.src = imgUrl;
      slide.alt = `${product.name} - Image ${index}`;
      modalSlides.appendChild(slide);
    });
    product.images.forEach((imgUrl, index) => {
      const preview = document.createElement('img');
      preview.src = imgUrl;
      preview.alt = `${product.name} - Image ${index + 1}`;
      preview.addEventListener('click', () => {
        currentSlide = index;
        updateCarousel();
        updatePreview();
      });
      modalPreviews.appendChild(preview);
    });
    updatePreview();

    function updateCarousel() {
      modalSlides.style.transform = `translateX(-${currentSlide * 100}%)`;
    }

    function updatePreview() {
      const previews = modalPreviews.querySelectorAll('img');
      previews.forEach((preview, index) => {
        if (index === currentSlide) {
          preview.classList.add('active');
        } else {
          preview.classList.remove('active');
        }
      });
    }

    prevSlideButton.addEventListener('click', () => {
      currentSlide = Math.max(0, currentSlide - 1);
      updateCarousel();
      updatePreview();
    });

    nextSlideButton.addEventListener('click', () => {
      currentSlide = Math.min(product.images.length - 1, currentSlide + 1);
      updateCarousel();
      updatePreview();
    });

    modal.classList.add('active');
    modal.style.display = 'flex';
    modal.style.justifyContent = 'center';

    modalBuyButton.onclick = () => {
      addToCart(currentProduct);
      modal.style.display = 'none';
    }
  }

  closeModalButton.addEventListener('click', () => {
    modal.style.display = 'none';
  });

  window.addEventListener('click', (event) => {
    if (event.target === modal) {
      modal.style.display = 'none';
    }
  });

  // Работа с корзиной через API – все данные корзины сохраняются в БД

  // Получение корзины
  async function getCart() {
    const response = await fetch('/api/cart');
    return await response.json();
  }

  // Добавление товара в корзину
  async function addToCart(product) {
    await fetch('/api/cart', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id: product.id,
        product_id: product.id,
        name: product.name,
        price: product.price,
        images: product.images,
        quantity: 1
      })
    });
    updateCartCount();
  }

  // Обновление счетчика корзины
  async function updateCartCount() {
    const cart = await getCart();
    const totalQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);
    cartCount.textContent = totalQuantity;
  }

  // Отображение содержимого корзины
  async function renderCartItems() {
    const cart = await getCart();
    cartItemsContainer.innerHTML = '';
    if (cart.length === 0) {
      cartItemsContainer.innerHTML = '<p>Корзина пуста</p>';
      return;
    }
    cart.forEach(item => {
      const cartItem = document.createElement('div');
      cartItem.classList.add('cart-item');

      const image = document.createElement('img');
      image.src = item.images[0];
      image.alt = item.name;
      cartItem.appendChild(image);

      const cartItemDetails = document.createElement('div');
      cartItemDetails.classList.add('cart-item-details');

      const itemName = document.createElement('h3');
      itemName.textContent = item.name;
      cartItemDetails.appendChild(itemName);

      const cartItemQuantity = document.createElement('div');
      cartItemQuantity.classList.add('cart-item-quantity');

      const minusButton = document.createElement('button');
      minusButton.textContent = '-';
      minusButton.addEventListener('click', () => changeQuantity(item.id, -1));

      const quantity = document.createElement('span');
      quantity.textContent = item.quantity;

      const plusButton = document.createElement('button');
      plusButton.textContent = '+';
      plusButton.addEventListener('click', () => changeQuantity(item.id, 1));

      cartItemQuantity.appendChild(minusButton);
      cartItemQuantity.appendChild(quantity);
      cartItemQuantity.appendChild(plusButton);
      cartItemDetails.appendChild(cartItemQuantity);

      const itemPrice = document.createElement('span');
      itemPrice.classList.add('cart-item-price');
      itemPrice.textContent = item.price + ' р.';
      cartItemDetails.appendChild(itemPrice);

      cartItem.appendChild(cartItemDetails);

      const removeButton = document.createElement('span');
      removeButton.classList.add('cart-item-remove');
      removeButton.innerHTML = '&times;';
      removeButton.addEventListener('click', () => removeItem(item.id));
      cartItem.appendChild(removeButton);

      cartItemsContainer.appendChild(cartItem);
    });
  }

  // Обновление итоговой суммы корзины
  async function updateCartTotal() {
    const cart = await getCart();
    const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    cartTotalPrice.textContent = `Сумма: ${total} р.`;
  }

  async function updateCartTotalForm() {
    const cart = await getCart();
    const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    cartTotalPriceForm.textContent = `Сумма: ${total} р.`;
  }

  // Изменение количества товара в корзине
  async function changeQuantity(productId, quantityChange) {
    const cart = await getCart();
    const item = cart.find(item => item.id === productId);
    if (item) {
      const newQuantity = Math.max(1, item.quantity + quantityChange);
      await fetch(`/api/cart/${productId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          quantity: newQuantity
        })
      });
      updateCartCount();
      renderCartItems();
      updateCartTotal();
      updateCartTotalForm();
    }
  }

  // Удаление товара из корзины
  async function removeItem(productId) {
    await fetch(`/api/cart/${productId}`, {
      method: 'DELETE'
    });
    updateCartCount();
    renderCartItems();
    updateCartTotal();
    updateCartTotalForm();
  }

  cartContainer.addEventListener('click', () => {
    cartModal.classList.add('active');
    renderCartItems();
    updateCartTotal();
    updateCartTotalForm();
  });

  closeCartModalButton.addEventListener('click', () => {
    cartModal.classList.remove('active');
  });

  window.addEventListener('click', (event) => {
    if (event.target === cartModal) {
      cartModal.classList.remove('active');
    }
  });

  // Оформление заказа – отправка данных заказа на сервер и очистка корзины
  checkoutButton.addEventListener('click', async () => {
    const cart = await getCart();
    if (cart.length === 0) {
      alert("Корзина пуста. Пожалуйста, добавьте товар.");
      return;
    }
    const name = document.getElementById('customer-name').value.trim();
    const phone = document.getElementById('customer-phone').value.trim();
    const street = document.getElementById('customer-street').value;
    const house = document.getElementById('customer-house').value;
    const apartment = document.getElementById('customer-apartment').value;
    const deliveryMethod = document.querySelector('input[name="deliveryMethod"]:checked').value;
    console.log('Способ доставки:', deliveryMethod);
    if (!name || !phone) {
      alert('Пожалуйста, заполните имя и номер телефона.');
      return;
    }
    const orderData = {
      items: cart,
      name: name,
      phone: phone,
      deliveryMethod: deliveryMethod,
      street: street,
      house: house,
      apartment: apartment
    };
    console.log('Данные отправленные на сервер:', orderData);
    const response = await fetch('/api/order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(orderData)
    });
    const result = await response.json();
    alert(result.message || 'Заказ оформлен');
    await fetch('/api/cart/clear', {
      method: 'DELETE'
    });
    cartModal.classList.remove('active');
    updateCartCount();
    renderCartItems();
    updateCartTotal();
    updateCartTotalForm();
  });
  checkoutButton.addEventListener('click', async () => {
    console.log("Клик по кнопке 'Оформить заказ'");
  });

  // Начальная загрузка товаров и обновление информации о корзине
  updateCartCount();
  loadProducts(0, visibleProducts);
});