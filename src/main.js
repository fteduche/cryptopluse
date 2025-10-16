// --- API Constants ---
const COINLORE_API_URL = 'https://api.coinlore.net/api/tickers/?start=0&limit=100'; // Top 100 coins
const COINLORE_GLOBAL_URL = 'https://api.coinlore.net/api/global/';
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 500;
const AUTO_REFRESH_INTERVAL = 60000; // 1 minute

// --- Global State ---
let allCoins = [];
let visibleCoins = [];
let currentView = localStorage.getItem('viewMode') || 'table';
let currentPage = 1;
const ITEMS_PER_PAGE = 15;
let searchTimeout;
let autoRefreshIntervalId = null;

// --- Utility Functions ---

/** Pauses execution for a specified duration. */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/** Formats a value as a US dollar currency string. */
const formatCurrency = (value) => {
  const num = parseFloat(value);
  if (isNaN(num) || num === 0) return '$0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
};

/** Formats large numbers with suffixes (K, M, B, T). */
const formatLargeNumber = (value) => {
  const num = parseFloat(value);
  if (isNaN(num)) return 'N/A';
  const suffixes = ["", "K", "M", "B", "T"];
  let suffixNum = 0;
  let tempNum = num;
  while (tempNum >= 1000 && suffixNum < suffixes.length - 1) {
    tempNum /= 1000;
    suffixNum++;
  }
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(tempNum) + suffixes[suffixNum];
};

/** Displays a message in the message area. */
const showMessage = (message, type = 'info') => {
  const messageArea = document.getElementById('message-area');
  messageArea.textContent = message;

  let baseClasses = 'text-center p-3 mb-4 rounded-xl text-sm font-medium transition duration-300';
  if (type === 'error') {
    messageArea.className = baseClasses + ' bg-red-100 text-red-700 shadow-lg border border-red-200';
    messageArea.classList.remove('hidden');
  } else if (type === 'loading') {
    messageArea.className = baseClasses + ' bg-blue-100 text-blue-700 shadow-lg border border-blue-200';
    messageArea.classList.remove('hidden');
  } else if (type === 'success') {
    messageArea.className = baseClasses + ' bg-green-100 text-green-700 shadow-lg border border-green-200';
    messageArea.classList.remove('hidden');
    setTimeout(() => messageArea.classList.add('hidden'), 5000); // Hide after 5 seconds
  } else { // info
    messageArea.className = baseClasses + ' bg-gray-100 text-gray-700 shadow-lg border border-gray-200';
    messageArea.classList.remove('hidden');
  }
};

/**
 * Tries to fetch data from a given URL with exponential backoff.
 * @param {string} url - The API endpoint URL.
 * @returns {Promise<Object>} The response data.
 */
