#!/usr/bin/env python
"""RAGAS worker — reads one JSON request on stdin, writes one JSON result on stdout.

Input:  {"metric": "faithfulness"|"answer_relevancy"|"context_recall",
         "input": "...", "reference": "...", "output": "..."}
Output: {"score": 0..1, "note": "..."}

Requires: pip install ragas datasets
"""
from __future__ import annotations

import json
import sys
from typing import Any


def _fallback_score(metric: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Deterministic fallback (matches the Node-side mock) so runs don't crash."""
    has_ref = bool(payload.get("reference"))
    out_len = len(payload.get("output") or "")
    base = 0.5 + (0.2 if has_ref else 0.0) + 0.2 * min(1.0, out_len / 400.0)
    if metric == "faithfulness" and not has_ref:
        base -= 0.2
    return {"score": max(0.0, min(1.0, base)), "note": "python-fallback"}


def _run_with_ragas(metric: str, payload: dict[str, Any]) -> dict[str, Any]:
    try:
        from datasets import Dataset  # type: ignore
        from ragas import evaluate  # type: ignore
        from ragas.metrics import (  # type: ignore
            faithfulness, answer_relevancy, context_recall,
        )
    except Exception as e:  # noqa: BLE001
        return {**_fallback_score(metric, payload),
                "note": f"ragas import failed: {e}"}

    m_map = {
        "faithfulness": faithfulness,
        "answer_relevancy": answer_relevancy,
        "context_recall": context_recall,
    }
    metric_fn = m_map.get(metric)
    if metric_fn is None:
        return {**_fallback_score(metric, payload), "note": f"unknown metric {metric}"}

    sample = {
        "question": [payload.get("input", "")],
        "answer": [payload.get("output", "")],
        "contexts": [[payload.get("reference") or payload.get("input", "")]],
        "ground_truth": [payload.get("reference") or ""],
    }
    try:
        ds = Dataset.from_dict(sample)
        result = evaluate(ds, metrics=[metric_fn])
        # result.scores is a pandas-like structure keyed by metric name
        val = None
        try:
            val = float(result.to_pandas().iloc[0][metric])
        except Exception:
            try:
                val = float(result[metric])  # type: ignore[index]
            except Exception:
                val = None
        if val is None:
            return {**_fallback_score(metric, payload), "note": "ragas returned nothing"}
        return {"score": val, "note": "ragas"}
    except Exception as e:  # noqa: BLE001
        return {**_fallback_score(metric, payload), "note": f"ragas eval failed: {e}"}


def main() -> None:
    line = sys.stdin.readline().strip()
    if not line:
        print(json.dumps({"score": 0.0, "note": "empty request"}))
        return
    payload = json.loads(line)
    metric = payload.get("metric", "faithfulness")
    result = _run_with_ragas(metric, payload)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
