import os
import json
import asyncio
import logging
from openai import AsyncOpenAI
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
DEEPSEEK_MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-v4-pro")

def _client():
    return AsyncOpenAI(api_key=DEEPSEEK_API_KEY or "mock-key", base_url="https://api.deepseek.com/v1")

async def _chat_json(system: str, user: str) -> dict:
    resp = await _client().chat.completions.create(
        model=DEEPSEEK_MODEL,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        response_format={"type": "json_object"},
        temperature=0.3)
    return json.loads(resp.choices[0].message.content)

PARSE_SYSTEM = (
    "你是资深高中全科老师。分析题目并输出 JSON，字段："
    "question_content(题目原文), question_type(choice/fill_blank/essay 三选一), "
    "correct_answer(正确答案), solution_steps(解题步骤), subject(科目，六科之一), "
    "knowledge_point_name(知识点名称)。只输出 JSON。")

async def parse_question(ocr_text: str, student_answer: str = "") -> dict:
    if not DEEPSEEK_API_KEY:
        await asyncio.sleep(0)
        return {"question_content": ocr_text, "question_type": "essay",
                "correct_answer": "（mock）a 的取值范围是 [3, +∞)", "solution_steps": "（mock）求导后分离参数。",
                "subject": "数学", "knowledge_point_name": "导数与单调性"}
    try:
        user = f"题目文字：\n{ocr_text}\n学生答案：{student_answer or '无'}"
        return await _chat_json(PARSE_SYSTEM, user)
    except Exception as e:
        logger.error(f"parse_question 失败: {e}")
        return {}

CLASSIFY_SYSTEM = (
    "你是高中错题分析老师。基于题目、正确答案、学生答案，输出 JSON，字段："
    "error_analysis(错因分析), improvement_tips(改进建议), "
    "error_category: 五选一枚举 — 'concept'(概念不清)/'calculation'(计算失误)/"
    "'reading'(审题偏差)/'careless'(粗心)/'method'(方法错误), "
    "error_category_detail(具体描述，如 '混淆了正弦定理的适用条件，错用了余弦定理'), "
    "matched_knowledge_point(从已有知识点中选最合适的；都不合适则给新名称), "
    "matched_question_pattern(从已有题型中选最合适的；都不合适则给新名称), "
    "is_new_knowledge_point(bool), is_new_question_pattern(bool)。只输出 JSON。")

async def classify_question(question: str, correct_answer: str, student_answer: str,
                            existing_kps: list[str], existing_patterns: list[str]) -> dict:
    if not DEEPSEEK_API_KEY:
        await asyncio.sleep(0)
        kp = existing_kps[0] if existing_kps else "导数与单调性"
        pat = existing_patterns[0] if existing_patterns else "导数求单调区间"
        return {"error_analysis": "（mock）忽略了端点取等。", "improvement_tips": "（mock）注意 ≥ 与 > 的区别。",
                "error_category": "concept", "error_category_detail": "（mock）对导数定义理解有偏差",
                "matched_knowledge_point": kp, "matched_question_pattern": pat,
                "is_new_knowledge_point": not existing_kps, "is_new_question_pattern": not existing_patterns}
    try:
        user = (f"题目：{question}\n正确答案：{correct_answer}\n学生答案：{student_answer or '无'}\n"
                f"已有知识点：{existing_kps or '无'}\n已有题型：{existing_patterns or '无'}")
        return await _chat_json(CLASSIFY_SYSTEM, user)
    except Exception as e:
        logger.error(f"classify_question 失败: {e}")
        return {}

ANALYZE_SYSTEM = (
    "你是资深高中全科老师 + 错题分析专家。给定一段题目文字（可能含一道或多道题）和学生答案，"
    "拆分出每一道独立题目并逐题完成完整分析。\n"
    "输出 JSON，字段 questions 为数组，每项含：\n"
    "question_content(题目原文), question_type(choice/fill_blank/essay 三选一), "
    "correct_answer(正确答案), solution_steps(解题步骤), "
    "subject(科目，六选一：语文/数学/英语/物理/化学/生物), "
    "error_analysis(错因分析), improvement_tips(改进建议), "
    "error_category(五选一枚举：'concept'(概念不清)/'calculation'(计算失误)/"
    "'reading'(审题偏差)/'careless'(粗心)/'method'(方法错误)), "
    "error_category_detail(具体描述，如 '混淆了正弦定理的适用条件'), "
    "matched_knowledge_point(从「已有知识点」中选最合适的；都不合适则给新名称), "
    "matched_question_pattern(从「已有题型」中选最合适的；都不合适则给新名称)。\n"
    "整段只有一道题时 questions 只含一项。只输出 JSON。")


