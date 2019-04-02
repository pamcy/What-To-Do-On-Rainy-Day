const puppeteer = require('puppeteer');
const fs = require('fs');
const axios = require('axios');
const CREDS = require('../../creds');

async function getCurrentDate() {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const next30Days = new Date(now.setDate(now.getDate() + 30)).toISOString().split('T')[0];

  return { today, next30Days };
}

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

async function getTotalPages(page) {
  const result = await page.evaluate(() => {
    const pagination_bar = document.querySelector('[class^=PaginationBar__Pagination]');
    const total_pages = pagination_bar.childNodes.length;

    return total_pages;
  });

  console.log(`Total ${result} pages`);

  return result;
}

/*
 * 解決 lazyloading 部份內容還未顯示問題，讓網頁自己滾動
 * https://stackoverflow.com/questions/51529332/puppeteer-scroll-down-until-you-cant-anymore
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
      }, 100);
    });
  });
}

async function scrapeNiceday() {
  const browser = await puppeteer.launch();
  const storage = [];
  let result;

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

      for (let j = 1; j <= total_pages; j++) {
        await page.goto(`${search_urls[i]}&page=${j}`);
        await autoScroll(page);

        result = await page.evaluate(() => {
          const items = [...document.querySelectorAll('[class^=CardGellory__StyledProductCard]')];

          const category = document.querySelector('[class^=search__CategoryBannerTitle]').innerText.trim();

          return items.map((item) => {
            const title = item.querySelector('[class^=ProductCard__Title]').innerText.trim();
            const description = item.querySelector('[class^=ProductCard__Description]').innerText.trim();

            const link = item.getAttribute('href');
            const img = item.querySelector('img').getAttribute('src');
            const price = item.querySelector('[class^=ProductCard__Price]').innerText.trim();

            return {
              category, title, description, link, img, price,
            };
          });
        });

        // await sendDataToAirtable(...result);

        storage.push(...result);

        console.log(`page ${j} is done`);
      }
    }

    await browser.close();

    fs.writeFile('src/data/niceday.json', JSON.stringify(storage), (error) => {
      if (error) throw error;
      console.log('JSON file saved');
    });
  } catch (e) {
    console.error('🚫 Something when wrong when scraping: ', e);
    await browser.close();
  }
}

// async function sendDataToAirtable(data) {
//   const airtable_api = 'https://api.airtable.com/v0/appQuTk2v5mu4Awgc/Table%201?api_key=';

//   axios.post(`${airtable_api}${CREDS.airtableKey}`, {
//     fields: data
//   })
//   .then(function (response) {
//     console.log(response);
//   })
//   .catch(function (error) {
//     console.error(error);
//   });
// }


(async () => {
  try {
    await scrapeNiceday();
  } catch (e) {
    console.error('🚫  Error : ', e);
  }
})();
