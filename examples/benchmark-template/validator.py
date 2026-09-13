import json


def validate(workspace):
    summary_path = workspace / "summary.json"
    try:
        summary = json.loads(summary_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return {
            "passed": False,
            "checks": [
                {
                    "passed": False,
                    "message": "summary.json must contain valid UTF-8 JSON",
                    "path": "summary.json",
                }
            ],
        }

    count_matches = summary.get("paidOrderCount") == 2
    total_matches = summary.get("paidTotal") == 42
    checks = [
        {
            "passed": count_matches,
            "message": "paidOrderCount equals 2",
            "path": "summary.json",
        },
        {
            "passed": total_matches,
            "message": "paidTotal equals 42",
            "path": "summary.json",
        },
    ]
    return {"passed": all(check["passed"] for check in checks), "checks": checks}
