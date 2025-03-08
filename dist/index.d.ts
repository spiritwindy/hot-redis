import type IORedis from 'ioredis';
interface HotKeyConfig {
    threshold: number;
    statInterval: number;
    localTTL: number;
    maxKeys: number;
}
export declare class HotKeyCache {
    private readonly redis;
    private readonly config;
    private readonly accessCount;
    private readonly hotKeys;
    private readonly localCache;
    private readonly lockMap;
    private readonly commandParsers;
    constructor(redisClient: IORedis, config?: Partial<HotKeyConfig>);
    private patchCommands;
    private patchReadCommand;
    private getWithLock;
    private patchWriteCommands;
    /**
     * 超时命令
     * @param command
     * @param args
     */
    private processWrite;
    private updateKeyTTL;
    private parseKeys;
    private recordAccess;
    private startStatTask;
    private setupExpiryListener;
    getCacheStats(): {
        size: number;
        keys: string[];
    };
}
export {};
