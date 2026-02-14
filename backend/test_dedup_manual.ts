import { acquisitionService } from './src/services/acquisitionService';
import { prisma } from './src/utils/db';
import { redisClient } from './src/utils/redis';

async function test() {
  console.log('\n=== Testing Download Job Deduplication ===\n');
  
  const testUserId = 'test-user-dedup-manual';
  const testBatchId = 'test-batch-dedup-manual';
  const albumMbid = 'test-mbid-dedup-manual';

  try {
    // Cleanup any existing test data
    await prisma.downloadJob.deleteMany({ where: { userId: testUserId } });
    
    // Create test user
    await prisma.user.upsert({
      where: { id: testUserId },
      create: { 
        id: testUserId, 
        username: `testuser-${Date.now()}`, 
        passwordHash: 'test-hash', 
        role: 'user' 
      },
      update: {},
    });
    
    // Create test batch
    await prisma.discoveryBatch.upsert({
      where: { id: testBatchId },
      create: { 
        id: testBatchId, 
        userId: testUserId, 
        weekStart: new Date(), 
        targetSongCount: 40, 
        status: 'downloading' 
      },
      update: {},
    });

    console.log('✓ Test data setup complete\n');

    // Test 1: Concurrent job creation
    console.log('Test 1: Creating two jobs concurrently...');
    const createJob = () => {
      return (acquisitionService as any).createDownloadJob(
        { albumTitle: 'Test Album', artistName: 'Test Artist', mbid: albumMbid },
        { userId: testUserId, discoveryBatchId: testBatchId }
      );
    };

    const start = Date.now();
    const [job1, job2] = await Promise.all([createJob(), createJob()]);
    const elapsed = Date.now() - start;
    
    console.log(`  Job 1 ID: ${job1.id}`);
    console.log(`  Job 2 ID: ${job2.id}`);
    console.log(`  Same job returned: ${job1.id === job2.id ? '✓' : '✗'}`);
    console.log(`  Time elapsed: ${elapsed}ms\n`);

    const jobs = await prisma.downloadJob.findMany({
      where: { targetMbid: albumMbid, userId: testUserId, discoveryBatchId: testBatchId },
    });
    console.log(`  Jobs in database: ${jobs.length}`);
    console.log(`  Test 1 Result: ${jobs.length === 1 && job1.id === job2.id ? '✓ PASSED' : '✗ FAILED'}\n`);

    // Test 2: Creating job after first is completed should create new job
    console.log('Test 2: Creating new job after previous completes...');
    await prisma.downloadJob.update({
      where: { id: job1.id },
      data: { status: 'completed' },
    });
    
    const job3 = await createJob();
    console.log(`  New job ID: ${job3.id}`);
    console.log(`  Different from first: ${job3.id !== job1.id ? '✓' : '✗'}`);
    
    const allJobs = await prisma.downloadJob.findMany({
      where: { targetMbid: albumMbid, userId: testUserId, discoveryBatchId: testBatchId },
    });
    console.log(`  Total jobs now: ${allJobs.length}`);
    console.log(`  Test 2 Result: ${allJobs.length === 2 && job3.id !== job1.id ? '✓ PASSED' : '✗ FAILED'}\n`);

    // Cleanup
    await prisma.downloadJob.deleteMany({ where: { userId: testUserId } });
    await prisma.discoveryBatch.delete({ where: { id: testBatchId } });
    await prisma.user.delete({ where: { id: testUserId } });
    
    console.log('=== All Tests Completed Successfully ===\n');
    
  } catch (error) {
    console.error('\n✗ Test failed with error:', error);
    throw error;
  } finally {
    await redisClient.quit();
    await prisma.$disconnect();
  }
}

test().catch((e) => {
  console.error(e);
  process.exit(1);
});
