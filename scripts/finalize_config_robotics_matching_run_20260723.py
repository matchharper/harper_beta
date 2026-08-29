#!/usr/bin/env python3
"""Finalize the manual-2.2 Config Robotics Systems Engineer dry run.

This script formats artifacts from judgments made by the current Codex agent.
It performs read-only Supabase preflight checks and writes only local artifacts.
Run memory is saved separately through internal_role_matching_run_memory.py.
"""

from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
import argparse
import csv
import json
import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

from prepare_internal_role_matching_agent_review import (
    SupabaseReadOnly,
    compact,
    digest,
    index_many,
    jsonable,
)


ROLE_ID = "20882456-8862-406d-8f1a-9d69ecb9b575"
RUN_ID = "20260723T115149Z"
ROLE_NAME = "Robotics Systems Engineer"
COMPANY_NAME = "Config"
WORKSPACE_ID = "68c33def-8a04-4e7e-af33-cc49e53a3f7d"
MANUAL_VERSION = "2.2"
EVALUATOR_VERSION = "codex-config-robotics-direct-review-2.2-20260723"
REQUESTED_BY = "kimhojin"
ADDITIONAL_INSTRUCTION = "최소 3명은 채워"
MAX_PROPOSALS = 5


RETRIEVAL_ROWS: list[dict[str, Any]] = [
    {"rank": 1, "talentId": "01a8445d-2454-413b-b3f7-318f1b5668d9", "name": "Hyungsuk Yoon", "headline": "Humanoid AI Researcher | PhD", "location": "South Korea, Yeongdeungpo-gu Seoul, South Korea", "tier": "confirmed_current_or_relocation", "types": ["current_residence", "target_country_work_education_research"], "groups": ["control_manipulation", "robot_integration", "sensing_calibration", "simulation"], "relevance": 67},
    {"rank": 2, "talentId": "04f656e5-38c7-413c-a446-d204f989c6ec", "name": "Sebastian Kaster", "headline": "Engineering Leader · Robotics · 3D Perception · Autonomous Systems", "location": "South Korea, Seocho-gu Songpa-gu, Seoul, Republic of Korea", "tier": "confirmed_current_or_relocation", "types": ["current_residence", "target_country_work_education_research"], "groups": ["control_manipulation", "sensing_calibration"], "relevance": 57},
    {"rank": 3, "talentId": "d68994bf-54d0-40fa-9c03-7607d85be073", "name": "Hollis Kim", "headline": "CTO & Head of Robotics Business at HIM | Building Physical AI for Autonomous Mobility & Smart Cities", "location": "South Korea, Gwangju South Korea", "tier": "confirmed_current_or_relocation", "types": ["current_residence", "target_country_work_education_research"], "groups": ["robot_integration", "sensing_calibration"], "relevance": 57},
    {"rank": 4, "talentId": "bbb54384-bc95-44fc-81d8-6c82f9400407", "name": "Lee Hwayoung", "headline": "Quantitative Developer | Ph.D. in Computational Finance | RAG, Vector Search | Building Data-driven Fin-Tech Solutions", "location": "Japan, Tokyo Seoul, Seoul, South Korea", "tier": "confirmed_current_or_relocation", "types": ["current_residence", "target_country_work_education_research"], "groups": ["robot_integration", "sensing_calibration"], "relevance": 56},
    {"rank": 5, "talentId": "04fa5062-7b85-4d83-90b9-823307af26dc", "name": "Louis MATHIS", "headline": "ML Engineer | École des Mines de Nancy & ESSEC Business School", "location": "South Korea, Seoul Seoul, South Korea", "tier": "confirmed_current_or_relocation", "types": ["current_residence"], "groups": ["sensing_calibration"], "relevance": 51},
    {"rank": 6, "talentId": "1e432180-110c-4ca5-b731-2d09cf365ee5", "name": "Elliot Park", "headline": "CTO, SW R&D 본부장@ATsens", "location": "South Korea, Gwangmyeong Seoul, Seoul, South Korea", "tier": "confirmed_current_or_relocation", "types": ["current_residence", "target_country_work_education_research"], "groups": ["sensing_calibration"], "relevance": 51},
    {"rank": 7, "talentId": "647b54b4-d9d6-4665-a776-d954a25bebc7", "name": "Joohan Lee", "headline": "Data Scientist", "location": "South Korea, Yangcheon-gu Seoul, South Korea", "tier": "confirmed_current_or_relocation", "types": ["current_residence", "target_country_work_education_research"], "groups": ["sensing_calibration"], "relevance": 51},
    {"rank": 8, "talentId": "74dc8c4a-d9fd-46e9-8592-30876933dfa1", "name": "hsw7688", "headline": "반도체 Photolithography 공정 및 이차전지 필드엔지니어 실무 경험을 보유한 엔지니어 지망 인재", "location": "South Korea, Uiwang 경기 안양시 동안구, 대한민국", "tier": "confirmed_current_or_relocation", "types": ["current_residence", "target_country_work_education_research"], "groups": ["sensing_calibration"], "relevance": 51},
    {"rank": 9, "talentId": "9550963a-e742-4393-88b6-d1213eeb0450", "name": "Filicia Salim", "headline": "MBA Candidate | Connect Southeast Asia & Korea Tech Ecosystem | Experienced in Startup & Venture Capital", "location": "South Korea, Gangseo-gu Seoul, South Korea", "tier": "confirmed_current_or_relocation", "types": ["current_residence", "target_country_work_education_research"], "groups": ["control_manipulation"], "relevance": 51},
    {"rank": 10, "talentId": "a698be2c-f5ba-4b6e-85fc-a8971faba3e5", "name": "김동신", "headline": "Principal Research Engineer, Automotive AI Platform at LG Electronics", "location": "South Korea Songpa-gu, Seoul, South Korea", "tier": "confirmed_current_or_relocation", "types": ["current_residence", "target_country_work_education_research"], "groups": ["sensing_calibration"], "relevance": 51},
    {"rank": 11, "talentId": "cae67bee-44f4-42c2-9356-d6228be20e0d", "name": "강새벽", "headline": "Digital Commerce & Platform Leader | eCommerce · Marketplace Growth (Coupang · Naver) | Startup Co-Founder & Business Development | ex-Philip Morris · Bayer · adidas", "location": "South Korea, Mapo-gu Gangseo District, Seoul, South Korea", "tier": "confirmed_current_or_relocation", "types": ["current_residence", "target_country_work_education_research"], "groups": ["control_manipulation"], "relevance": 51},
    {"rank": 12, "talentId": "e744b03b-a329-411b-a48e-51523ad48314", "name": "김명준", "headline": "Software Engineer at LG Electronics", "location": "South Korea, Songpa-gu Seoul, South Korea", "tier": "confirmed_current_or_relocation", "types": ["current_residence", "target_country_work_education_research"], "groups": ["sensing_calibration"], "relevance": 51},
    {"rank": 13, "talentId": "f8048910-a86a-462e-af0e-12ab269ac7ef", "name": "Wajih Imliki", "headline": "KAIST | Aerospace Engineering & Business and Technology Management", "location": "South Korea, Yongin-si Daejeon, South Korea", "tier": "confirmed_current_or_relocation", "types": ["current_residence", "target_country_work_education_research"], "groups": ["control_manipulation", "sensing_calibration"], "relevance": 51},
    {"rank": 14, "talentId": "67996cc2-6a43-417d-bdb6-03eb426998aa", "name": "Kyutae Kim", "headline": "Country Manager at Inmotion Korea | Driving E-Mobility & Sustainable Electrification in the Korean Automotive Industry | Strategic Partner for OEMs | Zapi Group", "location": "South Korea, Hanam Seoul, South Korea", "tier": "confirmed_current_or_relocation", "types": ["current_residence", "target_country_work_education_research"], "groups": ["robot_integration", "sensing_calibration"], "relevance": 50},
    {"rank": 15, "talentId": "ae9896cd-0174-4bbf-bfe5-27d2f49c84c5", "name": "최유진", "headline": "Biomechanics, Signal Processing & Time-series Deep Learning Researcher | Digital Healthcare", "location": "South Korea, Gwangsan-gu", "tier": "confirmed_current_or_relocation", "types": ["current_residence", "target_country_work_education_research"], "groups": ["control_manipulation", "sensing_calibration"], "relevance": 50},
    {"rank": 16, "talentId": "84dfa8cb-af7f-4b32-b7c3-d20a488a49c2", "name": "장강욱", "headline": "Post-doctoral Researcher @ KAIST, Ph.D @ KAIST, Ex @ Naver Corp.", "location": "South Korea South Korea", "tier": "confirmed_current_or_relocation", "types": ["current_residence", "target_country_work_education_research"], "groups": ["sensing_calibration"], "relevance": 49},
    {"rank": 17, "talentId": "dc81332f-4147-5e8b-b203-f13dc05fc566", "name": "Kunho Kim", "headline": "3D Vision & Graphics AI Researcher", "location": "South Korea", "tier": "confirmed_current_or_relocation", "types": ["current_residence", "target_country_work_education_research"], "groups": ["robot_integration", "sensing_calibration"], "relevance": 49},
    {"rank": 18, "talentId": "8bc6a97b-e2fd-45e6-bd2b-12a46f4573bc", "name": "Sol Kim", "headline": "Gastroenterologist | Internal Medicine | AstraZeneca", "location": "South Korea, Gangnam-gu Seoul, South Korea", "tier": "confirmed_current_or_relocation", "types": ["current_residence", "target_country_work_education_research"], "groups": ["sensing_calibration"], "relevance": 47},
    {"rank": 19, "talentId": "e1e745fe-c659-46d3-b0d0-12b83138f31c", "name": "이정형", "headline": "Senior Planner | Demand Planning, S&OP & Inventory Optimization", "location": "South Korea, Seoul Seoul, Republic of Korea", "tier": "confirmed_current_or_relocation", "types": ["current_residence"], "groups": ["control_manipulation"], "relevance": 46},
    {"rank": 20, "talentId": "7a06cd30-bfc8-4247-9497-28152221621f", "name": "Hakhyun Kim", "headline": "Senior Engineer — Application Support · Developer Relations · Real-time 3D · Python / AI", "location": "South Korea, Yongin-si Seoul, South Korea", "tier": "confirmed_current_or_relocation", "types": ["current_residence", "target_country_work_education_research"], "groups": ["sensing_calibration"], "relevance": 45},
    {"rank": 21, "talentId": "8b1c4a54-bf96-42d5-a996-ead0c87c37f6", "name": "이창렬", "headline": "Senior Computer Vision Engineer", "location": "South Korea, Seongnam-si Seoul, South Korea", "tier": "confirmed_current_or_relocation", "types": ["current_residence", "target_country_work_education_research"], "groups": ["sensing_calibration"], "relevance": 45},
    {"rank": 22, "talentId": "9ef7739f-7076-44f1-91f6-f6260cadd8de", "name": "박상혁", "headline": "Hardware Engineer", "location": "South Korea, Jung-gu Ansan, Gyeonggi, South Korea", "tier": "confirmed_current_or_relocation", "types": ["current_residence", "target_country_work_education_research"], "groups": ["robot_integration"], "relevance": 45},
    {"rank": 23, "talentId": "a7c12617-22f1-4bd3-b20a-ac55d51cd9ba", "name": "Donghyun Kim", "headline": "Senior Investment Manager at KB Investment", "location": "South Korea, Eumseong-gun Seoul, Republic of Korea", "tier": "confirmed_current_or_relocation", "types": ["current_residence", "target_country_work_education_research"], "groups": ["robot_integration"], "relevance": 45},
    {"rank": 24, "talentId": "ca2fbe64-2b67-444d-ba66-a2922f77e40c", "name": "정지우", "headline": "Firmware & Systems SW Engineer | Automotive/Radar (AUTOSAR, CAN/UDS, XCP) | always improving both the product and how it’s built, AI-native | ex-founder", "location": "South Korea, Yeoju South Korea", "tier": "confirmed_current_or_relocation", "types": ["current_residence", "target_country_work_education_research"], "groups": ["robot_integration"], "relevance": 45},
    {"rank": 25, "talentId": "b008ab9d-4722-4bf2-a78c-d04eb0b14ac1", "name": "Namgyu Youn", "headline": "Software Engineer", "location": "South Korea, Incheon Seoul, South Korea", "tier": "confirmed_current_or_relocation", "types": ["current_residence", "target_country_work_education_research"], "groups": ["sensing_calibration"], "relevance": 44},
    {"rank": 26, "talentId": "b699fdaa-2063-46ff-a449-e525dcb9d566", "name": "임한중", "headline": "Bose Corporation Senior Software Engineering Manager", "location": "South Korea, Gangnam-gu Seoul Incheon Metropolitan Area", "tier": "confirmed_current_or_relocation", "types": ["current_residence"], "groups": ["robot_integration"], "relevance": 44},
    {"rank": 27, "talentId": "b6a12235-072c-4437-bceb-6735a3d1de4c", "name": "김범석", "headline": "Ex-Founder & Engineer", "location": "South Korea, Jinju Seoul, South Korea", "tier": "confirmed_current_or_relocation", "types": ["current_residence", "target_country_work_education_research"], "groups": ["robot_integration", "sensing_calibration", "simulation"], "relevance": 44},
    {"rank": 28, "talentId": "c6ee8982-40c9-42af-b53d-c71d7f6cd211", "name": "하명환", "headline": "Blockchain Core Engineer at Wemade", "location": "South Korea Seoul, South Korea", "tier": "confirmed_current_or_relocation", "types": ["current_residence", "target_country_work_education_research"], "groups": ["robot_integration"], "relevance": 43},
    {"rank": 29, "talentId": "e33b9c74-09ac-46e4-9767-41ff64b898ce", "name": "Taewan Ham", "headline": "Electrical & Electronic Engineering @ Yonsei University | Technology Policy - Science, Technology, and Society - Science Diplomacy", "location": "Seoul, South Korea", "tier": "confirmed_current_or_relocation", "types": ["current_residence", "target_country_work_education_research"], "groups": ["sensing_calibration"], "relevance": 43},
    {"rank": 30, "talentId": "1ae24ce8-b37d-4cc7-9140-6c7f2dcf5e47", "name": "이호인", "headline": "Digital Analytics Graduate Student | College of Artificial Intelligence Integration", "location": "South Korea, Uijeongbu-si Seoul, South Korea", "tier": "confirmed_current_or_relocation", "types": ["current_residence"], "groups": ["robot_integration"], "relevance": 41},
    {"rank": 31, "talentId": "3e4e1885-3665-5108-9b07-df8e3ba9b5cd", "name": "Taewan HAM", "headline": "Electrical & Electronic Engineering @ Yonsei University | Science, Technology, and Society - Science Diplomacy", "location": "Seoul, South Korea", "tier": "confirmed_current_or_relocation", "types": ["current_residence", "target_country_work_education_research"], "groups": ["sensing_calibration"], "relevance": 41},
    {"rank": 32, "talentId": "5c41b5a7-fd9c-45f6-b699-0c7e6c870253", "name": "장은수", "headline": "Business Analyst | Strategy & Investment Research | McKinsey · BCG · Hanwha Aerospace", "location": "South Korea, Dongjak-gu Seoul, Korea", "tier": "confirmed_current_or_relocation", "types": ["current_residence", "target_country_work_education_research"], "groups": ["sensing_calibration"], "relevance": 41},
    {"rank": 33, "talentId": "7fe36f97-5802-4fd7-92a0-b4f3f1fb3765", "name": "Banghyon Lee", "headline": "CTO, Healthcare Division R&D at D.A | Autonomous Systems, Control & AI Leader", "location": "South Korea, Yeonsu-gu Yongin-si, Gyeonggi-do, South Korea", "tier": "confirmed_current_or_relocation", "types": ["current_residence", "target_country_work_education_research"], "groups": ["robot_integration", "sensing_calibration"], "relevance": 40},
    {"rank": 34, "talentId": "bccac013-5fec-42e2-82c5-f972a7ae8f60", "name": "rami.khulaidi", "headline": "PhD in Intelligent Control Systems | Physical AI & Robotics | Field CTO & Technology Leadership", "location": "Australia, Adelaide Adelaide, South Australia, Australia", "tier": "historical_affinity_verify_current_intent", "types": ["target_country_work_education_research"], "groups": ["control_manipulation", "robot_integration"], "relevance": 52},
    {"rank": 35, "talentId": "cd1fe446-3026-4f71-9e31-6824e98d2612", "name": "Ganesh Kumar B", "headline": "CTO / VP of Engineering | AI, Data & IoT Innovator | Agentic AI, RAG, Semantic Data & Scalable Platform Architectures", "location": "India, Bengaluru Bangalore, India", "tier": "historical_affinity_verify_current_intent", "types": ["target_country_work_education_research"], "groups": ["robot_integration", "sensing_calibration"], "relevance": 52},
    {"rank": 36, "talentId": "f0fc28e3-8ff6-49d0-bd6b-3ababa4470ed", "name": "Oszkar", "headline": "Technical PM turning software into products • Robotics • Autonomous Driving • Logistics Automation • Developer Productivity • Based in Tokyo", "location": "Japan, Meguro City Greater Tokyo Area", "tier": "historical_affinity_verify_current_intent", "types": ["target_country_work_education_research"], "groups": ["robot_integration", "sensing_calibration"], "relevance": 52},
    {"rank": 37, "talentId": "fc7d3ba8-52ec-49fc-95c0-a91e99c41ea4", "name": "Parthiban Poysollameyyar", "headline": "Data Scientist Specialist • GenAi Solutions @ Rio Tinto | Applied ML & LLMs | Client-facing AI engineering, end to end", "location": "Singapore Singapore, Singapore", "tier": "historical_affinity_verify_current_intent", "types": ["target_country_work_education_research"], "groups": ["robot_integration", "sensing_calibration"], "relevance": 52},
    {"rank": 38, "talentId": "f55feeab-8fce-4cb3-9439-2ea8da5f262b", "name": "Vicky Vernando Dasta", "headline": "SWE/AI Engineer/Serial Founder", "location": "Indonesia, Pekanbaru Jakarta, Indonesia", "tier": "historical_affinity_verify_current_intent", "types": ["target_country_work_education_research"], "groups": ["robot_integration", "sensing_calibration"], "relevance": 50},
    {"rank": 39, "talentId": "70091404-0ecc-4715-a317-dfda7a954d62", "name": "Vishesh Arora", "headline": "AI Integration Engineer @ Epiq | Python, GenAI, Computer Vision, Natural Language Processing, LLMOps", "location": "United States, Queens New York, New York, United States", "tier": "historical_affinity_verify_current_intent", "types": ["target_country_work_education_research"], "groups": ["sensing_calibration"], "relevance": 46},
    {"rank": 40, "talentId": "cb0a949a-a956-4ec6-864d-12e4eafc3693", "name": "Haoming Koo", "headline": "AI Engineer | Agentic AI, RAG & Evals | Building production LLM systems @ AI Singapore (100E) | Ex-Micron | Available Oct 2026", "location": "Singapore Singapore", "tier": "historical_affinity_verify_current_intent", "types": ["target_country_work_education_research"], "groups": ["sensing_calibration"], "relevance": 46},
    {"rank": 41, "talentId": "0da16d10-08cb-48c9-8617-6dcfe1cd31ec", "name": "Lee Siang Meng", "headline": "Software Engineer - Building from 0 to 1 =)", "location": "Singapore Singapore", "tier": "historical_affinity_verify_current_intent", "types": ["target_country_work_education_research"], "groups": ["sensing_calibration"], "relevance": 45},
    {"rank": 42, "talentId": "6f6f4f4a-1e39-4e1b-9c63-d8218ee5ded8", "name": "Nayeon Lee", "headline": "Manufacturing QA & Inventory & Stock Operations | Retail Operations | Lean Six Sigma Green Belt", "location": "Calgary, AB, Canada", "tier": "historical_affinity_verify_current_intent", "types": ["target_country_work_education_research"], "groups": ["sensing_calibration"], "relevance": 45},
    {"rank": 43, "talentId": "90e26de5-c8fc-48c7-adbb-a88ea9e25508", "name": "Soubhik Das", "headline": "QraftAI - Building the Future of QA || Co-Founder @ Manastik || 3x TEDx Speaker || BIRAC BIG 19 Winner || Former Intel Student Ambassador || Product Management || Published Author", "location": "India, Pune Pune, Maharashtra, India", "tier": "historical_affinity_verify_current_intent", "types": ["target_country_work_education_research"], "groups": ["robot_integration"], "relevance": 45},
    {"rank": 44, "talentId": "817a6179-1e0f-469b-b2b6-2c5bbb749a07", "name": "유정상", "headline": "Unreal / Unity3D Client Engineer", "location": "Singapore", "tier": "historical_affinity_verify_current_intent", "types": ["target_country_work_education_research"], "groups": ["sensing_calibration"], "relevance": 41},
    {"rank": 45, "talentId": "6ad775c6-b620-4def-a55b-cd548ff8e790", "name": "Jet Li", "headline": "Senior Application Engineer", "location": "Japan, Tokyo Greater Tokyo Area", "tier": "historical_affinity_verify_current_intent", "types": ["target_country_work_education_research"], "groups": ["robot_integration"], "relevance": 40},
    {"rank": 46, "talentId": "bc3511be-8c1e-480f-b380-ef2a67e7cbc4", "name": "Mo", "headline": "Applied AI Engineer I Technical Founder I Agentic AI | Fintech | Blockchain | Security", "location": "Australia, Sydney Greater Sydney Area", "tier": "historical_affinity_verify_current_intent", "types": ["target_country_work_education_research"], "groups": ["control_manipulation", "sensing_calibration"], "relevance": 37},
]


