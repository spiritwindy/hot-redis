// 使用示例
import IORedis from 'ioredis';
import { HotKeyCache } from '.';
const redis = new IORedis({
    host: 'localhost',
    port: 6379
});

// 使用示例
const redis1 = new IORedis({
    host: 'localhost',
    port: 6379
});
const hotKeyCache = new HotKeyCache(redis, {
    threshold: -1,
    localTTL: 50000,
});

// 正常使用Redis API
async function demo() {
    await redis.set('user:1001', 'Alice');
    const data = await redis.get('user:1001');
    await redis.expire('user:1001', 30000);

    await redis1.set('user:1002', 'test');
    await redis.get("user:1002")
    await redis.set('user:1002', 'Bob');
    setTimeout(async () => {
        console.log("已经设置为test")
        await redis1.set('user:1002', 'test');
        // setTimeout(async () => {
        //     process.exit()
        // }, 100)
    }, 4000);
    setTimeout(async () => {
        setInterval(async () => {
            var d = await redis.get("user:1002")
            console.log(d)
        }, 500);
    }, 2000)

    // await redis.del('user:1001');
}
demo();