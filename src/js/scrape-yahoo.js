const puppeteer = require('puppeteer');
const axios = require('axios');
require('dotenv').config();

/**
 * 建立爬文網址
 * @returns {Array} 所有要爬項目的網址
 */
async function generateURLs() {
  const categories = {
    thisWeek: 'https://movies.yahoo.com.tw/movie_thisweek.html',
    inTheater: 'https://movies.yahoo.com.tw/movie_intheaters.html',
  };

  return Object.values(categories);
}

/**
 * 取得頁面總共頁數
 * @param {Object} page Puppeteer Page Instance
 * @return {Number} 總共頁數
 */
async function getTotalPages(page) {
  const result = await page.evaluate(() => {
    const default_page_number = 1;
    const pagination_bar = document.querySelector('.page_numbox');

    if (!pagination_bar) {
      return default_page_number;
    }

    const next_page_btn = pagination_bar.querySelector('.nexttxt');
    const last_page_number = next_page_btn.previousElementSibling.textContent;

    return last_page_number;
  });

  console.log(`Total ${result} page(s)`);

  return result;
}

/**
 * 爬內容
 * @param {Object} page Puppeteer Page instance
 * @param {Array} url 爬文網址
 * @param {Number} pageNum 第幾頁
 * @returns {Array} 爬回來的內容包成 Object
 */
async function crawlPageContent(page, url, pageNum) {
  await page.goto(`${url}?page=${pageNum}`);

  const result = await page.evaluate(() => {
    const category = document.querySelector('.title > h1').innerText;
    const items = [...document.querySelectorAll('.release_list li')];

    return items.map((item) => {
      const title_tw = item.querySelector('.release_movie_name > a').innerText;
      const title_en = item.querySelector('.release_movie_name .en').innerText;
      const title = `${title_tw} ${title_en}`;
      const description = item.querySelector('.release_text').innerText.replace('詳全文', '');
      const link = item.querySelector('.release_foto > a').getAttribute('href');
      const img = item.querySelector('.release_foto > a img').getAttribute('src');
      const date = item.querySelector('.release_movie_time').innerText.replace(/^\D+/g, '');

      return {
        category,
        title,
        description,
        link,
        img,
        date,
      };
    });
  });

  console.log(`page ${pageNum} is done`);

  return result;
}

/**
 * API 將資料寫入 Airtable DB
 * @param {Array} data 所有爬文資料
 */
async function saveDataToAirtable(data) {
  const airtable_api_url = 'https://api.airtable.com/v0/appQuTk2v5mu4Awgc/Table%201?api_key=';

  axios.post(`${airtable_api_url}${process.env.AIRTABLE_KEY}`, {
    fields: data,
  })
    .catch(error => console.error(error));
}

/**
 * 將所有爬文資料傳入 function saveDataToAirtable
 * @param {Array} items 所有爬文資料
 */
async function sendDataToAirtable(items) {
  items.forEach(item => saveDataToAirtable(item));
}

/**
 * 爬蟲 Controller
 */
async function createYahooSpider() {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  const storage = [];

  await page.setViewport({
    width: 1280,
    height: 800,
  });

  try {
    const urls = await generateURLs();

    for (let i = 0; i < urls.length; i++) {
      await page.goto(urls[i]);

      console.log(`Current URL: ${urls[i]}`);

      const total_pages = await getTotalPages(page);

      for (let pageNum = 1; pageNum <= total_pages; pageNum++) {
        const content = await crawlPageContent(page, urls[i], pageNum);
        storage.push(...content);
      }
    }
  } catch (e) {
    console.error('🚫 Something when wrong when scraping: ', e);
  } finally {
    await browser.close();
    await sendDataToAirtable(storage);

    console.log(`There are ${storage.length} items uploaded into Airtable.`);
  }
}

(async () => {
  try {
    await createYahooSpider();
  } catch (e) {
    console.error('🚫  Error : ', e);
  }
})();