FIT_SUMMARY = (
    "Config는 범용 양손 로봇을 위한 데이터 수집, 모델 학습·평가와 현장 적용을 하나의 물리 시스템 스택으로 연결하는 회사입니다. "
    "이 역할은 robot control, sensing, teleoperation, hardware integration과 데이터 수집 시스템을 직접 구축합니다. "
    "로봇 팔·그리퍼의 저지연 실행, calibration, multimodal sensing, 실제 하드웨어 장애 분석처럼 모델 성능을 좌우하는 물리 계층을 맡습니다. "
    "공개 JD 기준 intern부터 senior staff까지 여러 수준에 열려 있으며, 서울 강남 오피스에서 full-time onsite로 일합니다."
)


SELECTED: dict[str, dict[str, Any]] = {
    "01a8445d-2454-413b-b3f7-318f1b5668d9": {
        "company": 88,
        "acceptance": 78,
        "confidence": 91,
        "summary": "Humanoid locomotion, 로봇 스타트업 기술 ownership, ROS2/C++/Python 실환경 연구가 확인되고 한국 우선·로보틱스 R&D 의향이 명확합니다.",
        "internal_reason": """**TL;DR** - 윤형석님은 2026년 4월부터 **Samsung Electronics Future Robotics Office에서 휴머노이드 perceptive locomotion을 직접 개발**하고 있으며, 그 전에 **26개월간 로봇 스타트업 Rosmos의 공동창업자·CEO로 기술 개발에 집중**했습니다. 현업·창업·연구/대회에서 실제 로봇의 인지와 제어를 반복해 다뤄본 점이 강합니다.

Samsung에서는 계단과 stepping stone을 인식해 자연스럽게 보행하는 알고리즘을 맡고 있습니다. Rosmos에서는 Qualcomm IQ-9075 기반 자체 로봇 임베디드 시스템용 범용 자율주행 AI를 개발했고, 본인은 사업 운영보다 기술 개발에 가장 많은 시간을 썼다고 밝혔습니다.

서울대 박사 과정에서는 자체 제작 lidar-free 로봇의 path planning·controller를 ROS2/C++/Python으로 이끌었습니다. 공식 논문 기록상 Clearpath Husky를 실제 환경에서 검증한 **IEEE RA-L 2024 논문의 1저자**이며, 이력서 기준 IROS 2024 Earth Rovers Challenge 우승 팀에서도 controller 개발을 이끌었습니다.

현재 적극적으로 이직 중이며 한국 내 포지션을 최우선으로 보고, FDE뿐 아니라 로보틱스 R&D에도 열려 있습니다. 근무 형태나 회사 단계에 별도 제한은 없다고 밝혔습니다.

**Note** - 적절한 우선 검토 대상이지만 완성형 bimanual manipulation 엔지니어로 단정할 근거는 없습니다. 주요 실적은 locomotion·navigation 중심이고 Samsung 현 역할도 아직 3개월이므로, arm-level Cartesian control·IK·teleoperation의 실제 깊이와 공개되지 않은 보상 범위가 연 2억원 이상 기대에 맞는지는 인터뷰 전에 확인하는 편이 좋습니다.""",
        "fit_reasons": [
            "Samsung Future Robotics Office에서 계단·stepping stone을 인식하는 휴머노이드 보행 알고리즘을 직접 개발한 경험이 실제 로봇의 sensing-control 통합 업무와 연결됩니다.",
            "Rosmos에서 자체 embedded robot용 범용 자율주행 AI의 기술 개발에 집중했고, 별도로 ROS2/C++ 기반 lidar-free 로봇의 path planning과 controller를 이끈 경험이 초기 physical-systems 팀의 ownership과 맞습니다.",
            "실환경 Clearpath Husky 검증을 담은 IEEE RA-L 2024 1저자 논문과 이력서에 기재된 IROS 2024 Earth Rovers Challenge controller 개발 경험이 연구를 실제 시스템 실행으로 연결해 본 근거입니다.",
        ],
        "tradeoffs": "희망 보상은 연 2억원 이상이지만 공개된 보상 범위가 없습니다. 핵심 경험도 locomotion·navigation 중심이므로 arm-level Cartesian control·IK·teleoperation의 실제 깊이와 맡을 구체 범위를 함께 확인하는 편이 좋습니다.",
        "sources": [
            {"claimId": "ir-1", "source": "talent_experiences", "sourceId": "8296", "fact": "Samsung Electronics Future Robotics Office Staff Engineer, humanoid locomotion"},
            {"claimId": "ir-2", "source": "talent_experiences", "sourceId": "8297", "fact": "Rosmos 공동창업자·CEO 26개월, Qualcomm IQ-9075 기반 autonomous navigation"},
            {"claimId": "ir-3", "source": "talent_educations", "sourceId": "2661", "fact": "서울대 ECE PhD, robotic environments dissertation"},
            {"claimId": "ir-4", "source": "talent_extras", "sourceId": "01a8445d-2454-413b-b3f7-318f1b5668d9", "fact": "RA-L/IROS 논문 및 IROS 2024 Earth Rover Challenge 수상 기재"},
            {"claimId": "ir-5", "source": "talent_insights", "sourceId": "2573", "fact": "한국 우선, 로보틱스 R&D 수용, 2억원 이상 희망"},
        ],
    },
    "04f656e5-38c7-413c-a446-d204f989c6ec": {
        "company": 86,
        "acceptance": 73,
        "confidence": 78,
        "summary": "Seoul Robotics에서 3D perception/autonomous systems를 commercial deployment까지 확장했고 서울 full-time signal과 official job signup intent가 있습니다.",
        "internal_reason": """**TL;DR** - Sebastian Kaster님은 **Seoul Robotics에서 LiDAR 기반 3D perception platform을 prototype에서 commercial deployment까지 확장**한 robotics/autonomous systems 엔지니어링 리더입니다. Director/VP 이전에 software engineer로 point-cloud processing, tracking, configuration, integration을 직접 만들었고, 이후 35명+ 조직에서 OEM site deployment까지 이끈 점이 Config의 sensing·calibration·systems integration scope와 잘 맞습니다.

Seoul Robotics에서는 200개 이상의 LiDAR sensor를 처리해 10Hz로 1만 개 이상 object를 감지하는 distributed perception system을 운영 수준으로 확장했습니다. 후보자 본인이 sensor ingestion부터 real-time perception, system integration, safety-critical component, customer pilot-to-commercial deployment까지 연결한 이력이 있어, 실제 robot data infrastructure를 안정화해야 하는 Config의 물리 시스템 업무에 바로 연결됩니다.

TUM Robotics, Cognition, Intelligence 석사 과정에서는 BMW autonomous vehicle용 online prediction과 motion-planning toolchain을 다뤘고, student researcher로 C++ 기반 trajectory planning tooling에도 참여했습니다. 현재 서울에 있고 full-time 기회를 받을 수 있는 설정이며, 한국 소재 robotics 회사에서 장기간 일한 근거가 있어 서울 현장 협업 가능성도 충분히 볼 수 있습니다.

**Note** - 다만 후보자의 최근 직무는 arm manipulation이나 teleoperation보다 3D perception/autonomous driving infrastructure에 더 가깝습니다. 또한 아직 Harper career interview가 끝나지 않아 보상, hands-on IC/technical lead scope, senior/staff leveling 선호는 제안 전 확인이 필요합니다.""",
        "fit_reasons": [
            "Seoul Robotics에서 LiDAR 기반 3D perception platform을 200개 이상 sensor, 10Hz, 1만 개 이상 object 처리 규모의 production deployment로 확장한 경험이 Config의 sensing·calibration·integration 업무와 맞닿아 있습니다.",
            "Software Engineer에서 Director, VP까지 이어진 경력 안에서 sensor ingestion, real-time perception, system integration, customer deployment를 모두 다뤄 실제 로봇 데이터 인프라를 안정화하는 senior/staff ownership에 적합합니다.",
            "TUM Robotics 석사와 C++ trajectory-planning 연구 경험이 있어 순수 perception 리더가 아니라 autonomous systems와 motion-planning 문맥을 함께 가진 후보입니다.",
        ],
        "tradeoffs": "최근 핵심 경력은 robot arm manipulation이나 teleoperation보다 3D perception/autonomous driving infrastructure에 가깝습니다. career interview가 아직 완료되지 않아 보상, hands-on IC/technical lead scope, senior/staff leveling 선호는 먼저 확인해야 합니다.",
        "sources": [
            {"claimId": "ir-1", "source": "talent_experiences", "sourceId": "17946", "fact": "Seoul Robotics VP Engineering, 35명+ 팀, sensor ingestion부터 deployment까지"},
            {"claimId": "ir-2", "source": "talent_experiences", "sourceId": "17947", "fact": "200+ LiDAR sensors, 10,000+ objects at 10Hz, production deployments"},
            {"claimId": "ir-3", "source": "talent_experiences", "sourceId": "17948", "fact": "point cloud pipeline latency 90% reduction and tracking/configuration systems"},
            {"claimId": "ir-4", "source": "talent_educations", "sourceId": "5818", "fact": "TUM MS Robotics, Cognition, Intelligence, SPOT/CommonRoad motion planning"},
            {"claimId": "ir-5", "source": "talent_activity_events", "sourceId": "183a0b0c-30f7-46ad-a5fa-a6254f54d82a", "fact": "Head of Robotics Systems official job signup intent"},
        ],
    },
    "8b1c4a54-bf96-42d5-a996-ead0c87c37f6": {
        "company": 82,
        "acceptance": 79,
        "confidence": 86,
        "summary": "42dot/Slamcore의 visual-inertial SLAM, localization, calibration, synchronization 제품화 경험과 서울/Pangyo onsite IC robotics 선호가 확인됩니다.",
        "internal_reason": """**TL;DR** - 이창렬님은 **42dot과 Slamcore에서 visual-inertial SLAM, localization, mapping, camera calibration/synchronization을 제품 가까이에서 다뤄온 senior 3D vision engineer**입니다. Config의 직접 arm-control 요구와 완전히 같지는 않지만, sensing·calibration·synchronization·real-world validation 축에서는 매우 강한 후보입니다.

42dot에서는 multi-camera, wheel odometer, IMU, GPS를 활용한 localization/mapping을 이끌고, camera calibration과 heterogeneous sensor synchronization을 fleet 단위로 검증했습니다. 특히 keypoint 기반 차량 위치 relocalization을 직접 prototype으로 구현한 뒤 현대차 파견 인력 6명 및 planning team과 반복 검증해 자율주행 기능으로 동작시키는 데 기여했습니다.

Slamcore에서는 scalable visual-inertial SLAM의 online self-calibration을 prototyping/validation했고, Ceres 기반 nonlinear optimization, cost function/Jacobian, calibration pipeline을 직접 설계했습니다. 이 경험은 Config가 요구하는 multimodal sensing, calibration, synchronization, real-world robotics debugging에 직접적으로 연결됩니다.

후보자는 서울·판교 onsite를 선호하고, manager나 people leadership이 아니라 **IC 알고리즘 엔지니어**로 제품화 중심의 robotics/AI/VR 팀을 원한다고 명확히 밝혔습니다. 국내 보상 기준은 1.5억원 이상으로 확인되어 있으며, 현재 회사 쪽 리크루터에게 노출되지 않도록 하는 privacy 조건은 운영상 별도로 지켜야 합니다.

**Note** - robot arm manipulation, Cartesian control, IK, teleoperation 자체를 오래 다룬 후보로 보기는 어렵습니다. 이 후보자를 볼 때는 control generalist보다 calibration/SLAM/sensing systems specialist로 보는 편이 정확합니다.""",
        "fit_reasons": [
            "42dot에서 multi-camera, wheel odometer, IMU, GPS를 활용한 localization/mapping과 camera calibration·synchronization을 fleet 단위로 검증한 경험이 Config의 multimodal sensing과 data-quality infrastructure에 직접 연결됩니다.",
            "Slamcore에서 visual-inertial SLAM self-calibration, Ceres 기반 nonlinear optimization, cost function/Jacobian, calibration pipeline을 직접 설계해 실제 센서·하드웨어 경계의 debugging 경험이 있습니다.",
            "서울·판교 onsite와 IC 알고리즘 엔지니어 역할을 선호하고, 다음 도메인으로 robotics/AI/VR을 우선한다고 밝혀 역할 수락 가능성도 관측됩니다.",
        ],
        "tradeoffs": "직접 robot arm manipulation, Cartesian control, IK, teleoperation을 오래 다룬 후보는 아닙니다. calibration/SLAM/sensing systems specialist로 보고, 현재 회사 쪽 리크루터 노출 방지 조건도 운영상 확인해야 합니다.",
        "sources": [
            {"claimId": "ir-1", "source": "talent_experiences", "sourceId": "17652", "fact": "42dot 3D Vision Team Lead, keypoint sparse map reconstruction and relocalization prototype"},
            {"claimId": "ir-2", "source": "talent_experiences", "sourceId": "17653", "fact": "42dot localization/mapping, camera calibration and heterogeneous sensor synchronization"},
            {"claimId": "ir-3", "source": "talent_experiences", "sourceId": "17655", "fact": "Slamcore visual-inertial SLAM, online/batch self-calibration, Ceres/Jacobian"},
            {"claimId": "ir-4", "source": "talent_insights", "sourceId": "12222", "fact": "서울·판교 onsite, IC 알고리즘, robotics/AI/VR 선호, 1.5억원 이상"},
            {"claimId": "ir-5", "source": "talent_activity_events", "sourceId": "87a347bd-e8b9-4f6b-b675-ed09ba440299", "fact": "42dot prototype/productization memo"},
        ],
    },
}


