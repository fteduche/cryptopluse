// Constants for CoinLore API
const COINLORE_API_URL = 'https://api.coinlore.net/api/tickers/?start=0&limit=100';
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 500; // 0.5 seconds

// Global State
let allCoins = [];
let visibleCoins = [];
let currentView = 'table';

// --- Helper Functions ---
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const formatCurrency = (value) => {
  const num = parseFloat(value);
  if (isNaN(num)) return 'N/A';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
};

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

const showMessage = (message, type) => {
  const messageArea = document.getElementById('message-area');
  messageArea.textContent = message;
  messageArea.className = 'text-center p-3 mb-4 rounded-xl text-sm transition duration-300';
  messageArea.classList.remove('hidden', 'bg-red-100', 'text-red-700', 'bg-blue-100', 'text-blue-700');
  if (type === 'error') {
    messageArea.classList.add('bg-red-100', 'text-red-700');
  } else {
    messageArea.classList.add('bg-blue-100', 'text-blue-700');
  }
  messageArea.style.display = 'block';
};

// --- Data Management & Rendering ---
const renderTable = (coins) => {
  const tableBody = document.getElementById('crypto-table-body');
  let innerHTML = '';
  if (coins.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-gray-500">No matching cryptocurrencies found.</td></tr>`;
    return;
  }
  coins.forEach((crypto) => {
    const changeValue = parseFloat(crypto.percent_change_24h);
    const changeClass = changeValue > 0 ? 'text-green-600' : changeValue < 0 ? 'text-red-600' : 'text-gray-500';
    innerHTML += `
            <tr id="row-${crypto.id}" class="hover:bg-indigo-50 cursor-pointer transition duration-150" onclick="showCoinDetail('${crypto.id}')">
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${crypto.rank}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${crypto.name}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${crypto.symbol}</td>
                <td id="price-${crypto.id}" class="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold text-gray-900">${formatCurrency(crypto.price_usd)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">${formatLargeNumber(crypto.market_cap_usd)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-right ${changeClass}">${changeValue.toFixed(2)}%</td>
            </tr>
        `;
  });
  tableBody.innerHTML = innerHTML;

  const cardContainer = document.getElementById('card-container');
  let cardHTML = '';
  coins.forEach((crypto) => {
    cardHTML += `
            <div class="max-w-sm rounded overflow-hidden shadow-lg bg-white mb-4">
                <div class="px-6 py-4">
                    <div class="font-bold text-xl mb-2">${crypto.name} (${crypto.symbol})</div>
                    <p class="text-gray-700 text-base">Rank: ${crypto.rank}</p>
                    <p class="text-gray-700 text-base">Price: ${formatCurrency(crypto.price_usd)}</p>
                    <p class="text-gray-700 text-base">Market Cap: ${formatLargeNumber(crypto.market_cap_usd)}</p>
                </div>
            </div>
        `;
  });
  cardContainer.innerHTML = cardHTML;
};

const fetchAssets = async (attempt = 0) => {
  showMessage(`Loading top 100 cryptocurrencies (Attempt ${attempt + 1}/${MAX_RETRIES})...`, 'info');
  try {
    const response = await fetch(COINLORE_API_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const result = await response.json();
    allCoins = result.data;
    visibleCoins = allCoins.slice(0, 100);
    renderTable(visibleCoins);
    document.getElementById('message-area').style.display = 'none';
  } catch (error) {
    console.error(`Error fetching initial data on attempt ${attempt + 1}:`, error);
    if (attempt < MAX_RETRIES - 1) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt);
      await sleep(delay);
      fetchAssets(attempt + 1);
    } else {
      showMessage(`Failed to load data after ${MAX_RETRIES}  attempts. Error: ${error.message}. Please refresh.`, 'error');
    }
  }
};

const showCoinDetail = (coinId) => {
  const coin = allCoins.find(c => c.id === coinId);
  if (!coin) return;
  document.getElementById('modal-coin-name').textContent = `${coin.name} (${coin.symbol})`;
  document.getElementById('modal-coin-rank').textContent = coin.rank;
  document.getElementById('modal-coin-price').textContent = formatCurrency(coin.price_usd);
  document.getElementById('modal-coin-marketcap').textContent = formatLargeNumber(coin.market_cap_usd);
  document.getElementById('modal-coin-supply').textContent = formatLargeNumber(coin.circulating_supply);
  const changeValue = parseFloat(coin.percent_change_24h);
  const changeEl = document.getElementById('modal-coin-change');
  changeEl.textContent = `${changeValue.toFixed(2)}%`;
  changeEl.classList.remove('text-green-600', 'text-red-600');
  if (changeValue > 0) {
    changeEl.classList.add('text-green-600');
  } else if (changeValue < 0) {
    changeEl.classList.add('text-red-600');
  } else {
    changeEl.classList.add('text-gray-600');
  }
  const modalOverlay = document.getElementById('detail-modal-overlay');
  modalOverlay.classList.remove('opacity-0', 'pointer-events-none');
  modalOverlay.classList.add('opacity-100');
  document.getElementById('detail-modal').classList.remove('scale-95');
  document.getElementById('detail-modal').classList.add('scale-100');
};

const hideCoinDetail = () => {
  const modalOverlay = document.getElementById('detail-modal-overlay');
  modalOverlay.classList.remove('opacity-100');
  modalOverlay.classList.add('opacity-0', 'pointer-events-none');
  document.getElementById('detail-modal').classList.remove('scale-100');
  document.getElementById('detail-modal').classList.add('scale-95');
};

const handleSearch = (event) => {
  const query = event.target.value.toLowerCase();
  visibleCoins = allCoins.filter(coin => coin.name.toLowerCase().includes(query) || coin.symbol.toLowerCase().includes(query));
  renderTable(visibleCoins);
};

const toggleView = () => {
  const tableContainer = document.getElementById('table-container');
  const cardContainer = document.getElementById('card-container');
  const toggleButton = document.getElementById('toggle-view-button');

  if (currentView === 'table') {
    tableContainer.classList.add('hidden');
    cardContainer.classList.remove('hidden');
    toggleButton.textContent = 'Switch to Table View';
    currentView = 'card';
  } else {
    tableContainer.classList.remove('hidden');
    cardContainer.classList.add('hidden');
    toggleButton.textContent = 'Switch to Card View';
    currentView = 'table';
  }
};

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('search-input').addEventListener('input', handleSearch);
  document.getElementById('close-modal-btn').addEventListener('click', hideCoinDetail);
  document.getElementById('detail-modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'detail-modal-overlay') {
      hideCoinDetail();
    }
  });
  document.getElementById('toggle-view-button').addEventListener('click', toggleView);
  fetchAssets();
});


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

