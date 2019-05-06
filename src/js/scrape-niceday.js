const puppeteer = require('puppeteer');
const https = require('https');
const axios = require('axios');
require('dotenv').config();

/**
 * 取得日期供網址參數用
 * @returns {Object} 今天和 30 天後的日期
 */
async function getCurrentDate() {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const next30Days = new Date(now.setDate(now.getDate() + 30)).toISOString().split('T')[0];

  return { today, next30Days };
}

/**
 * 建立參數生成爬文網址
 * @param {Number} [price = 3000] 預設價格 3000 元以內的體驗
 * @returns {Array} 所有體驗類別的爬文網址
 */
async function generateURLs(price = 3000) {
  const date = await getCurrentDate();

  let url;
  const urls = [];
  const categories = {
    art: 12,
    cooking: 8,
    outdoors: 16,
    lifestyle: 341,
  };

  // Creates an array that contains the values in an object.
  const category_numbers = Object.values(categories);

  category_numbers.forEach((number) => {
    url = `https://play.niceday.tw/category/search?query=&keyword=&category=${number}&sort=price_asc&area=223&tags=none&price_from=0&price_to=${price}&start_date=${date.today}&end_date=${date.next30Days}`;

    urls.push(url);
  });

  return urls;
}

/**
 * 取得體驗類別的總共頁數
 * @param {Object} page Puppeteer Page instance
 * @return {Number} 總共頁數
 */
async function getTotalPages(page) {
  const result = await page.evaluate(() => {
    const pagination_bar = document.querySelector('[class^=PaginationBar__Pagination]');
    const total_pages = pagination_bar.childNodes[pagination_bar.childNodes.length - 1].textContent;

    return total_pages;
  });

  console.log(`Total ${result} pages`);

  return result;
}

/**
 * 解決 lazyloading 部份內容還未顯示問題，讓網頁自己滾動
 * @link https://stackoverflow.com/questions/51529332/puppeteer-scroll-down-until-you-cant-anymore
 * @param {Object} page Puppeteer Page instance
 */
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let current_height = 0;
      const distance = 100; // 每一次向下滾動的距離

      const timer = setInterval(() => {
        const body_height = document.body.scrollHeight;

        window.scrollBy(0, distance);
        current_height += distance;

        if (current_height >= body_height) {
          clearInterval(timer);
          resolve(); // 將 Promise 對象設置為 resolve()
        }
      }, 200);
    });
  });
}

/**
 * 爬內容
 * @param {Object} page Puppeteer Page instance
 * @param {Array} url 體驗類別的網址
 * @param {Number} pageNum 第幾頁
 * @returns {Array} 爬回來的內容包成 Object
 */
async function crawlPageContent(page, url, pageNum) {
  await page.goto(`${url}&page=${pageNum}`);
  await autoScroll(page);

  const result = await page.evaluate(() => {
    const items = [...document.querySelectorAll('[class^=CardGellory__StyledProductCard]')];

    const category = document.querySelector('[class^=search__CategoryBannerTitle]').innerText.trim();

    return items.map((item) => {
      const source = 'niceday';
      const prefix_url = '//play.niceday.tw';
      const title = item.querySelector('[class^=ProductCard__Title]').innerText.trim();
      const description = item.querySelector('[class^=ProductCard__Description]').innerText.trim();
      const link = item.getAttribute('href');
      const img = item.querySelector('img')
        ? item.querySelector('img').getAttribute('src')
        : '';
      const price = item.querySelector('[class^=ProductCard__Price]').innerText.trim();

      return {
        source, prefix_url, category, title, description, link, img, price,
      };
    });
  });

  console.log(`page ${pageNum} is done`);

  return result;
}

/**
 * 透過 graphql api 上傳
 * @param {Array} chunk
 */
async function upload(chunk) {
  const agent = new https.Agent({
    rejectUnauthorized: false,
  });

  // JSON.stringify without quotes on properties
  // @link https://stackoverflow.com/questions/11233498/json-stringify-without-quotes-on-properties
  const query_string = JSON.stringify(chunk)
    .replace(/\"([^(\")"]+)\":/g, "$1:");
  console.log(`
        mutation {
          insertProducts(
            data: ${query_string}
          ) {
            affected_rows
          }
        }
      `);
  axios({
    httpsAgent: agent,
    url: 'https://local.rainy-to-do-app-api/graphql',
    method: 'post',
    data: {
      query: `
        mutation {
          insertProducts(
            data: ${query_string}
          ) {
            affected_rows
          }
        }
      `,
    },
  }).then((result) => {
    console.log(result.data);
  }).catch(error => console.error(error));
}

/**
 * 將大筆資料切分 chunk 後上傳
 * @param {Array} items 所有爬文資料
 */
async function bulkUpload(items) {
  while (items.length > 0) {
    const chunk = items.splice(0, 50); // 每次上傳 50 筆資料 (約 30k 內)
    upload(chunk);
  }
}

/**
 * 爬蟲 Controller
 */
async function createNicedaySpider() {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const storage = [];

  try {
    const page = await browser.newPage();

    await page.setViewport({
      width: 1280,
      height: 800,
    });

    const search_urls = await generateURLs();

    for (let i = 0; i < search_urls.length; i++) {
      await page.goto(search_urls[i]);

      console.log(`Current URL: ${search_urls[i]}`);

      const total_pages = await getTotalPages(page);

      for (let pageNum = 1; pageNum <= total_pages; pageNum++) {
        const content = await crawlPageContent(page, search_urls[i], pageNum);
        storage.push(...content);
      }
    }
  } catch (e) {
    console.error('🚫 Something when wrong when scraping: ', e);
  } finally {
    await browser.close();

    console.log(`Ready to upload ${storage.length} items`);
    await bulkUpload(storage);

    console.log(`There are ${storage.length} items uploaded into Airtable.`);
  }
}

(async () => {
  try {
    await createNicedaySpider();
  } catch (e) {
    console.error('🚫  Error : ', e);
  }
})();
