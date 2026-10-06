export interface QualityCounters {
  decoded: number;
  videoBytes: number;
  delay?: number;
  displayGeneration: number;
}
export interface QualityReading {
  fps?: number;
  videoBitrate?: number;
  delay?: number;
}

// 单调时钟和累计计数只保留一个基线，不累积历史或帧内容。
export class QualitySampler {
  private previous?: {
    time: number;
    drawn: number;
    bytes: number;
    display: number;
  };
  reset() {
    this.previous = undefined;
  }
  sample(
    time: number,
    drawn: number,
    counters: QualityCounters,
  ): QualityReading {
    const valid = [
      time,
      drawn,
      counters.videoBytes,
      counters.decoded,
      counters.displayGeneration,
    ].every((value) => Number.isFinite(value) && value >= 0);
    if (!valid) {
      this.reset();
      return {};
    }
    const delay =
      Number.isFinite(counters.delay) && (counters.delay ?? 0) > 0
        ? counters.delay
        : undefined;
    const previous = this.previous;
    this.previous = {
      time,
      drawn,
      bytes: counters.videoBytes,
      display: counters.displayGeneration,
    };
    if (
      !previous ||
      previous.display !== counters.displayGeneration ||
      time <= previous.time ||
      drawn < previous.drawn ||
      counters.videoBytes < previous.bytes
    )
      return { delay };
    const seconds = (time - previous.time) / 1000;
    return {
      fps: (drawn - previous.drawn) / seconds,
      videoBitrate: ((counters.videoBytes - previous.bytes) * 8) / seconds,
      delay,
    };
  }
}
