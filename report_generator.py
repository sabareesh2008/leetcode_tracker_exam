#!/usr/bin/env python3
"""
ECE LeetCode Platform - Automated Daily / Weekly Email Reports

Data sources:
- LiveData.csv       -> LeetCode tracker metrics
- Supabase           -> students, Daily Challenge, Daily Coding Test

Email:
- Resend REST API
- REPORT_TO_EMAILS supports comma/semicolon/newline-separated recipients.
- Recipients are sent in chunks of 50 (Resend API limit per email request).

Environment variables:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  RESEND_API_KEY
  REPORT_FROM_EMAIL
  REPORT_TO_EMAILS
  REPORT_REPLY_TO              optional
"""

from __future__ import annotations

import argparse
import base64
import html
import json
import os
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable
from zoneinfo import ZoneInfo

import pandas as pd
import requests
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak

ROOT = Path(__file__).resolve().parent
LIVE_DATA_PATH = ROOT / "LiveData.csv"
REPORT_DIR = ROOT / "reports"

IST = ZoneInfo("Asia/Kolkata")
RESEND_ENDPOINT = "https://api.resend.com/emails"
MAX_RECIPIENTS_PER_EMAIL = 50
REQUEST_TIMEOUT = 30

SECTIONS = ["ECE A", "ECE B", "ECE C", "ECE D", "ECE E", "ECE F"]


@dataclass
class Config:
    supabase_url: str
    supabase_key: str
    resend_key: str
    from_email: str
    recipients: list[str]
    reply_to: str | None


def env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def parse_recipients(raw: str) -> list[str]:
    """Parse comma/semicolon/newline-separated emails and remove duplicates."""
    normalized = raw.replace(";", ",").replace("\n", ",")
    seen: set[str] = set()
    result: list[str] = []

    for item in normalized.split(","):
        address = item.strip()
        if not address:
            continue
        lower = address.lower()
        if lower in seen:
            continue
        if "@" not in address or address.startswith("@") or address.endswith("@"):
            raise ValueError(f"Invalid report recipient email: {address}")
        seen.add(lower)
        result.append(address)

    return result


def load_config(require_email: bool = True) -> Config:
    recipients = parse_recipients(env("REPORT_TO_EMAILS"))

    config = Config(
        supabase_url=env("SUPABASE_URL").rstrip("/"),
        supabase_key=env("SUPABASE_SERVICE_ROLE_KEY"),
        resend_key=env("RESEND_API_KEY"),
        from_email=env(
            "REPORT_FROM_EMAIL",
            "ECE LeetCode Reports <onboarding@resend.dev>",
        ),
        recipients=recipients,
        reply_to=env("REPORT_REPLY_TO") or None,
    )

    missing = []
    if not config.supabase_url:
        missing.append("SUPABASE_URL")
    if not config.supabase_key:
        missing.append("SUPABASE_SERVICE_ROLE_KEY")

    if require_email:
        if not config.resend_key:
            missing.append("RESEND_API_KEY")
        if not config.recipients:
            missing.append("REPORT_TO_EMAILS")
        if not config.from_email:
            missing.append("REPORT_FROM_EMAIL")

    if missing:
        raise RuntimeError(
            "Missing required environment variable(s): " + ", ".join(missing)
        )

    return config


def safe_int(value: Any) -> int:
    try:
        if pd.isna(value):
            return 0
        return int(float(value))
    except (TypeError, ValueError):
        return 0


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def percent(numerator: float, denominator: float) -> float:
    return (numerator / denominator * 100.0) if denominator else 0.0


def chunks(items: list[str], size: int) -> Iterable[list[str]]:
    for index in range(0, len(items), size):
        yield items[index:index + size]


def ist_now() -> datetime:
    return datetime.now(IST)


def iso_date_ist() -> str:
    return ist_now().date().isoformat()


def parse_datetime(value: Any) -> datetime | None:
    """Parse Supabase timestamps and return an IST-aware datetime when possible."""
    if value is None or value == "":
        return None
    try:
        text = str(value).replace("Z", "+00:00")
        dt = datetime.fromisoformat(text)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(IST)
    except (TypeError, ValueError):
        return None


