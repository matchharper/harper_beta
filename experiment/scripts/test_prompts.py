import psycopg2
import time
import os

# Test cases: User prompts to simulate
TEST_CASES = [
    {"name": "Specific Company + Role", "prompt": "카카오에서 PM으로 일한 사람 찾고 싶어"},
    {"name": "Location + Education + Tech Stack", "prompt": "서울에 살고 서울대 출신인 파이썬 개발자"},
    {"name": "Niche/Complex intent", "prompt": "블록체인 스타트업 창업 경험이 있거나 초기 멤버였던 시니어 엔지니어"},
    {"name": "Full-text heavy query", "prompt": "자율주행 라이더 센서 관련 논문을 쓴 리서치 엔지니어"},
    {"name": "Specific Company + Role + Exp", "prompt": "카카오에서 PM으로 5년 이상 일한 사람"},
    {"name": "Location + Education + Tech Stack + Exp", "prompt": "서울에 살고 서울대 출신인 3년차 이상의 파이썬 개발자"},
    {"name": "Niche/Complex intent + Exp", "prompt": "블록체인 분야에서 10년 이상 경력이 있는 시니어 엔지니어 혹은 창업가"},
    {"name": "Full-text heavy query + Exp", "prompt": "자율주행 분야에서 5년 이상 연구 경험이 있는 리서치 엔지니어"}
]

def run_test(query_name, sql):
    conn = psycopg2.connect(
        host="localhost",
        database="harper",
        user="postgres",
        password="postgres",
        port="5432"
    )
    cur = conn.cursor()
    explain_query = f"EXPLAIN (ANALYZE, BUFFERS) {sql}"
    print(f"--- Running Test: {query_name} ---")
    try:
        cur.execute(explain_query)
        plan = cur.fetchall()
        has_seq_scan = False
        for line in plan:
            print(line[0])
            if "Seq Scan" in line[0] and ("candid" in line[0] or "experience_user" in line[0] or "company_db" in line[0]):
                has_seq_scan = True
        if has_seq_scan:
            print("\n[WARNING] Sequential scan detected on core tables.")
        else:
            print("\n[SUCCESS] Index scan or efficient plan detected.")
    except Exception as e:
        print(f"Error executing SQL: {e}")
    finally:
        cur.close()
        conn.close()
    print("-" * 50)

