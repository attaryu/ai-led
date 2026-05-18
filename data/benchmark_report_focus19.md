# Benchmark Report — Focus 19 (multi-criteria sample)

Selected indicators: [1, 2, 4, 7, 8, 13, 17, 22, 28, 30, 32, 35, 39, 42, 48, 50, 53, 58, 60]

## Aggregate Statistics

| Model | N | MAE ↓ | RMSE ↓ | Exact ↑ | ±1 Acc ↑ | Pearson r | Avg Conf | Runtime/ind |
|---|---|---|---|---|---|---|---|---|
| `qwen3.5:35b` | 19 | 0.605 | 0.769 | 36.8% | 100.0% | 0.108 | 0.78 | 32.5s |
| `deepseek-r1:32b` | 19 | 1.395 | 1.825 | 21.1% | 63.2% | 0.148 | 0.83 | 79.9s |
| `mistral-small3.2:24b` | 19 | 2.184 | 2.598 | 21.1% | 31.6% | 0.204 | 0.53 | 13.6s |

## Per-Type Breakdown

| Model | Type | N | MAE ↓ | Exact ↑ | ±1 Acc ↑ | Score=0 |
|---|---|---|---|---|---|---|
| `qwen3.5:35b` | qualitative | 9 | 0.44 | 55.6% | 100.0% | 0 |
| `qwen3.5:35b` | composite | 4 | 0.88 | 0.0% | 100.0% | 0 |
| `qwen3.5:35b` | quantitative | 6 | 0.67 | 33.3% | 100.0% | 0 |
| `deepseek-r1:32b` | qualitative | 9 | 1.11 | 33.3% | 77.8% | 1 |
| `deepseek-r1:32b` | composite | 4 | 0.88 | 25.0% | 75.0% | 0 |
| `deepseek-r1:32b` | quantitative | 6 | 2.17 | 0.0% | 33.3% | 2 |
| `mistral-small3.2:24b` | qualitative | 9 | 2.89 | 0.0% | 11.1% | 7 |
| `mistral-small3.2:24b` | composite | 4 | 3.12 | 0.0% | 0.0% | 3 |
| `mistral-small3.2:24b` | quantitative | 6 | 0.50 | 66.7% | 83.3% | 0 |
