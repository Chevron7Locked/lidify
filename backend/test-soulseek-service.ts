// Test SoulseekService connection
import { SoulseekService } from './src/services/soulseek.js';

const service = new SoulseekService();

console.log('Testing Soulseek connection with actual service...');

// Force a connection attempt
try {
    const result = await service.searchTrack('Daft Punk', 'Get Lucky', 'Random Access Memories');
    console.log('Search result:', result);
} catch (err) {
    console.error('Search failed:', err);
}

process.exit(0);
