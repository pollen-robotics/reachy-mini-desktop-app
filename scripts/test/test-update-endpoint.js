#!/usr/bin/env node

/**
 * Test script to verify the update endpoint is accessible
 * Tests both the configured endpoint and alternative GitHub API methods
 */

import https from 'https';
import http from 'http';

const CONFIGURED_ENDPOINT = 'https://github.com/pollen-robotics/reachy-mini-desktop-app/releases/latest/download/latest.json';
const GITHUB_API_ENDPOINT = 'https://api.github.com/repos/pollen-robotics/reachy-mini-desktop-app/releases/latest';

function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;
    
    const req = client.request(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json, */*',
        ...options.headers,
      },
      ...options,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data), raw: data });
          } catch (e) {
            resolve({ status: res.statusCode, data: data, raw: data });
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 100)}`));
        }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

async function testEndpoint() {
  console.log('🧪 Testing Update Endpoint\n');
  console.log('='.repeat(50));
  
  // Test 1: Configured endpoint
  console.log('\n1️⃣ Testing configured endpoint:');
  console.log(`   ${CONFIGURED_ENDPOINT}`);
  try {
    const result = await fetch(CONFIGURED_ENDPOINT);
    console.log(`   ✅ Status: ${result.status}`);
    if (result.data && typeof result.data === 'object') {
      console.log(`   ✅ Valid JSON received`);
      console.log(`   ✅ Version: ${result.data.version || 'N/A'}`);
      console.log(`   ✅ Platforms: ${Object.keys(result.data.platforms || {}).join(', ')}`);
    } else {
      console.log(`   ⚠️  Response is not JSON: ${result.raw.substring(0, 100)}`);
    }
  } catch (error) {
    console.log(`   ❌ Failed: ${error.message}`);
  }
  
  // Test 2: GitHub API
  console.log('\n2️⃣ Testing GitHub API endpoint:');
  console.log(`   ${GITHUB_API_ENDPOINT}`);
  try {
    const result = await fetch(GITHUB_API_ENDPOINT);
    console.log(`   ✅ Status: ${result.status}`);
    if (result.data && result.data.assets) {
      const latestJsonAsset = result.data.assets.find(a => 
        a.name === 'latest.json' || a.browser_download_url.includes('latest.json')
      );
      if (latestJsonAsset) {
        console.log(`   ✅ Found latest.json asset: ${latestJsonAsset.browser_download_url}`);
        console.log(`   ✅ Size: ${latestJsonAsset.size} bytes`);
      } else {
        console.log(`   ⚠️  No latest.json asset found in release`);
        console.log(`   Available assets: ${result.data.assets.map(a => a.name).join(', ')}`);
      }
    }
  } catch (error) {
    console.log(`   ❌ Failed: ${error.message}`);
  }
  
  // Test 3: Alternative URL pattern (if file is in release tag)
  console.log('\n3️⃣ Testing alternative URL pattern:');
  const altUrl = 'https://github.com/pollen-robotics/reachy-mini-desktop-app/releases/download/v0.2.22/latest.json';
  console.log(`   ${altUrl}`);
  try {
    const result = await fetch(altUrl);
    console.log(`   ✅ Status: ${result.status}`);
    if (result.data && typeof result.data === 'object') {
      console.log(`   ✅ Valid JSON received`);
      console.log(`   ✅ Version: ${result.data.version || 'N/A'}`);
    }
  } catch (error) {
    console.log(`   ❌ Failed: ${error.message}`);
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('\n✅ Test completed\n');
}

testEndpoint().catch(console.error);