def supabase_get(
    config: Config,
    table: str,
    params: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    response = requests.get(
        f"{config.supabase_url}/rest/v1/{table}",
        headers={
            "apikey": config.supabase_key,
            "Authorization": f"Bearer {config.supabase_key}",
            "Accept": "application/json",
        },
        params=params or {"select": "*"},
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, list):
        raise RuntimeError(f"Unexpected Supabase response for {table}")
    return payload


def load_live_data() -> pd.DataFrame:
    if not LIVE_DATA_PATH.exists():
        raise FileNotFoundError(f"Missing {LIVE_DATA_PATH.name}")

    frame = pd.read_csv(LIVE_DATA_PATH, dtype={"Register Number": str})
    required = {
        "Section",
        "Register Number",
        "Student Name",
        "Problems Solved",
        "Solved Today",
        "Last 7 Days",
        "Last 30 Days",
        "Status",
    }
    missing = sorted(required - set(frame.columns))
    if missing:
        raise RuntimeError(
            "LiveData.csv is missing required column(s): " + ", ".join(missing)
        )

    frame["Register Number"] = (
        frame["Register Number"].fillna("").astype(str).str.strip()
    )
    frame["Section"] = frame["Section"].fillna("").astype(str).str.strip()

    for column in [
        "Problems Solved",
        "Solved Today",
        "Last 7 Days",
        "Last 30 Days",
        "Easy",
        "Medium",
        "Hard",
    ]:
        if column in frame.columns:
            frame[column] = pd.to_numeric(
                frame[column], errors="coerce"
            ).fillna(0).astype(int)

    return frame


def index_students(
    live: pd.DataFrame,
    supabase_students: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}

    for _, row in live.iterrows():
        register = str(row.get("Register Number", "")).strip()
        if not register:
            continue
        result[register] = {
            "register_number": register,
            "student_name": str(row.get("Student Name", "")).strip(),
            "section": str(row.get("Section", "")).strip(),
        }

    for student in supabase_students:
        register = str(student.get("register_number", "")).strip()
        if not register:
            continue
        current = result.setdefault(register, {"register_number": register})
        if student.get("student_name"):
            current["student_name"] = str(student["student_name"]).strip()
        if student.get("section"):
            current["section"] = str(student["section"]).strip()

    return result


def daily_challenge_stats(
    today: str,
    challenges: list[dict[str, Any]],
    results: list[dict[str, Any]],
    total_students: int,
) -> dict[str, Any]:
    challenge = next(
        (
            item
            for item in challenges
            if str(item.get("challenge_date", "")) == today
        ),
        None,
    )

    if not challenge:
        return {
            "exists": False,
            "title": "No Daily Challenge posted",
            "completed": 0,
            "pending": total_students,
            "completion_rate": 0.0,
        }

    challenge_id = str(challenge.get("id"))
    completed_registers = {
        str(item.get("register_number", "")).strip()
        for item in results
        if str(item.get("challenge_id")) == challenge_id
        and bool(item.get("completed"))
    }
    completed_registers.discard("")

    completed = len(completed_registers)
    return {
        "exists": True,
        "title": (
            challenge.get("title")
            or challenge.get("problem_title")
            or challenge.get("problem_name")
            or "Daily Challenge"
        ),
        "completed": completed,
        "pending": max(total_students - completed, 0),
        "completion_rate": percent(completed, total_students),
    }


def coding_tests_in_window(
    tests: list[dict[str, Any]],
    start: datetime,
    end: datetime,
) -> list[dict[str, Any]]:
    selected = []
    for test in tests:
        dt = parse_datetime(test.get("starts_at"))
        if dt and start <= dt < end:
            selected.append(test)
    return selected


def coding_test_summary(
    tests: list[dict[str, Any]],
    attempts: list[dict[str, Any]],
    total_students: int,
) -> dict[str, Any]:
    test_ids = {str(test.get("id")) for test in tests}
    finals = [
        attempt
        for attempt in attempts
        if str(attempt.get("test_id")) in test_ids
        and attempt.get("status") in ("submitted", "expired")
    ]

    unique_attendees = {
        str(item.get("register_number", "")).strip()
        for item in finals
        if item.get("register_number")
    }
    passed = sum(
        1 for item in finals if item.get("result_status") == "passed"
    )
    failed = len(finals) - passed
    total_cases = sum(safe_int(item.get("total_cases")) for item in finals)
    passed_cases = sum(safe_int(item.get("passed_cases")) for item in finals)
    violations = sum(
        safe_int(item.get("violation_count")) for item in finals
    )

    score_percentages: list[float] = []
    test_by_id = {str(test.get("id")): test for test in tests}
    for attempt in finals:
        test = test_by_id.get(str(attempt.get("test_id")), {})
        total_marks = float(test.get("total_marks") or 0)
        if total_marks > 0:
            score_percentages.append(
                float(attempt.get("total_score") or 0) / total_marks * 100
            )

    return {
        "tests_conducted": len(tests),
        "attended": len(unique_attendees),
        "not_attended": max(total_students - len(unique_attendees), 0)
        if len(tests) == 1
        else None,
        "passed": passed,
        "failed": failed,
        "pass_rate": percent(passed, len(finals)),
        "average_score": (
            sum(score_percentages) / len(score_percentages)
            if score_percentages
            else 0.0
        ),
        "passed_cases": passed_cases,
        "total_cases": total_cases,
        "violations": violations,
    }


def section_leetcode_summary(live: pd.DataFrame) -> list[dict[str, Any]]:
    rows = []
    sections = SECTIONS + sorted(
        {
            value
            for value in live["Section"].dropna().astype(str)
            if value and value not in SECTIONS
        }
    )
    for section in sections:
        subset = live[live["Section"] == section]
        if subset.empty:
            continue
        rows.append(
            {
                "section": section,
                "students": len(subset),
                "today": int(subset["Solved Today"].sum()),
                "week": int(subset["Last 7 Days"].sum()),
                "month": int(subset["Last 30 Days"].sum()),
                "active_today": int((subset["Solved Today"] > 0).sum()),
            }
        )
    return rows


def top_students(
    live: pd.DataFrame,
    metric: str,
    count: int = 10,
) -> list[dict[str, Any]]:
    if metric not in live.columns:
        return []

    ordered = live.sort_values(
        by=[metric, "Problems Solved"],
        ascending=[False, False],
        kind="stable",
    ).head(count)

    return [
        {
            "name": row.get("Student Name", "Student"),
            "register": row.get("Register Number", ""),
            "section": row.get("Section", ""),
            "value": safe_int(row.get(metric)),
            "total": safe_int(row.get("Problems Solved")),
        }
        for _, row in ordered.iterrows()
    ]


def bottom_students_week(live: pd.DataFrame, count: int = 10) -> list[dict[str, Any]]:
    ordered = live.sort_values(
        by=["Last 7 Days", "Problems Solved"],
        ascending=[True, True],
        kind="stable",
    ).head(count)

    return [
        {
            "name": row.get("Student Name", "Student"),
            "register": row.get("Register Number", ""),
            "section": row.get("Section", ""),
            "value": safe_int(row.get("Last 7 Days")),
            "total": safe_int(row.get("Problems Solved")),
        }
        for _, row in ordered.iterrows()
    ]


def table_html(headers: list[str], rows: list[list[Any]]) -> str:
    if not rows:
        return '<p class="muted">No data available.</p>'

    head = "".join(f"<th>{esc(item)}</th>" for item in headers)
    body = "".join(
        "<tr>" + "".join(f"<td>{esc(cell)}</td>" for cell in row) + "</tr>"
        for row in rows
    )

    return f"""
    <div class="table-wrap">
      <table>
        <thead><tr>{head}</tr></thead>
        <tbody>{body}</tbody>
      </table>
    </div>
    """


def report_shell(title: str, subtitle: str, content: str) -> str:
    return f"""<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {{
    margin: 0; padding: 0; background: #f3f6fa;
    font-family: Arial, Helvetica, sans-serif; color: #172033;
  }}
  .wrap {{ max-width: 920px; margin: 0 auto; padding: 24px; }}
  .hero {{
    background: #101b31; color: white; border-radius: 18px;
    padding: 28px; margin-bottom: 18px;
  }}
  .hero h1 {{ margin: 0 0 7px; font-size: 25px; }}
  .hero p {{ margin: 0; color: #bdc9dd; }}
  .card {{
    background: white; border-radius: 16px; padding: 20px;
    margin-bottom: 16px; border: 1px solid #e5eaf1;
  }}
  .card h2 {{ margin: 0 0 14px; font-size: 18px; }}
  .kpis {{
    display: grid; grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }}
  .kpi {{
    border: 1px solid #e7ebf1; border-radius: 12px;
    padding: 14px; background: #fafbfd;
  }}
  .kpi span {{ display: block; color: #657189; font-size: 12px; }}
  .kpi strong {{ display: block; margin-top: 7px; font-size: 23px; }}
  table {{ border-collapse: collapse; width: 100%; font-size: 13px; }}
  th, td {{ text-align: left; padding: 10px; border-bottom: 1px solid #e7ebf1; }}
  th {{ background: #f7f9fc; color: #4c5870; }}
  .table-wrap {{ overflow-x: auto; }}
  .muted {{ color: #6e788a; }}
  .footer {{ text-align: center; color: #818b9c; font-size: 11px; padding: 10px; }}
  @media (max-width: 680px) {{
    .kpis {{ grid-template-columns: 1fr 1fr; }}
    .wrap {{ padding: 12px; }}
  }}
</style>
</head>
<body>
  <div class="wrap">
    <div class="hero">
      <h1>{esc(title)}</h1>
      <p>{esc(subtitle)}</p>
    </div>
    {content}
    <div class="footer">
      Generated automatically by the ECE LeetCode Leaderboard platform.
    </div>
  </div>
</body>
</html>"""


def build_daily_report(
    live: pd.DataFrame,
    challenge: dict[str, Any],
    coding: dict[str, Any],
    report_date: str,
) -> tuple[str, str]:
    total_students = len(live)
    active_today = int((live["Solved Today"] > 0).sum())
    solved_today = int(live["Solved Today"].sum())
    invalid = int((live["Status"].astype(str).str.lower() != "success").sum())

    top = top_students(live, "Solved Today", 10)
    sections = section_leetcode_summary(live)

    coding_not_attended = coding.get("not_attended")
    if coding_not_attended is None:
        coding_not_attended_text = "—"
    else:
        coding_not_attended_text = str(coding_not_attended)

    content = f"""
    <div class="card">
      <h2>LeetCode Tracker · Today</h2>
      <div class="kpis">
        <div class="kpi"><span>Total Students</span><strong>{total_students}</strong></div>
        <div class="kpi"><span>Active Today</span><strong>{active_today}</strong></div>
        <div class="kpi"><span>Problems Solved Today</span><strong>{solved_today}</strong></div>
        <div class="kpi"><span>Inactive Today</span><strong>{max(total_students-active_today,0)}</strong></div>
        <div class="kpi"><span>Invalid / Error Profiles</span><strong>{invalid}</strong></div>
        <div class="kpi"><span>Activity Rate</span><strong>{percent(active_today,total_students):.1f}%</strong></div>
      </div>
    </div>

    <div class="card">
      <h2>Daily Challenge</h2>
      <p><strong>{esc(challenge["title"])}</strong></p>
      <div class="kpis">
        <div class="kpi"><span>Completed</span><strong>{challenge["completed"]}</strong></div>
        <div class="kpi"><span>Pending</span><strong>{challenge["pending"]}</strong></div>
        <div class="kpi"><span>Completion</span><strong>{challenge["completion_rate"]:.1f}%</strong></div>
      </div>
    </div>

    <div class="card">
      <h2>Daily Coding Test</h2>
      <div class="kpis">
        <div class="kpi"><span>Tests Conducted</span><strong>{coding["tests_conducted"]}</strong></div>
        <div class="kpi"><span>Attended</span><strong>{coding["attended"]}</strong></div>
        <div class="kpi"><span>Not Attended</span><strong>{coding_not_attended_text}</strong></div>
        <div class="kpi"><span>Passed</span><strong>{coding["passed"]}</strong></div>
        <div class="kpi"><span>Failed</span><strong>{coding["failed"]}</strong></div>
        <div class="kpi"><span>Pass Rate</span><strong>{coding["pass_rate"]:.1f}%</strong></div>
      </div>
    </div>

    <div class="card">
      <h2>Top 10 · Solved Today</h2>
      {table_html(
          ["#", "Student", "Register No.", "Section", "Solved Today", "Total"],
          [
              [i, item["name"], item["register"], item["section"], item["value"], item["total"]]
              for i, item in enumerate(top, 1)
          ],
      )}
    </div>

    <div class="card">
      <h2>Section Summary</h2>
      {table_html(
          ["Section", "Students", "Active Today", "Solved Today", "7 Days", "30 Days"],
          [
              [x["section"], x["students"], x["active_today"], x["today"], x["week"], x["month"]]
              for x in sections
          ],
      )}
    </div>
    """

    subject = f"ECE LeetCode Daily Report · {report_date}"
    return subject, report_shell(
        "ECE LeetCode Daily Report",
        f"{report_date} · LeetCode + Daily Challenge + Coding Test",
        content,
    )


def build_weekly_report(
    live: pd.DataFrame,
    challenges: list[dict[str, Any]],
    challenge_results: list[dict[str, Any]],
    coding: dict[str, Any],
    start_date: str,
    end_date: str,
) -> tuple[str, str]:
    total_students = len(live)
    active_week = int((live["Last 7 Days"] > 0).sum())
    solved_week = int(live["Last 7 Days"].sum())

    top = top_students(live, "Last 7 Days", 10)
    bottom = bottom_students_week(live, 10)
    sections = section_leetcode_summary(live)

    challenge_ids = {
        str(item.get("id"))
        for item in challenges
        if start_date <= str(item.get("challenge_date", "")) <= end_date
    }
    weekly_results = [
        result
        for result in challenge_results
        if str(result.get("challenge_id")) in challenge_ids
        and bool(result.get("completed"))
    ]
    unique_completed_pairs = {
        (
            str(item.get("challenge_id")),
            str(item.get("register_number", "")).strip(),
        )
        for item in weekly_results
        if item.get("register_number")
    }
    challenges_posted = len(challenge_ids)
    possible_completions = total_students * challenges_posted
    completed_challenges = len(unique_completed_pairs)

    content = f"""
    <div class="card">
      <h2>LeetCode Tracker · Last 7 Days</h2>
      <div class="kpis">
        <div class="kpi"><span>Total Students</span><strong>{total_students}</strong></div>
        <div class="kpi"><span>Active This Week</span><strong>{active_week}</strong></div>
        <div class="kpi"><span>Problems Solved</span><strong>{solved_week}</strong></div>
        <div class="kpi"><span>Inactive This Week</span><strong>{max(total_students-active_week,0)}</strong></div>
        <div class="kpi"><span>Weekly Activity Rate</span><strong>{percent(active_week,total_students):.1f}%</strong></div>
        <div class="kpi"><span>Avg Problems / Student</span><strong>{(solved_week/total_students if total_students else 0):.1f}</strong></div>
      </div>
    </div>

    <div class="card">
      <h2>Daily Challenge · Weekly</h2>
      <div class="kpis">
        <div class="kpi"><span>Challenges Posted</span><strong>{challenges_posted}</strong></div>
        <div class="kpi"><span>Total Completions</span><strong>{completed_challenges}</strong></div>
        <div class="kpi"><span>Completion Rate</span><strong>{percent(completed_challenges,possible_completions):.1f}%</strong></div>
      </div>
    </div>

    <div class="card">
      <h2>Coding Tests · Weekly</h2>
      <div class="kpis">
        <div class="kpi"><span>Tests Conducted</span><strong>{coding["tests_conducted"]}</strong></div>
        <div class="kpi"><span>Unique Students Attended</span><strong>{coding["attended"]}</strong></div>
        <div class="kpi"><span>Passed Attempts</span><strong>{coding["passed"]}</strong></div>
        <div class="kpi"><span>Failed Attempts</span><strong>{coding["failed"]}</strong></div>
        <div class="kpi"><span>Pass Rate</span><strong>{coding["pass_rate"]:.1f}%</strong></div>
        <div class="kpi"><span>Violations</span><strong>{coding["violations"]}</strong></div>
      </div>
    </div>

    <div class="card">
      <h2>Top 10 · Last 7 Days</h2>
      {table_html(
          ["#", "Student", "Register No.", "Section", "7 Days", "Total"],
          [
              [i, item["name"], item["register"], item["section"], item["value"], item["total"]]
              for i, item in enumerate(top, 1)
          ],
      )}
    </div>

    <div class="card">
      <h2>Bottom 10 · Last 7 Days</h2>
      {table_html(
          ["#", "Student", "Register No.", "Section", "7 Days", "Total"],
          [
              [i, item["name"], item["register"], item["section"], item["value"], item["total"]]
              for i, item in enumerate(bottom, 1)
          ],
      )}
    </div>

    <div class="card">
      <h2>Section Performance</h2>
      {table_html(
          ["Section", "Students", "7-Day Solved", "30-Day Solved", "Active Today"],
          [
              [x["section"], x["students"], x["week"], x["month"], x["active_today"]]
              for x in sections
          ],
      )}
    </div>
    """

    subject = f"ECE LeetCode Weekly Report · {start_date} to {end_date}"
    return subject, report_shell(
        "ECE LeetCode Weekly Report",
        f"{start_date} to {end_date} · LeetCode + Daily Challenge + Coding Tests",
        content,
    )



def _xlsx_title_format(workbook):
    return workbook.add_format({
        "bold": True,
        "font_size": 16,
        "font_color": "#FFFFFF",
        "bg_color": "#101B31",
        "align": "center",
        "valign": "vcenter",
    })


def _xlsx_header_format(workbook):
    return workbook.add_format({
        "bold": True,
        "font_color": "#FFFFFF",
        "bg_color": "#1F4E78",
        "border": 1,
        "align": "center",
        "valign": "vcenter",
    })


def _xlsx_kpi_label(workbook):
    return workbook.add_format({
        "bold": True,
        "font_color": "#5B6578",
        "bg_color": "#F4F7FB",
        "border": 1,
    })


def _xlsx_kpi_value(workbook):
    return workbook.add_format({
        "bold": True,
        "font_size": 13,
        "border": 1,
        "align": "center",
    })


def _write_dataframe_sheet(
    writer: pd.ExcelWriter,
    sheet_name: str,
    frame: pd.DataFrame,
    title: str,
) -> None:
    frame.to_excel(
        writer,
        sheet_name=sheet_name,
        index=False,
        startrow=2,
    )

    workbook = writer.book
    worksheet = writer.sheets[sheet_name]

    title_format = _xlsx_title_format(workbook)
    header_format = _xlsx_header_format(workbook)

    max_col = max(len(frame.columns) - 1, 0)
    worksheet.merge_range(0, 0, 0, max_col, title, title_format)

    for col_index, column in enumerate(frame.columns):
        worksheet.write(2, col_index, column, header_format)
        max_len = max(
            len(str(column)),
            *(len(str(value)) for value in frame[column].head(200).tolist()),
        )
        worksheet.set_column(
            col_index,
            col_index,
            min(max(max_len + 2, 11), 34),
        )

    worksheet.freeze_panes(3, 0)
    worksheet.autofilter(2, 0, 2 + len(frame), max_col)


def generate_daily_excel(
    live: pd.DataFrame,
    challenge: dict[str, Any],
    coding: dict[str, Any],
    report_date: str,
) -> Path:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    path = REPORT_DIR / f"ECE_Daily_Report_{report_date}.xlsx"

    top = top_students(live, "Solved Today", 10)
    sections = section_leetcode_summary(live)

    total_students = len(live)
    active_today = int((live["Solved Today"] > 0).sum())
    solved_today = int(live["Solved Today"].sum())
    invalid = int(
        (live["Status"].astype(str).str.lower() != "success").sum()
    )

    summary_rows = [
        ["Report Date", report_date],
        ["Total Students", total_students],
        ["Active Today", active_today],
        ["Problems Solved Today", solved_today],
        ["Inactive Today", max(total_students - active_today, 0)],
        ["Invalid / Error Profiles", invalid],
        ["Activity Rate", f"{percent(active_today, total_students):.1f}%"],
        ["Daily Challenge", challenge["title"]],
        ["Challenge Completed", challenge["completed"]],
        ["Challenge Pending", challenge["pending"]],
        ["Challenge Completion", f'{challenge["completion_rate"]:.1f}%'],
        ["Coding Tests Conducted", coding["tests_conducted"]],
        ["Coding Test Attended", coding["attended"]],
        ["Coding Test Passed", coding["passed"]],
        ["Coding Test Failed", coding["failed"]],
        ["Coding Test Pass Rate", f'{coding["pass_rate"]:.1f}%'],
    ]

    top_frame = pd.DataFrame([
        {
            "Rank": i,
            "Student": item["name"],
            "Register Number": item["register"],
            "Section": item["section"],
            "Solved Today": item["value"],
            "Total Solved": item["total"],
        }
        for i, item in enumerate(top, 1)
    ])

    section_frame = pd.DataFrame([
        {
            "Section": item["section"],
            "Students": item["students"],
            "Active Today": item["active_today"],
            "Solved Today": item["today"],
            "7 Days": item["week"],
            "30 Days": item["month"],
        }
        for item in sections
    ])

    full_columns = [
        column for column in [
            "Register Number",
            "Student Name",
            "Section",
            "Solved Today",
            "Last 7 Days",
            "Last 30 Days",
            "Problems Solved",
            "Easy",
            "Medium",
            "Hard",
            "Status",
        ]
        if column in live.columns
    ]
    student_frame = live[full_columns].copy()

    with pd.ExcelWriter(
        path,
        engine="xlsxwriter",
    ) as writer:
        workbook = writer.book

        summary = workbook.add_worksheet("Summary")
        writer.sheets["Summary"] = summary
        title_format = _xlsx_title_format(workbook)
        label_format = _xlsx_kpi_label(workbook)
        value_format = _xlsx_kpi_value(workbook)

        summary.merge_range(
            "A1:B1",
            "ECE LeetCode Daily Report",
            title_format,
        )
        summary.set_column("A:A", 30)
        summary.set_column("B:B", 28)

        for row_index, (label, value) in enumerate(summary_rows, start=2):
            summary.write(row_index - 1, 0, label, label_format)
            summary.write(row_index - 1, 1, value, value_format)

        _write_dataframe_sheet(
            writer,
            "Top 10 Today",
            top_frame,
            "Top 10 - Solved Today",
        )
        _write_dataframe_sheet(
            writer,
            "Section Summary",
            section_frame,
            "ECE Section Summary",
        )
        _write_dataframe_sheet(
            writer,
            "Student Data",
            student_frame,
            "Student Activity Data",
        )

    return path


def generate_weekly_excel(
    live: pd.DataFrame,
    challenges: list[dict[str, Any]],
    challenge_results: list[dict[str, Any]],
    coding: dict[str, Any],
    start_date: str,
    end_date: str,
) -> Path:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    path = REPORT_DIR / f"ECE_Weekly_Report_{start_date}_to_{end_date}.xlsx"

    total_students = len(live)
    active_week = int((live["Last 7 Days"] > 0).sum())
    solved_week = int(live["Last 7 Days"].sum())

    top = top_students(live, "Last 7 Days", 10)
    bottom = bottom_students_week(live, 10)
    sections = section_leetcode_summary(live)

    challenge_ids = {
        str(item.get("id"))
        for item in challenges
        if start_date <= str(item.get("challenge_date", "")) <= end_date
    }
    weekly_results = [
        result
        for result in challenge_results
        if str(result.get("challenge_id")) in challenge_ids
        and bool(result.get("completed"))
    ]
    completion_pairs = {
        (
            str(item.get("challenge_id")),
            str(item.get("register_number", "")).strip(),
        )
        for item in weekly_results
        if item.get("register_number")
    }
    possible = total_students * len(challenge_ids)

    summary_rows = [
        ["Period", f"{start_date} to {end_date}"],
        ["Total Students", total_students],
        ["Active Last 7 Days", active_week],
        ["Problems Solved Last 7 Days", solved_week],
        ["Inactive Last 7 Days", max(total_students - active_week, 0)],
        ["Weekly Activity Rate", f"{percent(active_week, total_students):.1f}%"],
        ["Average Problems / Student", f"{(solved_week / total_students if total_students else 0):.1f}"],
        ["Challenges Posted", len(challenge_ids)],
        ["Challenge Completions", len(completion_pairs)],
        ["Challenge Completion Rate", f"{percent(len(completion_pairs), possible):.1f}%"],
        ["Coding Tests Conducted", coding["tests_conducted"]],
        ["Unique Students Attended", coding["attended"]],
        ["Passed Attempts", coding["passed"]],
        ["Failed Attempts", coding["failed"]],
        ["Pass Rate", f'{coding["pass_rate"]:.1f}%'],
        ["Violations", coding["violations"]],
    ]

    def performer_frame(items, label):
        return pd.DataFrame([
            {
                "Rank": i,
                "Student": item["name"],
                "Register Number": item["register"],
                "Section": item["section"],
                label: item["value"],
                "Total Solved": item["total"],
            }
            for i, item in enumerate(items, 1)
        ])

    section_frame = pd.DataFrame([
        {
            "Section": item["section"],
            "Students": item["students"],
            "7-Day Solved": item["week"],
            "30-Day Solved": item["month"],
            "Active Today": item["active_today"],
        }
        for item in sections
    ])

    full_columns = [
        column for column in [
            "Register Number",
            "Student Name",
            "Section",
            "Last 7 Days",
            "Last 30 Days",
            "Solved Today",
            "Problems Solved",
            "Easy",
            "Medium",
            "Hard",
            "Status",
        ]
        if column in live.columns
    ]

    with pd.ExcelWriter(path, engine="xlsxwriter") as writer:
        workbook = writer.book
        summary = workbook.add_worksheet("Summary")
        writer.sheets["Summary"] = summary

        summary.merge_range(
            "A1:B1",
            "ECE LeetCode Weekly Report",
            _xlsx_title_format(workbook),
        )
        summary.set_column("A:A", 31)
        summary.set_column("B:B", 29)

        for row_index, (label, value) in enumerate(summary_rows, start=2):
            summary.write(
                row_index - 1,
                0,
                label,
                _xlsx_kpi_label(workbook),
            )
            summary.write(
                row_index - 1,
                1,
                value,
                _xlsx_kpi_value(workbook),
            )

        _write_dataframe_sheet(
            writer,
            "Top 10",
            performer_frame(top, "7 Days"),
            "Top 10 - Last 7 Days",
        )
        _write_dataframe_sheet(
            writer,
            "Bottom 10",
            performer_frame(bottom, "7 Days"),
            "Bottom 10 - Last 7 Days",
        )
        _write_dataframe_sheet(
            writer,
            "Section Summary",
            section_frame,
            "ECE Section Performance",
        )
        _write_dataframe_sheet(
            writer,
            "Student Data",
            live[full_columns].copy(),
            "Student Weekly Activity Data",
        )

    return path


def _pdf_styles():
    styles = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "ReportTitle",
            parent=styles["Title"],
            alignment=TA_CENTER,
            fontSize=19,
            leading=23,
            textColor=colors.HexColor("#101B31"),
            spaceAfter=8,
        ),
        "subtitle": ParagraphStyle(
            "ReportSubtitle",
            parent=styles["Normal"],
            alignment=TA_CENTER,
            fontSize=9,
            leading=12,
            textColor=colors.HexColor("#667085"),
            spaceAfter=14,
        ),
        "heading": ParagraphStyle(
            "ReportHeading",
            parent=styles["Heading2"],
            fontSize=12,
            leading=15,
            textColor=colors.HexColor("#1F4E78"),
            spaceBefore=8,
            spaceAfter=7,
        ),
        "normal": ParagraphStyle(
            "ReportNormal",
            parent=styles["Normal"],
            fontSize=8.5,
            leading=11,
        ),
    }


