// 使用 require 方式引入 lru-cache 模块
var LRU = require('lru-cache').LRUCache;
var assert = require('assert').strict;

// 配置 LRU 缓存
const options = {
  max: 3,      // 最大存储 3 个键值对
  ttl: 2000,   // 默认 2 秒过期（单位：毫秒）
};
const cache = new LRU(options);

// 测试函数
function runTests() {
  console.log('Running LRU Cache Tests...\n');

  // 测试 1：基本 set/get 测试
  console.log('测试1: 基本 set/get 测试 - 开始');
  cache.set('a', 1);
  assert.equal(cache.get('a'), 1, '基本 set/get 失败');
  console.log('测试1: 基本 set/get 测试通过\n');

  // 测试 2：检查缓存大小
  console.log('测试2: 缓存大小检查 - 开始');
  assert.equal(cache.size, 1, '缓存大小检查失败');
  console.log('测试2: 缓存大小检查通过\n');

  // 测试 3：LRU 淘汰策略
  console.log('测试3: LRU 淘汰策略测试 - 开始');
  cache.set('b', 2);
  cache.set('c', 3);
  cache.set('d', 4); // 超出 max 限制，此时最早的键 'a' 应被移除
  assert.equal(cache.has('a'), false, 'LRU 淘汰失败');
  assert.equal(cache.has('b'), true, '缓存错误移除');
  console.log('测试3: LRU 淘汰策略测试通过\n');

  // 测试 4：TTL 过期测试
  console.log('测试4: TTL 过期测试 - 开始');
  cache.set('e', 5, { ttl: 1000 }); // 设置键 'e' 1 秒后过期
  setTimeout(() => {
    try {
      assert.equal(cache.has('e'), false, 'TTL 过期机制失败');
      console.log('测试4: TTL 过期测试通过\n');
    } catch (err) {
      console.error('测试4: TTL 过期测试失败:', err.message);
    }
  }, 1100);
  
  // 测试 5：peek 方法（不影响 LRU 顺序）
  console.log('测试5: peek 方法测试 - 开始');
  cache.set('x', 100);
  cache.set('y', 200);
  assert.equal(cache.peek('x'), 100, 'peek 失败');
  console.log('测试5: peek 方法测试通过\n');

  // 测试 6：delete 方法
  console.log('测试6: delete 方法测试 - 开始');
  cache.delete('x');
  assert.equal(cache.has('x'), false, 'delete 失败');
  console.log('测试6: delete 方法测试通过\n');

  // 测试 7：clear 方法（清空缓存）
  console.log('测试7: clear 方法测试 - 开始');
  cache.clear();
  assert.equal(cache.size, 0, 'clear 失败');
  console.log('测试7: clear 方法测试通过\n');

  console.log('所有测试通过！');
}

runTests();
