"""Recompute published evidence bookkeeping, not model or religious accuracy."""
from pathlib import Path
import hashlib
import json
import statistics

root = Path(__file__).resolve().parents[1]

def load(path):
    return json.loads((root / path).read_text(encoding="utf-8"))

def digest(data):
    return hashlib.sha256(data).hexdigest()

embedding = load("data-cards/rag/embedding-receipt.json")["record"]
assert embedding["rows_embedded"] + embedding["already_embedded_at_start"] == embedding["mapping_rows"]
assert embedding["total_embedded_from_frozen_ids"] == embedding["mapping_rows"]
retrieval = load("data-cards/rag/retrieval-experiment.json")["records"]
assert len({row["id"] for row in retrieval}) == len(retrieval)
assert all(len(row["top5"]) <= 5 for row in retrieval)
pairing = load("evidence/comparative-cases-20261006.json")
for pair in pairing["pairs"]:
    assert digest(pair["question"].encode()) == pair["question_sha256"]
    assert len(pair["records"]) == 2
    assert pair["records"][0]["persona"] != pair["records"][1]["persona"]
witnesses = load("evidence/current-witnesses-20261006.json")
for case in witnesses["cases"]:
    assert case["clicked_counter"] == len(case["opened_verse_locators"])
    assert digest((root / case["image"]).read_bytes()) == case["sha256"]
rows = load("evaluation/mission50-comparison.json")["records"]
operational = {}
for phase in ("before", "after"):
    values = [row[phase] for row in rows]
    operational[phase] = {
        "cases": len(values),
        "http_200": sum(row["http_status"] == 200 for row in values),
        "nonempty_answers": sum(row["answer_chars"] > 0 for row in values),
        "median_seconds": round(statistics.median(row["seconds"] for row in values if isinstance(row["seconds"], (int, float))), 2),
    }
print(json.dumps({
    "embedding_snapshot_rows": embedding["mapping_rows"],
    "retrieval_record_count": len(retrieval),
    "retrieval_rows_with_declared_expected_rank": sum(row["expected_rank"] is not None for row in retrieval),
    "historical_paired_questions": len(pairing["pairs"]),
    "current_witness_images_hash_checked": len(witnesses["cases"]),
    "historical_operational_metrics": operational,
    "meaning": "Published metadata arithmetic and asset integrity only. Not a new experiment, current service acceptance, causal comparison, or accuracy score.",
}, ensure_ascii=False, indent=2))