def _pdf_table(data: list[list[Any]], widths=None) -> Table:
    safe = [
        [
            Paragraph(esc(value), getSampleStyleSheet()["BodyText"])
            for value in row
        ]
        for row in data
    ]
    table = Table(
        safe,
        colWidths=widths,
        repeatRows=1,
        hAlign="LEFT",
    )
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1F4E78")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 7.5),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#D0D5DD")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [
            colors.white,
            colors.HexColor("#F8FAFC"),
        ]),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return table


def generate_daily_pdf(
    live: pd.DataFrame,
    challenge: dict[str, Any],
    coding: dict[str, Any],
    report_date: str,
) -> Path:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    path = REPORT_DIR / f"ECE_Daily_Report_{report_date}.pdf"
    styles = _pdf_styles()

    doc = SimpleDocTemplate(
        str(path),
        pagesize=landscape(A4),
        rightMargin=12 * mm,
        leftMargin=12 * mm,
        topMargin=12 * mm,
        bottomMargin=12 * mm,
        title=f"ECE LeetCode Daily Report - {report_date}",
    )

    total_students = len(live)
    active_today = int((live["Solved Today"] > 0).sum())
    solved_today = int(live["Solved Today"].sum())
    invalid = int(
        (live["Status"].astype(str).str.lower() != "success").sum()
    )
    top = top_students(live, "Solved Today", 10)
    sections = section_leetcode_summary(live)

    story = [
        Paragraph("ECE LeetCode Daily Report", styles["title"]),
        Paragraph(
            f"{report_date} - LeetCode + Daily Challenge + Coding Test",
            styles["subtitle"],
        ),
        Paragraph("LeetCode Tracker", styles["heading"]),
        _pdf_table([
            ["Metric", "Value"],
            ["Total Students", total_students],
            ["Active Today", active_today],
            ["Problems Solved Today", solved_today],
            ["Inactive Today", max(total_students - active_today, 0)],
            ["Invalid / Error Profiles", invalid],
            ["Activity Rate", f"{percent(active_today, total_students):.1f}%"],
        ], [65 * mm, 35 * mm]),
        Spacer(1, 7),
        Paragraph("Daily Challenge", styles["heading"]),
        _pdf_table([
            ["Challenge", "Completed", "Pending", "Completion"],
            [
                challenge["title"],
                challenge["completed"],
                challenge["pending"],
                f'{challenge["completion_rate"]:.1f}%',
            ],
        ], [100 * mm, 35 * mm, 35 * mm, 35 * mm]),
        Spacer(1, 7),
        Paragraph("Daily Coding Test", styles["heading"]),
        _pdf_table([
            ["Tests", "Attended", "Passed", "Failed", "Pass Rate"],
            [
                coding["tests_conducted"],
                coding["attended"],
                coding["passed"],
                coding["failed"],
                f'{coding["pass_rate"]:.1f}%',
            ],
        ]),
        Spacer(1, 7),
        Paragraph("Top 10 - Solved Today", styles["heading"]),
        _pdf_table(
            [["#", "Student", "Register No.", "Section", "Today", "Total"]] +
            [
                [
                    i,
                    item["name"],
                    item["register"],
                    item["section"],
                    item["value"],
                    item["total"],
                ]
                for i, item in enumerate(top, 1)
            ]
        ),
        PageBreak(),
        Paragraph("Section Summary", styles["heading"]),
        _pdf_table(
            [["Section", "Students", "Active Today", "Solved Today", "7 Days", "30 Days"]] +
            [
                [
                    item["section"],
                    item["students"],
                    item["active_today"],
                    item["today"],
                    item["week"],
                    item["month"],
                ]
                for item in sections
            ]
        ),
    ]

    doc.build(story)
    return path