if __name__ == "__main__":
    # 1. Kakao PM
    sql1 = """
    SELECT T1.id FROM candid T1
    WHERE EXISTS (
        SELECT 1 FROM experience_user ex JOIN company_db c ON c.id = ex.company_id
        WHERE ex.candid_id = T1.id AND c.name ILIKE ANY (ARRAY['%kakao%', '%카카오%']) 
          AND ex.role ILIKE ANY (ARRAY['%product manager%', '%pm%', '%product owner%'])
    )
    AND T1.fts @@ to_tsquery('english', 'kakao <-> (pm | product <-> manager)')
    ORDER BY ts_rank(T1.fts, to_tsquery('english', 'kakao <-> (pm | product <-> manager)')) DESC;
    """

    # 2. Seoul + SNU + Python
    sql2 = """
    SELECT T1.id FROM candid T1
    WHERE T1.location ILIKE ANY (ARRAY['%seoul%', '%서울%', '%korea%'])
      AND EXISTS (SELECT 1 FROM edu_user eu WHERE eu.candid_id = T1.id AND eu.school ILIKE ANY (ARRAY['%seoul national%', '%snu%', '%서울대%']))
      AND EXISTS (SELECT 1 FROM experience_user ex WHERE ex.candid_id = T1.id AND ex.role ILIKE ANY (ARRAY['%python%', '%developer%']))
      AND T1.fts @@ to_tsquery('english', 'seoul & python & (developer | engineer)')
    ORDER BY ts_rank(T1.fts, to_tsquery('english', 'seoul & python & (developer | engineer)')) DESC;
    """

    # 3. Blockchain + Senior
    sql3 = """
    SELECT T1.id FROM candid T1
    WHERE (
      EXISTS (SELECT 1 FROM experience_user ex WHERE ex.candid_id = T1.id AND ex.role ILIKE ANY (ARRAY['%founder%', '%cto%', '%ceo%']))
      OR EXISTS (SELECT 1 FROM experience_user ex JOIN company_db c ON c.id = ex.company_id WHERE ex.candid_id = T1.id AND c.specialities ILIKE ANY (ARRAY['%blockchain%', '%web3%']))
    )
    AND T1.fts @@ to_tsquery('english', 'blockchain & (founder | engineer | cto)')
    ORDER BY ts_rank(T1.fts, to_tsquery('english', 'blockchain & (founder | engineer | cto)')) DESC;
    """

    # 4. Lidar + Research
    sql4 = """
    SELECT T1.id FROM candid T1
    WHERE EXISTS (SELECT 1 FROM experience_user ex WHERE ex.candid_id = T1.id AND ex.role ILIKE ANY (ARRAY['%research%', '%scientist%']))
      AND EXISTS (SELECT 1 FROM publications p WHERE p.candid_id = T1.id AND p.title ILIKE ANY (ARRAY['%lidar%', '%sensor%']))
      AND T1.fts @@ to_tsquery('english', 'lidar <-> sensor & research <-> engineer')
    ORDER BY ts_rank(T1.fts, to_tsquery('english', 'lidar <-> sensor & research <-> engineer')) DESC;
    """

    # 5. Kakao PM + 5yrs
    sql5 = """
    SELECT T1.id FROM candid T1
    WHERE T1.total_exp_months >= 60
      AND EXISTS (
        SELECT 1 FROM experience_user ex JOIN company_db c ON c.id = ex.company_id
        WHERE ex.candid_id = T1.id AND c.name ILIKE ANY (ARRAY['%kakao%', '%카카오%']) 
          AND ex.role ILIKE ANY (ARRAY['%product manager%', '%pm%'])
    )
    AND T1.fts @@ to_tsquery('english', 'kakao <-> (pm | product <-> manager)')
    ORDER BY ts_rank(T1.fts, to_tsquery('english', 'kakao <-> (pm | product <-> manager)')) DESC;
    """

    # 6. Seoul + SNU + Python + 3yrs
    sql6 = """
    SELECT T1.id FROM candid T1
    WHERE T1.total_exp_months >= 36
      AND T1.location ILIKE ANY (ARRAY['%seoul%', '%서울%'])
      AND EXISTS (SELECT 1 FROM edu_user eu WHERE eu.candid_id = T1.id AND eu.school ILIKE ANY (ARRAY['%seoul national%', '%snu%']))
      AND EXISTS (SELECT 1 FROM experience_user ex WHERE ex.candid_id = T1.id AND ex.role ILIKE ANY (ARRAY['%python%', '%developer%']))
      AND T1.fts @@ to_tsquery('english', 'seoul & python & (developer | engineer)')
    ORDER BY ts_rank(T1.fts, to_tsquery('english', 'seoul & python & (developer | engineer)')) DESC;
    """

    # 7. Blockchain + 10yrs
    sql7 = """
    SELECT T1.id FROM candid T1
    WHERE T1.total_exp_months >= 120
      AND T1.fts @@ to_tsquery('english', 'blockchain & (founder | engineer | cto)')
    ORDER BY ts_rank(T1.fts, to_tsquery('english', 'blockchain & (founder | engineer | cto)')) DESC;
    """

    # 8. Autonomous + 5yrs
    sql8 = """
    SELECT T1.id FROM candid T1
    WHERE T1.total_exp_months >= 60
      AND T1.fts @@ to_tsquery('english', 'autonomous <-> driving & research')
    ORDER BY ts_rank(T1.fts, to_tsquery('english', 'autonomous <-> driving & research')) DESC;
    """

    run_test("Specific Company + Role", sql1)
    run_test("Location + Education + Tech Stack", sql2)
    run_test("Niche/Complex intent", sql3)
    run_test("Full-text heavy query", sql4)
    run_test("Specific Company + Role + Exp", sql5)
    run_test("Location + Education + Tech Stack + Exp", sql6)
    run_test("Niche/Complex intent + Exp", sql7)
    run_test("Full-text heavy query + Exp", sql8)