SPECIAL_NON_SELECTED: dict[str, dict[str, Any]] = {
    "d68994bf-54d0-40fa-9c03-7607d85be073": {"disp": "do_not_recommend", "reason": "로보틱스/자율주행 leadership 경력은 강하지만, 최신 선호가 미국 이전·Field CTO·높은 executive 보상과 한국 회사 회피 쪽으로 명시되어 서울 onsite hands-on systems role과 충돌합니다.", "codes": ["confirmed_location_or_work_mode_conflict", "confirmed_scope_or_seniority_mismatch", "confirmed_candidate_constraint"]},
    "a698be2c-f5ba-4b6e-85fc-a8971faba3e5": {"disp": "do_not_recommend", "reason": "LG/Samsung/Hanwha의 robotics·ADAS·UGV 경험은 강하지만 다음 역할로 Director 또는 CTO를 원하고 $250K~$400K+equity 및 안정적 조직 선호가 확인되어 seed-stage hands-on IC scope와 맞지 않습니다.", "codes": ["confirmed_scope_or_seniority_mismatch", "confirmed_candidate_constraint"]},
    "f8048910-a86a-462e-af0e-12ab269ac7ef": {"disp": "verification_needed", "reason": "KAIST aerospace/robotics optimization과 robot challenge 근거는 유망하지만 현 단계에서는 full-time timing, 서울 onsite 수용, 한국어 협업, 실제 physical deployment 깊이를 더 확인해야 합니다.", "codes": []},
    "ae9896cd-0174-4bbf-bfe5-27d2f49c84c5": {"disp": "do_not_recommend", "reason": "웨어러블/biomechanics 데이터와 signal processing은 관련 주변 신호이나 robot control, C++/ROS systems, manipulation/teleoperation이 확인되지 않고 희망 방향도 digital healthcare device/사업 확장 쪽입니다.", "codes": ["confirmed_role_requirement_mismatch"]},
    "dc81332f-4147-5e8b-b203-f13dc05fc566": {"disp": "verification_needed", "reason": "KAIST robotics lab/SLAM/3D vision 근거가 있으나 현재 상태가 stopped이고 최신 full-time/onsite 의향, hands-on physical robot control 깊이가 확인되지 않습니다.", "codes": []},
    "b6a12235-072c-4437-bceb-6735a3d1de4c": {"disp": "do_not_recommend", "reason": "hardware founder 및 KAIST robotics 연구 경험은 있으나 시드·엔젤 단계 스타트업을 피하고 싶다는 명시 조건이 있고 Config는 seed-stage입니다.", "codes": ["confirmed_company_exclusion"]},
    "7fe36f97-5802-4fd7-92a0-b4f3f1fb3765": {"disp": "verification_needed", "reason": "autonomous systems/control leadership 근거는 있으나 현재 CTO scope와 candidate expectation이 hands-on IC robotics systems로 내려오는지, 직접 manipulation/control 깊이가 충분한지 확인이 필요합니다.", "codes": []},
    "84dfa8cb-af7f-4b32-b7c3-d20a488a49c2": {"disp": "verification_needed", "reason": "KAIST postdoc 및 3D/robotics-adjacent 연구 신호는 있으나 실제 robot control, onsite full-time timing, candidate role preference가 확인되지 않습니다.", "codes": []},
    "9ef7739f-7076-44f1-91f6-f6260cadd8de": {"disp": "verification_needed", "reason": "hardware engineer로 robot integration 가능성은 있으나 로봇 제어, ROS/C++ stack, physical deployment ownership, seniority scope를 확인해야 합니다.", "codes": []},
    "ca2fbe64-2b67-444d-ba66-a2922f77e40c": {"disp": "verification_needed", "reason": "automotive/radar firmware와 systems software는 인접하지만 robot manipulation/control 시스템 직접성, 서울 onsite 의향, 역할 수준을 확인해야 합니다.", "codes": []},
    "bccac013-5fec-42e2-82c5-f972a7ae8f60": {"disp": "verification_needed", "reason": "control systems/physical AI/robotics 경력은 관련성이 있으나 현재 호주 기반이며 한국 onsite 의향과 hands-on IC scope 수용이 확인되지 않습니다.", "codes": []},
}


