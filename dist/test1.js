"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// 使用示例
const ioredis_1 = __importDefault(require("ioredis"));
const index_js_1 = require("./index.js");
const redis = new ioredis_1.default({
    host: 'localhost',
    port: 6379
});
// 使用示例
const redis1 = new ioredis_1.default({
    host: 'localhost',
    port: 6379
});
const hotKeyCache = new index_js_1.HotKeyCache(redis, {
    threshold: -1,
    localTTL: 50000,
});
// 正常使用Redis API
function demo() {
    return __awaiter(this, void 0, void 0, function* () {
        yield redis.set('user:1001', 'Alice');
        const data = yield redis.get('user:1001');
        yield redis.expire('user:1001', 30000);
        yield redis1.set('user:1002', 'test');
        yield redis.get("user:1002");
        yield redis.set('user:1002', 'Bob');
        setTimeout(() => __awaiter(this, void 0, void 0, function* () {
            console.log("已经设置为test");
            yield redis1.set('user:1002', 'test');
            setTimeout(() => __awaiter(this, void 0, void 0, function* () {
                process.exit();
            }), 100);
        }), 4000);
        setTimeout(() => __awaiter(this, void 0, void 0, function* () {
            setInterval(() => __awaiter(this, void 0, void 0, function* () {
                var d = yield redis.get("user:1002");
                console.log(d);
            }), 500);
        }), 2000);
        // await redis.del('user:1001');
    });
}
demo();
