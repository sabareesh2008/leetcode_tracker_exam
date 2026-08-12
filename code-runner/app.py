from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
import json
import os
import pathlib
import shutil
import subprocess
import tempfile

app = FastAPI(title="ECE Java 21 Code Runner")

raw_origins = os.getenv("ALLOWED_ORIGINS", "*")
allowed_origins = [
    item.strip()
    for item in raw_origins.split(",")
    if item.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins or ["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

MAX_SOURCE = 50_000
COMPILE_TIMEOUT = 10
DEFAULT_TIME_LIMIT_MS = 3000

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.getenv(
    "SUPABASE_SERVICE_ROLE_KEY",
    "",
)


class RunRequest(BaseModel):
    source_code: str = Field(max_length=MAX_SOURCE)
    stdin: str = ""
    time_limit_ms: int = DEFAULT_TIME_LIMIT_MS


class Case(BaseModel):
    input: str = ""
    expected_output: str
    hidden: bool = True
    marks: float = 0


class JudgeRequest(BaseModel):
    source_code: str = Field(max_length=MAX_SOURCE)
    test_cases: List[Case]
    time_limit_ms: int = DEFAULT_TIME_LIMIT_MS


class JudgeQuestionRequest(BaseModel):
    question_id: str
    source_code: str = Field(max_length=MAX_SOURCE)


def normalize(value: str) -> str:
    return "\n".join(
        line.rstrip()
        for line in (value or "").strip().splitlines()
    )


def compile_java(source_code: str, directory: str):
    pathlib.Path(directory, "Main.java").write_text(
        source_code,
        encoding="utf-8",
    )

    try:
        result = subprocess.run(
            ["javac", "-encoding", "UTF-8", "Main.java"],
            cwd=directory,
            text=True,
            capture_output=True,
            timeout=COMPILE_TIMEOUT,
        )
    except subprocess.TimeoutExpired:
        return False, "Compilation timed out."

    return result.returncode == 0, result.stderr


def execute_java(directory: str, stdin: str, time_limit_ms: int):
    timeout_seconds = max(
        0.5,
        min(
            10.0,
            float(time_limit_ms or DEFAULT_TIME_LIMIT_MS) / 1000.0,
        ),
    )

    try:
        result = subprocess.run(
            ["java", "-Xms16m", "-Xmx128m", "-cp", directory, "Main"],
            cwd=directory,
            input=stdin or "",
            text=True,
            capture_output=True,
            timeout=timeout_seconds,
        )

        return {
            "status": "Success" if result.returncode == 0 else "Runtime Error",
            "stdout": result.stdout[-20_000:],
            "stderr": result.stderr[-20_000:],
            "exit_code": result.returncode,
        }

    except subprocess.TimeoutExpired:
        return {
            "status": "Time Limit Exceeded",
            "stdout": "",
            "stderr": "Execution exceeded the time limit.",
            "exit_code": 124,
        }


def judge_cases(source_code: str, cases, time_limit_ms: int):
    directory = tempfile.mkdtemp(prefix="ece-java-judge-")

    try:
        compiled, compile_error = compile_java(
            source_code,
            directory,
        )

        if not compiled:
            return {
                "status": "Compilation Error",
                "compile_error": compile_error,
                "results": [],
                "score": 0,
                "passed": 0,
                "total": len(cases),
            }

        results = []
        total_score = 0.0
        passed_count = 0

        for case in cases:
            if isinstance(case, dict):
                case_input = case.get("input", "")
                expected = case.get("expected_output", "")
                hidden = bool(
                    case.get("is_hidden", case.get("hidden", True))
                )
                marks = float(case.get("marks", 0) or 0)
            else:
                case_input = case.input
                expected = case.expected_output
                hidden = case.hidden
                marks = float(case.marks or 0)

            execution = execute_java(
                directory,
                case_input,
                time_limit_ms,
            )

            passed = (
                execution["exit_code"] == 0
                and normalize(execution["stdout"]) == normalize(expected)
            )

            if passed:
                passed_count += 1
                total_score += marks

            results.append(
                {
                    "passed": passed,
                    "status": execution["status"],
                    "output": "Hidden" if hidden else execution["stdout"],
                    "expected": "Hidden" if hidden else expected,
                }
            )

        return {
            "status": "Judged",
            "results": results,
            "score": total_score,
            "passed": passed_count,
            "total": len(results),
        }

    finally:
        shutil.rmtree(directory, ignore_errors=True)


def supabase_get(table_name: str, params: dict):
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(
            status_code=503,
            detail=(
                "Hidden judge is not configured. "
                "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the runner."
            ),
        )

    url = (
        f"{SUPABASE_URL}/rest/v1/{table_name}?"
        f"{urlencode(params)}"
    )

    request = Request(
        url,
        headers={
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "Accept": "application/json",
        },
        method="GET",
    )

    try:
        with urlopen(request, timeout=10) as response:
            return json.loads(
                response.read().decode("utf-8")
            )

    except HTTPError as error:
        body = error.read().decode(
            "utf-8",
            errors="replace",
        )

        raise HTTPException(
            status_code=502,
            detail=f"Supabase error {error.code}: {body[:500]}",
        )

    except URLError as error:
        raise HTTPException(
            status_code=502,
            detail=f"Cannot reach Supabase: {error.reason}",
        )


@app.get("/health")
def health():
    return {
        "ok": True,
        "jdk": "21",
        "hidden_judge_ready": bool(
            SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
        ),
    }


@app.post("/run")
def run_code(request: RunRequest):
    directory = tempfile.mkdtemp(prefix="ece-java-run-")

    try:
        compiled, compile_error = compile_java(
            request.source_code,
            directory,
        )

        if not compiled:
            return {
                "status": "Compilation Error",
                "compile_error": compile_error,
                "stdout": "",
                "stderr": compile_error,
            }

        return execute_java(
            directory,
            request.stdin,
            request.time_limit_ms,
        )

    finally:
        shutil.rmtree(directory, ignore_errors=True)


@app.post("/judge")
def judge(request: JudgeRequest):
    if len(request.test_cases) > 50:
        raise HTTPException(
            status_code=400,
            detail="Maximum 50 test cases per request.",
        )

    return judge_cases(
        request.source_code,
        request.test_cases,
        request.time_limit_ms,
    )


@app.post("/judge-question")
def judge_question(request: JudgeQuestionRequest):
    question_rows = supabase_get(
        "coding_questions",
        {
            "select": "id,time_limit_ms",
            "id": f"eq.{request.question_id}",
            "limit": "1",
        },
    )

    if not question_rows:
        raise HTTPException(
            status_code=404,
            detail="Question not found.",
        )

    time_limit_ms = int(
        question_rows[0].get("time_limit_ms")
        or DEFAULT_TIME_LIMIT_MS
    )

    cases = supabase_get(
        "coding_test_cases",
        {
            "select": "input,expected_output,is_hidden,marks",
            "question_id": f"eq.{request.question_id}",
            "order": "id.asc",
        },
    )

    if not cases:
        raise HTTPException(
            status_code=400,
            detail="No test cases configured for this question.",
        )

    return judge_cases(
        request.source_code,
        cases,
        time_limit_ms,
    )
