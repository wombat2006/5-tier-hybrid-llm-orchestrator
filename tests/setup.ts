// テスト環境のセットアップ
import * as fs from 'fs/promises';
import * as path from 'path';

// テスト用データディレクトリの設定
export const TEST_DATA_DIR = './test-data';

beforeAll(async () => {
  // テスト用データディレクトリの作成
  await fs.mkdir(TEST_DATA_DIR, { recursive: true });
  await fs.mkdir(path.join(TEST_DATA_DIR, 'cost-tracking'), { recursive: true });
});

afterAll(async () => {
  // テスト終了後のクリーンアップ
  try {
    await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
  } catch (error) {
    console.warn('Test cleanup warning:', error);
  }
});

// 共通テストユーティリティ
export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const createMockTokenUsage = (input = 100, output = 200) => ({
  input,
  output,
  total: input + output
});

export const createMockCostBreakdown = (total = 0.1) => ({
  input_cost_usd: total * 0.4,
  output_cost_usd: total * 0.6,
  total_cost_usd: total,
  currency: 'USD' as const,
  calculated_at: new Date().toISOString()
});