def generate_weekly_pdf(
    live: pd.DataFrame,
    challenges: list[dict[str, Any]],
    challenge_results: list[dict[str, Any]],
    coding: dict[str, Any],
    start_date: str,
    end_date: str,
) -> Path:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    path = REPORT_DIR / f"ECE_Weekly_Report_{start_date}_to_{end_date}.pdf"
    styles = _pdf_styles()

    doc = SimpleDocTemplate(
        str(path),
        pagesize=landscape(A4),
        rightMargin=12 * mm,
        leftMargin=12 * mm,
        topMargin=12 * mm,
        bottomMargin=12 * mm,
        title=f"ECE LeetCode Weekly Report - {start_date} to {end_date}",
    )

    total_students = len(live)
    active_week = int((live["Last 7 Days"] > 0).sum())
    solved_week = int(live["Last 7 Days"].sum())
    top = top_students(live, "Last 7 Days", 10)
    bottom = bottom_students_week(live, 10)
    sections = section_leetcode_summary(live)

    challenge_ids = {
        str(item.get("id"))
        for item in challenges
        if start_date <= str(item.get("challenge_date", "")) <= end_date
    }
    weekly_results = [
        result
        for result in challenge_results
        if str(result.get("challenge_id")) in challenge_ids
        and bool(result.get("completed"))
    ]
    completion_pairs = {
        (
            str(item.get("challenge_id")),
            str(item.get("register_number", "")).strip(),
        )
        for item in weekly_results
        if item.get("register_number")
    }
    possible = total_students * len(challenge_ids)

    story = [
        Paragraph("ECE LeetCode Weekly Report", styles["title"]),
        Paragraph(
            f"{start_date} to {end_date} - LeetCode + Daily Challenge + Coding Tests",
            styles["subtitle"],
        ),
        Paragraph("LeetCode Tracker - Last 7 Days", styles["heading"]),
        _pdf_table([
            ["Metric", "Value"],
            ["Total Students", total_students],
            ["Active This Week", active_week],
            ["Problems Solved", solved_week],
            ["Inactive This Week", max(total_students - active_week, 0)],
            ["Weekly Activity Rate", f"{percent(active_week, total_students):.1f}%"],
            ["Avg Problems / Student", f"{(solved_week/total_students if total_students else 0):.1f}"],
        ], [65 * mm, 35 * mm]),
        Spacer(1, 7),
        Paragraph("Daily Challenge - Weekly", styles["heading"]),
        _pdf_table([
            ["Challenges Posted", "Total Completions", "Completion Rate"],
            [
                len(challenge_ids),
                len(completion_pairs),
                f"{percent(len(completion_pairs), possible):.1f}%",
            ],
        ]),
        Spacer(1, 7),
        Paragraph("Coding Tests - Weekly", styles["heading"]),
        _pdf_table([
            ["Tests", "Unique Attended", "Passed", "Failed", "Pass Rate", "Violations"],
            [
                coding["tests_conducted"],
                coding["attended"],
                coding["passed"],
                coding["failed"],
                f'{coding["pass_rate"]:.1f}%',
                coding["violations"],
            ],
        ]),
        Spacer(1, 7),
        Paragraph("Top 10 - Last 7 Days", styles["heading"]),
        _pdf_table(
            [["#", "Student", "Register No.", "Section", "7 Days", "Total"]] +
            [
                [
                    i,
                    item["name"],
                    item["register"],
                    item["section"],
                    item["value"],
                    item["total"],
                ]
                for i, item in enumerate(top, 1)
            ]
        ),
        PageBreak(),
        Paragraph("Bottom 10 - Last 7 Days", styles["heading"]),
        _pdf_table(
            [["#", "Student", "Register No.", "Section", "7 Days", "Total"]] +
            [
                [
                    i,
                    item["name"],
                    item["register"],
                    item["section"],
                    item["value"],
                    item["total"],
                ]
                for i, item in enumerate(bottom, 1)
            ]
        ),
        Spacer(1, 10),
        Paragraph("Section Performance", styles["heading"]),
        _pdf_table(
            [["Section", "Students", "7-Day Solved", "30-Day Solved", "Active Today"]] +
            [
                [
                    item["section"],
                    item["students"],
                    item["week"],
                    item["month"],
                    item["active_today"],
                ]
                for item in sections
            ]
        ),
    ]

    doc.build(story)
    return path


