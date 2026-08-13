# Benchmark Report — AMI Assessment

Reference: `data/reference_scores_claude.csv` (Claude as preliminary annotator)

## Aggregate Statistics

| Model | N | MAE ↓ | RMSE ↓ | Exact ↑ | ±1 Acc ↑ | Pearson r ↑ | Avg Conf | Runtime/ind |
|---|---|---|---|---|---|---|---|---|
| `qwen3.5:35b` | 7 | 0.571 | 0.756 | 42.9% | 100.0% | 0.354 | 0.78 | 30.2s |
| `deepseek-r1:32b` | 7 | 0.714 | 1.254 | 57.1% | 85.7% | 0.415 | 0.74 | 68.2s |
| `mistral-small3.2:24b` | 7 | 1.810 | 2.153 | 14.3% | 42.9% | 0.339 | 0.88 | 14.1s |

## Per-Indicator Scores

| No | Ref | deepseek-r1:32b | mistral-small3.2:24b | qwen3.5:35b |
|---|---|---|---|---|
| 14 | 3.0 | 3.0 ✓ | 3.0 ✓ | 3.0 ✓ |
| 15 | 3.0 | 3.0 ✓ | 2.3 | 3.0 ✓ |
| 16 | 3.0 | 3.0 ✓ | 0.0 ✗ | 4.0 |
| 17 | 2.0 | 1.0 | 0.0 ✗ | 3.0 |
| 20 | 3.0 | 0.0 ✗ | 0.0 ✗ | 3.0 ✓ |
| 22 | 3.0 | 2.0 | 0.0 ✗ | 4.0 |
| 24 | 3.0 | 3.0 ✓ | 4.0 | 4.0 |

## Per-Type Breakdown

| Model | Type | N | MAE ↓ | Exact ↑ | ±1 Acc ↑ | Score=0 (false-refusal proxy) |
|---|---|---|---|---|---|---|
| `qwen3.5:35b` | qualitative | 4 | 0.75 | 25.0% | 100.0% | 0 |
| `qwen3.5:35b` | composite | 3 | 0.33 | 66.7% | 100.0% | 0 |
| `deepseek-r1:32b` | qualitative | 4 | 1.25 | 25.0% | 75.0% | 1 |
| `deepseek-r1:32b` | composite | 3 | 0.00 | 100.0% | 100.0% | 0 |
| `mistral-small3.2:24b` | qualitative | 4 | 2.25 | 0.0% | 25.0% | 3 |
| `mistral-small3.2:24b` | composite | 3 | 1.22 | 33.3% | 66.7% | 1 |

## Legend

- ✓ = exact match with reference
- (no marker) = within ±1 of reference (acceptable)
- ✗ = differ by > 1 from reference (significant disagreement)
- — = no score produced (error or null output)
