import IORedis from 'ioredis';
new IORedis().get('foo').then(console.log);