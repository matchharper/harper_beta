"""Build the three editable SVG diagrams for Harper's two-sided context document."""

from __future__ import annotations

from html import escape
from pathlib import Path


OUT = Path(__file__).parent
BG = "#fafafa"
LIGHT = "#f1f1f1"
MID = "#e0e0e0"
CHIP = "#eeeeee"
WHITE = "#ffffff"
INK = "#505050"
DARK = "#151515"
ARROW = "#bcbcbc"


class SVG:
    def __init__(self, width: int, height: int, title: str, description: str):
        self.width = width
        self.height = height
        self.parts = [
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
            f'viewBox="0 0 {width} {height}" role="img" aria-labelledby="title description">',
            f'<title id="title">{escape(title)}</title>',
            f'<desc id="description">{escape(description)}</desc>',
            '<defs><marker id="arrow" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" '
            'orient="auto-start-reverse" markerUnits="userSpaceOnUse">'
            f'<path d="M0 0 L6 3.5 L0 7 Z" fill="{ARROW}"/></marker></defs>',
            '<style>text{font-family:"Helvetica Neue",Arial,"Apple SD Gothic Neo",sans-serif;'
            f'text-anchor:middle;fill:{INK};}}'
            f'.line{{fill:none;stroke:{ARROW};stroke-width:1.3;'
            'stroke-linecap:round;stroke-linejoin:round;}</style>',
        ]
        self.rect(0, 0, width, height, WHITE)
        self.rect(0, 10, width - 20, height - 10, BG, 44)

    def rect(self, x: float, y: float, w: float, h: float, fill: str, r: float = 0):
        self.parts.append(
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}"/>'
        )

    def text(self, x: float, y: float, value: str, size: float = 16, bold: bool = False, dark: bool = False, left: bool = False):
        weight = ' font-weight="700"' if bold else ""
        styles = []
        if dark:
            styles.append(f"fill:{DARK}")
        if left:
            styles.append("text-anchor:start")
        style = f' style="{";".join(styles)}"' if styles else ""
        self.parts.append(
            f'<text x="{x}" y="{y}" font-size="{size}"{weight}{style}>{escape(value)}</text>'
        )

    def path(self, d: str, arrow: bool = False, width: float = 1.3):
        end = ' marker-end="url(#arrow)"' if arrow else ""
        self.parts.append(f'<path class="line" d="{d}" stroke-width="{width}"{end}/>')

    def h_bidir(self, left: float, right: float, y: float):
        self.parts.append(
            f'<path class="line" d="M{left} {y} H{right}" '
            'marker-start="url(#arrow)" marker-end="url(#arrow)"/>'
        )

    def v_bidir(self, x: float, top: float, bottom: float):
        self.parts.append(
            f'<path class="line" d="M{x} {top} V{bottom}" '
            'marker-start="url(#arrow)" marker-end="url(#arrow)"/>'
        )

    def save(self, name: str):
        (OUT / name).write_text("\n".join(self.parts + ["</svg>"]) + "\n", encoding="utf-8")


def overview():
    s = SVG(
        1000,
        670,
        "Two-sided Context and Operating System",
        "Company and Talent connect through their Agents and a shared Operating System above them.",
    )
    s.rect(314, 47, 372, 49, WHITE, 24.5)
    s.text(500, 78, "Two-sided Context", 17, True, True)

    s.v_bidir(300, 355, 415)
    s.v_bidir(700, 355, 415)
    s.h_bidir(171, 195, 488)
    s.h_bidir(805, 829, 488)

    s.rect(180, 134, 640, 221, MID, 23)
    s.text(500, 168, "Operating System", 16)
    s.rect(205, 190, 590, 39, WHITE, 19.5)
    s.text(500, 215, "Talent × Role context", 15)
    s.rect(205, 240, 282, 39, WHITE, 19.5)
    s.text(346, 265, "Connection", 15)
    s.rect(513, 240, 282, 39, WHITE, 19.5)
    s.text(654, 265, "New State", 15)
    s.rect(205, 290, 590, 39, WHITE, 19.5)
    s.text(500, 315, "Evaluation · Feedback", 15)

    s.rect(44, 455, 127, 66, WHITE, 20)
    s.text(107.5, 496, "Company", 16, False, True)

    s.rect(195, 415, 210, 147, LIGHT, 22)
    s.text(300, 457, "Company Agent", 16)
    s.rect(213, 484, 174, 44, WHITE, 19)
    s.text(300, 512, "Slack", 15)

    s.rect(595, 415, 210, 147, LIGHT, 22)
    s.text(700, 457, "Talent Agent", 16)
    s.rect(613, 484, 174, 44, WHITE, 19)
    s.text(700, 512, "Web · Mobile · Email", 14)

    s.rect(829, 455, 127, 66, WHITE, 20)
    s.text(892.5, 496, "Talent", 16, False, True)
    s.save("two-sided-context-01-overview.svg")


