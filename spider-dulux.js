const { Builder, Browser, By, Key, until, delay } = require('selenium-webdriver');
const { del } = require('selenium-webdriver/http');
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
    await driver.get('https://www.dulux.com.cn/zh/colour-palettes/filters/h_White/f_%E5%93%91%E5%85%89?hmsr=baidu%2DDulux&hmpl=PC%2DBrand&hmcu=0016&hmkw=keyword0000190&bd_vid=5300691440032690735')
    maxPage = 12
    getData(driver)
})()


async function getData(driver) {
    try {
        console.log(`当前正在爬取第${currentPage}页数据，共${maxPage}页数据`);
        await driver.sleep(2000)
        // 以下就是获取数据的代码
        let results = []
        let items = await driver.findElements(By.css('.related-item-color'))
        for (let i = 0; i < items.length; i++) {
            let item = items[i]
            // console.log(await item.getText());
            const element = await item.findElement(By.css('.related-item-color .color-card'))
            const color = await driver.executeScript(
                `return window.getComputedStyle(arguments[0]).background;`, element
            )
            // 提取r、g、b值
            function parseRGB(colorStr) {
                let trimmedString = colorStr.substring(4, colorStr.length - 1);
                let parts = trimmedString.split(',');
                let rgbValues = parts.map(part => parseInt(part.trim(), 10));
                return rgbValues;
            }

            const [r, g, b] = parseRGB(color);
            const color_name = await item.findElement(By.css('.color-card-label')).getText()

            results.push({
                brand_name: '多乐士',
                color_name,
                color_r: r,
                color_g: g,
                color_b: b
            })
        }
        console.log(results);
        await insertData(results); // 调用新函数来插入数据
        currentPage++
        if (currentPage <= maxPage) {
            // await driver.findElement(By.className('filter__two__con')).click()
            let nextPage = await driver.findElement(By.css(`.js-color-box:nth-child(${currentPage})`))
            await driver.executeScript("arguments[0].click();", nextPage)
            getData(driver)
        }

    } catch (e) {
        console.log(e.message);
    }
}

async function insertData(dataArray) {
    const batchSize = 10; // 每次插入的记录数

    // 使用Set去重，基于color_name字段
    const uniqueColorNames = new Set();
    const uniqueData = dataArray.filter(item => {
        if (!uniqueColorNames.has(item.color_name) && item.color_name.trim()) {
            uniqueColorNames.add(item.color_name);
            return true;
        }
        return false;
    });

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