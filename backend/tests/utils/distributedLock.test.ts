import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { DistributedLock } from '../../src/utils/distributedLock';
import { redisClient } from '../../src/utils/redis';

describe('DistributedLock', () => {
  let lock: DistributedLock;

  beforeEach(() => {
    lock = new DistributedLock(redisClient);
  });

  afterEach(async () => {
    await redisClient.flushAll();
  });

  it('should acquire lock successfully', async () => {
    const acquired = await lock.acquire('test-lock', 5000);
    expect(acquired).toBe(true);
  });

  it('should fail to acquire already-held lock', async () => {
    const lock1 = new DistributedLock(redisClient);
    const lock2 = new DistributedLock(redisClient);
    await lock1.acquire('test-lock', 5000);
    const acquired = await lock2.acquire('test-lock', 5000);
    expect(acquired).toBe(false);
  });

  it('should release lock and allow re-acquisition', async () => {
    await lock.acquire('test-lock', 5000);
    await lock.release('test-lock');
    const acquired = await lock.acquire('test-lock', 5000);
    expect(acquired).toBe(true);
  });

  it('should auto-expire lock after TTL', async () => {
    await lock.acquire('test-lock', 100); // 100ms TTL
    await new Promise(resolve => setTimeout(resolve, 150));
    const acquired = await lock.acquire('test-lock', 5000);
    expect(acquired).toBe(true);
  });

  it('should execute callback with lock held', async () => {
    let executed = false;
    await lock.withLock('test-lock', 5000, async () => {
      executed = true;
    });
    expect(executed).toBe(true);
  });

  it('should release lock even if callback throws', async () => {
    try {
      await lock.withLock('test-lock', 5000, async () => {
        throw new Error('Test error');
      });
    } catch (e) {
      // Expected
    }
    const acquired = await lock.acquire('test-lock', 5000);
    expect(acquired).toBe(true);
  });
});
