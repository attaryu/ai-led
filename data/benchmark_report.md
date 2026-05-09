# Benchmark Report — AMI Assessment

Reference: `data/reference_scores_claude.csv` (Claude as preliminary annotator)

## Aggregate Statistics

| Model | N | MAE ↓ | RMSE ↓ | Exact ↑ | ±1 Acc ↑ | Pearson r ↑ | Avg Conf | Runtime/ind |
|---|---|---|---|---|---|---|---|---|
| `qwen3.5:35b` | 19 | 0.342 | 0.574 | 63.2% | 100.0% | 0.537 | 0.78 | 25.6s |
| `deepseek-r1:32b` | 19 | 1.047 | 1.384 | 26.3% | 73.7% | 0.189 | 0.85 | 66.3s |
| `mistral-small3.2:24b` | 19 | 2.026 | 2.547 | 26.3% | 42.1% | 0.232 | 0.48 | 15.4s |

## Per-Indicator Scores

| No | Ref | deepseek-r1:32b | mistral-small3.2:24b | qwen3.5:35b |
|---|---|---|---|---|
| 1 | 3.0 | 4.0 | 0.0 ✗ | 3.0 ✓ |
| 2 | 3.0 | 3.0 ✓ | 0.0 ✗ | 3.0 ✓ |
| 4 | 2.0 | 1.0 | 2.0 ✓ | 3.0 |
| 7 | 3.0 | 1.0 ✗ | 0.0 ✗ | 3.0 ✓ |
| 8 | 4.0 | 1.0 ✗ | 0.0 ✗ | 4.0 ✓ |
| 13 | 3.0 | 4.0 | 3.0 ✓ | 3.0 ✓ |
| 17 | 2.0 | 3.0 | 0.0 ✗ | 3.0 |
| 22 | 3.0 | 3.0 ✓ | 0.0 ✗ | 3.0 ✓ |
| 28 | 4.0 | 3.0 | 4.0 ✓ | 4.0 ✓ |
| 30 | 3.0 | 2.0 | 4.0 | 3.0 ✓ |
| 32 | 4.0 | 2.0 ✗ | 0.0 ✗ | 3.0 |
| 35 | 3.0 | 2.0 | 1.0 ✗ | 3.0 ✓ |
| 39 | 4.0 | 4.0 ✓ | 0.0 ✗ | 4.0 ✓ |
| 42 | 4.0 | 3.6 | 4.0 ✓ | 3.0 |
| 48 | 4.0 | 1.0 ✗ | 0.0 ✗ | 4.0 ✓ |
| 50 | 4.0 | 4.0 ✓ | 4.0 ✓ | 3.0 |
| 53 | 3.5 | 2.0 ✗ | 0.0 ✗ | 4.0 |
| 58 | 4.0 | 3.0 | 3.0 | 4.0 ✓ |
| 60 | 4.0 | 4.0 ✓ | 3.0 | 3.0 |

## Legend

- ✓ = exact match with reference
- (no marker) = within ±1 of reference (acceptable)
- ✗ = differ by > 1 from reference (significant disagreement)
- — = no score produced (error or null output)
