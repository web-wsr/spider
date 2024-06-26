const { Builder, Browser, By, Key, until, delay } = require('selenium-webdriver');
const { del } = require('selenium-webdriver/http');
const axios = require('axios');
const Jimp = require('jimp');
const fs = require('fs');
// 连接数据库
const knex = require('knex')({
    client: 'mysql',
    connection: {
        host: 'localhost',
        port: 3306,
        user: 'root',
        password: 'root',
        database: 'spider'
    }
});

let currentPage = 1;
let maxPage;

(async function start() {
    let driver = await new Builder().forBrowser(Browser.CHROME).build()
    await driver.get('http://www.mylands.com.cn/product.html')
    maxPage = 31
    getData(driver)

})()


async function getData(driver) {
    try {
        console.log(`当前正在爬取第${currentPage}页数据,共${maxPage}页数据`);
        await driver.sleep(4000)
        // 以下就是获取数据的代码
        let results = []
        let items = await driver.findElements(By.css('.prodcut-list li'))
        for (let i = 0; i < items.length; i++) {
            let item = items[i]
            // console.log(await item.getText());
            const element = await item.findElement(By.css('.pic-box .pic1 .img-box>img'))
            await driver.sleep(1000)
            const src = await element.getAttribute('src')
            const color_name = await item.findElement(By.css('.txt-box h2 a')).getText()

            // const { r, g, b } = await downloadImageAndExtractColor(src);
            const { r, g, b } = await downloadImageWithRetry(src);
            if (r !== undefined && g !== undefined && b !== undefined) {
                results.push({
                    brand_name: '麦兰德',
                    color_name,
                    color_r: r,
                    color_g: g,
                    color_b: b,
                });
            }
            console.log(results.length);
        }
        console.log(results);
        // await insertData(results); // 调用新函数来插入数据
        await saveResultsToFile(results);
        console.log("数据已导出至文件。");
        currentPage++
        if (currentPage > maxPage) {
            console.log('爬取结束');
            await importDataFromFile();// 在爬取结束后导入数据
        }
        if (currentPage <= maxPage) {
            await driver.findElement(By.className('next')).click()
            getData(driver)
        }

    } catch (e) {
        console.log(e.message);
    }
}

// 数据库批量插入逻辑
async function insertData(dataArray) {
    const batchSize = 10; // 每次插入的记录数

    // 使用Set去重，基于color_name字段
    // const uniqueColorNames = new Set();
    // const uniqueData = dataArray.filter(item => {
    //     if (!uniqueColorNames.has(item.color_name) && item.color_name.trim()) {
    //         uniqueColorNames.add(item.color_name);
    //         return true;
    //     }
    //     return false;
    // });

    for (let i = 0; i < uniqueData.length; i += batchSize) {
        const batch = uniqueData.slice(i, i + batchSize);
        try {
            await knex.batchInsert('colors', batch);
            console.log(`成功插入${batch.length}条记录到数据库。`);
        } catch (err) {
            console.error(`批量插入失败: ${err}`);
        }
    }
}

// 数据保存data.js
// async function saveResultsToFile(results) {
//     try {
//         const data = JSON.stringify(results, null, 2);
//         await fs.promises.writeFile('data.json', data);
//     } catch (err) {
//         console.error("数据导出到文件时发生错误:", err);
//     }
// }

// 保存数据到本地文件data.json
async function saveResultsToFile(newResults) {
    try {
        // 尝试读取现有的data.json文件内容
        let existingData = [];
        try {
            const fileContent = await fs.promises.readFile('data.json', 'utf8');
            existingData = JSON.parse(fileContent);
        } catch (err) {
            if (err.code !== 'ENOENT') {
                console.error("读取data.json文件时出错:", err);
            }
        }

        // 合并新老数据
        const combinedResults = existingData.concat(newResults);

        // 将合并后的数据写回文件
        const data = JSON.stringify(combinedResults, null, 2);
        await fs.promises.writeFile('data.json', data);

        console.log("数据已追加至文件。");
    } catch (err) {
        console.error("数据追加到文件时发生错误:", err);
    }
}

// 提取图片颜色
async function downloadImageWithRetry(imageUrl, maxRetries = 3, retryDelay = 1000) {
    let retries = 0;
    while (retries < maxRetries) {
        try {
            const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 5000 });
            if (!response.data || response.data.length === 0) {
                throw new Error('Empty response data');
            }
            const image = await Jimp.read(response.data);
            const centerX = Math.floor(image.bitmap.width / 2);
            const centerY = Math.floor(image.bitmap.height / 2);
            const { r, g, b } = Jimp.intToRGBA(image.getPixelColor(centerX, centerY));
            return { r, g, b };
        } catch (error) {
            console.error(`Attempt ${retries + 1} to download image failed: ${imageUrl}. Error: ${error.message}`);
            retries++;
            if (retries < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, retryDelay)); // 等待一段时间后重试
            }
        }
    }
    console.error(`Failed to download image after ${maxRetries} attempts: ${imageUrl}`);
    return null;
}


// 读取本地文件并插入数据库
async function importDataFromFile() {
    try {
        const fileContent = await fs.promises.readFile('data.json', 'utf8');
        const results = JSON.parse(fileContent);

        // 修改原有的insertData函数逻辑，并调用
        await insertData(results);

        console.log("数据已成功从文件导入数据库。");
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.error("文件未找到，请确保data.json存在。");
        } else if (err instanceof SyntaxError) {
            console.error("解析JSON文件时出错，可能是文件格式不正确。");
        } else {
            console.error("从文件导入数据到数据库时出错:", err);
        }
    }
}