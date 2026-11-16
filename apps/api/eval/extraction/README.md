# Extraction quality evaluation (AC-42)

This folder holds the 50 developer-written samples and the scoring script. It is the input for AC-42. The requester will add 10–20 real-world samples later.

The evaluation calls the real DeepSeek API, so it is **not part of CI**. Run it by hand whenever you change the extraction prompts, change models, or upgrade Graphiti, and put the scores in the development report.

## Files

| File | Purpose |
| --- | --- |
| `samples.jsonl` | 50 Chinese Entries, 10 per category: 口语 (`oral-*`), 补记 (`backfill-*`), 同名 (`samename-*`), 转述 (`hearsay-*`), 冲突 (`conflict-*`) |
| `score.py` | Scores a predictions file against the samples (standard library only) |

`tests/unit/test_eval_extraction.py` checks the dataset (counts, valid gold Drafts, the date-precision and conflict rules) and the scorer. It never calls an API.

## Sample format (one JSON object per line)

```json
{
  "id": "conflict-03",
  "category": "冲突",
  "text": "小李跟我说他上个月跳槽去了阿里",
  "occurred_date": "2026-11-16",
  "precision": "day",
  "graph_context": {
    "persons": [
      {"id": "self", "name": "陈明", "aliases": ["我"], "is_self": true},
      {"id": "p-li", "name": "李磊", "aliases": ["小李"], "note": "前同事"}
    ],
    "facts": [
      {"subject": "p-li", "predicate": "WORKS_AT", "object": "字节跳动", "confidence": "self_told"}
    ]
  },
  "gold": { "...": "a Draft, see contracts/draft.schema.json" }
}
```

Field notes:

- **`occurred_date` and `precision`.** The Entry's occurred date: `YYYY`, `YYYY-MM` or `YYYY-MM-DD`, with precision `year`, `month` or `day`.
  - No date is after 2026-11-16.
  - A gold `valid_at` / `met_at` is the relative time already converted, and is never more precise than the Entry (AC-8).
- **`graph_context`.** The graph that exists before this Entry is extracted.
  - Feed it to the extraction pipeline as pre-seeded Persons (with Aliases) and Facts.
  - The Self person always has id `self`.
  - 同名 and 冲突 samples rely on it.
- **`gold`.** A valid `Draft` (`weft.domain.draft.Draft`), in the same shape the pipeline produces.
  - `persons` gives each mention's expected match: `matched` + `person_id`, `ambiguous` + `candidates`, or `new`.
  - `relationships[].types` gives category, subtype and the original wording.
  - `facts`, `feelings` and `profile` each carry a Confidence.
  - In 冲突 samples, `facts[].conflict` follows the rule 亲历 = 本人说 > 转述 > 推测.
- **Fact predicates.** `WORKS_AT`, `STUDIED_AT`, `LIVES_IN`, `HAS_TRAIT`, `LIKES`, `DISLIKES`, `EXPERIENCED`, `HAS_ETIQUETTE`, `OPINION` (subject = the judged person), and `RELATED_EVENT` (an event between people).
- **Directional kin subtypes.** These read as "pair[0] 是 pair[1] 的 X".

## Metrics and thresholds

| Metric | Threshold | Definition |
| --- | --- | --- |
| Person F1 | ≥ 0.9 | Micro F1 over `(mention, match, person_id)` tuples. `person_id` counts only when `matched`; candidates are not compared. Self is excluded. A wrong match counts as one FP plus one FN. |
| Relationship-type accuracy | ≥ 0.8 | Share of gold `(unordered pair, category, subtype)` triples that also appear in the prediction. The original wording is not scored. |
| Confidence accuracy | ≥ 0.8 | Share of gold items with a matching predicted item whose Confidence is equal. Items are facts, relationships, feelings and profile. `confidence_coverage` reports how many gold items were matched. |

How a gold item is matched to a predicted item:

| Item | Match rule |
| --- | --- |
| Fact | Same subject, and one object contains the other |
| Relationship | Same unordered pair |
| Feeling | Same `from`, `to` and `dimension` |
| Profile | Same person and field |

If a sample has no prediction, it is scored as an empty Draft and listed under `missing_predictions`.

## Running

1. Produce predictions with the real pipeline. A runner script comes with the extraction service in batch 1/2; it needs `DEEPSEEK_API_KEY` and `DASHSCOPE_API_KEY`. For each sample, seed `graph_context`, extract the `text` with `occurred_date` as the reference time, and write `{"id": ..., "draft": <Draft JSON>}` per line.
2. Score the predictions:

   ```bash
   cd apps/api
   uv run python eval/extraction/score.py predictions.jsonl
   ```

   The script prints a JSON report. It exits with 1 if any metric is below its threshold.
