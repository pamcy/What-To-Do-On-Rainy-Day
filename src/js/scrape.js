const puppeteer = require('puppeteer');
const fs = require('fs');

/*
 * 解決 lazyloading 問題，讓網頁自己滾動
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
  const browser = await puppeteer.launch({
    headless: true,
  });
  const page = await browser.newPage();

  try {
    await page.setViewport({
      width: 1280,
      height: 800,
    });

    await page.goto('https://play.niceday.tw/category/search?query=&keyword=&category=12&page=1&sort=price_asc&area=223&tags=none&price_from=0&price_to=3000&start_date=2019-03-27&end_date=2019-04-27');

    await autoScroll(page);

    const result = await page.evaluate(() => {
      const items = [...document.querySelectorAll('.CardGellory__StyledProductCard-rj4q7h-0.fGdaHg.ProductCard__A-sc-1vcdm7s-0.cXwraG')];

      return items.map((item) => {
        const title = item.querySelector('.ProductCard__Title-sc-1vcdm7s-4.beFbhb').innerText.trim();
        const description = item.querySelector('.ProductCard__Description-sc-1vcdm7s-6.kCzSOS').innerText.trim();
        const link = item.getAttribute('href');
        const img = item.querySelector('img').getAttribute('src');
        const price = item.querySelector('.ProductCard__Price-sc-1vcdm7s-3.jmhEVM').innerText.trim();

        return {
          title, description, link, img, price,
        };
      });
    });

    await browser.close();

    fs.writeFile('src/data/niceday-art.json', JSON.stringify(result), (error) => {
      if (error) throw error;
      console.log('JSON file saved');
    });
  } catch (e) {
    console.error('🚫  Error : ', e);
    await browser.close();
  }
}

(async () => {
  try {
    await scrapeNiceday();
  } catch (e) {
    console.error('🚫  Error : ', e);
  }
})();
