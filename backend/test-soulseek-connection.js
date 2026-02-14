// Test script to verify Soulseek connection with socket wait fix
import net from 'net';

console.log('Testing Soulseek server connection...');

const conn = net.createConnection({
    host: 'server.slsknet.org',
    port: 2242
});

const startTime = Date.now();

conn.once('connect', () => {
    const elapsed = Date.now() - startTime;
    console.log(`✓ Socket connected successfully in ${elapsed}ms`);
    conn.destroy();
    process.exit(0);
});

conn.once('error', (err) => {
    const elapsed = Date.now() - startTime;
    console.log(`✗ Socket connection failed after ${elapsed}ms: ${err.message}`);
    process.exit(1);
});

setTimeout(() => {
    console.log('✗ Socket connection timed out after 30s');
    conn.destroy();
    process.exit(1);
}, 30000);
