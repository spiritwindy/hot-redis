import type IORedis from 'ioredis';
import { LRUCache as LRU } from 'lru-cache';

type RedisCommand = (...args: any[]) => Promise<any>;
type CommandParser = (args: any[]) => string[];

interface HotKeyConfig {
  threshold: number;
  statInterval: number;
  localTTL: number;
  maxKeys: number;
}

const DEFAULT_CONFIG: HotKeyConfig = {
  threshold: 100,       // 触发缓存的访问阈值（次/周期）
  statInterval: 1000,  // 统计周期（毫秒）
  localTTL: 3000,       // 默认本地缓存时间（毫秒）
  maxKeys: 1000         // 最大缓存键数量
};

export class HotKeyCache {
  private readonly redis: IORedis;
  private readonly config: HotKeyConfig;
  private readonly accessCount = new Map<string, number>();
  private readonly hotKeys = new Set<string>();
  private readonly localCache: LRU<string, { value: any; expire: number }>;
  private readonly lockMap = new Map<string, Promise<any>>();
  private readonly commandParsers = new Map<string, CommandParser>([
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

  constructor(redisClient: IORedis, config: Partial<HotKeyConfig> = {}) {
    this.redis = redisClient;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.localCache = new LRU({
      max: this.config.maxKeys,
      ttl: this.config.localTTL,
      updateAgeOnGet: true
    });

    this.patchCommands();
    this.startStatTask();
    this.setupExpiryListener();
  }

  private patchCommands() {
    this.patchReadCommand('get');
    this.patchWriteCommands([
      'set', 'del', 'hset', 'hdel', 'expire', 'pexpire',
      'expireat', 'pexpireat', 'persist', 'mset', 'incr', 'decr'
    ]);
  }

  private patchReadCommand(command: string) {
    const original = this.redis[command].bind(this.redis);

    this.redis[command] = async (...args: any[]) => {
      const keys = this.parseKeys(command, args);
      keys.forEach(key => this.recordAccess(key));

      const cacheKey = keys[0];
      const cached = this.localCache.get(cacheKey);
      if (cached && cached.expire > Date.now()) {
        console.log('命中缓存', cacheKey)
        return cached.value;
      }

      if (!this.hotKeys.has(cacheKey)) {
        return original(...args);
      }

      return this.getWithLock(cacheKey, original, args);
    };
  }

  private async getWithLock(key: string, original: RedisCommand, args: any[]) {
    if (this.lockMap.has(key)) {
      return this.lockMap.get(key);
    }

    const promise = (async () => {
      try {
        // 二次检查
        const cached = this.localCache.get(key);
        if (cached && cached.expire > Date.now()) {
          return cached.value;
        }

        // 查询Redis并获取TTL
        const value = await original(...args);
        const pttl = await this.redis.pttl(key);

        if (value != null) {
          this.localCache.set(key, {
            value,
            expire: Date.now() + (pttl > 0 ? pttl : this.config.localTTL)
          });
        }
        return value;
      } finally {
        this.lockMap.delete(key);
      }
    })();

    this.lockMap.set(key, promise);
    return promise;
  }

  private patchWriteCommands(commands: string[]) {
    commands.forEach(command => {
      const original = this.redis[command].bind(this.redis);

      this.redis[command] = async (...args: any[]) => {
        const result = await original(...args);
        this.processWrite(command, args);
        return result;
      };
    });
  }
  /**
   * 超时命令
   * @param command 
   * @param args 
   */
  private processWrite(command: string, args: any[]) {
    const keys = this.parseKeys(command, args);
    const now = Date.now();

    keys.forEach(key => {
      this.localCache.delete(key);
      this.hotKeys.delete(key);

      // 处理TTL相关命令
      if (command === 'expire') {
        this.updateKeyTTL(key, parseInt(args[1]) * 1000);
      } else if (command === 'pexpire') {
        this.updateKeyTTL(key, parseInt(args[1]));
      } else if (command === 'expireat') {
        this.updateKeyTTL(key, parseInt(args[1]) * 1000 - now);
      } else if (command === 'pexpireat') {
        this.updateKeyTTL(key, parseInt(args[1]) - now);
      }
    });
  }

  private updateKeyTTL(key: string, ttl: number) {
    const entry = this.localCache.get(key);
    if (entry && ttl > 0) {
      entry.expire = Date.now() + ttl;
      this.localCache.set(key, entry);
    }
  }

  private parseKeys(command: string, args: any[]): string[] {
    const parser = this.commandParsers.get(command.toLowerCase());
    return parser ? parser(args) : [];
  }

  private recordAccess(key: string) {
    this.accessCount.set(key, (this.accessCount.get(key) || 0) + 1);
  }

  private startStatTask() {
    setInterval(() => {
      const newHotKeys = new Set<string>();

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

  private async setupExpiryListener() {
    const pubSub = this.redis.duplicate();

    await pubSub.subscribe('__keyevent@0__:expired', function (err, dat) {
      if (err)
        console.error('Failed to subscribe to expiry events:', err)
      else {
        console.log('Subscribed to expiry events', dat)
      }
    });

    pubSub.on('message', (channel, message) => {
      if (channel === '__keyevent@0__:expired') {
        this.localCache.delete(message);
        this.hotKeys.delete(message);
      }
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

