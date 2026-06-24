"""将外部 AI 分析好的错题 JSON 导入本地错题本 API。

用法:
    python scripts/import_json.py result.json
    python scripts/import_json.py result.json --api http://localhost:8000

JSON 格式与 POST /api/upload/import 一致：
    {
      "questions": [
        {
          "subject_id": 2,
          "knowledge_point_name": "导数与单调性",
          "question_pattern_name": "含参求单调区间",
          ...
        }
      ]
    }

需要先注册/登录拿到 token（脚本自动走 register 兜底）。
"""

import argparse
import json
import os
import sys
import urllib.request
import urllib.error


def resolve_token(api_base: str) -> str:
    """从本地缓存读取 token，若无则自动注册。"""
    token_file = os.path.join(os.path.dirname(__file__), ".import_token")
    if os.path.exists(token_file):
        with open(token_file) as f:
            token = f.read().strip()
            if token:
                # 验证 token 是否有效
                req = urllib.request.Request(
                    f"{api_base}/api/auth/me",
                    headers={"Authorization": f"Bearer {token}"},
                )
                try:
                    with urllib.request.urlopen(req) as resp:
                        return token
                except urllib.error.HTTPError:
                    pass  # token 过期，重新注册

    # 自动注册
    nickname = os.environ.get("CUOTIBEN_USER", "import-bot")
    passphrase = os.environ.get("CUOTIBEN_PASS", "import2026")

    print(f"🔐 首次使用，自动注册 (昵称: {nickname})...")
    body = json.dumps({"nickname": nickname, "passphrase": passphrase}).encode()
    req = urllib.request.Request(
        f"{api_base}/api/auth/register",
        data=body,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())
    token = data["data"]["token"]

    with open(token_file, "w") as f:
        f.write(token)
    print(f"✅ 已登录，token 缓存至 {token_file}")
    return token


def import_questions(api_base: str, token: str, questions: list) -> dict:
    """发送导入请求。"""
    body = json.dumps({"questions": questions}).encode()
    req = urllib.request.Request(
        f"{api_base}/api/upload/import",
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def main():
    parser = argparse.ArgumentParser(description="导入 Claude 分析好的错题 JSON")
    parser.add_argument("file", help="JSON 文件路径")
    parser.add_argument(
        "--api", default="http://localhost:8000", help="后端 API 地址 (默认 http://localhost:8000)"
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="仅检查 JSON 格式，不实际导入"
    )
    args = parser.parse_args()

    # 读取 JSON
    with open(args.file, encoding="utf-8") as f:
        raw = f.read()

    # 支持从 Claude 输出中自动提取 JSON（去掉 markdown 代码块包裹）
    if "```json" in raw:
        raw = raw.split("```json")[1].split("```")[0]
    elif "```" in raw:
        raw = raw.split("```")[1].split("```")[0]

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"❌ JSON 解析失败: {e}")
        sys.exit(1)

    # 兼容两种格式：裸数组 vs {"questions": [...]}
    if isinstance(data, list):
        questions = data
    elif isinstance(data, dict) and "questions" in data:
        questions = data["questions"]
    else:
        print("❌ JSON 格式错误：顶层必须是数组或包含 'questions' 字段的对象")
        sys.exit(1)

    if not questions:
        print("❌ 没有可导入的题目（questions 为空）")
        sys.exit(1)

    # 基本校验
    required = ["subject_id", "question_content"]
    for i, q in enumerate(questions):
        for field in required:
            if field not in q:
                print(f"❌ 第 {i+1} 道题缺少必填字段: {field}")
                sys.exit(1)

    print(f"📋 共 {len(questions)} 道题待导入")

    if args.dry_run:
        print("✅ JSON 格式校验通过（--dry-run，未实际导入）")
        for i, q in enumerate(questions):
            print(f"  {i+1}. [{q['subject_id']}] {q.get('knowledge_point_name', '未分类')} — {q['question_content'][:40]}...")
        return

    # 获取 token
    token = resolve_token(args.api)

    # 导入
    try:
        result = import_questions(args.api, token, questions)
        saved = result.get("data", {}).get("saved_count", 0)
        ids = result.get("data", {}).get("saved_ids", [])
        print(f"✅ 导入成功！已入库 {saved} 道错题")
        if ids:
            print(f"   ID: {ids}")
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"❌ API 错误 ({e.code}): {body}")
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"❌ 无法连接后端 ({args.api}): {e.reason}")
        print("   请确认后端已启动: uvicorn main:app --reload --port 8000")
        sys.exit(1)


if __name__ == "__main__":
    main()