def encode_attachment(path: Path) -> dict[str, str]:
    content = base64.b64encode(path.read_bytes()).decode("ascii")
    return {
        "filename": path.name,
        "content": content,
    }



def send_resend_email(
    config: Config,
    subject: str,
    html_body: str,
    attachment_paths: list[Path],
) -> list[str]:
    if not config.recipients:
        raise RuntimeError("No report recipients configured.")

    message_ids: list[str] = []

    for group in chunks(config.recipients, MAX_RECIPIENTS_PER_EMAIL):
        payload: dict[str, Any] = {
            "from": config.from_email,
            "to": group,
            "subject": subject,
            "html": html_body,
            "attachments": [
                encode_attachment(path)
                for path in attachment_paths
            ],
        }
        if config.reply_to:
            payload["reply_to"] = config.reply_to

        response = requests.post(
            RESEND_ENDPOINT,
            headers={
                "Authorization": f"Bearer {config.resend_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=REQUEST_TIMEOUT,
        )

        if response.status_code >= 400:
            raise RuntimeError(
                f"Resend send failed ({response.status_code}): "
                f"{response.text[:800]}"
            )

        data = response.json()
        message_ids.append(str(data.get("id", "")))

    return message_ids


def collect_supabase_data(
    config: Config,
) -> dict[str, list[dict[str, Any]]]:
    return {
        "students": supabase_get(
            config,
            "students",
            {"select": "register_number,student_name,section"},
        ),
        "challenges": supabase_get(
            config,
            "daily_challenges",
            {"select": "*", "order": "challenge_date.asc"},
        ),
        "challenge_results": supabase_get(
            config,
            "daily_challenge_results",
            {"select": "*"},
        ),
        "coding_tests": supabase_get(
            config,
            "coding_tests",
            {"select": "*", "order": "starts_at.asc"},
        ),
        "coding_attempts": supabase_get(
            config,
            "coding_attempts",
            {"select": "*"},
        ),
    }


def build_report(
    mode: str,
    config: Config,
    offline: bool = False,
) -> tuple[str, str, list[Path]]:
    live = load_live_data()
    now = ist_now()
    today = now.date()

    if offline:
        data = {
            "students": [],
            "challenges": [],
            "challenge_results": [],
            "coding_tests": [],
            "coding_attempts": [],
        }
    else:
        data = collect_supabase_data(config)

    # Ensures Supabase student rows can augment any missing section/name mappings.
    index_students(live, data["students"])

    if mode == "daily":
        challenge = daily_challenge_stats(
            today.isoformat(),
            data["challenges"],
            data["challenge_results"],
            len(live),
        )

        day_start = datetime.combine(
            today,
            datetime.min.time(),
            tzinfo=IST,
        )
        day_end = day_start + timedelta(days=1)

        tests = coding_tests_in_window(
            data["coding_tests"],
            day_start,
            day_end,
        )
        coding = coding_test_summary(
            tests,
            data["coding_attempts"],
            len(live),
        )

        subject, html_body = build_daily_report(
            live,
            challenge,
            coding,
            today.isoformat(),
        )

        attachments = [
            generate_daily_excel(
                live,
                challenge,
                coding,
                today.isoformat(),
            ),
            generate_daily_pdf(
                live,
                challenge,
                coding,
                today.isoformat(),
            ),
        ]

        return subject, html_body, attachments

    if mode == "weekly":
        start_day = today - timedelta(days=6)
        start = datetime.combine(
            start_day,
            datetime.min.time(),
            tzinfo=IST,
        )
        end = datetime.combine(
            today + timedelta(days=1),
            datetime.min.time(),
            tzinfo=IST,
        )

        tests = coding_tests_in_window(
            data["coding_tests"],
            start,
            end,
        )
        coding = coding_test_summary(
            tests,
            data["coding_attempts"],
            len(live),
        )

        subject, html_body = build_weekly_report(
            live,
            data["challenges"],
            data["challenge_results"],
            coding,
            start_day.isoformat(),
            today.isoformat(),
        )

        attachments = [
            generate_weekly_excel(
                live,
                data["challenges"],
                data["challenge_results"],
                coding,
                start_day.isoformat(),
                today.isoformat(),
            ),
            generate_weekly_pdf(
                live,
                data["challenges"],
                data["challenge_results"],
                coding,
                start_day.isoformat(),
                today.isoformat(),
            ),
        ]

        return subject, html_body, attachments

    raise ValueError(f"Unknown report mode: {mode}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--mode",
        choices=["daily", "weekly"],
        required=True,
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Generate report HTML but do not send email.",
    )
    parser.add_argument(
        "--offline",
        action="store_true",
        help="Skip Supabase; useful only for local syntax/template testing.",
    )
    args = parser.parse_args()

    config = load_config(require_email=not args.dry_run)

    subject, html_body, attachment_paths = build_report(
        args.mode,
        config,
        offline=args.offline,
    )

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    output = REPORT_DIR / f"latest_{args.mode}_report.html"
    output.write_text(html_body, encoding="utf-8")

    print(f"HTML report generated: {output}")
    for attachment in attachment_paths:
        print(f"Attachment generated: {attachment}")
    print(f"Subject: {subject}")

    if args.dry_run:
        print("DRY RUN: email was not sent.")
        return 0

    ids = send_resend_email(
        config,
        subject,
        html_body,
        attachment_paths,
    )

    print(
        f"Email sent to {len(config.recipients)} recipient(s) "
        f"in {len(ids)} Resend request(s)."
    )
    for message_id in ids:
        print(f"Resend message id: {message_id}")

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"REPORT ERROR: {exc}", file=sys.stderr)
        raise
