const https = require('https');
const axios = require('axios');
require('dotenv').config();

const upload = (chunk) => {
  const agent = new https.Agent({
    rejectUnauthorized: false,
  });

  // JSON.stringify without quotes on properties
  // @link https://stackoverflow.com/questions/11233498/json-stringify-without-quotes-on-properties
  const query_string = JSON.stringify(chunk)
    .replace(/\"([^(\")"]+)\":/g, '$1:');

  if (process.env.DEBUG) {
    console.log(`
        mutation {
          insertProducts(
            data: ${query_string}
          ) {
            affected_rows
          }
        }
      `);
  }

  axios({
    httpsAgent: agent,
    url: process.env.GRAPHQL_API_URL,
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
};

/**
 * 透過 graphql api 上傳
 * @param {Array} [{
 *            source: "niceday",
 *            prefix_url: "//play.niceday.tw",
 *            category: "愛上戶外",
 *            title: "title 123",
 *            description: "desc 123",
 *            link: "cola.io/1234",
 *            img: "//cola.io/abc.jpg",
 *            price: "$ 1,234 起",
 *        },...]
 */
const bulkUpload = (items) => {
  while (items.length > 0) {
    const chunk = items.splice(0, 100); // 每次上傳 50 筆資料 (約 30k 內)
    upload(chunk);
  }
};

module.exports = {
  bulkUpload,
};