def mutable_state():
    s = SVG(
        1000,
        750,
        "Mutable State: Talent and Company",
        "Two State cards list Talent and Company information as plain text without individual boxes around each item.",
    )
    s.rect(339, 47, 322, 49, WHITE, 24.5)
    s.text(500, 78, "Mutable State", 17, True, True)

    talent = [
        "프로필 · 경력",
        "프로젝트 · 성과",
        "기술 · 논문",
        "GitHub · SNS · 포트폴리오",
        "조건 · 선호",
        "이직 동기 · 선택의 이유",
        "경력 공백의 맥락",
        "비자 · 가용 시점",
        "추천 · 지원 · 연락 이력",
    ]
    company = [
        "제품 · 시장",
        "팀원 · 조직",
        "Role · 채용 배경",
        "필요 역량 · 성공 기준",
        "보상 · 근무 형태",
        "면접 · 의사결정",
        "후보자 피드백",
        "채용 이력 · 계획",
        "사업 변화 · 우선순위",
    ]
    for x, title, rows in [(76, "Talent State", talent), (526, "Company State", company)]:
        s.rect(x, 152, 398, 532, LIGHT, 24)
        s.text(x + 199, 202, title, 17, False, True)
        s.path(f"M{x + 32} 224 H{x + 366}", False, 1)
        for i, row in enumerate(rows):
            s.text(x + 44, 265 + i * 44, row, 15, left=True)
    s.save("two-sided-context-02-mutable-state.svg")


def operating_loop():
    s = SVG(
        1440,
        850,
        "Two-sided Agent Operating Loop",
        "The Operating System occupies the upper row. It contains many Talent by Role combinations and a decision loop. Company State, Company, Company Agent, Talent Agent, Talent, and Talent State form the lower row.",
    )
    s.rect(475, 43, 490, 50, WHITE, 25)
    s.text(720, 76, "State → Decision → Action → New State", 17, True, True)

    # Row 1: a shared system with a substantial grid of Talent × Role pairs.
    s.rect(82, 136, 1276, 468, MID, 25)
    s.text(720, 174, "Operating System", 17)

    s.rect(110, 202, 845, 337, WHITE, 20)
    s.text(532.5, 238, "모든 Talent × Role 조합", 17, False, True)
    for col in range(11):
        x = 195 + col * 65
        s.text(x + 29.5, 275, f"R{col + 1:02}" if col < 10 else "…", 11)
    tones = (CHIP, "#e7e7e7", "#dadada", "#eeeeee", "#d2d2d2")
    for row in range(5):
        y = 291 + row * 43
        s.text(170, y + 20, f"T{row + 1:02}" if row < 4 else "…", 11)
        for col in range(11):
            x = 195 + col * 65
            s.rect(x, y, 59, 30, tones[(row * 3 + col * 2) % len(tones)], 7)
    s.text(532.5, 526, "Fit · 양측 선호 · 정보 공백 · 연결 방법", 13)

    s.rect(979, 202, 350, 337, WHITE, 20)
    s.text(1154, 238, "Decision loop", 17, False, True)
    for y, label in [(262, "Decision"), (328, "Action"), (394, "New State"), (460, "Evaluation · Feedback")]:
        s.rect(1007, y, 288, 47, LIGHT, 15)
        s.text(1151, y + 30, label, 15)
    for top in (309, 375, 441):
        s.path(f"M1151 {top} V{top + 18}", True)
    s.path("M1297 483 H1311 V284 H1297", True, 1.2)
    s.h_bidir(955, 979, 370)

    # Row 2: two user-facing paths, both attached to the system above.
    s.v_bidir(530, 604, 671)
    s.v_bidir(910, 604, 671)
    for left, right in [(237, 275), (405, 445), (995, 1035), (1165, 1203)]:
        s.h_bidir(left, right, 729)

    for x, title, labels in [
        (47, "Company State", ["Role · 조건", "조직 맥락", "피드백"]),
        (1203, "Talent State", ["경력 · 조건", "선호 · 맥락", "행동 이력"]),
    ]:
        s.rect(x, 665, 190, 128, LIGHT, 20)
        s.text(x + 95, 698, title, 15, False, True)
        for i, label in enumerate(labels):
            s.text(x + 95, 723 + i * 22, label, 13)

    s.rect(275, 690, 130, 78, WHITE, 19)
    s.text(340, 736, "Company", 16, False, True)

    s.rect(445, 671, 170, 116, LIGHT, 20)
    s.text(530, 713, "Company Agent", 15, False, True)
    s.text(530, 748, "Slack", 13)

    s.rect(825, 671, 170, 116, LIGHT, 20)
    s.text(910, 713, "Talent Agent", 15, False, True)
    s.text(910, 748, "Web · Mobile · Email", 13)

    s.rect(1035, 690, 130, 78, WHITE, 19)
    s.text(1100, 736, "Talent", 16, False, True)
    s.save("two-sided-context-03-operating-loop.svg")


if __name__ == "__main__":
    overview()
    mutable_state()
    operating_loop()
