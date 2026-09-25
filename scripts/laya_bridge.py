#!/usr/bin/env python3
"""Tiny stdio bridge: Node MergeGuard -> local Python Laya. No server."""
import json
import sys


def main():
    payload = json.load(sys.stdin)
    from laya import Router

    router = Router(preload=False)
    questions = payload["questions"]
    model = payload.get("model")
    max_len = int(payload.get("max_len") or 4096)
    output = []
    for item in payload.get("items", []):
        kwargs = {"max_len": max_len}
        if model:
            kwargs["model"] = model
        result = router.predict(item["state"], questions, **kwargs)
        output.append({"id": item.get("id"), "answers": result.get("answers", {}), "routing": result.get("routing")})
    json.dump({"items": output}, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