async def analyze_questions_full(
    ocr_text: str, student_answer: str,
    existing_kps: list[str], existing_patterns: list[str],
) -> list[dict]:
    """一次 DeepSeek 调用完成 拆分 + 解析 + 错因分类 + 知识点/题型匹配。

    替代原先的 split_questions → parse_question → classify_question 三次串行调用，
    把单题录入从 3 次模型调用降到 1 次。返回每题的完整字段数组。
    """
    if not DEEPSEEK_API_KEY:
        await asyncio.sleep(0)
        kp = existing_kps[0] if existing_kps else "导数与单调性"
        pat = existing_patterns[0] if existing_patterns else "导数求单调区间"
        return [{
            "question_content": ocr_text,
            "question_type": "essay",
            "correct_answer": "（mock）a 的取值范围是 [3, +∞)",
            "solution_steps": "（mock）求导后分离参数。",
            "subject": "数学",
            "error_analysis": "（mock）忽略了端点取等。",
            "improvement_tips": "（mock）注意 ≥ 与 > 的区别。",
            "error_category": "concept",
            "error_category_detail": "（mock）对导数定义理解有偏差",
            "matched_knowledge_point": kp,
            "matched_question_pattern": pat,
        }]
    try:
        user = (f"题目文字：\n{ocr_text}\n学生答案：{student_answer or '无'}\n"
                f"已有知识点：{existing_kps or '无'}\n已有题型：{existing_patterns or '无'}")
        out = await _chat_json(ANALYZE_SYSTEM, user)
        items = out.get("questions", []) if isinstance(out, dict) else []
        return items[:10]  # 单次上传最多 10 题
    except Exception as e:
        logger.error(f"analyze_questions_full 失败: {e}")
        return []


SIMILAR_SYSTEM = (
    "你是高考命题老师。基于给定错题及其错因，生成 3 道同类变式练习题。"
    "若错因是计算失误 → 偏计算量变式、改数字结构；"
    "若错因是审题偏差 → 偏条件变化、题干陷阱变式；"
    "若错因是概念不清 → 偏核心概念直接考察、去冗余信息；"
    "若错因是粗心或方法错误 → 改场景但保留解题框架。"
    "输出 JSON，字段 questions 为数组，每项含 content(题目), answer(答案), solution(解析)。只输出 JSON。")

async def generate_similar(question: str, knowledge_point: str, question_pattern: str,
                           question_type: str = "essay") -> list[dict]:
    if not DEEPSEEK_API_KEY:
        await asyncio.sleep(0)
        return [
            {"content": f"（mock）相似题{i}：基于「{knowledge_point}」的{question_pattern}练习。",
             "answer": "（mock）答案", "solution": "（mock）解析步骤"}
            for i in range(1, 4)]
    try:
        user = (f"原题：{question}\n知识点：{knowledge_point}\n题型/方法：{question_pattern}\n"
                f"题目类型：{question_type}")
        out = await _chat_json(SIMILAR_SYSTEM, user)
        items = out.get("questions", []) if isinstance(out, dict) else []
        return items[:3]
    except Exception as e:
        logger.error(f"generate_similar 失败: {e}")
        return []

RELATIONS_SYSTEM = (
    "你是高中学科知识体系专家。给定同一科目下的知识点列表，分析它们之间的逻辑关系。"
    "输出 JSON，字段 relations 为数组，每项含 source(起始知识点名), target(关联知识点名), "
    "relation_type(前置/相关/延伸 三选一)。只在确有关系时连线，不要全连。只输出 JSON。")

async def analyze_relations(subject: str, knowledge_points: list[str]) -> list[dict]:
    if len(knowledge_points) < 2:
        return []
    if not DEEPSEEK_API_KEY:
        await asyncio.sleep(0)
        # mock：相邻知识点串成「相关」链，给前端图谱一个可见结构
        return [{"source": a, "target": b, "relation_type": "相关"}
                for a, b in zip(knowledge_points, knowledge_points[1:])]
    try:
        user = f"科目：{subject}\n知识点列表：{knowledge_points}"
        out = await _chat_json(RELATIONS_SYSTEM, user)
        return out.get("relations", []) if isinstance(out, dict) else []
    except Exception as e:
        logger.error(f"analyze_relations 失败: {e}")
        return []