const fetchDataWithRetry = async (url) => {
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const response = await axios.get(url);
      return response.data;
    } catch (error) {
      if (i === MAX_RETRIES - 1) {
        console.error(`Fetch failed after ${MAX_RETRIES} retries for URL: ${url}`, error);
        throw new Error('Failed to fetch data after multiple retries.');
      }
      const delay = BASE_DELAY_MS * Math.pow(2, i);
      console.warn(`Attempt ${i + 1} failed. Retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }
};

// --- Data Fetching and Rendering ---

/** Fetches coin and global data and updates the state. */
const fetchCoinData = async (isRefresh = false) => {
  try {
    if (!isRefresh) {
      showMessage('Fetching initial market data...', 'loading');
    }

    // Fetch both data sets concurrently
    const [coinData, globalData] = await Promise.all([
      fetchDataWithRetry(COINLORE_API_URL),
      fetchDataWithRetry(COINLORE_GLOBAL_URL)
    ]);

    const oldPrices = allCoins.reduce((acc, coin) => {
      acc[coin.id] = parseFloat(coin.price_usd);
      return acc;
    }, {});

    allCoins = coinData.data || [];
    renderGlobalStats(globalData.data ? globalData.data[0] : {});

    // Re-render the visible list
    updateVisibleCoins(oldPrices);

    if (!isRefresh) {
      showMessage('Market data loaded successfully.', 'success');
    }
    feather.replace(); // Replace icon placeholders
  } catch (error) {
    showMessage('Error fetching market data. Please check the console for details.', 'error');
    console.error('API Fetch Error:', error);
  }
};

/** Renders the global market data. */
const renderGlobalStats = (data) => {
  const stats = [{
    label: 'Active Coins',
    value: data.coins_count,
    icon: 'trending-up'
  }, {
    label: 'Total Market Cap',
    value: formatCurrency(data.total_mcap),
    icon: 'dollar-sign'
  }, {
    label: '24h Volume',
    value: formatCurrency(data.total_volume),
    icon: 'bar-chart-2'
  }, {
    label: 'BTC Dominance',
    value: `${parseFloat(data.btc_d).toFixed(2)}%`,
    icon: 'percent'
  }];

  const globalStatsEl = document.getElementById('global-stats');
  globalStatsEl.innerHTML = stats.map(stat => `
        <div class="bg-white p-5 rounded-xl shadow-lg flex items-center space-x-4 border border-gray-100">
          <div class="p-3 rounded-full bg-indigo-100 text-indigo-600">
            <i data-feather="${stat.icon}" class="w-6 h-6"></i>
          </div>
          <div>
            <p class="text-sm font-medium text-gray-500">${stat.label}</p>
            <p class="text-xl font-bold text-gray-800">${stat.value || 'N/A'}</p>
          </div>
        </div>
      `).join('');
};

/** Filters and paginates the full coin list. */
const updateVisibleCoins = (oldPrices = {}) => {
  // 1. Apply Search Filter
  const query = document.getElementById('search-input').value.toLowerCase().trim();
  const filteredCoins = allCoins.filter(coin =>
    coin.name.toLowerCase().includes(query) ||
    coin.symbol.toLowerCase().includes(query)
  );

  // 2. Client-Side Pagination
  const totalItems = filteredCoins.length;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

  // Adjust current page if it's out of bounds after filtering
  if (currentPage > totalPages && totalPages > 0) {
    currentPage = totalPages;
  } else if (currentPage < 1) {
    currentPage = 1;
  }

  const start = (currentPage - 1) * ITEMS_PER_PAGE;
  const end = start + ITEMS_PER_PAGE;
  visibleCoins = filteredCoins.slice(start, end);

  renderCoins(visibleCoins, oldPrices);
  updatePaginationControls(totalPages, totalItems);
};

/** Renders the coins based on the current view mode. */
const renderCoins = (coins, oldPrices) => {
  const listContainer = document.getElementById('crypto-list');
  if (coins.length === 0) {
    listContainer.innerHTML = '<p class="text-center text-gray-500 p-8">No cryptocurrencies match your search criteria.</p>';
    return;
  }

  if (currentView === 'table') {
    renderTable(coins, oldPrices, listContainer);
  } else {
    renderCards(coins, oldPrices, listContainer);
  }
};

/** Renders the data in a responsive table. */
const renderTable = (coins, oldPrices, container) => {
  container.innerHTML = `
        <table class="min-w-full divide-y divide-gray-200">
          <thead>
            <tr class="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <th class="px-6 py-3 rounded-tl-xl">Rank</th>
              <th class="px-6 py-3">Name</th>
              <th class="px-6 py-3">Symbol</th>
              <th class="px-6 py-3">Price (USD)</th>
              <th class="px-6 py-3">24h Change (%)</th>
              <th class="px-6 py-3 rounded-tr-xl">Market Cap</th>
            </tr>
          </thead>
          <tbody id="crypto-table-body" class="bg-white divide-y divide-gray-100">
            ${coins.map(coin => {
    const priceClass = getPriceChangeClass(coin.price_usd, oldPrices[coin.id]);
    const changeClass = parseFloat(coin.percent_change_24h) >= 0 ? 'text-green-600' : 'text-red-600';
    return `
                <tr class="hover:bg-gray-50 cursor-pointer transition duration-150" onclick="showCoinDetails('${coin.id}')">
                  <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${coin.rank}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-800">${coin.name}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${coin.symbol}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 ${priceClass}">${formatCurrency(coin.price_usd)}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm font-medium ${changeClass}">${parseFloat(coin.percent_change_24h).toFixed(2)}%</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${formatLargeNumber(coin.market_cap_usd)}</td>
                </tr>
              `;
  }).join('')}
          </tbody>
        </table>
      `;
};

/** Renders the data in a card/grid view. */
const renderCards = (coins, oldPrices, container) => {
  container.innerHTML = `
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 p-4">
          ${coins.map(coin => {
    const priceClass = getPriceChangeClass(coin.price_usd, oldPrices[coin.id]);
    const changeClass = parseFloat(coin.percent_change_24h) >= 0 ? 'text-green-600' : 'text-red-600';
    const changeIcon = parseFloat(coin.percent_change_24h) >= 0 ? 'arrow-up-right' : 'arrow-down-right';
    return `
              <div class="bg-white p-6 rounded-2xl shadow-xl border border-gray-100 card-glow cursor-pointer" onclick="showCoinDetails('${coin.id}')">
                <div class="flex justify-between items-start mb-3">
                  <h4 class="text-xl font-extrabold text-gray-900">${coin.name} (${coin.symbol})</h4>
                  <span class="text-xs font-bold px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full">#${coin.rank}</span>
                </div>
                
                <p class="text-3xl font-bold text-gray-800 my-2 ${priceClass}">${formatCurrency(coin.price_usd)}</p>

                <div class="flex justify-between items-center text-sm mt-4 pt-4 border-t border-gray-100">
                  <div class="flex items-center space-x-1 ${changeClass} font-semibold">
                    <i data-feather="${changeIcon}" class="w-4 h-4"></i>
                    <span>${parseFloat(coin.percent_change_24h).toFixed(2)}% (24h)</span>
                  </div>
                  <div class="text-right">
                    <p class="text-xs text-gray-500">M. Cap</p>
                    <p class="font-medium text-sm">${formatLargeNumber(coin.market_cap_usd)}</p>
                  </div>
                </div>
              </div>
            `;
  }).join('')}
        </div>
      `;
};

/** Determines the price animation class. */
const getPriceChangeClass = (newPriceStr, oldPrice) => {
  if (!oldPrice || isNaN(oldPrice)) return '';
  const newPrice = parseFloat(newPriceStr);
  if (newPrice > oldPrice) {
    return 'animate-price-up';
  } else if (newPrice < oldPrice) {
    return 'animate-price-down';
  }
  return '';
};

/** Updates the pagination buttons and indicator. */
const updatePaginationControls = (totalPages, totalItems) => {
  const prevButton = document.getElementById('prev-button');
  const nextButton = document.getElementById('next-button');
  const pageIndicator = document.getElementById('page-indicator');

  prevButton.disabled = currentPage === 1;
  nextButton.disabled = currentPage >= totalPages || totalItems === 0;

  if (totalItems === 0) {
    pageIndicator.textContent = 'No results';
  } else {
    pageIndicator.textContent = `Page ${currentPage} of ${totalPages}`;
  }
};

// --- Interaction Handlers ---

/** Toggles between table and card view. */
const toggleView = (view) => {
  currentView = view;
  localStorage.setItem('viewMode', view);

  const tableBtn = document.getElementById('view-table');
  const cardsBtn = document.getElementById('view-cards');

  // Update button styles
  [tableBtn, cardsBtn].forEach(btn => {
    btn.classList.remove('bg-white', 'text-indigo-600', 'shadow-md');
    btn.classList.add('text-gray-700', 'hover:bg-gray-300', 'font-medium');
  });

  if (view === 'table') {
    tableBtn.classList.add('bg-white', 'text-indigo-600', 'shadow-md', 'font-semibold');
    tableBtn.classList.remove('font-medium', 'hover:bg-gray-300');
  } else {
    cardsBtn.classList.add('bg-white', 'text-indigo-600', 'shadow-md', 'font-semibold');
    cardsBtn.classList.remove('font-medium', 'hover:bg-gray-300');
  }

  // Re-render
  renderCoins(visibleCoins);
  feather.replace();
};

/** Handles the search input with debounce. */
const handleSearch = () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    currentPage = 1; // Reset to first page on new search
    updateVisibleCoins();
    feather.replace();
  }, 300); // Debounce for 300ms
};

/** Event handler for the Previous button. */
const goToPreviousPage = () => {
  if (currentPage > 1) {
    currentPage--;
    updateVisibleCoins();
    feather.replace();
  }
};

/** Event handler for the Next button. */
const goToNextPage = () => {
  currentPage++;
  updateVisibleCoins();
  feather.replace();
};

/** Displays the modal with coin details. */
const showCoinDetails = (coinId) => {
  const coin = allCoins.find(c => c.id === coinId);
  if (!coin) return;

  document.getElementById('modal-coin-name').textContent = `${coin.name} (${coin.symbol})`;
  document.getElementById('modal-coin-rank').textContent = coin.rank;
  document.getElementById('modal-coin-price').textContent = formatCurrency(coin.price_usd);
  document.getElementById('modal-coin-marketcap').textContent = formatLargeNumber(coin.market_cap_usd);
  document.getElementById('modal-coin-supply').textContent = formatLargeNumber(coin.tsupply);

  const changeEl = document.getElementById('modal-coin-change');
  const change7dEl = document.getElementById('modal-coin-7d');

  const change24h = parseFloat(coin.percent_change_24h).toFixed(2);
  const change7d = parseFloat(coin.percent_change_7d).toFixed(2);

  // 24h Change Styling
  changeEl.textContent = `${change24h}%`;
  changeEl.className = `text-xl font-bold mt-1 ${change24h >= 0 ? 'text-green-600' : 'text-red-600'}`;

  // 7d Change Styling
  change7dEl.textContent = `${change7d}%`;
  change7dEl.className = `font-semibold ${change7d >= 0 ? 'text-green-600' : 'text-red-600'}`;


  const modal = document.getElementById('coin-detail-modal');
  modal.classList.remove('hidden');
  document.getElementById('modal-container').classList.remove('scale-95');
  document.getElementById('modal-container').classList.add('scale-100');
};

/** Closes the modal. */
const closeModal = (event) => {
  if (event && event.target.id !== 'coin-detail-modal') return; // Prevent closing if clicking inside the modal content

  const modal = document.getElementById('coin-detail-modal');
  document.getElementById('modal-container').classList.add('scale-95');
  document.getElementById('modal-container').classList.remove('scale-100');

  setTimeout(() => {
    modal.classList.add('hidden');
  }, 300); // Delay hiding to match transition
};

/** Starts the auto-refresh loop. */
const startAutoRefresh = () => {
  if (autoRefreshIntervalId) {
    clearInterval(autoRefreshIntervalId);
  }
  autoRefreshIntervalId = setInterval(() => {
    console.log('Auto-refreshing data...');
    fetchCoinData(true);
  }, AUTO_REFRESH_INTERVAL);
};

/** Initializes the application. */
const initializeApp = () => {
  // 1. Initial data fetch
  fetchCoinData();

  // 2. Set up event listeners
  document.getElementById('prev-button').addEventListener('click', goToPreviousPage);
  document.getElementById('next-button').addEventListener('click', goToNextPage);
  document.getElementById('search-input').addEventListener('input', handleSearch);

  // 3. Set initial view
  toggleView(currentView);

  // 4. Start auto-refresh
  startAutoRefresh();
};

// Make functions globally accessible for inline HTML calls (onclick/onkeyup)
window.handleSearch = handleSearch;
window.goToPreviousPage = goToPreviousPage;
window.goToNextPage = goToNextPage;
window.toggleView = toggleView;
window.showCoinDetails = showCoinDetails;
window.closeModal = closeModal;

// Initialize listeners and fetch the first page
document.addEventListener('DOMContentLoaded', initializeApp);

// import axios from 'axios';

// const setCryptos = (cryptos) => {
//   let innerHTML = '';
//   cryptos.forEach((crypto) => {
//     innerHTML += `<tr key=${crypto.id}>
//       <td>${crypto.rank}</td>
//       <td>${crypto.name}</td>
//       <td>${crypto.symbol}</td>
//       <td>${parseFloat(crypto.price_usd).toFixed(2)}</td>
//       <td>${parseFloat(crypto.percent_change_24h).toFixed(4)}</td>
//     </tr>`;
//   });
//   document.getElementById('crypto-table-body').innerHTML = innerHTML;
// };

// const fetchData = async () => {
//   try {
//     const result = await axios.get('https://api.coinlore.net/api/tickers/');
//     console.log(result);
//     setCryptos(result.data.data);
//   } catch (error) {
//     console.error('Error fetching data:', error);
//     console.error('Error details:', error);
//   }
// };

// fetchData();

// import axios from 'axios';

// // Configuration
// const ITEMS_PER_PAGE = 10; // Define how many items to show per page
// let currentPage = 1;      // Current page state

// /**
//  * Renders the cryptocurrency data to the HTML table.
//  * @param {Array} cryptos - The list of cryptocurrency objects for the current page.
//  */
// const setCryptos = (cryptos) => {
//   let innerHTML = '';
//   cryptos.forEach((crypto) => {
//     innerHTML += `<tr key=${crypto.id}>
//             <td>${crypto.rank}</td>
//             <td>${crypto.name}</td>
//             <td>${crypto.symbol}</td>
//             <td>$${parseFloat(crypto.price_usd).toFixed(2)}</td>
//             <td>${parseFloat(crypto.percent_change_24h).toFixed(4)}%</td>
//         </tr>`;
//   });
//   document.getElementById('crypto-table-body').innerHTML = innerHTML;
// };

// /**
//  * Handles the logic for updating the pagination buttons (Previous/Next).
//  * @param {number} currentStart - The starting offset of the current data.
//  * @param {number} limit - The number of items per page.
//  */
// const updatePaginationControls = (currentStart, limit) => {
//   const prevButton = document.getElementById('prev-button');
//   const nextButton = document.getElementById('next-button');

//   // Enable/Disable Previous button
//   if (prevButton) {
//     prevButton.disabled = currentStart === 0;
//   }

//   // Since the API doesn't return total count, we optimistically enable 'Next'
//   // and let the next fetch determine if it was the last page (by returning less than 'limit').
//   // If the API returns exactly 'limit', there might be more data.
//   // If it returns less than 'limit', it's the last page.
//   // For simplicity, we assume if we got a full page, there might be more.
//   if (nextButton) {
//     nextButton.disabled = false; // Always enabled unless we know we're at the end
//   }

//   // Update current page display
//   const pageIndicator = document.getElementById('page-indicator');
//   if (pageIndicator) {
//     pageIndicator.textContent = `Page ${currentPage}`;
//   }
// };

// /**
//  * Fetches data from the CoinLore API with pagination parameters.
//  * @param {number} page - The page number to fetch.
//  */
// const fetchData = async (page = 1) => {
//   currentPage = page;
//   const start = (page - 1) * ITEMS_PER_PAGE;
//   const limit = ITEMS_PER_PAGE;

//   try {
//     // Constructing the API URL with pagination parameters
//     const url = `https://api.coinlore.net/api/tickers/?start=${start}&limit=${limit}`;
//     const result = await axios.get(url);

//     const cryptos = result.data.data;
//     setCryptos(cryptos);

//     // Check if this was the last page returned by the API
//     if (cryptos.length < limit) {
//       const nextButton = document.getElementById('next-button');
//       if (nextButton) {
//         nextButton.disabled = true;
//       }
//     } else {
//       const nextButton = document.getElementById('next-button');
//       if (nextButton) {
//         nextButton.disabled = false;
//       }
//     }

//     updatePaginationControls(start, limit);

//   } catch (error) {
//     console.error('Error fetching data:', error);
//     // Display an error message to the user if needed
//   }
// };

// /**
//  * Event handler for the Previous button.
//  */
// const goToPreviousPage = () => {
//   if (currentPage > 1) {
//     fetchData(currentPage - 1);
//   }
// };

// /**
//  * Event handler for the Next button.
//  */
// const goToNextPage = () => {
//   fetchData(currentPage + 1);
// };

// // Initialize listeners and fetch the first page
// document.addEventListener('DOMContentLoaded', () => {
//   document.getElementById('prev-button').addEventListener('click', goToPreviousPage);
//   document.getElementById('next-button').addEventListener('click', goToNextPage);
//   fetchData(1);
// });

