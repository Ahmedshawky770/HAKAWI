#!/usr/bin/env node
/**
 * Basic performance benchmark using the built-in `perf_hooks` module.
 *
 * WHY THIS EXISTS. The product needs a repeatable way to measure API latency
 * against the p95 target (200ms) without depending on an external binary.
 * This script hits a configurable set of endpoints and reports the stats.
 */

import { performance } from 'node:perf_hooks';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001/api/v1';
const CONCURRENCY = Number(process.env.CONCURRENCY || '10');
const REQUESTS_PER_WORKER = Number(process.env.REQUESTS || '100');

const endpoints = [
  '/health',
  '/books',
  '/stories',
  '/search?query=test',
];

function pickEndpoint() {
  return endpoints[Math.floor(Math.random() * endpoints.length)];
}

async function runBenchmark() {
  const samples: number[] = [];

  const workers = Array.from({ length: CONCURRENCY }, async () => {
    const localSamples: number[] = [];
    for (let i = 0; i < REQUESTS_PER_WORKER; i++) {
      const url = `${BASE_URL}${pickEndpoint()}`;
      const start = performance.now();
      try {
        const res = await fetch(url);
        await res.text();
      } catch {
        // Network errors are counted as failures, not latency samples.
      }
      localSamples.push(performance.now() - start);
    }
    return localSamples;
  });

  const results = await Promise.all(workers);
  results.forEach((samples) => samples.forEach((ms) => samples.push(ms)));

  samples.sort((a, b) => a - b);

  const p50 = samples[Math.floor(samples.length * 0.5)];
  const p95 = samples[Math.floor(samples.length * 0.95)];
  const p99 = samples[Math.floor(samples.length * 0.99)];
  const max = samples[samples.length - 1];

  console.log(`Samples: ${samples.length}`);
  console.log(`p50: ${p50.toFixed(2)}ms`);
  console.log(`p95: ${p95.toFixed(2)}ms`);
  console.log(`p99: ${p99.toFixed(2)}ms`);
  console.log(`max: ${max.toFixed(2)}ms`);

  if (p95 > 200) {
    console.warn('p95 latency exceeds 200ms target');
    process.exitCode = 1;
  }
}

void runBenchmark();
