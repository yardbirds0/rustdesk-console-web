import { expect, test } from '@jest/globals';
import { QualitySampler } from './quality-metrics';

test('首个采样留空，帧率按实际绘制数、码率按实际时间计算', () => {
  const sampler = new QualitySampler();
  const counters = {
    decoded: 100,
    videoBytes: 1000,
    displayGeneration: 1,
    delay: 42,
  };
  expect(sampler.sample(1000, 10, counters)).toEqual({ delay: 42 });
  expect(
    sampler.sample(2500, 40, { ...counters, decoded: 999, videoBytes: 301000 }),
  ).toEqual({ fps: 20, videoBitrate: 1600000, delay: 42 });
  expect(sampler.sample(3500, 40, { ...counters, videoBytes: 301000 })).toEqual(
    { fps: 0, videoBitrate: 0, delay: 42 },
  );
});

test('切屏、计数回退、重置和非单调时间废弃基线，不产生假峰值', () => {
  const sampler = new QualitySampler();
  const counters = { decoded: 10, videoBytes: 100, displayGeneration: 0 };
  sampler.sample(1000, 10, counters);
  expect(
    sampler.sample(2000, 100, { ...counters, displayGeneration: 1 }),
  ).toEqual({ delay: undefined });
  expect(
    sampler.sample(3000, 1, {
      ...counters,
      videoBytes: 1,
      displayGeneration: 1,
    }),
  ).toEqual({ delay: undefined });
  expect(
    sampler.sample(3000, 2, { ...counters, displayGeneration: 1 }),
  ).toEqual({ delay: undefined });
  sampler.reset();
  expect(sampler.sample(600000, 100000, counters)).toEqual({
    delay: undefined,
  });
});

test('无效计数或时间不显示数值，无效延迟留空', () => {
  for (const invalid of [NaN, Infinity, -1]) {
    const sampler = new QualitySampler();
    expect(
      sampler.sample(1000, 1, {
        decoded: 1,
        videoBytes: invalid,
        displayGeneration: 0,
      }),
    ).toEqual({});
    expect(
      sampler.sample(invalid, 1, {
        decoded: 1,
        videoBytes: 1,
        displayGeneration: 0,
      }),
    ).toEqual({});
  }
  const sampler = new QualitySampler();
  expect(
    sampler.sample(1000, 1, {
      decoded: 1,
      videoBytes: 1,
      displayGeneration: 0,
      delay: 0,
    }),
  ).toEqual({ delay: undefined });
});