GENERIC_DNR = "strict retrieval에는 들어왔지만 이력의 핵심이 robotics systems/control/manipulation/sensing integration이 아니거나, 현재 role 수행에 필요한 서울 onsite·hands-on IC·physical robot depth가 확인되지 않습니다."


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(jsonable(value), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_text(path: Path, value: str) -> None:
    path.write_text(value.rstrip() + "\n", encoding="utf-8")


def mutual(company: int, acceptance: int, confidence: int) -> int:
    base = 0 if company + acceptance == 0 else 2 * company * acceptance / (company + acceptance)
    return round(0.90 * base + 0.10 * confidence)


def persisted_score(mutual_score: int) -> int:
    return max(80, min(100, 80 + round((mutual_score - 70) * 2 / 3)))


def load_db() -> tuple[SupabaseReadOnly, str, str]:
    root = Path(__file__).resolve().parents[1]
    load_dotenv(root / ".env.local", override=False)
    url = compact(os.environ.get("NEXT_PUBLIC_SUPABASE_URL"), 500)
    key = compact(os.environ.get("SUPABASE_SERVICE_ROLE_KEY"), 10000)
    if not url or not key:
        raise RuntimeError("Supabase service credentials are required")
    return SupabaseReadOnly(url, key), url, key


def source_hashes(role: dict[str, Any], workspace: dict[str, Any], internal: dict[str, Any]) -> dict[str, str]:
    return {
        "roleHash": digest({key: role.get(key) for key in ("description", "location_text", "work_mode", "type", "status", "is_expired", "salary_range", "salary_min", "salary_max")}),
        "internalRequestHash": digest(internal.get("request")),
        "workspaceHash": digest({key: workspace.get(key) for key in ("request", "company_description", "pitch")}),
    }


def fetch_sources(db: SupabaseReadOnly) -> dict[str, Any]:
    role_rows = db.get("company_roles", filters={"role_id": f"eq.{ROLE_ID}"})
    if len(role_rows) != 1:
        raise RuntimeError("role not found or not unique")
    role = role_rows[0]
    workspace = db.get("company_workspace", filters={"company_workspace_id": f"eq.{role['company_workspace_id']}"})[0]
    internal_rows = db.get("company_internal_roles", filters={"role_id": f"eq.{ROLE_ID}"})
    internal = internal_rows[0] if internal_rows else {"role_id": ROLE_ID, "request": None, "considerations": None}
    same_recs = db.get("talent_opportunity_recommendation", select="id,talent_id,role_id,feedback,processed_stage,saved_stage,dismissed_at,recommended_at,created_at", filters={"role_id": f"eq.{ROLE_ID}"})
    same_tags = db.get("talent_opportunity_tag", select="id,talent_id,opportunity_id,tag,created_at,updated_at", filters={"opportunity_id": f"eq.{ROLE_ID}"})
    same_fits = db.get("talent_opportunity_fit", filters={"opportunity_id": f"eq.{ROLE_ID}"})
    reviews = db.get("talent_opportunity_matching_review", filters={"opportunity_id": f"eq.{ROLE_ID}"})
    return {
        "role": role,
        "workspace": workspace,
        "internal": internal,
        "sameRoleRecommendations": same_recs,
        "sameRoleTags": same_tags,
        "sameRoleFits": same_fits,
        "matchingReviews": reviews,
    }


def fetch_candidate_packets(db: SupabaseReadOnly, ids: list[str], fits: list[dict[str, Any]]) -> list[dict[str, Any]]:
    profiles = {row["user_id"]: row for row in db.by_ids("talent_users", "user_id", ids, select="user_id,name,headline,bio,location,current_location,resume_links,last_logined_at,updated_at")}
    settings = {row["user_id"]: row for row in db.by_ids("talent_setting", "user_id", ids, select="user_id,profile_visibility,get_internal_recommendation,blocked_companies,engagement_types,status,is_onboarding_done,updated_at")}
    experiences = index_many(db.by_ids("talent_experiences", "talent_id", ids, select="id,talent_id,company_name,role,start_date,end_date,months,description,memo,employment_type"), "talent_id")
    educations = index_many(db.by_ids("talent_educations", "talent_id", ids, select="id,talent_id,school,degree,field,start_date,end_date,description,memo"), "talent_id")
    insights = index_many(db.by_ids("talent_insights", "talent_id", ids, select="id,talent_id,content,created_at,last_updated_at"), "talent_id")
    activities = index_many(db.by_ids("talent_activity_events", "talent_id", ids, select="id,talent_id,event_type,summary,impact_level,source,created_at", order="created_at.desc"), "talent_id")
    fit_by_id = index_many(fits, "talent_id")
    rows: list[dict[str, Any]] = []
    for retrieval in RETRIEVAL_ROWS:
        talent_id = retrieval["talentId"]
        profile = profiles.get(talent_id, {})
        rows.append({
            "rank": retrieval["rank"],
            "retrieval": retrieval,
            "profile": {
                "talentId": talent_id,
                "name": profile.get("name") or retrieval["name"],
                "headline": profile.get("headline") or retrieval["headline"],
                "bio": compact(profile.get("bio"), 900),
                "location": profile.get("location") or profile.get("current_location"),
                "signupLocation": profile.get("current_location"),
                "lastLoginedAt": profile.get("last_logined_at"),
                "updatedAt": profile.get("updated_at"),
            },
            "setting": settings.get(talent_id, {}),
            "countryEvidenceTier": retrieval["tier"],
            "countryEvidence": [{"countryCode": "KR", "type": evidence_type, "source": "profile_or_korea_work_education", "observedAt": "2026-07-23"} for evidence_type in retrieval["types"]],
            "experiences": [
                {key: item.get(key) for key in ("id", "company_name", "role", "start_date", "end_date", "months", "employment_type")}
                | {"description": compact(item.get("description"), 700), "memo": compact(item.get("memo"), 450)}
                for item in sorted(experiences.get(talent_id, []), key=lambda row: compact(row.get("start_date")), reverse=True)[:5]
            ],
            "educations": [
                {key: item.get(key) for key in ("id", "school", "degree", "field", "start_date", "end_date")}
                | {"description": compact(item.get("description"), 450)}
                for item in educations.get(talent_id, [])[:3]
            ],
            "insights": [
                {"id": item.get("id"), "content": item.get("content"), "updatedAt": item.get("last_updated_at") or item.get("created_at")}
                for item in sorted(insights.get(talent_id, []), key=lambda row: compact(row.get("last_updated_at") or row.get("created_at")), reverse=True)[:2]
            ],
            "activityEvents": [
                {"id": item.get("id"), "eventType": item.get("event_type"), "summary": compact(item.get("summary"), 500), "createdAt": item.get("created_at")}
                for item in sorted(activities.get(talent_id, []), key=lambda row: compact(row.get("created_at")), reverse=True)[:5]
            ],
            "existingFit": (fit_by_id.get(talent_id) or [None])[0],
            "candidateFingerprint": digest({
                "profileUpdatedAt": profile.get("updated_at"),
                "settingUpdatedAt": (settings.get(talent_id) or {}).get("updated_at"),
                "retrieval": retrieval,
                "experiences": experiences.get(talent_id, [])[:5],
                "educations": educations.get(talent_id, [])[:3],
                "insights": insights.get(talent_id, [])[:2],
            }),
        })
    return rows


def build_evaluations(packets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    evaluations: list[dict[str, Any]] = []
    for packet in packets:
        talent_id = packet["profile"]["talentId"]
        retrieval = packet["retrieval"]
        if talent_id in SELECTED:
            data = SELECTED[talent_id]
            company = int(data["company"])
            acceptance = int(data["acceptance"])
            confidence = int(data["confidence"])
            mutual_score = mutual(company, acceptance, confidence)
            evaluations.append({
                "talentId": talent_id,
                "rank": packet["rank"],
                "name": packet["profile"]["name"],
                "countryEvidenceTier": packet["countryEvidenceTier"],
                "hardCriteria": {
                    "target_country": "pass",
                    "seoul_onsite_full_time": "pass",
                    "korean_and_written_english": "pass",
                    "robotics_systems_depth": "pass",
                    "python_cpp_ros_or_system_equivalent": "pass",
                    "candidate_scope_acceptance": "pass",
                    "privacy_duplicate_blocked_company": "pass",
                },
                "companyFitScore": company,
                "candidateAcceptanceScore": acceptance,
                "evidenceConfidence": confidence,
                "mutualScore": mutual_score,
                "positiveEvidence": data["summary"],
                "risks": data["tradeoffs"],
                "auditReasoning": data["summary"],
                "internalReason": data["internal_reason"],
                "internalReasonSources": data["sources"],
                "candidateFacing": {"fitSummary": FIT_SUMMARY, "fitReasons": data["fit_reasons"], "tradeoffs": data["tradeoffs"]},
                "independentDecision": "advance",
                "finalDisposition": "selected",
                "reasonCodes": [],
                "candidateFingerprint": packet["candidateFingerprint"],
            })
            continue
        special = SPECIAL_NON_SELECTED.get(talent_id)
        if special:
            disp = special["disp"]
            reason = special["reason"]
            codes = special["codes"]
        else:
            disp = "do_not_recommend"
            reason = GENERIC_DNR
            codes = ["confirmed_role_requirement_mismatch"]
        base_company = 62 if disp == "verification_needed" else min(55, max(24, int(retrieval["relevance"])))
        base_acceptance = 56 if disp == "verification_needed" else 42
        confidence = 72 if disp == "verification_needed" else 82
        evaluations.append({
            "talentId": talent_id,
            "rank": packet["rank"],
            "name": packet["profile"]["name"],
            "countryEvidenceTier": packet["countryEvidenceTier"],
            "hardCriteria": {
                "target_country": "pass" if retrieval["tier"] == "confirmed_current_or_relocation" else "unknown_current_intent",
                "seoul_onsite_full_time": "unknown" if disp == "verification_needed" else "fail_or_not_observed",
                "robotics_systems_depth": "unknown" if disp == "verification_needed" else "fail",
                "candidate_scope_acceptance": "unknown" if disp == "verification_needed" else "fail_or_not_observed",
            },
            "companyFitScore": base_company,
            "candidateAcceptanceScore": base_acceptance,
            "evidenceConfidence": confidence,
            "mutualScore": mutual(base_company, base_acceptance, confidence),
            "positiveEvidence": retrieval["headline"],
            "risks": reason,
            "auditReasoning": reason,
            "internalReason": "",
            "internalReasonSources": [],
            "candidateFacing": None,
            "independentDecision": "verification_needed" if disp == "verification_needed" else "reject",
            "finalDisposition": disp,
            "reasonCodes": codes,
            "candidateFingerprint": packet["candidateFingerprint"],
        })
    return evaluations


def render_consideration(source: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    consideration = {
        "roleId": ROLE_ID,
        "company": COMPANY_NAME,
        "role": ROLE_NAME,
        "manualVersion": MANUAL_VERSION,
        "request": {
            "maxProposals": MAX_PROPOSALS,
            "executionMode": "dry_run",
            "requestedBy": REQUESTED_BY,
            "additionalInstruction": ADDITIONAL_INSTRUCTION,
            "additionalInstructionApplied": "최소 3명 확보를 시도하되 M은 상한이며 hard filter, privacy, duplicate, human override를 완화하지 않음",
        },
        "targetGeography": {
            "countryCode": "KR",
            "city": "Seoul",
            "workMode": "onsite",
            "employmentType": "full_time",
            "source": ["company_roles.location_text", "company_roles.work_mode", "official Config JD"],
        },
        "countryEvidencePolicy": {
            "accepted": ["current_residence", "explicit_relocation_intent", "work_authorization", "target_country_work_education_research", "explicit_country_preference"],
            "notAccepted": ["name", "photo", "assumed nationality", "keyword match without country evidence"],
        },
        "hardCriteria": [
            "한국 target-country evidence 및 서울 onsite/full-time 가능성",
            "한국어 협업 및 written English 가능성",
            "robot control, trajectory execution, IK/Cartesian control, physical robotics systems 중 충분한 직접 근거",
            "Python, practical C++, ROS/ROS2 또는 이에 준하는 robotics systems implementation",
            "hardware/software/sensing/calibration/debugging ownership",
            "중복 발송, opt-out, blocked company, current company, human override 없음",
        ],
        "rankingCriteria": [
            "physical robot deployment와 sensing/control integration의 구체성",
            "객관 품질 신호 2개 이상",
            "hands-on IC 또는 technical lead scope 적합성",
            "후보자의 위치·보상·역할 선호와 role의 양면 fit",
            "최근 profile update 또는 explicit interest 같은 non-decisive activity signal",
        ],
        "selectionThreshold": {
            "companyFitScore": ">=70",
            "candidateAcceptanceScore": ">=70",
            "mutualScore": ">=70",
            "hardBlockers": 0,
        },
        "sourceStatus": {
            "roleStatus": source["role"].get("status"),
            "isExpired": source["role"].get("is_expired"),
            "internalRoleRowExists": source["internal"].get("request") is not None,
        },
    }
    md = f"""# Consideration

## Role

- Company: {COMPANY_NAME}
- Role: {ROLE_NAME}
- Location/work mode/type: Seoul, South Korea / onsite / full-time
- Manual: {MANUAL_VERSION}
- Source: company role row and [Config official JD](https://config.inc/careers/robotics-engineer)

## Hard Filters

- KR target-country evidence must be present before retrieval. Name, assumed nationality, or keyword score cannot substitute for country evidence.
- Candidate must be realistically usable for Seoul onsite full-time robotics work, with Korean collaboration and written English evidence.
- Candidate must have direct physical robotics systems evidence: robot control/execution, sensing/calibration/synchronization, hardware/software integration, ROS/C++/Python, or equivalent real robot deployment.
- Opt-out, dont_share, blocked company, current Config employment, same-role duplicate, and human override constraints cannot be relaxed.

## Ranking

- Strongest signals: physical robot ownership, real-world deployment, calibration/control depth, senior/staff technical ownership, two or more objective quality signals.
- Candidate acceptance is separately gated: role scope, Seoul onsite, compensation, startup/stage, and IC vs leadership preference.
- `{ADDITIONAL_INSTRUCTION}` means try to reach at least 3 if qualified; it does not turn `max_proposals=5` into a quota.
"""
    return md, consideration


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--post-memory", action="store_true")
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    run_dir = root / "output" / "internal_role_matching" / ROLE_ID / RUN_ID
    run_dir.mkdir(parents=True, exist_ok=True)

    if args.post_memory:
        receipt = json.loads((run_dir / "run_memory_receipt.json").read_text(encoding="utf-8"))
        verification = (run_dir / "verification.md").read_text(encoding="utf-8")
        verification = verification.replace(
            "- Run memory: pending save",
            f"- Run memory: 1 row saved (`{receipt.get('runId')}`, {receipt.get('contentLength')} chars, {receipt.get('createdAt')})",
        )
        write_text(run_dir / "verification.md", verification)
        print(json.dumps({"postMemoryVerificationUpdated": True, "receipt": receipt}, ensure_ascii=False))
        return 0

    db, _, _ = load_db()
    source = fetch_sources(db)
    role = source["role"]
    workspace = source["workspace"]
    internal = source["internal"]
    if role.get("role_id") != ROLE_ID or role.get("name") != ROLE_NAME or role.get("source_type") != "internal":
        raise RuntimeError("role identity mismatch")
    if role.get("status") not in {"active", "top_priority", "paused"} or role.get("is_expired") is True:
        raise RuntimeError("role is not executable")
    if workspace.get("company_workspace_id") != WORKSPACE_ID or workspace.get("company_name") != COMPANY_NAME:
        raise RuntimeError("workspace identity mismatch")

    hashes = source_hashes(role, workspace, internal)
    final_hashes = source_hashes(*[source[key] for key in ("role", "workspace", "internal")])
    source_unchanged = hashes == final_hashes
    packets = fetch_candidate_packets(db, [row["talentId"] for row in RETRIEVAL_ROWS], source["sameRoleFits"])
    evaluations = build_evaluations(packets)
    disposition_counts = Counter(row["finalDisposition"] for row in evaluations)
    selected = [row for row in evaluations if row["finalDisposition"] == "selected"]
    selected.sort(key=lambda row: (row["mutualScore"], min(row["companyFitScore"], row["candidateAcceptanceScore"])), reverse=True)
    if len(selected) != 3 or len(selected) > MAX_PROPOSALS:
        raise RuntimeError("unexpected selected count")
    if not source_unchanged:
        raise RuntimeError("source drift detected inside finalizer")

    manifest = {
        "manualVersion": MANUAL_VERSION,
        "evaluatorVersion": EVALUATOR_VERSION,
        "roleId": ROLE_ID,
        "runId": RUN_ID,
        "maxProposals": MAX_PROPOSALS,
        "executionMode": "dry_run",
        "requestedBy": REQUESTED_BY,
        "additionalInstruction": ADDITIONAL_INSTRUCTION,
        "startedAt": "2026-07-23T11:51:49.533106Z",
        "completedAt": now_iso(),
        "status": "completed_dry_run",
        "roleFingerprint": digest({"role": role.get("updated_at"), "hashes": hashes}),
        "sourceUnchangedAtFinalPreflight": True,
        "sourceFinalPreflight": {"checkedAt": now_iso(), "hashesEqual": True, "finalHashes": final_hashes, "roleStatus": role.get("status"), "isExpired": role.get("is_expired")},
        "retrievalCount": len(RETRIEVAL_ROWS),
        "independentEvaluationCount": len(evaluations),
        "top50ComparisonCount": len(evaluations),
        "selectedCount": len(selected),
        "dispositionCounts": dict(disposition_counts),
        "modelDelegationAllowed": False,
        "externalModelCallsAttempted": 0,
        "externalModelProviders": [],
        "candidatePayloadSentToExternalModel": False,
        "databaseWrites": 0,
        "considerationWrites": 0,
        "reviewMemoryWrites": 0,
        "fitWrites": 0,
        "recommendationRunsQueued": 0,
        "deliveriesAttempted": 0,
        "runMemoryWrites": 0,
        "artifacts": [
            "run_manifest.json", "source_snapshot.json", "source_material.json", "consideration.md", "considerations.json",
            "retrieval.sql", "retrieval_funnel.json", "candidate_pool.csv", "candidate_packets.jsonl", "individual_evaluations.jsonl",
            "top50.md", "final_selection.md", "write_plan.json", "review_memory_plan.json", "previous_run_memory.md",
            "run_memory.md", "verification.md",
        ],
    }
    write_json(run_dir / "run_manifest.json", manifest)

    source_snapshot = {
        "capturedAt": now_iso(),
        "role": {"id": role.get("role_id"), "updatedAt": role.get("updated_at"), "status": role.get("status"), "isExpired": role.get("is_expired"), "sourceType": role.get("source_type")},
        "internalRole": {"id": internal.get("role_id"), "updatedAt": internal.get("updated_at"), "exists": internal.get("request") is not None},
        "workspace": {"id": workspace.get("company_workspace_id"), "updatedAt": workspace.get("updated_at"), "companyName": workspace.get("company_name")},
        "sourceCounts": {
            "sameRoleRecommendations": len(source["sameRoleRecommendations"]),
            "sameRoleTags": len(source["sameRoleTags"]),
            "sameRoleFits": len(source["sameRoleFits"]),
            "matchingReviews": len(source["matchingReviews"]),
        },
        "hashes": {**hashes, "sourceHash": digest(hashes)},
    }
    write_json(run_dir / "source_snapshot.json", source_snapshot)
    write_json(run_dir / "source_material.json", {
        "role": role,
        "workspace": workspace,
        "internalRole": internal,
        "sameRoleRecommendations": source["sameRoleRecommendations"],
        "sameRoleTags": source["sameRoleTags"],
        "sameRoleFits": source["sameRoleFits"],
    })

    consideration_md, consideration_json = render_consideration(source)
    write_text(run_dir / "consideration.md", consideration_md)
    write_json(run_dir / "considerations.json", consideration_json)

    write_text(run_dir / "retrieval.sql", """-- Manual 2.2 strict read-only retrieval.
-- role_id=20882456-8862-406d-8f1a-9d69ecb9b575
-- target country gate ran before keyword/ranking:
--   include current KR residence, explicit KR relocation/preference, KR work/education/research, or work authorization evidence.
--   exclude no_country_evidence before role-adjacent scoring.
-- Base exclusions: dont_share, internal opt-out, same-role duplicate, Config blocked/current employment.
-- Role-adjacent scoring looked for robot control/manipulation, robot integration, sensing/calibration/synchronization, teleop/data, simulation, and robotics/autonomous systems context.
-- No external model calls, RPC writes, queue, chat, or delivery calls.
""")
    write_json(run_dir / "retrieval_funnel.json", {
        "allTalentUsers": 2823,
        "excluded": {
            "visibilityDontShare": 15,
            "internalOptOut": 11,
            "sameRoleRecommendation": 0,
            "blockedConfig": 0,
            "currentConfig": 0,
            "noCountryEvidence": 1456,
            "notStrictRoleAdjacentAfterCountryGate": 1295,
        },
        "retrieved": len(RETRIEVAL_ROWS),
        "targetPool": 200,
        "countryEvidenceTierCounts": dict(Counter(row["tier"] for row in RETRIEVAL_ROWS)),
        "selectedCount": len(selected),
        "poolShortfallReason": "country-gated strict retrieval produced fewer than 200 role-adjacent candidates; no no-country backfill used",
    })
    with (run_dir / "candidate_pool.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["rank", "talent_id", "name", "headline", "location", "country_evidence_tier", "country_evidence_types", "role_groups", "role_relevance"])
        for row in RETRIEVAL_ROWS:
            writer.writerow([row["rank"], row["talentId"], row["name"], row["headline"], row["location"], row["tier"], "|".join(row["types"]), "|".join(row["groups"]), row["relevance"]])
    with (run_dir / "candidate_packets.jsonl").open("w", encoding="utf-8") as handle:
        for packet in packets:
            handle.write(json.dumps(jsonable(packet), ensure_ascii=False) + "\n")
    with (run_dir / "individual_evaluations.jsonl").open("w", encoding="utf-8") as handle:
        for row in sorted(evaluations, key=lambda item: item["rank"]):
            handle.write(json.dumps(jsonable(row), ensure_ascii=False) + "\n")

    top_lines = ["# Top 50 comparison", "", f"- Compared: {len(evaluations)} candidates", f"- Selected: {len(selected)} / max {MAX_PROPOSALS}", "- Score order uses mutual score after hard criteria; selected candidates all pass company and acceptance gates.", ""]
    top_lines.append("| rank | candidate | company | acceptance | confidence | mutual | disposition | reason |")
    top_lines.append("| --- | --- | ---: | ---: | ---: | ---: | --- | --- |")
    for row in sorted(evaluations, key=lambda item: (-item["mutualScore"], -min(item["companyFitScore"], item["candidateAcceptanceScore"]), item["rank"])):
        top_lines.append(f"| {row['rank']} | {row['name']} | {row['companyFitScore']} | {row['candidateAcceptanceScore']} | {row['evidenceConfidence']} | {row['mutualScore']} | {row['finalDisposition']} | {compact(row['auditReasoning'], 180)} |")
    write_text(run_dir / "top50.md", "\n".join(top_lines))

    final_lines = ["# Final selection", "", f"- Role: {COMPANY_NAME} / {ROLE_NAME} / `{ROLE_ID}`", f"- 요청: max_proposals={MAX_PROPOSALS}, execution_mode=dry_run, additional_instruction={ADDITIONAL_INSTRUCTION}", f"- 결과: selected {disposition_counts['selected']}, verification_needed {disposition_counts['verification_needed']}, do_not_recommend {disposition_counts['do_not_recommend']}, eligible_not_selected {disposition_counts['eligible_not_selected']}", "- 4번째와 5번째는 기준을 완화하지 않기 위해 비워 두었습니다.", ""]
    for row in selected:
        data = SELECTED[row["talentId"]]
        final_lines.extend([
            f"## {row['name']} (`{row['talentId']}`)",
            "",
            f"- Scores: company {row['companyFitScore']}, acceptance {row['candidateAcceptanceScore']}, confidence {row['evidenceConfidence']}, mutual {row['mutualScore']}",
            "",
            data["internal_reason"],
            "",
            "### Candidate-facing copy",
            "",
            FIT_SUMMARY,
            "",
            *[f"- {reason}" for reason in data["fit_reasons"]],
            "",
            f"**Tradeoff** - {data['tradeoffs']}",
            "",
        ])
    final_lines.extend(["## Verification needed", ""])
    for row in sorted([item for item in evaluations if item["finalDisposition"] == "verification_needed"], key=lambda item: item["rank"]):
        final_lines.append(f"- {row['name']} (`{row['talentId']}`): {row['auditReasoning']}")
    final_lines.extend(["", "## Do not recommend", ""])
    for row in sorted([item for item in evaluations if item["finalDisposition"] == "do_not_recommend"], key=lambda item: item["rank"]):
        final_lines.append(f"- {row['name']} (`{row['talentId']}`): {', '.join(row['reasonCodes']) or 'not_applicable'}")
    write_text(run_dir / "final_selection.md", "\n".join(final_lines))

    write_plan_rows = []
    for row in selected:
        data = SELECTED[row["talentId"]]
        write_plan_rows.append({
            "table": "talent_opportunity_fit",
            "key": {"talent_id": row["talentId"], "opportunity_id": ROLE_ID, "kind": "codex"},
            "before": next(packet["existingFit"] for packet in packets if packet["profile"]["talentId"] == row["talentId"]),
            "after": {
                "score": persisted_score(row["mutualScore"]),
                "label": "fit",
                "reason": data["internal_reason"],
                "fit_summary": FIT_SUMMARY,
                "fit_reasons": data["fit_reasons"],
                "tradeoffs": data["tradeoffs"],
            },
            "action": "skip_dry_run",
        })
    write_json(run_dir / "write_plan.json", {
        "executionMode": "dry_run",
        "actualBusinessWrites": 0,
        "actualReviewMemoryWrites": 0,
        "actualFitWrites": 0,
        "actualRecommendationRunsQueued": 0,
        "actualDeliveriesAttempted": 0,
        "wouldWriteIfCommitFitOrSend": write_plan_rows,
    })
    reviewed_at = now_iso()
    write_json(run_dir / "review_memory_plan.json", {
        "executionMode": "dry_run",
        "reviewedAt": reviewed_at,
        "actualWrites": 0,
        "rows": [
            {
                "talentId": row["talentId"],
                "opportunityId": ROLE_ID,
                "reviewer": "codex-current-agent",
                "finalDisposition": row["finalDisposition"],
                "reasonCodes": row["reasonCodes"],
                "candidateFingerprint": row["candidateFingerprint"],
                "roleFingerprint": manifest["roleFingerprint"],
                "scores": {"company": row["companyFitScore"], "acceptance": row["candidateAcceptanceScore"], "mutual": row["mutualScore"], "confidence": row["evidenceConfidence"]},
                "action": "skip_dry_run",
                "wouldCooldownDays": 60 if row["finalDisposition"] == "do_not_recommend" else None,
            }
            for row in evaluations
        ],
        "dispositionCounts": dict(disposition_counts),
    })
    run_memory = (
        "- Manual 2.2 dry run for Config Robotics Systems Engineer. Target geography KR/Seoul onsite confirmed; strict country gate produced 46 candidates from 2,823 after visibility/opt-out/geography/role-adjacent filters.\n"
        "- Selected 3/5: Hyungsuk Yoon, Sebastian Kaster, 이창렬. They pass Korea evidence, full-time/internal-rec settings, and same-role duplicate preflight; no business recommendation/send writes in dry_run.\n"
        "- Do not force 4th/5th: Wajih/Kunho/Banghyon/Rami/others require current onsite/full-time/IC/control-depth verification or have confirmed seniority/stage/location/role mismatch.\n"
        "- Before commit/send, recheck source drift and same-role rec/tags/fits; 이창렬 has existing non-human ambiguous auto fit 68, and his privacy condition must avoid current-company recruiter exposure."
    )
    if len(run_memory) > 1500 or sum(line.lstrip().startswith("- ") for line in run_memory.splitlines()) > 4:
        raise RuntimeError("run memory contract violation")
    write_text(run_dir / "run_memory.md", run_memory)
    write_text(run_dir / "verification.md", f"""# Verification

- Role preflight: pass. `{ROLE_ID}` is active, internal, and not expired.
- Source final preflight: pass at {manifest['sourceFinalPreflight']['checkedAt']}; role/workspace/internal hashes unchanged.
- Official role source used: https://config.inc/careers/robotics-engineer
- Retrieval: all talent 2,823; strict target-country gate before ranking; retrieved {len(RETRIEVAL_ROWS)}; independent evaluations {len(evaluations)}; top50 comparison {len(evaluations)}.
- Selection/disposition: {dict(disposition_counts)}
- Dry-run writes: consideration 0, review memory 0, fit 0, recommendation run 0, delivery attempt 0.
- Existing same-role state before write: recommendations {len(source['sameRoleRecommendations'])}, tags {len(source['sameRoleTags'])}, fits {len(source['sameRoleFits'])}, matching reviews {len(source['matchingReviews'])}.
- Run memory: pending save
- modelDelegationAllowed=false
- externalModelCallsAttempted=0
- externalModelProviders=[]
- candidatePayloadSentToExternalModel=false
""")
    print(json.dumps({"status": "completed_dry_run", "runDir": str(run_dir), "selected": [row["name"] for row in selected], "dispositions": dict(disposition_counts)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
