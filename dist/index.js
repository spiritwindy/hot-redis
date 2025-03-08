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
Object.defineProperty(exports, "__esModule", { value: true });
exports.HotKeyCache = void 0;
const lru_cache_1 = require("lru-cache");
const DEFAULT_CONFIG = {
    threshold: 100, // 触发缓存的访问阈值（次/周期）
    statInterval: 1000, // 统计周期（毫秒）
    localTTL: 3000, // 默认本地缓存时间（毫秒）
    maxKeys: 1000 // 最大缓存键数量
};
class HotKeyCache {
    constructor(redisClient, config = {}) {
        this.accessCount = new Map();
        this.hotKeys = new Set();
        this.lockMap = new Map();
        this.commandParsers = new Map([
            ['get', args => [args[0]]],
            ['set', args => [args[0]]],
            ['del', args => args],
            ['hset', args => [args[0]]],
            ['hdel', args => [args[0]]],
            ['expire', args => [args[0]]],
            ['pexpire', args => [args[0]]],
            ['expireat', args => [args[0]]],
            ['pexpireat', args => [args[0]]],
            ['persist', args => [args[0]]],
            ['mset', args => args.filter((_, i) => i % 2 === 0)],
            ['incr', args => [args[0]]],
            ['decr', args => [args[0]]]
        ]);
        this.redis = redisClient;
        this.config = Object.assign(Object.assign({}, DEFAULT_CONFIG), config);
        this.localCache = new lru_cache_1.LRUCache({
            max: this.config.maxKeys,
            ttl: this.config.localTTL,
            updateAgeOnGet: true
        });
        this.patchCommands();
        this.startStatTask();
        this.setupExpiryListener();
    }
    patchCommands() {
        this.patchReadCommand('get');
        this.patchWriteCommands([
            'set', 'del', 'hset', 'hdel', 'expire', 'pexpire',
            'expireat', 'pexpireat', 'persist', 'mset', 'incr', 'decr'
        ]);
    }
    // 
    patchReadCommand(command) {
        const original = this.redis[command].bind(this.redis);
        this.redis[command] = (...args) => __awaiter(this, void 0, void 0, function* () {
            const keys = this.parseKeys(command, args);
            keys.forEach(key => this.recordAccess(key));
            const cacheKey = keys[0];
            const cached = this.localCache.get(cacheKey);
            if (cached && cached.expire > Date.now()) {
                console.log('命中缓存', cacheKey);
                return cached.value;
            }
            if (!this.hotKeys.has(cacheKey)) {
                return original(...args);
            }
            return this.getWithLock(cacheKey, original, args);
        });
    }
    getWithLock(key, original, args) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.lockMap.has(key)) {
                return this.lockMap.get(key);
            }
            const promise = (() => __awaiter(this, void 0, void 0, function* () {
                try {
                    // 二次检查
                    const cached = this.localCache.get(key);
                    if (cached && cached.expire > Date.now()) {
                        return cached.value;
                    }
                    // 查询Redis并获取TTL
                    const value = yield original(...args);
                    const pttl = yield this.redis.pttl(key);
                    if (value != null) {
                        this.localCache.set(key, {
                            value,
                            expire: Date.now() + (pttl > 0 ? pttl : this.config.localTTL)
                        });
                    }
                    return value;
                }
                finally {
                    this.lockMap.delete(key);
                }
            }))();
            this.lockMap.set(key, promise);
            return promise;
        });
    }
    patchWriteCommands(commands) {
        commands.forEach(command => {
            const original = this.redis[command].bind(this.redis);
            this.redis[command] = (...args) => __awaiter(this, void 0, void 0, function* () {
                const result = yield original(...args);
                this.processWrite(command, args);
                return result;
            });
        });
    }
    /**
     * 超时命令
     * @param command
     * @param args
     */
    processWrite(command, args) {
        const keys = this.parseKeys(command, args);
        const now = Date.now();
        keys.forEach(key => {
            this.localCache.delete(key);
            this.hotKeys.delete(key);
            // 处理TTL相关命令
            if (command === 'expire') {
                this.updateKeyTTL(key, parseInt(args[1]) * 1000);
            }
            else if (command === 'pexpire') {
                this.updateKeyTTL(key, parseInt(args[1]));
            }
            else if (command === 'expireat') {
                this.updateKeyTTL(key, parseInt(args[1]) * 1000 - now);
            }
            else if (command === 'pexpireat') {
                this.updateKeyTTL(key, parseInt(args[1]) - now);
            }
        });
    }
    updateKeyTTL(key, ttl) {
        const entry = this.localCache.get(key);
        if (entry && ttl > 0) {
            entry.expire = Date.now() + ttl;
            this.localCache.set(key, entry);
        }
    }
    parseKeys(command, args) {
        const parser = this.commandParsers.get(command.toLowerCase());
        return parser ? parser(args) : [];
    }
    recordAccess(key) {
        this.accessCount.set(key, (this.accessCount.get(key) || 0) + 1);
    }
    startStatTask() {
        setInterval(() => {
            const newHotKeys = new Set();
            this.accessCount.forEach((count, key) => {
                if (count >= this.config.threshold) {
                    newHotKeys.add(key);
                }
            });
            this.hotKeys.clear();
            newHotKeys.forEach(key => this.hotKeys.add(key));
            this.accessCount.clear();
        }, this.config.statInterval);
    }
    setupExpiryListener() {
        return __awaiter(this, void 0, void 0, function* () {
            const pubSub = this.redis.duplicate();
            yield pubSub.subscribe('__keyevent@0__:expired', function (err, dat) {
                if (err)
                    console.error('Failed to subscribe to expiry events:', err);
                else {
                    console.log('Subscribed to expiry events', dat);
                }
            });
            pubSub.on('message', (channel, message) => {
                if (channel === '__keyevent@0__:expired') {
                    this.localCache.delete(message);
                    this.hotKeys.delete(message);
                }
            });
        });
    }
    // 调试方法
    getCacheStats() {
        return {
            size: this.localCache.size,
            keys: [...this.localCache.keys()],
        };
    }
}
exports.HotKeyCache = HotKeyCache;
